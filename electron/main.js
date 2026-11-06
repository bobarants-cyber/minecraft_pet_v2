import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Menu, Notification, Tray, clipboard, globalShortcut, ipcMain, nativeImage, powerMonitor, screen, shell, systemPreferences } from 'electron';
import { MOBS, SIZES, loadSettings, saveSettings } from './settings.js';
import { ReminderStore, parseCommand, formatClock } from './reminders.js';
import { AI_MODELS, REWRITE_MODES, askAI, personaFor, rewriteText, translateText } from './ai.js';
import { Whisper } from './captions.js';
import * as opener from './opener.js';
import { ClassSchedule, LEAD_MINUTES } from './schedule.js';
import { NOTES_DIR, NotesSession } from './notes.js';
import { execFile, spawn } from 'node:child_process';

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
let classes = null;
let notes = null;
let notesTimer = null;
let writingNotes = false;
const clock = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
      label: '📅 Classes',
      submenu: [
        ...(classes?.today().length
          ? classes.today().map((c) => ({ label: `${clock(c.startAt)}  ${c.name}${c.link ? '' : '  (no link)'}`, enabled: !!c.link, click: () => openClass(c, { now: true }) }))
          : [{ label: 'No classes today', enabled: false }]),
        { type: 'separator' },
        { label: 'My classes…', click: () => command('classes') },
      ],
    },
    {
      label: `🗣 Hey ${personaFor(settings.mob).name}`,
      submenu: [
        { label: `Listen for “Hey ${personaFor(settings.mob).name}” (microphone only)`, type: 'checkbox', checked: settings.voiceOn, click: (i) => applySettings({ voiceOn: i.checked }) },
        { label: 'Speak answers out loud', type: 'checkbox', checked: settings.voiceSpeak, click: (i) => applySettings({ voiceSpeak: i.checked }) },
      ],
    },
    {
      label: notes ? `📝 Taking notes: ${notes.title}` : writingNotes ? '📝 Writing your notes…' : '📝 Notes',
      submenu: [
        notes
          ? { label: 'Stop and write my notes', click: () => stopNotes() }
          : { label: 'Take notes now', enabled: !writingNotes, click: () => startNotes({ title: 'Notes' }) },
        { label: 'Take notes automatically in class', type: 'checkbox', checked: settings.autoNotes, click: (i) => applySettings({ autoNotes: i.checked }) },
        { type: 'separator' },
        { label: 'Open my notes folder', click: () => (fs.mkdirSync(NOTES_DIR, { recursive: true }), shell.openPath(NOTES_DIR)) },
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
  if (/^(?:please\s+)?(?:start\s+)?(?:take|taking|start)\s+(?:some\s+)?notes\b/i.test(String(text).trim())) {
    if (notes) return { ok: true, kind: 'notes', text: `I’m already taking notes (${notes.title}). Say “stop notes” when you’re done.` };
    startNotes({ title: 'Notes' });
    return { ok: true, kind: 'notes', text: 'Okay! I’m listening and taking notes 📝 Say “stop notes” (or click Stop) when you’re done.' };
  }
  if (/^(?:please\s+)?(?:stop|end|finish)\s+(?:taking\s+)?(?:the\s+)?notes\b/i.test(String(text).trim())) {
    if (!notes) return { ok: true, kind: 'notes', text: 'I’m not taking notes right now. Say “take notes” to start.' };
    stopNotes();
    return { ok: true, kind: 'notes', text: 'Done! Give me a moment to write your notes ✍️' };
  }
  if (/^(?:show\s+)?(?:my\s+)?(?:classes|class schedule|schedule|timetable|calendar)\??$/i.test(String(text).trim())) {
    return { ok: true, kind: 'classes', text: 'Here’s your class calendar! 📅' };
  }
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

// Class timetable: the page edits it; here it's stored and watched, and class links open just before class.
ipcMain.handle('classes:list', () => ({ classes: classes.list(), lead: LEAD_MINUTES }));
ipcMain.handle('classes:save', (_e, cls) => {
  const res = classes.upsert(cls);
  buildTray();
  return res;
});
ipcMain.handle('classes:remove', (_e, id) => {
  classes.remove(id);
  buildTray();
  return { ok: true };
});
ipcMain.on('classes:join', (_e, id) => {
  const c = classes.today().find((x) => x.id === id) ?? classes.list().find((x) => x.id === id);
  if (c) openClass(c, { now: true });
});

/** Opens a class's link (with a heads-up from the pet first). `now` = you asked for it, so no countdown message. */
function openClass(c, { late = false, now = false } = {}) {
  if (!c.link) return;
  classes.markOpened(c);
  if (settings.autoNotes) startNotes({ title: c.name, endAt: c.endAt ?? classes.times(c, new Date()).end, auto: true });
  const text = now ? `📚 Opening ${c.name}…` : late ? `📚 ${c.name} already started. Opening it now!` : `📚 ${c.name} starts in ${LEAD_MINUTES} minutes! Opening your class…`;
  if (!now && Notification.isSupported()) new Notification({ title: `${personaFor(settings.mob).name}: class time!`, body: text.replace(/^📚\s*/, ''), silent: false }).show();
  send('classTime', { text });
  // Give the pet a moment to sit down at its desk, then open the link in your browser or Zoom.
  setTimeout(() => shell.openExternal(c.link).catch((err) => send('say', { text: `I couldn’t open the link for ${c.name}: ${err.message}`, error: true })), 2500);
}

// Class notes: the page listens (with the captions speech recogniser) and sends each line here while a session runs.
function startNotes({ title = 'Notes', endAt = null, auto = false } = {}) {
  if (notes || writingNotes) return;
  notes = new NotesSession({ title, endAt, auto });
  clearTimeout(notesTimer);
  // Stop by itself shortly after the class ends (a minute's grace for the goodbye).
  if (notes.endAt) notesTimer = setTimeout(() => stopNotes(), Math.max(10_000, notes.endAt.getTime() - Date.now() + 60_000));
  send('notes', { active: true, title, startedAt: notes.startedAt.getTime(), endAt: notes.endAt?.getTime() ?? null, auto });
  buildTray();
}

async function stopNotes() {
  if (!notes) return;
  const session = notes;
  notes = null;
  clearTimeout(notesTimer);
  writingNotes = true;
  send('notes', { active: false, writing: true, title: session.title });
  buildTray();
  try {
    const r = await session.finish({ model: settings.aiModel });
    send('notesDone', { title: session.title, file: r.file, notes: r.notes, ok: r.notesOk, lines: r.lines });
    if (Notification.isSupported()) {
      new Notification({ title: `${personaFor(settings.mob).name}: your notes are ready 📝`, body: `${session.title}: saved in Documents → Bbokari Notes` }).show();
    }
  } catch (err) {
    send('say', { text: `I couldn’t save your notes: ${err.message}`, error: true });
  } finally {
    writingNotes = false;
    send('notes', { active: false, writing: false });
    buildTray();
  }
}

// Speaking answers out loud with the Mac's own free voice (`say`), one answer at a time.
let speaker = null;
ipcMain.on('voice:speak', (_e, text) => {
  if (process.platform !== 'darwin') return;
  speaker?.kill();
  const clean = String(text ?? '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/[*_#`]/g, '')
    .trim()
    .slice(0, 1200);
  if (!clean) return;
  const proc = spawn('say', [clean], { stdio: 'ignore' });
  speaker = proc;
  send('speaking', { on: true });
  proc.on('exit', () => {
    if (speaker === proc) speaker = null;
    send('speaking', { on: false });
  });
});

ipcMain.on('notes:add', (_e, line) => notes?.add(line));
ipcMain.on('notes:start', () => startNotes({ title: 'Notes' }));
ipcMain.on('notes:stop', () => stopNotes());
ipcMain.on('notes:open', (_e, file) => {
  const f = String(file ?? '');
  if (!f.startsWith(NOTES_DIR + path.sep) || !fs.existsSync(f)) return;
  execFile('open', ['-a', 'TextEdit', f], (err) => err && shell.openPath(f));
});

function checkClasses() {
  if (!classes) return;
  for (const c of classes.due()) openClass(c, { late: c.late });
}

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
ipcMain.handle('captions:transcribe', async (_e, { wav, target = 'english', prompt }) => {
  try {
    const heard = await whisper.transcribe(Buffer.from(wav), { prompt });
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
  classes = new ClassSchedule({ file: path.join(app.getPath('userData'), 'classes.json') });
  buildTray();
  setInterval(checkClasses, 15_000);
  // After the Mac wakes up, check straight away (you might be in the middle of a class).
  powerMonitor.on('resume', () => setTimeout(checkClasses, 4000));
  powerMonitor.on('unlock-screen', () => setTimeout(checkClasses, 2000));
  // The tray's "today" list changes at midnight.
  setInterval(buildTray, 10 * 60_000);
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
