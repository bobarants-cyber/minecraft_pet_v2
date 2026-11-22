// 🏠 Bbokari's home screen, its editor and the screen savers.
//  • The home screen sits on the desktop, behind your icons and windows: wallpaper + Liquid Glass widgets.
//  • ⌃⌥H (or "home" in the chat / the menu) brings it to the front like an iPhone home screen, where everything is
//    clickable and ✏️ Edit lets you drag, resize, add and remove widgets, pick a wallpaper or your own photos, and
//    tune the glass with the same sliders as Liquid Glass Studio.
//  • Screen savers start after you've been idle for a while (or from the menu), and stop when you move.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { app, BrowserWindow, dialog, ipcMain, nativeImage, powerMonitor, screen, shell } from 'electron';

import { THEMES } from './home/themes.js';

const HERE = path.dirname(new URL(import.meta.url).pathname);
export { THEMES };
const PAGE = path.join(HERE, 'home', 'home.html');
const SAVER = path.join(HERE, 'home', 'saver.html');

export const SAVERS = [
  ['bubbles', '🫧 Liquid glass bubbles'],
  ['lava', '🌋 Glass lava lamp'],
  ['aurora', '🌌 Aurora'],
  ['warp', '🚀 Starfield warp'],
  ['matrix', '💻 Hacker rain'],
  ['photos', '🖼 My photos'],
  ['clock', '🕰 Big clock'],
  ['bounce', '📺 Bouncing pet'],
  ['fireflies', '✨ Fireflies'],
];

export const HOME_DEFAULTS = {
  on: false, // show it on the desktop
  wallpaper: { type: 'gradient', value: 'dawn' },
  glass: {},
  textDark: false,
  widgets: [
    { id: 'w1', type: 'clock', x: 0.04, y: 0.06, w: 340, h: 170 },
    { id: 'w2', type: 'classes', x: 0.04, y: 0.29, w: 340, h: 230 },
    { id: 'w3', type: 'weather', x: 0.30, y: 0.06, w: 200, h: 170 },
    { id: 'w4', type: 'todos', x: 0.30, y: 0.29, w: 260, h: 230 },
    { id: 'w5', type: 'music', x: 0.04, y: 0.6, w: 340, h: 120 },
    { id: 'w6', type: 'calendar', x: 0.78, y: 0.06, w: 260, h: 250 },
    { id: 'w7', type: 'apps', x: 0.30, y: 0.6, w: 380, h: 120 },
  ],
  saver: { on: true, after: 5, kind: 'bubbles' },
};

const run = (cmd, args, timeout = 6000) =>
  new Promise((resolve) => execFile(cmd, args, { timeout }, (err, out) => resolve(err ? '' : String(out).trim())));

/** The apps you have open, with their icons (cached per app). */
const iconCache = new Map();
// An app's icon as a small PNG, read straight from its .icns with macOS's `sips` (in its own process).
// (Electron's app.getFileIcon crashed the whole app on macOS, so it isn't used.)
async function appIcon(appPath) {
  if (iconCache.has(appPath)) return iconCache.get(appPath);
  iconCache.set(appPath, ''); // only try once per app
  try {
    if (!/\.app$/.test(appPath) || !fs.existsSync(appPath)) return '';
    let name = await run('/usr/bin/plutil', ['-extract', 'CFBundleIconFile', 'raw', '-o', '-', path.join(appPath, 'Contents', 'Info.plist')], 3000);
    if (!name) return '';
    if (!/\.icns$/i.test(name)) name += '.icns';
    const icns = path.join(appPath, 'Contents', 'Resources', name);
    if (!fs.existsSync(icns)) return '';
    const dir = path.join(app.getPath('userData'), 'app-icons');
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, path.basename(appPath, '.app').replace(/[^\w-]/g, '_') + '.png');
    if (!fs.existsSync(out)) await run('/usr/bin/sips', ['-s', 'format', 'png', '-Z', '64', icns, '--out', out], 8000);
    if (!fs.existsSync(out)) return '';
    const url = 'data:image/png;base64,' + fs.readFileSync(out).toString('base64');
    iconCache.set(appPath, url);
    return url;
  } catch {
    return '';
  }
}

async function openApps() {
  if (process.platform !== 'darwin') return [];
  // one app per line: name<TAB>path (names can contain commas, so no comma lists)
  const script = 'set out to ""\ntell application "System Events"\nrepeat with p in (every application process whose background only is false)\ntry\nset out to out & (name of p) & tab & (POSIX path of (application file of p)) & linefeed\nend try\nend repeat\nend tell\nreturn out';
  const text = await run('osascript', ['-e', script]);
  const list = [];
  for (const line of text.split('\n')) {
    const [name, appPath] = line.split('\t');
    if (!name || /^(Electron|Bbokari|faceaway)$/i.test(name)) continue;
    list.push({ name, path: appPath ?? '', icon: appPath ? await appIcon(appPath.replace(/\/$/, '')) : '' });
    if (list.length >= 14) break;
  }
  return list;
}

