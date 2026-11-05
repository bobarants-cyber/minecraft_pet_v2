// Turning a live audio stream into short speech clips for the speech recogniser. No DOM or Electron here, so it can
// be tested with plain Node.

export const SAMPLE_RATE = 16000;
const FRAME = 320; // 20 ms frames at 16 kHz

/**
 * Cuts speech out of a stream of 16 kHz mono samples: a clip starts when the sound gets clearly louder than the
 * background, and ends after a short pause (or when it gets long), with a little audio kept from before the start.
 * Calls `onClip(Float32Array)` for each clip.
 */
export class SpeechSegmenter {
  constructor({
    onClip,
    sampleRate = SAMPLE_RATE,
    minSpeechMs = 300,
    endSilenceMs = 650,
    maxClipMs = 9000,
    preRollMs = 250,
    minLevel = 0.006,
  }) {
    this.onClip = onClip;
    this.sampleRate = sampleRate;
    this.frame = Math.round((FRAME * sampleRate) / SAMPLE_RATE);
    this.ms = (n) => (n * 1000) / sampleRate;
    this.minSpeechMs = minSpeechMs;
    this.endSilenceMs = endSilenceMs;
    this.maxClipMs = maxClipMs;
    this.preRoll = Math.round((preRollMs * sampleRate) / 1000);
    this.minLevel = minLevel;
    this.noise = 0.01;
    this.pending = new Float32Array(0);
    this.history = [];
    this.historyLen = 0;
    this.clip = null;
    this.silence = 0;
    this.voiced = 0;
  }

  /** Feed any number of samples. */
  push(samples) {
    const all = new Float32Array(this.pending.length + samples.length);
    all.set(this.pending);
    all.set(samples, this.pending.length);
    let i = 0;
    for (; i + this.frame <= all.length; i += this.frame) this.#frame(all.subarray(i, i + this.frame));
    this.pending = all.slice(i);
  }

  /** Send whatever speech is in progress now (e.g. when captions are switched off). */
  flush() {
    if (this.clip && this.voiced >= this.minSpeechMs) this.#emit();
    this.clip = null;
  }

  #frame(f) {
    let sum = 0;
    for (let k = 0; k < f.length; k++) sum += f[k] * f[k];
    const rms = Math.sqrt(sum / f.length);
    // The background level follows quiet moments quickly and loud ones only very slowly.
    this.noise += (rms - this.noise) * (rms < this.noise ? 0.08 : 0.002);
    const threshold = Math.max(this.minLevel, this.noise * 2.8);
    const loud = rms > threshold;
    const len = this.ms(f.length);

    if (!this.clip) {
      this.history.push(f.slice());
      this.historyLen += f.length;
      while (this.historyLen - this.history[0].length >= this.preRoll) this.historyLen -= this.history.shift().length;
      if (loud) {
        this.clip = [...this.history];
        this.history = [];
        this.historyLen = 0;
        this.voiced = len;
        this.silence = 0;
      }
      return;
    }
    this.clip.push(f.slice());
    if (loud) {
      this.voiced += len;
      this.silence = 0;
    } else this.silence += len;
    const clipMs = this.ms(this.clip.reduce((s, c) => s + c.length, 0));
    if (this.silence >= this.endSilenceMs || clipMs >= this.maxClipMs) {
      if (this.voiced >= this.minSpeechMs) this.#emit();
      this.clip = null;
    }
  }

  #emit() {
    const n = this.clip.reduce((s, c) => s + c.length, 0);
    const out = new Float32Array(n);
    let o = 0;
    for (const c of this.clip) {
      out.set(c, o);
      o += c.length;
    }
    this.onClip(out);
  }
}

/** 16-bit PCM WAV file bytes for mono float samples. */
export function encodeWav(samples, sampleRate = SAMPLE_RATE) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

/**
 * Whisper sometimes "hears" stock phrases in silence or music. Returns cleaned text, or '' if it's one of those
 * or just sound labels like [Music].
 */
export function cleanTranscript(text) {
  const t = String(text ?? '')
    .replace(/\[[^\]]*\]|\([^)]*\)|♪+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || /^[\s.,!?¿¡…-]*$/.test(t)) return '';
  // Only phrases that are almost never real speech in a short clip (Whisper picked them up from video credits).
  const junk = /^(thanks for watching!?|thank you for watching\.?|you\.?|subtitles by.*|amara\.org.*|¡?gracias por ver!?|ご視聴ありがとうございました)$/i;
  return junk.test(t) ? '' : t;
}

/** Rough "these two captions say the same thing" check (so the mic hearing your speakers doesn't double up). */
export function similar(a, b) {
  const words = (s) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean));
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return false;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / Math.min(A.size, B.size) >= 0.6;
}
