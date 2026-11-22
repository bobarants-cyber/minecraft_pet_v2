// 📱 Texts between FaceAway and your phone, sent and read by Bbokari (it already may use Messages, and with Full
// Disk Access it can read your replies). FaceAway asks Bbokari to send texts; your Y / N (or "lock") comes back here.
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const DB = path.join(os.homedir(), 'Library', 'Messages', 'chat.db');
const YES = new Set(['y', 'yes', 'yeah', 'yep', 'yup', 'si', 'sí', 's', 'lock', 'bloquear', 'bloquea']);
const NO = new Set(['n', 'no', 'nope', 'nah', 'dont', 'don']);
const LOCK = new Set(['lock', 'bloquear', 'bloquea']);

const q = (x) => '"' + String(x).replace(/["\\]/g, '\\$&') + '"';

/** Sends an iMessage (and a photo, if given) through the Messages app. */
export function sendText(to, message, photo = null) {
  const lines = [
    'tell application "Messages"',
    '  set svc to 1st account whose service type = iMessage',
    `  set who to participant ${q(to)} of svc`,
    `  send ${q(message)} to who`,
    ...(photo ? ['  try', `    send (POSIX file ${q(photo)}) to who`, '  end try'] : []),
    'end tell',
  ];
  return new Promise((resolve) => execFile('osascript', ['-e', lines.join('\n')], { timeout: 20000 }, (err, _o, e) =>
    resolve(err ? { ok: false, text: String(e || err.message).split('\n')[0].slice(0, 200) } : { ok: true })));
}

/** Newer macOS keeps the words inside a blob: they follow "NSString", a '+' and a length byte. */
export function textFromBody(hex) {
  if (!hex || hex.length < 32) return '';
  const b = Buffer.from(hex, 'hex');
  const m = b.indexOf('NSString');
  if (m < 0) return '';
  let k = b.indexOf(0x2b, m + 8);
  if (k < 0 || k + 1 >= b.length) return '';
  k++;
  let len = b[k++];
  if (len === 0x81 && k + 1 < b.length) { len = b[k] | (b[k + 1] << 8); k += 2; }
  return len > 0 && k + len <= b.length ? b.subarray(k, k + len).toString('utf8') : '';
}

/** Is this Messages handle (phone or email) the number we text? */
export function samePerson(handle, to) {
  const a = String(handle).replace(/\D/g, ''), b = String(to).replace(/\D/g, '');
  if (a.length >= 7 && b.length >= 7) return a.endsWith(b.slice(-9)) || b.endsWith(a.slice(-9));
  return !!handle && String(handle).toLowerCase() === String(to).toLowerCase();
}

export const firstWord = (t) => (String(t).toLowerCase().match(/\p{L}+/u) ?? [''])[0];

function sqlite(sql, db = DB) {
  return new Promise((resolve) => execFile('/usr/bin/sqlite3', ['-readonly', '-separator', '\x1f', db, sql], { timeout: 10000, maxBuffer: 8 << 20 },
    (err, out, e) => resolve(err ? { ok: false, err: String(e || err.message) } : { ok: true, out: String(out) })));
}

/** First words of the new messages from `to` after row `after` (not the ones this Mac sent). */
export async function newWords(to, after, db = DB) {
  const r = await sqlite(`SELECT m.ROWID, IFNULL(h.id,''), REPLACE(IFNULL(m.text,''), char(10), ' '), IFNULL(hex(m.attributedBody),''), IFNULL(c.chat_identifier,''), m.is_from_me FROM message m LEFT JOIN handle h ON m.handle_id = h.ROWID LEFT JOIN chat_message_join j ON j.message_id = m.ROWID LEFT JOIN chat c ON c.ROWID = j.chat_id WHERE m.ROWID > ${Number(after) || 0} ORDER BY m.ROWID;`, db);
  if (!r.ok) return { ok: false, err: r.err, last: after, words: [] };
  let last = after;
  const words = [];
  for (const line of r.out.split('\n')) {
    const f = line.split('\x1f');
    if (f.length < 6 || !/^\d+$/.test(f[0])) continue;
    last = Math.max(last, Number(f[0]));
    if (f[5] === '1') continue;
    if (!samePerson(f[1], to) && !(f[4] && samePerson(f[4], to))) continue;
    words.push(firstWord(f[2] || textFromBody(f[3])));
  }
  return { ok: true, last, words };
}

export async function lastRow(db = DB) {
  const r = await sqlite('SELECT IFNULL(MAX(ROWID),0) FROM message;', db);
  return r.ok ? Number(r.out.trim()) || 0 : null;
}

/**
 * Watches for your replies. onAnswer(lock) while a question is waiting; onLock() when you text "lock" any time.
 * onNoAccess() once if Messages can't be read (Full Disk Access).
 */
export function createTexting({ getTo, onAnswer, onLock, onNoAccess, db = DB, every = 4000 }) {
  let row = null, waiting = null, told = false, busy = false;
  const tick = async () => {
    const to = getTo();
    if (!to || busy) return;
    busy = true;
    try {
      if (row === null) { row = await lastRow(db); if (row === null && !told) { told = true; onNoAccess?.(); } return; }
      const r = await newWords(to, row, db);
      if (!r.ok) { if (!told) { told = true; onNoAccess?.(); } return; }
      row = r.last;
      for (const w of r.words) {
        if (waiting && (YES.has(w) || NO.has(w))) { const wt = waiting; waiting = null; onAnswer?.(YES.has(w), wt); continue; }
        if (LOCK.has(w)) onLock?.();
      }
      if (waiting && Date.now() > waiting.until) waiting = null;
    } finally { busy = false; }
  };
  const timer = setInterval(tick, every);
  tick();
  return {
    /** A "Lock computer?" question went out: the next Y / N answers it. */
    expect(info = {}, seconds = 600) { waiting = { ...info, until: Date.now() + seconds * 1000 }; },
    get waiting() { return waiting; },
    stop: () => clearInterval(timer),
    tick,
  };
}