export function createHomeScreen({ getSettings, applySettings, data, say }) {
  let desk = null; // on the desktop, behind everything
  let front = null; // brought to the front (⌃⌥H), where you can click and edit
  let saver = null;

  const home = () => ({ ...HOME_DEFAULTS, ...(getSettings().home ?? {}), saver: { ...HOME_DEFAULTS.saver, ...(getSettings().home?.saver ?? {}) } });
  const save = (patch) => {
    applySettings({ home: { ...home(), ...patch } });
    for (const w of [desk, front]) if (w && !w.isDestroyed()) w.webContents.send('home:config', home());
  };
  const bounds = () => screen.getPrimaryDisplay().bounds;
  const prefs = { preload: path.join(HERE, 'preload.cjs'), contextIsolation: true, backgroundThrottling: true };

  /** The photo for a photo theme (e.g. the Snowy cabin): asks you to pick it the first time, then keeps a copy. */
  async function themePhoto(key) {
    const builtIn = path.join(HERE, 'home', 'assets', `snowy-${key}.jpg`); // the photo ships with Bbokari
    if (fs.existsSync(builtIn)) return builtIn;
    const keep = path.join(app.getPath('userData'), 'home-photos', `theme-${key}.jpg`);
    if (fs.existsSync(keep)) return keep;
    // already saved from the chat into Downloads (or the Desktop)? use it without asking
    const home = app.getPath('home');
    const found = [path.join(app.getPath('downloads'), `snowy-${key}.jpg`), path.join(home, 'Desktop', `snowy-${key}.jpg`), path.join(app.getPath('downloads'), `snowy-${key} (1).jpg`)].find((f) => fs.existsSync(f));
    if (found) {
      fs.mkdirSync(path.dirname(keep), { recursive: true });
      fs.writeFileSync(keep, nativeImage.createFromPath(found).toJPEG(95));
      return keep;
    }
    const r = await dialog.showOpenDialog({
      title: 'Choose the snowy cabin photo (snowy-cabin.jpg)', message: 'Pick the snowy cabin photo Claude sent you (snowy-cabin.jpg).',
      properties: ['openFile'], filters: [{ name: 'Photos', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    fs.mkdirSync(path.dirname(keep), { recursive: true });
    fs.writeFileSync(keep, nativeImage.createFromPath(r.filePaths[0]).toJPEG(95));
    return keep;
  }

  // If a home screen page crashes (e.g. the graphics chip resets), reload it with simple CSS glass instead.
  let cssOnly = false;
  function guard(w, mode) {
    w.webContents.on('render-process-gone', (_e, d) => {
      console.log(`Home screen (${mode}) crashed: ${d.reason}. Reloading with simple glass.`);
      cssOnly = true;
      if (!w.isDestroyed()) w.loadFile(PAGE, { query: { mode, css: '1' } });
    });
  }

  function showDesk() {
    if (desk && !desk.isDestroyed()) return desk.showInactive();
    const b = bounds();
    desk = new BrowserWindow({
      ...b, type: process.platform === 'darwin' ? 'desktop' : undefined, frame: false, hasShadow: false, resizable: false, movable: false,
      skipTaskbar: true, focusable: false, enableLargerThanScreen: true, backgroundColor: '#1d2440', show: false, webPreferences: prefs,
    });
    desk.setVisibleOnAllWorkspaces(true);
    desk.loadFile(PAGE, { query: { mode: 'desk', ...(cssOnly ? { css: '1' } : {}) } });
    desk.once('ready-to-show', () => desk.showInactive());
    desk.on('closed', () => (desk = null));
    guard(desk, 'desk');
  }
  function hideDesk() {
    if (desk && !desk.isDestroyed()) desk.close();
    desk = null;
  }

  /** The home screen in front of everything (press ⌃⌥H or Esc again to send it back). */
  function openFront({ edit = false } = {}) {
    if (front && !front.isDestroyed()) {
      front.show(); front.focus();
      if (edit) front.webContents.send('home:edit', true);
      return;
    }
    const b = bounds();
    front = new BrowserWindow({
      ...b, frame: false, transparent: true, hasShadow: false, resizable: false, movable: false, fullscreenable: false,
      skipTaskbar: true, alwaysOnTop: true, backgroundColor: '#00000000', show: false, webPreferences: prefs,
    });
    front.setAlwaysOnTop(true, 'floating');
    front.setVisibleOnAllWorkspaces(true);
    front.loadFile(PAGE, { query: { mode: 'front', edit: edit ? '1' : '', ...(cssOnly ? { css: '1' } : {}) } });
    front.once('ready-to-show', () => { front.show(); front.focus(); });
    front.on('closed', () => (front = null));
    guard(front, 'front');
  }
  const closeFront = () => { if (front && !front.isDestroyed()) front.webContents.send('home:leave'); };
  const toggleFront = () => (front && !front.isDestroyed() ? closeFront() : openFront());

  function startSaver(kind) {
    if (saver && !saver.isDestroyed()) return;
    const b = bounds();
    saver = new BrowserWindow({
      ...b, frame: false, hasShadow: false, resizable: false, movable: false, skipTaskbar: true, alwaysOnTop: true,
      backgroundColor: '#000000', show: false, webPreferences: prefs,
    });
    saver.setAlwaysOnTop(true, 'screen-saver');
    saver.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    saver.loadFile(SAVER, { query: { kind: kind || home().saver.kind } });
    saver.once('ready-to-show', () => { saver.show(); saver.focus(); });
    saver.on('closed', () => (saver = null));
  }
  const stopSaver = () => { if (saver && !saver.isDestroyed()) saver.close(); saver = null; };

  // The screen saver starts on its own after you've been idle (not while something is playing full screen).
  setInterval(() => {
    const s = home().saver;
    if (!s.on || saver || !(s.after > 0)) return;
    if (powerMonitor.getSystemIdleTime() < s.after * 60 || powerMonitor.getSystemIdleState(s.after * 60) !== 'idle') return;
    // not while a video is playing (it keeps the display awake)
    run('pmset', ['-g', 'assertions']).then((out) => {
      if (/PreventUserIdleDisplaySleep\s+1/.test(out)) return;
      startSaver();
    });
  }, 15_000);
  powerMonitor.on('lock-screen', stopSaver);

  // ---------- what the pages ask for ----------
  ipcMain.handle('home:get', () => ({ config: home(), name: data.petName?.() ?? 'Bbokari' }));
  ipcMain.handle('home:save', (_e, patch) => { save(patch); return home(); });
  ipcMain.handle('home:data', async (_e, kind) => {
    try {
      if (kind === 'apps') return await openApps();
      return (await data[kind]?.()) ?? null;
    } catch (e) {
      return { error: e.message };
    }
  });
  ipcMain.handle('home:action', async (_e, { kind, arg } = {}) => {
    switch (kind) {
      case 'openApp': return run('open', ['-a', String(arg)]);
      case 'openLink': return /^https?:\/\//.test(String(arg)) ? shell.openExternal(String(arg)) : null;
      case 'edit': return openFront({ edit: true });
      case 'leave': if (front && !front.isDestroyed()) front.close(); return null;
      case 'saver': return startSaver(arg);
      default: return data.action?.(kind, arg);
    }
  });
  /** Pick photos (for the wallpaper, a photo widget or the photo screen saver): copied next to the settings. */
  ipcMain.handle('home:pickPhotos', async (_e, { multiple = true } = {}) => {
    const r = await dialog.showOpenDialog(front && !front.isDestroyed() ? front : undefined, {
      title: 'Choose photos', properties: ['openFile', ...(multiple ? ['multiSelections'] : [])],
      filters: [{ name: 'Photos', extensions: ['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif'] }],
    });
    if (r.canceled) return [];
    const dir = path.join(app.getPath('userData'), 'home-photos');
    fs.mkdirSync(dir, { recursive: true });
    const out = [];
    for (const f of r.filePaths.slice(0, 40)) {
      let dest = path.join(dir, `${Date.now().toString(36)}-${path.basename(f).replace(/[^\w.-]/g, '_')}`);
      try {
        if (/\.heic$/i.test(f)) { // the page can't show HEIC: turn it into a JPEG
          dest = dest.replace(/\.heic$/i, '.jpg');
          fs.writeFileSync(dest, nativeImage.createFromPath(f).toJPEG(90));
        } else fs.copyFileSync(f, dest);
        out.push(dest);
      } catch {}
    }
    return out;
  });
  ipcMain.on('saver:stop', stopSaver);

  // the pointer, for the live wallpaper (trees part where you move the cursor through them)
  setInterval(() => {
    const wp = home().wallpaper;
    if (wp?.type !== 'live') return;
    const p = screen.getCursorScreenPoint(), b = bounds();
    for (const w of [desk, front]) if (w && !w.isDestroyed()) w.webContents.send('home:cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 33);

  if (home().on) app.whenReady().then(showDesk);

  return {
    toggleFront,
    openFront,
    edit: () => openFront({ edit: true }),
    startSaver,
    stopSaver,
    get on() { return home().on; },
    setOn(on) { save({ on }); on ? showDesk() : hideDesk(); },
    setSaver(patch) { save({ saver: { ...home().saver, ...patch } }); },
    get saver() { return home().saver; },
    get theme() { return home().theme ?? null; },
    /** Picks a theme (wallpaper + glass + text) and shows the home screen. */
    async setTheme(name) {
      const t = THEMES[name];
      if (!t) return false;
      let wallpaper = t.wallpaper;
      if (t.photo) { // a photo theme: the photo lives next to the settings (picked once)
        const src = await themePhoto(t.photo);
        if (!src) return false;
        wallpaper = { ...t.wallpaper, src };
      }
      save({ theme: name, wallpaper, glass: { ...t.glass }, textDark: t.textDark });
      data.action?.('theme', name);
      // the theme goes on your real desktop (behind your windows), not in a window on top
      if (!home().on) { save({ on: true }); showDesk(); }
      return true;
    },
  };
}
