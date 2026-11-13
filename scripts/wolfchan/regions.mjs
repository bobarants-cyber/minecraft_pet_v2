// Wolf Chan's joints, skin weights and colours (model units: height 1, feet at y = 0, face towards +z).
// Keep PIVOTS in sync with src/wolfchan/WolfRig.js.
export const PIVOTS = { head: [0, 0.25, 0], arm_R: [0.12, 0.215, 0], arm_L: [-0.12, 0.215, 0], leg_R: [0.06, 0.085, 0], leg_L: [-0.06, 0.085, 0] };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Skin weights: soft edges so the joints bend smoothly. */
export function weightsAt([x, y, z]) {
  // The big head (with the ears) sits on a short neck.
  const head = sstep(0.235, 0.265, y);
  const below = 1 - head;
  const ax = Math.abs(x);
  // Arms: off the sides of the body, from the shoulders down to the paws.
  const arm = sstep(0.115, 0.135, ax) * sstep(0.08, 0.11, y) * below;
  // Legs: everything under the belly; the two sides blend across the middle.
  const leg = (1 - sstep(0.065, 0.1, y)) * (1 - arm);
  const right = sstep(-0.02, 0.02, x);
  const w = { head, arm_R: x > 0 ? arm : 0, arm_L: x < 0 ? arm : 0, leg_R: leg * right, leg_L: leg * (1 - right) };
  w.body = Math.max(0, 1 - head - arm - leg);
  return w;
}

// Colours are linear RGB (glTF vertex colours).
const lin = (h) => [0, 2, 4].map((i) => (parseInt(h.slice(1 + i, 3 + i), 16) / 255) ** 2.2);
const GRAY = lin('#a9aeba');
const WHITE = lin('#f6f4f0');
const PINK = lin('#f5b9c6');
const NOSE = lin('#2e2a33');
const LINE = lin('#5b4e52');
const BLUSH = lin('#ff9fb3');
const PAD = lin('#f0a9b8');
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const inTri = ([px, py], [ax, ay], [bx, by], [cx, cy]) => {
  const s = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = s(px, py, ax, ay, bx, by), d2 = s(px, py, bx, by, cx, cy), d3 = s(px, py, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

export function colorAt([x, y, z], [nx, ny, nz], bump) {
  const front = nz > 0.25 && z > 0.12;
  const ax = Math.abs(x);
  // Nose: the oval bump in the middle of the face.
  if (front && ((x / 0.034) ** 2 + ((y - 0.412) / 0.021) ** 2) < 1 && z > 0.2) return NOSE;
  // The smile: a thin dark curve.
  if (front && ax < 0.066 && Math.abs(y - (0.3575 + 1.6 * x * x)) < 0.0045) return LINE;
  // Cheeks: little pink ovals under the eyes.
  if (front && (((ax - 0.133) / 0.017) ** 2 + ((y - 0.361) / 0.012) ** 2) < 1) return BLUSH;
  // Inner ears: pink triangles on the front of each ear.
  // (Only on the ears themselves, which are thin and sit further back than the forehead.)
  if (nz > 0.15 && y > 0.72 && ax > 0.05 && z < 0.1 && inTri([ax, y], [0.068, 0.9], [0.17, 0.705], [0.058, 0.715])) return PINK;
  // White face: the lower half of the head (under the seam line) and soft patches around the eyes.
  const eyePatch = Math.hypot(ax - 0.092, (y - 0.465) * 0.95);
  if (y > 0.25 && y < 0.385 && z > -0.05) return mix(GRAY, WHITE, smooth(0.25, 0.27, y) * smooth(-0.05, 0.05, z));
  if (front && eyePatch < 0.07) return mix(WHITE, GRAY, smooth(0.062, 0.07, eyePatch));
  // Paw pads under the feet.
  if (y < 0.012) return PAD;
  return GRAY;
}
