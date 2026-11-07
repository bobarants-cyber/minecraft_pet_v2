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
import { ActivityWatcher } from './activity.js';
import { Skills } from './skills.js';
import { AudioSwitcher } from './audioSwitch.js';
import * as proofread from './proofread.js';
import { classify } from './activity.js';
import { execFile, spawn } from 'node:child_process';

/** Shortcuts in the Open menus: label → what to type. */
const QUICK_OPEN = [['YouTube', 'youtube'], ['Google', 'google'], ['Google Meet', 'google meet'], ['Zoom', 'zoom'], ['Notes', 'notes']];
import { CAPTION_LANGUAGES } from './settings.js';
import * as selection from './selection.js';
import * as actions from './actions.js';

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
let skills = null;
const proof = { last: 0, lastHash: '', busy: false };
const PROOF_EVERY_MS = 90_000;
const audioSwitch = new AudioSwitcher({
  onProblem: (text) => send('say', { text }),
  getNormal: () => settings.normalOutput || null,
  setNormal: (name) => {
    if (name !== settings.normalOutput) {
      settings.normalOutput = name;
      saveSettings(settings);
    }
  },
});
let focus = null; // { endAt, minutes, timer }
let activity = null; // what you're doing right now (video, writing, …) or null
let activeMs = 0; // computer time since your last real break, for stretch reminders
let lateNightTold = '';
const BREAK_AFTER_MS = 50 * 60_000;
const BREAK_IDLE_S = 5 * 60;
const watcher = new ActivityWatcher({
  onChange: (kind) => {
    activity = kind;
    send('activity', { kind });
  },
});
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
  if ('reactToActivity' in patch) syncActivity();
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

  // While hidden, a little 📝 in the menu bar shows that it's still taking notes.
  if (process.platform === 'darwin') tray.setTitle(settings.hidden ? (notes ? ' 📝' : ' 🙈') : '');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: settings.hidden ? `🙉 Show ${personaFor(settings.mob).name}` : `🙈 Hide ${personaFor(settings.mob).name} (keeps working)`, accelerator: 'Control+Alt+P', click: () => applySettings({ hidden: !settings.hidden }) },
    { label: `Chat with ${personaFor(settings.mob).name}…`, click: () => command('chat') },
    { label: '🔍 Check my writing now', click: () => checkWritingNow() },
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
      label: focus ? `🍅 Focus: ${Math.max(0, Math.ceil((focus.endAt - Date.now()) / 60_000))} min left` : '🍅 Focus timer',
      submenu: focus
        ? [{ label: 'Stop focus timer', click: () => stopFocus(false) }]
        : [15, 25, 50].map((m) => ({ label: `${m} minutes`, click: () => (startFocus(m), send('say', { text: `🍅 Focus time! ${m} minutes. Let’s go! 💪` })) })),
    },
    {
      label: `✅ To-do list${skills?.todos.list().length ? ` (${skills.todos.list().length})` : ''}`,
      submenu: skills?.todos.list().length
        ? [
            ...skills.todos.list().map((x, i) => ({ label: `☐  ${x.text}`, toolTip: 'Click to tick it off', click: () => tickTodo(i) })),
            { type: 'separator' },
            { label: 'Add with “add … to my list” in the chat', enabled: false },
          ]
        : [{ label: 'Empty! Say “add … to my list” in the chat', enabled: false }],
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
        { label: '🔊 Switch to Multi-Output Device automatically', type: 'checkbox', checked: settings.autoSwitchAudio, click: (i) => applySettings({ autoSwitchAudio: i.checked }) },
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
    {
      label: '🐥 Do something',
      submenu: [
        { label: asleep ? 'Wake up' : 'Go to sleep', click: () => command('trigger', { name: asleep ? 'wake' : 'sleepy' }) },
        { label: 'Dance', click: () => command('trigger', { name: 'dance' }), enabled: !asleep },
        { label: 'Wave', click: () => command('trigger', { name: 'wave' }), enabled: !asleep },
      ],
    },
    { type: 'separator' },
    // All the on/off settings in one place, so the menu stays short enough to fit on a laptop screen.
    {
      label: '⚙️ Settings',
      submenu: [
        { label: '🔍 Spot mistakes while I write or code', type: 'checkbox', checked: settings.checkWriting, click: (i) => applySettings({ checkWriting: i.checked }) },
        { label: '👀 React to what I’m doing', type: 'checkbox', checked: settings.reactToActivity, click: (i) => applySettings({ reactToActivity: i.checked }) },
        { label: '⏰ Stretch break reminders', type: 'checkbox', checked: settings.breakReminders, click: (i) => applySettings({ breakReminders: i.checked }) },
        { label: 'Wanders around', type: 'checkbox', checked: settings.autoWalk, click: (i) => applySettings({ autoWalk: i.checked }) },
        { label: 'Open at login', type: 'checkbox', checked: settings.openAtLogin, click: (i) => applySettings({ openAtLogin: i.checked }) },
        { type: 'separator' },
        { label: 'Mob', submenu: Object.entries(MOBS).map(([key, label]) => radio(label, 'mob', key)) },
        {
          label: '🎀 Outfit',
          submenu: [
            ['none', 'None'], ['party', '🎉 Party hat'], ['crown', '👑 Crown'], ['beanie', '🧢 Beanie'], ['bow', '🎀 Bow'], ['flower', '🌼 Flower'], ['sunglasses', '😎 Sunglasses'],
          ].map(([key, label]) => radio(label, 'outfit', key)),
        },
        { label: 'Size', submenu: Object.entries(SIZES).map(([name, px]) => radio(name[0].toUpperCase() + name.slice(1), 'petSize', px)) },
        {
          label: 'Sleep when idle',
          submenu: [radio('Never', 'idleSleepMin', 0), radio('After 2 min', 'idleSleepMin', 2), radio('After 5 min', 'idleSleepMin', 5), radio('After 15 min', 'idleSleepMin', 15)],
        },
        { label: 'AI brain', submenu: Object.entries(AI_MODELS).map(([key, label]) => radio(label, 'aiModel', key)) },
      ],
    },
    { type: 'separator' },
    { label: `Quit ${personaFor(settings.mob).name}`, role: 'quit' },
  ]));
}

