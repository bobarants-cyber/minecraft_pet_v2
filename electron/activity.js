// What are you doing right now? Looks at the app in front and, for browsers, the current tab's address and title,
// and sorts it into a few kinds the pet can act out. Only on this Mac; nothing is stored or sent anywhere.
import { execFile } from 'node:child_process';

/** Each kind: apps (bundle ids) and/or tab addresses (regexes on the URL), plus words in a window title. */
const RULES = [
  {
    kind: 'meeting',
    apps: ['us.zoom.xos', 'com.microsoft.teams2', 'com.microsoft.teams', 'com.apple.FaceTime', 'com.cisco.webexmeetingsapp'],
    url: /meet\.google\.com\/[a-z]{3,4}-|zoom\.us\/(wc|j)\/|teams\.(microsoft|live)\.com|whereby\.com\/|discord\.com\/channels\/.*voice/i,
  },
  {
    kind: 'video',
    apps: ['com.apple.TV', 'com.apple.QuickTimePlayerX', 'org.videolan.vlc', 'com.colliderli.iina', 'com.netflix.Netflix'],
    url: /(?<!music\.)youtube\.com\/(watch|shorts|live)|youtu\.be\/|netflix\.com\/watch|disneyplus\.com\/.*(video|play)|primevideo\.com|amazon\.[a-z.]+\/.*video|max\.com\/.*video|hulu\.com\/watch|twitch\.tv\/(?!directory)[\w]+\/?$|vimeo\.com\/\d|tiktok\.com|crunchyroll\.com\/.*watch|tv\.apple\.com\/.*(episode|movie)/i,
  },
  {
    kind: 'music',
    apps: ['com.spotify.client', 'com.apple.Music', 'com.apple.iTunes'],
    url: /open\.spotify\.com|music\.youtube\.com|soundcloud\.com|music\.apple\.com|deezer\.com|pandora\.com/i,
  },
  {
    kind: 'gaming',
    apps: ['com.mojang.minecraftlauncher', 'com.roblox.RobloxPlayer', 'com.roblox.RobloxStudio', 'com.valvesoftware.steam', 'com.epicgames.EpicGamesLauncher', 'net.java.openjdk.java', 'com.apple.Chess'],
    url: /roblox\.com\/games|poki\.[a-z]+|crazygames\.com|coolmathgames\.com|chess\.com\/(play|game)|lichess\.org\/\w{8}|krunker\.io|slither\.io|agar\.io|minecraft\.net\/.*play|geoguessr\.com\/game/i,
    title: /minecraft|roblox/i,
  },
  {
    kind: 'drawing',
    apps: ['com.figma.Desktop', 'com.adobe.Photoshop', 'com.adobe.illustrator', 'com.bohemiancoding.sketch3', 'com.pixelmatorteam.pixelmator.x', 'com.seriflabs.affinitydesigner2'],
    url: /canva\.com\/design|figma\.com\/(file|design|board)|docs\.google\.com\/(drawings|presentation)|excalidraw\.com|sketch\.io|pixlr\.com|photopea\.com|kleki\.com/i,
  },
  {
    kind: 'writing',
    apps: ['com.apple.iWork.Pages', 'com.microsoft.Word', 'com.apple.Notes', 'com.apple.TextEdit', 'notion.id', 'md.obsidian', 'com.literatureandlatte.scrivener3'],
    url: /docs\.google\.com\/document|notion\.(so|site)|word\.cloud\.microsoft|office\.com\/.*word|onedrive\.live\.com\/.*docx|dropbox\.com\/paper|grammarly\.com\/(docs|ddocs)/i,
  },
  {
    kind: 'coding',
    apps: ['com.apple.Terminal', 'com.googlecode.iterm2', 'com.microsoft.VSCode', 'com.apple.dt.Xcode', 'com.todesktop.230313mzl4w4u92', 'com.jetbrains.intellij', 'dev.warp.Warp-Stable', 'com.sublimetext.4'],
    url: /github\.com|gitlab\.com|replit\.com|codepen\.io|codesandbox\.io|stackoverflow\.com|scratch\.mit\.edu\/projects\/.*editor|code\.org|leetcode\.com|vscode\.dev/i,
  },
  {
    kind: 'reading',
    apps: ['com.apple.Preview', 'com.apple.iBooksX', 'com.amazon.Lassen', 'com.amazon.Kindle', 'com.adobe.Reader', 'com.readdle.PDFExpert-Mac'],
    url: /wikipedia\.org\/wiki|\.pdf(\?|#|$)|medium\.com\/|substack\.com\/p\/|wattpad\.com\/\d|archiveofourown\.org\/works|webtoons\.com\/.*viewer|gutenberg\.org/i,
  },
];

const BROWSERS = {
  'com.google.Chrome': 'chromium',
  'com.google.Chrome.beta': 'chromium',
  'com.brave.Browser': 'chromium',
  'com.microsoft.edgemac': 'chromium',
  'company.thebrowser.Browser': 'chromium',
  'com.vivaldi.Vivaldi': 'chromium',
  'com.operasoftware.Opera': 'chromium',
  'com.apple.Safari': 'safari',
};

/**
 * The address of the first open browser tab (front window of each running browser) that matches `re`, or ''.
 * Used for "fill this Canva template": Bbokari's own chat window is in front then, so it asks the browsers directly.
 */
export async function findBrowserTab(re) {
  for (const [id, kind] of Object.entries(BROWSERS)) {
    const tab = kind === 'safari' ? 'current tab' : 'active tab';
    try {
      const url = await osascript(`if application id "${id}" is running then\ntell application id "${id}"\nif (count of windows) > 0 then return URL of ${tab} of front window\nend tell\nend if\nreturn ""`);
      if (url && re.test(url)) return url.trim();
    } catch {}
  }
  return '';
}

/** The kind of activity for an app (bundle id) with an optional tab URL and window/tab title, or null. */
export function classify({ id = '', url = '', title = '' } = {}) {
  for (const r of RULES) {
    if (url && r.url?.test(url)) return r.kind;
  }
  for (const r of RULES) {
    if (r.apps?.includes(id)) return r.kind;
    if (title && r.title?.test(title) && !BROWSERS[id]) return r.kind;
  }
  return null;
}

function osascript(script) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: 3000 }, (err, stdout) => (err ? reject(err) : resolve(stdout.trim())));
  });
}

