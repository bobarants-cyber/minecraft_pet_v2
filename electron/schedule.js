// Your class timetable: which classes happen on which days and times, and their links. The pet opens each class's
// link a couple of minutes before it starts. No Electron imports, so it can be tested with plain Node.
import fs from 'node:fs';
import path from 'node:path';

export const LEAD_MINUTES = 2;
const DEFAULT_LENGTH_MIN = 60;
const COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa', '#f783ac', '#63e6be'];
/** Only web and meeting-app links, so a typo can never make it run a file or a program. */
const SAFE_LINK = /^(https?:\/\/|zoommtg:\/\/|zoomus:\/\/|msteams:\/\/)\S+$/i;

const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
};

export function cleanLink(link) {
  let s = String(link ?? '').trim();
  if (!s) return '';
  if (!/^[a-z]+:\/\//i.test(s) && /^[\w-]+(\.[\w-]+)+(\/|$)/.test(s)) s = `https://${s}`;
  return SAFE_LINK.test(s) ? s : null;
}

/** Checks and tidies one class from the editor. Returns { ok, cls } or { ok: false, error }. */
export function validate(input) {
  const name = String(input?.name ?? '').trim().slice(0, 60);
  if (!name) return { ok: false, error: 'Give the class a name.' };
  const days = [...new Set((input?.days ?? []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
  if (!days.length) return { ok: false, error: 'Pick at least one day.' };
  const start = toMinutes(input?.start);
  if (start === null) return { ok: false, error: 'Set a start time.' };
  let end = toMinutes(input?.end);
  if (end !== null && end <= start) return { ok: false, error: 'The class has to end after it starts.' };
  const link = cleanLink(input?.link);
  if (link === null) return { ok: false, error: 'That link doesn’t look right. Paste the whole link, starting with https://' };
  return {
    ok: true,
    cls: {
      id: input?.id ?? null,
      name,
      days,
      start: input.start.trim().padStart(5, '0'),
      end: end === null ? '' : input.end.trim().padStart(5, '0'),
      link,
      color: input?.color ?? null,
    },
  };
}

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export class ClassSchedule {
  constructor({ file }) {
    this.file = file;
    this.classes = [];
    this.opened = new Set(); // "classId@date": already opened today
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(saved)) this.classes = saved.filter((c) => validate(c).ok);
    } catch {
      this.classes = [];
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.classes, null, 2));
    } catch (err) {
      console.error('Could not save classes:', err);
    }
  }

  list() {
    return [...this.classes].sort((a, b) => a.start.localeCompare(b.start));
  }

  upsert(input) {
    const v = validate(input);
    if (!v.ok) return v;
    const cls = v.cls;
    const existing = this.classes.find((c) => c.id === cls.id);
    if (existing) Object.assign(existing, cls, { color: existing.color });
    else {
      cls.id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      cls.color = COLORS[this.classes.length % COLORS.length];
      this.classes.push(cls);
    }
    this.save();
    return { ok: true, cls: existing ?? cls };
  }

  remove(id) {
    this.classes = this.classes.filter((c) => c.id !== id);
    this.save();
  }

  /** Start and end of `cls` on the day of `now` (Date objects). */
  times(cls, now) {
    const s = toMinutes(cls.start);
    const e = toMinutes(cls.end);
    const start = new Date(now);
    start.setHours(Math.floor(s / 60), s % 60, 0, 0);
    const end = new Date(start.getTime() + ((e ?? s + DEFAULT_LENGTH_MIN) - s) * 60_000);
    return { start, end };
  }

  /** Today's classes in time order, each with startAt / endAt (Dates) next to its start / end ("09:00"). */
  today(now = new Date()) {
    return this.list()
      .filter((c) => c.days.includes(now.getDay()))
      .map((c) => {
        const { start, end } = this.times(c, now);
        return { ...c, startAt: start, endAt: end };
      });
  }

  /**
   * Classes whose link should open now: from LEAD_MINUTES before the start until the class ends, once per day.
   * Each comes with `late: true` if the class has already started (e.g. the Mac was asleep).
   */
  due(now = new Date(), lead = LEAD_MINUTES) {
    const out = [];
    for (const c of this.today(now)) {
      const key = `${c.id}@${dayKey(now)}`;
      if (this.opened.has(key) || !c.link) continue;
      if (now >= new Date(c.startAt.getTime() - lead * 60_000) && now < c.endAt) {
        out.push({ ...c, late: now.getTime() > c.startAt.getTime() + 60_000 });
      }
    }
    return out;
  }

  markOpened(cls, now = new Date()) {
    this.opened.add(`${cls.id}@${dayKey(now)}`);
  }
}
