// The skater, sculpted as a signed-distance field from the Meshy screenshots (front, side, back, close-ups of the
// face and the shirt). Model units: height 1 (tip of the hair tuft), feet at y = 0, face towards +z; his left is +x.
//
// What the screenshots show, and how each part is made:
//   • head: a wide, smooth oval (about 1.4× wider than tall), no puffy cheeks; a soft brow groove over the big eye
//   • his right eye (−x): a big, slightly sunken round eye with a rim, and a raised, tilted cross on it
//   • his left eye (+x): a big round eyeball with a heavy half-closed lid whose edge sticks out
//   • a tiny oval nose; a "w" cat mouth with the mouth open below it and the tongue resting inside
//   • ears: tall rounded leaf shapes with a thick rim, hollow in front, with a small pointed fold at the bottom inside
//   • hair: a tall spike leaning right and a smaller one beside it, growing out of the head
//   • shirt: a hollow A-line shirt with a crisp rolled hem, a seam down the front, pointed collar flaps, wide short
//     sleeves with crisp edges (the arms come out of them, the sleeves don't melt into the arms), and a short ragged tie
//   • thin arms with four-fingered hands, thin legs in trousers, huge round shoes with a cuffed top
// Clothing is joined with sharp unions (it's cloth over a body); only the body itself is blended like clay.

