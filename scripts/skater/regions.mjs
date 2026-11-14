// The skater's joints, skin weights and colours (model units: height 1, feet at y = 0, face towards +z).
// Colours from the original drawing: tan-orange fur on top of the head, ears, hands and around his sleepy eye; white
// face; one white eye stitched with a black X, one half-closed purple eye; pink tongue; white shirt with a grey tear;
// navy trousers; big black shoes with white soles. (His red cape became the skateboard, which is built in the app.)
import { partAt, XEYE, SLEEPY, BOOT, ARMS, FINGERS, VARIANT, shirtCreases, NOSE as NOSE_AT } from './model.mjs';

export const PIVOTS = { head: [0, 0.5, 0], arm_R: ARMS[1].S, arm_L: ARMS[0].S, leg_R: [0.05, 0.3, 0], leg_L: [-0.05, 0.3, 0], hem: [0, 0.47, 0], fingers_R: FINGERS[1].K, fingers_L: FINGERS[0].K };

export const GROUP = {
  head: 'head', lip: 'head', ear: 'head', earFold: 'head', earFuzz: 'head', tuft: 'head', xeye: 'head', xcross: 'head', sleepy: 'head', lid: 'head',
  nose: 'head', tongue: 'head', tooth: 'head', mouth: 'head',
  shirt: 'body', collar: 'body', tie: 'body',
  sleeve: 'arm', arm: 'arm', hand: 'arm',
  leg: 'leg', cuff: 'leg', shoe: 'leg', tail: 'body',
};

/**
 * Each part follows its bone, except the clothes, which move like cloth: the lower part of the shirt (and the tie)
 * gradually follows a "hem" bone that sways and lifts as he moves, and the sleeves blend from the shoulder (half body,
 * half arm) to their ends (all arm), so they stretch with the arm instead of looking glued on.
 */
/** The part a surface point belongs to: the closest one it isn't inside of (keeps the arm and the shirt apart). */
export function ownPart(p) {
  const { d } = partAt(p);
  let name = 'head', best = Infinity;
  for (const k of Object.keys(GROUP)) {
    const v = d[k];
    if (v === undefined || v < -0.0015) continue;
    if (v < best) { best = v; name = k; }
  }
  return { name, d };
}

export function weightsAt(p) {
  const { name, d } = ownPart(p);
  const g = GROUP[name] ?? 'body';
  const w = { body: 0, head: 0, arm_R: 0, arm_L: 0, leg_R: 0, leg_L: 0, hem: 0, fingers_R: 0, fingers_L: 0 };
  const armKey = p[0] > 0 ? 'arm_R' : 'arm_L';
  if (name === 'shirt' || name === 'tie') {
    const h = Math.min(1, Math.max(0, (0.46 - p[1]) / 0.14)) ** 1.2;
    w.hem = h;
    w.body = 1 - h;
    // Shirt right next to a sleeve shares a little of the arm's movement (the other half of that soft band).
    if (name === 'shirt' && p[1] > 0.36) {
      const s2 = 0.5 * (1 - Math.min(1, Math.max(0, d.sleeve / 0.05))) ** 1.4;
      w[armKey] = s2;
      w.body *= 1 - s2;
      w.hem *= 1 - s2;
    }
  } else if (name === 'sleeve') {
    const A = ARMS[p[0] > 0 ? 1 : 0];
    const along = (p[0] - A.S[0]) * A.u[0] + (p[1] - A.S[1]) * A.u[1] + (p[2] - A.S[2]) * A.u[2];
    // Only the very top of the sleeve, tucked into the shoulder, eases between body and arm.
    // Where the sleeve joins the shirt it eases between body and arm over a band, so lifting the arm stretches the
    // cloth gently instead of tearing one row of triangles into long streaks.
    const a = 0.5 + 0.5 * Math.min(1, Math.max(0, d.shirt / 0.05)) ** 0.7;
    w[armKey] = a;
    w.body = 1 - a;
  } else if (name === 'hand') {
    // The fingers (past the knuckles) follow the finger bone, blending over the knuckles; the palm and thumb stay.
    const F = FINGERS[p[0] > 0 ? 1 : 0];
    const r = [p[0] - F.H[0], p[1] - F.H[1], p[2] - F.H[2]];
    const along = r[0] * F.hu[0] + r[1] * F.hu[1] + r[2] * F.hu[2];
    const side = r[0] * F.axis[0] + r[1] * F.axis[1] + r[2] * F.axis[2];
    const f = along > 0.004 ? Math.min(1, Math.max(0, (Math.hypot(along, side * 0.7) - 0.036) / 0.022)) : 0;
    const fk = p[0] > 0 ? 'fingers_R' : 'fingers_L';
    w[fk] = f;
    w[armKey] = 1 - f;
  } else if (g === 'arm') w[armKey] = 1;
  else if (g === 'leg') w[p[0] > 0 ? 'leg_R' : 'leg_L'] = 1;
  else w[g] = 1;
  return w;
}

