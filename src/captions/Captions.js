import { PIXELS_PER_UNIT } from '../core/Stage.js';
import { SAMPLE_RATE, SpeechSegmenter, cleanTranscript, encodeWav, similar } from './audio.js';

const MAX_LINES = 3;
const MAX_QUEUE = 4;
const EDGE_PX = 12;
const GAP_PX = 16;
const LANG_NAMES = {
  english: 'English', spanish: 'Español', korean: '한국어', french: 'Français', portuguese: 'Português', german: 'Deutsch',
  italian: 'Italiano', japanese: '日本語', chinese: '中文', arabic: 'العربية',
};
const SOURCES = {
  mic: { icon: '🎤', label: 'You', setting: 'captionsMic' },
  computer: { icon: '💻', label: 'Computer', setting: 'captionsComputer' },
};
const VIRTUAL_DEVICE = /blackhole|loopback|soundflower|virtual/i;
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/**
 * Live captions: listens to your microphone and/or the computer's sound (through the free BlackHole virtual audio
 * device), cuts out speech, has it transcribed on this Mac by Whisper, and shows it as subtitles beside the pet,
 * with a translation line when it's in another language. Nothing is recorded or kept: clips are discarded once read.
 */
export class Captions {
  constructor({ character, settings, save, host, parent = document.body }) {
    this.character = character;
    this.settings = settings;
    this.save = save;
    this.host = host;
    this.sources = {};
    this.queue = [];
    this.working = false;
    this.lines = [];
    this.syncing = false;
    this.problem = null;
    /**
     * Other features that need to hear even with the captions panel hidden (notes, the voice assistant), by name:
     * name → { mic, computer, onLine(line), prompt }.
     */
    this.listeners = new Map();
    /** Called with notices/problems (e.g. for the notes badge). */
    this.onNotice = null;
    /** While the pet is speaking out loud, ignore what the mic hears (it would hear itself). */
    this.mutedUntil = 0;

    this.el = document.createElement('div');
    this.el.className = 'captions';
    this.el.innerHTML = `
      <div class="captions__head">
        <span class="captions__dot"></span>
        <span class="captions__title">Live captions</span>
        <button type="button" class="captions__chip" data-src="mic" title="Caption my microphone">🎤</button>
        <button type="button" class="captions__chip" data-src="computer" title="Caption the computer's sound (needs BlackHole)">💻</button>
        <span class="captions__lang"></span>
        <button type="button" class="captions__close" title="Turn captions off" aria-label="Turn captions off">×</button>
      </div>
      <div class="captions__lines" aria-live="polite"></div>
    `;
    this.dot = this.el.querySelector('.captions__dot');
    this.linesEl = this.el.querySelector('.captions__lines');
    this.langEl = this.el.querySelector('.captions__lang');
    this.el.querySelector('.captions__close').addEventListener('click', () => this.save({ captionsOn: false }));
    for (const chip of this.el.querySelectorAll('.captions__chip')) {
      chip.addEventListener('click', () => {
        const key = SOURCES[chip.dataset.src].setting;
        this.save({ [key]: !this.settings[key] });
      });
    }
    parent.appendChild(this.el);
  }

  get visible() {
    return !!this.settings.captionsOn;
  }

  contains(node) {
    return this.el.contains(node);
  }

