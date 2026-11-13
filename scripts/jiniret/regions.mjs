// Jiniret's joints, skin weights and colours (model units: height 1, feet at y = 0, face towards +z).
// Keep PIVOTS and the face spots in sync with src/jiniret/Jiniret.js.
//
// Colours (looked up, not guessed): a white ferret with pink inside his round ears and black eyes (Stray Kids fan
// wiki: body white, eyes black; fan character lists: "white body with rounded ears that have pink in the middle",
// "a small black dot" by the mouth, "the spot under his eye" that his design comes from); plush listings: pink nose
// and whiskers. The eyes themselves are the blinking beads from BbokariEyes, so the sculpted eye domes stay white.
//
// Shape: neck at y ≈ 0.37; arms hang from the shoulders at |x| ≈ 0.17–0.28 between y ≈ 0.17 and 0.36 (z −0.06…0.05);
// legs below the crotch at y ≈ 0.09.
export const PIVOTS = { head: [0, 0.37, 0], arm_R: [0.18, 0.34, -0.01], arm_L: [-0.18, 0.34, -0.01], leg_R: [0.07, 0.11, 0], leg_L: [-0.07, 0.11, 0] };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function weightsAt([x, y, z]) {
  const ax = Math.abs(x);
  // Hard cut along the crease between arm and body, so moving an arm never drags his side along.
  const arm = sstep(0.17, 0.178, ax) * (1 - sstep(0.075, 0.085, Math.abs(z + 0.01))) * sstep(0.13, 0.14, y) * (1 - sstep(0.355, 0.365, y));
  const head = sstep(0.36, 0.38, y) * (1 - arm);
  const leg = (1 - sstep(0.095, 0.125, y)) * (1 - arm);
  const right = sstep(-0.012, 0.012, x);
  const w = { head, arm_R: x > 0 ? arm : 0, arm_L: x < 0 ? arm : 0, leg_R: leg * right, leg_L: leg * (1 - right) };
  w.body = Math.max(0, 1 - head - arm - leg);
  return w;
}

// Colours are linear RGB (glTF vertex colours). Hard edges (no fades), so nothing bleeds.
const lin = (h) => [0, 2, 4].map((i) => (parseInt(h.slice(1 + i, 3 + i), 16) / 255) ** 2.2);
const WHITE = lin('#fbfaf7');
const PINK = lin('#f6b3c4'); // inner ears
const NOSE = lin('#f28daa');
const WHISKER = lin('#f4a9bd');
const BLACK = lin('#231c22'); // the beauty mark
const LINE = lin('#3e3036'); // the smile
const PAD = lin('#f3b2c2');

// The raised smile is a lopsided crescent (higher on his left): its centre line, fitted to the sculpt.
const smileY = (x) => 0.4754 + 0.1011 * x + 6.772 * x * x + 45.61 * x * x * x;

export function colorAt([x, y, z], [nx, ny, nz]) {
  const ax = Math.abs(x);
  const front = nz > 0.2 && z > 0.2;
  // Nose: the raised oval in the middle of the face.
  if (front && (x / 0.037) ** 2 + ((y - 0.54) / 0.033) ** 2 < 1 && z > 0.282) return NOSE;
  // The smile.
  if (front && x > -0.058 && x < 0.06) {
    const half = 0.0018 + 0.0032 * Math.max(0, 1 - (x / 0.06) ** 2);
    if (Math.abs(y - smileY(x)) < half) return LINE;
  }
  // Beauty mark: the little raised dot under his left eye (the viewer's right).
  if (front && (x - 0.17) ** 2 + (y - 0.525) ** 2 < 0.0095 ** 2) return BLACK;
  // Whiskers: the thin rods sticking out of his cheeks.
  if (ax > 0.321 && y > 0.405 && y < 0.532) return WHISKER;
  // …and where they come out of the cheek (only the rod itself, not the cheek around it: the rod faces up, down or forward).
  const onRod = Math.abs(y - 0.511) < 0.017 || Math.abs(y - (0.455 - (ax - 0.27) * 0.3)) < 0.016;
  if (ax > 0.272 && z > 0.095 && Math.abs(nx) < 0.55 && onRod) return WHISKER;
  // Inner ears: the ring on the front of each round ear (the thin ears sit behind the head, z < 0.06).
  if (nz > 0.2 && z < 0.06 && y > 0.76 && (ax - 0.196) ** 2 + (y - 0.857) ** 2 < 0.085 ** 2) return PINK;
  // Paw pads under the feet.
  if (y < 0.008) return PAD;
  return WHITE;
}
