export const PIVOTS = { head: [0, 0.355, 0], arm_R: [0.175, 0.31, 0], arm_L: [-0.175, 0.31, 0], leg_R: [0.08, 0.11, 0], leg_L: [-0.08, 0.11, 0] };
export function partOf([x, y]) {
  if (y > 0.355) return 'head';
  if (y < 0.105) return x >= 0 ? 'leg_R' : 'leg_L';
  if (Math.abs(x) > 0.172 && y < 0.345) return x > 0 ? 'arm_R' : 'arm_L';
  return 'body';
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
  // Beak: the bump in the middle of the face.
  if (front && Math.abs(x) < 0.075 && y > 0.47 && y < 0.56 && z > 0.29) {
    const lip = Math.abs(y - 0.512) < 0.006 ? 1 : 0; // the line between the two halves of the beak
    return mix(BEAK, BEAK_DARK, lip * 0.8);
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
