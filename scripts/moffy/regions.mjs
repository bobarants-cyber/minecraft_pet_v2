// Moffy's colours, joints and skin weights. The face is painted from the design sheet's own coordinates (sheet px,
// head centre at (0, 0), y down): a model point (x, y) on the front of the head is sheet (x / F, (0.68 − y) / F).
// No black outlines anywhere (like Gliddy): parts meet in clean colour edges; only the eyes get thin dark rings.
import { partAt, F, MUZZLE, EARS, EAR_R, ARMS, TAIL, TAIL_ROOT, tailFrame, local } from './model.mjs';

const lin = (h) => [0, 2, 4].map((i) => (parseInt(h.slice(1 + i, 3 + i), 16) / 255) ** 2.2);
const FUR = lin('#fff7ef');
const INNER = lin('#ffc2d4');
const MUZ = lin('#ffe2cf');
const PATCH = lin('#7ad6ff');
const DARK = lin('#16151d');
const BLUE = lin('#3d8bff');
const BLUE2 = lin('#1f5fd1');
const BLUE3 = lin('#0f1b3a');
const GREEN = lin('#33c46a');
const GREEN2 = lin('#1d8c47');
const GREEN3 = lin('#0d2a18');
const WHITE = lin('#ffffff');
const PINK = lin('#ff5c8a');
const BLUSH = lin('#ff9cbc');
const STAR = lin('#ffc83d');
const HOODIE = lin('#ffc83d');
const HOOD = lin('#ffb21f');
const STRING = lin('#3a3744');
const COOKIE = lin('#c8915a');
const CHIP = lin('#5a3a22');
const GREEN_SHOE = lin('#43d17a');
const TAIL_RIM = lin('#ff7aa8');

export const PIVOTS = {
  head: [0, 0.43, 0],
  arm_R: ARMS[1].S, arm_L: ARMS[0].S, // _R = his left (+x), like the other pets' rigs
  leg_R: [0.07, 0.16, 0], leg_L: [-0.07, 0.16, 0],
  tail: TAIL_ROOT,
};
const GROUP = {
  head: 'head', ear: 'head', muzzle: 'head', tongue: 'head',
  hoodie: 'body', hood: 'body', candy: 'body', cookie: 'body',
  sleeve: 'arm', paw: 'arm', leg: 'leg', shoe: 'leg', sole: 'leg', tail: 'tail',
};

/** The part a surface point belongs to: the closest one it isn't inside of. */
function ownPart(p) {
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
  const g = GROUP[name];
  const w = {};
  const side = p[0] > 0 ? 'R' : 'L';
  if (g === 'arm') {
    // Soft arm roots: right where the sleeve meets the hoodie it stays with the body, then bends into the arm.
    const a = Math.min(1, Math.max(0, d.hoodie / 0.018)); // (a narrow band: a wide one stretched the sleeves into wings)
    w[`arm_${side}`] = a;
    w.body = 1 - a;
  } else if (g === 'leg') w[`leg_${side}`] = 1;
  else if (g === 'tail') {
    const t = Math.min(1, Math.hypot(p[0] - TAIL_ROOT[0], p[1] - TAIL_ROOT[1], p[2] - TAIL_ROOT[2]) / 0.07);
    w.tail = t;
    w.body = 1 - t;
  } else w[g] = 1;
  return w;
}

