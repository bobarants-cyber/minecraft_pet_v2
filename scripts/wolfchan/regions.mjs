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
// Looked up, not guessed: the Stray Kids fan wiki lists his body as grey and white with black eyes; fan patterns use a
// light bluish grey. WHERE each colour goes follows the lines carved into the sculpt (traced from shaded renders):
//   • a seam all round the head at y ≈ 0.381: white below it (the lower face and chin), grey above
//   • on the face the white comes up in two rounded patches around the eyes, with a grey stripe down the middle
//     from his hair curl to the top of the nose
//   • pointed inner-ear shapes on the front of each ear (pink), round cheek marks (pink), an oval nose and a crescent
//     smile (dark), tall oval eyes (the blinking beads from BbokariEyes sit on them)
const lin = (h) => [0, 2, 4].map((i) => (parseInt(h.slice(1 + i, 3 + i), 16) / 255) ** 2.2);
const GRAY = lin('#aab0bc');
const WHITE = lin('#f7f5f1');
const PINK = lin('#f4b6c3');
const CHEEK = lin('#f6a9bb');
const NOSE = lin('#2e2a33');
const MOUTH = lin('#3a2c31');
const PAD = lin('#f0a7b6');

const inPoly = (px, py, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
// The white face seen from the front, for one side (|x|, y): below the seam, plus the patch round the eye.
const MASK = [[0, 0.2], [0, 0.44], [0.042, 0.44], [0.048, 0.488], [0.056, 0.52], [0.07, 0.539], [0.09, 0.547], [0.12, 0.54],
  [0.146, 0.521], [0.158, 0.482], [0.157, 0.44], [0.18, 0.41], [0.204, 0.386], [0.24, 0.381], [0.5, 0.381], [0.5, 0.2]];
const INNER_EAR = [[0.064, 0.765], [0.064, 0.89], [0.076, 0.899], [0.095, 0.866], [0.12, 0.815], [0.15, 0.756], [0.172, 0.7]];
const SEAM = 0.381;

export function colorAt([x, y, z], [nx, ny, nz]) {
  const ax = Math.abs(x);
  const face = z > 0.15 && nz > 0.3;
  if (face && (x / 0.04) ** 2 + ((y - 0.41) / 0.026) ** 2 < 1) return NOSE;
  if (face && ax < 0.068) {
    const t = (x / 0.068) ** 2;
    if (y < 0.3576 + 0.0064 * t && y > 0.338 + 0.026 * t) return MOUTH;
  }
  if (face && (ax - 0.132) ** 2 + (y - 0.361) ** 2 < 0.0155 ** 2) return CHEEK;
  if (y > 0.69 && z < 0.08 && nz > 0.1 && inPoly(ax, y, INNER_EAR)) return PINK;
  if (y < 0.01) return PAD;
  if (y > 0.254 && y < 0.6) {
    if (z > 0 ? inPoly(ax, y, MASK) : y < SEAM) return WHITE;
  }
  return GRAY;
}
