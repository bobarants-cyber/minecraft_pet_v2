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

const HERE = path.dirname(new URL(import.meta.url).pathname);
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
async function openApps() {
  if (process.platform !== 'darwin') return [];
  const out = await run('osascript', ['-e', 'tell application "System Events" to get {name, POSIX path of application file} of (every application process whose background only is false)']);
  if (!out) return [];
  // "Finder, Safari, …, /System/…/Finder.app, /Applications/Safari.app, …"
  const parts = out.split(', ');
  const half = Math.floor(parts.length / 2);
  const names = parts.slice(0, half);
  const paths = parts.slice(half);
  const list = [];
  for (let i = 0; i < names.length; i++) {
    const p = paths[i];
    if (!names[i] || /^(Electron|Bbokari|faceaway)$/i.test(names[i])) continue;
    let icon = iconCache.get(p);
    if (icon === undefined) {
      icon = await app.getFileIcon(p, { size: 'large' }).then((img) => img.toDataURL()).catch(() => '');
      iconCache.set(p, icon);
    }
    list.push({ name: names[i], path: p, icon });
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

  function showDesk() {
    if (desk && !desk.isDestroyed()) return desk.showInactive();
    const b = bounds();
    desk = new BrowserWindow({
      ...b, type: process.platform === 'darwin' ? 'desktop' : undefined, frame: false, hasShadow: false, resizable: false, movable: false,
      skipTaskbar: true, focusable: false, enableLargerThanScreen: true, backgroundColor: '#1d2440', show: false, webPreferences: prefs,
    });
    desk.setVisibleOnAllWorkspaces(true);
    desk.loadFile(PAGE, { query: { mode: 'desk' } });
    desk.once('ready-to-show', () => desk.showInactive());
    desk.on('closed', () => (desk = null));
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
    front.loadFile(PAGE, { query: { mode: 'front', edit: edit ? '1' : '' } });
    front.once('ready-to-show', () => { front.show(); front.focus(); });
    front.on('closed', () => (front = null));
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
  };
}
