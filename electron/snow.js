// ❄️ Let it snow: snow falls on your real desktop, piles up on your windows, snowmen move in, you roll and throw
// snowballs, shaking the mouse blows it all away, and a sleigh runs by when you switch apps.
// A see-through overlay draws it all; clicks go straight through it except on the snow itself. A tiny Swift helper
// (snowHelper.swift, built once with Xcode's tools) tells it where your windows are (positions only).
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { app, BrowserWindow, ipcMain, screen } from 'electron';

const HERE = path.dirname(new URL(import.meta.url).pathname);

export const SNOW_DEFAULTS = {
  mode: 'off', // 'off' | 'on' (over everything) | 'desktop' (only on the desktop, behind windows)
  amount: 'medium', // 'light' | 'medium' | 'heavy'
  fx: { piles: true, snowmen: true, fights: true, sleigh: true, wind: true },
  saver: false, // battery saver: 30 fps
};

/** What's on the desktop that snow can land on: the Winter night scene and Bbokari's own widgets. */
function deskInfo(settings, bounds) {
  const home = settings.home ?? {};
  const winter = (home.on && home.wallpaper?.value === 'winter') || (!home.on && home.desktopTheme === 'winter');
  const W = bounds.width, H = bounds.height;
  const widgets = home.on ? (home.widgets ?? []).map((w) => {
    const ww = Math.min(w.w, W - 16), hh = Math.min(w.h, H - 16);
    return { id: w.id, x: Math.max(8, Math.min(W - ww - 8, w.x * W)), y: Math.max(8, Math.min(H - hh - 8, w.y * H)), w: ww, h: hh };
  }) : [];
  return { scene: winter ? 'winter' : null, widgets, radius: home.glass?.radius ?? 28 };
}

