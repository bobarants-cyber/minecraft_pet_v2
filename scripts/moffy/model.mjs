// Moffy, sculpted as a distance field (model units: height ≈ 1, feet at y = 0, face towards +z, his left = +x).
// A mischievous teddy bear: a big round head with round ears (his left one has a bite out of it), a peach muzzle,
// a tiny body in an oversized yellow hoodie with a bunched hood and a pocket full of borrowed sweets, white paws,
// short legs in mismatched sneakers (pink on his right, green on his left) and a big puffy heart-shaped tail.
// The face (blue eye, green half-lidded eye, brow, heart nose, smirk, blush, star sticker, stitched patch) is painted
// in regions.mjs; only the tongue sticks out as a shape. His gold hoop earring and hoverboard are built in the app.
// Proportions are taken straight from the design sheet: 1 sheet pixel = F model units, head centre at y = 0.68.

const len = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
const smin = (a, b, k) => { const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1); return mix(b, a, h) - k * h * (1 - h); };
const smax = (a, b, k) => -smin(-a, -b, k);
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
/** A point in a part's own frame: moved to its centre, then turned (z, then y, then x). */
export function local(p, c, rz = 0, ry = 0, rx = 0) {
  let x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
  if (rz) { const cs = Math.cos(rz), sn = Math.sin(rz); [x, y] = [cs * x + sn * y, -sn * x + cs * y]; }
  if (ry) { const cs = Math.cos(ry), sn = Math.sin(ry); [x, z] = [cs * x - sn * z, sn * x + cs * z]; }
  if (rx) { const cs = Math.cos(rx), sn = Math.sin(rx); [y, z] = [cs * y + sn * z, -sn * y + cs * z]; }
  return [x, y, z];
}
/** The classic 2D heart, tip at the origin pointing down, about ±0.6 wide and 1.1 tall (unit size). */
export function heart2(x, y) {
  x = Math.abs(x);
  if (y + x > 1) return Math.hypot(x - 0.25, y - 0.75) - Math.SQRT2 / 4;
  const a = (x) ** 2 + (y - 1) ** 2;
  const m = 0.5 * Math.max(x + y, 0);
  const b = (x - m) ** 2 + (y - m) ** 2;
  return Math.sqrt(Math.min(a, b)) * Math.sign(x - y);
}

export const F = 0.30 / 180; // sheet px → model units (the head is 180 px / 0.30 wide)
export const HEAD = { c: [0, 0.68, 0], r: [0.3, 0.253, 0.25] };
export const MUZZLE = { c: [0, 0.593, 0.2], r: [0.123, 0.093, 0.075] };
export const EARS = [
  { c: [-0.218, 0.868, -0.015], bite: false }, // his right ear (gold hoop, added in the app)
  { c: [0.218, 0.868, -0.015], bite: true }, // his left ear, with a bite taken out
];
export const EAR_R = 0.1;
export const BITES = [[0.272, 0.968, 0.03], [0.316, 0.922, 0.028], [0.33, 0.87, 0.024]];
/** The big heart tail: centre, size (half-width) and how it's turned (out to his left side and back). */
export const TAIL = { c: [0.2, 0.235, -0.15], s: 0.21, rz: 0.42, ry: -0.75 };
export const TAIL_ROOT = [0.06, 0.2, -0.11];
export const SHOES = [{ c: [-0.103, 0.05, 0.03], color: 'pink' }, { c: [0.103, 0.05, 0.03], color: 'green' }];
export const ARMS = [
  // The shoulder joint sits deep inside the hoodie, so a raised arm turns inside his body instead of tearing the
  // sleeve away from it (fat sleeves on a shallow joint stretched into wings).
  { S: [-0.12, 0.375, 0], W: [-0.235, 0.215, 0.03] }, // his right (−x)
  { S: [0.12, 0.375, 0], W: [0.235, 0.215, 0.03] }, // his left (+x)
];

/** The tail in its own frame: a puffy pillow-heart, thickest in the middle. Returns [distance, 2D edge distance]. */
export function tailFrame(p) {
  const q = local(p, TAIL.c, TAIL.rz, TAIL.ry);
  const s = TAIL.s / 0.6;
  // heart2 has its tip at y = 0 and lobes up to ~1.1: centre it.
  const d2 = heart2(q[0] / s, q[1] / s + 0.55) * s;
  const t = 0.014 + Math.min(0.034, 0.55 * Math.max(0, -d2)); // pillow: thicker towards the middle
  const d = Math.max(d2, Math.abs(q[2]) - t);
  return [d - 0.004, d2];
}