// ---------- 2D helpers (sheet px) ----------
const seg = (px, py, ax, ay, bx, by) => {
  const ex = bx - ax, ey = by - ay, h = Math.min(1, Math.max(0, ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey)));
  return Math.hypot(px - ax - ex * h, py - ay - ey * h);
};
const quadDist = (px, py, [x0, y0], [x1, y1], [x2, y2]) => {
  let best = Infinity, lx = x0, ly = y0;
  for (let i = 1; i <= 32; i++) {
    const t = i / 32, u = 1 - t;
    const x = u * u * x0 + 2 * u * t * x1 + t * t * x2, y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
    best = Math.min(best, seg(px, py, lx, ly, x, y));
    lx = x; ly = y;
  }
  return best;
};
const inPoly = (px, py, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
function heart2(x, y) {
  x = Math.abs(x);
  if (y + x > 1) return Math.hypot(x - 0.25, y - 0.75) - Math.SQRT2 / 4;
  const a = x * x + (y - 1) ** 2, m = 0.5 * Math.max(x + y, 0), b = (x - m) ** 2 + (y - m) ** 2;
  return Math.sqrt(Math.min(a, b)) * Math.sign(x - y);
}
function star(px, py, R, r) {
  // inside a 5-point star centred at the origin, a point up (sheet y is down): the radius runs from R at each point
  // to r at each notch, by angle
  const k = (Math.PI * 2) / 5, a = Math.atan2(px, -py);
  const t = ((a % k) + k) % k - k / 2;
  const f = 1 - Math.abs(t) / (k / 2);
  return Math.hypot(px, py) < r + (R - r) * f;
}
const ell = (px, py, cx, cy, rx, ry) => Math.hypot((px - cx) / rx, (py - cy) / ry);

/** The painted face (sheet px). Returns a colour, or null for plain skin. */
function face(sx, sy) {
  // Blue eye: thin dark ring, blue with a deeper iris, dark pupil, sparkly highlights.
  {
    const e = ell(sx, sy, -70, -16, 38, 44);
    if (Math.abs((e - 1) * 40) < 2.4) return DARK;
    if (e < 1) {
      if (ell(sx, sy, -82, -34, 13, 10) < 1 || Math.hypot(sx + 54, sy - 2) < 6 || Math.hypot(sx + 88, sy + 6) < 3.4) return WHITE;
      if (ell(sx, sy, -67, -8, 13, 16) < 1) return BLUE3;
      if (ell(sx, sy, -68, -10, 25, 30) < 1) return BLUE2;
      return BLUE;
    }
  }
  // Green eye: half-closed under a smug lid (the lid is fur with a thin dark line along its edges).
  {
    const u = (sx - 74) / 38, ul = (sx - 74) / 42;
    const yU = -14 - 19.5 * (1 - u * u), yL = -14 + 19.5 * (1 - u * u);
    const lidTop = -20 - 13.5 * (1 - ul * ul), lidBot = -8 - 13.5 * (1 - ul * ul);
    if (Math.abs(ul) <= 1) {
      if (Math.abs(sy - lidBot) < 2.4) return DARK;
      if (sy > lidTop - 2.4 && sy < lidBot && Math.abs(u) <= 1.12) return Math.abs(sy - lidTop) < 2.4 ? DARK : null;
    }
    if (Math.abs(u) < 1 && sy > lidBot && sy < yL + 2.4) {
      if (sy > yL - 2.4) return DARK;
      if (Math.hypot(sx - 90, sy + 4) < 4) return WHITE;
      if (Math.hypot(sx - 78, sy + 4) < 8) return GREEN3;
      if (ell(sx, sy, 78, -6, 16, 13) < 1) return GREEN2;
      return GREEN;
    }
  }
  // Raised brow over the green eye.
  if (quadDist(sx, sy, [40, -66], [76, -92], [116, -70]) < 4.5) return DARK;
  // Heart nose (tip down at y 62, 22 px half-width).
  {
    const k = 22 / 0.6;
    if (heart2(sx / k, (62 - sy) / k) < 0) return PINK;
  }
  // Smirk.
  if (quadDist(sx, sy, [-36, 76], [0, 92], [40, 70]) < 3.6) return DARK;
  // Blush and the star sticker.
  if (Math.hypot(sx + 122, sy - 44) < 20) return BLUSH;
  if (star(sx - 126, sy - 51, 21, 9)) return STAR;
  // Stitched patch on top of his head, with dashed stitches along its top edge.
  if (inPoly(sx, sy, [[30, -150], [96, -128], [84, -88], [22, -108]])) {
    for (const [ax, ay] of [[36, -138], [54, -132], [72, -126], [88, -120]]) if (seg(sx, sy, ax, ay, ax - 8, ay - 6) < 1.8) return DARK;
    return PATCH;
  }
  return null;
}

/** Body coordinates: the sheet's front view, where the head centre sits at sheet y 392. */
const bodySheet = (x, y) => [x / F, 392 + (0.68 - y) / F];

export function colorAt(p, n, bump = 0, flat = false) {
  const [x, y, z] = p;
  const { name } = partAt(p);
  switch (name) {
    case 'head': case 'muzzle': {
      if (z > 0.02) {
        const c = face(x / F, (0.68 - y) / F);
        if (c) return c;
      }
      return name === 'muzzle' ? MUZ : FUR;
    }
    case 'tongue': return PINK;
    case 'ear': {
      const E = EARS[x > 0 ? 1 : 0];
      return z > E.c[2] && Math.hypot(x - E.c[0], y - E.c[1]) < EAR_R * 0.54 ? INNER : FUR;
    }
    case 'hoodie': {
      if (y < 0.132) return HOOD; // the rolled hem
      if (z > 0.04) {
        const [sx, sy] = bodySheet(x, y);
        if (sy > 648 && ell(sx, sy, 0, 648, 72, 40) < 1) return HOOD; // the pocket
        for (const s of [-30, 30]) {
          if (Math.hypot(sx - s, sy - 610) < 6.5) return WHITE; // drawstring tips
          if (Math.abs(sx - s) < 2.6 && sy > 566 && sy < 606) return STRING; // drawstrings
        }
      }
      return HOODIE;
    }
    case 'hood': return HOOD;
    case 'candy': return PINK;
    case 'cookie': {
      for (const [cx, cy] of [[0.045, 0.276], [0.062, 0.262], [0.046, 0.256]]) if (Math.hypot(x - cx, y - cy) < 0.0055) return CHIP;
      return COOKIE;
    }
    case 'sleeve': return HOODIE;
    case 'paw': case 'leg': return FUR;
    case 'shoe': return x < 0 ? PINK : GREEN_SHOE;
    case 'sole': return WHITE;
    case 'tail': {
      const [, d2] = tailFrame(p);
      if (d2 > 0.012) return FUR; // the stub joining it to his back
      const q = local(p, TAIL.c, TAIL.rz, TAIL.ry);
      if (Math.hypot((q[0] + 0.07) / 0.03, (q[1] - 0.075) / 0.018) < 1) return WHITE; // shine
      return d2 > -0.026 ? TAIL_RIM : FUR;
    }
  }
  return FUR;
}

/** (The plush fur pipeline isn't used for Moffy.) */
export function furAt() {
  return 0;
}
