// The Snowy cabin photo's layout (measured on the 1280×720 photo): where snow settles, where the lights and the fire
// are, which part is forest that sways in the wind, and where the ground is snowy. Shared by the live wallpaper
// (home/wallpapers.js) and the snow (snow/snow.js), so they line up exactly.
export const PHOTO_W = 1280, PHOTO_H = 720;

/** The photo fills the screen like a wallpaper ("cover"): photo point → screen point. */
export function coverMap(W, H) {
  const s = Math.max(W / PHOTO_W, H / PHOTO_H);
  const ox = (W - PHOTO_W * s) / 2, oy = (H - PHOTO_H * s) / 2;
  return { s, ox, oy, pt: ([x, y]) => [ox + x * s, oy + y * s], inv: (X, Y) => [(X - ox) / s, (Y - oy) / s] };
}

// Top edges snow piles on (photo coords). `flat` ones can hold snowmen.
export const SURFACES = [
  { id: 'roof', pts: [[586, 292], [818, 137], [1102, 278]] },
  { id: 'railL', pts: [[590, 397], [726, 397]], flat: true },
  { id: 'railR', pts: [[930, 396], [1088, 396]], flat: true },
  { id: 'table', pts: [[212, 463], [466, 463]], flat: true },
  { id: 'benchBack', pts: [[256, 490], [472, 490]] },
  { id: 'benchFront', pts: [[182, 502], [426, 502]] },
  { id: 'porch', pts: [[620, 503], [700, 503]] },
  { id: 'step1', pts: [[705, 530], [995, 530]], flat: true },
  { id: 'step2', pts: [[700, 557], [968, 557]] },
  { id: 'step3', pts: [[692, 587], [975, 587]] },
];

// Warm lights (photo coords, radius in photo px, strength).
export const LIGHTS = [
  { x: 792, y: 328, r: 120, a: 0.55, flicker: 0.04 }, // porch lamp
  { x: 867, y: 340, r: 70, a: 0.35, flicker: 0.05 }, // lamp by the door
  { x: 726, y: 352, r: 60, a: 0.25, flicker: 0.02 }, // window
  { x: 872, y: 392, r: 80, a: 0.22, flicker: 0.02 }, // door window
  { x: 612, y: 318, r: 40, a: 0.25, flicker: 0.06 }, // string lights left
  { x: 1062, y: 300, r: 40, a: 0.25, flicker: 0.06 }, // string lights right
];

export const FIRE = { x: 166, y: 548, w: 56, h: 82 }; // the flames' base centre, width and height
export const FIRE_PIT = [100, 470, 245, 612]; // x0, y0, x1, y1 (no snow piles here)

// The cabin (doesn't sway). Everything above HORIZON outside it is forest that moves in the wind.
export const CABIN = [[552, 300], [818, 118], [1120, 276], [1110, 560], [985, 612], [690, 612], [552, 560]];
export const HORIZON = 455;

/** Is this photo point snowy ground (where you can roll a snowball)? */
export function onSnowyGround(x, y) {
  if (y < 478 || y > PHOTO_H) return false;
  if (x >= FIRE_PIT[0] && x <= FIRE_PIT[2] && y >= FIRE_PIT[1] && y <= FIRE_PIT[3]) return false;
  if (insidePoly(x, y, CABIN) && y < 540) return false;
  return true;
}

export function insidePoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The wind right now (0 calm … ~1.6 gust), from the clock, so the trees (wallpaper) and the falling snow (snow
 *  window) sway together. */
export function windAt(t) {
  const base = 0.55 + 0.25 * Math.sin(t * 0.21) + 0.15 * Math.sin(t * 0.53 + 1.3);
  const gustPhase = (t % 37) / 37; // a gust about every 37 s, building and fading over ~6 s
  const gust = gustPhase < 0.16 ? Math.sin((gustPhase / 0.16) * Math.PI) * 0.9 : 0;
  return base + gust;
}
