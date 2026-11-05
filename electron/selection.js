// Reads the text highlighted in whatever app you're using, and pastes text back over it (macOS).
// It works like you would: press ⌘C in that app, read the clipboard, and later ⌘V. Your clipboard is put back after.
// Sending keystrokes needs the Accessibility permission (System Settings → Privacy & Security → Accessibility).
import { execFile } from 'node:child_process';
import { clipboard, systemPreferences } from 'electron';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function osascript(script) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: 4000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message));
      else resolve(stdout.trim());
    });
  });
}

export const supported = process.platform === 'darwin';

/** True if macOS lets us send ⌘C/⌘V. With `prompt`, macOS shows its "allow this app" dialog the first time. */
export function hasPermission(prompt = false) {
  if (!supported) return false;
  return systemPreferences.isTrustedAccessibilityClient(prompt);
}

/** The app in front right now: { pid, id } (id = bundle identifier), or null. */
export async function frontmostApp() {
  if (!supported) return null;
  try {
    const out = await osascript(
      'tell application "System Events" to set p to first application process whose frontmost is true\n' +
        'return (unix id of p as text) & "|" & (bundle identifier of p)',
    );
    const [pid, id] = out.split('|');
    return { pid: Number(pid), id };
  } catch {
    return null;
  }
}

/** Remembers the last app you were in that isn't the pet, so commands go back to it even after clicking the pet. */
export class TargetApp {
  constructor() {
    this.last = null;
  }

  async refresh() {
    const app = await frontmostApp();
    if (app && app.pid !== process.pid && !/electron/i.test(app.id ?? '')) this.last = app;
    return this.last;
  }

  async activate() {
    const app = (await this.refresh()) ?? this.last;
    if (!app?.id) return false;
    const id = app.id.replace(/[^\w.-]/g, '');
    await osascript(`tell application id "${id}" to activate`);
    await sleep(180);
    return true;
  }
}

async function keystroke(key) {
  await osascript(`tell application "System Events" to keystroke "${key}" using command down`);
}

/** Copies the current selection in `target` and returns it ('' if nothing was highlighted). */
export async function copySelection(target) {
  const saved = clipboard.readText();
  const marker = `⁣mob-${Date.now()}`;
  clipboard.writeText(marker);
  try {
    await target.activate();
    await keystroke('c');
    let text = marker;
    for (let i = 0; i < 15 && text === marker; i++) {
      await sleep(60);
      text = clipboard.readText();
    }
    return text === marker ? '' : text;
  } finally {
    clipboard.writeText(saved);
  }
}

/** Pastes `text` into `target`, replacing what's highlighted there, then restores your clipboard. */
export async function pasteText(target, text) {
  const saved = clipboard.readText();
  clipboard.writeText(text);
  await target.activate();
  await keystroke('v');
  await sleep(600);
  clipboard.writeText(saved);
}

/** Turns the AppleScript permission error into something a person can act on. */
export function explain(err) {
  const msg = String(err?.message ?? err);
  if (/not allowed|1002|assistive|accessibility|not authorized|-1743|-25211/i.test(msg)) {
    return (
      'I need permission to copy your highlighted text. Open System Settings → Privacy & Security → Accessibility, ' +
      'and turn on Electron (and Terminal if it’s listed). Then try again!'
    );
  }
  return `I couldn’t grab the text: ${msg}`;
}