const len = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
/** Which Gliddy to build: '' (classic), 'real' (realistic: creased shirt, full skeleton), 'plush'. */
export const VARIANT = globalThis.process?.env?.VARIANT ?? '';
const REAL = VARIANT === 'real';
export const PLUSH = VARIANT === 'plush';
/** Plush: how much bigger the head is (scaled about the neck), and how the body is squashed (short and stout). */
export const PLUSH_HEAD = 1.42;
const PLUSH_BODY = [1.12, 0.84, 1.12];
const NECK = [0, 0.5, 0];
const NECK_P = [0, 0.5 * PLUSH_BODY[1] + 0.045, 0]; // the head sits on top of the shirt (its chin hung over it)
/** Plush → classic coordinates (head parts use the head's transform, everything else the body's). */
export function plushOrig(p, head) {
  if (head) return [(p[0] - NECK_P[0]) / PLUSH_HEAD + NECK[0], (p[1] - NECK_P[1]) / PLUSH_HEAD + NECK[1], (p[2] - NECK_P[2]) / PLUSH_HEAD + NECK[2]];
  return [p[0] / PLUSH_BODY[0], p[1] / PLUSH_BODY[1], p[2] / PLUSH_BODY[2]];
}
/** Classic → plush coordinates (for joints). */
export function plushPlace(q, head) {
  if (head) return [(q[0] - NECK[0]) * PLUSH_HEAD + NECK_P[0], (q[1] - NECK[1]) * PLUSH_HEAD + NECK_P[1], (q[2] - NECK[2]) * PLUSH_HEAD + NECK_P[2]];
  return [q[0] * PLUSH_BODY[0], q[1] * PLUSH_BODY[1], q[2] * PLUSH_BODY[2]];
}
const seg2 = (px, py, ax, ay, bx, by) => {
  const ex = bx - ax, ey = by - ay, h = clamp(((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey), 0, 1);
  return Math.hypot(px - ax - ex * h, py - ay - ey * h);
};
/** Realistic shirt creases: soft valleys pressed into the cloth (positive pushes the surface in). */
export function shirtCreases(x, y, z, t) {
  const a = Math.atan2(x, z), ax = Math.abs(x);
  // Hanging drape folds round the skirt, uneven like real cotton, fading out up the chest.
  let c = 0.011 * Math.sin(a * 6.5 + 0.6 + 0.9 * Math.sin(a * 2.3)) * (1 - t) ** 1.3;
  // Diagonal pull creases from each armpit down towards the middle, front and back (two per side).
  for (const [x0, y0, x1, y1, k] of [[0.118, 0.452, 0.04, 0.37, 1], [0.112, 0.43, 0.06, 0.34, 0.7]]) {
    const d = seg2(ax, y, x0, y0, x1, y1);
    c += 0.0075 * k * Math.exp(-((d / 0.0085) ** 2));
  }
  // Little compression ripples at the waist where the shirt bunches.
  c += 0.0032 * Math.sin(y * 260 + a * 2) * Math.exp(-(((y - 0.335) / 0.02) ** 2));
  return c;
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;

function ellipsoid(p, c, r) {
  const x = (p[0] - c[0]) / r[0], y = (p[1] - c[1]) / r[1], z = (p[2] - c[2]) / r[2];
  const k0 = len(x, y, z), k1 = len(x / r[0], y / r[1], z / r[2]);
  return k0 < 1e-9 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
}
function roundCone(p, a, b, ra, rb) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2];
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  return len(pax - bax * h, pay - bay * h, paz - baz * h) - mix(ra, rb, h);
}
function box(q, half, r) {
  const qx = Math.abs(q[0]) - half[0] + r, qy = Math.abs(q[1]) - half[1] + r, qz = Math.abs(q[2]) - half[2] + r;
  return len(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
function torusY(p, c, R, r) {
  const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
  return len(Math.sqrt(x * x + z * z) - R, y, 0) - r;
}
const smax = (a, b, k) => -smin(-a, -b, k);
const smin = (a, b, k) => { const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1); return mix(b, a, h) - k * h * (1 - h); };
const ssub = (d, cut, k) => { const h = clamp(0.5 - (0.5 * (d + cut)) / k, 0, 1); return mix(d, -cut, h) + k * h * (1 - h); };
/** A point in a part's own frame: moved to its centre, then turned (z, then y, then x). */
function local(p, c, rz = 0, ry = 0, rx = 0) {
  let x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
  if (rz) { const cs = Math.cos(rz), sn = Math.sin(rz); [x, y] = [cs * x + sn * y, -sn * x + cs * y]; }
  if (ry) { const cs = Math.cos(ry), sn = Math.sin(ry); [x, z] = [cs * x - sn * z, sn * x + cs * z]; }
  if (rx) { const cs = Math.cos(rx), sn = Math.sin(rx); [y, z] = [cs * y + sn * z, -sn * y + cs * z]; }
  return [x, y, z];
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => scale(a, 1 / Math.hypot(...a));
/** Arm layout: S = shoulder, W = wrist, n = which way the palm faces. */
function arm(S, W, palm, thumb, hand) {
  const u = norm(sub(W, S));
  const hu = norm(hand ?? u);
  const n = norm(sub(palm, scale(hu, dot(palm, hu))));
  return { S, W, u, hu, n, thumb };
}
export const ARMS = PLUSH
  ? [
      // Plush: short, chunky arms sticking out a little, with mitten hands.
      arm([-0.13, 0.47, 0.0], [-0.215, 0.375, 0.035], [1, 0.1, 0.3], 1),
      arm([0.135, 0.47, 0.0], [0.22, 0.375, 0.035], [-1, 0.1, 0.3], -1),
    ]
  : [
      // Resting: arms hanging relaxed a little out from the body, palms facing in. (His ta-da pose is an animation.)
      arm([-0.125, 0.485, 0.0], [-0.225, 0.335, 0.04], [1, 0.1, 0.3], 1),
      arm([0.13, 0.485, 0.0], [0.23, 0.335, 0.04], [-1, 0.1, 0.3], -1),
    ];
/** Each boot (mirrored per side): its centre and how far the toe turns out. */
export const BOOT = { c: [0.118, 0.084, 0.05], ry: 0.55 };
/** The knuckle line of each hand (for the finger bones): a point on it, and the axis the fingers bend around. */
export const FINGERS = ARMS.map((A) => {
  const H = add(A.W, scale(A.hu, 0.042));
  return { K: add(H, scale(A.hu, 0.036)), H, axis: norm(cross(A.n, A.hu)), hu: A.hu, n: A.n };
});
export const HEAD = { c: [0, 0.668, 0], r: [0.258, 0.178, 0.214] };
export const JOWL = { c: [0, 0.608, 0.015], r: [0.246, 0.108, 0.19] };
/** Where the head's front surface is, for laying the face on it. */
export function faceZ(x, y) {
  const u = 1 - (x / HEAD.r[0]) ** 2 - ((y - HEAD.c[1]) / HEAD.r[1]) ** 2;
  const j = 1 - (x / JOWL.r[0]) ** 2 - ((y - JOWL.c[1]) / JOWL.r[1]) ** 2; // the full lower face (jowls)
  return Math.max(HEAD.r[2] * Math.sqrt(Math.max(0, u)), JOWL.c[2] + JOWL.r[2] * Math.sqrt(Math.max(0, j))) + 0.006;
}
export const XEYE = { c: [-0.12, 0.686], r: 0.088, ry: 0.104 }; // oval, a bit taller than wide
export const SLEEPY = { c: [0.13, 0.682], r: 0.085, ry: 0.097 };
export const NOSE = { c: [0.006, 0.632] };
export const MOUTH = { c: [0.008, 0.598], w: 0.046, h: 0.034 };

/**
 * Plush shirt = his stuffed body: a soft rounded belly under a narrower chest, little cap sleeves sewn into the
 * shoulders, a flat-ish bottom that sits right on his boots (so no legs show) and a rolled hem round it.
 */
export const PLUSH_SHIRT = { bottom: 0.2, hemY: 0.214 };
function plushShirt(p) {
  const [x, y, z] = p;
  const belly = ellipsoid(p, [0, 0.3, 0.004], [0.172, 0.2, 0.148]);
  const chest = ellipsoid(p, [0, 0.4, 0], [0.15, 0.085, 0.125]);
  let s = smin(belly, chest, 0.04);
  for (const sg of [-1, 1]) s = smin(s, ellipsoid(p, [sg * 0.132, 0.392, 0], [0.062, 0.056, 0.064]), 0.03);
  s = smax(s, PLUSH_SHIRT.bottom - y, 0.025);
  // Rolled hem: a soft ring round the bottom edge.
  const k = Math.sqrt(Math.max(0, 1 - ((PLUSH_SHIRT.hemY - 0.3) / 0.2) ** 2));
  const rxh = 0.172 * k - 0.004, rzh = 0.148 * k - 0.004;
  const radial = (Math.hypot(x / rxh, (z - 0.004) / rzh) - 1) * 0.14;
  s = smin(s, Math.hypot(radial, y - PLUSH_SHIRT.hemY) - 0.009, 0.004);
  return s;
}
/**
 * Plush sleeves: soft tubes down the upper arm (a bit roomier than the arm, about half its length), ending in a
 * rolled cuff the arm comes out of.
 */
function plushSleeves(p) {
  let s = 1e3;
  for (const A of ARMS) {
    const S = plushPlace(A.S, false), W = plushPlace(A.W, false);
    const u = norm(sub(W, S)), E = add(S, scale(u, 0.078));
    const tube = Math.max(roundCone(p, S, E, 0.064, 0.059), dot(sub(p, E), u));
    const r = sub(p, E), along = dot(r, u), radial = Math.hypot(...sub(r, scale(u, along)));
    s = Math.min(s, smin(tube, Math.hypot(radial - 0.056, along + 0.002) - 0.0085, 0.004));
  }
  return s;
}
/** Classic/realistic shirt body: a rounded belly under a narrower chest, shoulders, a rolled hem on the boots. */
export const CLEAN_SHIRT = { bottom: 0.246, hemY: 0.258 };
function cleanShirt(p) {
  const [x, y, z] = p;
  const belly = ellipsoid(p, [0, 0.36, 0.004], [0.152, 0.165, 0.12]);
  const chest = ellipsoid(p, [0, 0.455, 0], [0.135, 0.07, 0.104]);
  let s = smin(belly, chest, 0.035);
  for (const sg of [-1, 1]) s = smin(s, ellipsoid(p, [sg * 0.118, 0.47, 0], [0.048, 0.044, 0.05]), 0.025);
  // Realistic: soft creases pressed into the cloth (drape folds low down, pulls from the armpits).
  if (REAL) s += 0.55 * shirtCreases(x, y, z, clamp((y - 0.25) / 0.26, 0, 1));
  s = smax(s, CLEAN_SHIRT.bottom - y, 0.02);
  const k = Math.sqrt(Math.max(0, 1 - ((CLEAN_SHIRT.hemY - 0.36) / 0.165) ** 2));
  const rxh = 0.152 * k - 0.003, rzh = 0.12 * k - 0.003;
  const radial = (Math.hypot(x / rxh, (z - 0.004) / rzh) - 1) * 0.12;
  return smin(s, Math.hypot(radial, y - CLEAN_SHIRT.hemY) - 0.007, 0.004);
}
/** Classic/realistic sleeves: roomy tubes about half way down the upper arm, with a rolled cuff. */
function cleanSleeves(p) {
  let s = 1e3;
  for (const A of ARMS) {
    const E = add(A.S, scale(A.u, 0.085));
    const tube = Math.max(roundCone(p, A.S, E, 0.046, 0.041), dot(sub(p, E), A.u));
    const r = sub(p, E), along = dot(r, A.u), radial = Math.hypot(...sub(r, scale(A.u, along)));
    s = Math.min(s, smin(tube, Math.hypot(radial - 0.039, along + 0.002) - 0.0065, 0.003));
  }
  return s;
}
/** The sewn-in fabric tag, hanging from the hem low on his back (left side). */
function plushTag(p) {
  const q = local(p, [-0.085, 0.19, -0.13], 0.12, -0.55);
  return Math.max(box(q, [0.02, 0.03, 0.0028], 0.002), p[1] - 0.215);
}

/** Plush: how much each body part is puffed up (stuffing). */
const PUFF = { arm: 0.006, hand: 0.006, leg: 0.005, shoe: 0.006, cuff: 0.004 };
const HEAD_KEYS = ['head', 'ear', 'earFold', 'earFuzz', 'earHollow', 'tuft', 'xeye', 'xcross', 'sleepy', 'lid', 'nose', 'tongue', 'tooth', 'mouthCut', 'lip', 'lipCut'];
function parts(p) {
  if (!PLUSH) return partsAt(p);
  // Plush: a short, stout stuffed body (squashed, and puffed up a little) under a much bigger head (scaled about the
  // neck), the proportions of a plushie. Distances are scaled back so the field stays a true distance.
  const b = partsAt(plushOrig(p, false));
  const d = {};
  const sb = Math.min(...PLUSH_BODY);
  for (const k of Object.keys(b)) d[k] = b[k] * sb - (PUFF[k] ?? 0);
  const h = partsAt(plushOrig(p, true));
  for (const k of HEAD_KEYS) if (h[k] !== undefined) d[k] = h[k] * PLUSH_HEAD;
  // The plush's shirt is its stuffed body (sewn like a real plushie), worked out directly in plush space; the tie
  // and collar are sewn flat onto it (painted in regions.mjs), so there are no separate sleeves, collar or tie.
  d.shirt = plushShirt(p);
  d.sleeve = plushSleeves(p);
  d.collar = d.tie = 1e3;
  d.tag = plushTag(p);
  return d;
}

function partsAt(p) {
  const [x, y, z] = p;
  const m = [Math.abs(x), y, z]; // mirrored for pairs
  const d = {};

  // --- head ---
  let head = smin(ellipsoid(p, HEAD.c, HEAD.r), ellipsoid(p, JOWL.c, JOWL.r), 0.05);
  const headRaw = head;
  // A soft brow groove arcing over the big eye.
  {
    const cx = XEYE.c[0], cy = XEYE.c[1];
    const a = Math.atan2(y - cy, x - cx);
    if (a > 0.5 && a < 2.6) {
      const r = Math.hypot(x - cx, y - cy);
      const groove = len(r - (XEYE.ry + 0.02), z - faceZ(x, y) - 0.003, 0) - 0.005;
      head = ssub(head, groove, 0.006);
    }
  }
  // Big sunken eye with a rim (the socket is pressed in, the eye sits inside it).
  {
    const [cx, cy] = XEYE.c, fz = faceZ(cx, cy);
    // The eye is a thin cap that follows the curve of his head, standing just proud of it (no socket, so turning
    // him never shows a second ring, and it can't bulge out past its outline at the sides).
    // It tapers to nothing at its edge, so there's no side wall to show as a thick black band from the side.
    const ex = Math.hypot((x - cx) / XEYE.r, (y - cy) / XEYE.ry);
    d.xeye = Math.max(ellipsoid(p, [cx, cy, fz - 0.06], [XEYE.r, XEYE.ry, 0.2]), headRaw - 0.004 * Math.max(0, 1 - ex * ex) - 0.0006);
    // The raised cross, tilted.
    const q = local(p, [cx + 0.004, cy - 0.004, fz + 0.006], 0.35);
    // (clipped to a thin layer over the head, so from the side it doesn't stick out past his face)
    d.xcross = PLUSH ? 1e3 : Math.max(Math.min(box(q, [0.056, 0.017, 0.03], 0.006), box(q, [0.017, 0.056, 0.03], 0.006)), headRaw - 0.011);
  }
  // The sleepy eye: a big eyeball, and a heavy lid over its top half whose edge sticks out.
  {
    const [cx, cy] = SLEEPY.c, fz = faceZ(cx, cy);
    const es = Math.hypot((x - cx) / SLEEPY.r, (y - cy) / SLEEPY.ry);
    d.sleepy = Math.max(ellipsoid(p, [cx, cy, fz - 0.06], [SLEEPY.r, SLEEPY.ry, 0.2]), headRaw - 0.004 * Math.max(0, 1 - es * es) - 0.0006);
    // The lid stands out a little (not so far that its edge and the eye's ring read as two outlines from the side).
    const lidShell = Math.max(ellipsoid(p, [cx, cy - 0.004, fz - 0.04], [SLEEPY.r + 0.004, SLEEPY.ry + 0.004, 0.2]), headRaw - (PLUSH ? 0.004 : 0.011) * Math.max(0, 1 - es * es) - 0.001);
    const q = local(p, [cx, cy, 0], 0.08);
    d.lid = Math.max(lidShell, -(q[1] + 0.006)); // only above the lid line (slightly tilted); its edge juts out
  }
  // Nose: a small horizontal oval bump.
  d.nose = ellipsoid(p, [NOSE.c[0], NOSE.c[1], faceZ(...NOSE.c) - 0.004], [0.021, 0.014, 0.016]);
  d.head = head;

  // --- ears: tall rounded leaves, tilted out, hollow in front, with a small pointed fold inside ---
  {
    const ec = [0.172, 0.872, -0.035];
    const q = local(m, ec, -0.5, 0.35);
    // Leaf outline: wider at the bottom, rounded at the top.
    const shape = (s) => ellipsoid([q[0], q[1] - s * 0.01, q[2]], [0, 0.0, 0], [0.071 * (1 + s), 0.094 * (1 + s), 0.027]);
    void shape;
    let ear = smin(ellipsoid(q, [0.006, 0.01, 0], [0.08, 0.082, 0.027]), ellipsoid(q, [-0.004, -0.046, 0], [0.06, 0.05, 0.024]), 0.022);
    ear = smax(ear, -(q[0] + 0.052 - 0.12 * Math.max(0, q[1] - 0.04) ** 2 * 6), 0.012); // the straighter inner side
    const hollow = smin(ellipsoid(q, [0.008, 0.018, 0.021], [0.054, 0.058, 0.022]), ellipsoid(q, [-0.006, -0.032, 0.02], [0.038, 0.034, 0.02]), 0.016);
    d.earHollow = hollow;
    ear = ssub(ear, hollow, 0.01);
    d.ear = ear;
    // The fold: a soft ridge curving down the inside of the ear, parallel to its inner edge (the folded flap).
    {
      const pts = [[-0.012, 0.075, 0.006], [-0.03, 0.04, 0.014], [-0.036, -0.005, 0.016], [-0.03, -0.045, 0.014]];
      let f = 1e3;
      for (let i = 0; i < pts.length - 1; i++) f = smin(f, roundCone(q, pts[i], pts[i + 1], 0.0065, 0.0065), 0.004);
      d.earFold = f;
    }
    // Little white tufts of fuzz sticking up out of the bottom of the hollow.
    let fuzz = 1e3;
    for (const [ax, ay, bx, by] of [[-0.022, -0.05, -0.036, -0.012], [-0.006, -0.054, -0.006, -0.018], [0.01, -0.05, 0.022, -0.02]]) {
      fuzz = Math.min(fuzz, roundCone(q, [ax, ay, 0.012], [bx, by, 0.022], 0.009, 0.0015));
    }
    d.earFuzz = fuzz;
  }
  // --- hair: a tall spike leaning right, a smaller one on the left, both growing out of the head ---
  // Hair: two locks, each an S-curve (it bends one way, then the other). The big lock in front rises from his head,
  // bows out to the right, then sweeps back so its tip points up and to the left. The smaller lock sits BEHIND it,
  // peeking out on its left, bowing left and then hooking its tip back towards the big one.
  {
    // A tapering, slightly flattened blade swept along a cubic curve.
    const blade = ([a, b, c, e], r0, r1, z0, N = 14) => {
      const at = (t) => [0, 1].map((k) => (1 - t) ** 3 * a[k] + 3 * (1 - t) ** 2 * t * b[k] + 3 * (1 - t) * t * t * c[k] + t ** 3 * e[k]);
      const q = [x, y, z0 + (z - z0) * 1.7]; // thinner front-to-back than side-to-side
      let d0 = 1e3;
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N, [x0, y0] = at(t0), [x1, y1] = at(t1);
        d0 = smin(d0, roundCone(q, [x0, y0, z0], [x1, y1, z0], mix(r0, r1, t0 ** 0.8), mix(r0, r1, t1 ** 0.8)), 0.01);
      }
      return d0;
    };
    const hk = PLUSH ? 1.35 : 1; // plush hair is soft and chunky
    var flame = blade([[0.04, 0.77], [0.11, 0.86], [-0.03, 0.9], [-0.025, 1.0]], 0.095 * hk, 0.003 * hk * 3, 0.0, 10);
    var lock = blade([[0.02, 0.775], [-0.08, 0.85], [-0.06, 0.925], [0.03, 0.955]], 0.08 * hk, 0.004 * hk * 3, -0.045, 10);
    // The back lock is a copy of the big front lock, smaller, tilted a little to the left, set lower and behind it,
    // so the two read as matching wavy locks. (HAIR=A builds the older flipped curl instead.)
    if (globalThis.process?.env?.HAIR !== 'A') {
      const FL = [[0.04, 0.77], [0.11, 0.86], [-0.03, 0.9], [-0.025, 1.0]], k = 0.75, th = 0.2, base = [-0.036, 0.79];
      const tr = ([px, py]) => { const dx = (px - FL[0][0]) * k, dy = (py - FL[0][1]) * k; return [base[0] + dx * Math.cos(th) - dy * Math.sin(th), base[1] + dx * Math.sin(th) + dy * Math.cos(th)]; };
      lock = blade(FL.map(tr), 0.095 * k, 0.003, -0.062, 10);
    }
    d.tuft = Math.min(flame, lock);
  }


  // --- mouth: one Pikachu mouth. Its top edge IS the "w" (two little scallops meeting in a point in the middle),
  // the rest hangs below, round at the bottom, with the tongue resting inside. ---
  {
    const [cx, cy] = MOUTH.c, fz = faceZ(cx, cy);
    const u = x - cx, v = y - cy, W = MOUTH.w, H = MOUTH.h;
    const a = Math.abs(u), R = W / 2;
    const top = 0.016 - Math.sqrt(Math.max(0, R * R - (a - R) ** 2)) * 0.55;
    const bottom = -H * Math.sqrt(Math.max(0, 1 - (u / W) ** 2));
    const inside2d = Math.max(v - top, bottom - v, a - W);
    d.mouthCut = Math.max(inside2d, faceZ(x, y) - 0.024 - z);
    d.lip = 1e3;
    const ty = cy - 0.036;
    const t = ellipsoid(p, [cx, ty + 0.008, faceZ(cx, ty) - 0.024], [0.026, 0.02, 0.02]);
    d.tongue = ssub(t, len(x - cx, 0, z - faceZ(cx, ty) + 0.006) - 0.002, 0.003);
    let tooth = 1e3;
    for (const sg of [-1, 1]) tooth = Math.min(tooth, roundCone(p, [cx + sg * 0.021, cy + 0.006, fz - 0.006], [cx + sg * 0.02, cy - 0.01, fz - 0.003], 0.0075, 0.003));
    d.tooth = tooth;
    d.lipCut = 1e3;
  }

  // --- shirt: hollow A-line with a rolled hem, front seam, collar, short wide sleeves ---
  {
    const t = PLUSH ? clamp((y - 0.255) / 0.255, 0, 1) : clamp((y - 0.3) / 0.21, 0, 1);
    // Hangs from rounded shoulders with only a little flare, no sharp corners at the hem.
    const shoulder = Math.sqrt(Math.max(0, 1 - clamp((y - 0.455) / 0.06, 0, 1) ** 2));
    const pk = PLUSH ? [1.04, 1.18] : [1, 1]; // plush: a rounder, stuffed tummy
    const rx = (0.122 + 0.036 * (1 - t) ** 1.4) * (0.55 + 0.45 * shoulder) * pk[0], rz = (0.09 + 0.022 * (1 - t)) * (0.7 + 0.3 * shoulder) * pk[1];
    // Soft cloth folds that fade out towards the chest.
    const fold = PLUSH ? 0 : REAL ? shirtCreases(x, y, z, t) : 0.003 * Math.sin(Math.atan2(x, z) * 7 + 0.6) * (1 - t) ** 1.5;
    const outer = (Math.sqrt((x / rx) ** 2 + (z / rz) ** 2) - 1) * Math.min(rx, rz) + fold;
    const hemY = (PLUSH ? 0.258 : 0.305) + 0.012 * (x / 0.16) ** 2; // (plush: a longer shirt over his stubby legs) // the hem curves up a little at the sides
    const solid = Math.max(outer, hemY - y, y - 0.515);
    let shirt = Math.max(Math.abs(outer + 0.006) - 0.006, hemY - y, y - 0.515); // a cloth shell, open at the bottom
    shirt = Math.min(shirt, Math.max(Math.abs(outer) - 0.009, Math.abs(y - hemY - 0.004) - 0.007)); // rolled hem
    if (y > 0.45) shirt = Math.min(shirt, solid); // closed across the shoulders
    // Front seam: a faint crease down the middle.
    shirt = ssub(shirt, len(x, 0, z - rz) - 0.004, 0.003);
    // Short, wide sleeves at the shoulders, pointing along each (posed) arm: crisp tubes, open at the end.
    let sleeve = 1e3;
    for (const A of ARMS) {
      const sb = add(A.S, scale(A.u, PLUSH ? 0.04 : 0.06)); // (plush: short cap sleeves, so his arms come out cleanly)
      // (plush: roomy sleeves, so his fat stuffed arms fit inside the opening and don't cut through its edge)
      let outerS = PLUSH ? roundCone(p, A.S, sb, 0.064, 0.062) : roundCone(p, A.S, sb, 0.046, 0.042);
      if (REAL) {
        // Sleeve creases: rings that bunch near the armpit, and a fold along the underside.
        const along = dot(sub(p, A.S), A.u);
        outerS += 0.0028 * Math.sin(along * 210) * clamp(1 - along / 0.06, 0, 1) + 0.0015 * Math.max(0, -dot(sub(p, A.S), [0, 1, 0]) / 0.05);
      }
      const cut = dot(sub(p, sb), A.u);
      sleeve = Math.min(sleeve, Math.max(outerS, cut - 0.004, -dot(sub(p, A.S), A.u) - 0.03) - 0.002);
    }
    d.sleeve = sleeve;
    d.shirt = shirt;
    // Collar: big pointed flaps spreading out from the neck, lying on the shirt (thin triangles with soft edges).
    let collar = 1e3;
    for (const sg of [-1, 1]) {
      const X = x * sg;
      const tri = [[0.008, 0.512], [0.11, 0.488], [0.035, 0.432]];
      // 2D distance to the triangle (negative inside).
      let dd = 1e3, inside = true;
      for (let i = 0; i < 3; i++) {
        const [ax, ay] = tri[i], [bx, by] = tri[(i + 1) % 3];
        const ex = bx - ax, ey = by - ay, wx = X - ax, wy = y - ay;
        const h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
        dd = Math.min(dd, Math.hypot(wx - ex * h, wy - ey * h));
        if (ex * wy - ey * wx > 0) inside = false;
      }
      const d2 = inside ? -dd : dd;
      const t2 = clamp((y - 0.3) / 0.21, 0, 1), sh2 = Math.sqrt(Math.max(0, 1 - clamp((y - 0.455) / 0.06, 0, 1) ** 2));
      const rx2 = (0.122 + 0.036 * (1 - t2) ** 1.4) * (0.55 + 0.45 * sh2) * pk[0], rz2 = (0.09 + 0.022 * (1 - t2)) * (0.7 + 0.3 * sh2) * pk[1];
      const surf = rz2 * Math.sqrt(Math.max(0, 1 - (X / rx2) ** 2)) + 0.009;
      collar = Math.min(collar, Math.max(d2 - 0.004, Math.abs(z - surf) - 0.0075));
    }
    d.collar = collar;
    // The tie: a little knot and a short ragged blade with drippy ends.
    const zf = (yy) => { const tt = clamp((yy - 0.3) / 0.21, 0, 1), sh = Math.sqrt(Math.max(0, 1 - clamp((yy - 0.455) / 0.06, 0, 1) ** 2)); return (0.09 + 0.022 * (1 - tt)) * (0.7 + 0.3 * sh) * pk[1] + 0.006; };
    let tie = ellipsoid(p, [0.004, 0.495, zf(0.495)], [0.016, 0.014, 0.01]);
    tie = Math.min(tie, ellipsoid(p, [0.004, 0.478, zf(0.478)], [0.013, 0.015, 0.008]));
    for (const [ax, ay, bx, by, r] of [[0.004, 0.47, 0.0, 0.42, 0.012], [0.0, 0.43, -0.01, 0.4, 0.008], [0.0, 0.43, 0.012, 0.395, 0.007], [0.012, 0.395, 0.006, 0.375, 0.006], [-0.01, 0.4, -0.016, 0.384, 0.006]]) {
      tie = smin(tie, roundCone(p, [ax, ay, zf(ay)], [bx, by, zf(by)], r, r * 0.8), 0.006);
    }
    d.tie = tie;
    if (!PLUSH) {
      // The new shirt (same design as the plush's, fitted to his slimmer body): one clean body that keeps its shape,
      // longer cuffed sleeves, and the tie and collar sewn flat onto the front (painted in regions.mjs).
      d.shirt = cleanShirt(p);
      d.sleeve = cleanSleeves(p);
      d.collar = d.tie = 1e3;
    }
    if (PLUSH) {
      // Plush: a clean felt tie, a bit bigger: a round knot and a smooth blade that widens to a rounded point,
      // lying flat on the shirt (squashed against it).
      const flat = (yy) => [x, yy, (z - zf(yy)) * 2.6 + zf(yy)];
      const knot = ellipsoid(flat(y), [0.004, 0.493, zf(0.493)], [0.019, 0.016, 0.026]);
      const blade = roundCone(flat(y), [0.004, 0.474, zf(0.474)], [0.004, 0.404, zf(0.404)], 0.011, 0.021);
      d.tie = Math.min(knot, blade) / 2.6;
    }
    // Plush: the sewn-in fabric tag hanging from his side seam, like every plushie has.
    if (PLUSH) {
      // On his back, low on the left, hanging below the hem; flat against the back (thin along z).
      const q = local(p, [-0.085, 0.29, -0.104], 0.12, -0.55);
      d.tag = Math.max(box(q, [0.02, 0.036, 0.0028], 0.002), y - 0.33);
    }
  }

  // --- arms and hands (tan), in his pose: right arm up and out with an open palm, left arm pointing out ---
  {
    let arm = 1e3, hand = 1e3;
    for (const A of ARMS) {
      arm = Math.min(arm, PLUSH ? roundCone(p, add(A.S, scale(A.u, 0.02)), A.W, 0.044, 0.04) : roundCone(p, add(A.S, scale(A.u, 0.02)), A.W, 0.028, 0.025));
      // The hand: a soft palm and four fat cartoon fingers fanned out, plus a thumb.
      const H = add(A.W, scale(A.hu, 0.042));
      const v = norm(cross(A.n, A.hu));
      const q = [dot(sub(p, H), A.hu), dot(sub(p, H), v), dot(sub(p, H), A.n)];
      if (PLUSH) {
        // A round stuffed mitten with a little thumb nub (plushies don't have fingers).
        const mit = smin(ellipsoid(q, [0.006, 0, 0.004], [0.058, 0.054, 0.04]), ellipsoid(q, [-0.004, 0.048 * Math.sign(A.thumb), 0.012], [0.024, 0.022, 0.02]), 0.016);
        hand = Math.min(hand, mit);
        continue;
      }
      let h = ellipsoid(q, [0, 0, 0], [0.056, 0.054, 0.024]);
      for (const [ang, l] of [[-0.55, 0.05], [-0.18, 0.06], [0.18, 0.06], [0.55, 0.05]]) {
        const b = [0.036 * Math.cos(ang), 0.04 * Math.sin(ang), 0.002];
        const dir = [Math.cos(ang), Math.sin(ang), 0];
        const mid = [b[0] + dir[0] * l * 0.55, b[1] + dir[1] * l * 0.55, 0.008];
        const c = 0.4; // sculpted half-curled; the finger bones open or curl them from here
        const tip = [mid[0] + dir[0] * l * 0.5 * Math.cos(c), mid[1] + dir[1] * l * 0.5 * Math.cos(c), mid[2] + l * 0.5 * Math.sin(c)];
        h = smin(h, smin(roundCone(q, b, mid, 0.016, 0.0145), roundCone(q, mid, tip, 0.0145, 0.0125), 0.006), 0.011);
      }
      const ta = A.thumb;
      h = smin(h, roundCone(q, [-0.008, 0.042 * Math.sign(ta), 0.004], [0.024, 0.086 * Math.sign(ta), 0.012], 0.016, 0.013), 0.01);
      hand = Math.min(hand, h);
    }
    d.arm = arm;
    d.hand = hand;
  }

  // --- thin legs (navy) going into big chunky black boots: a fat rounded toe turned OUT (like the drawing), and an
  // upright ankle shaft with a rolled top that the leg disappears into ---
  d.leg = Math.max(PLUSH ? roundCone(m, [0.055, 0.31, 0], [0.062, 0.2, 0], 0.04, 0.038) : roundCone(m, [0.048, 0.31, 0], [0.058, 0.2, 0], 0.026, 0.025), 0.006 - Math.abs(x));
  {
    const q = local(m, BOOT.c, 0, BOOT.ry);
    const toe = PLUSH ? ellipsoid(q, [0, 0.0, 0.04], [0.11, 0.095, 0.14]) : ellipsoid(q, [0, -0.004, 0.06], [0.108, 0.084, 0.15]);
    const heel = ellipsoid(q, [0.004, 0.022, -0.045], [0.088, 0.086, 0.088]);
    const shaft = roundCone(m, [0.066, 0.07, -0.006], [0.062, 0.212, -0.004], 0.06, 0.05);
    // Each boot stays on its own side of the middle: where the two boots met they fused into one blob, which then
    // stretched into a streak between his feet when they moved apart.
    const gap = 0.006 - Math.abs(x);
    d.shoe = Math.max(smin(smin(toe, heel, 0.05), shaft, 0.035), -y, gap);
    d.cuff = Math.max(torusY(m, [0.062, 0.222, -0.004], 0.047, 0.017), gap);
  }
  // --- the big red tail behind him: thick at the base low on his back, sweeping up and out to a rounded tip ---
  {
    const pts = [[0.13, 0.27, -0.14, 0.085], [0.04, 0.36, -0.22, 0.105], [-0.08, 0.5, -0.27, 0.098], [-0.17, 0.64, -0.26, 0.072], [-0.21, 0.75, -0.22, 0.03]];
    let tail = 1e3;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay, az, ar] = pts[i], [bx, by, bz, br] = pts[i + 1];
      tail = smin(tail, roundCone(p, [ax, ay, az], [bx, by, bz], ar, br), 0.04);
    }
    d.tail = 1e3 + 0 * tail; // (no tail: his skateboard goes on his back)
  }
  return d;
}

