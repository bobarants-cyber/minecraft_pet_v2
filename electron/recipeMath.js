// Recipe math with exact fractions, showing every step (so you can copy the working into your project):
//   "scale the recipe from 2 to 6 servings: 1/2 cup rice, 3 tbsp gochujang, 200 g beef"
//   "2/3 cup times 4"   "multiply 1 1/2 cups by 3"   "3/4 + 2/3"   "$12 for 4 servings"
// No AI involved, so the numbers are always right. No Electron imports, so it can be tested with plain Node.

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

export class Frac {
  constructor(n, d = 1) {
    if (!d) throw new Error('divide by zero');
    if (!Number.isInteger(n) || !Number.isInteger(d)) {
      // Decimals: turn 0.25 into 25/100 first.
      const scale = 10 ** Math.min(6, Math.max(decimals(n), decimals(d)));
      n = Math.round(n * scale);
      d = Math.round(d * scale);
    }
    const s = d < 0 ? -1 : 1;
    const g = gcd(n, d) || 1;
    this.n = (s * n) / g;
    this.d = (s * d) / g;
  }
  add(o) { return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { return new Frac(this.n * o.n, this.d * o.d); }
  div(o) { return new Frac(this.n * o.d, this.d * o.n); }
  get value() { return this.n / this.d; }
}

function decimals(x) {
  const s = String(x);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

/** "1 1/2", "2/3", "0.5", "3" → Frac (or null). */
export function parseQty(s) {
  const t = String(s ?? '').trim();
  let m;
  if ((m = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/))) return new Frac(Number(m[1]) * Number(m[3]) + Number(m[2]), Number(m[3]));
  if ((m = t.match(/^(\d+)\s*\/\s*(\d+)$/))) return new Frac(Number(m[1]), Number(m[2]));
  if ((m = t.match(/^\d+(?:\.\d+)?$/))) return new Frac(Number(t));
  const unicode = { '½': [1, 2], '⅓': [1, 3], '⅔': [2, 3], '¼': [1, 4], '¾': [3, 4], '⅛': [1, 8] };
  if ((m = t.match(/^(\d+)?\s*([½⅓⅔¼¾⅛])$/))) {
    const [a, b] = unicode[m[2]];
    return new Frac((Number(m[1] ?? 0) * b) + a, b);
  }
  return null;
}

const QTY = String.raw`\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?|\d*\s*[½⅓⅔¼¾⅛]`;

/** A friendly way to write a fraction: 8/3 → "8/3 = 2 2/3", 3 → "3", 0.125 kept as fraction. */
export function fmt(f) {
  if (f.d === 1) return String(f.n);
  const whole = Math.trunc(f.n / f.d);
  const rest = Math.abs(f.n % f.d);
  const frac = `${f.n}/${f.d}`;
  if (!whole) return frac;
  return `${frac} = ${whole} ${rest}/${f.d}`;
}
const short = (f) => (f.d === 1 ? String(f.n) : Math.abs(f.n) > f.d ? `${Math.trunc(f.n / f.d)} ${Math.abs(f.n % f.d)}/${f.d}` : `${f.n}/${f.d}`);
const money = (x) => (Math.round(x * 100) / 100).toFixed(2);

/** One ingredient line: "1/2 cup rice" → { qty, rest }. */
function splitItem(item) {
  const m = String(item).trim().match(new RegExp(`^(${QTY})\\s*(.*)$`));
  return m ? { qty: parseQty(m[1]), rest: m[2].trim() } : null;
}

function scaleRecipe(text) {
  const m = text.match(/(?:scale|change|make|convert|resize)\s+(?:the\s+|my\s+|this\s+)?recipe\s+(?:from\s+)?(\d+)\s*(?:servings?|people|portions?)?\s*(?:to|for|into)\s+(\d+)\s*(?:servings?|people|portions?)?\s*[:,\-–]?\s*([\s\S]+)/i);
  if (!m) return null;
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (!from || !to) return null;
  const k = new Frac(to, from);
  const items = m[3].split(/\s*(?:,|;|\n|\band\b)\s*/).map(splitItem).filter(Boolean);
  if (!items.length) return null;
  const lines = [`🧮 Scale factor = ${to} ÷ ${from} = ${fmt(k)}`];
  for (const { qty, rest } of items) {
    const r = qty.mul(k);
    lines.push(`• ${short(qty)} ${rest} × ${short(k)} = ${fmt(r)} ${rest}`);
  }
  lines.push(`So for ${to} servings you need: ${items.map(({ qty, rest }) => `${short(qty.mul(k))} ${rest}`).join(', ')}.`);
  return lines.join('\n');
}

function scaleOne(text) {
  const m = text.match(new RegExp(`^(?:what(?:'s| is)\\s+|multiply\\s+|scale\\s+)?(${QTY})\\s*([a-zA-Z.]+(?:\\s+of\\s+[a-zA-Z ]+?)?)?\\s*(?:by|times|x|×|\\*)\\s*(${QTY})\\s*\\??$`, 'i'));
  if (!m || !m[2]) return null; // plain numbers are the normal calculator's job
  const a = parseQty(m[1]);
  const b = parseQty(m[3]);
  if (!a || !b) return null;
  const r = a.mul(b);
  return `🧮 ${short(a)} ${m[2]} × ${short(b)} = (${a.n} × ${b.n}) / (${a.d} × ${b.d}) = ${fmt(r)} ${m[2]}`;
}

function fractionOp(text) {
  const m = text.match(new RegExp(`^(?:what(?:'s| is)\\s+|calculate\\s+)?(${QTY})\\s*([+\\-−×x*÷/]|plus|minus|times|divided by)\\s*(${QTY})\\s*\\??$`, 'i'));
  if (!m) return null;
  if (!/\//.test(m[1] + m[3]) && !/[½⅓⅔¼¾⅛]/.test(m[1] + m[3])) return null; // no fractions: normal calculator
  const a = parseQty(m[1]);
  const b = parseQty(m[3]);
  if (!a || !b) return null;
  const op = m[2].toLowerCase();
  if (['+', 'plus'].includes(op) || ['-', '−', 'minus'].includes(op)) {
    const plus = ['+', 'plus'].includes(op);
    const d = (a.d * b.d) / gcd(a.d, b.d);
    const an = a.n * (d / a.d);
    const bn = b.n * (d / b.d);
    const r = plus ? a.add(b) : a.sub(b);
    const raw = `${plus ? an + bn : an - bn}/${d}`;
    return `🧮 Common denominator ${d}: ${an}/${d} ${plus ? '+' : '−'} ${bn}/${d} = ${raw === `${r.n}/${r.d}` ? '' : `${raw} = `}${fmt(r)}`;
  }
  if (['×', 'x', '*', 'times'].includes(op)) {
    return `🧮 Multiply tops and bottoms: (${a.n} × ${b.n}) / (${a.d} × ${b.d}) = ${fmt(a.mul(b))}`;
  }
  if (b.n === 0) return 'You can’t divide by zero! 🙃';
  return `🧮 Flip the second and multiply: ${a.n}/${a.d} × ${b.d}/${b.n} = ${fmt(a.div(b))}`;
}

function perServing(text) {
  const m = text.match(/^(?:what(?:'s| is)\s+(?:the\s+)?(?:cost|price)\s+per\s+(?:serving|person|portion)\s+(?:if|when)?\s*(?:it(?:'s| is| costs)?\s*)?)?[$€£]?\s*(\d+(?:\.\d+)?)\s*(?:dollars?|euros?|pounds?)?\s+for\s+(\d+)\s+(servings?|people|persons?|portions?)\s*\??$/i);
  if (!m) return null;
  const total = Number(m[1]);
  const n = Number(m[2]);
  if (!n) return null;
  const sym = (text.match(/[$€£]/) ?? ['$'])[0];
  return `🧮 Cost per ${m[3].replace(/s$/, '').replace(/^people$|^persons?$/, 'person')} = ${sym}${money(total)} ÷ ${n} = ${sym}${money(total / n)}`;
}

/** Answers recipe/fraction math, or null if the message isn't that. */
export function recipeMath(message) {
  const text = String(message ?? '').trim().replace(/^(?:hey|hi|ok)\s+\w+[,!.]?\s*/i, '').replace(/^(?:please|can you|could you)\s+/i, '');
  try {
    return scaleRecipe(text) ?? perServing(text) ?? scaleOne(text) ?? fractionOp(text);
  } catch {
    return null;
  }
}
