// Switches the Mac's sound output to the Multi-Output Device while the pet listens to the computer's sound
// (captions 💻, notes), and back to what you had afterwards, so the volume keys work the rest of the time.
// Uses the free SwitchAudioSource tool:  brew install switchaudio-osx
import fs from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';

const BINARIES = ['/opt/homebrew/bin/SwitchAudioSource', '/usr/local/bin/SwitchAudioSource'];
const MULTI = /multi-?output/i;

function run(bin, args) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: 5000 }, (err, stdout, stderr) => (err ? reject(new Error(stderr?.trim() || err.message)) : resolve(stdout.trim())));
  });
}

export class AudioSwitcher {
  constructor({ onProblem = () => {}, binaries = BINARIES } = {}) {
    this.onProblem = onProblem;
    this.bin = binaries.find((b) => fs.existsSync(b)) ?? null;
    this.saved = null; // the output to go back to
    this.multi = null; // the Multi-Output Device we switched to
    this.told = new Set();
    this.queue = Promise.resolve();
  }

  #once(key, text) {
    if (this.told.has(key)) return;
    this.told.add(key);
    this.onProblem(text);
  }

  current() {
    return run(this.bin, ['-c', '-t', 'output']);
  }

  /** Steps run one after another, so a quick on/off can't get them mixed up. */
  #serial(fn) {
    this.queue = this.queue.then(fn, fn).catch(() => {});
    return this.queue;
  }

  useMultiOutput() {
    return this.#serial(async () => {
      if (!this.bin) {
        this.#once('bin', 'Tip: to switch your sound to Multi-Output Device automatically, open Terminal and run:  brew install switchaudio-osx');
        return;
      }
      const outputs = (await run(this.bin, ['-a', '-t', 'output'])).split('\n').map((s) => s.trim()).filter(Boolean);
      const multi = outputs.find((o) => MULTI.test(o));
      if (!multi) {
        this.#once('multi', 'I couldn’t find a “Multi-Output Device”. Make one in Audio MIDI Setup (see “Live captions” in the README), then I can switch to it for you.');
        return;
      }
      const cur = await this.current();
      if (cur === multi) return; // already there (you picked it): nothing to undo later
      await run(this.bin, ['-s', multi, '-t', 'output']);
      this.saved = cur;
      this.multi = multi;
    });
  }

  /** Back to the output you had, unless you've changed it yourself since. */
  restore() {
    return this.#serial(async () => {
      if (!this.bin || !this.saved) return;
      const back = this.saved;
      const ours = this.multi;
      this.saved = this.multi = null;
      if ((await this.current()) === ours) await run(this.bin, ['-s', back, '-t', 'output']);
    });
  }

  /** For quitting: put the sound back right away. */
  restoreNow() {
    if (!this.bin || !this.saved) return;
    try {
      const cur = execFileSync(this.bin, ['-c', '-t', 'output'], { timeout: 3000 }).toString().trim();
      if (cur === this.multi) execFileSync(this.bin, ['-s', this.saved, '-t', 'output'], { timeout: 3000 });
    } catch {}
    this.saved = this.multi = null;
  }
}
