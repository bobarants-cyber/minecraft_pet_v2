// 🎵 "Play Blinding Lights", "play my study playlist", "pause", "next song", "what's playing?"
// Bbokari opens the Spotify app, types the name into Spotify's own search (⌘K) one letter at a time like a person,
// opens the top result, and starts it. To start the exact song he looks up its Spotify link on the web (no key
// needed) and asks the Spotify app to play it. Controls (pause, next, volume…) use the Spotify app's AppleScript.
// Mac only. No Electron imports, so the parsing can be tested with plain Node.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { typingScript } from './opener.js';

const osascript = (script, timeout = 60_000) =>
  new Promise((resolve, reject) => execFile('osascript', ['-e', script], { timeout }, (err, out, errOut) => (err ? reject(new Error(String(errOut || err.message).trim())) : resolve(String(out).trim()))));
const quote = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** "play X" → { query, kind: 'track' | 'playlist' | 'album' | 'artist', mine }, or null. */
export function parsePlay(text) {
  const m = String(text)
    .trim()
    .match(/^(?:(?:hey|ok)\s+\w+[,!]?\s*)?(?:can you\s+|could you\s+|please\s+)?(?:play|put on|start playing|pon(?:me)?|reproduce|toca)\s+(.+?)(?:\s+(?:on|in|en)\s+spotify)?[.!?]*$/i);
  if (!m) return null;
  let q = m[1].trim();
  // Not music: "play ping pong", "play a game", "play rock paper scissors" are Bbokari's games.
  if (/^(?:it|that|this|the song|this song|that song)(?:\s+again)?$|\bagain$/i.test(q)) return null; // "play it again" is a control
  if (/^(?:a game|games?|ping ?pong|tic[- ]?tac[- ]?toe|rock paper scissors|rps|cups|bubbles|with me|together)\b/i.test(q)) return null;
  if (/^(?:some(?:thing)?|music|songs?|anything|any music|algo|m[uú]sica)$/i.test(q)) return { query: '', kind: 'resume', mine: false };
  const mine = /^(?:my|mi)\s+/i.test(q) || /\b(?:liked songs|my likes|canciones que me gustan)\b/i.test(q);
  let kind = 'track';
  if (/\b(?:playlist|lista)\b/i.test(q)) kind = 'playlist';
  else if (/\balbum|[aá]lbum\b/i.test(q)) kind = 'album';
  else if (/^(?:songs?|music|canciones|m[uú]sica)\s+(?:by|from|de)\s+/i.test(q)) kind = 'artist';
  q = q
    .replace(/^(?:my|mi|the|el|la)\s+/i, '')
    .replace(/^(?:songs?|music|canciones|m[uú]sica)\s+(?:by|from|de)\s+/i, '')
    .replace(/^(?:the\s+)?(?:song|canci[oó]n)\s+/i, '')
    .replace(/\s*\b(?:playlist|lista(?: de reproducci[oó]n)?|album|[aá]lbum)\b\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/\bliked songs|my likes|canciones que me gustan\b/i.test(m[1])) return { query: 'Liked Songs', kind: 'playlist', mine: true };
  return q ? { query: q, kind, mine } : null;
}