const lin = (h) => [0, 2, 4].map((i) => (parseInt(h.slice(1 + i, 3 + i), 16) / 255) ** 2.2);
const TAN = lin('#eeb27a');
const LID = lin('#d98a48'); // the sleepy eye's lid is a darker orange in the drawing
const WHITE = lin('#fbf8f2');
const INNER_EAR = lin('#fcefe4');
const EAR = lin('#e19a5a'); // the ears are a darker orange than his fur
const EAR_LINE = lin('#a8612e');
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
const RED = lin('#d8463a');
const SHINE = lin('#d6d9e0');

/**
 * Where the white face mask is. The borders are smooth curves that follow the head round (by angle), never a straight
 * cut: white over the X eye and the whole lower face, wrapping a little round the cheeks; tan on the forehead, over
 * the top and back of the head, and in a rounded patch round the sleepy eye that flows into the tan on top.
 */
const soft = (d, w = 0.012) => Math.min(1, Math.max(0, 0.5 + d / w)); // 1 inside, 0 outside, a soft band between
function isWhiteFace([x, y, z]) {
  // Traced from the drawing: the tan forehead comes down to eye level, hugs over the top of each eye, and runs down
  // between the eyes in a narrow channel that ends at the nose. Everything below that (both cheeks, round the sides
  // of the eyes below their middle) is white.
  const a = Math.atan2(x, z), side = Math.abs(a);
  if (side > 2.1) return 0;
  const eyeY = (XEYE.c[1] + SLEEPY.c[1]) / 2;
  // Outside the channel, the edge sits at eye level (a touch lower on the sleepy-eye side), dropping as it wraps round.
  // On the sides the edge sweeps down in a smooth curve round the cheek and ends below the ear, well before the back.
  // Round the side the edge curves down steeply over the cheek, so from the side it's a rounded curve, not a line.
  let top = eyeY + (x > 0 ? 0.03 : 0.075) - 0.55 * Math.max(0, side - 0.8) ** 1.25;
  // The channel between the eyes, down to the nose (its sides are the eye outlines, so it's as wide as the gap).
  const inner0 = XEYE.c[0] + XEYE.r * 0.95, inner1 = SLEEPY.c[0] - SLEEPY.r * 0.95;
  if (z > 0.05 && x > inner0 - 0.01 && x < inner1 + 0.01) top = Math.min(top, NOSE_AT.c[1] + 0.012);
  return soft(top - y, 0.012);
}

const blend = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

