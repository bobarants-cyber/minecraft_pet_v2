// The designed look for recipe-math presentations: drawn illustrations (a bibimbap bowl or a plate), fraction bars,
// a bar chart, ratio blocks, big section slides, polaroid photo frames and real typography. Everything is drawn with
// shapes and text, so it stays editable after it's imported into Canva, Keynote, PowerPoint or Google Slides.

const W = 13.33;
const H = 7.5;

/** Colours and fonts. Korean gets hanji cream, deep red, navy and gold; other themes reuse their colours. */
export function palette(theme, t) {
  if (theme === 'korean') {
    return { korean: true, bg: 'F6EFE3', paper: 'FFFDF8', ink: '1B1F3B', muted: '6E6A7C', red: 'C8102E', navy: '14213D', gold: 'E0A526', green: '2E7D4F', blue: '1D4ED8', soft: 'EADFCB', head: 'Noto Serif KR', body: 'Noto Sans KR' };
  }
  return { korean: false, bg: t.bg, paper: t.card, ink: t.ink, muted: '6E6A7C', red: t.accent, navy: theme === 'space' ? '0B0F2E' : '1E2A44', gold: t.accent2, green: '2E7D4F', blue: '1D4ED8', soft: t.soft, head: t.title, body: t.font };
}

const SAEKDONG = ['D7263D', 'F4B400', '1D4ED8', '16A34A', 'EC4899', 'FFFFFF', '7C3AED'];

const ICONS = [
  [/rice/, '🍚'], [/beef|steak|meat|bulgogi/, '🥩'], [/pork|bacon/, '🥓'], [/chicken/, '🍗'], [/spinach|lettuce|greens|kale|cabbage/, '🥬'],
  [/carrot/, '🥕'], [/sprout|bean/, '🌱'], [/mushroom/, '🍄'], [/egg/, '🍳'], [/gochujang|chili|chilli|pepper|kimchi/, '🌶️'],
  [/sesame|oil/, '🫙'], [/soy/, '🥢'], [/garlic/, '🧄'], [/onion|scallion/, '🧅'], [/cucumber|zucchini/, '🥒'], [/flour|wheat/, '🌾'],
  [/sugar|honey|syrup/, '🍯'], [/milk/, '🥛'], [/butter/, '🧈'], [/salt/, '🧂'], [/water/, '💧'], [/cheese/, '🧀'], [/tomato/, '🍅'],
  [/potato/, '🥔'], [/chocolate|cocoa/, '🍫'], [/baking|powder|soda/, '🥄'], [/vanilla/, '🌼'], [/tofu/, '⬜'], [/seaweed|nori/, '🟩'],
];
export const iconFor = (name) => ICONS.find(([re]) => re.test(String(name).toLowerCase()))?.[1] ?? '🥄';

const TOPPING = [
  [/spinach|greens|lettuce|kale/, '3E8E41'], [/carrot/, 'F28C28'], [/sprout|bean/, 'F1E4B3'], [/beef|meat|bulgogi|pork/, '7B3F2A'],
  [/mushroom/, '9C6B4E'], [/cucumber|zucchini/, '86B84A'], [/kimchi|chili/, 'D64532'], [/seaweed|nori/, '2F4F3A'], [/tofu/, 'F4EEDC'],
];

const DISH_EMOJI = [[/pancake/, '🥞'], [/cookie/, '🍪'], [/cake|cupcake|muffin/, '🧁'], [/pizza/, '🍕'], [/taco/, '🌮'], [/curry/, '🍛'], [/pasta|spaghetti|lasagna/, '🍝'], [/salad/, '🥗'], [/soup|stew|jjigae/, '🍲'], [/sushi/, '🍣'], [/dumpling/, '🥟'], [/smoothie/, '🥤'], [/brownie|chocolate/, '🍫']];
const isBowl = (dish) => /bibimbap|rice bowl|poke|donburi|fried rice|bowl/i.test(dish);

// ---------- small drawing helpers ----------

const rect = (s, x, y, w, h, color, extra = {}) => s.addShape('rect', { x, y, w, h, fill: { color }, line: { color, width: 0 }, ...extra });
const round = (s, x, y, w, h, color, extra = {}) => s.addShape('roundRect', { x, y, w, h, rectRadius: 0.12, fill: { color }, line: { color, width: 0 }, ...extra });
const oval = (s, x, y, w, h, color, extra = {}) => s.addShape('ellipse', { x, y, w, h, fill: { color }, line: { color, width: 0 }, ...extra });
const text = (s, value, opts) => s.addText(value, { margin: 0, ...opts });

