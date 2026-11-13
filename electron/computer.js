// 🖥 Bbokari controls your Mac: searches (YouTube, Google, images, maps), wallpaper, cleaning up screenshots, volume,
// brightness, dark mode, screenshots, battery, storage, lock, sleep the screen, quit apps, new folders, the last
// download, the Trash, saying things out loud…
//
// parseComputer() understands lots of ways to say each one (English and Spanish); anything it misses can go to
// classifyComputer(), where the local AI picks one of the same actions. runComputer() does it. Actions that delete
// things (screenshots → Trash, emptying the Trash) are only done after you say yes (`confirm` in the result).
// No Electron imports (helpers are passed in), so the parsing can be tested with plain Node.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { OLLAMA_URL } from './ai.js';

const LEAD = String.raw`^(?:(?:hey|hi|ok|okay|oye)\s+\w+[,!.]?\s*)?(?:can you\s+|could you\s+|would you\s+|please\s+|por favor\s+|puedes\s+|me puedes\s+)?`;
const END = String.raw`(?:\s+(?:please|for me|por favor|now|ahora))?[.!?]*$`;
const re = (body) => new RegExp(`${LEAD}${body}${END}`, 'i');
const cleanQ = (q) => String(q ?? '').replace(/^(?:a|an|the|some|un|una|el|la|los|las)\s+/i, '').replace(/\s+/g, ' ').trim();

