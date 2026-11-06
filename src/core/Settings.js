// Mirrors electron/settings.js; used as a fallback when running in a plain browser (npx vite).
export const DEFAULTS = {
  mob: 'bee',
  petSize: 210,
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
};

const STORAGE_KEY = 'minecraft_mob.settings.v1';

/** Settings live in the Electron main process; in a browser they fall back to localStorage. */
export async function connectSettings() {
  const host = window.mobHost;
  const settings = { ...DEFAULTS };
  if (host) {
    Object.assign(settings, await host.getSettings());
    host.onSettings((next) => Object.assign(settings, next));
    return { settings, save: (patch) => host.setSettings(patch) };
  }
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {});
  } catch {}
  return {
    settings,
    save: (patch) => {
      Object.assign(settings, patch);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    },
  };
}
