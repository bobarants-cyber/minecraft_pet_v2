// The bridge to FaceAway (the user's Face ID / panic-screen app). Both apps share a small folder:
//   events.jsonl    FaceAway appends one JSON line per event; we read the new lines and tell the pet.
//   commands.jsonl  we append commands (panic, lock, watch on/off, theme); FaceAway reads and runs them.
// Events: {type:'watching', on}, {type:'stranger'}, {type:'locked'}, {type:'unlocked'}, {type:'panic'},
//         {type:'panicEnd'}, {type:'theme', name} (clean, midnight, sunset, hacker, glass).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const BRIDGE_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'FaceAway', 'bridge');
const EVENTS = path.join(BRIDGE_DIR, 'events.jsonl');
const COMMANDS = path.join(BRIDGE_DIR, 'commands.jsonl');

export class FaceAwayBridge {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.offset = 0;
    this.timer = null;
  }

  start() {
    try { fs.mkdirSync(BRIDGE_DIR, { recursive: true }); } catch {}
    // only events from now on (not the history from earlier runs)
    try { this.offset = fs.statSync(EVENTS).size; } catch { this.offset = 0; }
    this.timer = setInterval(() => this.#poll(), 400);
  }

  stop() {
    clearInterval(this.timer);
  }

  #poll() {
    let size;
    try { size = fs.statSync(EVENTS).size; } catch { return; }
    if (size < this.offset) this.offset = 0; // FaceAway started a fresh file
    if (size === this.offset) return;
    let text = '';
    try {
      const fd = fs.openSync(EVENTS, 'r');
      const buf = Buffer.alloc(Math.min(size - this.offset, 65536));
      fs.readSync(fd, buf, 0, buf.length, this.offset);
      fs.closeSync(fd);
      text = buf.toString('utf8');
    } catch { return; }
    const lastNl = text.lastIndexOf('\n');
    if (lastNl < 0) return; // half a line: wait for the rest
    this.offset += Buffer.byteLength(text.slice(0, lastNl + 1));
    for (const line of text.slice(0, lastNl).split('\n')) {
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      if (ev && typeof ev.type === 'string') this.onEvent(ev);
    }
  }

  /** Asks FaceAway to do something: 'panic', 'lock', 'watch' ({on}), 'theme' ({name}), 'home'. */
  command(type, extra = {}) {
    try {
      fs.mkdirSync(BRIDGE_DIR, { recursive: true });
      fs.appendFileSync(COMMANDS, JSON.stringify({ type, ...extra, at: Date.now() }) + '\n');
      return true;
    } catch {
      return false;
    }
  }
}

// ---------- running FaceAway's program for you (no Terminal needed) ----------
import { spawn } from 'node:child_process';
export const FACEAWAY_DIR = path.join(os.homedir(), 'FaceAway');
export const FACEAWAY_BIN = path.join(FACEAWAY_DIR, 'faceaway');

/** Builds FaceAway from ~/FaceAway/FaceAway.swift (taking a newer ~/Downloads/FaceAway.swift first, if there is one). */
export function buildFaceAway(onLine = () => {}) {
  return new Promise((resolve) => {
    try {
      fs.mkdirSync(FACEAWAY_DIR, { recursive: true });
      const dl = path.join(os.homedir(), 'Downloads', 'FaceAway.swift');
      const src = path.join(FACEAWAY_DIR, 'FaceAway.swift');
      if (fs.existsSync(dl) && (!fs.existsSync(src) || fs.statSync(dl).mtimeMs > fs.statSync(src).mtimeMs)) fs.copyFileSync(dl, src);
      if (!fs.existsSync(src)) return resolve({ ok: false, text: 'FaceAway.swift isn’t in your FaceAway folder or Downloads yet.' });
    } catch (e) { return resolve({ ok: false, text: e.message }); }
    const p = spawn('swiftc', ['-O', 'FaceAway.swift', '-o', 'faceaway'], { cwd: FACEAWAY_DIR });
    let err = '';
    p.stderr.on('data', (d) => { err += d; onLine(String(d)); });
    p.on('error', (e) => resolve({ ok: false, text: `Couldn’t run swiftc (${e.message}). Install the Xcode Command Line Tools once.` }));
    p.on('close', (code) => resolve(code === 0 ? { ok: true } : { ok: false, text: err.split('\n').filter((l) => /error:/.test(l)).slice(0, 4).join('\n') || 'Build failed.' }));
  });
}

/** Runs FaceAway once with these options and collects what it prints (input goes to its standard input). */
export function runFaceAway(args, { input = null, onLine = () => {} } = {}) {
  return new Promise((resolve) => {
    if (!fs.existsSync(FACEAWAY_BIN)) return resolve({ ok: false, text: 'FaceAway isn’t built yet.' });
    const p = spawn(FACEAWAY_BIN, args, { cwd: FACEAWAY_DIR });
    let out = '';
    const take = (d) => { out += d; String(d).split('\n').filter(Boolean).forEach(onLine); };
    p.stdout.on('data', take);
    p.stderr.on('data', take);
    if (input !== null) { p.stdin.write(input + '\n'); p.stdin.end(); }
    p.on('error', (e) => resolve({ ok: false, text: e.message }));
    p.on('close', (code) => resolve({ ok: code === 0, text: out.trim() }));
  });
}

let appProc = null;
/** Starts FaceAway in the menu bar (unless it's already running). */
export function startFaceAwayApp(args = [], onEarlyExit = () => {}) {
  if (appProc && appProc.exitCode === null) return { ok: true, already: true };
  if (!fs.existsSync(FACEAWAY_BIN)) return { ok: false, text: 'FaceAway isn’t built yet.' };
  const started = Date.now();
  let out = '';
  const p = spawn(FACEAWAY_BIN, ['--app', ...args], { cwd: FACEAWAY_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
  const keep = (d) => (out = (out + d).slice(-2000));
  p.stdout.on('data', keep);
  p.stderr.on('data', keep);
  // if it stops right away, say why (e.g. "Choose a password for the panic screen first")
  p.on('close', (code) => { if (Date.now() - started < 8000 && !p.killedByUs) onEarlyExit(out.trim().split('\n').slice(-2).join(' ')); });
  appProc = p;
  appProc.on('error', () => (appProc = null));
  return { ok: true };
}
export function stopFaceAwayApp() {
  if (appProc && appProc.exitCode === null) { appProc.killedByUs = true; appProc.kill(); }
  appProc = null;
}
export const faceAwayRunning = () => !!appProc && appProc.exitCode === null;