/** "search youtube for how caterpillars become butterflies" → { type: 'youtube', q }, or null. */
export function parseComputer(text) {
  const t = String(text ?? '').trim();
  if (!t || t.length > 300) return null;
  let m;
  // --- searches ---
  // "go to youtube and search X", "open youtube and type X", "get on youtube and look up X", "ve a youtube y busca X"
  if ((m = t.match(re(String.raw`(?:open|go\s+(?:to|on|onto)|get\s+on|hop\s+on|pull\s+up|ve\s+a|entra\s+a|abre)\s+(?:the\s+)?(youtube|google|google images|google maps|maps)\s+(?:and|then|y)\s+(?:search|look\s+up|find|type|play|put|watch|busca|pon)(?:\s+(?:me|for|up))*\s+(.+)`)))) {
    const site = m[1].toLowerCase();
    const q = cleanQ(m[2]);
    if (q) return { type: site === 'youtube' ? 'youtube' : /images/.test(site) ? 'images' : /maps/.test(site) ? 'maps' : 'google', q };
  }
  // "search hootie frutti on youtube", "look up X in youtube", "find X on youtube", "put X on youtube"
  if ((m = t.match(re(String.raw`(?:search(?:\s+for)?|look\s+up|find|put|watch|play|busca|pon)\s+(?:me\s+)?(.+?)\s+(?:on|in|en)\s+youtube`)))) {
    const q = cleanQ(m[1]);
    if (q) return { type: 'youtube', q };
  }
  if ((m = t.match(re(String.raw`(?:open\s+youtube\s+and\s+(?:search|look up|find|play)(?:\s+(?:me|for))?|(?:search|look up|find)(?:\s+me)?\s+(?:on\s+|in\s+)?youtube\s+(?:for\s+)?|youtube\s+search\s+|play\s+(?:me\s+)?(?:a\s+video\s+(?:about|of|on)\s+)?(.+?)\s+on\s+youtube$|busca(?:me)?\s+en\s+youtube\s+|pon(?:me)?\s+en\s+youtube\s+)(.*)`)))) {
    const q = cleanQ(m[1] ?? m[2]);
    if (q) return { type: 'youtube', q };
  }
  if ((m = t.match(re(String.raw`(?:find|show|search|look up)\s+(?:me\s+)?(?:a\s+)?(?:youtube\s+)?videos?\s+(?:about|of|on|for|explaining|that explains|how)\s+(.+)`)))) return { type: 'youtube', q: cleanQ(m[1]) };
  if ((m = t.match(re(String.raw`(?:find|show|search(?:\s+for)?|look up)\s+(?:me\s+)?(?:pictures?|photos?|images?)\s+(?:of|about)\s+(.+)|busca(?:me)?\s+(?:fotos|im[aá]genes)\s+de\s+(.+)`)))) return { type: 'images', q: cleanQ(m[1] ?? m[2]) };
  if ((m = t.match(re(String.raw`(?:directions|how do i get)\s+to\s+(.+)|(?:show|find)\s+(.+?)\s+on\s+(?:the\s+)?map|(?:open\s+)?(?:google\s+)?maps?\s+(?:for|of)\s+(.+)|c[oó]mo llego a\s+(.+)`)))) return { type: 'maps', q: cleanQ(m[1] ?? m[2] ?? m[3] ?? m[4]) };
  if ((m = t.match(re(String.raw`(?:google|search\s+(?:google|the web|online|the internet)\s+for|search\s+for|look up|busca(?:me)?(?:\s+en\s+google)?)\s+(.+?)(?:\s+(?:on|in)\s+google)?`)))) {
    const q = cleanQ(m[1]);
    if (q && !/\b(?:my|mis?)\s+(?:files?|archivos?|documents?)\b/i.test(q)) return { type: 'google', q };
  }
  // --- wallpaper ---
  if ((m = t.match(re(String.raw`(?:change|set|make|put|switch)\s+(?:my\s+|the\s+)?(?:computer\s+|desktop\s+|mac\s+)?(?:wallpaper|background|desktop(?:\s+picture)?)\s+(?:to|as|into|with|of)\s+(?:a\s+|an\s+|some\s+)?(?:picture\s+of\s+|photo\s+of\s+)?(.+)|(?:cambia|pon)(?:me)?\s+(?:el\s+|mi\s+)?(?:fondo(?:\s+de\s+pantalla)?|wallpaper)\s+(?:a|de|con)\s+(.+)`)))) {
    return { type: 'wallpaper', q: cleanQ(m[1] ?? m[2]) };
  }
  // --- screenshots → Trash ---
  if (/\b(?:delete|remove|trash|clean(?: up)?|clear|get rid of|borra|elimina|quita)\b/i.test(t) && /\b(?:screenshots?|screen shots?|capturas?(?: de pantalla)?|screen recordings?)\b/i.test(t)) {
    const where = /\bdownloads?|descargas\b/i.test(t) ? 'downloads' : /\b(?:everywhere|all over|whole|todo el)\b/i.test(t) ? 'all' : 'desktop';
    return { type: 'trashScreenshots', where, recordings: /recordings?|grabaci/i.test(t), confirm: true };
  }
  if (re(String.raw`(?:empty|clear|clean)\s+(?:the\s+|my\s+)?(?:trash|bin|recycle bin)|vac[ií]a\s+(?:la\s+)?papelera`).test(t)) return { type: 'emptyTrash', confirm: true };
  // --- sound & screen ---
  if (re(String.raw`(?:mute|silence|silencia)(?:\s+(?:my\s+)?(?:computer|mac|sound|volume|audio|el sonido))?`).test(t)) return { type: 'volume', mute: true };
  if (re(String.raw`(?:unmute|sound on|turn (?:the )?sound (?:back )?on|quita el silencio)`).test(t)) return { type: 'volume', mute: false };
  if ((m = t.match(re(String.raw`(?:set|put|turn|change)?\s*(?:the\s+)?(?:volume|sound)\s+(?:to\s+|at\s+)?(\d{1,3})\s*%?|(?:pon|sube|baja)\s+el\s+volumen\s+(?:a|al)\s+(\d{1,3})`)))) return { type: 'volume', value: Math.min(100, Number(m[1] ?? m[2])) };
  if (re(String.raw`(?:turn\s+(?:it|the volume|the sound)\s+up|volume\s+up|louder|increase\s+(?:the\s+)?volume|raise\s+(?:the\s+)?volume|sube\s+(?:el\s+)?volumen|m[aá]s\s+(?:alto|volumen))`).test(t) && !/spotify|song|music/i.test(t)) return { type: 'volume', delta: 15 };
  if (re(String.raw`(?:turn\s+(?:it|the volume|the sound)\s+down|volume\s+down|quieter|softer|lower\s+(?:the\s+)?volume|decrease\s+(?:the\s+)?volume|baja\s+(?:el\s+)?volumen|m[aá]s\s+bajo)`).test(t) && !/spotify|song|music/i.test(t)) return { type: 'volume', delta: -15 };
  if (re(String.raw`(?:(?:turn|make)\s+(?:the\s+)?(?:screen\s+)?brighter|brightness\s+up|increase\s+(?:the\s+)?brightness|sube\s+(?:el\s+)?brillo|m[aá]s\s+brillo)`).test(t)) return { type: 'brightness', delta: 2 };
  if (re(String.raw`(?:(?:turn|make)\s+(?:the\s+)?(?:screen\s+)?(?:darker|dimmer)|brightness\s+down|dim\s+(?:the\s+)?screen|decrease\s+(?:the\s+)?brightness|baja\s+(?:el\s+)?brillo|menos\s+brillo)`).test(t)) return { type: 'brightness', delta: -2 };
  if (re(String.raw`(?:turn\s+on\s+|switch\s+to\s+|enable\s+|activate\s+|pon\s+(?:el\s+)?)?(?:dark\s+mode|modo\s+oscuro)(?:\s+on)?`).test(t)) return { type: 'darkMode', on: true };
  if (re(String.raw`(?:turn\s+(?:off|on)\s+|switch\s+to\s+|disable\s+|pon\s+(?:el\s+)?)?(?:light\s+mode|modo\s+claro)|(?:turn\s+off|disable)\s+dark\s+mode|dark\s+mode\s+off`).test(t)) return { type: 'darkMode', on: false };
  if (re(String.raw`(?:toggle|switch)\s+dark\s+mode`).test(t)) return { type: 'darkMode', on: null };
  if (re(String.raw`(?:take|make|grab)\s+(?:a\s+)?(?:screenshot|screen shot|picture of (?:my|the) screen)(?:\s+of\s+(?:my|the)\s+(?:whole\s+)?screen)?|screenshot|haz\s+(?:una\s+)?captura(?:\s+de\s+pantalla)?`).test(t)) {
    return { type: 'screenshot', select: /\b(?:part|area|section|select|window|parte|zona)\b/i.test(t) };
  }
  // --- info ---
  if (/^(?:(?:hey|ok)\s+\w+[,!]?\s*)?(?:how much\s+)?(?:battery|bater[ií]a)(?:\s+(?:do i have|left|life|is left|percentage|level|tengo|queda))?\??$|how(?:'s| is)\s+(?:my\s+)?battery|cu[aá]nta\s+bater[ií]a/i.test(t)) return { type: 'battery' };
  if (/\b(?:how much|cu[aá]nto)\s+(?:storage|space|disk|espacio|almacenamiento)\b|\b(?:storage|disk space)\s+(?:left|free)\b/i.test(t)) return { type: 'storage' };
  if (re(String.raw`(?:what\s+apps?\s+(?:are|is)\s+open|which\s+apps\s+are\s+running|qu[eé]\s+apps\s+(?:est[aá]n|tengo)\s+abiertas)`).test(t)) return { type: 'openApps' };
  // --- the Mac itself ---
  if (re(String.raw`(?:lock|bloquea)\s+(?:my\s+|the\s+|mi\s+|la\s+)?(?:computer|mac|screen|laptop|macbook|pantalla|compu(?:tadora)?)`).test(t)) return { type: 'lock' };
  if (re(String.raw`(?:turn\s+off|sleep|put\s+to\s+sleep|apaga)\s+(?:the\s+|my\s+|la\s+)?(?:screen|display|monitor|pantalla)|(?:put\s+)?(?:my\s+|the\s+)?(?:screen|display)\s+to\s+sleep`).test(t)) return { type: 'displaySleep' };
  if (re(String.raw`(?:shut\s*down|restart|reboot|turn\s+off)\s+(?:my\s+|the\s+)?(?:computer|mac|macbook|laptop)|apaga\s+(?:la\s+|mi\s+)?(?:compu(?:tadora)?|mac)`).test(t)) return { type: 'shutdown' };
  if ((m = t.match(re(String.raw`(?:close|quit|exit|kill|cierra|sal\s+de)\s+(?:the\s+|my\s+|el\s+|la\s+)?(?:app\s+)?([A-Za-z0-9][\w .&+-]{0,30}?)(?:\s+app)?`))) && !/\b(?:tabs?|window|pesta[ñn]as?|the game|game|notes|focus|timer|reminders?|chat)\b/i.test(m[1])) {
    return { type: 'quitApp', app: m[1].trim() };
  }
  if ((m = t.match(re(String.raw`(?:make|create|add|crea)\s+(?:me\s+)?(?:a\s+)?(?:new\s+)?(?:folder|carpeta)(?:\s+(?:called|named|llamada))?\s+["“]?(.+?)["”]?(?:\s+(?:on|in|en)\s+(?:my\s+|the\s+|el\s+|mis\s+)?(desktop|escritorio|documents|documentos|downloads|descargas))?`)))) {
    const where = /documents|documentos/i.test(m[2] ?? '') ? 'Documents' : /downloads|descargas/i.test(m[2] ?? '') ? 'Downloads' : 'Desktop';
    return { type: 'newFolder', name: m[1].replace(/\s+(?:on|in)\s+(?:my\s+)?(?:desktop|documents|downloads)$/i, '').trim(), where };
  }
  if (re(String.raw`(?:open|show)\s+(?:me\s+)?(?:my\s+|the\s+)?(?:last|latest|newest|most recent)\s+(?:download|downloaded file)|abre\s+(?:lo\s+)?(?:[uú]ltimo\s+que\s+descargu[eé]|la\s+[uú]ltima\s+descarga)`).test(t)) return { type: 'lastDownload' };
  if (re(String.raw`(?:open|show)\s+(?:me\s+)?(?:my\s+|the\s+)?(?:last|latest|newest)\s+screenshot`).test(t)) return { type: 'lastScreenshot' };
  if ((m = t.match(re(String.raw`(?:say|read|di|lee)\s+(?:out\s+loud\s+|aloud\s+|en\s+voz\s+alta\s+)?["“](.+)["”]|say\s+(.+?)\s+out\s+loud`)))) return { type: 'say', text: (m[1] ?? m[2]).slice(0, 300) };
  return null;
}

/** Might this be a computer command the patterns missed (so the AI should have a look)? */
export function mightBeComputer(text) {
  const t = String(text ?? '').trim();
  return (
    /^(?:(?:hey|ok|oye)\s+\w+[,!]?\s*)?(?:can you\s+|could you\s+|please\s+)?(?:change|set|turn|switch|make|delete|remove|trash|clean|close|quit|search|look up|find|play|take|lock|mute|unmute|increase|decrease|raise|lower|put|show|empty|go|open|get|pull up|watch|cambia|pon|borra|busca|cierra|sube|baja|apaga|bloquea|quita|haz|ve|abre|entra)\b/i.test(t) ||
    /\b(?:youtube|google|wallpaper|background|screenshots?|volume|brightness|dark mode|battery|storage)\b/i.test(t)
  );
}

const TYPES = ['youtube', 'google', 'images', 'maps', 'wallpaper', 'trashScreenshots', 'emptyTrash', 'volume', 'brightness', 'darkMode', 'screenshot', 'battery', 'storage', 'openApps', 'lock', 'displaySleep', 'quitApp', 'newFolder', 'lastDownload', 'lastScreenshot', 'say'];

/** The local AI picks one action for a request the patterns missed (or "none"). Never anything outside the list. */
export async function classifyComputer(text, model) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      options: { temperature: 0 },
      messages: [
        {
          role: 'system',
          content:
            'You turn a request to control a Mac into one action. Reply with JSON only: {"type": "...", "q": "...", "value": number or null, "app": "...", "name": "..."}.\n' +
            'type is one of: youtube (search YouTube; q), google (search the web; q), images (find pictures; q), maps (a place; q), wallpaper (change the desktop picture; q = what picture), ' +
            'trashScreenshots (delete screenshots), emptyTrash, volume (value 0-100, or value null with q "up"/"down"/"mute"/"unmute"), brightness (q "up"/"down"), darkMode (q "on"/"off"), screenshot, battery, storage, openApps, lock, displaySleep, ' +
            'quitApp (app = the app name), newFolder (name), lastDownload, lastScreenshot, say (q = words to say out loud), none (anything else, like a question or chat).\nUse "none" when unsure.',
        },
        { role: 'user', content: String(text).slice(0, 300) },
      ],
    }),
  });
  const out = JSON.parse((await res.json())?.message?.content ?? '{}');
  const type = TYPES.includes(out.type) ? out.type : null;
  if (!type) return null;
  const q = cleanQ(out.q).slice(0, 120);
  switch (type) {
    case 'youtube':
    case 'google':
    case 'images':
    case 'maps':
    case 'wallpaper':
      return q ? { type, q } : null;
    case 'volume':
      if (Number.isFinite(out.value)) return { type, value: Math.max(0, Math.min(100, out.value)) };
      if (/mute/i.test(q)) return { type, mute: !/unmute/i.test(q) };
      return { type, delta: /down|low/i.test(q) ? -15 : 15 };
    case 'brightness':
      return { type, delta: /down|dim|low/i.test(q) ? -2 : 2 };
    case 'darkMode':
      return { type, on: /off|light/i.test(q) ? false : true };
    case 'trashScreenshots':
      return { type, where: 'desktop', confirm: true };
    case 'emptyTrash':
      return { type, confirm: true };
    case 'quitApp':
      return out.app ? { type, app: String(out.app).slice(0, 30) } : null;
    case 'newFolder':
      return out.name ? { type, name: String(out.name).slice(0, 60), where: 'Desktop' } : null;
    case 'say':
      return q ? { type, text: q } : null;
    default:
      return { type };
  }
}

