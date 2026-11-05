// Reminders and timers: a small plain-English parser plus a store that fires them on time.
// No Electron imports, so this file can be tested with plain Node.
import fs from 'node:fs';
import path from 'node:path';

const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fortyfive: 45, sixty: 60,
};
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000 };
const WORD_NUM = String.raw`(?:an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty(?:-?five)?|sixty)`;
const UNIT_WORD = String.raw`(?:seconds?|secs?|minutes?|mins?|hours?|hrs?)`;
// "5 minutes", "5min", "90s", "an hour" — single-letter units only straight after digits, so "7:30 am" or "a hat" never count.
const PART = String.raw`(?:\d+(?:\.\d+)?\s*(?:${UNIT_WORD}|[smh])|${WORD_NUM}\s+${UNIT_WORD})\b`;
const DURATION_PART = new RegExp(String.raw`\b(\d+(?:\.\d+)?|${WORD_NUM})\s*(${UNIT_WORD}|[smh])\b`, 'gi');
const DURATION_RUN = new RegExp(String.raw`(?:\b(?:in|for|after)\s+)?(?:\bhalf\s+an?\s+hour\b|(?<![:\d])\b${PART}(?:\s*(?:and\s+)?(?:a\s+half\b|${PART}))*)`, 'i');
const AT_TIME = /\b(?:at|by)\s+(noon|midnight|(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?)(?=\s|$|[.,!?])/i;
const BARE_TIME = /(?:\b(?:for|at|by)\s+)?\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=\s|$|[.,!?])/i;

function unitOf(word) {
  const w = word.toLowerCase();
  if (w.startsWith('h')) return 'h';
  if (w.startsWith('m')) return 'm';
  return 's';
}

/** Milliseconds described by text like "1 hour 30 minutes", "90s", "half an hour", "an hour and a half". */
export function parseDuration(text) {
  if (/\bhalf\s+an?\s+hour\b/i.test(text)) return 30 * 60_000;
  let total = 0;
  let lastUnit = null;
  for (const m of text.matchAll(DURATION_PART)) {
    const raw = m[1].toLowerCase();
    const n = NUMBER_WORDS[raw] ?? Number(raw);
    if (!Number.isFinite(n)) continue;
    lastUnit = unitOf(m[2]);
    total += n * UNIT_MS[lastUnit];
  }
  if (total && lastUnit && /\band\s+a\s+half\b/i.test(text)) total += UNIT_MS[lastUnit] / 2;
  return total || null;
}

/** Next moment matching a clock time like "3pm", "15:30", "7:05 am", "noon". */
export function parseClockTime(match, now) {
  let hour;
  let minute = 0;
  let meridiem = null;
  const word = match[1]?.toLowerCase();
  if (word === 'noon') hour = 12;
  else if (word === 'midnight') hour = 0;
  else {
    hour = Number(match[2]);
    minute = Number(match[3] ?? 0);
    meridiem = match[4]?.toLowerCase().replace(/\./g, '') ?? null;
    if (hour > 23 || minute > 59) return null;
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  }
  const at = new Date(now);
  at.setSeconds(0, 0);
  at.setHours(hour, minute);
  // "at 5" with no am/pm: pick whichever of 5:00 or 17:00 comes next.
  if (!meridiem && word !== 'noon' && word !== 'midnight' && hour < 12 && at <= now) {
    at.setHours(hour + 12);
  }
  while (at <= now) at.setDate(at.getDate() + 1);
  return at;
}

function cleanTask(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.:;-]+|[\s,.!?;:-]+$/g, '')
    .replace(/^(?:please\s+)?(?:to|that|about|of)\s+/i, '')
    .replace(/\s+(?:please)$/i, '')
    .trim();
}

/**
 * Understands requests like:
 *   "set a timer for 5 minutes", "10 min timer", "remind me in 20 minutes to drink water",
 *   "remind me to call mom at 5pm", "alarm at 7:30 am", "list my reminders", "cancel my timers".
 * Returns null when the text isn't about reminders or timers.
 */
