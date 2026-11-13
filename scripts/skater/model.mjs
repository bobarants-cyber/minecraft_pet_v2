// The skater, sculpted as one smooth "clay" shape: a signed-distance field where every part is blended into the
// next (smooth unions), so joins are soft like a sculpted figure, not balls stuck together. Model units: height 1
// (tip of the hair tuft), feet at y = 0, face towards +z. Proportions traced from the Meshy screenshots (front view:
// 630 px tall → 1 unit). His left is +x (the viewer's right).
//
// part(p) tells which part a point belongs to (for colours and skin weights): the part whose own surface is nearest.

const len = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;

// --- primitives (each returns a signed distance) ---
const sphere = (p, c, r) => len(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r;
function ellipsoid(p, c, r) {
  const x = (p[0] - c[0]) / r[0], y = (p[1] - c[1]) / r[1], z = (p[2] - c[2]) / r[2];
  const k0 = len(x, y, z);
  const k1 = len(x / r[0], y / r[1], z / r[2]);
  return k0 < 1e-9 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
}
/** Capsule / tapered limb from a (radius ra) to b (radius rb). */
function roundCone(p, a, b, ra, rb) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2];
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  return len(pax - bax * h, pay - bay * h, paz - baz * h) - mix(ra, rb, h);
}
function roundBox(p, c, half, r, rotZ = 0) {
  let x = p[0] - c[0], y = p[1] - c[1];
  const z = p[2] - c[2];
  if (rotZ) { const cs = Math.cos(rotZ), sn = Math.sin(rotZ); [x, y] = [cs * x + sn * y, -sn * x + cs * y]; }
  const qx = Math.abs(x) - half[0] + r, qy = Math.abs(y) - half[1] + r, qz = Math.abs(z) - half[2] + r;
  return len(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
function torusY(p, c, R, r) {
  const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
  return len(Math.sqrt(x * x + z * z) - R, y, 0) - r;
}
const smin = (a, b, k) => { const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1); return mix(b, a, h) - k * h * (1 - h); };
const ssub = (d, cut, k) => { const h = clamp(0.5 - (0.5 * (d + cut)) / k, 0, 1); return mix(d, -cut, h) + k * h * (1 - h); };
/** Rotate a point about a centre (around z, then y), for parts that are turned. */
function turn(p, c, rz = 0, ry = 0) {
  let x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
  if (rz) { const cs = Math.cos(rz), sn = Math.sin(rz); [x, y] = [cs * x + sn * y, -sn * x + cs * y]; }
  if (ry) { const cs = Math.cos(ry), sn = Math.sin(ry); [x, z] = [cs * x - sn * z, sn * x + cs * z]; }
  return [x + c[0], y + c[1], z + c[2]];
}

// --- the figure ---
export const HEAD = { c: [0, 0.69, 0], r: [0.245, 0.2, 0.21] };
export const XEYE = { c: [-0.118, 0.684, 0.142], r: 0.094 }; // his right eye: stitched with an X
export const SLEEPY = { c: [0.126, 0.694, 0.14], r: 0.088 }; // his left eye: half-closed, purple
export const NOSE = { c: [0.02, 0.622, 0.198], r: 0.02 };
export const MOUTH = { c: [0.02, 0.566, 0.17], r: [0.064, 0.038, 0.05] };

/** Each part's own distance (before blending), by name. */
function parts(p) {
  const [x, y, z] = p;
  const sx = Math.sign(x) || 1; // mirror for left/right pairs
  const m = [Math.abs(x), y, z];
  const d = {};
  // Head: a round skull with soft full cheeks.
  d.head = smin(ellipsoid(p, HEAD.c, HEAD.r), ellipsoid(m, [0.14, 0.6, 0.06], [0.115, 0.09, 0.11]), 0.06);
  // Ears: round, flat, tilted out, with a cupped hollow in front.
  const ec = [0.185, 0.9, -0.03];
  const ep = turn(m, ec, -0.45, 0.25);
  d.ear = ssub(ellipsoid(ep, ec, [0.088, 0.094, 0.034]), ellipsoid(ep, [ec[0], ec[1] - 0.005, ec[2] + 0.03], [0.058, 0.064, 0.03]), 0.012);
  // Hair tuft: a flame-like spike leaning a little, with a smaller second spike.
  d.tuft = smin(roundCone(p, [-0.005, 0.84, 0.02], [-0.03, 1.0, -0.025], 0.07, 0.006), roundCone(p, [0.05, 0.83, 0.03], [0.1, 0.935, 0.0], 0.045, 0.006), 0.03);
  // Eyes.
  d.xeye = ellipsoid(p, XEYE.c, [XEYE.r, XEYE.r, 0.05]);
  {
    const q = [x - XEYE.c[0], y - XEYE.c[1], z - (XEYE.c[2] + 0.047)];
    const bar = (a) => roundBox([q[0], q[1], q[2]], [0, 0, 0], [0.058, 0.014, 0.012], 0.006, a);
    d.xcross = Math.min(bar(Math.PI / 4), bar(-Math.PI / 4));
  }
  d.sleepy = ellipsoid(p, SLEEPY.c, [SLEEPY.r, SLEEPY.r, 0.05]);
  d.lid = ellipsoid(p, [SLEEPY.c[0], SLEEPY.c[1] + 0.03, SLEEPY.c[2] + 0.006], [0.092, 0.05, 0.05]);
  d.nose = sphere(p, NOSE.c, NOSE.r);
  d.tongue = ellipsoid(p, [0.026, 0.55, 0.166], [0.036, 0.028, 0.03]);
  // Shirt: an A-line shape flaring out to the hem, with short sleeves and a collar.
  {
    const t = clamp((y - 0.3) / 0.22, 0, 1);
    const rx = mix(0.205, 0.115, t), rz = mix(0.13, 0.088, t);
    const body = (Math.sqrt((x / rx) ** 2 + (z / rz) ** 2) - 1) * Math.min(rx, rz);
    d.shirt = Math.max(body, 0.3 - y, y - 0.535) - 0.004;
    d.shirt = smin(d.shirt, roundCone(m, [0.1, 0.49, 0], [0.175, 0.43, 0.01], 0.05, 0.048), 0.03);
    const collar = roundBox(turn(m, [0.05, 0.515, 0.085], 0.5, -0.4), [0.05, 0.515, 0.085], [0.045, 0.022, 0.006], 0.005);
    d.collar = collar;
    d.charm = ellipsoid(p, [0.012, 0.43, 0.105], [0.018, 0.035, 0.012]);
  }
  // Arms (hanging, relaxed) and hands: tan.
  d.arm = roundCone(m, [0.15, 0.46, 0.0], [0.245, 0.315, 0.025], 0.03, 0.026);
  {
    const hc = [0.262, 0.285, 0.035];
    const hp = turn(m, hc, 0.35, 0);
    let hand = ellipsoid(hp, hc, [0.036, 0.044, 0.024]);
    for (const [fx, fz, l] of [[-0.022, 0.008, 0.045], [-0.006, 0.014, 0.052], [0.012, 0.012, 0.05], [0.026, 0.004, 0.04]]) {
      hand = smin(hand, roundCone(hp, [hc[0] + fx, hc[1] - 0.02, hc[2] + fz], [hc[0] + fx * 1.2, hc[1] - 0.02 - l, hc[2] + fz + 0.01], 0.013, 0.011), 0.012);
    }
    hand = smin(hand, roundCone(hp, [hc[0] - 0.03, hc[1] + 0.005, hc[2] + 0.015], [hc[0] - 0.055, hc[1] - 0.02, hc[2] + 0.04], 0.013, 0.011), 0.01); // thumb
    d.hand = hand;
  }
  // Legs (navy trousers) and big round shoes with a cuffed top and a white sole.
  d.leg = roundCone(m, [0.058, 0.32, 0], [0.068, 0.14, 0.0], 0.034, 0.03);
  {
    const sc = [0.118, 0.074, 0.05];
    const sp = turn(m, sc, 0, -0.28);
    d.shoe = Math.max(smin(ellipsoid(sp, sc, [0.11, 0.078, 0.18]), ellipsoid(sp, [sc[0], sc[1] + 0.03, sc[2] - 0.06], [0.07, 0.06, 0.08]), 0.04), -y);
    d.cuff = torusY(m, [0.074, 0.145, -0.005], 0.042, 0.022);
  }
  return d;
}

/** The whole figure's signed distance. */
export function sdf(p) {
  const d = parts(p);
  let s = d.head;
  s = smin(s, d.ear, 0.025);
  s = smin(s, d.tuft, 0.04);
  s = smin(s, d.xeye, 0.012);
  s = Math.min(s, d.xcross);
  s = smin(s, d.sleepy, 0.012);
  s = smin(s, d.lid, 0.008);
  s = smin(s, d.nose, 0.008);
  s = ssub(s, ellipsoid(p, MOUTH.c, MOUTH.r), 0.012); // the open mouth
  s = smin(s, d.tongue, 0.006);
  s = smin(s, d.shirt, 0.03);
  s = Math.min(s, d.collar);
  s = smin(s, d.charm, 0.004);
  s = smin(s, d.arm, 0.025);
  s = smin(s, d.hand, 0.015);
  s = smin(s, d.leg, 0.025);
  s = smin(s, d.cuff, 0.012);
  s = smin(s, d.shoe, 0.03);
  return s;
}

/** Which part a surface point belongs to (nearest part surface), and all part distances. */
export function partAt(p) {
  const d = parts(p);
  // The mouth hollow: points inside the carved mouth (and not on the tongue) are the inside of the mouth.
  if (ellipsoid(p, MOUTH.c, MOUTH.r) < 0.004 && d.tongue > 0.002) return { name: 'mouth', d };
  let best = 'head', bd = Infinity;
  for (const [k, v] of Object.entries(d)) if (Math.abs(v) < bd) { bd = Math.abs(v); best = k; }
  return { name: best, d };
}

export const BOUNDS = { min: [-0.36, -0.01, -0.24], max: [0.36, 1.02, 0.26] };
