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

const QTY = String.raw`\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d*\s*[½⅓⅔¼¾⅛]|\d+(?:\.\d+)?`;

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
const asFrac = (f) => (f.d === 1 ? String(f.n) : `${f.n}/${f.d}`);

/** "3/2 × 2 = 6/2 = 3": multiply as improper fractions, show the unsimplified answer, then the simple one. */
function mulSteps(a, b) {
  const rawN = a.n * b.n;
  const rawD = a.d * b.d;
  const r = a.mul(b);
  const raw = rawD === 1 ? String(rawN) : `${rawN}/${rawD}`;
  const parts = [`${asFrac(a)} × ${asFrac(b)}`, raw];
  if (raw !== asFrac(r)) parts.push(asFrac(r));
  if (r.d !== 1 && Math.abs(r.n) > r.d) parts.push(short(r));
  return parts.join(' = ');
}

const UNITS = /^(cups?|c\b|tablespoons?|tbsp|tbs|teaspoons?|tsp|grams?|g\b|kilograms?|kg|ml|milliliters?|millilitres?|liters?|litres?|l\b|oz|ounces?|pounds?|lbs?|pinch(?:es)?|cloves?|slices?|pieces?|cans?|sticks?)\s*(?:of\s+)?/i;

/** One ingredient line: "1/2 cup rice" → { qty, unit: 'cup', name: 'rice' }. */
function splitItem(item) {
  const m = String(item).trim().match(new RegExp(`^(${QTY})\\s*(.*)$`));
  if (!m) return null;
  const rest = m[2].trim();
  const u = rest.match(UNITS);
  return { qty: parseQty(m[1]), unit: u ? u[1] : '', name: u ? rest.slice(u[0].length).trim() : rest };
}

function scaleRecipe(text) {
  const m = text.match(/(?:scale|change|make|convert|resize)\s+(?:the\s+|my\s+|this\s+)?recipe\s+(?:from\s+)?(\d+)\s*(?:servings?|people|portions?)?\s*(?:to|for|into)\s+(\d+(?:\.\d+)?)\s*(?:servings?|people|portions?)?\s*[:,\-–]?\s*([\s\S]+)/i);
  if (!m) return null;
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (!from || !to) return null;
  const k = new Frac(to, from);
  const items = m[3].split(/\s*(?:,|;|\n|\band\b)\s*/).map(splitItem).filter(Boolean);
  if (!items.length) return null;
  const lines = [`🧮 Scale factor = ${to} ÷ ${from} = ${fmt(k)}${k.d !== 1 || k.n !== to ? '' : ''}`];
  const mixed = items.some(({ qty }) => qty.d !== 1 && Math.abs(qty.n) > qty.d);
  if (mixed) lines.push('Tip: mixed numbers become improper fractions first (1 1/2 = 3/2).');
  for (const { qty, unit, name } of items) {
    lines.push(`• ${name || unit}: ${mulSteps(qty, k)}${unit && name ? ` ${unit}` : ''}`);
  }
  lines.push(`So for ${to} servings you need: ${items.map(({ qty, unit, name }) => `${short(qty.mul(k))} ${[unit, name].filter(Boolean).join(' ')}`).join(', ')}.`);
  return lines.join('\n');
}

