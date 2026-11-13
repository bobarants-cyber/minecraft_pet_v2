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
/** His pose, measured from the front screenshot: S = shoulder, W = wrist, n = which way the palm faces. */
function arm(S, W, palm, thumb, hand) {
  const u = norm(sub(W, S));
  const hu = norm(hand ?? u);
  const n = norm(sub(palm, scale(hu, dot(palm, hu))));
  return { S, W, u, hu, n, thumb };
}
export const ARMS = [
  arm([-0.105, 0.49, 0.0], [-0.255, 0.655, 0.05], [0.2, 1, 0.5], 1, [-1, 0.45, 0.25]), // his right arm: up and out, open palm up, fingers out
  arm([0.115, 0.48, 0.0], [0.295, 0.482, 0.05], [0, 0.35, 1], 1, [1, -0.12, 0.12]), // his left arm: pointing out to the side
];
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

function parts(p) {
  const [x, y, z] = p;
  const m = [Math.abs(x), y, z]; // mirrored for pairs
  const d = {};

  // --- head ---
  let head = smin(ellipsoid(p, HEAD.c, HEAD.r), ellipsoid(p, JOWL.c, JOWL.r), 0.05);
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
    const socket = ellipsoid(p, [cx, cy, fz + 0.01], [XEYE.r + 0.008, XEYE.ry + 0.008, 0.028]);
    head = ssub(head, socket, 0.01);
    d.xeye = ellipsoid(p, [cx, cy, fz - 0.04], [XEYE.r, XEYE.ry, 0.042]);
    // The raised cross, tilted.
    const q = local(p, [cx + 0.004, cy - 0.004, fz + 0.006], 0.35);
    d.xcross = Math.min(box(q, [0.056, 0.017, 0.01], 0.006), box(q, [0.017, 0.056, 0.01], 0.006));
  }
  // The sleepy eye: a big eyeball, and a heavy lid over its top half whose edge sticks out.
  {
    const [cx, cy] = SLEEPY.c, fz = faceZ(cx, cy);
    const socket = ellipsoid(p, [cx, cy, fz + 0.006], [SLEEPY.r + 0.006, SLEEPY.ry + 0.006, 0.026]);
    head = ssub(head, socket, 0.008);
    d.sleepy = ellipsoid(p, [cx, cy, fz - 0.042], [SLEEPY.r, SLEEPY.ry, 0.05]);
    const lidShell = ellipsoid(p, [cx, cy - 0.004, fz - 0.04], [SLEEPY.r + 0.01, SLEEPY.ry + 0.009, 0.066]);
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
    let ear = shape(0);
    const hollow = ellipsoid([q[0], q[1] + 0.006, q[2] - 0.021], [0, 0, 0], [0.05, 0.071, 0.025]);
    d.earHollow = hollow;
    ear = ssub(ear, hollow, 0.01);
    d.ear = ear;
    d.earFold = 1e3; // (the small fold inside the ear is painted, not sculpted)
  }
  // --- hair: a tall spike leaning right, a smaller one on the left, both growing out of the head ---
  d.tuft = smin(
    smin(roundCone(p, [0.03, 0.8, 0.0], [0.045, 0.92, -0.012], 0.075, 0.035), roundCone(p, [0.045, 0.92, -0.012], [0.07, 1.0, -0.03], 0.035, 0.005), 0.02),
    roundCone(p, [-0.05, 0.81, 0.02], [-0.07, 0.935, 0.0], 0.048, 0.008),
    0.035,
  );

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
    const t = ellipsoid(p, [cx, ty, faceZ(cx, ty) - 0.012], [0.024, 0.03, 0.016]);
    d.tongue = ssub(t, len(x - cx, 0, z - faceZ(cx, ty) - 0.004) - 0.0022, 0.003);
    let tooth = 1e3;
    for (const sg of [-1, 1]) tooth = Math.min(tooth, roundCone(p, [cx + sg * 0.021, cy + 0.006, fz - 0.006], [cx + sg * 0.02, cy - 0.01, fz - 0.003], 0.0075, 0.003));
    d.tooth = tooth;
    d.lipCut = 1e3;
  }

  // --- shirt: hollow A-line with a rolled hem, front seam, collar, short wide sleeves ---
  {
    const t = clamp((y - 0.3) / 0.21, 0, 1);
    const rx = mix(0.185, 0.118, t ** 0.9), rz = mix(0.122, 0.09, t);
    // Soft cloth folds that fade out towards the chest.
    const fold = 0.0035 * Math.sin(Math.atan2(x, z) * 9 + 0.6) * (1 - t) ** 1.5;
    const outer = (Math.sqrt((x / rx) ** 2 + (z / rz) ** 2) - 1) * Math.min(rx, rz) + fold;
    const solid = Math.max(outer, 0.3 - y, y - 0.51);
    let shirt = Math.max(Math.abs(outer + 0.006) - 0.006, 0.3 - y, y - 0.515); // a cloth shell, open at the bottom
    shirt = Math.min(shirt, Math.max(Math.abs(outer) - 0.012, Math.abs(y - 0.303) - 0.008)); // rolled hem
    if (y > 0.5) shirt = Math.min(shirt, solid); // closed across the shoulders
    // Front seam: a faint crease down the middle.
    shirt = ssub(shirt, len(x, 0, z - rz) - 0.004, 0.003);
    // Short, wide sleeves at the shoulders, pointing along each (posed) arm: crisp tubes, open at the end.
    let sleeve = 1e3;
    for (const A of ARMS) {
      const sb = add(A.S, scale(A.u, 0.075));
      const outerS = roundCone(p, A.S, sb, 0.05, 0.058);
      const cut = dot(sub(p, sb), A.u);
      sleeve = Math.min(sleeve, Math.max(Math.max(outerS, -(outerS + 0.011)), cut, -dot(sub(p, A.S), A.u) - 0.02));
    }
    d.sleeve = sleeve;
    d.shirt = shirt;
    // Collar: two pointed flaps folded over at the neck.
    let collar = 1e3;
    for (const s of [-1, 1]) {
      const q = local([x * s, y, z], [0.04, 0.5, 0.096], 0.75, -0.25, -0.35);
      collar = Math.min(collar, box(q, [0.05, 0.016, 0.005], 0.004));
    }
    d.collar = collar;
    // The tie: a little knot and a short ragged blade with drippy ends.
    const zf = (yy) => mix(0.122, 0.09, clamp((yy - 0.3) / 0.21, 0, 1)) + 0.007;
    let tie = ellipsoid(p, [0.004, 0.495, zf(0.495)], [0.016, 0.014, 0.01]);
    tie = Math.min(tie, ellipsoid(p, [0.004, 0.478, zf(0.478)], [0.013, 0.015, 0.008]));
    for (const [ax, ay, bx, by, r] of [[0.004, 0.47, 0.0, 0.42, 0.012], [0.0, 0.43, -0.01, 0.4, 0.008], [0.0, 0.43, 0.012, 0.395, 0.007], [0.012, 0.395, 0.006, 0.375, 0.006], [-0.01, 0.4, -0.016, 0.384, 0.006]]) {
      tie = smin(tie, roundCone(p, [ax, ay, zf(ay)], [bx, by, zf(by)], r, r * 0.8), 0.006);
    }
    d.tie = tie;
  }

  // --- arms and hands (tan), in his pose: right arm up and out with an open palm, left arm pointing out ---
  {
    let arm = 1e3, hand = 1e3;
    for (const A of ARMS) {
      arm = Math.min(arm, roundCone(p, add(A.S, scale(A.u, 0.02)), A.W, 0.028, 0.025));
      // The hand: a soft palm and four fat cartoon fingers fanned out, plus a thumb.
      const H = add(A.W, scale(A.hu, 0.042));
      const v = norm(cross(A.n, A.hu));
      const q = [dot(sub(p, H), A.hu), dot(sub(p, H), v), dot(sub(p, H), A.n)];
      let h = ellipsoid(q, [0, 0, 0], [0.05, 0.048, 0.022]);
      for (const [ang, l] of [[-0.55, 0.048], [-0.18, 0.058], [0.18, 0.058], [0.52, 0.05]]) {
        const b = [0.032 * Math.cos(ang), 0.036 * Math.sin(ang), 0.002];
        h = smin(h, roundCone(q, b, [b[0] + l * Math.cos(ang), b[1] + l * Math.sin(ang), 0.006], 0.0145, 0.0125), 0.011);
      }
      const ta = A.thumb;
      h = smin(h, roundCone(q, [-0.006, 0.036 * Math.sign(ta), 0.004], [0.022, 0.076 * Math.sign(ta), 0.012], 0.0145, 0.012), 0.01);
      hand = Math.min(hand, h);
    }
    d.arm = arm;
    d.hand = hand;
  }

  // --- thin legs (navy), wide rolled sock cuffs, and huge round black shoes with the toes turned out ---
  d.leg = roundCone(m, [0.042, 0.31, 0], [0.047, 0.2, 0], 0.026, 0.025);
  d.cuff = smin(torusY(m, [0.055, 0.222, -0.005], 0.042, 0.022), torusY(m, [0.055, 0.2, -0.005], 0.046, 0.024), 0.012);
  {
    const q = local(m, [0.14, 0.085, 0.05], 0, -0.6);
    const body = smin(ellipsoid(q, [0, -0.012, 0.035], [0.105, 0.072, 0.175]), ellipsoid(q, [0, 0.025, -0.055], [0.082, 0.08, 0.092]), 0.045);
    d.shoe = Math.max(body, -y);
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
  s = Math.min(s, d.earFold);
  s = Math.min(s, d.xeye);
  s = Math.min(s, d.xcross);
  s = Math.min(s, d.sleepy);
  s = smin(s, d.lid, 0.004);
  s = smin(s, d.nose, 0.006);
  s = ssub(s, d.mouthCut, 0.008);
  s = smin(s, d.lip, 0.004);
  s = Math.min(s, d.tongue);
  s = smin(s, d.leg, 0.02);
  s = smin(s, d.cuff, 0.01);
  s = smin(s, d.shoe, 0.025);
  s = smin(s, d.arm, 0.01);
  s = smin(s, d.hand, 0.012);
  // ...with the clothes over it (sharp joins: cloth doesn't melt into skin).
  s = Math.min(s, d.shirt);
  s = Math.min(s, d.sleeve);
  s = smin(s, d.tooth, 0.003);
  s = Math.min(s, d.collar);
  s = Math.min(s, d.tie);
  return s;
}

/** Which part a surface point belongs to. */
export function partAt(p) {
  const d = parts(p);
  if (d.mouthCut < 0.003 && d.tongue > 0.002) return { name: 'mouth', d };
  let best = 'head', bd = Infinity;
  for (const k of ['head', 'lip', 'tuft', 'ear', 'earFold', 'xeye', 'xcross', 'sleepy', 'lid', 'nose', 'tongue', 'tooth', 'shirt', 'sleeve', 'collar', 'tie', 'arm', 'hand', 'leg', 'cuff', 'shoe']) {
    const v = Math.abs(d[k]);
    if (v < bd) { bd = v; best = k; }
  }
  return { name: best, d };
}

export const BOUNDS = { min: [-0.36, -0.01, -0.24], max: [0.44, 1.02, 0.27] };