/** "pause", "next song", "louder", "what's playing" → { action, value? }, or null. */
export function parseControl(text) {
  // "Skip this song please" → "skip": drop greetings, "please", "can you", "the/this song" and so on first.
  const t = String(text)
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, '')
    .replace(/^(?:hey|ok)\s+\w+[,!]?\s*/, '')
    .replace(/^(?:can you|could you|please|por favor)\s+/, '')
    .replace(/\s+(?:please|por favor|plz|pls)$/, '')
    .replace(/\s+(?:this|the|that|a|one)\s+(?:song|track)$/, ' song')
    .replace(/\s+(?:esta|la|una)\s+canci[oó]n$/, '')
    .trim();
  if (/^(?:salta|s[aá]ltala|p[aá]sala|pasa(?: la)? canci[oó]n|otra canci[oó]n|next one)$/.test(t)) return { action: 'next' };
  if (/^(?:atr[aá]s|vuelve|la anterior|go back (?:a )?song|back (?:a )?song)$/.test(t)) return { action: 'previous' };
  if (/^(?:play (?:it|the song|that) again|restart (?:it|the song)|from the start)$/.test(t)) return { action: 'restart' };
  if (/^(?:skip(?: song)?|next song)$/.test(t)) return { action: 'next' };
  if (/^(?:pause|stop)(?: the)?(?: music| song| spotify)?$|^para(?: la m[uú]sica)?$|^pausa$/.test(t)) return { action: 'pause' };
  if (/^(?:resume|continue|unpause|keep playing|play)(?: the)?(?: music| song| spotify)?$|^sigue$/.test(t)) return { action: 'play' };
  if (/^(?:next|skip)(?: (?:song|track|one))?$|^(?:skip (?:this|it))$|^siguiente(?: canci[oó]n)?$/.test(t)) return { action: 'next' };
  if (/^(?:previous|go back|back|last)(?: (?:song|track|one))?$|^anterior$/.test(t)) return { action: 'previous' };
  if (/^(?:volume up|louder|turn it up|sube(?: el)? volumen|m[aá]s alto)$/.test(t)) return { action: 'volume', value: +15 };
  if (/^(?:volume down|quieter|softer|turn it down|baja(?: el)? volumen|m[aá]s bajo)$/.test(t)) return { action: 'volume', value: -15 };
  const set = t.match(/^(?:set (?:the )?)?volume (?:to )?(\d{1,3})%?$/);
  if (set) return { action: 'volumeTo', value: Math.min(100, Number(set[1])) };
  if (/^(?:what(?:'s| is) (?:this song|playing|the song)|what song is (?:this|playing)|qu[eé] canci[oó]n es (?:esta|esa)|qu[eé] suena)$/.test(t)) return { action: 'now' };
  if (/^shuffle(?: on)?$/.test(t)) return { action: 'shuffle', value: true };
  if (/^(?:shuffle off|stop shuffling)$/.test(t)) return { action: 'shuffle', value: false };
  return null;
}

/** The Spotify link for this search, found on the web (DuckDuckGo, then Bing): 'spotify:track:…' or null. */
export async function findUri(query, kind = 'track', { fetchFn = fetch } = {}) {
  const want = kind === 'artist' ? 'artist' : kind;
  const q = `site:open.spotify.com/${want} ${query}`;
  const pages = [`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, `https://www.bing.com/search?q=${encodeURIComponent(q)}`];
  for (const url of pages) {
    try {
      const res = await fetchFn(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 'Accept-Language': 'en' }, signal: AbortSignal.timeout(8000) });
      const html = decodeURIComponent((await res.text()).replace(/&amp;/g, '&'));
      const hits = [...html.matchAll(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist|artist)\/([A-Za-z0-9]{22})/g)];
      const hit = hits.find((h) => h[1] === want) ?? hits[0];
      if (hit) return `spotify:${hit[1]}:${hit[2]}`;
    } catch {}
  }
  return null;
}

/** Is the Spotify app installed (or open)? Looks in both Applications folders, then asks macOS. */
const hasSpotify = async () => {
  if (['/Applications/Spotify.app', path.join(os.homedir(), 'Applications', 'Spotify.app')].some((p) => fs.existsSync(p))) return true;
  if ((await osascript('application id "com.spotify.client" is running', 5000).catch(() => 'false')) === 'true') return true;
  const found = await new Promise((resolve) => execFile('mdfind', ['kMDItemCFBundleIdentifier == "com.spotify.client"'], { timeout: 5000 }, (err, out) => resolve(!err && String(out).trim().length > 0)));
  return found;
};

/**
 * Plays something: opens Spotify, types the name into its search like a person, opens the top result, then starts
 * the exact song/playlist. Returns what to say.
 */