function scaleOne(text) {
  const m = text.match(new RegExp(`^(?:what(?:'s| is)\\s+|multiply\\s+|scale\\s+)?(${QTY})\\s*([a-zA-Z.]+(?:\\s+of\\s+[a-zA-Z ]+?)?)?\\s*(?:by|times|x|×|\\*)\\s*(${QTY})\\s*\\??$`, 'i'));
  if (!m || !m[2]) return null; // plain numbers are the normal calculator's job
  const a = parseQty(m[1]);
  const b = parseQty(m[3]);
  if (!a || !b) return null;
  return `🧮 ${mulSteps(a, b)} ${m[2]}`;
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
    return `🧮 Multiply tops and bottoms: ${mulSteps(a, b)}`;
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

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((c) => SUP[c] ?? c).join('');

/** 190 → "1.9 × 10²", 0.0015 → "1.5 × 10⁻³". */
export function sci(x) {
  if (!x) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = Number((x / 10 ** e).toPrecision(4));
  return m === 10 ? `1 × 10${sup(e + 1)}` : `${m} × 10${sup(e)}`;
}

function sciNotation(text) {
  const m = text.match(/^(?:what(?:'s| is)\s+|write\s+|convert\s+|put\s+)?(\d[\d,]*(?:\.\d+)?|\.\d+)\s*([a-zA-Zµ]+)?\s+(?:in(?:to)?|to|as)\s+scientific\s+notation\s*\??$/i);
  if (!m) return null;
  const x = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(x)) return null;
  const e = x ? Math.floor(Math.log10(Math.abs(x))) : 0;
  const how = e > 0 ? `move the decimal point ${e} place${e === 1 ? '' : 's'} left` : e < 0 ? `move the decimal point ${-e} place${e === -1 ? '' : 's'} right` : 'it’s already between 1 and 10';
  return `🧮 ${m[1]}${m[2] ? ` ${m[2]}` : ''} = ${sci(x)}${m[2] ? ` ${m[2]}` : ''}  (${how}, so the exponent is ${e})`;
}

// Approximate kitchen weights: grams in 1 cup / 1 tbsp / 1 tsp.
const GRAMS = {
  flour: { cup: 125, tbsp: 8, tsp: 2.6 }, sugar: { cup: 200, tbsp: 12.5, tsp: 4.2 }, salt: { cup: 290, tbsp: 18, tsp: 6 },
  'baking powder': { cup: 220, tbsp: 13.8, tsp: 4.6 }, butter: { cup: 227, tbsp: 14.2, tsp: 4.7 }, rice: { cup: 185, tbsp: 11.5, tsp: 3.9 },
  'brown sugar': { cup: 220, tbsp: 13.8, tsp: 4.6 }, oats: { cup: 90, tbsp: 5.6, tsp: 1.9 }, cocoa: { cup: 85, tbsp: 5.3, tsp: 1.8 },
};
const ML = { cup: 240, tbsp: 15, tsp: 5 };
const UNIT = { cup: 'cup', cups: 'cup', c: 'cup', tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbs: 'tbsp', teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp' };

function convert(text) {
  const m = text.match(new RegExp(`^(?:convert\\s+|change\\s+|how (?:much|many)\\s+(?:is|are)\\s+)?(${QTY})\\s*(cups?|c|tablespoons?|tbsp|tbs|teaspoons?|tsp)\\s+(?:of\\s+)?([a-zA-Z ]{2,25}?)\\s+(?:in|to|into)\\s+(grams?|g|kilograms?|kg|ml|milliliters?|millilitres?|liters?|litres?|l)\\s*\\??$`, 'i'));
  if (!m) return null;
  const qty = parseQty(m[1]);
  const unit = UNIT[m[2].toLowerCase()];
  const food = m[3].trim().toLowerCase();
  const target = m[4].toLowerCase();
  if (!qty || !unit) return null;
  const amount = qty.value;
  if (/^(ml|milli|l$|lit)/.test(target)) {
    const ml = amount * ML[unit];
    const out = /^l|^lit/.test(target) ? `${Number((ml / 1000).toPrecision(3))} L` : `${Math.round(ml)} mL`;
    const val = /^l|^lit/.test(target) ? ml / 1000 : ml;
    return `🧮 ${short(qty)} ${unit} ${food} ≈ ${short(qty)} × ${ML[unit]} mL = ${out} = ${sci(val)} ${/^l|^lit/.test(target) ? 'L' : 'mL'} (about; 1 ${unit} ≈ ${ML[unit]} mL)`;
  }
  const key = Object.keys(GRAMS).sort((a, b) => b.length - a.length).find((k) => food.includes(k));
  if (!key) return `I don’t know how heavy “${food}” is 🤔 I know: ${Object.keys(GRAMS).join(', ')}. For liquids (milk, water) ask for mL instead.`;
  const g = amount * GRAMS[key][unit];
  const kg = /^k/.test(target);
  const val = kg ? g / 1000 : g;
  const shown = kg ? `${Number(val.toPrecision(3))} kg` : `${Number(g.toPrecision(3))} g`;
  return `🧮 ${short(qty)} ${unit} ${food} ≈ ${short(qty)} × ${GRAMS[key][unit]} g = ${shown} = ${sci(val)} ${kg ? 'kg' : 'g'} (about; 1 ${unit} of ${key} ≈ ${GRAMS[key][unit]} g)`;
}

/** Answers recipe/fraction math, or null if the message isn't that. */
export function recipeMath(message) {
  const text = String(message ?? '').trim().replace(/^(?:hey|hi|ok)\s+\w+[,!.]?\s*/i, '').replace(/^(?:please|can you|could you)\s+/i, '');
  try {
    return scaleRecipe(text) ?? perServing(text) ?? sciNotation(text) ?? convert(text) ?? scaleOne(text) ?? fractionOp(text);
  } catch {
    return null;
  }
}

/**
 * Finds a recipe in pasted project details ("bibimbap for 2 people: 1 cup rice, 1/2 cup spinach…") and works out the
 * scaled amounts the details ask for (doubled, halved, or "for 6 people"); doubled and halved if nothing is said.
 * Returns the worked steps as text ('' if there's no recipe).
 */
export function autoRecipeCalcs(text) {
  const t = String(text ?? '');
  const m = t.match(/(?:serves|for|feeds|makes)\s+(\d+)\s*(?:servings?|people|persons?|portions?)?\s*[:\-–]\s*([^\n]+?)(?:\.\s|\n|$)/i);
  if (!m) return '';
  const from = Number(m[1]);
  const items = m[2];
  if (!from || !/\d/.test(items)) return '';
  const targets = new Set();
  if (/\bdoubl|twice|×\s*2\b|\bx\s*2\b/i.test(t)) targets.add(from * 2);
  if (/\bhalf|\bhalve|×\s*1\/2|\bx\s*1\/2/i.test(t)) targets.add(from / 2);
  for (const x of t.matchAll(/\b(?:to|for)\s+(\d+)\s*(?:servings?|people|persons?|portions?)\b/gi)) if (Number(x[1]) !== from) targets.add(Number(x[1]));
  if (!targets.size) [from * 2, from / 2].forEach((x) => targets.add(x));
  return [...targets].map((to) => scaleRecipe(`scale the recipe from ${from} to ${to}: ${items}`)).filter(Boolean).join('\n\n');
}
