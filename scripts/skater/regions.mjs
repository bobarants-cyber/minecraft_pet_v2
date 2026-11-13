// The skater's joints, skin weights and colours (model units: height 1, feet at y = 0, face towards +z).
// Colours from the original drawing: tan-orange fur on top of the head, ears, hands and around his sleepy eye; white
// face; one white eye stitched with a black X, one half-closed purple eye; pink tongue; white shirt with a grey tear;
// navy trousers; big black shoes with white soles. (His red cape became the skateboard, which is built in the app.)
import { partAt, XEYE, SLEEPY } from './model.mjs';

export const PIVOTS = { head: [0, 0.5, 0], arm_R: [0.115, 0.48, 0], arm_L: [-0.105, 0.49, 0], leg_R: [0.045, 0.3, 0], leg_L: [-0.045, 0.3, 0] };

const GROUP = {
  head: 'head', lip: 'head', ear: 'head', earFold: 'head', tuft: 'head', xeye: 'head', xcross: 'head', sleepy: 'head', lid: 'head',
  nose: 'head', tongue: 'head', tooth: 'head', mouth: 'head',
  shirt: 'body', collar: 'body', tie: 'body',
  sleeve: 'arm', arm: 'arm', hand: 'arm',
  leg: 'leg', cuff: 'leg', shoe: 'leg',
};

/** Each part follows one bone (the joins are hidden by the collar, the sleeves and the shirt hem). */
export function weightsAt(p) {
  const g = GROUP[partAt(p).name] ?? 'body';
  const w = { body: 0, head: 0, arm_R: 0, arm_L: 0, leg_R: 0, leg_L: 0 };
  if (g === 'arm') w[p[0] > 0 ? 'arm_R' : 'arm_L'] = 1;
  else if (g === 'leg') w[p[0] > 0 ? 'leg_R' : 'leg_L'] = 1;
  else w[g] = 1;
  return w;
}

const lin = (h) => [0, 2, 4].map((i) => (parseInt(h.slice(1 + i, 3 + i), 16) / 255) ** 2.2);
const TAN = lin('#eeb27a');
const WHITE = lin('#fbf8f2');
const INNER_EAR = lin('#fcefe4');
const BLACK = lin('#1b1a1e');
const PURPLE = lin('#6f45c4');
const PUPIL = lin('#3a2170');
const NOSE = lin('#c7773f');
const MOUTH = lin('#5b1e2a');
const TONGUE = lin('#f28aa2');
const SHIRT = lin('#f6f5f2');
const TIE = lin('#3b4566');
const LINE = lin('#5b3a2a');
const NAVY = lin('#252a4a');
const SOLE = lin('#f2f2ef');

/**
 * Where the white face mask is. The borders are smooth curves that follow the head round (by angle), never a straight
 * cut: white over the X eye and the whole lower face, wrapping a little round the cheeks; tan on the forehead, over
 * the top and back of the head, and in a rounded patch round the sleepy eye that flows into the tan on top.
 */
const soft = (d, w = 0.012) => Math.min(1, Math.max(0, 0.5 + d / w)); // 1 inside, 0 outside, a soft band between
function isWhiteFace([x, y, z]) {
  const a = Math.atan2(x, z); // 0 = straight ahead, ±π = the back
  const side = Math.abs(a);
  const top = 0.8 - 0.02 * Math.sin(a * 2.2) - 0.16 * Math.max(0, side - 0.9) ** 1.5;
  let w = soft(top - y) * soft((2.1 - side) * 0.2);
  // The tan patch round the sleepy eye (a soft oval, joined to the forehead).
  const dx = x - SLEEPY.c[0], dy = y - SLEEPY.c[1];
  if (z > 0) {
    const e = Math.sqrt((dx / 0.13) ** 2 + (dy / (dy > 0 ? 0.17 : 0.125)) ** 2) - 1;
    w *= soft(e * 0.12);
  }
  return w;
}

const blend = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

export function colorAt(p, n) {
  const [x, y, z] = p;
  const { name } = partAt(p);
  switch (name) {
    case 'xcross': return BLACK;
    case 'xeye': return Math.hypot((x - XEYE.c[0]) / XEYE.r, (y - XEYE.c[1]) / XEYE.ry) > 0.92 ? BLACK : WHITE;
    case 'sleepy': {
      const r = Math.hypot((x - SLEEPY.c[0]) / SLEEPY.r, (y - SLEEPY.c[1]) / SLEEPY.ry);
      if (r > 0.93) return BLACK;
      // A white eye with a big purple iris peeking out under the lid, and a darker pupil.
      const ir = Math.hypot(x - SLEEPY.c[0] + 0.01, y - (SLEEPY.c[1] - 0.012));
      return ir < 0.026 ? PUPIL : ir < 0.058 ? PURPLE : WHITE;
    }
    case 'lid': {
      // The lid's lower edge is a dark line.
      return y < SLEEPY.c[1] + 0.012 ? BLACK : TAN;
    }
    case 'nose': return NOSE;
    case 'lip': return LINE;
    case 'mouth': return MOUTH;
    case 'tongue': return Math.abs(partAt(p).d.tongue) < 0.003 ? TONGUE : WHITE;
    case 'tooth': return WHITE;
    case 'tuft': return TAN;
    case 'ear': {
      // Pale exactly on the cupped hollow in front, tan on the rim and the back.
      const h = partAt(p).d.earHollow;
      return h > -0.004 && h < 0.006 && n[2] > -0.2 ? INNER_EAR : TAN;
    }
    case 'head': {
      // The dark outline all the way round each eye (where the socket meets the eye).
      if (z > 0.05) {
        const rx = Math.hypot((x - XEYE.c[0]) / XEYE.r, (y - XEYE.c[1]) / XEYE.ry);
        if (rx > 0.9 && rx < 1.12) return BLACK;
        if (rx <= 0.9) return WHITE;
        const rs = Math.hypot((x - SLEEPY.c[0]) / SLEEPY.r, (y - SLEEPY.c[1]) / SLEEPY.ry);
        if (rs < 1.14) {
          // Above the lid line it's the lid's skin (no outline there); below, the outline and the purple eye.
          if (y > SLEEPY.c[1] + 0.006) return TAN;
          return rs > 0.9 ? BLACK : WHITE;
        }
      }
      return blend(TAN, WHITE, isWhiteFace(p));
    }
    case 'shirt': case 'sleeve': case 'collar': return SHIRT;
    case 'tie': return TIE;
    case 'arm': case 'hand': return TAN;
    case 'leg': return NAVY;
    case 'cuff': return BLACK;
    case 'shoe': return y < 0.022 ? SOLE : BLACK;
  }
  return WHITE;
}