export function createSnow({ getSettings, applySettings, say }) {
  let win = null;
  let helper = null;
  let cursorTimer = null;
  let building = null;

  const cfg = () => {
    const s = getSettings().snow ?? {};
    return { ...SNOW_DEFAULTS, ...s, fx: { ...SNOW_DEFAULTS.fx, ...(s.fx ?? {}) } };
  };
  const push = () => win && !win.isDestroyed() && win.webContents.send('snow:config', cfg());

  async function buildHelper() {
    if (process.platform !== 'darwin') return null;
    const src = path.join(HERE, 'snowHelper.swift');
    const bin = path.join(app.getPath('userData'), 'bbokari-snow-helper');
    const stale = !fs.existsSync(bin) || fs.statSync(bin).mtimeMs < fs.statSync(src).mtimeMs;
    if (stale) {
      say?.('❄️ Getting the snow ready (only the first time, about 20 seconds)…');
      await new Promise((resolve, reject) => execFile('xcrun', ['swiftc', '-O', src, '-o', bin], { timeout: 180_000 }, (err, _o, e) => (err ? reject(new Error(String(e || err.message).slice(0, 300))) : resolve())));
    }
    return bin;
  }

  function startHelper(bin) {
    if (!bin || helper) return;
    const child = spawn(bin, [String(process.pid), cfg().saver ? '33' : '16'], { stdio: ['pipe', 'pipe', 'ignore'] });
    helper = child;
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += String(d);
      const lines = buf.split('\n');
      buf = lines.pop();
      const last = lines.filter(Boolean).at(-1); // only the newest matters
      if (!last || !win || win.isDestroyed()) return;
      try {
        const b = screen.getPrimaryDisplay().bounds;
        const data = JSON.parse(last);
        win.webContents.send('snow:wins', { w: data.w.map(([id, x, y, w, h]) => [id, x - b.x, y - b.y, w, h]), f: data.f, d: data.d ? [data.d[0] - b.x, data.d[1] - b.y, data.d[2], data.d[3]] : null, g: (data.g ?? []).map(([x, y, w, h]) => [x - b.x, y - b.y, w, h]) });
      } catch {}
    });
    child.on('exit', () => { if (helper === child) helper = null; });
  }

  async function start() {
    if (win && !win.isDestroyed()) return push();
    const d = screen.getPrimaryDisplay();
    win = new BrowserWindow({
      ...d.bounds, frame: false, transparent: true, hasShadow: false, resizable: false, movable: false, focusable: false,
      skipTaskbar: true, alwaysOnTop: true, enableLargerThanScreen: true, backgroundColor: '#00000000', show: false,
      acceptFirstMouse: true, // the very first click on the snow grabs it (instead of only activating the window)
      webPreferences: { preload: path.join(HERE, 'preload.cjs'), contextIsolation: true, backgroundThrottling: false },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setIgnoreMouseEvents(true, { forward: true });
    win.loadFile(path.join(HERE, 'snow', 'snow.html'));
    win.once('ready-to-show', () => {
      win.showInactive();
      push();
      // where the Dock and the screen's bottom are (the snow gathers there)
      win.webContents.send('snow:screen', { dockTop: d.workArea.y + d.workArea.height - d.bounds.y, height: d.bounds.height });
    });
    win.on('closed', () => { win = null; stopHelper(); clearInterval(cursorTimer); cursorTimer = null; clearInterval(deskTimer); });
    // keep the snow told about the desktop (theme and widgets can change any time)
    let lastDesk = '';
    const deskTimer = setInterval(() => {
      if (!win || win.isDestroyed()) return;
      const info = JSON.stringify(deskInfo(getSettings(), d.bounds));
      if (info !== lastDesk) { lastDesk = info; win.webContents.send('snow:desk', JSON.parse(info)); }
    }, 1500);
    // the pointer, for snowmen that watch it, rolling snowballs and the shake-to-clear wind
    cursorTimer = setInterval(() => {
      if (!win || win.isDestroyed()) return;
      const p = screen.getCursorScreenPoint();
      const b = d.bounds;
      win.webContents.send('snow:cursor', { x: p.x - b.x, y: p.y - b.y });
    }, cfg().saver ? 33 : 16);
    try {
      building ??= buildHelper();
      startHelper(await building);
    } catch (e) {
      building = null;
      say?.(/xcrun|swiftc|developer tools/i.test(e.message)
        ? '❄️ It’s snowing! To make it pile up on your windows I need Apple’s developer tools: run “xcode-select --install” in Terminal.'
        : `❄️ It’s snowing, but the window helper didn’t build (${e.message.split('\n')[0].slice(0, 120)}). Send this to Claude!`, true);
    }
  }

  function stopHelper() {
    if (!helper) return;
    try { helper.stdin.end(); } catch {}
    const h = helper;
    helper = null;
    setTimeout(() => h.kill(), 500);
  }

  function stop() {
    if (win && !win.isDestroyed()) win.close();
    win = null;
    stopHelper();
  }

  // Clicks go through the overlay, except while the pointer is on snow you can grab (or you're holding a snowball).
  ipcMain.on('snow:grab', (_e, on) => win && !win.isDestroyed() && win.setIgnoreMouseEvents(!on, { forward: true }));

  const set = (patch) => {
    const before = cfg();
    applySettings({ snow: { ...before, ...patch, fx: { ...before.fx, ...(patch.fx ?? {}) } } });
    const now = cfg();
    if (now.mode === 'off') stop();
    else {
      if (before.saver !== now.saver) { stop(); }
      start();
    }
  };

  app.whenReady().then(() => cfg().mode !== 'off' && start());

  return {
    get config() { return cfg(); },
    set,
    blizzard: () => { if (cfg().mode === 'off') set({ mode: 'on' }); setTimeout(() => win?.webContents.send('snow:do', 'blizzard'), 600); },
    sleigh: () => { if (cfg().mode === 'off') set({ mode: 'on' }); setTimeout(() => win?.webContents.send('snow:do', 'sleigh'), 600); },
    wind: () => win?.webContents.send('snow:do', 'wind'),
  };
}
