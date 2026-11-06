import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Menu, Notification, Tray, clipboard, globalShortcut, ipcMain, nativeImage, powerMonitor, screen, systemPreferences } from 'electron';
import { MOBS, SIZES, loadSettings, saveSettings } from './settings.js';
import { ReminderStore, parseCommand, formatClock } from './reminders.js';
import { AI_MODELS, REWRITE_MODES, askAI, personaFor, rewriteText, translateText } from './ai.js';
import { Whisper } from './captions.js';
import * as opener from './opener.js';

/** Shortcuts in the Open menus: label → what to type. */
const QUICK_OPEN = [['YouTube', 'youtube'], ['Google', 'google'], ['Google Meet', 'google meet'], ['Zoom', 'zoom'], ['Notes', 'notes']];
import { CAPTION_LANGUAGES } from './settings.js';
import * as selection from './selection.js';

/** Keyboard shortcuts for the highlighted-text commands (⌃⌥S, ⌃⌥H, ⌃⌥B). */
const REWRITE_KEYS = { summarize: 'Control+Alt+S', humanize: 'Control+Alt+H', improve: 'Control+Alt+B' };
const MAX_REWRITE_CHARS = 6000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const STRIP_HEIGHT_RATIO = 2.6;
const IDLE_POLL_MS = 15_000;
const ASLEEP = new Set(['sleep', 'sleepy']);

const settings = loadSettings();
let win = null;
let tray = null;
let beeState = 'boot';
let idleSleeping = false;
let expanded = false;
let chatOpen = false;
let reminders = null;
let rewriting = false;
const whisper = new Whisper(path.join(__dirname, '..'));
const targetApp = new selection.TargetApp();

if (!app.requestSingleInstanceLock()) {
  console.log('Minecraft Mob is already running (check the menu bar). Quitting this copy.');
  app.quit();
}

// A short strip along the bottom normally; the full work area while the bee is being carried or falling.
function stripBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  const height = expanded || chatOpen ? workArea.height : Math.min(workArea.height, Math.round(settings.petSize * STRIP_HEIGHT_RATIO));
  return { x: workArea.x, y: workArea.y + workArea.height - height, width: workArea.width, height };
}

