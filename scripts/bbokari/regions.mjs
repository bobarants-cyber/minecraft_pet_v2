export const PIVOTS = { head: [0, 0.355, 0], arm_R: [0.175, 0.31, 0], arm_L: [-0.175, 0.31, 0], leg_R: [0.08, 0.11, 0], leg_L: [-0.08, 0.11, 0] };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Skin weights: how much each bone moves a point. Soft edges (a few % of the height) make the joints bend smoothly. */
export function weightsAt([x, y, z]) {
  const head = sstep(0.33, 0.38, y);
  const below = 1 - head;
  // Arms hang off the sides of the body between the hips and the neck.
  // Below the shoulder the arm hangs just clear of the body, so a tight cut there keeps the body's side from being
  // dragged along like a web; at the shoulder, where they join, blend wide so the joint bends softly.
  const ax = Math.abs(x);
  const shoulder = sstep(0.26, 0.31, y);
  const side = sstep(0.178, 0.19, ax) * (1 - shoulder) + sstep(0.15, 0.2, ax) * shoulder;
  const arm = side * (1 - sstep(0.33, 0.365, y)) * sstep(0.12, 0.15, y) * below;
  // Legs are everything under the belly; the two sides blend across the middle.
  const leg = (1 - sstep(0.085, 0.13, y)) * (1 - arm);
  const right = sstep(-0.03, 0.03, x);
  const w = {
    head,
    arm_R: x > 0 ? arm : 0,
    arm_L: x < 0 ? arm : 0,
    leg_R: leg * right,
    leg_L: leg * (1 - right),
  };
  w.body = Math.max(0, 1 - head - arm - leg);
  return w;
}

// Colours are linear RGB (glTF vertex colours).
const lin = (h) => [0, 2, 4].map((i) => ((parseInt(h.slice(1 + i, 3 + i), 16) / 255) ** 2.2));
const YELLOW = lin('#ffd84a');
const BEAK = lin('#ff9a2e');
const BEAK_DARK = lin('#e0701c');
const EYE_RIM = lin('#f2c43c');
const FRECKLE = lin('#b8742e');
const FEET = lin('#ffb347');
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function colorAt([x, y, z], [nx, ny, nz], bump) {
  const front = z > 0.15;
  // Beak: anything in the middle of the face that sticks out past where the cheeks would be at that height.
  // (The lower half curves back towards the face, so a fixed depth cut-off missed it.)
  const faceZ = 0.25 + (y - 0.46) * 0.35;
  if (front && Math.abs(x) < 0.085 && y > 0.462 && y < 0.575 && z > faceZ + 0.011) {
    return bump < -0.0006 ? BEAK_DARK : BEAK; // the crease between the upper and lower beak is concave
  }
  // Eye sockets: real eyes are separate meshes drawn on top (they blink), so these stay skin-coloured, a touch deeper.
  for (const sx of [-1, 1]) {
    const d = Math.hypot(x - sx * 0.115, y - 0.575);
    if (front && d < 0.05) return mix(YELLOW, EYE_RIM, smooth(0.03, 0.05, d) * 0.7);
  }
  // Freckles: little sculpted dots on the cheeks.
  if (front && Math.abs(Math.abs(x) - 0.2) < 0.045 && Math.abs(y - 0.545) < 0.035 && bump > 0.0009) return FRECKLE;
  if (y < 0.06) return mix(YELLOW, FEET, smooth(0.06, 0.0, y));
  return YELLOW;
}
