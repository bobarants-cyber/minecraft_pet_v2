import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export const SIZES = { small: 150, medium: 210, large: 290 };
export const MOBS = { bee: 'Bee', axolotl: 'Axolotl', bbokari: 'Bbokari', wolfchan: 'Wolf Chan', jiniret: 'Jiniret', gliddy: 'Gliddy', gliddyReal: 'Gliddy (realistic)', gliddyPlush: 'Gliddy (plush)', gliddyPlushStrawberry: 'Gliddy plush: Strawberry', gliddyPlushMint: 'Gliddy plush: Mint', gliddyPlushMidnight: 'Gliddy plush: Midnight', gliddyPlushChoco: 'Gliddy plush: Chocolate', gliddyPlushMini: 'Gliddy plush: Mini keychain', cortisYellow: 'CORTIS (yellow)', cortisWhite: 'CORTIS (white)', cortisBlue: 'CORTIS (blue)', cortisPink: 'CORTIS (pink)', cortisGreen: 'CORTIS (green)' };
/** Caption translation targets, keyed by Whisper's language names. */
export const CAPTION_LANGUAGES = {
  english: 'English',
  spanish: 'Español',
  korean: '한국어',
  french: 'Français',
  portuguese: 'Português',
  german: 'Deutsch',
  italian: 'Italiano',
  japanese: '日本語',
  chinese: '中文',
  arabic: 'العربية',
};

export const DEFAULTS = {
  mob: 'bee',
  petSize: SIZES.medium,
  autoWalk: true,
  walkSpeed: 1,
  idleSleepMin: 5,
  openAtLogin: false,
  aiModel: 'llama3.2',
  captionsOn: false,
  captionsMic: true,
  captionsComputer: false,
  captionsLang: 'english',
  autoNotes: true,
  voiceOn: false,
  voiceSpeak: false,
  reactToActivity: true,
  breakReminders: true,
  homeCity: '',
  outfit: 'none',
  autoSwitchAudio: true,
  normalOutput: '',
  checkWriting: true,
  hidden: false,
  // 📬 Inbox buddy (Gmail, Google Chat, Classroom): off until you connect your Google account.
  inboxOn: false,
  inboxGmail: true,
  inboxChat: true,
  inboxClassroom: true,
  // Presentations: Bbokari's own design, or Presenton (open source, github.com/presenton/presenton) running on this Mac.
  presentationEngine: 'bbokari',
  presentonUrl: 'http://localhost:5001',
  presentonKey: '',
  // Real food photos in Bbokari's own design, from Pixabay (free key from pixabay.com/api/docs).
  pixabayKey: '',
  deckPhotos: true,
  seenUpdate: '',
  // 🖱 Bbokari is your mouse pointer (the pet is hidden but keeps working).
  cursorMode: false,
  // 📱 Phone link: Pocket Bbokari on your iPhone can use this Mac's features (same Wi-Fi, 6-digit code). Off by default.
  phoneLink: false,
  phoneCode: '',
  cursorHideArrow: true, // hide the real arrow too, so only the Bbokari pointer shows
};

const file = () => path.join(app.getPath('userData'), 'settings.json');

export function loadSettings() {
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    stored = {};
  }
  const settings = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) if (key in stored) settings[key] = stored[key];
  return settings;
}

export function saveSettings(settings) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(settings, null, 2));
}
