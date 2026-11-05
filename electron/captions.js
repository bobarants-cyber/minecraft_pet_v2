// Speech to text for live captions, using whisper.cpp's local server (free, offline): `brew install whisper-cpp`
// plus a model file in the project's `models/` folder. The pet starts the server itself the first time it's needed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 8178;
const URL = `http://127.0.0.1:${PORT}`;
const BINARIES = ['/opt/homebrew/bin/whisper-server', '/usr/local/bin/whisper-server'];
/** Better models first. Multilingual ones only (".en" models can't hear other languages). */
const MODEL_PREFERENCE = ['ggml-large-v3-turbo', 'ggml-small', 'ggml-base', 'ggml-tiny'];

export function modelDirs(appRoot) {
  return [path.join(appRoot, 'models'), path.join(os.homedir(), 'whisper-models')];
}

function findBinary() {
  for (const b of BINARIES) if (fs.existsSync(b)) return b;
  for (const dir of (process.env.PATH ?? '').split(':')) {
    const b = path.join(dir, 'whisper-server');
    if (dir && fs.existsSync(b)) return b;
  }
  return null;
}

function findModel(appRoot) {
  const found = [];
  for (const dir of modelDirs(appRoot)) {
    try {
      for (const f of fs.readdirSync(dir)) if (/^ggml-.*\.bin$/.test(f) && !/\.en(-q\d.*)?\.bin$/.test(f)) found.push(path.join(dir, f));
    } catch {}
  }
  const rank = (f) => {
    const i = MODEL_PREFERENCE.findIndex((p) => path.basename(f).startsWith(p));
    return i < 0 ? 99 : i;
  };
  return found.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Whisper {
  constructor(appRoot) {
    this.appRoot = appRoot;
    this.proc = null;
    this.ready = null;
  }

  /** What's installed: { ok, binary, model, problem } — `problem` says what to do when something is missing. */
  status() {
    const binary = findBinary();
    const model = findModel(this.appRoot);
    let problem = null;
    if (!binary) problem = 'Speech recognition isn’t installed yet. In Terminal run:  brew install whisper-cpp';
    else if (!model) problem = 'I need a speech model file. See “Live captions” in the README (one download, about 470 MB).';
    return { ok: !problem, binary, model: model && path.basename(model), problem };
  }

  /** Starts the local server once and waits until it answers. */
  async start() {
    if (this.ready) return this.ready;
    const s = this.status();
    if (!s.ok) throw new Error(s.problem);
    this.ready = (async () => {
      const model = findModel(this.appRoot);
      const threads = String(Math.max(2, Math.min(8, os.cpus().length - 2)));
      this.proc = spawn(s.binary, ['-m', model, '--host', '127.0.0.1', '--port', String(PORT), '-l', 'auto', '-t', threads], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let log = '';
      this.proc.stderr.on('data', (d) => (log = (log + d).slice(-2000)));
      this.proc.on('exit', () => {
        this.proc = null;
        this.ready = null;
      });
      for (let i = 0; i < 120; i++) {
        if (!this.proc) throw new Error(`Speech recognition stopped while starting. ${log.split('\n').slice(-3).join(' ')}`);
        try {
          const res = await fetch(URL, { signal: AbortSignal.timeout(1000) });
          if (res.ok) return true;
        } catch {}
        await sleep(500);
      }
      throw new Error('Speech recognition took too long to start.');
    })();
    this.ready.catch(() => (this.ready = null));
    return this.ready;
  }

  stop() {
    this.proc?.kill();
    this.proc = null;
    this.ready = null;
  }

  /**
   * Transcribes one WAV clip. With `translate`, Whisper translates it into English instead.
   * Resolves with { text, language } (language is Whisper's lowercase English name, e.g. "spanish").
   */
  async transcribe(wav, { translate = false } = {}) {
    await this.start();
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'clip.wav');
    form.append('response_format', 'verbose_json');
    form.append('language', 'auto');
    form.append('temperature', '0');
    form.append('no_timestamps', 'true');
    form.append('translate', translate ? 'true' : 'false');
    const res = await fetch(`${URL}/inference`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
    return { text: String(data.text ?? '').trim(), language: String(data.language ?? data.detected_language ?? '').toLowerCase() };
  }
}
