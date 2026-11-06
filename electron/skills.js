// Quick things the pet can do instantly, without the AI: maths, dates, coin flips, a to-do list, the weather,
// translations and a focus timer. Each skill gets the message first; if none matches, the AI answers instead.
import fs from 'node:fs';
import path from 'node:path';

const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clean = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

// ---------- calculator ----------

/** Safely evaluates + - × ÷ ^ % ( ) and decimals (no code is ever run). Returns a number or null. */
export function calculate(expr) {
  const src = String(expr)
    .toLowerCase()
    .replace(/×|x(?=\s*[\d(.])/g, '*')
    .replace(/÷/g, '/')
    .replace(/,(?=\d{3}\b)/g, '')
    .replace(/\bplus\b/g, '+')
    .replace(/\bminus\b/g, '-')
    .replace(/\b(times|multiplied by)\b/g, '*')
    .replace(/\b(divided by|over)\b/g, '/')
    .replace(/\b(to the power of|squared)\b/g, (m) => (m === 'squared' ? '^2' : '^'))
    .replace(/\s+/g, '');
  if (!/^[\d.+\-*/^%()]+$/.test(src) || !/\d/.test(src)) return null;
  const tokens = src.match(/\d*\.?\d+|[+\-*/^%()]/g);
  if (!tokens || tokens.join('') !== src) return null;
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  // expr := term (('+'|'-') term)* ; term := factor (('*'|'/') factor)* ; factor := unary ('^' factor)? ; unary := '-' unary | atom '%'?
  const expression = () => {
    let v = term();
    while (peek() === '+' || peek() === '-') v = next() === '+' ? v + term() : v - term();
    return v;
  };
  const term = () => {
    let v = factor();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const r = factor();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const factor = () => {
    const base = unary();
    if (peek() === '^') {
      next();
      return base ** factor();
    }
    return base;
  };
  const unary = () => {
    if (peek() === '-') {
      next();
      return -unary();
    }
    if (peek() === '+') {
      next();
      return unary();
    }
    let v;
    if (peek() === '(') {
      next();
      v = expression();
      if (next() !== ')') throw new Error('bracket');
    } else {
      const t = next();
      if (t === undefined || !/^\d*\.?\d+$/.test(t)) throw new Error('number');
      v = Number(t);
    }
    if (peek() === '%') {
      next();
      v /= 100;
    }
    return v;
  };
  try {
    const v = expression();
    if (i !== tokens.length || !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}

const nice = (n) => (Number.isInteger(n) ? n.toLocaleString('en-US') : Number(n.toPrecision(10)).toLocaleString('en-US', { maximumFractionDigits: 6 }));

function mathSkill(text) {
  const t = text.toLowerCase().replace(/[?!=]+\s*$/, '').trim();
  // "15% of 80"
  const pct = /^(?:what(?:'s| is)\s+)?(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)$/.exec(t);
  if (pct) return `${pct[1]}% of ${pct[2]} is ${nice((Number(pct[1]) / 100) * Number(pct[2]))} 🧮`;
  const sq = /^(?:what(?:'s| is)\s+)?(?:the\s+)?square root of\s*(\d+(?:\.\d+)?)$/.exec(t);
  if (sq) return `The square root of ${sq[1]} is ${nice(Math.sqrt(Number(sq[1])))} 🧮`;
  const m = /^(?:what(?:'s| is)\s+|calculate\s+|calc\s+|how much is\s+)?(.+)$/.exec(t);
  const expr = m[1];
  // Only treat it as maths if it really looks like a sum (has an operator between numbers).
  if (!/\d\s*(?:[+\-*/^×÷x%]|plus|minus|times|divided by|multiplied by|over|to the power of)\s*[\d(-]|\d\s*squared|^\(/.test(expr)) return null;
  if (/\/\s*0(?![\d.])/.test(expr.replace(/divided by|over/g, '/')) && calculate(expr.replace(/\/\s*0(?![\d.])/g, '/1')) !== null) return 'You can’t divide by zero! 🙃 Even I know that.';
  const v = calculate(expr);
  if (v === null) return null;
  return `${expr.replace(/\*/g, '×').replace(/\//g, '÷')} = ${nice(v)} 🧮`;
}

// ---------- time & dates ----------

const HOLIDAYS = {
  christmas: [12, 25],
  'new year': [1, 1],
  "new year's": [1, 1],
  halloween: [10, 31],
  "valentine's day": [2, 14],
  valentines: [2, 14],
  'valentine’s day': [2, 14],
};

function daysUntil(month, day, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(now.getFullYear(), month - 1, day);
  if (target < today) target = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.round((target - today) / 86_400_000);
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function timeSkill(text, now = new Date()) {
  const t = text.toLowerCase().replace(/[?!.]+$/, '').trim();
  if (/^(?:what(?:'s| is) the time|what time is it|time|the time)(?: now)?$/.test(t)) {
    return `It’s ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} 🕐`;
  }
  if (/^(?:what(?:'s| is) (?:the )?(?:date|day)(?: today)?|what day is it(?: today)?|today'?s date|date)$/.test(t)) {
    return `Today is ${now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} 📅`;
  }
  const until = /^how (?:many|much) (?:days|time|long) (?:until|till|to|before) (.+)$/.exec(t);
  if (until) {
    let what = until[1].replace(/^(?:my\s+)?/, '').trim();
    let md = HOLIDAYS[what];
    const dm = /^(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?$|^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+)$/.exec(what);
    if (!md && dm) {
      const month = MONTHS.indexOf((dm[1] ?? dm[4] ?? '').toLowerCase()) + 1;
      const day = Number(dm[2] ?? dm[3]);
      if (month && day >= 1 && day <= 31) md = [month, day];
    }
    if (md) {
      const n = daysUntil(md[0], md[1], now);
      const name = what.replace(/\b\p{L}/u, (c) => c.toUpperCase());
      return n === 0 ? `It’s today! 🎉` : `${n} day${n === 1 ? '' : 's'} until ${name} 🗓`;
    }
  }
  return null;
}

// ---------- little helpers ----------

const EIGHT_BALL = ['Yes, definitely! ✨', 'It is certain. 🔮', 'Without a doubt!', 'Most likely.', 'Signs point to yes. 👀', 'Ask again later… 💤', 'Better not tell you now 🤐', 'Cannot predict now.', 'Don’t count on it.', 'My reply is no. 🙅', 'Very doubtful.', 'Outlook good! 🌈'];

function funSkill(text) {
  const t = text.toLowerCase().replace(/[!.]+$/, '').trim();
  if (/^(?:flip|toss) a coin$|^heads or tails\??$|^coin flip$/.test(t)) return `🪙 It’s… ${pick(['heads', 'tails'])}!`;
  const dice = /^roll (?:a |one |the )?(?:(\d+)\s*)?(?:dice|die|d(\d+))$/.exec(t);
  if (dice || /^roll$/.test(t)) {
    const n = Math.min(10, Number(dice?.[1] ?? 1));
    const sides = Number(dice?.[2] ?? 6);
    const rolls = Array.from({ length: n }, () => rand(1, sides));
    return `🎲 ${rolls.join(' + ')}${n > 1 ? ` = ${rolls.reduce((a, b) => a + b, 0)}` : ''}`;
  }
  const num = /^(?:pick |give me |choose )?(?:a )?random number(?: (?:from|between) (-?\d+) (?:to|and|-) (-?\d+))?$/.exec(t);
  if (num) {
    const lo = Number(num[1] ?? 1);
    const hi = Number(num[2] ?? 100);
    return `🎰 ${rand(Math.min(lo, hi), Math.max(lo, hi))}`;
  }
  if (/^(?:magic )?8[- ]?ball\b|^magic 8\b/.test(t)) return `🎱 ${pick(EIGHT_BALL)}`;
  const choose = /^(?:pick|choose|decide)(?: between)?:?\s+(.+?)\s+or\s+(.+)$/.exec(t);
  if (choose) {
    const opts = choose[1].split(/,\s*|\s+or\s+/).concat(choose[2]).map((s) => s.trim()).filter(Boolean);
    return `I pick… ${pick(opts)}! 🐥`;
  }
  return null;
}

// ---------- to-do list ----------

export class TodoList {
  constructor(file) {
    this.file = file;
    try {
      this.items = JSON.parse(fs.readFileSync(file, 'utf8')).filter((x) => x && typeof x.text === 'string');
    } catch {
      this.items = [];
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.items, null, 2));
    } catch {}
  }

  list() {
    return this.items;
  }

  handle(text) {
    const t = clean(text);
    const add = /^(?:please\s+)?(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:my|the)\s+(?:to-?do\s+)?(?:list|to-?dos?)$/i.exec(t) ?? /^(?:remember to|todo:?|to-?do:?)\s+(.+)$/i.exec(t);
    if (add) {
      const item = add[1].replace(/^["“]|["”]$/g, '').slice(0, 120);
      this.items.push({ text: item, added: Date.now() });
      this.save();
      return { text: `Added “${item}” to your list ✅ (${this.items.length} thing${this.items.length === 1 ? '' : 's'} to do)` };
    }
    if (/^(?:show\s+|what(?:'s| is) on\s+)?(?:my|the)\s+(?:to-?do\s+)?(?:list|to-?dos?)\??$/i.test(t) || /^(?:to-?dos?|to-?do list)\??$/i.test(t)) {
      if (!this.items.length) return { text: 'Your list is empty! 🎉 Say “add … to my list” to add something.' };
      return { text: `Your list:\n${this.items.map((x, i) => `${i + 1}. ${x.text}`).join('\n')}` };
    }
    const done = /^(?:done|finished|completed|tick off|check off|remove|delete|cross off)\s+(?:with\s+)?(.+?)(?:\s+(?:from|off)\s+(?:my|the)\s+list)?$/i.exec(t);
    if (done && !this.items.length && /\b(list|to-?do)\b|^done\b/i.test(t)) return { text: 'Your list is already empty! 🎉' };
    if (done && this.items.length) {
      const q = done[1].toLowerCase();
      const n = /^#?(\d+)$/.exec(q);
      const idx = n ? Number(n[1]) - 1 : this.items.findIndex((x) => x.text.toLowerCase().includes(q) || q.includes(x.text.toLowerCase()));
      if (idx >= 0 && idx < this.items.length) {
        const [gone] = this.items.splice(idx, 1);
        this.save();
        const empty = !this.items.length;
        return { text: empty ? `Done: “${gone.text}”. That was the last one, your list is clear! 🎉` : `Done: “${gone.text}” ✔️ ${this.items.length} left.`, effect: empty ? 'confetti' : 'sparkle' };
      }
      return { text: `I couldn’t find “${done[1]}” on your list. Say “my list” to see it.` };
    }
    if (/^(?:clear|empty|delete)\s+(?:my|the)\s+(?:to-?do\s+)?list$/i.test(t)) {
      this.items = [];
      this.save();
      return { text: 'Your list is clear! 🧹' };
    }
    return null;
  }
}

// ---------- weather (open-meteo.com: free, no key) ----------

const WEATHER_CODES = [
  [[0], 'clear skies', '☀️', 'sunny'],
  [[1, 2], 'partly cloudy', '🌤', 'sunny'],
  [[3], 'cloudy', '☁️', 'cloudy'],
  [[45, 48], 'foggy', '🌫', 'cloudy'],
  [[51, 53, 55, 56, 57], 'drizzly', '🌦', 'rain'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'rainy', '🌧', 'rain'],
  [[71, 73, 75, 77, 85, 86], 'snowy', '❄️', 'snow'],
  [[95, 96, 99], 'stormy', '⛈', 'rain'],
];

export async function weather(city, { fetchFn = fetch } = {}) {
  const geo = await (await fetchFn(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(city)}`, { signal: AbortSignal.timeout(8000) })).json();
  const place = geo.results?.[0];
  if (!place) return { text: `I couldn’t find a place called “${city}”. Try another spelling?` };
  const q = `latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
  const w = await (await fetchFn(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(8000) })).json();
  const code = w.current?.weather_code;
  const [, words, icon, mood] = WEATHER_CODES.find(([codes]) => codes.includes(code)) ?? [[], 'nice', '🌈', 'cloudy'];
  const temp = Math.round(w.current?.temperature_2m);
  const hi = Math.round(w.daily?.temperature_2m_max?.[0]);
  const lo = Math.round(w.daily?.temperature_2m_min?.[0]);
  const tip = mood === 'rain' ? ' Take an umbrella! ☔' : mood === 'snow' ? ' Bundle up! 🧣' : temp >= 28 ? ' Stay cool and drink water! 💧' : temp <= 5 ? ' Wear a warm coat! 🧥' : '';
  return { text: `${icon} ${place.name}: ${temp}°C and ${words} (today ${lo}–${hi}°C).${tip}`, effect: `weather:${mood}` };
}

// ---------- the dispatcher ----------

export class Skills {
  constructor({ dir, settings, saveSettings, translate, startFocus, stopFocus, focusLeft }) {
    this.todos = new TodoList(path.join(dir, 'todos.json'));
    this.settings = settings;
    this.saveSettings = saveSettings;
    this.translate = translate;
    this.startFocus = startFocus;
    this.stopFocus = stopFocus;
    this.focusLeft = focusLeft;
  }

  /** Handles `text` if it's one of the quick skills: resolves with { text, effect? } or null. */
  async handle(text) {
    const t = clean(text);
    if (!t) return null;
    const simple = mathSkill(t) ?? timeSkill(t) ?? funSkill(t);
    if (simple) return { text: simple };
    const todo = this.todos.handle(t);
    if (todo) return todo;

    // Weather.
    const city = /^(?:my (?:city|town) is|i live in)\s+(.+?)[.!]?$/i.exec(t);
    if (city) {
      this.saveSettings({ homeCity: city[1] });
      return { text: `Got it, I’ll remember you live in ${city[1]} 🏡. Ask me “weather” any time!` };
    }
    const w = /^(?:what(?:'s| is) the\s+)?(?:weather|forecast|temperature)(?:\s+(?:like\s+)?(?:in|for|at)\s+(.+?))?(?:\s+(?:today|now|right now))?\??$/i.exec(t) ?? /^(?:is it (?:going to )?(?:rain|raining|snow|cold|hot))(?:\s+(?:in|today))?\??$/i.exec(t);
    if (w) {
      const place = w[1] ?? this.settings.homeCity;
      if (!place) return { text: 'Which city? Say “weather in Madrid”, or “my city is Madrid” and I’ll remember it 🌍' };
      try {
        return await weather(place);
      } catch {
        return { text: 'I couldn’t check the weather right now. Are you connected to the internet? 🌐' };
      }
    }

    // Translate.
    const tr = /^(?:translate|how do (?:you|i) say)\s+["“]?(.+?)["”]?\s+(?:to|in|into)\s+([a-zà-ÿ]+(?:\s[a-z]+)?)\??$/i.exec(t);
    if (tr) {
      const lang = tr[2].charAt(0).toUpperCase() + tr[2].slice(1).toLowerCase();
      const out = await this.translate(tr[1], lang);
      return { text: out ? `🌍 ${lang}: ${out}` : 'I couldn’t translate that right now. Is the Ollama app open?' };
    }

    // Focus timer.
    const focus = /^(?:start\s+)?(?:a\s+)?(?:focus|pomodoro|study)(?:\s+(?:time|timer|session|mode))?(?:\s+(?:for\s+)?(\d{1,3})(?:\s*(?:min|mins|minutes))?)?$/i.exec(t);
    if (focus) {
      const minutes = Math.min(180, Math.max(1, Number(focus[1] ?? 25)));
      this.startFocus(minutes);
      return { text: `🍅 Focus time! ${minutes} minutes. I’ll work right next to you and tell you when it’s break time. You’ve got this! 💪`, effect: 'focus' };
    }
    if (/^(?:stop|end|cancel)\s+(?:the\s+)?(?:focus|pomodoro|study)(?:\s+(?:timer|session|mode))?$/i.test(t)) {
      const left = this.focusLeft();
      if (left === null) return { text: 'There’s no focus timer running.' };
      this.stopFocus();
      return { text: 'Focus timer stopped. Good work! 🌟' };
    }
    return null;
  }
}