// ---------- doing it ----------

const run = (cmd, args, timeout = 20_000) => new Promise((resolve, reject) => execFile(cmd, args, { timeout }, (err, out, e) => (err ? reject(new Error(String(e || err.message).trim())) : resolve(String(out).trim()))));
const osa = (script) => run('osascript', ['-e', script]);
const SHOT = /^(?:Screenshot|Screen Shot|Captura de pantalla|Captura|Bildschirmfoto|Capture d.écran|Schermata|Skärmavbild|Schermafbeelding)\b.*\.(?:png|jpe?g|heic|tiff?)$/i;
const RECORDING = /^(?:Screen Recording|Grabación de pantalla|Bildschirmaufnahme|Enregistrement de l.écran)\b.*\.(?:mov|mp4)$/i;
const NEVER_QUIT = /^(?:finder|loginwindow|dock|systemuiserver|window ?server|electron|bbokari|minecraft.?mob)$/i;

/** Where macOS saves screenshots (the Desktop unless you changed it). */
async function screenshotFolder() {
  const custom = await run('defaults', ['read', 'com.apple.screencapture', 'location']).catch(() => '');
  const dir = custom.replace(/^~/, os.homedir());
  return dir && fs.existsSync(dir) ? dir : path.join(os.homedir(), 'Desktop');
}

