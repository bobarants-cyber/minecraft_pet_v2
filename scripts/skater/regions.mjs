// The skater's joints, skin weights and colours (model units: height 1, feet at y = 0, face towards +z).
// Colours from the original drawing: tan-orange fur on top of the head, ears, hands and around his sleepy eye; white
// face; one white eye stitched with a black X, one half-closed purple eye; pink tongue; white shirt with a grey tear;
// navy trousers; big black shoes with white soles. (His red cape became the skateboard, which is built in the app.)
import { partAt, XEYE, SLEEPY, BOOT, ARMS, FINGERS, VARIANT, shirtCreases, PLUSH, plushOrig, plushPlace, MOUTH as MOUTH_AT, NOSE as NOSE_AT } from './model.mjs';

const HEAD_PARTS = new Set(['head', 'ear', 'earFold', 'earFuzz', 'tuft', 'xeye', 'xcross', 'sleepy', 'lid', 'nose', 'tongue', 'tooth', 'mouth', 'lip']);
/** Plush: a bigger head and a squat body, so colours and weights are worked out back in the classic shape. */
const toOrig = (p, name) => (PLUSH ? plushOrig(p, HEAD_PARTS.has(name)) : p);

const PIVOTS0 = { head: [0, 0.5, 0], arm_R: ARMS[1].S, arm_L: ARMS[0].S, leg_R: [0.05, 0.3, 0], leg_L: [-0.05, 0.3, 0], hem: [0, 0.47, 0], fingers_R: FINGERS[1].K, fingers_L: FINGERS[0].K };
export const PIVOTS = PLUSH ? Object.fromEntries(Object.entries(PIVOTS0).map(([k, v]) => [k, plushPlace(v, false)])) : PIVOTS0;