function createWindow() {
  win = new BrowserWindow({
    ...stripBounds(),
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    acceptFirstMouse: true,
    hiddenInMissionControl: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => (win = null));

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

const send = (channel, payload) => win?.webContents.send(channel, payload);
const command = (type, extra = {}) => send('command', { type, ...extra });

function applySettings(patch) {
  const prevSize = settings.petSize;
  Object.assign(settings, patch);
  saveSettings(settings);
  if (settings.petSize !== prevSize) win?.setBounds(stripBounds());
  if ('openAtLogin' in patch) app.setLoginItemSettings({ openAtLogin: settings.openAtLogin });
  send('settings', settings);
  buildTray();
}

function buildTray() {
  if (!tray) {
    const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'trayTemplate.png'));
    icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip('Minecraft Mob');
  }
  const asleep = ASLEEP.has(beeState);
  const radio = (label, key, value) => ({ label, type: 'radio', checked: settings[key] === value, click: () => applySettings({ [key]: value }) });

  const pending = reminders?.items ?? [];
  const reminderItems = pending.length
    ? [
        ...pending.slice(0, 10).map((r) => ({
          label: `${formatClock(r.at)}  ${r.kind === 'timer' ? 'Timer' : r.label ?? 'Reminder'}  ✕`,
          toolTip: 'Click to cancel',
          click: () => reminders.cancelId(r.id),
        })),
        { type: 'separator' },
        { label: 'Cancel all', click: () => reminders.cancel() },
      ]
    : [{ label: 'None yet. Try “remind me in 10 minutes to stretch” in the chat.', enabled: false }];

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Chat with ${personaFor(settings.mob).name}…`, click: () => command('chat') },
    { label: `Reminders & timers${pending.length ? ` (${pending.length})` : ''}`, submenu: reminderItems },
    {
      label: '🎮 Games',
      enabled: !asleep,
      submenu: [
        ...[
          ['pingpong', '🏓 Ping pong'],
          ['tictactoe', '⭕ Tic-tac-toe'],
          ['rps', '✊ Rock paper scissors'],
          ['cups', '🥤 Cups'],
          ['bubbles', '🫧 Bubbles'],
        ].map(([name, label]) => ({ label, click: () => command('game', { name }) })),
        { type: 'separator' },
        { label: 'Stop the game', click: () => command('game', { name: 'stop' }) },
      ],
    },
    {
      label: '🚀 Open',
      submenu: [
        ...QUICK_OPEN.map(([label, what]) => ({ label, click: () => openThing(what) })),
        { type: 'separator' },
        { label: 'Something else… (say “open …” in the chat)', click: () => command('chat', { prefill: 'open ' }) },
      ],
    },
    {
      label: '🎙 Live captions',
      submenu: [
        { label: 'Show captions', type: 'checkbox', checked: settings.captionsOn, click: (i) => applySettings({ captionsOn: i.checked }) },
        { type: 'separator' },
        { label: '🎤 My microphone', type: 'checkbox', checked: settings.captionsMic, click: (i) => applySettings({ captionsMic: i.checked }) },
        { label: '💻 Computer sound (needs BlackHole)', type: 'checkbox', checked: settings.captionsComputer, click: (i) => applySettings({ captionsComputer: i.checked }) },
        { type: 'separator' },
        {
          label: 'Translate into',
          submenu: Object.entries(CAPTION_LANGUAGES).map(([key, label]) => radio(label, 'captionsLang', key)),
        },
      ],
    },
    {
      label: '✏️ Highlighted text',
      submenu: [
        { label: 'Highlight text in any app, then:', enabled: false },
        ...Object.entries(REWRITE_MODES).map(([mode, m]) => ({ label: m.label, accelerator: REWRITE_KEYS[mode], click: () => rewriteSelection(mode) })),
      ],
    },
    { type: 'separator' },
    { label: asleep ? 'Wake up' : 'Go to sleep', click: () => command('trigger', { name: asleep ? 'wake' : 'sleepy' }) },
    { label: 'Dance', click: () => command('trigger', { name: 'dance' }), enabled: !asleep },
    { label: 'Wave', click: () => command('trigger', { name: 'wave' }), enabled: !asleep },
    { type: 'separator' },
    { label: 'Wanders around', type: 'checkbox', checked: settings.autoWalk, click: (i) => applySettings({ autoWalk: i.checked }) },
    {
      label: 'Mob',
      submenu: Object.entries(MOBS).map(([key, label]) => radio(label, 'mob', key)),
    },
    {
      label: 'Size',
      submenu: Object.entries(SIZES).map(([name, px]) => radio(name[0].toUpperCase() + name.slice(1), 'petSize', px)),
    },
    {
      label: 'Sleep when idle',
      submenu: [radio('Never', 'idleSleepMin', 0), radio('After 2 min', 'idleSleepMin', 2), radio('After 5 min', 'idleSleepMin', 5), radio('After 15 min', 'idleSleepMin', 15)],
    },
    {
      label: 'AI brain',
      submenu: Object.entries(AI_MODELS).map(([key, label]) => radio(label, 'aiModel', key)),
    },
    { label: 'Open at login', type: 'checkbox', checked: settings.openAtLogin, click: (i) => applySettings({ openAtLogin: i.checked }) },
    { type: 'separator' },
    { label: 'Quit Minecraft Mob', role: 'quit' },
  ]));
}

function pollIdle() {
  const idle = powerMonitor.getSystemIdleTime();
  const limit = settings.idleSleepMin * 60;
  if (limit > 0 && !idleSleeping && idle >= limit) {
    idleSleeping = true;
    if (!ASLEEP.has(beeState)) command('trigger', { name: 'sleepy' });
  } else if (idleSleeping && idle < IDLE_POLL_MS / 1000) {
    idleSleeping = false;
    if (ASLEEP.has(beeState)) command('trigger', { name: 'wake', surprised: true });
  }
}

ipcMain.handle('settings:get', () => settings);
ipcMain.on('settings:set', (_e, patch) => applySettings(patch));
ipcMain.on('pointer:over', (_e, over) => {
  win?.setIgnoreMouseEvents(!over, { forward: true });
  // Note which app you were using before reaching for the pet, so text commands go back to it.
  if (over && !rewriting) targetApp.refresh();
});
ipcMain.on('window:expand', (_e, on) => {
  if (on === expanded) return;
  expanded = on;
  win?.setBounds(stripBounds());
});
// The pet window normally never takes keyboard focus; it does while the chat bubble is open so you can type.
ipcMain.on('chat:focus', (_e, on) => {
  if (!win || on === chatOpen) return;
  chatOpen = on;
  win.setBounds(stripBounds());
  win.setFocusable(on);
  if (on) {
    app.focus({ steal: true });
    win.focus();
  } else {
    win.blur();
  }
});

ipcMain.handle('assistant:ask', async (_e, { text = '', history = [], mob = settings.mob } = {}) => {
  const cmd = parseCommand(String(text));
  if (cmd) return { ok: true, kind: 'reminder', text: reminders.handle(cmd) };
  const target = opener.parseOpen(text);
  if (target) {
    if (!selection.hasPermission(true)) return { ok: false, kind: 'open', text: selection.explain('not allowed') };
    setTimeout(() => openThing(target), 400);
    return { ok: true, kind: 'open', text: `On it! I’ll type “${target.text}” ${target.kind === 'web' ? 'in a new tab' : 'in Spotlight'} for you 🐥` };
  }
  const res = await askAI({ history, mob, model: settings.aiModel, remindersSummary: reminders.describeAll() });
  return { ...res, kind: 'ai' };
});

/** Grab the highlighted text from the app you're in, rewrite it with the local AI, and show it in the bubble. */
async function rewriteSelection(mode) {
  const m = REWRITE_MODES[mode];
  if (!m || rewriting) return;
  if (!selection.supported) return send('rewrite', { stage: 'error', mode, text: 'This only works on a Mac for now.' });
  if (!selection.hasPermission(true)) {
    return send('rewrite', { stage: 'error', mode, text: selection.explain('not allowed') });
  }
  rewriting = true;
  try {
    send('rewrite', { stage: 'working', mode, text: `${m.title.split(' ')[0]} Reading your highlighted text…` });
    let text;
    try {
      text = (await selection.copySelection(targetApp)).trim();
    } catch (err) {
      return send('rewrite', { stage: 'error', mode, text: selection.explain(err) });
    }
    if (!text) {
      return send('rewrite', { stage: 'error', mode, text: 'I couldn’t find any highlighted text. Highlight some words first, then pick the command again!' });
    }
    if (text.length > MAX_REWRITE_CHARS) {
      return send('rewrite', { stage: 'error', mode, text: `That’s a lot of text! Try highlighting less than ${MAX_REWRITE_CHARS} characters at a time.` });
    }
    send('rewrite', { stage: 'working', mode, text: `${m.title.split(' ')[0]} Working on it…` });
    const res = await rewriteText({ mode, text, model: settings.aiModel });
    send('rewrite', res.ok ? { stage: 'done', mode, title: m.title, original: text, text: res.text } : { stage: 'error', mode, text: res.text });
  } finally {
    rewriting = false;
  }
}

ipcMain.on('rewrite:run', (_e, mode) => rewriteSelection(mode));
ipcMain.on('open:run', (_e, what) => openThing(what));

/** Open a website or app by having the pet type it (see opener.js), with the typing animation while it does. */
let opening = false;
async function openThing(what) {
  const target = typeof what === 'string' ? opener.resolve(what) : what;
  if (!target || opening) return;
  if (!selection.supported) return send('say', { text: 'Opening things only works on a Mac for now.', error: true });
  if (!selection.hasPermission(true)) return send('say', { text: selection.explain('not allowed'), error: true });
  opening = true;
  send('typing', { on: true });
  try {
    await opener.openByTyping(target);
    send('say', { text: `Ta-da! I opened ${target.label} 🐥` });
  } catch (err) {
    send('say', { text: selection.explain(err), error: true });
  } finally {
    send('typing', { on: false });
    opening = false;
  }
}

// Live captions: the page records and cuts speech into clips; here they're turned into text (and translated).
ipcMain.handle('captions:status', async () => {
  const s = whisper.status();
  const mic = process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('microphone') : 'granted';
  return { ...s, mic };
});
ipcMain.handle('captions:askMic', async () => (process.platform === 'darwin' ? systemPreferences.askForMediaAccess('microphone') : true));
ipcMain.handle('captions:transcribe', async (_e, { wav, target = 'english' }) => {
  try {
    const heard = await whisper.transcribe(Buffer.from(wav));
    let translation = null;
    const lang = heard.language;
    if (heard.text && lang && lang !== target) {
      if (target === 'english') translation = (await whisper.transcribe(Buffer.from(wav), { translate: true })).text || null;
      else translation = await translateText({ text: heard.text, from: cap(lang), to: cap(target), model: settings.aiModel });
    }
    return { ok: true, text: heard.text, language: lang, translation };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
});
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
ipcMain.on('rewrite:copy', (_e, text) => clipboard.writeText(String(text)));
ipcMain.handle('rewrite:replace', async (_e, text) => {
  try {
    await selection.pasteText(targetApp, String(text));
    return { ok: true };
  } catch (err) {
    clipboard.writeText(String(text));
    return { ok: false, text: `${selection.explain(err)} (I copied it for you instead, so you can paste it with ⌘V.)` };
  }
});

function fireReminder(r, text) {
  const name = personaFor(settings.mob).name;
  if (Notification.isSupported()) {
    new Notification({ title: `${name} says…`, body: text.replace(/^⏰\s*/, ''), silent: false }).show();
  }
  send('reminder', { text, kind: r.kind });
}

ipcMain.on('state', (_e, name) => {
  if (ASLEEP.has(name) !== ASLEEP.has(beeState)) {
    beeState = name;
    buildTray();
  } else beeState = name;
});

app.whenReady().then(() => {
  app.dock?.hide();
  createWindow();
  reminders = new ReminderStore({
    file: path.join(app.getPath('userData'), 'reminders.json'),
    onFire: fireReminder,
    onChange: () => buildTray(),
  });
  buildTray();
  // Start once the page can hear us, so reminders that came due while the app was closed still pop up.
  win.webContents.once('did-finish-load', () => setTimeout(() => reminders.start(), 3000));
  setInterval(pollIdle, IDLE_POLL_MS);
  for (const [mode, key] of Object.entries(REWRITE_KEYS)) {
    if (!globalShortcut.register(key, () => rewriteSelection(mode))) console.log(`Shortcut ${key} is taken by another app.`);
  }
  screen.on('display-metrics-changed', () => win?.setBounds(stripBounds()));
  screen.on('display-added', () => win?.setBounds(stripBounds()));
  screen.on('display-removed', () => win?.setBounds(stripBounds()));
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  whisper.stop();
});
app.on('second-instance', () => win?.showInactive());
