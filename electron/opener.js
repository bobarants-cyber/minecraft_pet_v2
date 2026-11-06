// "Open …": the pet opens a website or an app by typing it, one key at a time, like a person would:
// websites in a new browser tab, apps through Spotlight. Uses the same Accessibility permission as the text tools.
import fs from 'node:fs';
import { execFile } from 'node:child_process';

/** Friendly names → web addresses. Anything with a dot in it is treated as an address too. */
export const SITES = {
  youtube: 'youtube.com',
  google: 'google.com',
  'google meet': 'meet.google.com',
  meet: 'meet.google.com',
  gmail: 'mail.google.com',
  'google docs': 'docs.google.com',
  docs: 'docs.google.com',
  'google drive': 'drive.google.com',
  drive: 'drive.google.com',
  'google classroom': 'classroom.google.com',
  classroom: 'classroom.google.com',
  'google translate': 'translate.google.com',
  translate: 'translate.google.com',
  maps: 'maps.google.com',
  netflix: 'netflix.com',
  tiktok: 'tiktok.com',
  instagram: 'instagram.com',
  pinterest: 'pinterest.com',
  roblox: 'roblox.com',
  wikipedia: 'wikipedia.org',
  github: 'github.com',
  canva: 'canva.com',
  'claude': 'claude.ai',
  spotify: 'open.spotify.com',
};

const PRETTY = { youtube: 'YouTube', tiktok: 'TikTok', github: 'GitHub', 'google meet': 'Google Meet', meet: 'Google Meet', gmail: 'Gmail', facetime: 'FaceTime', whatsapp: 'WhatsApp' };
const titleCase = (s) => s.replace(/\b\p{L}/gu, (m) => m.toUpperCase());

/** Things that are apps on a Mac (opened through Spotlight), even though some also have websites. */
const APPS = new Set(['zoom', 'notes', 'calculator', 'calendar', 'music', 'photos', 'facetime', 'messages', 'mail', 'safari', 'finder', 'terminal', 'system settings', 'app store', 'pages', 'keynote', 'numbers', 'reminders', 'minecraft', 'discord', 'whatsapp']);

/** Which browser to type into: Chrome if you have it, otherwise Safari. */
function browser() {
  if (fs.existsSync('/Applications/Google Chrome.app')) return { id: 'com.google.Chrome', name: 'Google Chrome' };
  return { id: 'com.apple.Safari', name: 'Safari' };
}

/** Works out what "open X" means: { kind: 'web', text: 'youtube.com', label } or { kind: 'app', text: 'Zoom', label }. */
export function resolve(input) {
  const raw = String(input ?? '').trim().replace(/^(?:the\s+)?/i, '').replace(/[.!?]+$/, '');
  const key = raw.toLowerCase().replace(/\s+(?:app|website|site|page)$/i, '').trim();
  if (!key) return null;
  const label = PRETTY[key] ?? (/\./.test(key) ? key : titleCase(raw));
  if (APPS.has(key)) return { kind: 'app', text: PRETTY[key] ?? titleCase(key), label };
  if (SITES[key]) return { kind: 'web', text: SITES[key], label };
  if (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(key)) return { kind: 'web', text: key.replace(/^https?:\/\//, ''), label };
  // Unknown words: try it as an app (Spotlight finds apps, and falls back to a web search if there's none).
  return { kind: 'app', text: raw, label };
}

function osascript(script) {
  return new Promise((resolveP, reject) => {
    execFile('osascript', ['-e', script], { timeout: 60_000 }, (err, stdout, stderr) => (err ? reject(new Error(stderr?.trim() || err.message)) : resolveP(stdout)));
  });
}

const quote = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** AppleScript that types `text` one character at a time with small, uneven pauses (not a paste). */
export function typingScript(text) {
  const lines = [];
  for (const ch of [...text]) {
    lines.push(`keystroke ${quote(ch)}`);
    // A little slower on the first letters and after spaces or dots, like a real typist.
    const base = ch === ' ' || ch === '.' ? 0.22 : 0.11;
    lines.push(`delay ${(base + Math.random() * 0.12).toFixed(2)}`);
  }
  return lines.join('\n');
}

/** Opens the target by typing it. Resolves when the last key (Return) has been pressed. */
export async function openByTyping(target) {
  if (target.kind === 'web') {
    const b = browser();
    await osascript(
      `tell application id ${quote(b.id)} to activate\n` +
        'delay 0.6\n' +
        'tell application "System Events"\n' +
        'keystroke "t" using command down\n' +
        'delay 0.5\n' +
        `${typingScript(target.text)}\n` +
        'delay 0.3\n' +
        'key code 36\n' +
        'end tell',
    );
    return { where: b.name };
  }
  await osascript(
    'tell application "System Events"\n' +
      'keystroke space using command down\n' +
      'delay 0.7\n' +
      `${typingScript(target.text)}\n` +
      'delay 0.6\n' +
      'key code 36\n' +
      'end tell',
  );
  return { where: 'Spotlight' };
}

/** "open youtube", "can you open zoom", "go to google.com" → the thing to open, or null. */
export function parseOpen(message) {
  const m = String(message ?? '')
    .trim()
    .match(/^(?:(?:can|could|will) you\s+|please\s+)?(?:open(?: up)?|launch|start|go to|take me to)\s+(.{1,60}?)(?:\s+(?:please|for me))?[.!?]*$/i);
  if (!m) return null;
  const words = m[1].trim().split(/\s+/);
  if (words.length > 4) return null; // "open the window and tell me…" is a question, not a command
  const target = resolve(m[1]);
  // "go to sleep", "start a game": only treat go/take me/start as commands for websites we know.
  if (/^(?:(?:can|could|will) you\s+|please\s+)?(?:go to|take me to|start)\b/i.test(message.trim()) && target?.kind !== 'web') return null;
  if (target && /^(?:a|an|my|your|the)\b/i.test(m[1]) && target.kind === 'app' && !APPS.has(target.text.toLowerCase())) return null;
  return target;
}