function parts(p) {
  const [x, y, z] = p;
  const d = {};
  // --- head: a big round head, round ears (one bitten), muzzle ---
  d.head = ellipsoid(p, HEAD.c, HEAD.r);
  let ear = 1e3;
  for (const E of EARS) {
    let e = ellipsoid(p, E.c, [EAR_R, EAR_R, 0.052]);
    if (E.bite) for (const [bx, by, br] of BITES) e = Math.max(e, -(Math.hypot(x - bx, y - by) - br)); // bitten out (through the ear)
    ear = Math.min(ear, e);
  }
  d.ear = ear;
  d.muzzle = ellipsoid(p, MUZZLE.c, MUZZLE.r);
  // the tongue sticking out of the right corner of his smirk
  d.tongue = ellipsoid(p, [0.037, 0.532, 0.262], [0.018, 0.02, 0.012]);
  // --- body: an oversized hoodie, a bunched hood round the neck, a pocket with sweets peeking out ---
  let hoodie = ellipsoid(p, [0, 0.27, 0], [0.205, 0.165, 0.158]);
  hoodie = smin(hoodie, ellipsoid(p, [0, 0.36, 0], [0.17, 0.08, 0.13]), 0.04);
  hoodie = smax(hoodie, 0.105 - y, 0.03); // flat-ish bottom with a soft edge
  d.hoodie = hoodie;
  d.hood = Math.hypot(Math.hypot(x / 0.165, (z + 0.012) / 0.13) * 0.14 - 0.14, (y - 0.415) * 1.25) - 0.03;
  d.candy = Math.min(ellipsoid(p, [-0.067, 0.262, 0.162], [0.024, 0.018, 0.016]),
    ellipsoid(p, [-0.098, 0.262, 0.158], [0.012, 0.012, 0.008]), ellipsoid(p, [-0.036, 0.262, 0.158], [0.012, 0.012, 0.008]));
  d.cookie = ellipsoid(p, [0.052, 0.268, 0.16], [0.029, 0.029, 0.009]);
  // --- arms: hoodie sleeves with white paws ---
  let sleeve = 1e3, paw = 1e3;
  for (const A of ARMS) {
    sleeve = Math.min(sleeve, roundCone(p, A.S, A.W, 0.042, 0.036));
    const P = [A.W[0] + (A.W[0] - A.S[0]) * 0.32, A.W[1] + (A.W[1] - A.S[1]) * 0.32, A.W[2]];
    paw = Math.min(paw, ellipsoid(p, P, [0.04, 0.04, 0.038]));
  }
  d.sleeve = sleeve;
  d.paw = paw;
  // --- legs and mismatched high-top sneakers with white soles ---
  const m = [Math.abs(x), y, z];
  d.leg = Math.max(roundCone(m, [0.07, 0.17, 0], [0.072, 0.07, 0.01], 0.037, 0.036), 0.006 - Math.abs(x));
  let shoe = 1e3, sole = 1e3;
  for (const S of SHOES) {
    const q = [x - S.c[0], y - S.c[1], z - S.c[2]];
    // a chunky high-top: a rounded toe box out front, a taller ankle collar at the back
    const toe = ellipsoid(q, [0, 0.0, 0.035], [0.072, 0.052, 0.098]);
    const collar = roundCone(q, [0, 0.03, -0.02], [0, 0.085, -0.025], 0.058, 0.05);
    shoe = Math.min(shoe, Math.max(smin(toe, collar, 0.03), 0.016 - y));
    sole = Math.min(sole, Math.max(ellipsoid(q, [0, -0.02, 0.03], [0.08, 0.042, 0.108]), -y, y - 0.022));
  }
  d.shoe = Math.max(shoe, 0.006 - Math.abs(x));
  d.sole = Math.max(sole, 0.006 - Math.abs(x));
  // --- the big heart tail, on a short stub out of his back ---
  const [td] = tailFrame(p);
  d.tail = smin(td, roundCone(p, TAIL_ROOT, TAIL.c, 0.035, 0.03), 0.02);
  return d;
}

/** The whole figure. */
export function sdf(p) {
  const d = parts(p);
  let s = smin(d.head, d.ear, 0.03);
  s = smin(s, d.muzzle, 0.03);
  s = smin(s, d.tongue, 0.006);
  // body and clothes: the hoodie and hood melt softly into each other, cleanly against the head
  let body = smin(d.hoodie, d.hood, 0.02);
  body = smin(body, d.sleeve, 0.012);
  body = Math.min(body, d.candy, d.cookie);
  s = smin(s, body, 0.012);
  s = smin(s, d.paw, 0.012);
  s = Math.min(s, smin(d.leg, d.shoe, 0.015));
  s = Math.min(s, d.sole);
  s = smin(s, d.tail, 0.02);
  return s;
}

export const PARTS = ['head', 'ear', 'muzzle', 'tongue', 'hoodie', 'hood', 'candy', 'cookie', 'sleeve', 'paw', 'leg', 'shoe', 'sole', 'tail'];
/** Which part a surface point belongs to (the closest one). */
export function partAt(p) {
  const d = parts(p);
  let best = 'head', bd = Infinity;
  for (const k of PARTS) {
    const v = Math.abs(d[k]);
    if (v < bd) { bd = v; best = k; }
  }
  return { name: best, d };
}

export const BOUNDS = { min: [-0.37, -0.01, -0.36], max: [0.43, 1.0, 0.32] };
