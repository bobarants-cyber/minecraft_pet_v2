// The duck's colours, joints and skin weights. No black outlines (like Gliddy and Moffy): parts meet in clean colour
// edges; the eyes are glossy and painted on, with big white highlights.
import { partAt, HEAD, EYES, WINGS } from './model.mjs';

const lin = (h) => [0, 2, 4].map((i) => (parseInt(h.slice(1 + i, 3 + i), 16) / 255) ** 2.2);
const WHITE_FUR = lin('#fffaf0');
const BILL = lin('#ffad4d');
const BILL_DARK = lin('#e8812a');
const EYE = lin('#1e1a24');
const SHINE = lin('#ffffff');
const BLUSH = lin('#ffa3b8');
const LEG = lin('#ff9a3c');
const BANDANA = lin('#7fc8ff');
const DOT = lin('#ffffff');
const TUFT = lin('#fff3d6');

export const PIVOTS = {
  head: [0, 0.47, 0],
  arm_R: WINGS[1].pivot, arm_L: WINGS[0].pivot, // _R = his left (+x), like the other pets' rigs
  leg_R: [0.085, 0.14, 0], leg_L: [-0.085, 0.14, 0],
};
const GROUP = { head: 'head', bill: 'head', tuft: 'head', body: 'body', tail: 'body', bandana: 'body', wing: 'arm', leg: 'leg', foot: 'leg' };

function ownPart(p) {
  const { d } = partAt(p);
  let name = 'body', best = Infinity;
  for (const k of Object.keys(GROUP)) {
    const v = d[k];
    if (v === undefined || v < -0.0015) continue;
    if (v < best) { best = v; name = k; }
  }
  return { name, d };
}

export function weightsAt(p) {
  const { name, d } = ownPart(p);
  const g = GROUP[name];
  const side = p[0] > 0 ? 'R' : 'L';
  if (g === 'arm') {
    // the top of each wing, where it's attached, stays with the body and bends into the wing
    const a = Math.min(1, Math.max(0, d.body / 0.015));
    return { [`arm_${side}`]: a, body: 1 - a };
  }
  if (g === 'leg') return { [`leg_${side}`]: 1 };
  if (g === 'head' || (name === 'body' && p[1] > 0.5)) return { head: 1 };
  if (name === 'body' && p[1] > 0.44) { const t = (p[1] - 0.44) / 0.06; return { head: t, body: 1 - t }; } // the neck bends softly
  return { body: 1 };
}

export function colorAt(p, n, bump = 0, flat = false) {
  const [x, y, z] = p;
  const { name } = partAt(p);
  switch (name) {
    case 'head': case 'body': {
      if (name === 'head' || y > 0.5) {
        if (z > 0.05) {
          for (const E of EYES) {
            const [cx, cy] = E.c, ex = (x - cx) / 0.041, ey = (y - cy) / 0.053; // big round eyes
            if (ex * ex + ey * ey < 1) {
              // glossy eye: a big highlight up and out, and a little one down and in
              const s = Math.sign(cx);
              if (Math.hypot((x - cx + s * 0.013) / 0.015, (y - cy - 0.02) / 0.016) < 1) return SHINE;
              if (Math.hypot(x - cx - s * 0.015, y - cy + 0.022) < 0.0068) return SHINE;
              return EYE;
            }
            // rosy cheek below and outside each eye
            if (Math.hypot((x - cx - Math.sign(cx) * 0.05) / 0.04, (y - cy + 0.08) / 0.024) < 1) return BLUSH;
          }
        }
      }
      return WHITE_FUR;
    }
    case 'tuft': return TUFT;
    case 'bill': {
      // a soft line where the top and bottom of the bill meet (his smile), and two little nostril dots
      const smile = 0.6 - 0.022 + 0.012 * ((x / 0.1) ** 2) * 0.6;
      if (z > 0.2 && Math.abs(y - smile - 0.006) < 0.0035 && Math.abs(x) < 0.085) return BILL_DARK;
      for (const s of [-1, 1]) if (Math.hypot(x - s * 0.022, y - 0.632) < 0.0055 && z > 0.25) return BILL_DARK;
      return BILL;
    }
    case 'tail': case 'wing': return WHITE_FUR;
    case 'leg': case 'foot': return LEG;
    case 'bandana': {
      // white polka dots on light blue
      const u = Math.atan2(x, z) * 9, v = y * 95 + (Math.round(Math.atan2(x, z) * 9) % 2 ? 0.5 : 0); // rows offset
      const fu = u - Math.round(u), fv = v - Math.round(v);
      return Math.hypot(fu, fv) < 0.22 ? DOT : BANDANA;
    }
  }
  return WHITE_FUR;
}

export function furAt() {
  return 0;
}