function syncActivity() {
  if (settings.reactToActivity && process.platform === 'darwin') watcher.start();
  else watcher.stop();
}

/** Stretch breaks and late-night nudges, checked along with the idle timer. */
function checkWellbeing(idle) {
  // Only count time you're actually using the computer; a 5-minute pause counts as a break.
  if (idle >= BREAK_IDLE_S) activeMs = 0;
  else activeMs += IDLE_POLL_MS;
  if (settings.breakReminders && activeMs >= BREAK_AFTER_MS && activity !== 'meeting') {
    activeMs = 0;
    send('wellbeing', { kind: 'break', minutes: Math.round(BREAK_AFTER_MS / 60_000) });
  }
  const now = new Date();
  const night = now.getHours() >= 23 || now.getHours() < 4;
  const tonight = new Date(now.getTime() - 4 * 3_600_000).toDateString();
  if (night && idle < 60 && lateNightTold !== tonight) {
    lateNightTold = tonight;
    send('wellbeing', { kind: 'late' });
  }
}

function pollIdle() {
  const idle = powerMonitor.getSystemIdleTime();
  checkWellbeing(idle);
  // Watching a video, in a call or listening to music isn't "idle", even without touching the mouse.
  const limit = ['video', 'meeting', 'music'].includes(activity) ? 0 : settings.idleSleepMin * 60;
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
  // Quick skills first (maths, dates, coin flips, to-do list, weather, translate, focus): instant, no AI needed.
  const skill = await skills?.handle(String(text)).catch(() => null);
  if (skill) {
    buildTray();
    return { ok: true, kind: 'skill', text: skill.text, effect: skill.effect ?? null };
  }
  const cmd = parseCommand(String(text));
  if (cmd) return { ok: true, kind: 'reminder', text: reminders.handle(cmd) };
  if (/^(?:please\s+)?(?:can you\s+)?(?:check|proofread|look at|fix)\s+my\s+(?:writing|text|spelling|grammar|code|essay)\b/i.test(String(text).trim())) {
    setTimeout(checkWritingNow, 300);
    return { ok: true, kind: 'proofread', text: 'Let me have a look… 🔍' };
  }
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
  // "Open my math class", "open my robot project", "make a presentation about volcanoes in Canva"…
  let action = actions.parseAction(text);
  if (!action && actions.mightBeAction(text)) action = await actions.classifyAction(text, settings.aiModel).catch(() => null);
  if (action) return { ok: true, kind: 'action', text: await runAction(action) };
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
      const where = targetApp.last?.name ? ` in ${targetApp.last.name}` : '';
      return send('rewrite', {
        stage: 'error',
        mode,
        text: `I couldn’t find any highlighted text${where}. Click into the app with your text, highlight some words, then pick the command again!`,
      });
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
// While the pet listens to the computer's sound, send the sound through BlackHole (and back afterwards).
ipcMain.on('audio:computer', (_e, on) => {
  if (process.platform !== 'darwin') return;
  if (on && settings.autoSwitchAudio) audioSwitch.useMultiOutput();
  else if (!on) audioSwitch.restore();
});
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

// Focus timer: the pet works at its desk next to you, then tells you it's break time.
function startFocus(minutes) {
  stopFocus(true);
  const endAt = Date.now() + minutes * 60_000;
  focus = { endAt, minutes, timer: setTimeout(() => stopFocus(false, true), minutes * 60_000) };
  focus.tick = setInterval(buildTray, 60_000);
  send('focus', { active: true, endAt, minutes });
  buildTray();
}

function stopFocus(quiet = false, finished = false) {
  if (!focus) return;
  clearTimeout(focus.timer);
  clearInterval(focus.tick);
  const { minutes } = focus;
  focus = null;
  send('focus', { active: false, finished, minutes });
  if (finished) {
    if (Notification.isSupported()) new Notification({ title: '🍅 Focus done!', body: `${minutes} minutes of focus. Time for a break!` }).show();
    send('say', { text: `🍅 Done! ${minutes} minutes of focus. Amazing work! 🎉 Take a 5-minute break: stretch, drink some water.` });
  } else if (!quiet) send('say', { text: 'Focus timer stopped. Good work! 🌟' });
  buildTray();
}

function tickTodo(i) {
  const item = skills.todos.list()[i];
  if (!item) return;
  skills.todos.handle(`done #${i + 1}`);
  send('say', { text: skills.todos.list().length ? `Done: “${item.text}” ✔️` : `Done: “${item.text}”. Your list is clear! 🎉` });
  if (!skills.todos.list().length) send('effect', { effect: 'confetti' });
  buildTray();
}

ipcMain.on('notes:add', (_e, line) => notes?.add(line));
ipcMain.on('notes:start', () => startNotes({ title: 'Notes' }));
ipcMain.on('notes:stop', () => stopNotes());
ipcMain.on('notes:open', (_e, file) => {
  const f = String(file ?? '');
  if (!f.startsWith(NOTES_DIR + path.sep) || !fs.existsSync(f)) return;
  execFile('open', ['-a', 'TextEdit', f], (err) => err && shell.openPath(f));
});

/**
 * While you're writing or coding: once you pause typing for a few seconds, read the focused text box and look for
 * mistakes (at most every 90 s, and only if the text changed). Quiet when everything looks fine.
 */
async function checkWriting() {
  if (!settings.checkWriting || proof.busy || !['writing', 'coding'].includes(activity)) return;
  const idle = powerMonitor.getSystemIdleTime();
  if (idle < 4 || idle > 90 || Date.now() - proof.last < PROOF_EVERY_MS) return;
  if (!selection.hasPermission(false)) return;
  proof.busy = true;
  try {
    const text = proofread.excerpt(await proofread.focusedText());
    if (text.replace(/\s/g, '').length < 12) return;
    const h = proofread.hash(text);
    if (h === proof.lastHash) return;
    proof.lastHash = h;
    proof.last = Date.now();
    const kind = activity;
    send('proofreading', { on: true });
    const issues = await proofread.findMistakes(text, kind, settings.aiModel);
    send('proofreading', { on: false });
    if (issues?.length) send('suggestions', { kind, issues });
  } finally {
    proof.busy = false;
  }
}

/** "Check my writing" on demand: always answers (mistakes, "looks good", or why it couldn't read the text). */
async function checkWritingNow() {
  if (proof.busy) return send('say', { text: 'I’m already checking, one moment! 🔍' });
  if (!selection.supported) return send('say', { text: 'This only works on a Mac for now.' });
  if (!selection.hasPermission(true)) return send('say', { text: selection.explain('not allowed'), error: true });
  proof.busy = true;
  try {
    const app = (await targetApp.refresh()) ?? targetApp.last;
    const name = app?.name ?? 'that app';
    const text = proofread.excerpt(await proofread.focusedText(app?.id));
    if (text.replace(/\s/g, '').length < 3) {
      return send('say', {
        text: `I couldn’t read any text in ${name}. Click into the text you’re writing first, then ask me again. (Some apps, like Google Docs in Chrome, don’t share their text: highlight it and use ✏️ Improve instead.)`,
      });
    }
    const kind = classify({ id: app?.id }) === 'coding' ? 'coding' : 'writing';
    send('typing', { on: true });
    const issues = await proofread.findMistakes(text, kind, settings.aiModel);
    send('typing', { on: false });
    proof.lastHash = proofread.hash(text);
    proof.last = Date.now();
    if (issues === null) send('say', { text: 'I couldn’t check right now. Is the Ollama app open? 🦙', error: true });
    else if (!issues.length) send('say', { text: `Looks good to me! ✨ No mistakes spotted in your ${kind === 'coding' ? 'code' : 'writing'}.` });
    else send('suggestions', { kind, issues });
  } finally {
    proof.busy = false;
  }
}
ipcMain.on('proofread:now', () => checkWritingNow());
ipcMain.on('app:quit', () => app.quit());

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

// ---------- Doing things for you: classes, projects, files, documents and presentations ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const osa = (script) =>
  new Promise((resolve, reject) => execFile('osascript', ['-e', script], { timeout: 15_000 }, (err, out, errOut) => (err ? reject(new Error(errOut || err.message)) : resolve(String(out).trim()))));
const hasApp = (name) => fs.existsSync(`/Applications/${name}.app`);
let creating = false;

/** Runs one action and returns what the pet says right away (long jobs report back later with 'say'). */
async function runAction(a) {
  if (process.platform !== 'darwin' && a.type !== 'create') return 'That only works on a Mac for now.';
  switch (a.type) {
    case 'open_class': {
      const list = classes.list();
      const c = actions.findClass(list, a.name);
      if (!c) return list.length ? `I can’t find a class called “${a.name}”. Your classes are: ${list.map((x) => x.name).join(', ')} 📅` : 'You don’t have any classes yet! Add them in 📅 Classes (right-click me) and then I can open them for you.';
      if (!c.link) return `${c.name} doesn’t have a link yet. Add one in 📅 Classes and I’ll open it next time! 🔗`;
      openClass(c, { now: true });
      return `Opening ${c.name}! 📚`;
    }
    case 'open_project': {
      if (a.claude) {
        await shell.openExternal('https://claude.ai/projects');
        return a.name && !/^claude$/i.test(a.name) ? `Here are your Claude projects! Click “${a.name}” 🗂️` : 'Here are your Claude projects! 🗂️';
      }
      const dir = await actions.findFolder(a.name);
      if (!dir) return `I couldn’t find a folder called “${a.name}” on your Mac 🤔 If it’s a Claude project, say “open my ${a.name} project in Claude”.`;
      if (hasApp('Visual Studio Code')) execFile('open', ['-a', 'Visual Studio Code', dir]);
      else shell.openPath(dir);
      return `Opening ${path.basename(dir)}${hasApp('Visual Studio Code') ? ' in VS Code' : ''}! 💻`;
    }
    case 'open_folder':
      shell.openPath(actions.standardFolder(a.name));
      return `Opening your ${a.name}! 📁`;
    case 'open_file': {
      const found = a.folder ? await actions.findFolder(a.name) : (await actions.findFile(a.name)) ?? (await actions.findFolder(a.name));
      if (!found) return `I couldn’t find anything called “${a.name}” on your Mac 🤔 Try another word from its name.`;
      shell.openPath(found);
      return `Opening ${path.basename(found)}! 📂`;
    }
    case 'create': {
      if (!a.topic) return 'What should it be about? Say something like “make a presentation about volcanoes in Canva”.';
      if (creating) return 'I’m still working on the last one! Give me a moment ✍️';
      createThing(a);
      const what = a.kind === 'slides' ? 'a presentation' : 'a doc';
      return `Ooh, ${what} about ${a.topic}! Let me write it, give me a minute ✍️`;
    }
  }
  return 'Hmm, I’m not sure how to do that yet.';
}

function brainError(err) {
  const msg = String(err?.message ?? err);
  if (/ECONNREFUSED|fetch failed|connect/i.test(msg)) return 'I can’t reach my brain! Open the Ollama app and ask me again.';
  if (/not found|pull/i.test(msg)) return `I’m missing my brain file! In Terminal run:  ollama pull ${settings.aiModel}`;
  if (err?.name === 'TimeoutError') return 'Writing took too long… try a smaller topic, or ask again!';
  return `Oops, something went wrong while writing: ${msg.slice(0, 120)}`;
}

/** Waits until the front window's title matches (e.g. the new Google Doc has opened), then presses ⌘V. */
async function pasteWhenReady(titlePattern, timeoutMs = 30_000) {
  if (!selection.hasPermission(false)) return false;
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    await wait(1000);
    const title = await osa('tell application "System Events" to tell (first process whose frontmost is true) to get name of front window').catch(() => '');
    if (titlePattern.test(title) && !/sign in|log in/i.test(title)) {
      await wait(2500); // let the editor finish loading
      await osa('tell application "System Events" to keystroke "v" using command down');
      return true;
    }
  }
  return false;
}