export const GROUP = {
  head: 'head', lip: 'head', ear: 'head', earFold: 'head', earFuzz: 'head', tuft: 'head', xeye: 'head', xcross: 'head', sleepy: 'head', lid: 'head',
  nose: 'head', tongue: 'head', tooth: 'head', mouth: 'head',
  shirt: 'body', collar: 'body', tie: 'body',
  sleeve: 'arm', arm: 'arm', hand: 'arm',
  leg: 'leg', cuff: 'leg', shoe: 'leg', tail: 'body', ...(PLUSH ? { tag: 'body' } : {}),
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

/** How much of the arm's swing the end of a sleeve takes. */
const SLEEVE_FOLLOW = 0.25;

export function weightsAt(p0) {
  const { name, d } = ownPart(p0);
  const p = toOrig(p0, name);
  const g = GROUP[name] ?? 'body';
  const w = { body: 0, head: 0, arm_R: 0, arm_L: 0, leg_R: 0, leg_L: 0, hem: 0, fingers_R: 0, fingers_L: 0 };
  const armKey = p[0] > 0 ? 'arm_R' : 'arm_L';
  if (PLUSH && (name === 'shirt' || name === 'tag')) {
    w.body = 1; // the plush's shirt is its stuffed body: it moves with his torso only, never with the arms
  } else if (name === 'shirt' || name === 'tie' || name === 'tag') {
    const h = Math.min(1, Math.max(0, (0.46 - p[1]) / 0.14)) ** 1.2;
    w.hem = h;
    w.body = 1 - h;
    // The shirt never follows the arms (that dragged its shoulders out into pointed wings when he raised them):
    // it moves with his torso, and its lower part sways on the hem.
  } else if (name === 'sleeve') {
    const A = ARMS[p[0] > 0 ? 1 : 0];
    const along = (p[0] - A.S[0]) * A.u[0] + (p[1] - A.S[1]) * A.u[1] + (p[2] - A.S[2]) * A.u[2];
    // Only the very top of the sleeve, tucked into the shoulder, eases between body and arm.
    // Where the sleeve joins the shirt it eases between body and arm over a band, so lifting the arm stretches the
    // cloth gently instead of tearing one row of triangles into long streaks.
    // Sewn on, the sleeve moves with the shirt; only its open end tilts part of the way with the arm, so it hangs
    // softly round the arm instead of being dragged along by it (and never pulls the shirt with it).
    const a = SLEEVE_FOLLOW * Math.min(1, Math.max(0, d.shirt / 0.045)) ** 0.8;
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
  } else if (PLUSH && name === 'arm') {
    // A plushie's arm root is soft: right where it's sewn to the body it stays with the body and bends into the arm
    // over a few cm (a hard seam there tore into streaks when the arm swung). The shirt itself never moves.
    const a = Math.min(1, Math.max(0, d.shirt / 0.05)) ** 0.8;
    w[armKey] = a;
    w.body = 1 - a;
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
const COLLAR_LINE = lin('#cfcfd6');

/**
 * Plush: what's sewn onto the front of the shirt (plush space): 'tie' (a felt tie: round knot, a blade that widens
 * to a point), 'line' (the stitched outline of the two collar flaps), or null for plain shirt.
 */
export function plushShirtPaint([x, y, z]) {
  if (z < 0.04) return null;
  const tx = Math.abs(x - 0.004);
  if ((tx / 0.02) ** 2 + ((y - 0.402) / 0.016) ** 2 < 1) return 'tie';
  if (y < 0.39 && y > 0.25) {
    const hw = y > 0.272 ? 0.011 + ((0.39 - y) / 0.118) * 0.013 : (0.024 * (y - 0.25)) / 0.022;
    if (tx < hw) return 'tie';
  }
  // Collar flaps: triangles from the neck, outlined with a fine stitch line.
  const X = Math.abs(x);
  const tri = [[0.006, 0.452], [0.105, 0.43], [0.034, 0.37]];
  let dd = 1e3;
  for (let i = 0; i < 3; i++) {
    const [ax, ay] = tri[i], [bx, by] = tri[(i + 1) % 3];
    const ex = bx - ax, ey = by - ay, wx = X - ax, wy = y - ay;
    const h = Math.min(1, Math.max(0, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    dd = Math.min(dd, Math.hypot(wx - ex * h, wy - ey * h));
  }
  return dd < 0.0022 ? 'line' : null;
}

export function colorAt(p0, n, bump = 0, flat = false) {
  const { name } = partAt(p0);
  const p = toOrig(p0, name);
  const [x, y, z] = p;
  switch (name) {
    case 'tag': {
      // White satin tag with a little red heart printed on it.
      const hx = Math.abs(p0[0] + 0.085) * 1.2, hy = p0[1] - 0.185;
      return Math.hypot(hx - 0.004, hy) < 0.0075 || (hy < 0 && hx < 0.012 + hy * 1.2 && hy > -0.012) ? RED : WHITE;
    }
    case 'xcross': return BLACK;
    case 'xeye': {
      if (Math.hypot((x - XEYE.c[0]) / XEYE.r, (y - XEYE.c[1]) / XEYE.ry) > 0.955) return BLACK;
      if (PLUSH) {
        // The X is stitched flat into the plush's eye.
        const cs = Math.cos(0.35), sn = Math.sin(0.35), lx = x - XEYE.c[0] - 0.004, ly = y - XEYE.c[1] + 0.004;
        const u = cs * lx + sn * ly, v = -sn * lx + cs * ly;
        if ((Math.abs(u) < 0.056 && Math.abs(v) < 0.017) || (Math.abs(u) < 0.017 && Math.abs(v) < 0.056)) return BLACK;
      }
      return WHITE;
    }
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
      // Plush: the "w" mouth is embroidered (a plushie's face doesn't move).
      if (PLUSH && z > 0.1) {
        const u = Math.min(1, Math.abs(x - MOUTH_AT.c[0]) / 0.042);
        const my = MOUTH_AT.c[1] - 0.011 * Math.sin(Math.PI * u) + (0.006 * Math.max(0, u - 0.85)) / 0.15;
        if (Math.abs(x - MOUTH_AT.c[0]) < 0.042 && Math.abs(y - my) < 0.0036) return MOUTH;
      }
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
      // Plush: the sewing seam down the back of the head, from the crown to the neck (a slightly sunken darker line).
      if (PLUSH && z < -0.01 && Math.abs(x) < 0.0026) return TAN.map((c) => c * 0.72);
      return blend(TAN, WHITE, isWhiteFace(p));
    }
    case 'shirt': case 'sleeve': case 'collar': {
      if (PLUSH) {
        const paint = plushShirtPaint(p0);
        return paint === 'tie' ? TIE : paint === 'line' ? COLLAR_LINE : SHIRT;
      }
      // Realistic Gliddy: the cloth is a touch darker down in its creases and folds (soft shading, like real cotton).
      if (VARIANT !== 'real' || flat) return SHIRT; // (flat: the edge-sharpening pass only cares about real colour edges)
      if (name !== 'shirt') return SHIRT;
      const t = Math.min(1, Math.max(0, (y - 0.3) / 0.21));
      const k = Math.min(0.24, Math.max(0, shirtCreases(x, y, z, t) / 0.011) * 0.2);
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

/** Plush fur length per part (1 = full fluffy fur; 0 = none, for the stitched eyes and nose). */
export function furAt(p) {
  if (!PLUSH) return 0;
  const { name } = partAt(p);
  const q = toOrig(p, name);
  switch (name) {
    case 'tag': return 0;
    case 'xeye': case 'xcross': case 'sleepy': case 'nose': case 'lid': return 0;
    case 'earFuzz': return 1.5;
    case 'tuft': return 1.25;
    case 'head': {
      // No fur over the eye outlines or the stitched mouth, so they stay crisp.
      const rx = Math.hypot((q[0] - XEYE.c[0]) / XEYE.r, (q[1] - XEYE.c[1]) / XEYE.ry);
      const rs = Math.hypot((q[0] - SLEEPY.c[0]) / SLEEPY.r, (q[1] - SLEEPY.c[1]) / SLEEPY.ry);
      if (q[2] > 0.05 && (rx < 1.12 || rs < 1.12)) return 0;
      if (q[2] > 0.1 && Math.abs(q[0] - MOUTH_AT.c[0]) < 0.05 && Math.abs(q[1] - MOUTH_AT.c[1]) < 0.025) return 0.2;
      return 1;
    }
    case 'arm': {
      // Fades out towards the shoulder: fuzz there spilled over the white shirt as an orange haze.
      const S = ARMS[q[0] > 0 ? 1 : 0].S;
      return Math.min(1, Math.max(0, (Math.hypot(q[0] - S[0], q[1] - S[1], q[2] - S[2]) - 0.035) / 0.05));
    }
    case 'ear': case 'hand': return 1;
    case 'shirt':
      if (plushShirtPaint(p) === 'tie') return 0.006; // the felt tie sewn on: no fuzz
      // No fuzz round the armholes (it drew over the tops of his arms as streaks); 0.012 still marks it as shirt.
      if (Math.abs(p[0]) > 0.1 && p[1] > 0.3) return 0.012;
      return 0.13;
    case 'collar': return 0.13; // short nap: longer fuzz stuck out past the collar and sleeve edges
    // (tiny non-zero values grow no fur, but tell the app which part a vertex is for the colour versions)
    case 'sleeve': return 0.012; // crisp sleeve edges (fuzz there hung over the arm as a ragged white fringe)
    case 'tie': return 0.006; // clean felt tie
    case 'leg': return 0.4;
    case 'cuff': return 0; // black cuffs: fur over black reads as grey static
    case 'shoe': return 0; // vinyl boots: no fuzz (fur over black read as grey static)
  }
  return 0.5;
}
