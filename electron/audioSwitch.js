// Switches the Mac's sound output to the Multi-Output Device while the pet listens to the computer's sound
// (captions 💻, notes), and back to what you had afterwards, so the volume keys work the rest of the time.
// Uses the free SwitchAudioSource tool:  brew install switchaudio-osx
import fs from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';

const BINARIES = ['/opt/homebrew/bin/SwitchAudioSource', '/usr/local/bin/SwitchAudioSource'];
const MULTI = /multi-?output/i;
/** Outputs that aren't real speakers: the virtual cable and combined devices. */
const VIRTUAL = /multi-?output|blackhole|aggregate|soundflower|loopback|zoomaudio|teams audio/i;

function run(bin, args) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: 5000 }, (err, stdout, stderr) => (err ? reject(new Error(stderr?.trim() || err.message)) : resolve(stdout.trim())));
  });
}

export class AudioSwitcher {
  constructor({ onProblem = () => {}, binaries = BINARIES, getNormal = () => null, setNormal = () => {} } = {}) {
    this.onProblem = onProblem;
    /** Your usual output (speakers, headphones…), remembered between runs. */
    this.getNormal = getNormal;
    this.setNormal = setNormal;
    this.listening = false;
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

  /** Your normal output: the one you used last, if it's still there, otherwise the Mac's own speakers or headphones. */
  async #normalOutput() {
    const outputs = await this.#outputs();
    const real = outputs.filter((o) => !VIRTUAL.test(o));
    const remembered = this.getNormal();
    if (remembered && real.includes(remembered)) return remembered;
    return real.find((o) => /macbook|built-?in|speakers|headphones/i.test(o)) ?? real[0] ?? null;
  }

  async #outputs() {
    return (await run(this.bin, ['-a', '-t', 'output'])).split('\n').map((s) => s.trim()).filter(Boolean);
  }

  /** Note the output you're on, if it's a real one, as your normal output. */
  async #remember() {
    const cur = await this.current();
    if (cur && !VIRTUAL.test(cur)) this.setNormal(cur);
    return cur;
  }

  /**
   * When the pet isn't listening to the computer: if the sound is stuck on the Multi-Output Device (where the volume
   * keys don't work), go back to your normal output. Used at startup and whenever listening stops.
   */
  normalize() {
    return this.#serial(async () => {
      if (!this.bin || this.listening) return;
      const cur = await this.#remember();
      if (!MULTI.test(cur)) return;
      const normal = await this.#normalOutput();
      if (normal) await run(this.bin, ['-s', normal, '-t', 'output']);
    });
  }

  useMultiOutput() {
    this.listening = true;
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
      const cur = await this.#remember();
      if (cur === multi) {
        // Already there: remember to go back to your normal output afterwards.
        this.saved = await this.#normalOutput();
        this.multi = multi;
        return;
      }
      await run(this.bin, ['-s', multi, '-t', 'output']);
      this.saved = cur;
      this.multi = multi;
    });
  }

  /** Back to the output you had, unless you've changed it yourself since. */
  restore() {
    this.listening = false;
    return this.#serial(async () => {
      if (!this.bin) return;
      const back = this.saved ?? (await this.#normalOutput());
      const ours = this.multi;
      this.saved = this.multi = null;
      const cur = await this.current();
      // Only if it's still on the Multi-Output Device: if you picked something else meanwhile, keep that.
      if (back && (cur === ours || MULTI.test(cur))) await run(this.bin, ['-s', back, '-t', 'output']);
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
