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

const REPO_FA = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'faceaway');
/** Names and sizes of the model's files: changes when the model does. */
function modelStamp(dir) {
  const parts = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else parts.push(`${path.relative(dir, f)}:${fs.statSync(f).size}`); } };
  try { walk(dir); } catch {}
  return parts.sort().join('|');
}
/** True when FaceAway's code in the project is newer than the built program (e.g. after an update). */
export function faceAwayStale() {
  try {
    const built = fs.statSync(FACEAWAY_BIN).mtimeMs;
    return ['FaceAway.swift', 'GlanceFace.swift', 'GlanceUI.swift'].some((f) => fs.statSync(path.join(REPO_FA, f)).mtimeMs > built);
  } catch { return false; }
}

/** Builds FaceAway from ~/FaceAway/FaceAway.swift (taking a newer ~/Downloads/FaceAway.swift first, if there is one). */
export function buildFaceAway(onLine = () => {}) {
  return new Promise((resolve) => {
    try {
      fs.mkdirSync(FACEAWAY_DIR, { recursive: true });
      const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'faceaway');
      // FaceAway + Glance's recognition (GlanceFace) + Glance's setup screen and unlock pill (GlanceUI), with its videos
      for (const f of ['FaceAway.swift', 'GlanceFace.swift', 'GlanceUI.swift', 'LICENSE-glance.txt', 'unlockanimation.mp4', 'unsuccessfulunlockanimation.mp4', 'unlockstatic.png']) fs.copyFileSync(path.join(repo, f), path.join(FACEAWAY_DIR, f));
      // with several files, Swift runs the one called main.swift
      fs.copyFileSync(path.join(repo, 'FaceAway.swift'), path.join(FACEAWAY_DIR, 'main.swift'));
      // only when the face model itself changed: drop the compiled copy so it's rebuilt (your saved faces stay)
      const stamp = modelStamp(path.join(repo, 'ArcFace.mlpackage'));
      const stampFile = path.join(FACEAWAY_DIR, 'model.stamp');
      let old = '';
      try { old = fs.readFileSync(stampFile, 'utf8'); } catch {}
      fs.cpSync(path.join(repo, 'ArcFace.mlpackage'), path.join(FACEAWAY_DIR, 'ArcFace.mlpackage'), { recursive: true });
      if (old && old !== stamp) fs.rmSync(path.join(os.homedir(), 'Library', 'Application Support', 'FaceAway', 'ArcFace.mlmodelc'), { recursive: true, force: true });
      fs.writeFileSync(stampFile, stamp);
    } catch (e) { return resolve({ ok: false, text: e.message }); }
    // macOS 14 or newer (Glance's SwiftUI animations need it)
    const target = `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos14.0`;
    const p = spawn('swiftc', ['-O', '-target', target, 'main.swift', 'GlanceFace.swift', 'GlanceUI.swift', '-o', 'faceaway'], { cwd: FACEAWAY_DIR });
    let err = '';
    p.stderr.on('data', (d) => { err += d; onLine(String(d)); });
    p.on('error', (e) => resolve({ ok: false, text: `Couldn’t run swiftc (${e.message}). Install the Xcode Command Line Tools once.` }));
    p.on('close', (code) => { try { fs.writeFileSync(path.join(FACEAWAY_DIR, 'build.log'), err); } catch {} });
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
const PID_FILE = path.join(FACEAWAY_DIR, 'app.pid');
const LOG_FILE = path.join(FACEAWAY_DIR, 'faceaway.log');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
/** A FaceAway that's still running from before (it keeps going if Bbokari crashes or restarts). */
function survivorPid() {
  try { const pid = Number(fs.readFileSync(PID_FILE, 'utf8')); return pid > 0 && alive(pid) ? pid : null; } catch { return null; }
}
const lastLogLines = () => { try { return fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter((l) => !l.startsWith('---')).slice(-2).join(' '); } catch { return ''; } };

/** Starts FaceAway in the menu bar (unless it's already running). It runs on its own, writing to its log file, so
 *  it isn't taken down if Bbokari crashes. */
export function startFaceAwayApp(args = [], onEarlyExit = () => {}) {
  if (appProc && appProc.exitCode === null) return { ok: true, already: true };
  if (survivorPid()) return { ok: true, already: true };
  if (!fs.existsSync(FACEAWAY_BIN)) return { ok: false, text: 'FaceAway isn’t built yet.' };
  const started = Date.now();
  let fd;
  try { fd = fs.openSync(LOG_FILE, 'a'); fs.writeSync(fd, `\n--- started ${new Date().toLocaleString()} ---\n`); } catch { fd = 'ignore'; }
  const p = spawn(FACEAWAY_BIN, ['--app', ...args], { cwd: FACEAWAY_DIR, stdio: ['ignore', fd, fd], detached: true });
  if (typeof fd === 'number') fs.closeSync(fd);
  p.unref();
  try { fs.writeFileSync(PID_FILE, String(p.pid)); } catch {}
  p.on('exit', (code, signal) => {
    try { fs.appendFileSync(LOG_FILE, `--- stopped (code ${code}${signal ? ', ' + signal : ''}) ---\n`); } catch {}
    try { if (Number(fs.readFileSync(PID_FILE, 'utf8')) === p.pid) fs.unlinkSync(PID_FILE); } catch {}
    if (!p.killedByUs) onEarlyExit(lastLogLines(), Date.now() - started);
  });
  appProc = p;
  appProc.on('error', () => (appProc = null));
  return { ok: true };
}
export function stopFaceAwayApp() {
  if (appProc && appProc.exitCode === null) { appProc.killedByUs = true; appProc.kill(); }
  else { const pid = survivorPid(); if (pid) try { process.kill(pid); } catch {} }
  appProc = null;
  try { fs.unlinkSync(PID_FILE); } catch {}
}
export const faceAwayRunning = () => (!!appProc && appProc.exitCode === null) || !!survivorPid();