export function colorAt(p, n, bump = 0, flat = false) {
  const [x, y, z] = p;
  const { name } = partAt(p);
  switch (name) {
    case 'xcross': return BLACK;
    case 'xeye': return Math.hypot((x - XEYE.c[0]) / XEYE.r, (y - XEYE.c[1]) / XEYE.ry) > 0.955 ? BLACK : WHITE;
    case 'sleepy': {
      const r = Math.hypot((x - SLEEPY.c[0]) / SLEEPY.r, (y - SLEEPY.c[1]) / SLEEPY.ry);
      if (r > 0.96) return BLACK;
      // A white eye with a big purple iris peeking out under the lid, and a darker pupil.
      const ir = Math.hypot(x - SLEEPY.c[0] + 0.01, y - (SLEEPY.c[1] - 0.012));
      return ir < 0.026 ? PUPIL : ir < 0.058 ? PURPLE : WHITE;
    }
    case 'lid': {
      // The lid's lower edge is a dark line.
      const rl = Math.hypot((x - SLEEPY.c[0]) / SLEEPY.r, (y - SLEEPY.c[1]) / SLEEPY.ry);
      if (rl > 0.95) return rl < 1.06 ? BLACK : blend(TAN, WHITE, isWhiteFace(p));
      if (y < SLEEPY.c[1] + 0.012) return BLACK;
      // The little white shine on the lid (upper left).
      if (Math.hypot((x - SLEEPY.c[0] + 0.03) / 0.017, (y - SLEEPY.c[1] - 0.055) / 0.013) < 1) return WHITE;
      return LID;
    }
    case 'nose': return NOSE;
    case 'lip': return LINE;
    case 'mouth': return MOUTH;
    case 'tongue': return Math.abs(partAt(p).d.tongue) < 0.003 ? TONGUE : WHITE;
    case 'tooth': return WHITE;
    case 'tuft': return TAN;
    case 'ear': {
      // Darker orange all over, with a darker crease line curving round inside the hollow.
      return EAR;
    }
    case 'earFuzz': return WHITE;
    case 'earFold': return EAR_LINE;
    case 'head': {
      // The dark outline all the way round each eye (where the socket meets the eye).
      if (z > 0.05) {
        const rx = Math.hypot((x - XEYE.c[0]) / XEYE.r, (y - XEYE.c[1]) / XEYE.ry);
        if (rx > 0.95 && rx < 1.06) return BLACK;
        if (rx <= 0.95) return WHITE;
        const rs = Math.hypot((x - SLEEPY.c[0]) / SLEEPY.r, (y - SLEEPY.c[1]) / SLEEPY.ry);
        // The outline round the top half is drawn on the lid itself (it sticks out), so the face behind it stays plain
        // there; otherwise you'd see two rings.
        if (y > SLEEPY.c[1] + 0.004 && rs < 1.16) return blend(TAN, WHITE, isWhiteFace(p));
        if (rs > 0.95 && rs < 1.06) return BLACK; // the outline round the bottom, same as the X eye
        if (rs <= 0.95) return y > SLEEPY.c[1] + 0.006 ? LID : WHITE;
      }
      return blend(TAN, WHITE, isWhiteFace(p));
    }
    case 'shirt': case 'sleeve': case 'collar': {
      // Realistic Gliddy: the cloth is a touch darker down in its creases and folds (soft shading, like real cotton).
      if (VARIANT !== 'real' || flat) return SHIRT; // (flat: the edge-sharpening pass only cares about real colour edges)
      if (name !== 'shirt') return SHIRT;
      const t = Math.min(1, Math.max(0, (y - 0.3) / 0.21));
      const k = Math.min(0.16, Math.max(0, shirtCreases(x, y, z, t) / 0.007) * 0.12);
      return SHIRT.map((c) => c * (1 - k));
    }
    case 'tie': return TIE;
    case 'arm': case 'hand': return TAN;
    case 'leg': return NAVY;
    case 'cuff': return BLACK;
    case 'shoe': {
      // The white highlight on the outer top of each toe, like in the drawing (worked out in the boot's own frame,
      // so it sits on the same spot of each boot).
      const sg = x < 0 ? -1 : 1;
      const lx = sg * x - BOOT.c[0], lz = z - BOOT.c[2], c = Math.cos(BOOT.ry), sn = Math.sin(BOOT.ry);
      const bx = c * lx - sn * lz, bz = sn * lx + c * lz;
      if (Math.hypot((bx - 0.03) / 0.032, (y - 0.135) / 0.022, (bz - 0.12) / 0.045) < 1) return SHINE;
      return BLACK;
    }
    case 'tail': return RED;
  }
  return WHITE;
}
