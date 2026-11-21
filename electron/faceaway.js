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