export function parseCommand(input, now = new Date()) {
  const text = input.trim();
  const lower = text.toLowerCase();
  const mentionsTimer = /\btimers?\b/.test(lower);
  const mentionsReminder = /\b(reminders?|alarms?)\b/.test(lower);

  if ((mentionsTimer || mentionsReminder) && /\b(cancel|stop|clear|delete|remove|turn off)\b/.test(lower)) {
    const kind = mentionsTimer && !mentionsReminder ? 'timer' : mentionsReminder && !mentionsTimer ? 'reminder' : null;
    return { type: 'cancel', kind };
  }
  if (
    (mentionsTimer || mentionsReminder) &&
    (/\b(list|show|what|which|any|check|how (?:long|much time))\b/.test(lower) || /^(?:my\s+)?(?:reminders|timers|alarms)\??$/.test(lower))
  ) {
    return { type: 'list' };
  }

  const isRemind = /\bremind\s+me\b/.test(lower) || /\b(?:set|make|add|create)\s+(?:a|an)\s+(?:reminder|alarm)\b/.test(lower) || /^(?:reminder|alarm)\b/.test(lower);
  const isTimer = mentionsTimer && !isRemind;
  if (!isRemind && !isTimer && !/\b(?:wake me(?: up)?)\b/.test(lower)) return null;

  const isAlarm = /\balarm\b/.test(lower);
  const atMatch = AT_TIME.exec(text);
  const bareMatch = !atMatch && (isRemind || isAlarm) ? BARE_TIME.exec(text) : null;
  const durationMatch = DURATION_RUN.exec(text);
  const duration = durationMatch ? parseDuration(durationMatch[0]) : null;
  const tomorrow = /\btomorrow\b/i.test(text);

  let when = null;
  const strip = [];
  if (duration) {
    when = new Date(now.getTime() + duration);
    strip.push(durationMatch[0]);
  } else if (atMatch || bareMatch) {
    // Normalise both regexes to [full, word, hour, minute, meridiem].
    const m = atMatch ?? [bareMatch[0], null, bareMatch[1], bareMatch[2], bareMatch[3]];
    when = parseClockTime(m, now);
    if (when && tomorrow) {
      const t = new Date(now);
      t.setDate(t.getDate() + 1);
      if (when.toDateString() !== t.toDateString()) when.setDate(when.getDate() + 1);
    }
    strip.push(m[0]);
  }
  if (!when) return { type: 'needTime', kind: isTimer ? 'timer' : 'reminder' };

  if (isTimer) return { type: 'add', kind: 'timer', at: when.getTime(), duration, label: null };

  let task = text;
  for (const s of strip) task = task.replace(s, ' ');
  task = task
    .replace(/\b(?:can|could|would|will)\s+you\s+/gi, ' ')
    .replace(/\bplease\b/gi, ' ')
    .replace(/\bremind\s+me\b/gi, ' ')
    .replace(/\b(?:set|make|add|create)\s+(?:a|an)\s+(?:reminder|alarm)\b/gi, ' ')
    .replace(/^\s*(?:reminder|alarm)\b:?/i, ' ')
    .replace(/\bwake me(?: up)?\b/gi, ' wake up ')
    .replace(/\b(?:today|tonight|tomorrow)\b/gi, ' ');
  task = cleanTask(task);
  if (/^(?:for|at|in|by)$/i.test(task)) task = '';
  return { type: 'add', kind: 'reminder', at: when.getTime(), duration, label: task || (isAlarm ? 'Alarm!' : null) };
}