  containsPoint(x, y) {
    if (!this.visible) return false;
    const r = this.el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /** Called every frame: match what's listening to the settings, keep the panel beside the pet, show the level. */
  update() {
    const on = this.visible;
    this.el.classList.toggle('on', on);
    const extra = [...this.listeners.values()];
    const want = {
      mic: (on && !!this.settings.captionsMic) || extra.some((l) => l.mic),
      computer: (on && !!this.settings.captionsComputer) || extra.some((l) => l.computer),
    };
    for (const chip of this.el.querySelectorAll('.captions__chip')) chip.classList.toggle('is-on', !!this.settings[SOURCES[chip.dataset.src].setting]);
    this.langEl.textContent = `→ ${LANG_NAMES[this.settings.captionsLang] ?? 'English'}`;
    // Re-check only when the settings change, so a missing permission or device doesn't retry every frame.
    const key = JSON.stringify(want);
    if (!this.syncing && key !== this.wantKey) {
      this.wantKey = key;
      this.#sync(want);
    }
    if (!on) return;
    const level = Math.max(0, ...Object.values(this.sources).map((s) => s.level ?? 0));
    this.dot.style.transform = `scale(${1 + Math.min(1.2, level * 14)})`;
    this.dot.classList.toggle('live', Object.keys(this.sources).length > 0);
    this.el.classList.toggle('busy', this.working);
    this.#place();
  }

  async #sync(want) {
    this.syncing = true;
    try {
      for (const kind of Object.keys(SOURCES)) {
        if (want[kind] && !this.sources[kind]) await this.#open(kind);
        else if (!want[kind] && this.sources[kind]) this.#close(kind);
      }
      if (!want.mic && !want.computer && this.visible) this.#notice('Turn on 🎤 or 💻 to start captions.');
    } finally {
      this.syncing = false;
    }
  }