/** The thin rainbow (색동) band down the left edge, or a plain accent bar for other themes. */
function edgeBand(s, d, { dark = false } = {}) {
  if (d.korean) {
    const each = H / SAEKDONG.length;
    SAEKDONG.forEach((c, i) => rect(s, 0, i * each, 0.16, each + 0.01, c));
  } else rect(s, 0, 0, 0.16, H, dark ? d.gold : d.red);
}

/** Background, label ("02 · DOUBLING"), title, page number: the frame every content slide shares. */
function frame(s, d, { label = '', title = '', n = 0, dark = false, footer = '' } = {}) {
  s.background = { color: dark ? d.navy : d.bg };
  edgeBand(s, d, { dark });
  if (label) text(s, label.toUpperCase(), { x: 0.75, y: 0.42, w: 9.5, h: 0.32, fontFace: d.body, fontSize: 12, bold: true, color: dark ? d.gold : d.red, charSpacing: 3 });
  if (title) text(s, title, { x: 0.75, y: 0.78, w: 10.6, h: 0.95, fontFace: d.head, fontSize: 34, bold: true, color: dark ? 'FFFFFF' : d.ink, valign: 'top', fit: 'shrink' });
  if (d.korean) text(s, '🇰🇷', { x: 12.25, y: 0.38, w: 0.7, h: 0.5, fontSize: 22, align: 'right' });
  if (footer) text(s, footer, { x: 0.75, y: 7.0, w: 8, h: 0.3, fontFace: d.body, fontSize: 10, color: dark ? 'A9B0C7' : d.muted });
  if (n) text(s, String(n).padStart(2, '0'), { x: 12.0, y: 7.0, w: 0.95, h: 0.3, fontFace: d.body, fontSize: 10, bold: true, color: dark ? 'A9B0C7' : d.muted, align: 'right' });
}

/** A drawn bibimbap bowl (stone bowl, rice, toppings in a ring, fried egg, gochujang) — or a plate with the dish. */
function dishArt(s, d, cx, cy, size, { dish = '', items = [] } = {}) {
  oval(s, cx - size * 0.46, cy + size * 0.33, size * 0.92, size * 0.16, '000000', { fill: { color: '000000', transparency: 82 } });
  if (!isBowl(dish)) {
    oval(s, cx - size / 2, cy - size / 2, size, size, 'FFFFFF', { line: { color: 'D9D2C3', width: 2 } });
    oval(s, cx - size * 0.36, cy - size * 0.36, size * 0.72, size * 0.72, 'F7F3EA', { line: { color: 'E8E1D2', width: 1 } });
    const emoji = DISH_EMOJI.find(([re]) => re.test(dish.toLowerCase()))?.[1] ?? '🍽️';
    text(s, emoji, { x: cx - size * 0.4, y: cy - size * 0.4, w: size * 0.8, h: size * 0.8, fontSize: Math.round(size * 48), align: 'center', valign: 'middle' });
    return;
  }
  // Stone bowl (dolsot): body, rim, then rice.
  oval(s, cx - size * 0.47, cy - size * 0.08, size * 0.94, size * 0.48, '2E2B2A');
  oval(s, cx - size * 0.5, cy - size * 0.3, size, size * 0.42, '4A4542', { line: { color: '625C58', width: 1.5 } });
  oval(s, cx - size * 0.45, cy - size * 0.27, size * 0.9, size * 0.36, 'F7F3EA');
  // Toppings in a ring (colours from the real ingredients when we know them).
  const names = items.map((i) => i.name.toLowerCase());
  let colours = TOPPING.filter(([re]) => names.some((n) => re.test(n))).map(([, c]) => c);
  if (colours.length < 4) colours = [...colours, ...['3E8E41', 'F28C28', 'F1E4B3', '7B3F2A', '9C6B4E', '86B84A'].filter((c) => !colours.includes(c))].slice(0, 6);
  colours = colours.slice(0, 6);
  colours.forEach((c, i) => {
    const a = (i / colours.length) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * size * 0.25;
    const py = cy - size * 0.09 + Math.sin(a) * size * 0.095;
    oval(s, px - size * 0.11, py - size * 0.05, size * 0.22, size * 0.1, c, { line: { color: 'FFFFFF', width: 0.75 } });
  });
  // Fried egg and a dollop of gochujang on top.
  oval(s, cx - size * 0.13, cy - size * 0.16, size * 0.26, size * 0.13, 'FFFFFF', { line: { color: 'EEE8DA', width: 0.75 } });
  oval(s, cx - size * 0.05, cy - size * 0.135, size * 0.1, size * 0.07, 'F9B115');
  oval(s, cx + size * 0.08, cy - size * 0.2, size * 0.09, size * 0.05, 'C8102E');
  // A wisp of steam.
  [0, 1, 2].forEach((i) => oval(s, cx - size * 0.12 + i * size * 0.1, cy - size * 0.48 - (i % 2) * size * 0.06, size * 0.05, size * 0.12, 'FFFFFF', { fill: { color: 'FFFFFF', transparency: 40 } }));
}