/** The screenshots that would go to the Trash: [paths]. */
export async function findScreenshots({ where = 'desktop', recordings = false } = {}) {
  const dirs = new Set([await screenshotFolder()]);
  if (where === 'downloads' || where === 'all') dirs.add(path.join(os.homedir(), 'Downloads'));
  if (where === 'all') dirs.add(path.join(os.homedir(), 'Desktop'));
  if (where === 'downloads') dirs.delete(await screenshotFolder());
  const out = [];
  for (const dir of dirs) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.isFile() && (SHOT.test(f.name) || (recordings && RECORDING.test(f.name)))) out.push(path.join(dir, f.name));
    }
  }
  return out;
}

/** A wallpaper picture: Pixabay if you have a key, otherwise Wikimedia Commons (free, no key). Returns a saved file path. */
async function fetchWallpaper(q, pixabayKey) {
  let url = null;
  if (pixabayKey) {
    const u = new URL('https://pixabay.com/api/');
    u.search = new URLSearchParams({ key: pixabayKey, q: q.slice(0, 90), image_type: 'photo', orientation: 'horizontal', safesearch: 'true', min_width: '1920', per_page: '10', order: 'popular' }).toString();
    const hits = (await (await fetch(u, { signal: AbortSignal.timeout(15_000) })).json().catch(() => ({}))).hits ?? [];
    const pick = hits[Math.floor(Math.random() * Math.min(5, hits.length))];
    url = pick?.largeImageURL ?? null;
  }
  if (!url) {
    const u = new URL('https://commons.wikimedia.org/w/api.php');
    u.search = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '10', prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: '2560' }).toString();
    const pages = Object.values((await (await fetch(u, { headers: { 'User-Agent': 'Bbokari desktop pet' }, signal: AbortSignal.timeout(15_000) })).json().catch(() => ({}))).query?.pages ?? {});
    const good = pages.map((p) => p.imageinfo?.[0]).filter((i) => i && i.width >= 1600 && i.width > i.height);
    url = good[0]?.thumburl ?? good[0]?.url ?? null;
  }
  if (!url) return null;
  const res = await fetch(url, { headers: { 'User-Agent': 'Bbokari desktop pet' }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return null;
  const dir = path.join(os.homedir(), 'Pictures', 'Bbokari Wallpapers');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${q.replace(/[^\w -]+/g, '').trim().slice(0, 40) || 'wallpaper'} ${Date.now()}.jpg`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

/**
 * Does it. `deps`: { openURL(url), openPath(file), trash(file) (to the Trash, can be undone), pixabayKey }.
 * Returns what to say. Actions with `confirm` must only be run after you said yes.
 */
export async function runComputer(c, deps) {
  if (process.platform !== 'darwin' && !['youtube', 'google', 'images', 'maps'].includes(c.type)) return 'That only works on a Mac.';
  switch (c.type) {
    case 'youtube':
      await deps.openURL(`https://www.youtube.com/results?search_query=${encodeURIComponent(c.q)}`);
      return `▶️ Here are YouTube videos about “${c.q}”!`;
    case 'google':
      await deps.openURL(`https://www.google.com/search?q=${encodeURIComponent(c.q)}`);
      return `🔎 Searching Google for “${c.q}”!`;
    case 'images':
      await deps.openURL(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(c.q)}`);
      return `🖼 Pictures of “${c.q}”!`;
    case 'maps':
      await deps.openURL(`https://www.google.com/maps/search/${encodeURIComponent(c.q)}`);
      return `🗺 “${c.q}” on the map!`;
    case 'wallpaper': {
      const file = await fetchWallpaper(c.q, deps.pixabayKey).catch(() => null);
      if (!file) {
        await deps.openURL(`https://www.google.com/search?tbm=isch&tbs=isz:l&q=${encodeURIComponent(`${c.q} wallpaper`)}`);
        return `I couldn’t download a “${c.q}” picture, so I opened wallpaper searches for you 🖼 Right-click one you like → “Use Image as Desktop Picture”.`;
      }
      await osa(`tell application "System Events" to tell every desktop to set picture to POSIX file ${JSON.stringify(file)}`);
      return `🖼 New wallpaper: ${c.q}! (Saved in Pictures → Bbokari Wallpapers.) Don’t like it? Ask again for another one.`;
    }
    case 'trashScreenshots': {
      const files = await findScreenshots(c);
      if (!files.length) return 'I didn’t find any screenshots there ✨ Already clean!';
      for (const f of files) await deps.trash(f);
      return `🧹 Moved ${files.length} screenshot${files.length === 1 ? '' : 's'} to the Trash! Everything else is still there. (Changed your mind? They’re in the Trash: right-click → Put Back.)`;
    }
    case 'emptyTrash':
      await osa('tell application "Finder" to empty trash');
      return '🗑 Emptied the Trash!';
    case 'volume': {
      if (c.mute != null) {
        await osa(`set volume output muted ${c.mute}`);
        return c.mute ? '🔇 Muted.' : '🔊 Sound is back on!';
      }
      const now = Number(await osa('output volume of (get volume settings)').catch(() => 50)) || 50;
      const to = c.value ?? Math.max(0, Math.min(100, now + c.delta));
      await osa(`set volume output volume ${to}\nset volume output muted false`);
      return `${to > now ? '🔊' : '🔉'} Volume ${to}%`;
    }
    case 'brightness': {
      const key = c.delta > 0 ? 144 : 145;
      await osa(`tell application "System Events"\nrepeat ${Math.abs(c.delta)} times\nkey code ${key}\ndelay 0.05\nend repeat\nend tell`);
      return c.delta > 0 ? '☀️ Brighter!' : '🌙 Dimmer!';
    }
    case 'darkMode': {
      const to = c.on == null ? 'not dark mode' : String(c.on);
      await osa(`tell application "System Events" to tell appearance preferences to set dark mode to ${to}`);
      return c.on === false ? '☀️ Light mode on!' : c.on ? '🌙 Dark mode on!' : '🌗 Switched!';
    }
    case 'screenshot': {
      const file = path.join(os.homedir(), 'Desktop', `Screenshot by Bbokari ${new Date().toLocaleString('sv').replace(/:/g, '.')}.png`);
      await run('screencapture', c.select ? ['-i', file] : ['-x', file], 120_000);
      if (!fs.existsSync(file)) return 'Okay, no screenshot then!';
      return `📸 Saved on your Desktop!${c.select ? '' : ' (Say “take a screenshot of part of the screen” to pick an area.)'}`;
    }
    case 'battery': {
      const out = await run('pmset', ['-g', 'batt']);
      const pct = out.match(/(\d+)%/)?.[1];
      if (!pct) return 'This Mac doesn’t have a battery (it’s plugged in) 🔌';
      const charging = /charging|AC Power/i.test(out) && !/discharging/i.test(out);
      const left = out.match(/(\d+:\d+) remaining/)?.[1];
      return `🔋 ${pct}%${charging ? ' and charging ⚡' : ''}${left && !charging ? ` (about ${left.replace(':', 'h ')}m left)` : ''}${Number(pct) < 20 && !charging ? ' Plug me in soon!' : ''}`;
    }
    case 'storage': {
      const out = await run('df', ['-k', '/System/Volumes/Data']).catch(() => run('df', ['-k', '/']));
      const cols = out.split('\n')[1]?.trim().split(/\s+/) ?? [];
      const size = Number(cols[1]) * 1024;
      const free = Number(cols[3]) * 1024;
      const gb = (n) => `${(n / 1e9).toFixed(0)} GB`;
      return size ? `💾 ${gb(free)} free out of ${gb(size)}.${free / size < 0.1 ? ' Getting full! Want me to clean up your screenshots?' : ''}` : 'I couldn’t check the storage 😕';
    }
    case 'openApps': {
      const out = await osa('tell application "System Events" to get name of (processes where background only is false)');
      const apps = out.split(', ').filter((a) => !/^(?:Electron|Finder)$/i.test(a));
      return apps.length ? `🪟 Open right now: ${apps.join(', ')}` : 'Nothing else is open!';
    }
    case 'lock':
      await osa('tell application "System Events" to keystroke "q" using {control down, command down}');
      return '🔒 Locked!';
    case 'displaySleep':
      await run('pmset', ['displaysleepnow']);
      return '🌙 Screen off. Move the mouse to wake it.';
    case 'shutdown':
      return 'I won’t turn off or restart your Mac myself (you might lose unsaved work) 🙈 Use  → Shut Down… or Restart… when you’re ready.';
    case 'quitApp': {
      const name = c.app.replace(/\b\w/g, (x) => x.toUpperCase()).replace(/^Vs Code$/i, 'Visual Studio Code').replace(/^Chrome$/i, 'Google Chrome').replace(/^Powerpoint$/i, 'Microsoft PowerPoint').replace(/^Word$/i, 'Microsoft Word');
      if (NEVER_QUIT.test(name)) return `I can’t close ${name} 🙈`;
      const running = await osa(`application ${JSON.stringify(name)} is running`).catch(() => 'false');
      if (running !== 'true') return `${name} isn’t open 🤔`;
      await osa(`tell application ${JSON.stringify(name)} to quit`);
      return `👋 Closed ${name}.`;
    }
    case 'newFolder': {
      const safe = c.name.replace(/[/:]+/g, '-').trim().slice(0, 60);
      if (!safe) return 'What should the folder be called?';
      const dir = path.join(os.homedir(), c.where ?? 'Desktop', safe);
      if (fs.existsSync(dir)) return `There’s already a folder called “${safe}” there.`;
      fs.mkdirSync(dir, { recursive: true });
      await deps.openPath(dir);
      return `📁 Made “${safe}” in your ${c.where ?? 'Desktop'}!`;
    }
    case 'lastDownload':
    case 'lastScreenshot': {
      const dir = c.type === 'lastDownload' ? path.join(os.homedir(), 'Downloads') : await screenshotFolder();
      const files = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((f) => f.isFile() && !f.name.startsWith('.') && (c.type === 'lastDownload' || SHOT.test(f.name)))
        .map((f) => ({ f: path.join(dir, f.name), t: fs.statSync(path.join(dir, f.name)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      if (!files.length) return c.type === 'lastDownload' ? 'Your Downloads folder is empty!' : 'No screenshots found!';
      await deps.openPath(files[0].f);
      return `📂 Opening ${path.basename(files[0].f)}`;
    }
    case 'say':
      execFile('say', [c.text]);
      return `🗣 “${c.text}”`;
    default:
      return null;
  }
}

/** What Bbokari asks before an action that deletes things. */
export async function confirmText(c) {
  if (c.type === 'trashScreenshots') {
    const files = await findScreenshots(c).catch(() => []);
    if (!files.length) return null;
    return `🧹 I found ${files.length} screenshot${files.length === 1 ? '' : 's'}${c.where === 'downloads' ? ' in Downloads' : c.where === 'all' ? '' : ' on your Desktop'}. Move them to the Trash? Everything else stays. (yes / no)`;
  }
  if (c.type === 'emptyTrash') return '🗑 Empty the Trash? Things in it will be gone for good. (yes / no)';
  return null;
}
