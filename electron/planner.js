// 📅 Homework planner: "plan my science project due Thursday" → small steps spread over the days until it's due,
// each with a reminder. No AI needed (fast and always works). No Electron imports, so it can be tested with Node.

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Is this a "plan my …" request? */
export function looksLikePlan(text) {
  return /\b(?:plan|schedule|organi[sz]e|break (?:down|up))\b/i.test(text) && /\b(?:project|test|exam|quiz|essay|homework|presentation|assignment|report|study|studying|due|by|for (?:mon|tues|wednes|thurs|fri|satur|sun)day)\b/i.test(text) && !/\bplan my day\b/i.test(text);
}

/** The due date in text like "due Thursday", "by Nov 12", "for tomorrow", "in 3 days", "on 11/12". */
export function parseDue(text, now = new Date()) {
  const t = text.toLowerCase();
  const day = (d) => {
    const x = new Date(now);
    x.setHours(23, 59, 0, 0);
    x.setDate(x.getDate() + d);
    return x;
  };
  if (/\btoday\b|\btonight\b/.test(t)) return day(0);
  if (/\btomorrow\b/.test(t)) return day(1);
  const inDays = t.match(/\bin (\d{1,2}) days?\b/);
  if (inDays) return day(Number(inDays[1]));
  if (/\bnext week\b/.test(t)) return day(7);
  const weekday = t.match(/\b(?:next\s+)?(sun|mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?\b/);
  if (weekday) {
    const target = DAY_NAMES.findIndex((n) => n.startsWith(weekday[1].slice(0, 3)));
    let diff = (target - now.getDay() + 7) % 7 || 7;
    if (/\bnext\s+/.test(weekday[0]) && diff < 7) diff += 7;
    return day(diff);
  }
  const named = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/) ?? t.match(/\b(\d{1,2})\s+(?:de\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  if (named) {
    const [mon, dd] = /\d/.test(named[1]) ? [named[2], named[1]] : [named[1], named[2]];
    const x = new Date(now.getFullYear(), MONTHS.indexOf(mon), Number(dd), 23, 59);
    if (x < now) x.setFullYear(x.getFullYear() + 1);
    return x;
  }
  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (slash) {
    const x = new Date(now.getFullYear(), Number(slash[1]) - 1, Number(slash[2]), 23, 59);
    if (x < now) x.setFullYear(x.getFullYear() + 1);
    return x;
  }
  return null;
}

/** What the assignment is called: "my science project due Thursday" → "science project". */
export function planTitle(text) {
  const m = text
    .replace(/^(?:(?:hey|ok)\s+\w+[,!]?\s*)?(?:can you\s+|please\s+|help me\s+)*(?:make (?:me )?a\s+(?:study\s+)?plan for|plan out|plan|schedule|organi[sz]e|break (?:down|up))\s+/i, '')
    .replace(/\b(?:that'?s|which is|it'?s)?\s*(?:due|by|for|on|before)\s+(?:today|tonight|tomorrow|next week|(?:next\s+)?\w+day|in \d+ days?|\w{3,9}\.?\s+\d{1,2}|\d{1,2}\/\d{1,2})\b.*$/i, '')
    .replace(/\s+(?:today|tonight|tomorrow|next week|this week)\b.*$/i, '')
    .replace(/^(?:my|the|a|an|for)\s+/i, '')
    .replace(/[.!?]+$/, '')
    .trim();
  return m || 'your assignment';
}

/** The steps for this kind of work. */
function stepsFor(title, projectText = '') {
  const t = `${title} ${projectText}`.toLowerCase();
  if (/\b(test|exam|quiz|midterm|final)\b/.test(t)) {
    return [
      'Gather your notes and list the topics that will be on it',
      'Review the first half of the topics (say “quiz me” and I’ll make flashcards!)',
      'Review the rest of the topics and redo practice problems',
      'Practice test: answer questions without looking at your notes',
      'Quick final review of what you got wrong, then sleep early 😴',
    ];
  }
  if (/\b(presentation|slides|deck|recipe|kitchen)\b/.test(t)) {
    return [
      'Read the instructions and make a checklist of everything you need',
      'Do the research and the calculations (send me your recipe and I’ll check the math!)',
      'Make the slides (say “make my presentation in canva with my math”)',
      'Add photos and your own words, then check everything against the checklist',
      'Practice presenting out loud 2 times and submit it ✅',
    ];
  }
  if (/\b(essay|report|paper|writing|story|summary)\b/.test(t)) {
    return [
      'Read the instructions and pick your topic',
      'Research and write down your main ideas (an outline)',
      'Write the first draft (I can check your writing while you type!)',
      'Fix the draft: clearer sentences, spelling and grammar',
      'Read it one last time and submit it ✅',
    ];
  }
  if (/\bproject\b/.test(t)) {
    return [
      'Read the instructions and make a checklist',
      'Gather information and materials',
      'Build or write the first version',
      'Finish it and make it look nice',
      'Check it against the checklist and submit it ✅',
    ];
  }
  return ['Start: read it and do the first part', 'Finish the rest', 'Check your answers and hand it in ✅'];
}

/**
 * The plan: { title, due, steps: [{ at: Date (reminder time), text }] }, one step per day (or fewer days if there
 * isn't time). Reminders are at 4:30 pm on school days and 11 am on weekends; a step for today that's already past
 * that time is set for 30 minutes from now.
 */
export function makePlan(text, { now = new Date(), due = null, title = null, projectText = '' } = {}) {
  const when = due ?? parseDue(text, now);
  const name = title ?? planTitle(text);
  if (!when) return { title: name, due: null, steps: [] };
  const steps = stepsFor(name, projectText);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(when);
  end.setHours(0, 0, 0, 0);
  // Work days: today up to the day before it's due (or the due day itself if it's due today).
  let days = Math.max(1, Math.round((end - start) / 86_400_000));
  // After 9 pm, start tomorrow (if there's time): no homework reminders at midnight.
  if (now.getHours() >= 21 && days > 1) {
    start.setDate(start.getDate() + 1);
    days -= 1;
  }
  const perDay = {};
  const out = steps.map((s, i) => {
    // Spread the steps evenly; the last one is always the day before it's due. Short on days → several steps a day.
    const offset = steps.length > days ? Math.floor((i * days) / steps.length) : steps.length === 1 ? days - 1 : Math.round((i * (days - 1)) / (steps.length - 1));
    const k = (perDay[offset] = (perDay[offset] ?? -1) + 1);
    const at = new Date(start);
    at.setDate(at.getDate() + offset);
    const weekend = at.getDay() === 0 || at.getDay() === 6;
    at.setHours(weekend ? 11 : 16, weekend ? 0 : 30, 0, 0);
    if (at <= now) {
      // That time already passed today: start in 30 minutes, 45 minutes between steps.
      at.setTime(now.getTime() + (30 + k * 45) * 60_000);
      at.setSeconds(0, 0);
    } else at.setTime(at.getTime() + k * 60 * 60_000); // an hour between steps on the same day
    return { at, text: s };
  });
  return { title: name, due: when, steps: out };
}

/** The plan as a chat message. */
export function planText(plan) {
  const dayName = (d) => d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  const time = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay = new Set(plan.steps.map((s) => s.at.toDateString())).size < plan.steps.length;
  const lines = plan.steps.map((s) => `• ${dayName(s.at)}${sameDay ? ` ${time(s.at)}` : ''}: ${s.text}`);
  return `📅 Here’s your plan for “${plan.title}” (due ${dayName(plan.due)}):\n${lines.join('\n')}\nI set a reminder for each step ⏰ (Say “list my reminders” to see them.)`;
}