/** { id, name, url, title } for the app in front (url/title only for browsers), or null. */
export async function frontmost() {
  try {
    const out = await osascript(
      'tell application "System Events"\n' +
        'set p to first application process whose frontmost is true\n' +
        'set t to ""\n' +
        'try\n set t to name of front window of p\n end try\n' +
        'return (bundle identifier of p) & "\\n" & (name of p) & "\\n" & (unix id of p as text) & "\\n" & t\n' +
        'end tell',
    );
    const [id, name, pid, title] = out.split('\n');
    const app = { id, name, pid: Number(pid), title: title ?? '', url: '' };
    const kind = BROWSERS[id];
    if (kind) {
      const script =
        kind === 'safari'
          ? `tell application id "${id}" to if (count of windows) > 0 then return (URL of current tab of front window) & "\\n" & (name of current tab of front window)`
          : `tell application id "${id}" to if (count of windows) > 0 then return (URL of active tab of front window) & "\\n" & (title of active tab of front window)`;
      try {
        const [url, tabTitle] = (await osascript(script)).split('\n');
        app.url = url ?? '';
        app.title = tabTitle || app.title;
      } catch {}
    }
    return app;
  } catch {
    return null;
  }
}

/**
 * Polls what you're doing and reports changes. A new kind has to be seen twice in a row before it counts, so
 * quickly switching apps doesn't make the pet jump between scenes. Switching to the pet itself is ignored.
 */
export class ActivityWatcher {
  constructor({ onChange, every = 4000 }) {
    this.onChange = onChange;
    this.every = every;
    this.kind = null;
    this.pending = null;
    this.timer = null;
    this.busy = false;
  }

  start() {
    this.timer ??= setInterval(() => this.poll(), this.every);
    this.poll();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.kind) {
      this.kind = null;
      this.onChange(null, null);
    }
  }

  async poll() {
    if (this.busy) return;
    this.busy = true;
    try {
      const app = await frontmost();
      if (!app || app.pid === process.pid || /electron/i.test(app.id ?? '')) return;
      const kind = classify(app);
      if (kind === this.kind) {
        this.pending = null;
        return;
      }
      if (this.pending !== kind) {
        this.pending = kind;
        return;
      }
      this.pending = null;
      this.kind = kind;
      this.onChange(kind, app);
    } finally {
      this.busy = false;
    }
  }
}