/** A red seal stamp (도장). */
function seal(s, d, x, y, label = '한국', size = 1.0) {
  round(s, x, y, size, size, d.red, { rotate: -7, rectRadius: 0.08 });
  text(s, label, { x, y, w: size, h: size, fontFace: d.head, fontSize: Math.round(size * 20), bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', rotate: -7 });
}

/** "3/2 × 2 = 6/2" in ink and "= 3 cups" in bold red, in one line. */
function equation(expr, result, d, size = 20) {
  return [
    { text: expr, options: { color: d.ink, fontSize: size, fontFace: d.body } },
    ...(result ? [{ text: `  =  ${result}`, options: { color: d.red, bold: true, fontSize: size, fontFace: d.body } }] : []),
  ];
}

// ---------- slides ----------

function cover(s, d, deck) {
  s.background = { color: d.bg };
  edgeBand(s, d);
  oval(s, 7.25, 0.55, 5.6, 5.6, d.soft);
  if (d.korean) {
    oval(s, 12.35, 2.2, 0.5, 0.5, d.red, { fill: { color: d.red, transparency: 15 } });
    oval(s, 12.55, 2.85, 0.28, 0.28, d.blue, { fill: { color: d.blue, transparency: 15 } });
    s.addShape('cloud', { x: 7.3, y: 0.7, w: 1.6, h: 0.85, fill: { color: 'FFFFFF' }, line: { color: d.soft, width: 1 } });
    s.addShape('cloud', { x: 11.2, y: 1.2, w: 1.2, h: 0.65, fill: { color: 'FFFFFF' }, line: { color: d.soft, width: 1 } });
  }
  dishArt(s, d, 10.05, 3.75, 3.6, { dish: deck.topic, items: deck.recipe.items });
  if (deck.hangul) text(s, deck.hangul, { x: 7.4, y: 5.45, w: 5.3, h: 1.1, fontFace: d.head, fontSize: 48, bold: true, color: d.red, align: 'center', fit: 'shrink' });
  text(s, 'MATH IN MY KITCHEN', { x: 0.85, y: 1.45, w: 6, h: 0.4, fontFace: d.body, fontSize: 14, bold: true, color: d.red, charSpacing: 4 });
  text(s, deck.dish, { x: 0.85, y: 1.9, w: 6.3, h: 2.2, fontFace: d.head, fontSize: 58, bold: true, color: d.ink, valign: 'top', fit: 'shrink' });
  rect(s, 0.88, 4.2, 1.4, 0.08, d.red);
  text(s, deck.subtitle, { x: 0.85, y: 4.45, w: 6.2, h: 0.8, fontFace: d.body, fontSize: 20, color: d.ink, valign: 'top' });
  text(s, 'By ____________________   ·   Math', { x: 0.85, y: 5.55, w: 6.2, h: 0.4, fontFace: d.body, fontSize: 14, color: d.muted });
  if (d.korean) seal(s, d, 0.88, 6.15, '한국', 0.9);
}

function about(s, d, sl, deck, n) {
  frame(s, d, { label: d.korean ? '01 · 소개 · About the dish' : '01 · About the dish', title: sl.title, n, footer: deck.dish });
  sl.facts.slice(0, 4).forEach((f, i) => {
    const y = 2.05 + i * 1.15;
    oval(s, 0.8, y, 0.62, 0.62, d.red);
    text(s, String(i + 1), { x: 0.8, y, w: 0.62, h: 0.62, fontFace: d.head, fontSize: 18, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    text(s, f, { x: 1.65, y: y - 0.08, w: 5.9, h: 0.8, fontFace: d.body, fontSize: 19, color: d.ink, valign: 'middle', fit: 'shrink' });
  });
  oval(s, 8.05, 1.55, 4.6, 4.6, d.soft);
  dishArt(s, d, 10.35, 3.95, 3.2, { dish: deck.topic, items: deck.recipe.items });
}

function ingredients(s, d, sl, deck, n) {
  frame(s, d, { label: d.korean ? '02 · 재료 · Ingredients' : '02 · Ingredients', title: sl.title, n, footer: deck.dish });
  const rows = sl.rows.slice(0, 10);
  const rh = Math.min(0.52, 4.7 / (rows.length + 1));
  const x = 0.8;
  const cols = [3.6, 2.0, 1.9];
  text(s, 'INGREDIENT', { x: x + 0.65, y: 1.85, w: cols[0], h: 0.3, fontFace: d.body, fontSize: 11, bold: true, color: d.muted, charSpacing: 2 });
  text(s, 'AMOUNT', { x: x + 0.65 + cols[0], y: 1.85, w: cols[1], h: 0.3, fontFace: d.body, fontSize: 11, bold: true, color: d.muted, charSpacing: 2 });
  text(s, 'AS A FRACTION', { x: x + 0.65 + cols[0] + cols[1], y: 1.85, w: cols[2], h: 0.3, fontFace: d.body, fontSize: 11, bold: true, color: d.muted, charSpacing: 2 });
  rows.forEach((r, i) => {
    const y = 2.25 + i * rh;
    if (i % 2 === 0) round(s, x, y, 8.3, rh - 0.04, d.paper, { rectRadius: 0.06 });
    text(s, r.icon, { x: x + 0.12, y, w: 0.45, h: rh - 0.04, fontSize: 18, align: 'center', valign: 'middle' });
    text(s, r.name, { x: x + 0.65, y, w: cols[0], h: rh - 0.04, fontFace: d.body, fontSize: 17, bold: true, color: d.ink, valign: 'middle' });
    text(s, r.amount, { x: x + 0.65 + cols[0], y, w: cols[1], h: rh - 0.04, fontFace: d.body, fontSize: 17, color: d.ink, valign: 'middle' });
    round(s, x + 0.65 + cols[0] + cols[1], y + rh * 0.14, 1.1, rh * 0.62, d.soft, { rectRadius: 0.2 });
    text(s, r.frac, { x: x + 0.65 + cols[0] + cols[1], y: y + rh * 0.14, w: 1.1, h: rh * 0.62, fontFace: d.body, fontSize: 14, bold: true, color: d.red, align: 'center', valign: 'middle' });
  });
  dishArt(s, d, 11.0, 3.6, 2.6, { dish: deck.topic, items: deck.recipe.items });
  if (sl.serves) {
    round(s, 9.95, 5.35, 2.1, 0.62, d.navy, { rectRadius: 0.3 });
    text(s, `Serves ${sl.serves}`, { x: 9.95, y: 5.35, w: 2.1, h: 0.62, fontFace: d.body, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
  }
}

/** Fraction bars: 3/2 drawn as one full bar and half of another. */
function fractions(s, d, sl, deck, n) {
  frame(s, d, { label: d.korean ? '03 · 분수 · Mixed numbers' : '03 · Mixed numbers', title: sl.title, n, footer: deck.dish });
  text(s, 'Whole × bottom + top, all over the bottom.', { x: 0.8, y: 1.7, w: 11, h: 0.4, fontFace: d.body, fontSize: 16, italic: true, color: d.muted });
  sl.rows.slice(0, 4).forEach((r, i) => {
    const y = 2.35 + i * 1.18;
    text(s, `${r.icon}  ${r.name}`, { x: 0.8, y, w: 2.6, h: 0.5, fontFace: d.body, fontSize: 18, bold: true, color: d.ink, valign: 'middle' });
    s.addText(equation(r.expr, r.result, d, 18), { x: 0.8, y: y + 0.48, w: 4.3, h: 0.45, margin: 0, valign: 'middle' });
    // Bars: each whole is split into `d` parts; `n` parts are shaded.
    const bars = Math.ceil(r.n / r.d);
    const barW = Math.min(2.2, 6.6 / bars - 0.15);
    for (let b = 0; b < bars; b++) {
      for (let p = 0; p < r.d; p++) {
        const filled = b * r.d + p < r.n;
        const px = 5.6 + b * (barW + 0.15) + (p * barW) / r.d;
        rect(s, px, y + 0.12, barW / r.d - 0.03, 0.62, filled ? d.red : d.paper, { line: { color: filled ? d.red : d.soft, width: 1 } });
      }
    }
    text(s, `${r.n}/${r.d}`, { x: 5.6 + bars * (barW + 0.15), y: y + 0.12, w: 1.0, h: 0.62, fontFace: d.head, fontSize: 18, bold: true, color: d.red, valign: 'middle' });
  });
}

/** A dark section slide with a giant scale factor. */
function divider(s, d, sl, deck, n) {
  frame(s, d, { label: sl.label, n, dark: true, footer: deck.dish });
  text(s, sl.big, { x: 0.7, y: 1.3, w: 7.5, h: 3.2, fontFace: d.head, fontSize: sl.big.length > 5 ? 120 : 170, bold: true, color: d.gold, valign: 'middle', fit: 'shrink' });
  text(s, sl.title, { x: 0.75, y: 4.6, w: 7.5, h: 0.8, fontFace: d.head, fontSize: 32, bold: true, color: 'FFFFFF' });
  text(s, sl.caption, { x: 0.75, y: 5.4, w: 7.5, h: 0.8, fontFace: d.body, fontSize: 18, color: 'D6DAE8', valign: 'top' });
  oval(s, 8.4, 1.25, 4.4, 4.4, d.gold, { fill: { color: d.gold, transparency: 85 } });
  dishArt(s, d, 10.6, 3.6, 3.0, { dish: deck.topic, items: deck.recipe.items });
  if (sl.serves) {
    round(s, 9.55, 5.75, 2.1, 0.6, d.gold, { rectRadius: 0.3 });
    text(s, `Serves ${sl.serves}`, { x: 9.55, y: 5.75, w: 2.1, h: 0.6, fontFace: d.body, fontSize: 16, bold: true, color: d.navy, align: 'center', valign: 'middle' });
  }
}

/** Original → new amounts, with an arrow. */
function scaled(s, d, sl, deck, n) {
  frame(s, d, { label: sl.label, title: sl.title, n, footer: deck.dish });
  const rows = sl.rows.slice(0, 10);
  const rh = Math.min(0.5, 4.9 / (rows.length + 1));
  text(s, 'ORIGINAL', { x: 4.6, y: 1.85, w: 2.4, h: 0.3, fontFace: d.body, fontSize: 11, bold: true, color: d.muted, charSpacing: 2 });
  text(s, sl.factor.toUpperCase(), { x: 7.8, y: 1.85, w: 2.6, h: 0.3, fontFace: d.body, fontSize: 11, bold: true, color: d.red, charSpacing: 2 });
  rows.forEach((r, i) => {
    const y = 2.25 + i * rh;
    if (i % 2 === 0) round(s, 0.8, y, 11.7, rh - 0.04, d.paper, { rectRadius: 0.06 });
    text(s, r.icon, { x: 0.92, y, w: 0.45, h: rh - 0.04, fontSize: 18, align: 'center', valign: 'middle' });
    text(s, r.name, { x: 1.5, y, w: 3.0, h: rh - 0.04, fontFace: d.body, fontSize: 17, bold: true, color: d.ink, valign: 'middle' });
    text(s, r.from, { x: 4.6, y, w: 2.4, h: rh - 0.04, fontFace: d.body, fontSize: 17, color: d.muted, valign: 'middle' });
    text(s, '→', { x: 7.05, y, w: 0.6, h: rh - 0.04, fontFace: d.body, fontSize: 18, color: d.red, align: 'center', valign: 'middle' });
    text(s, r.to, { x: 7.8, y, w: 2.6, h: rh - 0.04, fontFace: d.body, fontSize: 18, bold: true, color: d.red, valign: 'middle' });
  });
  round(s, 10.7, 1.75, 1.75, 0.55, d.navy, { rectRadius: 0.28 });
  text(s, sl.big, { x: 10.7, y: 1.75, w: 1.75, h: 0.55, fontFace: d.head, fontSize: 18, bold: true, color: d.gold, align: 'center', valign: 'middle' });
}

/** The working: one equation per ingredient, result in red. */
function steps(s, d, sl, deck, n) {
  frame(s, d, { label: sl.label, title: sl.title, n, footer: deck.dish });
  const rows = sl.rows.slice(0, 10);
  const two = rows.length > 5;
  const per = two ? Math.ceil(rows.length / 2) : rows.length;
  const rh = Math.min(0.95, 4.9 / per);
  rows.forEach((r, i) => {
    const col = two ? Math.floor(i / per) : 0;
    const row = two ? i % per : i;
    const x = 0.8 + col * 6.0;
    const y = 1.95 + row * rh;
    const w = two ? 5.75 : 11.7;
    round(s, x, y, w, rh - 0.12, d.paper, { rectRadius: 0.1, line: { color: d.soft, width: 1 } });
    round(s, x + 0.15, y + (rh - 0.12) / 2 - 0.2, 1.75, 0.4, d.soft, { rectRadius: 0.2 });
    text(s, `${r.icon} ${r.name}`, { x: x + 0.15, y: y + (rh - 0.12) / 2 - 0.2, w: 1.75, h: 0.4, fontFace: d.body, fontSize: 12, bold: true, color: d.ink, align: 'center', valign: 'middle', fit: 'shrink' });
    s.addText(equation(r.expr, r.result, d, two ? 16 : 20), { x: x + 2.1, y, w: w - 2.25, h: rh - 0.12, margin: 0, valign: 'middle', fit: 'shrink' });
  });
}

/** A bar chart drawn with shapes: original and every size side by side, for ingredients in the same unit. */
function chart(s, d, sl, deck, n) {
  frame(s, d, { label: d.korean ? '비교 · Compare the amounts' : 'Compare the amounts', title: sl.title, n, footer: deck.dish });
  const colours = [d.muted, d.red, d.gold, d.green, d.blue];
  sl.series.forEach((name, i) => {
    round(s, 5.2 + i * 1.55, 1.78, 0.26, 0.26, colours[i % colours.length], { rectRadius: 0.06 });
    text(s, name, { x: 5.52 + i * 1.55, y: 1.74, w: 1.2, h: 0.34, fontFace: d.body, fontSize: 12, color: d.ink, valign: 'middle' });
  });
  const groups = sl.rows.slice(0, 6);
  const max = Math.max(...groups.flatMap((g) => g.values)) || 1;
  const base = 6.35;
  const top = 2.2;
  const area = 11.3;
  const gw = area / groups.length;
  const bw = Math.min(0.45, (gw - 0.4) / sl.series.length);
  rect(s, 0.95, base, area + 0.3, 0.03, d.muted);
  groups.forEach((g, gi) => {
    const gx = 1.05 + gi * gw + (gw - bw * sl.series.length) / 2;
    g.values.forEach((v, vi) => {
      const h = ((base - top) * v) / max;
      rect(s, gx + vi * bw, base - h, bw - 0.05, h, colours[vi % colours.length]);
      text(s, g.labels[vi], { x: gx + vi * bw - 0.2, y: base - h - 0.3, w: bw + 0.35, h: 0.28, fontFace: d.body, fontSize: 9, bold: true, color: d.ink, align: 'center' });
    });
    text(s, `${g.icon} ${g.name}`, { x: 1.05 + gi * gw, y: base + 0.1, w: gw, h: 0.35, fontFace: d.body, fontSize: 13, bold: true, color: d.ink, align: 'center' });
  });
  text(s, `Amounts in ${sl.unit}`, { x: 0.95, y: 1.75, w: 4, h: 0.3, fontFace: d.body, fontSize: 12, italic: true, color: d.muted });
}

/** Ratios as coloured blocks: 3 red : 1 green. */
function ratios(s, d, sl, deck, n) {
  frame(s, d, { label: d.korean ? '비율 · Ratios' : 'Ratios', title: sl.title, n, footer: deck.dish });
  sl.rows.slice(0, 5).forEach((r, i) => {
    const y = 2.0 + i * 0.95;
    text(s, `${r.iconA} ${r.a}  :  ${r.iconB} ${r.b}`, { x: 0.8, y, w: 4.6, h: 0.6, fontFace: d.body, fontSize: 17, bold: true, color: d.ink, valign: 'middle', fit: 'shrink' });
    const left = Math.min(r.left, 8);
    const right = Math.min(r.right, 8);
    for (let k = 0; k < left; k++) round(s, 5.6 + k * 0.42, y + 0.1, 0.36, 0.4, d.red, { rectRadius: 0.06 });
    const mid = 5.6 + left * 0.42 + 0.1;
    text(s, ':', { x: mid, y, w: 0.3, h: 0.6, fontFace: d.head, fontSize: 24, bold: true, color: d.ink, align: 'center', valign: 'middle' });
    for (let k = 0; k < right; k++) round(s, mid + 0.4 + k * 0.42, y + 0.1, 0.36, 0.4, d.green, { rectRadius: 0.06 });
    text(s, r.text, { x: 10.6, y, w: 2.0, h: 0.6, fontFace: d.head, fontSize: 20, bold: true, color: d.red, align: 'right', valign: 'middle' });
  });
}

/** Scientific notation cards. */
function metric(s, d, sl, deck, n) {
  frame(s, d, { label: d.korean ? '과학적 표기법 · Scientific notation' : 'Scientific notation', title: sl.title, n, footer: deck.dish });
  const cards = sl.rows.slice(0, 4);
  const w = cards.length ? Math.min(3.6, (11.7 - (cards.length - 1) * 0.3) / cards.length) : 3.6;
  cards.forEach((c, i) => {
    const x = 0.8 + i * (w + 0.3);
    round(s, x, 2.0, w, 3.9, d.paper, { rectRadius: 0.15, line: { color: d.soft, width: 1 } });
    rect(s, x, 2.0, w, 0.12, i % 2 ? d.gold : d.red);
    text(s, c.from, { x: x + 0.25, y: 2.35, w: w - 0.5, h: 0.6, fontFace: d.body, fontSize: 15, bold: true, color: d.ink, fit: 'shrink' });
    text(s, `≈ ${c.value}`, { x: x + 0.25, y: 2.95, w: w - 0.5, h: 0.45, fontFace: d.body, fontSize: 15, color: d.muted });
    text(s, c.sci, { x: x + 0.25, y: 3.55, w: w - 0.5, h: 1.1, fontFace: d.head, fontSize: 30, bold: true, color: d.red, valign: 'middle', fit: 'shrink' });
    text(s, c.unit, { x: x + 0.25, y: 4.6, w: w - 0.5, h: 0.4, fontFace: d.body, fontSize: 16, bold: true, color: d.ink });
    text(s, c.how, { x: x + 0.25, y: 5.15, w: w - 0.5, h: 0.5, fontFace: d.body, fontSize: 12, italic: true, color: d.muted });
  });
  text(s, 'Big numbers get a positive exponent (10²), tiny ones a negative exponent (10⁻²).', { x: 0.8, y: 6.2, w: 11.7, h: 0.45, fontFace: d.body, fontSize: 15, color: d.ink });
}

function cost(s, d, sl, deck, n) {
  frame(s, d, { label: d.korean ? '가격 · Cost' : 'Cost', title: sl.title, n, footer: deck.dish });
  if (sl.per) {
    text(s, [
      { text: `${sl.total}`, options: { bold: true, color: d.ink } },
      { text: '  total cost', options: { color: d.muted } },
    ], { x: 0.8, y: 2.3, w: 6, h: 0.7, fontFace: d.body, fontSize: 26, margin: 0 });
    text(s, [
      { text: `÷ ${sl.servings}`, options: { bold: true, color: d.ink } },
      { text: '  servings', options: { color: d.muted } },
    ], { x: 0.8, y: 3.1, w: 6, h: 0.7, fontFace: d.body, fontSize: 26, margin: 0 });
    rect(s, 0.85, 3.95, 4.6, 0.05, d.ink);
    s.addText(equation(`${sl.total} ÷ ${sl.servings}`, sl.per, d, 26), { x: 0.8, y: 4.15, w: 6.5, h: 0.8, margin: 0 });
    oval(s, 8.0, 1.7, 4.3, 4.3, d.navy);
    text(s, sl.per, { x: 8.0, y: 2.6, w: 4.3, h: 1.6, fontFace: d.head, fontSize: 64, bold: true, color: d.gold, align: 'center', valign: 'middle', fit: 'shrink' });
    text(s, 'per serving', { x: 8.0, y: 4.2, w: 4.3, h: 0.6, fontFace: d.body, fontSize: 20, color: 'FFFFFF', align: 'center' });
  } else {
    ['Ingredient', 'Price', 'Amount used', 'Cost'].forEach((h, i) => text(s, h.toUpperCase(), { x: 0.8 + i * 2.95, y: 1.95, w: 2.8, h: 0.3, fontFace: d.body, fontSize: 11, bold: true, color: d.muted, charSpacing: 2 }));
    for (let r = 0; r < 6; r++) {
      round(s, 0.8, 2.35 + r * 0.6, 11.7, 0.52, r % 2 ? d.bg : d.paper, { rectRadius: 0.06, line: { color: d.soft, width: 0.75 } });
    }
    text(s, 'Total ÷ servings = cost per serving', { x: 0.8, y: 6.15, w: 11.7, h: 0.45, fontFace: d.body, fontSize: 16, italic: true, color: d.red });
  }
}

/** Polaroid frames with tape for your cooking photos. */
function photos(s, d, sl, deck, n) {
  frame(s, d, { label: d.korean ? '사진 · Photos' : 'Photos', title: sl.title, n, footer: deck.dish });
  const labels = (sl.labels ?? ['Ingredients', 'Measuring', 'Cooking', 'Final dish']).slice(0, 4);
  const tilt = [-4, 3, -2, 4];
  labels.forEach((label, i) => {
    const x = 0.85 + i * 3.05;
    const y = 2.05 + (i % 2) * 0.25;
    s.addShape('rect', { x, y, w: 2.75, h: 3.55, fill: { color: 'FFFFFF' }, line: { color: 'E7E1D4', width: 0.75 }, rotate: tilt[i], shadow: { type: 'outer', blur: 6, offset: 3, angle: 45, color: '000000', opacity: 0.25 } });
    s.addShape('rect', { x: x + 0.18, y: y + 0.18, w: 2.39, h: 2.5, fill: { color: 'F1ECE2' }, line: { color: 'D8D0BF', width: 1, dashType: 'dash' }, rotate: tilt[i] });
    text(s, '📷', { x: x + 0.18, y: y + 0.18, w: 2.39, h: 2.5, fontSize: 34, align: 'center', valign: 'middle', rotate: tilt[i] });
    text(s, label, { x, y: y + 2.8, w: 2.75, h: 0.55, fontFace: d.head, fontSize: 17, bold: true, color: d.ink, align: 'center', rotate: tilt[i] });
    rect(s, x + 0.95, y - 0.12, 0.85, 0.28, d.gold, { rotate: tilt[i] + 3, fill: { color: d.gold, transparency: 35 } });
  });
}

function learned(s, d, sl, deck, n) {
  frame(s, d, { label: d.korean ? '배운 점 · Reflection' : 'Reflection', title: sl.title, n, footer: deck.dish });
  sl.prompts.slice(0, 3).forEach((p, i) => {
    const x = 0.8 + i * 4.0;
    round(s, x, 2.0, 3.75, 4.3, d.paper, { rectRadius: 0.15, line: { color: d.soft, width: 1 } });
    text(s, ['💡', '🧗', '🏠'][i] ?? '✏️', { x: x + 0.25, y: 2.2, w: 0.8, h: 0.7, fontSize: 30 });
    text(s, p, { x: x + 0.25, y: 2.95, w: 3.25, h: 0.9, fontFace: d.head, fontSize: 18, bold: true, color: d.ink, valign: 'top', fit: 'shrink' });
    for (let l = 0; l < 4; l++) rect(s, x + 0.25, 4.25 + l * 0.48, 3.25, 0.02, d.soft);
  });
}

function thanks(s, d, sl, deck) {
  s.background = { color: d.navy };
  edgeBand(s, d, { dark: true });
  oval(s, 7.9, 0.9, 5.2, 5.2, d.gold, { fill: { color: d.gold, transparency: 85 } });
  dishArt(s, d, 10.5, 3.6, 3.4, { dish: deck.topic, items: deck.recipe.items });
  text(s, sl.big, { x: 0.8, y: 1.6, w: 7.2, h: 2.2, fontFace: d.head, fontSize: sl.big.length > 8 ? 66 : 80, bold: true, color: d.gold, valign: 'middle', fit: 'shrink' });
  text(s, sl.title, { x: 0.85, y: 3.85, w: 7, h: 0.8, fontFace: d.head, fontSize: 32, bold: true, color: 'FFFFFF' });
  text(s, sl.caption, { x: 0.85, y: 4.65, w: 7, h: 0.6, fontFace: d.body, fontSize: 18, color: 'D6DAE8' });
  if (d.korean) seal(s, d, 0.88, 5.6, '한국', 0.9);
}

/** Slides you asked Bbokari to add ("add a slide about where it comes from"). */
function extra(s, d, sl, deck, n) {
  frame(s, d, { label: d.korean ? '더 알아보기 · More' : 'More', title: sl.title, n, footer: deck.dish });
  (sl.bullets ?? []).slice(0, 5).forEach((b, i) => {
    const y = 2.05 + i * 0.95;
    oval(s, 0.85, y + 0.12, 0.32, 0.32, i % 2 ? d.gold : d.red);
    text(s, b, { x: 1.4, y, w: 6.9, h: 0.6, fontFace: d.body, fontSize: 19, color: d.ink, valign: 'middle', fit: 'shrink' });
  });
  oval(s, 8.9, 1.9, 3.6, 3.6, d.soft);
  text(s, sl.emoji ?? '✨', { x: 8.9, y: 1.9, w: 3.6, h: 3.6, fontSize: 110, align: 'center', valign: 'middle' });
}

const DRAW = { about, ingredients, fractions, divider, scaled, steps, chart, ratios, metric, cost, photos, learned, thanks };

/** Draws the whole recipe presentation into a PptxGenJS deck. */
export function renderRecipeDeck(pptx, deck, theme, t) {
  const d = palette(theme, t);
  cover(pptx.addSlide(), d, deck);
  deck.slides.forEach((sl, i) => {
    const s = pptx.addSlide();
    (DRAW[sl.kind] ?? extra)(s, d, sl, deck, i + 2);
    if (sl.notes) s.addNotes(sl.notes);
  });
}
