// The skater's joints, skin weights and colours (model units: height 1, feet at y = 0, face towards +z).
// Colours from the original drawing: tan-orange fur on top of the head, ears, hands and around his sleepy eye; white
// face; one white eye stitched with a black X, one half-closed purple eye; pink tongue; white shirt with a grey tear;
// navy trousers; big black shoes with white soles. (His red cape became the skateboard, which is built in the app.)
import { partAt, XEYE, SLEEPY } from './model.mjs';

export const PIVOTS = { head: [0, 0.52, 0], arm_R: [0.14, 0.47, 0], arm_L: [-0.14, 0.47, 0], leg_R: [0.06, 0.3, 0], leg_L: [-0.06, 0.3, 0] };

const GROUP = {
  head: 'head', ear: 'head', tuft: 'head', xeye: 'head', xcross: 'head', sleepy: 'head', lid: 'head', nose: 'head', tongue: 'head', mouth: 'head',
  shirt: 'body', collar: 'body', charm: 'body',
  arm: 'arm', hand: 'arm',
  leg: 'leg', cuff: 'leg', shoe: 'leg',
};

export function weightsAt(p) {
  const { name, d } = partAt(p);
  // Soft weights: each bone pulls by how close its parts' surfaces are, so joints bend smoothly.
  const g = { head: 1e9, body: 1e9, arm: 1e9, leg: 1e9 };
  for (const [k, v] of Object.entries(d)) g[GROUP[k]] = Math.min(g[GROUP[k]], Math.abs(v));
  if (name === 'mouth') g.head = 0;
  const s = 0.01;
  const raw = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, Math.exp(-v / s)]));
  // Never let the head or legs pull on far-away parts (e.g. the hands passing near the legs).
  if (p[1] < 0.42) raw.head = 0;
  if (p[1] > 0.36) raw.leg = 0;
  if (p[1] > 0.6) raw.arm = 0;
  const sum = raw.head + raw.body + raw.arm + raw.leg || 1;
  const w = { body: raw.body / sum, head: raw.head / sum };
  const arm = raw.arm / sum, leg = raw.leg / sum;
  w.arm_R = p[0] > 0 ? arm : 0;
  w.arm_L = p[0] < 0 ? arm : 0;
  w.leg_R = p[0] > 0 ? leg : 0;
  w.leg_L = p[0] < 0 ? leg : 0;
  return w;
}

const lin = (h) => [0, 2, 4].map((i) => (parseInt(h.slice(1 + i, 3 + i), 16) / 255) ** 2.2);
const TAN = lin('#e9a566');
const WHITE = lin('#fbf8f2');
const INNER_EAR = lin('#f6d9c4');
const BLACK = lin('#1b1a1e');
const PURPLE = lin('#6f45c4');
const PUPIL = lin('#3a2170');
const NOSE = lin('#c7773f');
const MOUTH = lin('#5b1e2a');
const TONGUE = lin('#f28aa2');
const SHIRT = lin('#f6f5f2');
const TEAR = lin('#9b9ba3');
const NAVY = lin('#252a4a');
const SOLE = lin('#f2f2ef');

export function colorAt(p, n) {
  const [x, y, z] = p;
  const { name } = partAt(p);
  switch (name) {
    case 'xcross': return BLACK;
    case 'xeye': return Math.hypot(x - XEYE.c[0], y - XEYE.c[1]) > XEYE.r * 0.9 ? BLACK : WHITE;
    case 'sleepy': {
      const r = Math.hypot(x - SLEEPY.c[0], y - SLEEPY.c[1]);
      if (r > SLEEPY.r * 0.9) return BLACK;
      return Math.hypot(x - SLEEPY.c[0], y - (SLEEPY.c[1] - 0.012)) < 0.03 ? PUPIL : PURPLE;
    }
    case 'lid': return TAN;
    case 'nose': return NOSE;
    case 'mouth': return MOUTH;
    case 'tongue': return TONGUE;
    case 'tuft': return TAN;
    case 'ear': {
      // The cupped front of the ear is pale, the rim and back are tan.
      const ax = Math.abs(x);
      return n[2] > 0.25 && Math.hypot(ax - 0.19, y - 0.895) < 0.058 ? INNER_EAR : TAN;
    }
    case 'head': {
      // Tan cap on top and over the back of the head, and a tan patch round the sleepy eye; white face below.
      if (z < -0.03 && y > 0.6) return TAN;
      if (y > 0.795 - 0.03 * Math.cos(x * 9)) return TAN;
      if (z > 0.04 && Math.hypot(x - SLEEPY.c[0], y - SLEEPY.c[1]) < 0.118) return TAN;
      return WHITE;
    }
    case 'shirt': case 'collar': return SHIRT;
    case 'charm': return TEAR;
    case 'arm': case 'hand': return TAN;
    case 'leg': return NAVY;
    case 'cuff': return BLACK;
    case 'shoe': return y < 0.022 ? SOLE : BLACK;
  }
  return WHITE;
}
