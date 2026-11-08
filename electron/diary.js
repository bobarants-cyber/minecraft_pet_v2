// 📓 Bbokari's diary: how long you spent on each kind of thing today (writing, videos, games…), plus small wins
// (focus sessions, to-dos ticked, things made). "How was my day?" turns it into a little story. Saved on this Mac
// only, for the last 14 days. No Electron imports, so it can be tested with plain Node.
import fs from 'node:fs';
import path from 'node:path';

const LABELS = {
  writing: ['✍️', 'writing'],
  coding: ['💻', 'coding'],
  reading: ['📖', 'reading'],
  meeting: ['🎥', 'in class or meetings'],
  video: ['📺', 'watching videos'],
  music: ['🎵', 'listening to music'],
  gaming: ['🎮', 'gaming'],
  drawing: ['🎨', 'drawing and designing'],
  browsing: ['🌐', 'browsing'],
};
const WINS = {
  focus: (n) => `${n} focus session${n === 1 ? '' : 's'} 🍅`,
  todo: (n) => `${n} to-do${n === 1 ? '' : 's'} ticked off ✅`,
  made: (n) => `${n} doc${n === 1 ? '' : 's'} or presentation${n === 1 ? '' : 's'} made 📄`,
  quiz: (n) => `${n} flashcard quiz${n === 1 ? '' : 'zes'} 🃏`,
  plan: (n) => `${n} homework plan${n === 1 ? '' : 's'} made 📅`,
};
const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA');
const nice = (ms) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
};

export class Diary {
  constructor(file) {
    this.file = file;
    try {
      this.days = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      this.days = {};
    }
    this.current = null; // { kind, since }
    this.dirty = false;
  }

  #today() {
    const k = dayKey();
    this.days[k] ??= { time: {}, wins: {} };
    return this.days[k];
  }

  save() {
    if (!this.dirty) return;
    // Keep two weeks.
    for (const k of Object.keys(this.days).sort().slice(0, -14)) delete this.days[k];
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.days));
      this.dirty = false;
    } catch {}
  }

  /** Call when what you're doing changes (kind can be null for "nothing special"). */
  activity(kind, now = Date.now()) {
    if (this.current?.kind && LABELS[this.current.kind]) {
      // Bbokari checks in every 5 minutes, so a longer gap means the Mac was asleep: that time doesn't count.
      const spent = Math.min(now - this.current.since, 6 * 60_000);
      const t = this.#today().time;
      t[this.current.kind] = (t[this.current.kind] ?? 0) + spent;
      this.dirty = true;
    }
    this.current = { kind, since: now };
  }

  /** Something good happened: 'focus', 'todo', 'made', 'quiz', 'plan'. */
  win(type) {
    const w = this.#today().wins;
    w[type] = (w[type] ?? 0) + 1;
    this.dirty = true;
    this.save();
  }

  /** "How was my day?" */
  story(now = Date.now()) {
    this.activity(this.current?.kind ?? null, now); // count the time up to now
    this.save();
    const d = this.#today();
    const times = Object.entries(d.time).filter(([, ms]) => ms >= 60_000).sort((a, b) => b[1] - a[1]);
    const wins = Object.entries(d.wins).map(([k, n]) => WINS[k]?.(n)).filter(Boolean);
    if (!times.length && !wins.length) return '📓 Today’s page is still empty! Do some work with me and ask again later 🐥';
    const lines = ['📓 Today with Bbokari:'];
    for (const [kind, ms] of times.slice(0, 6)) lines.push(`${LABELS[kind][0]} ${nice(ms)} ${LABELS[kind][1]}`);
    if (wins.length) lines.push(`🏆 Wins: ${wins.join(', ')}`);
    const work = (d.time.writing ?? 0) + (d.time.coding ?? 0) + (d.time.reading ?? 0) + (d.time.drawing ?? 0) + (d.time.meeting ?? 0);
    const fun = (d.time.video ?? 0) + (d.time.gaming ?? 0);
    lines.push(
      work >= 60 * 60_000 ? 'You worked really hard today! I’m proud of you 💛' : fun > work * 2 && fun > 45 * 60_000 ? 'Lots of fun today! Maybe a 25-minute focus session tomorrow? 🍅' : 'Nice day! Keep going 💪',
    );
    // Compared with yesterday.
    const y = this.days[dayKey(new Date(now - 86_400_000))];
    if (y) {
      const yWork = (y.time.writing ?? 0) + (y.time.coding ?? 0) + (y.time.reading ?? 0) + (y.time.drawing ?? 0) + (y.time.meeting ?? 0);
      if (yWork > 10 * 60_000 && work > yWork * 1.2) lines.push(`That’s more work than yesterday (${nice(yWork)}) 📈`);
    }
    return lines.join('\n');
  }
}
