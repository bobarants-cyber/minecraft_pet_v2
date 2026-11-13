// Wolf Chan's joints, skin weights and colours (model units: height 1, feet at y = 0, face towards +z).
// Keep PIVOTS in sync with src/wolfchan/WolfChan.js.
//
// His arms are separate rounded pieces pressed against the sides of his body (the crease is at |x| ≈ 0.127, the
// arms are between z ≈ −0.07 and 0.05, from the paw at y ≈ 0.095 up to the shoulder at y ≈ 0.26). Each vertex
// belongs to the arm or the body with a sharp cut along that crease, so moving an arm never drags the body along.
export const PIVOTS = { head: [0, 0.25, 0], arm_R: [0.13, 0.24, -0.01], arm_L: [-0.13, 0.24, -0.01], leg_R: [0.06, 0.08, 0], leg_L: [-0.06, 0.08, 0] };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function weightsAt([x, y, z]) {
  const ax = Math.abs(x);
  const arm = sstep(0.13, 0.142, ax) * (1 - sstep(0.07, 0.08, Math.abs(z + 0.01))) * sstep(0.098, 0.11, y) * (1 - sstep(0.262, 0.272, y));
  const head = sstep(0.245, 0.27, y) * (1 - arm);
  const leg = (1 - sstep(0.06, 0.09, y)) * (1 - arm);
  const right = sstep(-0.015, 0.015, x);
  const w = { head, arm_R: x > 0 ? arm : 0, arm_L: x < 0 ? arm : 0, leg_R: leg * right, leg_L: leg * (1 - right) };
  w.body = Math.max(0, 1 - head - arm - leg);
  return w;
}

// Colours are linear RGB (glTF vertex colours). Hard edges (no fades), so nothing bleeds.
const lin = (h) => [0, 2, 4].map((i) => (parseInt(h.slice(1 + i, 3 + i), 16) / 255) ** 2.2);
const GRAY = lin('#aab0bc');
const WHITE = lin('#f7f5f1');
const PINK = lin('#f4b6c3');
const NOSE = lin('#2e2a33');
const LINE = lin('#4a3e42');
const PAD = lin('#f0a7b6');
const inTri = ([px, py], [ax, ay], [bx, by], [cx, cy]) => {
  const s = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = s(px, py, ax, ay, bx, by), d2 = s(px, py, bx, by, cx, cy), d3 = s(px, py, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

export function colorAt([x, y, z], [nx, ny, nz]) {
  const ax = Math.abs(x);
  const front = nz > 0.25 && z > 0.12;
  // Nose: the oval bump in the middle of the face.
  if (front && (x / 0.034) ** 2 + ((y - 0.412) / 0.021) ** 2 < 1 && z > 0.2) return NOSE;
  // The smile: a thin dark curve.
  if (front && ax < 0.064 && Math.abs(y - (0.3575 + 1.6 * x * x)) < 0.0035) return LINE;
  // Inner ears: pink triangles on the front of each ear (only on the thin ears, not the forehead).
  if (nz > 0.15 && y > 0.72 && ax > 0.05 && z < 0.1 && inTri([ax, y], [0.068, 0.9], [0.17, 0.705], [0.058, 0.715])) return PINK;
  // White lower face: under the seam line around the head, on the front half.
  if (y > 0.255 && y < 0.383 && z > -0.02) return WHITE;
  // Paw pads under the feet.
  if (y < 0.01) return PAD;
  return GRAY;
}
