import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, Menu, Notification, Tray, clipboard, globalShortcut, ipcMain, nativeImage, powerMonitor, screen, shell, systemPreferences } from 'electron';
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
import { classify, findBrowserTab } from './activity.js';
import { execFile, spawn } from 'node:child_process';

/** Shortcuts in the Open menus: label → what to type. */
const QUICK_OPEN = [['YouTube', 'youtube'], ['Google', 'google'], ['Google Meet', 'google meet'], ['Zoom', 'zoom'], ['Notes', 'notes']];
import { CAPTION_LANGUAGES } from './settings.js';
import * as selection from './selection.js';
import * as actions from './actions.js';
import { autoRecipeCalcs, parseRecipe, recipeMath } from './recipeMath.js';
import { GoogleAuth } from './google.js';
import { Canva, CANVA_REDIRECT } from './canva.js';
import * as presenton from './presenton.js';
import { recipePhotos, testKey as testPixabayKey } from './photos.js';
import { fillTemplate } from './fillTemplate.js';
import * as inbox from './inbox.js';

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
let google = null;
let canva = null;
let keysWin = null;
let inboxState = null;
const inboxItems = new Map(); // id → message shown to you (with what's needed to reply)
let checkingInbox = false;
const recentInbox = []; // ids of recent messages and Classroom posts, newest first (shown in the menu bar)
const handledInbox = new Set(); // ones you've answered, opened, made a template for, or clicked past
function rememberInbox(id) {
  const i = recentInbox.indexOf(id);
  if (i >= 0) recentInbox.splice(i, 1);
  recentInbox.unshift(id);
  recentInbox.length = Math.min(recentInbox.length, 20);
}
function markHandled(id) {
  if (!id || handledInbox.has(id)) return;
  handledInbox.add(id);
  buildTray();
}
const unhandledInbox = () => recentInbox.filter((id) => !handledInbox.has(id) && inboxItems.has(id));
/** What the card needs (without the full message text). */
function shownItem(item) {
  const { text: _t, references: _r, messageId: _m, ...shown } = item;
  return shown;
}
let junkIds = [];
let project = null; // the school project you're working on: { title, course, text, due, link }
let dueCache = []; // Classroom work due this week, from the last check (so the chat AI never has to guess)
let lastRecipe = ''; // the last recipe you typed (so "make the presentation with that" can use it)
let offer = null; // something Bbokari asked ("Want me to make you a template?") waiting for a yes: { kind, until }
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
    { label: `📬 Inbox${unhandledInbox().length ? ` (${unhandledInbox().length} new)` : ''}`, submenu: inboxMenu() },
    { label: '🎨 Canva', submenu: canvaMenu() },
    { label: '🖼 Presentation maker', submenu: presentationMenu() },
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
  // Recipe and fraction math, with the steps (exact, no AI guessing).
  const math = recipeMath(text);
  if (math) return { ok: true, kind: 'skill', text: math };
  // Your school project: "check my math project", "my math project is: …", "make me a template for this project, I'm doing bibimbap".
  const answer = await answerOffer(String(text).trim());
  if (answer) return answer;
  // "Open a presentation with this template and fill it in with my math" (while looking at a Canva template).
  const filled = await templateFill(String(text).trim());
  if (filled) return filled;
  // Remember any recipe you type, even inside another question.
  const typed = String(text).trim();
  const typedDetails = typed.includes(':') ? typed.slice(typed.indexOf(':') + 1).trim() : typed;
  if (parseRecipe(typedDetails).items.length >= 3) lastRecipe = typedDetails;
  // "make the project in canva", "update the presentation with that", "fill it in with my calculations" → the recipe you typed.
  if (
    lastRecipe &&
    parseRecipe(typedDetails).items.length < 2 &&
    (!lastWork?.content?.recipeDeck || lastWork.content.details !== lastRecipe) &&
    /\b(?:make|do|create|build|update|fill|put|use|open)\b/i.test(typed) &&
    /\b(?:project|presentat\w*|slides?|canva|th[aeis]t|this|those|them|my calculations|the calculations|it)\b/i.test(typed) &&
    typed.length < 160
  ) {
    const base = { name: '', topic: '', doc: false, korean: /\bkorean?\b|한국/i.test(`${typed} ${lastRecipe}`), canva: /\bcanva\b/i.test(typed), slides: false };
    return { ok: true, kind: 'action', text: await runAction(projectAction({ ...base, fill: true, details: lastRecipe }, typed)) };
  }
  // "Add a slide about fun facts", "change the title to …", "make it for 6 people": update the last thing made.
  if (lastWork && actions.looksLikeEdit(text)) {
    if (creating) return { ok: true, kind: 'action', text: 'I’m still working on it! Give me a moment ✍️' };
    updateThing(String(text).trim());
    return { ok: true, kind: 'action', text: `Okay! Updating “${lastWork.content.title}” ✏️ One moment…` };
  }
  const proj = await projectCommand(String(text).trim());
  if (proj) return proj;
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
  const said = String(text).trim();
  // Canva's template library: open Canva's own search with your words (apps can't search it directly).
  if (/\btemplates?\b/i.test(said) && /\b(?:canva|korean?|bibimbap|presentation|slides?)\b/i.test(said) && /\b(?:search|find|show|look(?:ing)? for|get|browse|any)\b/i.test(said)) {
    let query = said
      .replace(/^(?:(?:hey|hi|ok)\s+\w+[,!.]?\s*)?(?:can you\s+|please\s+)?/i, '')
      .replace(/\b(?:search|find|show|look(?:ing)? for|get|browse|me|some|any|the|a|an|canva|templates?|for|in|on|from|of|please|good|nice|cool)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Presentations unless you asked for something else (poster, flyer, doc…).
    if (!/\b(?:presentation|slides?|poster|flyer|card|doc(?:ument)?|infographic|worksheet|menu|video|logo)\b/i.test(query)) query = `${query} presentation`.trim();
    await shell.openExternal(`https://www.canva.com/templates/?query=${encodeURIComponent(query)}`);
    return { ok: true, kind: 'action', text: `Here are Canva templates for “${query}” 🎨 Open one you like, press “Customize this template”, then tell me “fill it in with my math” and I’ll fill the whole thing in for you!` };
  }
  // Your own Canva designs: "find my bibimbap design in canva".
  const mine = said.match(/\b(?:find|open|search|show|where(?:'s| is))\s+(?:me\s+)?(?:my\s+|the\s+)(.{1,40}?)\s+(?:design|presentation|slides?|poster|deck)s?\s+(?:in|on|from)\s+canva\b/i);
  if (mine) {
    if (!canva?.connected) return { ok: true, kind: 'action', text: 'Connect Canva first: menu bar → 🎨 Canva → Connect Canva.' };
    try {
      const found = await canva.searchDesigns(mine[1].trim());
      if (!found.length) return { ok: true, kind: 'action', text: `I couldn’t find a “${mine[1].trim()}” design in your Canva 🤔` };
      await shell.openExternal(found[0].editUrl);
      const others = found.slice(1, 4).map((d) => d.title).join(', ');
      return { ok: true, kind: 'action', text: `Opening “${found[0].title}” in Canva 🎨${others ? ` (I also found: ${others})` : ''}` };
    } catch (err) {
      return { ok: true, kind: 'action', text: `Canva didn’t answer: ${err.message}` };
    }
  }
  if (/\b(?:clean|clear|tidy)\s*(?:up|out)?\s+(?:my\s+)?(?:inbox|e-?mails?|gmail|mail)\b|\b(?:delete|remove|get rid of|trash)\s+(?:all\s+)?(?:the\s+|my\s+)?(?:junk|spam|promotions?)\b/i.test(said)) {
    if (!google?.connected) return { ok: true, kind: 'inbox', text: notConnectedText() };
    findJunk();
    return { ok: true, kind: 'inbox', text: 'Let me look for junk in your inbox… 🧹' };
  }
  if (
    (/\b(?:homework|assignments?|due|class?\s?room)\b/i.test(said) && /\b(?:what|any|check|show|list|do i have|tell me|look|see|which|are they)\b/i.test(said)) ||
    /^(?:from|in|on|check|open)?\s*(?:google\s+)?class?\s?room\??$/i.test(said) ||
    /\bwhat\s+(?:things|stuff|work)\s+(?:do\s+)?i\s+have\b/i.test(said) ||
    /^(?:what are they|which ones|list them)\??$/i.test(said)
  ) {
    if (!google?.connected) return { ok: true, kind: 'inbox', text: notConnectedText() };
    return { ok: true, kind: 'inbox', text: await showTodo() };
  }
  if (/\b(?:catch me up|what did i miss|did i miss anything|what'?s new|any updates)\b/i.test(said)) {
    if (!google?.connected) return { ok: true, kind: 'inbox', text: notConnectedText() };
    catchUp();
    return { ok: true, kind: 'inbox', text: 'Let me see what you missed… 👀' };
  }
  if (/\b(?:check|read|any|new|got|what'?s in|questions? in)\b.*\b(?:inbox|e-?mails?|gmail|messages?|google chat|chats?|mail)\b/i.test(said) && !/\bremind/i.test(said)) {
    if (!google?.connected) return { ok: true, kind: 'inbox', text: notConnectedText() };
    checkInbox({ manual: true });
    return { ok: true, kind: 'inbox', text: 'Checking your messages… 📬' };
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
  const res = await askAI({ history, mob, model: settings.aiModel, remindersSummary: reminders.describeAll(), context: knownContext() });
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

// ---------- 📚 Your school project ----------
const projectFile = () => path.join(app.getPath('userData'), 'project.json');
function loadProject() {
  try {
    project = JSON.parse(fs.readFileSync(projectFile(), 'utf8'));
  } catch {
    project = null;
  }
}
function saveProject() {
  try {
    fs.writeFileSync(projectFile(), JSON.stringify(project));
  } catch {}
}

const LEAD_WORDS = String.raw`^(?:(?:hey|hi|ok|okay)\s+\w+[,!.]?\s*)?(?:can you\s+|could you\s+|please\s+)?`;
const CHECK_PROJECT = new RegExp(`${LEAD_WORDS}(?:check|read|look at|look up|find|explain|what(?:'s| is)(?: in)?|tell me about|open up)\\s+(?:my|the|our)\\s+(.{0,40}?)\\s*(project|assignment|homework|task)\\b`, 'i');
const PASTE_PROJECT = new RegExp(`${LEAD_WORDS}(?:my|the|this)\\s+(.{0,30}?)\\s*(?:project|assignment|homework)\\s*(?:is|says|instructions?(?: are)?)?\\s*[:\\-–]\\s*([\\s\\S]{25,})$`, 'i');
const PASTE_INSTRUCTIONS = new RegExp(`${LEAD_WORDS}(?:here(?:'s| is| are)\\s+)?(?:the\\s+|my\\s+)?(?:project\\s+)?instructions?\\s*[:\\-–]\\s*([\\s\\S]{25,})$`, 'i');

/** "make me a template for the math project, I'm doing bibimbap, use Korean elements" → what's asked, or null. */
export function parseProjectTemplate(said) {
  if (!/\btemplate\b/i.test(said) || !/\b(?:project|assignment|homework|that|it)\b/i.test(said)) return null;
  const name = said.match(/\bfor\s+(?:my|the|our|this)\s+(.{0,30}?)\s*(?:project|assignment|homework)\b/i)?.[1]?.trim() ?? '';
  const topic = said.match(/\b(?:i'?m doing|i am doing|i chose|i picked|my topic is|topic is|it'?s about|about|on)\s+(?:a\s+|an\s+|the\s+)?(.{2,60}?)(?=\s*(?:[,.;!]|\s(?:with|using|use|and|in canva|in google|please|so)\b|$))/i)?.[1]?.trim() ?? '';
  const doc = /\b(?:doc|document|google docs?|word|essay|report)\b/i.test(said) && !/\b(?:presentation|slides?|canva)\b/i.test(said);
  // "…fill it in with these details: …" → the details after the colon go into the slides.
  const colon = said.indexOf(':');
  const details = colon > 0 ? said.slice(colon + 1).trim() : '';
  const fill = /\bfill(?:ed)?\s*(?:it\s*|them\s*)?(?:in|out|up)?\b|\bwith\s+(?:these|my|the following|this)\s+(?:details|info|information|calculations|numbers|data)\b/i.test(said) && details.length > 15;
  return { name, topic, doc, fill, details, korean: /\bkorean?\b|한국/i.test(said), canva: /\bcanva\b/i.test(said), slides: /\bgoogle slides\b/i.test(said) };
}

async function projectText(p) {
  const due = p.due ? ` · due ${inbox.formatDue(new Date(p.due))}` : '';
  let ex = null;
  try {
    ex = await inbox.explainProject(p, settings.aiModel);
  } catch {}
  offer = { kind: 'template', until: Date.now() + 15 * 60_000 };
  const next = 'Want me to make you a template for it? 📝';
  if (!ex?.about) return `📚 ${p.title}${due}\n${p.text.slice(0, 500)}\n\n${next}`;
  return [
    `📚 ${p.title}${p.course ? ` (${p.course})` : ''}${due}`,
    ex.about,
    ex.include.length ? `You need to:\n${ex.include.map((i) => `• ${i}`).join('\n')}` : '',
    ex.tip ? `💡 ${ex.tip}` : '',
    next,
  ].filter(Boolean).join('\n');
}

/**
 * Canva templates: open a template in Canva (press "Customize this template"), then say "fill it in with my math".
 * Bbokari downloads that design from your Canva account, writes your math into its own text boxes (same fonts,
 * colours and pictures, extra pages added as needed) and opens the filled copy in Canva. Fully automatic.
 */
async function templateFill(said) {
  const aboutTemplate = /\b(?:this|that|the|my)\s+(?:canva\s+)?(?:template|design)s?\b/i.test(said) || /\b(?:template|design) i'?m (?:looking at|on|in)\b/i.test(said);
  const fill = /\bfill\b/i.test(said) || (/\b(?:use|open|start)\b/i.test(said) && aboutTemplate);
  const aboutMath = /\b(?:math|calculations?|numbers|recipe|project|details)\b/i.test(said);
  if (!fill || !(aboutMath || aboutTemplate) || /\bmake (?:me )?a (?:blank )?template\b/i.test(said)) return null;
  const url = await findBrowserTab(/canva\.com/i);
  if (!url) return aboutTemplate ? { ok: true, kind: 'action', text: 'Open the template in Canva first (and press “Customize this template”), then tell me “fill it in with my math” 🎨' } : null;
  // A recipe typed in the same message ("… fill it in with my math: bibimbap for 4: rice 1 1/2 cups, …").
  const inline = said.includes(':') ? said.slice(said.indexOf(':') + 1).trim() : '';
  if (parseRecipe(inline).items.length >= 2) lastRecipe = inline;
  const haveDeck = lastWork?.content?.recipeDeck && (!lastRecipe || lastWork.content.details === lastRecipe);
  if (!haveDeck && !lastRecipe) {
    return { ok: true, kind: 'action', text: 'Send me your recipe first 🍚 (like “bibimbap for 4 people: rice 1 1/2 cups, beef 1 cup, … double it and halve it”), then say “fill it in with my math”.' };
  }
  const designId = url.match(/canva\.com\/design\/([A-Za-z0-9_-]+)/)?.[1];
  if (!designId) return { ok: true, kind: 'action', text: 'That’s Canva’s template page. Press the purple “Customize this template” button first, then tell me “fill it in with my math” again 🎨' };
  if (!canva?.connected) return { ok: true, kind: 'action', text: 'Connect Canva first: menu bar → 🎨 Canva → Connect Canva. Then say “fill it in with my math” again.' };
  if (!canva.canReadDesigns) {
    connectCanva();
    return { ok: true, kind: 'action', text: 'One time only: I need permission to open your designs. Press Allow in Canva, then say “fill it in with my math” again 🎨 (If Canva shows an error, turn on “design:content Read” in your Canva integration’s Scopes first.)' };
  }
  if (creating) return { ok: true, kind: 'action', text: 'I’m still working on the last one! Give me a moment ✍️' };
  fillCanvaDesign(designId, said);
  return { ok: true, kind: 'action', text: 'On it! 🎨 I’m putting all your math into this template. It takes about a minute, and I’ll open it when it’s ready.' };
}

async function fillCanvaDesign(designId, said) {
  creating = true;
  send('typing', { on: true });
  try {
    let deck = lastWork?.content?.recipeDeck && (!lastRecipe || lastWork.content.details === lastRecipe) ? lastWork.content : null;
    if (!deck) {
      const base = { name: '', topic: '', doc: false, korean: /\bkorean?\b|한국|bibimbap/i.test(`${said} ${lastRecipe}`), canva: true, slides: false };
      const a = projectAction({ ...base, fill: true, details: lastRecipe }, said);
      deck = await actions.buildRecipeDeck(a.details, { topic: a.topic, theme: a.theme, project: a.projectTitle, model: settings.aiModel });
      lastWork = { action: a, content: deck, at: Date.now() };
      saveLastWork();
    }
    const template = await canva.exportPptx(designId);
    const filled = await fillTemplate(template, actions.deckToPages(deck));
    fs.mkdirSync(actions.DOCS_DIR, { recursive: true });
    const file = path.join(actions.DOCS_DIR, `${String(deck.title).replace(/[/\\:*?"<>|]+/g, ' ').slice(0, 50)} (template) ${new Date().toISOString().slice(0, 10)}.pptx`);
    fs.writeFileSync(file, filled);
    const design = await canva.importPresentation(file, `${deck.dish || deck.title} · my math`);
    await shell.openExternal(design.editUrl);
    send('say', { text: `Done! 🎉 Your template is filled with all your math and open in Canva (it’s a new copy, so the empty one is still there). Want changes? Just tell me!` });
  } catch (err) {
    if (err.message === 'NEEDS_READ_PERMISSION') {
      canva.disconnect();
      buildTray();
      send('say', { text: 'Canva didn’t let me open that design. In your Canva integration page → Scopes, turn on “design:content Read”, then menu bar → 🎨 Canva → Connect Canva, and ask me again.', error: true });
    } else {
      send('say', { text: `I couldn’t fill that template (${err.message}). Say “make my presentation in canva with my math” and I’ll make my own design instead.`, error: true });
    }
  } finally {
    creating = false;
    send('typing', { on: false });
  }
}

async function projectCommand(said) {
  // Pasted instructions (works without Classroom).
  const pasted = said.match(PASTE_PROJECT) ?? said.match(PASTE_INSTRUCTIONS);
  if (pasted && !/\btemplate\b/i.test(said.slice(0, 60))) {
    const name = pasted.length > 2 ? pasted[1].trim() : '';
    project = { title: `${name ? name.replace(/^\p{L}/u, (c) => c.toUpperCase()) : 'My'} project`, course: '', text: (pasted[2] ?? pasted[1]).trim().slice(0, 6000), due: null, link: null };
    saveProject();
    return { ok: true, kind: 'project', text: `Got it, I saved your project! ${await projectText(project)}` };
  }

  const check = said.match(CHECK_PROJECT);
  if (check && !/\btemplate\b/i.test(said)) {
    const name = check[1].trim();
    const paste = `paste it to me instead: “my ${name || 'math'} project is: …” and then the instructions.`;
    if (!google?.connected) return { ok: true, kind: 'project', text: `I can’t see Classroom yet (it isn’t connected), so ${paste}` };
    let w;
    try {
      w = await inbox.findAssignment(gapi, `${name} ${check[2]}`);
    } catch (err) {
      return { ok: true, kind: 'project', text: `I couldn’t check Classroom (${inboxProblem('Classroom', err)}), so ${paste}` };
    }
    if (!w) return { ok: true, kind: 'project', text: `I couldn’t find a “${name} ${check[2]}” in Classroom 🤔 You can ${paste}` };
    project = w;
    inboxItems.set(`project:${w.id}`, { ...w, id: `project:${w.id}`, source: 'classroom', kind: 'project', from: w.course, subject: w.title });
    saveProject();
    return { ok: true, kind: 'project', text: await projectText(project) };
  }

  // "Do the presentation with my calculations: bibimbap for 4 people: rice 2 cups, beef 1 cup…" (no "template" needed).
  if (/\b(?:presentation|slides?|slideshow|canva|powerpoint|keynote)\b/i.test(said) && /\b(?:calculations?|recipe|details|ingredients|math|numbers)\b/i.test(said) && !/\btemplate\b/i.test(said)) {
    const colon = said.indexOf(':');
    const details = colon > 0 ? said.slice(colon + 1).trim() : said;
    if (parseRecipe(details).items.length >= 2) {
      const base = parseProjectTemplate(`make a template for this project ${said.slice(0, colon > 0 ? colon : said.length)}`) ?? { name: '', topic: '', doc: false, korean: false, canva: false, slides: false };
      return { ok: true, kind: 'action', text: await runAction(projectAction({ ...base, fill: true, details }, said)) };
    }
  }
  const t = parseProjectTemplate(said);
  if (!t) return null;
  // A project named here that isn't the one we know: look it up in Classroom.
  if (t.name && google?.connected && !(project && new RegExp(t.name.split(/\s+/)[0], 'i').test(`${project.title} ${project.course}`))) {
    const w = await inbox.findAssignment(gapi, `${t.name} project`).catch(() => null);
    if (w) {
      project = w;
      saveProject();
    }
  }
  if (!project && !t.topic) {
    return { ok: true, kind: 'project', text: 'Which project? Say “check my math project” (if Classroom is connected), or paste it to me: “my math project is: …”. Then ask for the template!' };
  }
  return { ok: true, kind: 'action', text: await runAction(projectAction(t, said)) };
}

/** Facts the chat AI may use (so it doesn't invent projects or assignments). */
function knownContext() {
  const lines = [];
  if (project) lines.push(`The school project they are working on: "${project.title}"${project.course ? ` (${project.course})` : ''}${project.due ? `, due ${inbox.formatDue(new Date(project.due))}` : ''}.`);
  if (dueCache.length) lines.push(`Due this week in Google Classroom: ${dueCache.map((w) => `${w.course}: ${w.title} (${inbox.formatDue(new Date(w.due))})`).join('; ')}.`);
  if (lastWork) lines.push(`The last thing you made for them: "${lastWork.content.title}" (${lastWork.action.kind === 'slides' ? 'presentation' : 'document'}).`);
  return lines.join('\n');
}

/** The "make it" action for the project: a blank template, or one filled with your details (and the recipe math done). */
function projectAction(input, said) {
  let t = input;
  const head = t.details?.match(/^\s*(.{2,40}?)\s+(?:for|serves|feeds)\s+\d/i)?.[1]?.trim();
  const fromDetails = head && !/\d/.test(head) ? head : '';
  const dish = `${said} ${t.details ?? ''}`.match(/\b(korean bibimbap|bibimbap|kimchi(?: fried rice| jjigae)?|bulgogi|japchae|kimbap|gimbap|tteokbokki|ramyeon|pancakes?|cookies?|brownies?|pizza|tacos?|cake|cupcakes?|muffins?|curry|pasta|lasagna|salad|soup|smoothies?|fried rice|sushi|dumplings?)\b/i)?.[1];
  const topic = t.topic || fromDetails || dish || project?.title || 'my recipe';
  const place = t.doc ? 'gdocs' : t.slides ? 'gslides' : canva?.connected || t.canva ? 'canva' : 'gslides';
  const about = project
    ? `School project: "${project.title}"${project.course ? ` (${project.course})` : ''}. Project instructions: ${project.text.slice(0, 2500)}\n`
    : '';
  let request = `${about}The student's topic: ${topic}. What they asked for: ${said}`;
  if (t.fill) {
    const calcs = autoRecipeCalcs(t.details);
    request = `${about}The student's topic: ${topic}.\nThe student's own details:\n${t.details.slice(0, 3000)}${calcs ? `\nRecipe calculations (already worked out exactly; copy these numbers and steps):\n${calcs}` : ''}`;
  } else if (project) request = `A blank template. ${request}`;
  const recipeDeck = t.fill && !t.doc && parseRecipe(t.details).items.length >= 2;
  // What the teacher asks for (× 1 1/2…) goes into the sizes to work out, plus double and half.
  if (recipeDeck && project?.text && /one and a half|1\.5|1 1\/2 times|× ?3\/2/i.test(project.text) && !/one and a half|1\.5|3\/2 times/i.test(t.details)) {
    t = { ...t, details: `${t.details}${/doubl|half|halve/i.test(t.details) ? '' : ' Double it and halve it.'} Also make it one and a half times.` };
  }
  return {
    type: 'create',
    kind: t.doc ? 'doc' : 'slides',
    template: !t.fill,
    filled: t.fill,
    topic,
    theme: t.korean || /korea|한국/i.test(t.details ?? '') ? 'korean' : null,
    place,
    request,
    recipeDeck,
    details: recipeDeck ? t.details : undefined,
    projectTitle: project?.title ?? '',
  };
}

/** "yes" (or "yes, I'm doing bibimbap") after Bbokari asked "Want me to make you a template?". */
async function answerOffer(said) {
  if (!offer || Date.now() > offer.until) {
    offer = null;
    return null;
  }
  // Only a real answer: short ("yes", "sure!", "ok do it") or a yes with the topic ("yes, I'm doing bibimbap").
  // "ok so make the project in canva…" is a new request, not a yes.
  const short = said.split(/\s+/).length <= 5;
  const yes = /^(?:yes|yeah|yep|yup|sure|ok(?:ay)?|please|do it|go ahead|yes please|si|sí|claro|vale|of course)\b/i.test(said) && (short || /\b(?:i'?m doing|i am doing|about|topic|my recipe is|it'?s)\b/i.test(said));
  const no = /^(?:no|nope|not now|later|no thanks|nah)\b/i.test(said) && short;
  if (!yes && !no) return null;
  offer = null;
  if (no) return { ok: true, kind: 'project', text: 'Okay! Just ask me whenever you want one 👍' };
  // Pick up anything said after the yes ("yes, I'm doing bibimbap, Korean style").
  const t = parseProjectTemplate(`make a template for this project ${said.replace(/^\S+[,!.]?\s*/, '')}`) ?? { topic: '', korean: false };
  return { ok: true, kind: 'action', text: await runAction(projectAction({ ...t, fill: false }, said)) };
}

// ---------- 📬 Inbox buddy: Gmail, Google Chat and Classroom ----------
const gapi = (url, opts) => google.api(url, opts);

function notConnectedText() {
  return google?.hasClient
    ? 'Connect your Google account first: menu bar → 📬 Inbox → Connect Google account.'
    : 'I’m not connected to Google yet! Follow the “📬 Inbox” steps in the README to set me up.';
}

function inboxMenu() {
  if (!google) return [{ label: 'Starting…', enabled: false }];
  if (!google.hasClient) {
    return [
      { label: 'Step 1: make your Google key (README → 📬 Inbox)', click: () => shell.openExternal('https://console.cloud.google.com/') },
      { label: 'Step 2: Choose Google key file…', click: chooseGoogleKey },
    ];
  }
  if (!google.connected) {
    return [
      { label: 'Connect Google account…', click: connectGoogle },
      { label: 'Choose a different key file…', click: chooseGoogleKey },
    ];
  }
  const box = (label, key) => ({ label, type: 'checkbox', checked: !!settings[key], click: (i) => applySettings({ [key]: i.checked }) });
  const short = (str, n) => (String(str ?? '').length > n ? `${String(str).slice(0, n - 1)}…` : String(str ?? ''));
  const icon = { gmail: '📧', chat: '💬', classroom: '🏫' };
  const recent = recentInbox.map((id) => inboxItems.get(id)).filter(Boolean).slice(0, 10);
  const waiting = unhandledInbox().length;
  return [
    { label: waiting ? `✨ Catch me up (${waiting} new)` : '✨ Catch me up', click: () => catchUp() },
    { type: 'separator' },
    ...(recent.length
      ? recent.map((i) => ({
          label: `${handledInbox.has(i.id) ? '    ' : '•  '}${icon[i.source] ?? '📬'} ${short(i.from, 18)}: ${short(i.question || i.summary || i.subject, 46)}`,
          click: () => showInboxItem(i.id),
        }))
      : [{ label: 'No new messages yet', enabled: false }]),
    { type: 'separator' },
    { label: `Connected: ${google.email || 'Google'}`, enabled: false },
    { label: 'Check now', click: () => checkInbox({ manual: true }) },
    { label: '🧹 Clean up junk mail…', click: () => findJunk() },
    { label: '📚 What’s due this week', click: async () => { const t = await showTodo(); if (t) send('say', { text: t }); } },
    { type: 'separator' },
    box('Tell me about new messages', 'inboxOn'),
    box('Gmail', 'inboxGmail'),
    box('Google Chat', 'inboxChat'),
    box('Classroom', 'inboxClassroom'),
    { type: 'separator' },
    { label: 'Disconnect Google', click: () => { google.disconnect(); applySettings({ inboxOn: false }); } },
  ];
}

async function chooseGoogleKey() {
  app.focus({ steal: true });
  const r = await dialog.showOpenDialog({ title: 'Choose your Google key file (client_secret_….json)', defaultPath: app.getPath('downloads'), properties: ['openFile'], filters: [{ name: 'Google key', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return;
  try {
    google.importClient(r.filePaths[0]);
    send('say', { text: 'Got your Google key! 🔑 Now: menu bar → 📬 Inbox → Connect Google account.' });
  } catch (err) {
    send('say', { text: err.message, error: true });
  }
  buildTray();
}

async function connectGoogle() {
  send('say', { text: 'Opening Google in your browser… Pick your account and press Allow 🔑' });
  try {
    const email = await google.connect();
    applySettings({ inboxOn: true });
    send('say', { text: `Connected${email ? ` to ${email}` : ''}! I’ll tell you about new messages and Classroom posts 📬` });
    setTimeout(() => checkInbox({ manual: true }), 2000);
  } catch (err) {
    const msg = String(err.message);
    send('say', { text: /admin|blocked|org_internal|disallowed/i.test(msg) ? 'Google blocked it. School accounts often don’t allow your own apps; try your personal Gmail account instead.' : `Google sign-in didn’t work: ${msg}`, error: true });
  }
  buildTray();
}

function presentationMenu() {
  const engine = (value, label) => ({ label, type: 'radio', checked: settings.presentationEngine === value, click: () => applySettings({ presentationEngine: value }) });
  return [
    engine('bbokari', 'Bbokari’s own design (built in)'),
    engine('presenton', 'Presenton (open source, with photos)'),
    { type: 'separator' },
    { label: 'Real food photos (Pixabay)', type: 'checkbox', checked: settings.deckPhotos && !!settings.pixabayKey, enabled: !!settings.pixabayKey, click: (item) => applySettings({ deckPhotos: item.checked }) },
    { label: settings.pixabayKey ? 'Change Pixabay key…' : 'Enter Pixabay key (for photos)…', click: openPixabayKeyWindow },
    { type: 'separator' },
    { label: `Presenton address: ${settings.presentonUrl}`, enabled: false },
    { label: settings.presentonKey ? 'Change Presenton API key…' : 'Enter Presenton API key…', click: openPresentonKeyWindow },
    { label: 'Open Presenton', click: () => shell.openExternal(settings.presentonUrl) },
    { label: 'How to install Presenton', click: () => shell.openExternal('https://github.com/presenton/presenton') },
  ];
}

let presentonWin = null;
function openPresentonKeyWindow() {
  if (presentonWin && !presentonWin.isDestroyed()) return presentonWin.focus();
  presentonWin = new BrowserWindow({ width: 480, height: 330, title: 'Presenton key', resizable: false, alwaysOnTop: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true } });
  const html = `<!doctype html><meta charset="utf-8"><title>Presenton</title>
  <body style="font:15px -apple-system,system-ui;padding:22px;background:#fffaf0;color:#3b2f14">
  <h2 style="margin:0 0 8px">🖼 Presenton</h2>
  <p style="margin:0 0 14px;color:#7a6a42">In Presenton (${settings.presentonUrl}) open Settings → API keys, create a key, and paste it here.</p>
  <label>API key<br><input id="key" type="password" placeholder="sk-presenton-…" style="width:100%;padding:8px;margin:4px 0 14px;font:inherit"></label>
  <button id="save" style="padding:10px 18px;font:700 15px system-ui;background:#ffd23f;border:2px solid #3b2f14;border-radius:12px">Save</button>
  <p id="msg" style="color:#c92a2a"></p>
  <script>document.getElementById('save').onclick=async()=>{const r=await window.mobHost.presentonKey(document.getElementById('key').value);if(r.ok)window.close();else document.getElementById('msg').textContent=r.text;};</script></body>`;
  presentonWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}
ipcMain.handle('presenton:key', async (_e, key) => {
  const k = String(key ?? '').trim();
  if (k.length < 8) return { ok: false, text: 'That key looks too short.' };
  applySettings({ presentonKey: k, presentationEngine: 'presenton' });
  send('say', { text: 'Got your Presenton key! 🖼 Presentations will now be designed by Presenton.' });
  return { ok: true };
});

let pixabayWin = null;
function openPixabayKeyWindow() {
  if (pixabayWin && !pixabayWin.isDestroyed()) return pixabayWin.focus();
  pixabayWin = new BrowserWindow({ width: 480, height: 340, title: 'Pixabay key', resizable: false, alwaysOnTop: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true } });
  const html = `<!doctype html><meta charset="utf-8"><title>Pixabay</title>
  <body style="font:15px -apple-system,system-ui;padding:22px;background:#fffaf0;color:#3b2f14">
  <h2 style="margin:0 0 8px">📸 Real photos for your slides</h2>
  <p style="margin:0 0 14px;color:#7a6a42">Sign in at pixabay.com/api/docs, scroll to “Parameters”, copy the key after <b>key</b>, and paste it here. (Don’t share it or screenshot it.)</p>
  <label>Pixabay API key<br><input id="key" type="password" placeholder="12345678-abcdef…" style="width:100%;padding:8px;margin:4px 0 14px;font:inherit"></label>
  <button id="save" style="padding:10px 18px;font:700 15px system-ui;background:#ffd23f;border:2px solid #3b2f14;border-radius:12px">Save</button>
  <p id="msg" style="color:#c92a2a"></p>
  <script>document.getElementById('save').onclick=async()=>{document.getElementById('msg').textContent='Checking…';const r=await window.mobHost.pixabayKey(document.getElementById('key').value);if(r.ok)window.close();else document.getElementById('msg').textContent=r.text;};</script></body>`;
  pixabayWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}
ipcMain.handle('pixabay:key', async (_e, key) => {
  const k = String(key ?? '').trim();
  if (!/^\d+-[0-9a-f]{20,}$/i.test(k)) return { ok: false, text: 'That doesn’t look like a Pixabay key (it looks like numbers, a dash, then letters and numbers).' };
  try {
    await testPixabayKey(k);
  } catch (err) {
    return { ok: false, text: `${err.message}. Check you copied the whole key.` };
  }
  applySettings({ pixabayKey: k, deckPhotos: true, presentationEngine: 'bbokari' });
  send('say', { text: 'Got your Pixabay key! 📸 My presentations will have real food photos now.' });
  return { ok: true };
});

/** Real photos for a recipe deck (kept in memory only, so last-work.json stays small). */
const photoCache = new Map();
async function deckPhotos(content) {
  if (!content.recipeDeck || !settings.pixabayKey || !settings.deckPhotos) return null;
  const names = (content.recipe?.items ?? []).map((i) => i.name).filter(Boolean);
  const cacheKey = `${content.topic || content.dish}|${names.slice(0, 3).join(',')}`;
  if (!photoCache.has(cacheKey)) {
    send('say', { text: 'Finding real food photos for your slides… 📸' });
    const found = await recipePhotos(settings.pixabayKey, { dish: content.topic || content.dish || 'food', ingredients: names, korean: content.theme === 'korean' });
    if (!found) return null;
    photoCache.clear();
    photoCache.set(cacheKey, found);
  }
  return photoCache.get(cacheKey);
}

/** Makes the .pptx with Presenton (Bbokari's slides and math, Presenton's design and photos). Returns { file, editUrl }. */
async function presentonFile(content, a) {
  if (!(await presenton.isRunning(settings.presentonUrl))) throw new Error(`Presenton isn’t running at ${settings.presentonUrl} (start Docker and Presenton)`);
  send('say', { text: 'Presenton is designing your slides… 🖼 With the small AI this can take 5–15 minutes, so keep me open!' });
  const korean = content.theme === 'korean';
  return presenton.generate({
    url: settings.presentonUrl,
    key: settings.presentonKey,
    slidesMarkdown: content.slides?.length ? actions.deckToMarkdown(content) : null,
    content: content.slides?.length ? '' : a.request,
    instructions: `A school ${a.kind === 'slides' ? 'presentation' : 'document'} for a student. Keep every number, fraction and calculation exactly as written. Use clear visuals and photos of the food.${korean ? ' Korean style: red, navy and gold colours, Korean food photos.' : ''}`,
    saveDir: actions.DOCS_DIR,
    name: content.title,
  });
}

function canvaMenu() {
  if (!canva) return [{ label: 'Starting…', enabled: false }];
  if (!canva.hasKeys) {
    return [
      { label: 'Step 1: make your Canva keys (README → 🎨 Canva)', click: () => shell.openExternal('https://www.canva.com/developers/integrations') },
      { label: 'Step 2: Enter Canva keys…', click: openKeysWindow },
    ];
  }
  if (!canva.connected) return [{ label: 'Connect Canva…', click: connectCanva }, { label: 'Change keys…', click: openKeysWindow }];
  return [{ label: 'Connected ✓ (designs open in Canva)', enabled: false }, { label: 'Disconnect Canva', click: () => { canva.disconnect(); buildTray(); } }];
}

function openKeysWindow() {
  if (keysWin && !keysWin.isDestroyed()) return keysWin.focus();
  keysWin = new BrowserWindow({ width: 480, height: 400, title: 'Canva keys', resizable: false, alwaysOnTop: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true } });
  const html = `<!doctype html><meta charset="utf-8"><title>Canva keys</title>
  <body style="font:15px -apple-system,system-ui;padding:22px;background:#fffaf0;color:#3b2f14">
  <h2 style="margin:0 0 8px">🎨 Your Canva keys</h2>
  <p style="margin:0 0 14px;color:#7a6a42">From your integration on canva.com/developers. Redirect URL to add there:<br><b>${CANVA_REDIRECT}</b></p>
  <label>Client ID<br><input id="id" style="width:100%;padding:8px;margin:4px 0 12px;font:inherit"></label>
  <label>Client secret<br><input id="secret" type="password" style="width:100%;padding:8px;margin:4px 0 14px;font:inherit"></label>
  <button id="save" style="padding:10px 18px;font:700 15px system-ui;background:#ffd23f;border:2px solid #3b2f14;border-radius:12px">Save & connect</button>
  <p id="msg" style="color:#c92a2a"></p>
  <script>document.getElementById('save').onclick=async()=>{const r=await window.mobHost.canvaKeys({id:document.getElementById('id').value,secret:document.getElementById('secret').value});if(r.ok)window.close();else document.getElementById('msg').textContent=r.text;};</script></body>`;
  keysWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

ipcMain.handle('canva:keys', async (_e, { id, secret } = {}) => {
  try {
    canva.saveKeys(id, secret);
    setTimeout(connectCanva, 300);
    buildTray();
    return { ok: true };
  } catch (err) {
    return { ok: false, text: err.message };
  }
});

async function connectCanva() {
  send('say', { text: 'Opening Canva in your browser… press Allow 🎨' });
  try {
    await canva.connect();
    send('say', { text: 'Connected to Canva! 🎨 Now presentations I make open right in Canva.' });
  } catch (err) {
    send('say', { text: `Canva didn’t connect: ${err.message}`, error: true });
  }
  buildTray();
}

const inboxProblem = (name, err) =>
  err?.status === 403 ? `${name} isn’t allowed. Turn on its API in Google Cloud (or your school blocks it).` : `${name}: ${String(err?.message ?? err).slice(0, 100)}`;

/** Looks for new messages and posts, sums each one up, and shows them as cards. */
async function checkInbox({ manual = false, show = true } = {}) {
  if (!google?.connected) {
    if (manual) send('say', { text: notConnectedText() });
    return [];
  }
  if ((!manual && !settings.inboxOn) || checkingInbox) return [];
  checkingInbox = true;
  const found = [];
  const problems = [];
  const grab = async (on, name, fn) => {
    if (!on) return;
    try {
      found.push(...(await fn(gapi, inboxState)));
    } catch (err) {
      problems.push(inboxProblem(name, err));
    }
  };
  try {
    await grab(settings.inboxGmail, 'Gmail', inbox.fetchGmail);
    await grab(settings.inboxChat, 'Google Chat', inbox.fetchChat);
    await grab(settings.inboxClassroom, 'Classroom', inbox.fetchClassroom);
    const items = [];
    for (const it of found.sort((a, b) => b.time - a.time).slice(0, 12)) {
      const s = await inbox.summarize(it, settings.aiModel);
      inboxState.markSeen(it.id);
      inboxItems.set(it.id, s);
      rememberInbox(it.id);
      items.push(shownItem(s));
    }
    if (items.length) buildTray();
    // Once a day (from 7am): what's due this week.
    const today = new Date().toDateString();
    if (settings.inboxClassroom && new Date().getHours() >= 7 && inboxState.data.todoDay !== today) {
      inboxState.data.todoDay = today;
      setTimeout(() => showTodo({ daily: true }), items.length ? 60_000 : 3000);
    }
    inboxState.save();
    if (show && items.length) send('inbox', { items });
    else if (show && manual) send('say', { text: problems.length ? `I couldn’t check everything 😕 ${problems.join(' ')}` : 'All caught up! Nothing new 📭✨' });
    return items;
  } finally {
    checkingInbox = false;
  }
}

/** "✨ Catch me up": checks for anything new, then goes through everything you haven't dealt with yet. */
async function catchUp({ auto = false } = {}) {
  if (!google?.connected) {
    if (!auto) send('say', { text: notConnectedText() });
    return;
  }
  await checkInbox({ manual: true, show: false });
  const ids = unhandledInbox();
  if (!ids.length) {
    if (!auto) send('say', { text: 'You’re all caught up! Nothing you missed ✨' });
    return;
  }
  const items = ids.map((id) => shownItem(inboxItems.get(id))).reverse(); // oldest first
  const asks = items.filter((i) => i.needsReply).length;
  const work = items.filter((i) => i.source === 'classroom').length;
  const bits = [asks ? `${asks} question${asks === 1 ? '' : 's'} for you` : '', work ? `${work} Classroom update${work === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');
  send('inbox', { items, intro: `👀 Hey${auto ? ', welcome back' : ''}! You missed ${items.length} thing${items.length === 1 ? '' : 's'}${bits ? ` (${bits})` : ''}:` });
}

function showInboxItem(id) {
  const item = inboxItems.get(id);
  if (item) send('inbox', { items: [shownItem(item)] });
}

/** Puts Classroom work due this week in a card, each with “📝 Template” and “Open”. Returns what to say (or ''). */
async function showTodo({ daily = false } = {}) {
  try {
    const work = await inbox.upcomingWork(gapi);
    if (!work.length) {
      dueCache = [];
      return daily ? '' : 'Nothing due in Classroom this week! 🎉';
    }
    const items = work.slice(0, 6).map((w) => {
      const id = `todo:${w.id}`;
      inboxItems.set(id, { ...w, id, source: 'classroom', kind: 'todo', from: w.course, subject: w.title });
      return { id, course: w.course, title: w.title, due: w.due };
    });
    dueCache = work;
    send('inboxTodo', { items, daily });
    const list = work.slice(0, 8).map((w) => `• ${w.course}: ${w.title} (${inbox.formatDue(new Date(w.due))})`).join('\n');
    return daily ? '' : `Due this week in Classroom 📚\n${list}\nWant me to make a template for any of them?`;
  } catch (err) {
    return `I couldn’t check Classroom: ${inboxProblem('Classroom', err)}`;
  }
}

/** A blank template to work on, for a Classroom assignment (slides if it sounds like a presentation, otherwise a doc). */
function templateFor(work) {
  const text = `${work.subject ?? work.title} ${work.text ?? ''}`;
  const slides = /present|slide|poster|canva|deck|keynote|powerpoint|infographic/i.test(text);
  return {
    type: 'create',
    kind: slides ? 'slides' : 'doc',
    template: true,
    topic: String(work.subject ?? work.title).slice(0, 100),
    place: slides ? (canva?.connected ? 'canva' : 'gslides') : 'gdocs',
    request: `Make a blank template the student can fill in themselves for this school assignment from ${work.course ?? work.from}: "${work.subject ?? work.title}". Assignment instructions: ${String(work.text ?? '').slice(0, 600)}`,
  };
}

ipcMain.handle('inbox:template', async (_e, id) => {
  const work = inboxItems.get(id);
  if (!work) return { ok: false, text: 'I lost that assignment, sorry! Ask me “what homework do I have?” again.' };
  markHandled(id);
  return { ok: true, text: await runAction(templateFor(work)) };
});

async function dueText() {
  try {
    const work = await inbox.upcomingWork(gapi);
    if (!work.length) return 'Nothing due in Classroom this week! 🎉';
    return `Due this week 📚\n${work.slice(0, 8).map((w) => `• ${w.course}: ${w.title} (${inbox.formatDue(new Date(w.due))})`).join('\n')}`;
  } catch (err) {
    return `I couldn’t check Classroom: ${inboxProblem('Classroom', err)}`;
  }
}

async function findJunk() {
  try {
    const j = await inbox.findJunk(gapi);
    junkIds = j.ids;
    if (!j.total) send('say', { text: 'Your inbox is already clean! ✨' });
    else send('inboxJunk', { total: j.total, senders: j.senders });
  } catch (err) {
    send('say', { text: `I couldn’t look through Gmail: ${inboxProblem('Gmail', err)}`, error: true });
  }
}

ipcMain.handle('inbox:draft', async (_e, { id, choice, own } = {}) => {
  const item = inboxItems.get(id);
  if (!item) return { ok: false, text: 'I lost that message, sorry! Open it instead.' };
  try {
    return { ok: true, text: await inbox.draftReply(item, choice, own, settings.aiModel) };
  } catch (err) {
    return { ok: false, text: `I couldn’t write it: ${err.message}` };
  }
});
ipcMain.handle('inbox:send', async (_e, { id, text } = {}) => {
  const item = inboxItems.get(id);
  const body = String(text ?? '').trim();
  if (!item || !body) return { ok: false, text: 'Nothing to send.' };
  try {
    if (item.source === 'gmail') await inbox.sendGmailReply(gapi, item, body);
    else if (item.source === 'chat') await inbox.sendChatReply(gapi, item, body);
    else return { ok: false, text: 'I can’t reply to Classroom posts. Open it instead!' };
    markHandled(id);
    return { ok: true, text: `Sent to ${item.from}! ✅` };
  } catch (err) {
    return { ok: false, text: `It didn’t send: ${inboxProblem(item.source === 'gmail' ? 'Gmail' : 'Google Chat', err)}` };
  }
});
ipcMain.on('inbox:done', (_e, id) => markHandled(id));
ipcMain.on('inbox:open', (_e, id) => {
  markHandled(id);
  const link = inboxItems.get(id)?.link;
  if (link && /^https:\/\//.test(link)) shell.openExternal(link);
});
ipcMain.on('inbox:check', () => checkInbox({ manual: true }));
ipcMain.handle('inbox:clean', async (_e, how) => {
  const ids = junkIds;
  junkIds = [];
  if (!ids.length) return { ok: false, text: 'Nothing to clean.' };
  try {
    const n = await inbox.cleanJunk(gapi, ids, how === 'archive' ? 'archive' : 'trash');
    return { ok: true, text: how === 'archive' ? `Archived ${n} junk emails! 📦 Your inbox is so clean ✨` : `Moved ${n} junk emails to the Trash! 🗑 (You can still get them back for 30 days.)` };
  } catch (err) {
    return { ok: false, text: `Cleaning stopped: ${inboxProblem('Gmail', err)}` };
  }
});

// ---------- Doing things for you: classes, projects, files, documents and presentations ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const osa = (script) =>
  new Promise((resolve, reject) => execFile('osascript', ['-e', script], { timeout: 15_000 }, (err, out, errOut) => (err ? reject(new Error(errOut || err.message)) : resolve(String(out).trim()))));
const hasApp = (name) => fs.existsSync(`/Applications/${name}.app`);
let creating = false;
let lastWork = null; // the last doc or presentation Bbokari made: { action, content, at } (so you can ask for changes)
const lastWorkFile = () => path.join(app.getPath('userData'), 'last-work.json');
function loadLastWork() {
  try {
    lastWork = JSON.parse(fs.readFileSync(lastWorkFile(), 'utf8'));
  } catch {
    lastWork = null;
  }
}
function saveLastWork() {
  try {
    fs.writeFileSync(lastWorkFile(), JSON.stringify(lastWork));
  } catch {}
}

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
      if (a.recipeDeck) return `On it! I’m making a full ${a.topic} presentation with all your calculations (original recipe, scaling, steps, metric, photos…) ✍️ One moment.`;
      if (a.filled) return `On it! I’m putting your ${a.topic} details and calculations into ${a.kind === 'slides' ? 'a presentation' : 'a doc'} ✍️ Give me a minute or two.`;
      if (a.template) return `Ooh, a blank ${a.kind === 'slides' ? 'presentation' : 'doc'} template for ${a.topic}! I’ll set up the spaces and you fill them in. One moment ✍️`;
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
  if (/Cannot find package|ERR_MODULE_NOT_FOUND/i.test(msg)) return 'I need a quick update! Quit me and open me again (I install what’s missing when I start).';
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
    // Recipe projects are built by code (always complete, math always right); everything else is written by the AI.
    const content = a.recipeDeck
      ? await actions.buildRecipeDeck(a.details, { topic: a.topic, theme: a.theme, project: a.projectTitle, model: settings.aiModel })
      : await actions.writeContent(a, settings.aiModel);
    lastWork = { action: a, content, at: Date.now() };
    saveLastWork();
    await deliver(a, content);
  } catch (err) {
    send('say', { text: brainError(err), error: true });
  } finally {
    creating = false;
    send('typing', { on: false });
  }
}

/** "Change the title to …", "add a slide about fun facts", "make it for 6 people": a new, updated version. */
async function updateThing(instruction) {
  creating = true;
  send('typing', { on: true });
  try {
    const { action: a, content } = lastWork;
    // New serving sizes or amounts: work the recipe math out exactly first.
    let calcs = '';
    const details = a.request?.match(/The student's own details:\n([\s\S]*?)(?:\nRecipe calculations|$)/)?.[1] ?? '';
    if (/\b(?:\d+\s*(?:people|servings?|persons?|portions?)|doubl|halve|half|triple|cups?|tbsp|tsp|grams?)\b/i.test(instruction)) {
      calcs = autoRecipeCalcs(`${details}\n${instruction}`) || recipeMath(instruction) || '';
    }
    const next = await actions.editContent(a.kind, content, instruction, settings.aiModel, calcs);
    lastWork = { action: a, content: next, at: Date.now() };
    saveLastWork();
    await deliver(a, next, { update: true });
  } catch (err) {
    send('say', { text: brainError(err), error: true });
  } finally {
    creating = false;
    send('typing', { on: false });
  }
}

/** Saves and opens a doc or presentation where it was asked for (Canva, Google Docs, Keynote…). */
async function deliver(a, content, { update = false } = {}) {
  const done = update ? 'Here’s the updated version' : 'Done!';
  {
    if (a.kind === 'doc') {
      if (a.place === 'gdocs') {
        await actions.saveDoc(content);
        clipboard.write({ html: actions.docHTML(content), text: actions.docText(content) });
        await shell.openExternal('https://docs.new');
        send('say', { text: `“${content.title}” is written! Opening a new Google Doc and pasting it in… 📄` });
        const pasted = await pasteWhenReady(/Google Docs/i);
        send('say', { text: pasted ? `${done} “${content.title}” is in Google Docs 🎉 Tell me if you want to change anything!` : 'Your doc is copied! Click inside the new Google Doc and press ⌘V to paste it 📋' });
      } else {
        const files = await actions.saveDoc(content, { docx: true });
        if (a.place === 'pages' && hasApp('Pages')) execFile('open', ['-a', 'Pages', files.docx]);
        else shell.openPath(files.docx);
        send('say', { text: `${done} “${content.title}” is open 🎉 (It’s saved in Documents → Bbokari Docs.)` });
      }
    } else {
      let file;
      let editUrl = null;
      if (settings.presentationEngine === 'presenton') {
        try {
          ({ file, editUrl } = await presentonFile(content, a));
        } catch (err) {
          send('say', { text: `${err.message}, so I’ll use my own design this time.`, error: true });
        }
      }
      file ??= await actions.savePresentation(content.recipeDeck ? { ...content, photos: await deckPhotos(content) } : content);
      const name = path.basename(file);
      if (editUrl && !(a.place === 'canva' && canva?.connected)) {
        await shell.openExternal(editUrl);
        send('say', { text: `${done} “${content.title}” is open in Presenton 🖼 (The file is also in Documents → Bbokari Docs.) Want changes? Just tell me!` });
        return;
      }
      if (a.place === 'keynote' && hasApp('Keynote')) execFile('open', ['-a', 'Keynote', file]);
      else if (a.place === 'powerpoint' && hasApp('Microsoft PowerPoint')) execFile('open', ['-a', 'Microsoft PowerPoint', file]);
      else if (a.place === 'canva' && canva?.connected) {
        send('say', { text: 'Putting it in Canva for you… 🎨' });
        try {
          const design = await canva.importPresentation(file, content.title);
          await shell.openExternal(design.editUrl);
          send('say', { text: update ? `${done} of “${content.title}”, open in Canva 🎉 (The old one is still in your Canva too.) Want more changes? Just tell me!` : `Done! “${content.title}” is open in Canva 🎉 Want changes? Just tell me, like “add a slide about fun facts”. Tip: Elements on the left adds stickers.` });
          return;
        } catch (err) {
          send('say', { text: `Canva didn’t take it (${err.message}), so here’s the file to drag in instead.`, error: true });
          shell.showItemInFolder(file);
          await shell.openExternal('https://www.canva.com/');
          return;
        }
      } else if (a.place === 'canva') {
        shell.showItemInFolder(file);
        await shell.openExternal('https://www.canva.com/');
        send('say', { text: `Your slides are ready! 🎨 Drag “${name}” from the Finder window onto Canva. (Connect Canva in the menu bar → 🎨 Canva and I’ll open it there myself next time!)` });
        return;
      } else if (a.place === 'gslides') {
        shell.showItemInFolder(file);
        await shell.openExternal('https://drive.google.com/drive/my-drive');
        send('say', { text: `Your slides are ready! 📊 Drag “${name}” into Google Drive, then double-click it and choose “Open with Google Slides”.` });
        return;
      } else shell.openPath(file);
      send('say', { text: `${done} “${content.title}” is open 🎉 (It’s saved in Documents → Bbokari Docs.) Want changes? Just tell me!` });
    }
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
  google = new GoogleAuth({ dir: app.getPath('userData') });
  loadProject();
  loadLastWork();
  canva = new Canva({ dir: app.getPath('userData') });
  inboxState = new inbox.InboxState(path.join(app.getPath('userData'), 'inbox-state.json'));
  setTimeout(() => checkInbox(), 20_000);
  setInterval(() => checkInbox(), 3 * 60_000);
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
  // Back at the Mac: catch you up on anything you missed (only if there is something).
  const welcomeBack = () => setTimeout(() => settings.inboxOn && !settings.hidden && catchUp({ auto: true }), 6000);
  powerMonitor.on('unlock-screen', welcomeBack);
  powerMonitor.on('resume', welcomeBack);
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