/** The whole figure. */
export function sdf(p) {
  const d = parts(p);
  // The body (blended like clay)...
  let s = d.head;
  s = smin(s, d.tuft, 0.035);
  s = smin(s, d.ear, 0.02);
  s = smin(s, d.earFold, 0.005);
  s = smin(s, d.earFuzz, 0.004);
  s = Math.min(s, d.xeye);
  s = Math.min(s, d.xcross);
  s = Math.min(s, d.sleepy);
  s = smin(s, d.lid, 0.004);
  s = smin(s, d.nose, 0.006);

  s = smin(s, d.lip, 0.004);

  s = smin(s, d.leg, 0.02);
  s = smin(s, d.cuff, 0.01);
  s = smin(s, d.shoe, 0.025);
  s = smin(s, d.tail, 0.03);
  s = smin(s, d.arm, 0.01);
  s = smin(s, d.hand, 0.012);
  // ...with the clothes over it (sharp joins: cloth doesn't melt into skin).
  // At the neck the shirt melts softly into the head (a hard join left a scratchy seam of crossing surfaces).
  s = p[1] > (PLUSH ? 0.47 * PLUSH_BODY[1] : 0.47) ? smin(s, d.shirt, 0.012) : Math.min(s, d.shirt);
  s = Math.min(s, d.sleeve);

  s = Math.min(s, d.collar);
  s = Math.min(s, d.tie);
  if (PLUSH) s = Math.min(s, d.tag);
  return s;
}

/** Which part a surface point belongs to. */
export function partAt(p) {
  const d = parts(p);
  let best = 'head', bd = Infinity;
  for (const k of ['head', 'lip', 'tuft', 'ear', 'earFold', 'earFuzz', 'xeye', 'xcross', 'sleepy', 'lid', 'nose', 'tongue', 'tooth', 'shirt', 'sleeve', 'collar', 'tie', 'arm', 'hand', 'leg', 'cuff', 'shoe', 'tail', 'tag']) {
    if (d[k] === undefined) continue;
    const v = Math.abs(d[k]);
    if (v < bd) { bd = v; best = k; }
  }
  return { name: best, d };
}

export const BOUNDS = PLUSH ? { min: [-0.5, -0.01, -0.42], max: [0.52, 1.28, 0.4] } : { min: [-0.44, -0.01, -0.4], max: [0.5, 1.02, 0.29] };