export async function play({ query, kind, mine }) {
  if (!(await hasSpotify())) return { ok: false, text: 'I can’t find the Spotify app 🎵 Install it from spotify.com/download, sign in, and ask me again!' };
  if (kind === 'resume') {
    await osascript('tell application "Spotify" to play');
    return { ok: true, text: '🎵 Playing!' };
  }
  // Look up the exact link while he types (your own private playlists aren't on the web, so not for "my …").
  const uriP = mine ? Promise.resolve(null) : findUri(query, kind);
  const before = await trackId();
  await osascript(
    'tell application "Spotify" to activate\n' +
      'delay 1.2\n' +
      'tell application "System Events"\n' +
      'keystroke "k" using command down\n' +
      'delay 0.6\n' +
      'keystroke "a" using command down\n' +
      'delay 0.1\n' +
      `${typingScript(query)}\n` +
      'delay 1.2\n' +
      'end tell',
    90_000,
  );
  const uri = await uriP;
  if (uri) {
    // Found the exact one: close the search (Enter would play Spotify's top result, which can be a different song).
    await osascript('tell application "System Events" to key code 53');
    await osascript(`tell application "Spotify" to play track ${quote(uri)}`);
  } else {
    // No exact link (e.g. your own playlist): Enter plays Spotify's top result for what he typed.
    await osascript('tell application "System Events" to key code 36');
  }
  // Wait until Spotify has really switched songs before saying its name.
  const now = await waitForChange(before, uri);
  if (now) return { ok: true, text: `🎵 Playing ${now}!` };
  return { ok: true, text: mine ? `I opened “${query}” in Spotify 🎵 If it didn’t start, press the green ▶ button!` : `I searched Spotify for “${query}” 🎵 If it didn’t start, press ▶ on the one you want!` };
}

/** The current track's Spotify id ('spotify:track:…'), or ''. */
async function trackId() {
  return osascript('tell application "Spotify"\nif player state is stopped then return ""\nreturn id of current track\nend tell', 5000).catch(() => '');
}

/** Waits (up to ~6 s) until the song is no longer `before` (or is `uri`), then returns its name, or ''. */
async function waitForChange(before, uri) {
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const id = await trackId();
    const switched = id && (uri?.startsWith('spotify:track:') ? id === uri : id !== before);
    if (switched) return nowPlaying().catch(() => '');
  }
  return '';
}

/** "Blinding Lights by The Weeknd" (or '' if nothing is playing). */
export async function nowPlaying() {
  const out = await osascript('tell application "Spotify"\nif player state is stopped then return ""\nreturn (name of current track) & " by " & (artist of current track)\nend tell', 8000);
  return out ? `“${out.replace(/ by /, '” by ')}` : '';
}

/** Pause, play, next, previous, volume, shuffle, what's playing. Returns what to say. */
export async function control({ action, value }) {
  // Only when Spotify is open (so "next" or "stop" never launches it by surprise); "play" may open it.
  const running = await osascript('application id "com.spotify.client" is running', 5000).catch(() => 'false');
  if (running !== 'true' && action !== 'play') return null;
  if (!(await hasSpotify())) return { ok: false, text: 'I can’t find the Spotify app 🎵' };
  const tell = (cmd) => osascript(`tell application "Spotify" to ${cmd}`, 8000);
  switch (action) {
    case 'pause':
      await tell('pause');
      return { ok: true, text: '⏸ Paused.' };
    case 'play':
      await tell('play');
      return { ok: true, text: '▶️ Playing!' };
    case 'next':
      await tell('next track');
      await new Promise((r) => setTimeout(r, 700));
      return { ok: true, text: `⏭ ${(await nowPlaying().catch(() => '')) || 'Next song!'}` };
    case 'restart':
      await tell('set player position to 0');
      await tell('play');
      return { ok: true, text: '🔁 From the start!' };
    case 'previous':
      await tell('previous track');
      await new Promise((r) => setTimeout(r, 700));
      return { ok: true, text: `⏮ ${(await nowPlaying().catch(() => '')) || 'Back one song!'}` };
    case 'volume': {
      const v = Number(await tell('sound volume'));
      const to = Math.max(0, Math.min(100, (Number.isFinite(v) ? v : 50) + value));
      await tell(`set sound volume to ${to}`);
      return { ok: true, text: `${value > 0 ? '🔊' : '🔉'} Volume ${to}%` };
    }
    case 'volumeTo':
      await tell(`set sound volume to ${value}`);
      return { ok: true, text: `🔊 Volume ${value}%` };
    case 'shuffle':
      await tell(`set shuffling to ${value}`);
      return { ok: true, text: value ? '🔀 Shuffle on!' : 'Shuffle off.' };
    case 'now': {
      const now = await nowPlaying().catch(() => '');
      return { ok: true, text: now ? `🎵 It’s ${now}` : 'Nothing is playing right now 🤫' };
    }
    default:
      return null;
  }
}
