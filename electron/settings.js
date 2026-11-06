import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export const SIZES = { small: 150, medium: 210, large: 290 };
export const MOBS = { bee: 'Bee', axolotl: 'Axolotl', bbokari: 'Bbokari' };
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