async function createThing(a) {
  creating = true;
  send('typing', { on: true }); // Bbokari sits at the desk and types while the AI writes
  try {
    const content = await actions.writeContent(a, settings.aiModel);
    if (a.kind === 'doc') {
      if (a.place === 'gdocs') {
        await actions.saveDoc(content);
        clipboard.write({ html: actions.docHTML(content), text: actions.docText(content) });
        await shell.openExternal('https://docs.new');
        send('say', { text: `“${content.title}” is written! Opening a new Google Doc and pasting it in… 📄` });
        const pasted = await pasteWhenReady(/Google Docs/i);
        send('say', { text: pasted ? `Done! “${content.title}” is in Google Docs 🎉 Read it over and make it yours!` : 'Your doc is copied! Click inside the new Google Doc and press ⌘V to paste it 📋' });
      } else {
        const files = await actions.saveDoc(content, { docx: true });
        if (a.place === 'pages' && hasApp('Pages')) execFile('open', ['-a', 'Pages', files.docx]);
        else shell.openPath(files.docx);
        send('say', { text: `Done! “${content.title}” is open 🎉 (It’s saved in Documents → Bbokari Docs.)` });
      }
    } else {
      const file = await actions.savePresentation(content);
      const name = path.basename(file);
      if (a.place === 'keynote' && hasApp('Keynote')) execFile('open', ['-a', 'Keynote', file]);
      else if (a.place === 'powerpoint' && hasApp('Microsoft PowerPoint')) execFile('open', ['-a', 'Microsoft PowerPoint', file]);
      else if (a.place === 'canva') {
        shell.showItemInFolder(file);
        await shell.openExternal('https://www.canva.com/');
        send('say', { text: `Your slides are ready! 🎨 Drag “${name}” from the Finder window onto Canva, and it turns into a Canva design you can edit.` });
        return;
      } else if (a.place === 'gslides') {
        shell.showItemInFolder(file);
        await shell.openExternal('https://drive.google.com/drive/my-drive');
        send('say', { text: `Your slides are ready! 📊 Drag “${name}” into Google Drive, then double-click it and choose “Open with Google Slides”.` });
        return;
      } else shell.openPath(file);
      send('say', { text: `Done! “${content.title}” is open 🎉 (It’s saved in Documents → Bbokari Docs.)` });
    }
  } catch (err) {
    send('say', { text: brainError(err), error: true });
  } finally {
    creating = false;
    send('typing', { on: false });
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
  skills = new Skills({
    dir: app.getPath('userData'),
    settings,
    saveSettings: (patch) => applySettings(patch),
    translate: (text, to) => translateText({ text, to, model: settings.aiModel }),
    startFocus,
    stopFocus: () => stopFocus(true),
    focusLeft: () => (focus ? focus.endAt - Date.now() : null),
  });
  buildTray();
  setInterval(checkClasses, 15_000);
  setInterval(checkWriting, 6000);
  // After the Mac wakes up, check straight away (you might be in the middle of a class).
  powerMonitor.on('resume', () => setTimeout(checkClasses, 4000));
  powerMonitor.on('unlock-screen', () => setTimeout(checkClasses, 2000));
  // The tray's "today" list changes at midnight.
  setInterval(buildTray, 10 * 60_000);
  setInterval(pollIdle, IDLE_POLL_MS);
  win.webContents.once('did-finish-load', () => setTimeout(syncActivity, 4000));
  // If the sound was left on the Multi-Output Device (volume keys off), put it back on your normal output.
  if (process.platform === 'darwin' && settings.autoSwitchAudio) setTimeout(() => audioSwitch.normalize(), 2500);
  globalShortcut.register('Control+Alt+P', () => applySettings({ hidden: !settings.hidden }));
  for (const [mode, key] of Object.entries(REWRITE_KEYS)) {
    if (!globalShortcut.register(key, () => rewriteSelection(mode))) console.log(`Shortcut ${key} is taken by another app.`);
  }
  screen.on('display-metrics-changed', () => win?.setBounds(stripBounds()));
  screen.on('display-added', () => win?.setBounds(stripBounds()));
  screen.on('display-removed', () => win?.setBounds(stripBounds()));
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  audioSwitch.restoreNow();
  globalShortcut.unregisterAll();
  whisper.stop();
});
app.on('second-instance', () => win?.showInactive());