  async #open(kind) {
    if (!this.host?.transcribe) return this.#notice('Captions only work in the desktop app.', true);
    const status = await this.host.captionsStatus();
    if (!status.ok) return this.#notice(status.problem, true);
    if (status.mic !== 'granted' && !(await this.host.askMic())) {
      return this.#notice('I need the microphone: System Settings → Privacy & Security → Microphone → turn on Electron.', true);
    }
    try {
      let deviceId;
      if (kind === 'computer') {
        // Device names are only readable once we've been allowed to use audio, so ask for any input first.
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        probe.getTracks().forEach((t) => t.stop());
        const devices = await navigator.mediaDevices.enumerateDevices();
        const dev = devices.find((d) => d.kind === 'audioinput' && VIRTUAL_DEVICE.test(d.label));
        if (!dev) {
          // Taking notes without BlackHole: listen through the microphone instead.
          const needComputer = [...this.listeners.values()].filter((l) => l.computer);
          if (needComputer.length) {
            for (const l of needComputer) Object.assign(l, { computer: false, mic: true });
            if (!needComputer.some((l) => l.anySource)) this.onNotice?.('No BlackHole, so I’m listening through the 🎤 microphone instead.', false);
          }
          // Only a problem if you asked the captions panel for the computer's sound; notes just use the mic.
          if (!this.settings.captionsComputer || !this.visible) return;
          this.save({ captionsComputer: false });
          return this.#notice('To caption the computer’s sound, install BlackHole first (see “Live captions” in the README).', true);
        }
        deviceId = dev.deviceId;
      }
      const voice = kind === 'mic';
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          channelCount: 1,
          echoCancellation: voice,
          noiseSuppression: voice,
          autoGainControl: voice,
        },
      });
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      const input = ctx.createMediaStreamSource(stream);
      const tap = ctx.createScriptProcessor(4096, 1, 1);
      const mute = ctx.createGain();
      mute.gain.value = 0; // the tap has to be connected to run, but we don't want to hear ourselves
      const src = { stream, ctx, tap, level: 0 };
      src.segmenter = new SpeechSegmenter({ onClip: (clip) => this.#enqueue(kind, clip) });
      tap.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < data.length; i += 8) sum += data[i] * data[i];
        src.level = Math.sqrt(sum / (data.length / 8));
        src.segmenter.push(data);
      };
      input.connect(tap);
      tap.connect(mute);
      mute.connect(ctx.destination);
      this.sources[kind] = src;
      this.problem = null;
      if (kind === 'computer') this.host?.computerAudio?.(true);
      if (!this.lines.length) this.#notice(`Listening… (${kind === 'mic' ? '🎤 your microphone' : '💻 the computer'})`);
    } catch (err) {
      this.#notice(`I couldn’t open the ${kind === 'mic' ? 'microphone' : 'computer sound'}: ${err.message ?? err}`, true);
    }
  }

  #close(kind) {
    const s = this.sources[kind];
    if (!s) return;
    s.segmenter.flush();
    s.tap.onaudioprocess = null;
    s.stream.getTracks().forEach((t) => t.stop());
    s.ctx.close();
    delete this.sources[kind];
    if (kind === 'computer') this.host?.computerAudio?.(false);
  }

  /** Start (or update) a background listener; see `listeners`. */
  listen(name, opts) {
    this.listeners.set(name, { ...opts });
  }

  unlisten(name) {
    this.listeners.delete(name);
  }

  #enqueue(kind, clip) {
    if (kind === 'mic' && performance.now() < this.mutedUntil) return;
    this.queue.push({ kind, wav: encodeWav(clip), at: performance.now() });
    // Stay live: if speech comes faster than it can be read, skip the oldest clips.
    while (this.queue.length > MAX_QUEUE) this.queue.shift();
    this.#drain();
  }

  async #drain() {
    if (this.working) return;
    this.working = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift();
        const prompt = [...this.listeners.values()].map((l) => l.prompt).filter(Boolean).join(' ') || undefined;
        const res = await this.host.transcribe({ wav: job.wav, target: this.settings.captionsLang || 'english', prompt });
        if (!res.ok) {
          this.#notice(`Captions hit a problem: ${res.error}`, true);
          continue;
        }
        const text = cleanTranscript(res.text);
        if (!text) continue;
        // With speakers on, the mic hears the computer too; don't show the same words twice.
        if (job.kind === 'mic' && this.lines.some((l) => l.kind === 'computer' && job.at - l.at < 6000 && similar(l.text, text))) continue;
        const line = { kind: job.kind, text, language: res.language, translation: cleanTranscript(res.translation) || null, at: job.at };
        if (this.visible) this.#add(line);
        for (const l of this.listeners.values()) if (l.onLine && (l[job.kind] || l.anySource)) l.onLine({ ...line, time: Date.now() });
      }
    } finally {
      this.working = false;
    }
  }

  #notice(text, isProblem = false) {
    this.problem = isProblem ? text : null;
    this.onNotice?.(text, isProblem);
    this.linesEl.replaceChildren(Object.assign(document.createElement('div'), { className: `captions__notice${isProblem ? ' is-problem' : ''}`, textContent: text }));
    this.lines = [];
  }

  #add(line) {
    if (!this.lines.length) this.linesEl.replaceChildren();
    this.lines.push(line);
    const row = document.createElement('div');
    row.className = 'captions__line';
    const who = document.createElement('span');
    who.className = 'captions__who';
    who.textContent = `${SOURCES[line.kind].icon}${line.language && line.language !== this.settings.captionsLang ? ` ${cap(line.language)}` : ''}`;
    const said = document.createElement('span');
    said.className = 'captions__text';
    said.textContent = line.text;
    row.append(who, said);
    if (line.translation) {
      const tr = document.createElement('div');
      tr.className = 'captions__tr';
      tr.textContent = `🌐 ${line.translation}`;
      row.appendChild(tr);
    }
    this.linesEl.appendChild(row);
    while (this.linesEl.children.length > MAX_LINES) this.linesEl.firstElementChild.remove();
    this.lines = this.lines.slice(-MAX_LINES);
    [...this.linesEl.children].forEach((r, i, all) => (r.style.opacity = String(0.55 + (0.45 * (i + 1)) / all.length)));
  }

  /** Sit at the bottom of the screen beside the pet, on the side away from any game panel. */
  #place() {
    const c = this.character;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const s = c.placement.scale;
    const x = W / 2 + c.loco.x * PIXELS_PER_UNIT;
    const half = c.mob.halfWidth * s * PIXELS_PER_UNIT;
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const gameOnRight = !!c.game && document.querySelector('.game-panel.on')?.getBoundingClientRect().left > x;
    const leftSpot = x - half - GAP_PX - w;
    const rightSpot = x + half + GAP_PX;
    let left = gameOnRight || x > W / 2 ? leftSpot : rightSpot;
    if (left < EDGE_PX) left = rightSpot;
    if (left + w > W - EDGE_PX) left = Math.max(EDGE_PX, leftSpot);
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(H - h - EDGE_PX)}px`;
  }
}