export function formatClock(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const totalMin = Math.round(s / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const parts = [];
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  return parts.join(' and ');
}

function describe(r, now) {
  const left = formatDuration(Math.max(0, r.at - now));
  if (r.kind === 'timer') return `a ${formatDuration(r.duration ?? r.at - r.created)} timer (${left} left)`;
  return `“${r.label ?? 'reminder'}” at ${formatClock(r.at)} (in ${left})`;
}

/** Keeps reminders in a JSON file and calls `onFire(reminder, text)` when one is due. */
export class ReminderStore {
  constructor({ file, onFire, onChange = () => {} }) {
    this.file = file;
    this.onFire = onFire;
    this.onChange = onChange;
    this.items = [];
    this.nextId = 1;
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(saved)) this.items = saved.filter((r) => r && Number.isFinite(r.at));
      this.nextId = this.items.reduce((m, r) => Math.max(m, r.id + 1), 1);
    } catch {
      this.items = [];
    }
    this.interval = null;
  }

  start() {
    this.interval ??= setInterval(() => this.tick(), 1000);
    this.tick();
  }

  stop() {
    clearInterval(this.interval);
    this.interval = null;
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.items, null, 2));
    } catch (err) {
      console.error('Could not save reminders:', err);
    }
    this.onChange(this.items);
  }

  add({ kind, at, duration = null, label = null }) {
    const r = { id: this.nextId++, kind, at, duration, label, created: Date.now() };
    this.items.push(r);
    this.items.sort((a, b) => a.at - b.at);
    this.save();
    return r;
  }

  cancel(kind = null) {
    const before = this.items.length;
    this.items = kind ? this.items.filter((r) => r.kind !== kind) : [];
    const removed = before - this.items.length;
    if (removed) this.save();
    return removed;
  }

  cancelId(id) {
    const before = this.items.length;
    this.items = this.items.filter((r) => r.id !== id);
    if (this.items.length !== before) this.save();
  }

  tick(now = Date.now()) {
    const due = this.items.filter((r) => r.at <= now);
    if (!due.length) return;
    this.items = this.items.filter((r) => r.at > now);
    this.save();
    for (const r of due) {
      const late = now - r.at > 60_000;
      const text =
        r.kind === 'timer'
          ? `⏰ Ding! Your ${formatDuration(r.duration ?? r.at - r.created)} timer is done!`
          : `⏰ ${late ? 'I missed this one while I was off: ' : 'Reminder: '}${r.label ?? 'this is your reminder!'}`;
      this.onFire(r, text);
    }
  }

  describeAll(now = Date.now()) {
    if (!this.items.length) return "You don't have any reminders or timers right now.";
    const lines = this.items.map((r) => `• ${describe(r, now)}`);
    return `Here's what I'm keeping track of:\n${lines.join('\n')}`;
  }

  /** Handles a parsed command and returns the reply text. */
  handle(cmd, now = Date.now()) {
    if (cmd.type === 'list') return this.describeAll(now);
    if (cmd.type === 'cancel') {
      const n = this.cancel(cmd.kind);
      const noun = cmd.kind ?? 'item';
      if (!n) return `You don't have any ${cmd.kind ? `${cmd.kind}s` : 'reminders or timers'} to cancel.`;
      return `Done! I cancelled ${n} ${noun}${n === 1 ? '' : 's'}.`;
    }
    if (cmd.type === 'needTime') {
      return cmd.kind === 'timer'
        ? 'How long should the timer be? Try “set a timer for 5 minutes”.'
        : 'When should I remind you? Try “remind me in 10 minutes to stretch” or “remind me at 5pm to call mom”.';
    }
    if (cmd.type === 'add') {
      const r = this.add(cmd);
      if (r.kind === 'timer') return `Timer set for ${formatDuration(r.duration)}! I'll let you know at ${formatClock(r.at)}.`;
      const what = r.label ? ` to ${r.label}` : '';
      const inTime = r.duration ? `in ${formatDuration(r.duration)}` : `at ${formatClock(r.at)}`;
      return `Okay! I'll remind you${what} ${inTime}.`;
    }
    return null;
  }
}
