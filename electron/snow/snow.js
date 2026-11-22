// ❄️ Bbokari's snow (all drawn here, no images): flakes, drifts on windows and along the bottom, snowmen, snowballs,
// wind and a sleigh. Window rectangles come from the helper, front to back.
import { winterSurfaces } from '../home/winterScene.js';
import { SURFACES as CABIN_SURFACES, LIGHTS as CABIN_LIGHTS, FIRE as CABIN_FIRE, HORIZON as CABIN_HORIZON, PHOTO_H, coverMap, onSnowyGround, windAt } from '../home/cabinScene.js';
const host = window.snowHost;
const cv = document.getElementById('c');
let g = cv.getContext('2d'); // (lit() swaps it briefly to draw things in daylight and then light them)

const COL = 4; // drift resolution (px per column)
const MAXH = 30; // tallest drift
const G = 1400; // gravity for snowballs and clumps
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let W = 0, H = 0, DPR = 1;
let cfg = { mode: 'on', amount: 'medium', fx: { piles: true, snowmen: true, fights: true, sleigh: true, wind: true }, saver: false };
let dockTop = null;
let wins = []; // [{ id, x, y, w, h }] front to back
const piles = new Map(); // window id → drift
let ground = new Float32Array(1);
let flakes = [], parts = [], balls = [], snowmen = [];
let cursor = { x: -999, y: -999 }, cursorHist = [];
let lastMove = performance.now();
let held = null; // the snowball you're holding
let grabbing = false;
let wind = null, blizzardUntil = 0, sleigh = null, calmUntil = 0;
let frontPid = 0, lastSleigh = 0, nextSnowman = performance.now() + 9000;
let flakeSprite = null;

function fit() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const n = Math.ceil(W / COL) + 1;
  if (ground.length !== n) { const old = ground; ground = new Float32Array(n); ground.set(old.subarray(0, Math.min(n, old.length))); }
}
addEventListener('resize', fit);
fit();

// a soft round flake, drawn once
flakeSprite = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  return c;
})();

// ---------------- geometry helpers ----------------
const groundBase = () => (dockTop && dockTop < H - 4 ? H : H); // the very bottom of the screen
const groundTop = (x) => groundBase() - ground[clamp(Math.round(x / COL), 0, ground.length - 1)];
function covered(x, y, idx) { // is (x, y) behind a window in front of window idx?
  for (let j = 0; j < idx && j < wins.length; j++) { const w = wins[j]; if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true; }
  return false;
}
function insideAnyWindow(x, y) { for (const w of wins) if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true; return false; }
const pileTop = (p, x) => (p.base ? p.base(x) : p.y) - (p.h[clamp(Math.round((x - p.x) / COL), 0, p.h.length - 1)] || 0);
const winIndex = (id) => wins.findIndex((w) => w.id === id);

function addTo(arr, i, amt, cap) {
  if (i < 0 || i >= arr.length) return;
  arr[i] = Math.min(cap(i), arr[i] + amt);
}
function settle(arr, cap) { // snow slides down to its neighbours, so drifts stay soft
  for (let k = 0; k < 2; k++) for (let i = 0; i < arr.length - 1; i++) {
    const d = arr[i] - arr[i + 1];
    if (Math.abs(d) > 1.6) { const m = d * 0.25; arr[i] -= m; arr[i + 1] += m; }
  }
  for (let i = 0; i < arr.length; i++) arr[i] = Math.min(arr[i], cap(i));
}
const CORNER = 14; // macOS window corner radius (px)
// drifts are lumpy (each window gets its own bumps) and taper off over the rounded corners
const pileCap = (p) => (i) => {
  if (p.capAt) return MAXH * p.capK * (p.lump?.[i] ?? 1) * p.capAt(i);
  const fromEdge = Math.min(i, p.h.length - 1 - i) * COL;
  const corner = clamp((fromEdge - CORNER * 0.4) / (CORNER * 1.6), 0, 1);
  return MAXH * corner * p.capK * (p.lump?.[i] ?? 1);
};
function makeLumps(n) { // smooth random bumps
  const out = new Float32Array(n), ph = [rand(0, 6), rand(0, 6), rand(0, 6)];
  for (let i = 0; i < n; i++) out[i] = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(i * 0.09 + ph[0])) * (0.6 + 0.4 * Math.sin(i * 0.23 + ph[1])) + 0.12 * Math.sin(i * 0.5 + ph[2]);
  return out;
}
const groundCap = () => 22;

function burst(x, y, n, vx = 0, vy = -120, spread = 160) {
  for (let i = 0; i < n && parts.length < 1500; i++) parts.push({ x: x + rand(-4, 4), y: y + rand(-3, 3), vx: vx + rand(-spread, spread), vy: vy + rand(-spread, spread * 0.4), r: rand(1, 2.6), life: rand(0.8, 1.6) });
}

// ---------------- the desktop: things snow can land on behind your windows ----------------
let desk = { scene: null, widgets: [], radius: 28 };
const DAY = { hi: '#ffffff', mid: '#f3f7fd', lo: '#dbe5f3', shade: '#a9bbd8', deep: '#7d8fb5', shadow: 'rgba(40,60,100,0.22)' };
// The cabin photo's own snow, colour-picked (its snow pixels sorted by brightness): highlight, light, normal, shadow,
// deep. Every bit of snow uses these, and on the photo each snowball, snowman and drift is lit by the photo's light
// right where it is (warm by the fire and the porch, darker in the shade). Re-measured from the photo when it loads.
const NIGHT = { hi: '#4b5c74', mid: '#3b526e', lo: '#1b4466', shade: '#123553', deep: '#0e2940', shadow: 'rgba(3,8,22,0.55)' };
let photoPx = null; // the photo's pixels (1280×720), for "is there snow here?"
let lightPx = null; // a soft, small version of the photo: the light at each spot
const LW = 96, LH = 54;
const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => (c[0] + c[1] + c[2]) / 3;
function loadPhoto(src) {
  if (!src) return;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 1280, 720);
    photoPx = x.getImageData(0, 0, 1280, 720).data;
    surfacePals.clear(); surfaceTex.clear();
    const l = document.createElement('canvas'); l.width = LW; l.height = LH;
    const lx = l.getContext('2d'); lx.filter = 'blur(2px)'; lx.drawImage(img, 0, 0, LW, LH);
    lightPx = lx.getImageData(0, 0, LW, LH).data;
    // colour-pick the snow: bluish pixels on the ground, sorted by brightness
    const snow = [];
    for (let y = 470; y < 720; y += 2) for (let xx = 0; xx < 1280; xx += 2) {
      const i = (y * 1280 + xx) * 4, r = photoPx[i], gg = photoPx[i + 1], b = photoPx[i + 2];
      if (b > r + 15 && (r + gg + b) / 3 > 35) snow.push([r, gg, b, (r + gg + b) / 3]);
    }
    if (snow.length > 500) {
      snow.sort((a, b) => a[3] - b[3]);
      const band = (lo, hi) => { const part = snow.slice(Math.floor(snow.length * lo), Math.max(Math.floor(snow.length * lo) + 1, Math.floor(snow.length * hi))); return hex([0, 1, 2].map((k) => part.reduce((s, p) => s + p[k], 0) / part.length)); };
      Object.assign(NIGHT, { hi: band(0.97, 0.995), mid: band(0.85, 0.93), lo: band(0.45, 0.6), shade: band(0.08, 0.2), deep: band(0.01, 0.04) });
    }
  };
  img.src = src.startsWith('/') ? 'file://' + encodeURI(src) : src;
}
/** Each photo surface's own snow colours (the roof's, a rail's…): picked from the strip of snow just under its edge. */
const surfacePals = new Map();
function surfacePal(sf) {
  if (!photoPx) return null;
  if (surfacePals.has(sf.id)) return surfacePals.get(sf.id);
  const px = [];
  for (let k = 0; k < sf.pts.length - 1; k++) {
    const [ax, ay] = sf.pts[k], [bx, by] = sf.pts[k + 1];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 3);
    for (let i = 0; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n, y0 = ay + ((by - ay) * i) / n;
      for (let off = 2; off <= 16; off += 2) {
        const xi = Math.round(x), yi = Math.round(y0 + off);
        if (xi < 0 || yi < 0 || xi >= 1280 || yi >= 720) continue;
        const j = (yi * 1280 + xi) * 4, r = photoPx[j], g2 = photoPx[j + 1], b = photoPx[j + 2], L = (r + g2 + b) / 3;
        if ((b > r + 8 && L > 30) || L > 110) px.push([r, g2, b, L]);
      }
    }
  }
  let pal = null;
  if (px.length > 40) {
    px.sort((a, b) => a[3] - b[3]);
    const at = (lo, hi) => { const part = px.slice(Math.floor(px.length * lo), Math.max(Math.floor(px.length * lo) + 1, Math.floor(px.length * hi))); return hex([0, 1, 2].map((c) => part.reduce((sum, p) => sum + p[c], 0) / part.length)); };
    pal = { hi: at(0.85, 0.97), mid: at(0.5, 0.65), lo: at(0.2, 0.35), shade: at(0.06, 0.14), deep: at(0.01, 0.05), shadow: NIGHT.shadow };
  }
  surfacePals.set(sf.id, pal);
  return pal;
}
/**
 * A picture of the real snow under a surface, colour-picked pixel by pixel: for every screen column along the surface
 * we walk straight down from its edge through the photo and copy each pixel (if a column runs out of snow, e.g. into
 * the roof's green trim, it keeps its last snow colour). Row 0 is the snow right at the edge. New drifts are painted
 * from this, depth for depth, so they continue the real snow's own gradients.
 */
const surfaceTex = new Map();
const isSnowPx = (r, g2, b) => { const L = (r + g2 + b) / 3; return (b > r + 8 && L > 30) || L > 110; };
function surfaceTexture(p) {
  if (!photoPx || !p.photoSurface) return null;
  const key = p.id + ':' + Math.round(p.w) + ':' + Math.round(cover.s * 1000);
  if (surfaceTex.has(key)) return surfaceTex.get(key);
  const w = Math.max(2, Math.ceil(p.w)), h = Math.ceil(MAXH + 4);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const cx = c.getContext('2d'), img = cx.createImageData(w, h);
  for (let x = 0; x < w; x++) {
    const sx = p.x + x;
    const [px, pyBase] = cover.inv(sx, p.base(sx));
    // find where the real snow starts at this column (just at or under the edge line)
    let start = pyBase;
    for (let k = -3; k <= 6; k++) { const yy = Math.round(pyBase + k), xx = Math.round(px), j = (yy * 1280 + xx) * 4; if (yy >= 0 && yy < 720 && xx >= 0 && xx < 1280 && isSnowPx(photoPx[j], photoPx[j + 1], photoPx[j + 2])) { start = yy; break; } }
    let lastC = null;
    for (let y = 0; y < h; y++) {
      const yy = Math.round(start + y / cover.s);
      let col = null;
      if (yy >= 0 && yy < 720) {
        // a tiny 3-px horizontal average so single noisy pixels don't streak
        const sum = [0, 0, 0]; let nOk = 0;
        for (const dx of [-1, 0, 1]) {
          const xx = Math.round(px + dx); if (xx < 0 || xx >= 1280) continue;
          const j = (yy * 1280 + xx) * 4;
          if (isSnowPx(photoPx[j], photoPx[j + 1], photoPx[j + 2])) { sum[0] += photoPx[j]; sum[1] += photoPx[j + 1]; sum[2] += photoPx[j + 2]; nOk++; }
        }
        if (nOk) col = sum.map((v) => v / nOk);
      }
      if (col) lastC = col; else col = lastC;
      if (!col) continue;
      const o = (y * w + x) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    // columns that never met snow borrow from their neighbour (filled below)
  }
  // fill empty columns from the nearest filled one
  for (let x = 1; x < w; x++) for (let y = 0; y < h; y++) { const o = (y * w + x) * 4; if (!img.data[o + 3]) { const q = (y * w + x - 1) * 4; img.data.set(img.data.subarray(q, q + 4), o); } }
  for (let x = w - 2; x >= 0; x--) for (let y = 0; y < h; y++) { const o = (y * w + x) * 4; if (!img.data[o + 3]) { const q = (y * w + x + 1) * 4; img.data.set(img.data.subarray(q, q + 4), o); } }
  cx.putImageData(img, 0, 0);
  surfaceTex.set(key, c);
  return c;
}
/** Is there snow in the photo at this screen point? (bluish snow, or snow lit warm by the lamps) */
function photoSnowAt(x, y) {
  if (!photoPx || desk.scene !== 'cabin') return false;
  const [px, py] = cover.inv(x, y);
  if (px < 0 || py < 0 || px >= 1280 || py >= 720) return false;
  let hits = 0;
  for (const [dx, dy] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4], [5, 5], [-5, 5], [5, -5], [-5, -5]]) {
    const i = ((Math.round(py) + dy) * 1280 + Math.round(px) + dx) * 4;
    const r = photoPx[i], gg = photoPx[i + 1], b = photoPx[i + 2], L = (r + gg + b) / 3;
    if ((b > r + 12 && L > 40) || (L > 125 && b > r - 40)) hits++;
  }
  return hits >= 2;
}
/** The average colour of the photo's own snow right around this photo point (null if there's no snow there). */
function ownSnow(px, py) {
  if (!photoPx) return null;
  let n = 0; const sum = [0, 0, 0];
  for (let dy = -6; dy <= 8; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
    const x = Math.round(px + dx), y = Math.round(py + dy);
    if (x < 0 || y < 0 || x >= 1280 || y >= 720) continue;
    const i = (y * 1280 + x) * 4, r = photoPx[i], gg = photoPx[i + 1], b = photoPx[i + 2];
    if ((b > r + 12 && (r + gg + b) / 3 > 38) || (r + gg + b) / 3 > 120) { sum[0] += r; sum[1] += gg; sum[2] += b; n++; }
  }
  return n >= 6 ? sum.map((v) => v / n) : null;
}
/** Snow colours lit by the photo's light at this screen point (the ground's light under it). */
function palAt(x, y) {
  if (desk.scene !== 'cabin' || !lightPx) return desk.scene === 'cabin' ? NIGHT : DAY;
  const [px, py] = cover.inv(x, y);
  // the photo's own snow right here (roof, rail, ground…); otherwise the light on the snowy ground below this spot
  let base = ownSnow(px, py);
  if (!base) {
    const sx = Math.max(0, Math.min(LW - 1, Math.round((px / 1280) * LW)));
    const sy = Math.max(0, Math.min(LH - 1, Math.round((Math.max(py, CABIN_HORIZON + 25) / 720) * LH)));
    const i = (sy * LW + sx) * 4;
    base = [lightPx[i], lightPx[i + 1], lightPx[i + 2]];
    const lo = rgbOf(NIGHT.lo), shade = rgbOf(NIGHT.shade);
    if (lum(base) < lum(shade)) base = shade; // keep it snow, never darker than the photo's shadow snow
    base = base.map((v, k) => v * 0.7 + lo[k] * 0.3);
  }
  const k = (f, add = 0) => hex(base.map((v) => v * f + add));
  // the same snow, shaded: its own colour in the middle, a bit lighter where light hits, darker in the shade
  return { hi: k(1.3, 8), mid: k(1.02), lo: k(0.82), shade: k(0.62), deep: k(0.42), shadow: NIGHT.shadow };
}
const pal = () => (desk.scene === 'cabin' ? NIGHT : DAY);
let cover = coverMap(1, 1);
const FIELD = { id: 'field', field: true }; // the photo's snowy ground: snowballs rest wherever they're put
let trails = []; // packed-snow tracks left by rolling snowballs on the ground
const grain = (() => { // fine grain (drifts)
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  for (let i = 0; i < 520; i++) { x.fillStyle = Math.random() < 0.5 ? `rgba(70,90,130,${Math.random() * 0.35})` : `rgba(255,255,255,${Math.random() * 0.5})`; x.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5); }
  return x.createPattern(c, 'repeat');
})();
/**
 * Packed snow, as a grey texture (128 = no change) used with 'soft-light': lumps at several sizes (value noise),
 * little pits where clumps were pressed together, and a few sparkling ice crystals. Wrapped on every snowball.
 */
let SNOW_MUL = null;
const SNOW_TEX = (() => {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'), img = x.createImageData(N, N);
  const octave = (cell) => { // smooth value noise
    const n = Math.ceil(N / cell) + 2, grid = Array.from({ length: n * n }, () => Math.random());
    return (px, py) => {
      const gx = px / cell, gy = py / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), at = (a, b) => grid[(b % n) * n + (a % n)];
      return at(x0, y0) * (1 - sx) * (1 - sy) + at(x0 + 1, y0) * sx * (1 - sy) + at(x0, y0 + 1) * (1 - sx) * sy + at(x0 + 1, y0 + 1) * sx * sy;
    };
  };
  const o = [octave(48), octave(20), octave(9), octave(4), octave(2)], w = [0.34, 0.27, 0.2, 0.12, 0.07];
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    let v = 0; for (let k = 0; k < 5; k++) v += o[k](px, py) * w[k];
    let lumpy = (v - 0.5) * 2.3; // -1..1
    if (lumpy < -0.42) lumpy -= 0.35; // pits between clumps
    const g = Math.max(0, Math.min(255, 128 + lumpy * 95));
    const i = (py * N + px) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = g; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  // a 'multiply' version (white = no change, darker = shadow): reads on white snow and on blue night snow alike
  const m = document.createElement('canvas'); m.width = m.height = N;
  const mx = m.getContext('2d'), mimg = mx.createImageData(N, N);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = img.data[i] / 255; // 0 pit … 0.5 flat … 1 lump top
    const g = 255 * Math.min(1, 0.6 + 0.48 * v); // pits ~0.6, flats ~0.84, lump tops 1.0
    mimg.data[i] = mimg.data[i + 1] = mimg.data[i + 2] = g; mimg.data[i + 3] = 255;
  }
  mx.putImageData(mimg, 0, 0);
  SNOW_MUL = m;
  for (let i = 0; i < 260; i++) { // ice crystals catching the light
    const px = Math.random() * N, py = Math.random() * N, r = Math.random() < 0.85 ? 0.6 : 1.2;
    x.fillStyle = `rgba(255,255,255,${0.5 + Math.random() * 0.5})`; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }
  return c;
})();
let appleWidgets = [];
const isDesk = (p) => p && String(p.id).startsWith('desk:');
const deskPiles = () => [...piles.values()].filter(isDesk);

/** A drift along a polyline (top edge of a roof, a tree tier, the ground). Steep parts hold less snow. */
function lineSurface(id, pts) {
  const x0 = pts[0][0], x1 = pts.at(-1)[0];
  const base = (x) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      if (x >= ax && x <= bx) return ay + ((x - ax) / Math.max(1e-6, bx - ax)) * (by - ay);
    }
    return x < x0 ? pts[0][1] : pts.at(-1)[1];
  };
  const slope = (x) => { const e = 2; return Math.abs(base(x + e) - base(x - e)) / (2 * e); };
  return { id, x: x0, w: x1 - x0, base, capAt: (i) => clamp(1 - slope(x0 + i * COL) * 0.42, 0.3, 1) * clamp(Math.min(i, (x1 - x0) / COL - i) / 3, 0, 1) };
}
/** A drift on top of a rounded box (a widget). */
function boxSurface(id, x, y, w, r) {
  return {
    id, x, w, base: (xx) => { const e = Math.min(xx - x, x + w - xx); if (e >= r) return y; const t = r - Math.max(0, e); return y + r - Math.sqrt(Math.max(0, r * r - t * t)); },
    capAt: (i) => { const e = Math.min(i, w / COL - i) * COL; return clamp((e - r * 0.4) / (r * 1.6), 0, 1); }, corner: r, flat: true,
  };
}
function rebuildDesk() {
  const want = [];
  if (desk.scene === 'winter') for (const sf of winterSurfaces(W, H)) want.push({ ...lineSurface('desk:scene:' + sf.id, sf.pts), flat: !!sf.flat });
  cover = coverMap(W, H);
  if (desk.scene === 'cabin') for (const sf of CABIN_SURFACES) want.push({ ...lineSurface('desk:cabin:' + sf.id, sf.pts.map(cover.pt)), flat: !!sf.flat, photoSurface: sf });
  for (const w of desk.widgets) want.push(boxSurface(`desk:widget:${w.id}`, w.x, w.y, w.w, desk.radius));
  appleWidgets.forEach(([x, y, w], i) => want.push(boxSurface(`desk:apple:${i}:${x},${y}`, x, y, w, 22)));
  const keep = new Set(want.map((s) => s.id));
  for (const [id, p] of piles) if (isDesk(p) && !keep.has(id)) { // gone (widget moved or theme changed): its snow falls
    for (let i = 0; i < p.h.length; i += 3) if (p.h[i] > 2) burst(p.x + i * COL, pileTop(p, p.x + i * COL), 1, 0, 0, 30);
    for (const s of snowmen) if (s.on === id) s.knock(0, -60);
    piles.delete(id);
  }
  for (const sf of want) {
    const n = Math.max(2, Math.ceil(sf.w / COL));
    const old = piles.get(sf.id);
    if (old && old.h.length === n) { Object.assign(old, sf, { h: old.h, lump: old.lump }); continue; }
    piles.set(sf.id, { ...sf, h: new Float32Array(n), lump: makeLumps(n), capK: rand(0.8, 1.05), shake: 0, desk: true });
  }
}
host.onDesk?.((d) => { const newPhoto = d.photo && d.photo !== desk.photo; desk = d; rebuildDesk(); if (newPhoto) loadPhoto(d.photo); });

// ---------------- windows from the helper ----------------
let optionDown = false; // ⌥ held: snow in the wallpaper picture can be grabbed (otherwise clicks go to your desktop)
host.onWins(({ w, f, d, g: apple, m: opt }) => {
  if (optionDown !== !!opt) { optionDown = !!opt; updateGrab(); }
  if (JSON.stringify(apple ?? []) !== JSON.stringify(appleWidgets)) { appleWidgets = apple ?? []; rebuildDesk(); }
  const now = performance.now();
  const next = w.map(([id, x, y, ww, hh]) => ({ id, x, y, w: ww, h: hh }));
  // the Dock, while it's showing, is the frontmost thing snow can land on (when it hides, its snow falls off)
  if (d) {
    let [x, y, ww, hh] = d;
    if (dockTop && dockTop > y && dockTop < y + hh) { hh -= dockTop - y; y = dockTop; } // its visible top, not the magnify space
    next.unshift({ id: 'dock', x, y, w: ww, h: hh, dock: true });
  }
  const seen = new Set();
  for (const win of next) {
    seen.add(win.id);
    let p = piles.get(win.id);
    const n = Math.max(2, Math.ceil(win.w / COL));
    if (!p) { p = { id: win.id, x: win.x, y: win.y, w: win.w, h: new Float32Array(n), lump: makeLumps(n), t: now, shake: 0, capK: rand(0.75, 1.05), dock: !!win.dock }; piles.set(win.id, p); continue; }
    const dt = Math.max(0.008, (now - p.t) / 1000);
    const vx = (win.x - p.x) / dt, vy = (win.y - p.y) / dt;
    const speed = Math.hypot(vx, vy);
    if (speed > 1600) { // flung: the snow bursts loose
      for (let i = 0; i < p.h.length; i += 2) if (p.h[i] > 1) burst(p.x + i * COL, p.y - p.h[i] / 2, Math.ceil(p.h[i] / 5), vx * 0.35, vy * 0.35 - 150, 120);
      p.h.fill(0);
      for (const s of snowmen) if (s.on === p.id) s.knock(vx * 0.35, vy * 0.35 - 300);
    }
    if (n !== p.h.length) { const old = p.h; p.h = new Float32Array(n); for (let i = 0; i < n; i++) p.h[i] = old[Math.floor((i * old.length) / n)] || 0; p.lump = makeLumps(n); }
    p.x = win.x; p.y = win.y; p.w = win.w; p.t = now;
  }
  for (const [id, p] of piles) if (!isDesk(p) && !seen.has(id)) { // closed (or minimised): everything on top falls
    for (let i = 0; i < p.h.length; i += 2) if (p.h[i] > 1) burst(p.x + i * COL, p.y - p.h[i] / 2, Math.ceil(p.h[i] / 6), 0, 0, 40);
    for (const s of snowmen) if (s.on === id) s.knock(rand(-60, 60), -100);
    piles.delete(id);
  }
  wins = next;
  // switched apps: the sleigh runs by
  if (f && f !== frontPid) {
    if (frontPid && cfg.fx.sleigh && now - lastSleigh > 25000) startSleigh();
    frontPid = f;
  }
});

host.onConfig((c) => { cfg = c; });
host.onScreen?.((s) => { dockTop = s.dockTop; });
host.onDo((what) => {
  if (what === 'blizzard') { blizzardUntil = performance.now() + 15000; }
  if (what === 'sleigh') startSleigh();
  if (what === 'wind') startWind();
  if (what === 'plow') startPlow();
});

// ---------------- the pointer ----------------
host.onCursor((p) => {
  const now = performance.now();
  if (p.x !== cursor.x || p.y !== cursor.y) lastMove = now;
  cursor = p;
  cursorHist.push({ x: p.x, y: p.y, t: now });
  while (cursorHist.length && now - cursorHist[0].t > 800) cursorHist.shift();
  detectShake();
  updateGrab();
});

function velocity(ms = 90) {
  const now = performance.now();
  const recent = cursorHist.filter((s) => now - s.t <= ms);
  if (recent.length < 2) return { vx: 0, vy: 0 };
  const a = recent[0], b = recent.at(-1), dt = Math.max(0.016, (b.t - a.t) / 1000);
  return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
}

function detectShake() {
  if (!cfg.fx.wind || wind || held) return;
  let flips = 0, lastSign = 0, travel = 0;
  for (let i = 1; i < cursorHist.length; i++) {
    const dx = cursorHist[i].x - cursorHist[i - 1].x;
    travel += Math.abs(dx);
    const s = Math.sign(dx);
    if (s && lastSign && s !== lastSign && Math.abs(dx) > 3) flips++;
    if (s) lastSign = s;
  }
  if (flips >= 5 && travel > 900) startWind();
}

/** What's under the pointer that can be grabbed: a loose snowball, or a drift's surface. */
function grabbable(x, y) {
  // Nothing grabs unless ⌥ Option is held (or you're already holding a snowball): clicks always reach your apps/icons
  if (!optionDown && !held) return null;
  for (const b of balls) if (b.rest && Math.hypot(b.x - x, b.y - y) < b.r + 6) return { ball: b };
  if (!cfg.fx.piles || cfg.mode !== 'on') return null;
  for (let i = 0; i < wins.length; i++) {
    const p = piles.get(wins[i].id);
    if (!p || x < p.x || x > p.x + p.w) continue;
    const top = pileTop(p, x);
    if (p.y - top > 3 && y >= top - 10 && y <= p.y + 4 && !covered(x, y, i)) return { pile: p };
    if (x >= wins[i].x && x <= wins[i].x + wins[i].w && y >= wins[i].y && y <= wins[i].y + wins[i].h) break; // on the window itself (but the bottom snow is in front)
  }
  // snow on the desktop (the scene, widgets) where no window covers it; the picture's snow only while ⌥ is held
  if (cfg.mode === 'on' && !insideAnyWindow(x, y)) {
    for (const p of piles.values()) {
      if (!p.desk || x < p.x || x > p.x + p.w) continue;
      if ((p.photoSurface || String(p.id).startsWith('desk:scene:')) && !optionDown && !held) continue;
      const top = pileTop(p, x), base = p.base(x);
      if (base - top > 3 && y >= top - 10 && y <= base + 4) return { pile: p };
    }
  }
  // the cabin photo's snowy ground: snow everywhere
  if (desk.scene === 'cabin' && cfg.mode === 'on' && (optionDown || held) && !insideAnyWindow(x, y)) {
    const [px, py] = cover.inv(x, y);
    if (onSnowyGround(px, py)) return { field: true, ground: false, onGround: true };
    if (photoSnowAt(x, y)) return { field: true }; // the roof, railings, branches… anywhere with snow in the photo
  }
  // the snow along the bottom is drawn over everything (even full-screen apps), so it can always be grabbed
  const gi = clamp(Math.round(x / COL), 0, ground.length - 1);
  const dk = wins.find((w) => w.dock);
  const onDock = dk && x >= dk.x && x <= dk.x + dk.w;
  if (!onDock && Math.max(ground[gi], ground[Math.max(0, gi - 2)], ground[Math.min(ground.length - 1, gi + 2)]) > 2 && y >= groundTop(x) - 12) return { ground: true };
  return null;
}
function updateGrab() {
  const want = !!held || !!grabbable(cursor.x, cursor.y);
  document.body.classList.toggle('grab', want && !held);
  if (want !== grabbing) { grabbing = want; host.grab(want); }
}

addEventListener('mousedown', (e) => {
  const x = e.clientX, y = e.clientY;
  const hit = grabbable(x, y);
  if (!hit) return;
  if (hit.ball) { held = hit.ball; held.rest = false; held.on = null; unstack(held); }
  else { held = { x, y, r: 5, vx: 0, vy: 0, rest: false, rolling: true }; balls.push(held); }
  document.body.classList.add('holding');
});
addEventListener('mouseup', () => {
  if (!held) return;
  const { vx, vy } = velocity();
  held.vx = clamp(vx, -2600, 2600); held.vy = clamp(vy, -2600, 2600);
  held.thrown = Math.hypot(vx, vy) > 250;
  held.byYou = true;
  const spot = grabbable(cursor.x, cursor.y + held.r * 0.5);
  const under = balls.find((o) => o !== held && o.rest && Math.abs(o.x - held.x) < o.r && o.y > held.y && o.y - held.y < 260);
  if (!held.thrown && !under && spot?.onGround) { held.rest = true; held.on = FIELD; held.vx = held.vy = 0; held.y = cursor.y; }
  else if (!under && desk.scene === 'cabin') {
    // it falls to the snowy ground below where you let go, and stays there
    for (let yy = cursor.y; yy < H; yy += 6) { const [px, py] = cover.inv(cursor.x, yy); if (onSnowyGround(px, py) && !insideAnyWindow(cursor.x, yy)) { held.landY = yy + rand(0, 20); break; } }
  }
  held = null;
  document.body.classList.remove('holding');
  updateGrab();
});

// ---------------- flakes ----------------
function flakeTarget() {
  const base = { light: 110, medium: 240, heavy: 520 }[cfg.amount] ?? 240;
  const k = (W * H) / (1512 * 982);
  return Math.round(base * k * (performance.now() < blizzardUntil ? 3 : 1));
}
function newFlake(top = true) {
  const z = Math.pow(Math.random(), 1.4); // 0 far … 1 near (more far ones, like real snowfall)
  return { x: rand(-80, W + 40), y: top ? rand(-60, -5) : rand(0, H), z, r: 0.6 + z * 3.2, vy: 28 + z * 85, ph: rand(0, 6.28), sway: rand(6, 22), spin: rand(0.6, 1.6) };
}
/** On the cabin photo, a flake reaches the ground at a depth that matches how near it is (far ones by the trees). */
function cabinGroundY(f) { return cover.oy + (CABIN_HORIZON + 30 + (PHOTO_H - CABIN_HORIZON - 30) * Math.pow(f.z, 0.8)) * cover.s; }

function landFlake(f, prevY) {
  // the frontmost window whose top (drift surface) this flake just crossed, if that spot isn't hidden
  if (cfg.mode === 'on' && cfg.fx.piles) {
    for (let i = 0; i < wins.length; i++) {
      const w = wins[i];
      if (f.x < w.x || f.x > w.x + w.w) continue;
      const p = piles.get(w.id);
      if (!p) continue;
      const top = pileTop(p, f.x);
      if (prevY < top && f.y >= top && !covered(f.x, top, i)) {
        const c = Math.round((f.x - p.x) / COL), amt = 0.8 + f.r * 0.45;
        addTo(p.h, c, amt * 0.6, pileCap(p)); addTo(p.h, c - 1, amt * 0.2, pileCap(p)); addTo(p.h, c + 1, amt * 0.2, pileCap(p));
        return true;
      }
      if (f.y > w.y && f.y < w.y + w.h) break; // falling in front of this window: keeps going down to the bottom
    }
  }
  if (!insideAnyWindow(f.x, f.y)) {
    for (const p of piles.values()) {
      if (!p.desk || f.x < p.x || f.x > p.x + p.w) continue;
      const top = pileTop(p, f.x);
      if (prevY < top && f.y >= top) {
        const c = Math.round((f.x - p.x) / COL), amt = 0.7 + f.r * 0.4, cap = pileCap(p);
        addTo(p.h, c, amt * 0.6, cap); addTo(p.h, c - 1, amt * 0.2, cap); addTo(p.h, c + 1, amt * 0.2, cap);
        return true;
      }
    }
  }
  if (desk.scene === 'cabin' && f.z < 0.93 && f.y >= cabinGroundY(f) && !insideAnyWindow(f.x, f.y)) {
    const [px, py] = cover.inv(f.x, f.y);
    if (onSnowyGround(px, py) || py > CABIN_HORIZON) return true; // settles into the snow in the photo
  }
  if (f.y >= groundTop(f.x)) {
    addTo(ground, Math.round(f.x / COL), 0.35 + f.r * 0.2, groundCap);
    return true;
  }
  return false;
}

// ---------------- snowballs ----------------
function unstack(b) { for (const o of balls) if (o.on === b) { o.on = null; o.rest = false; } }
function stackHeight(b) { let n = 1, cur = b; while (cur.on && cur.on.r) { n++; cur = cur.on; } return n; }

function splat(x, y, n = 18) { burst(x, y, n, 0, -160, 200); }

function stepBall(b, dt) {
  if (b === held) {
    const prevX = b.x;
    b.x = cursor.x; b.y = cursor.y - (b.rolling ? b.r * 0.6 : 0);
    if (b.rolling) { // rolling along a drift picks up snow
      const hit = grabbable(cursor.x, cursor.y);
      const moved = Math.abs(b.x - prevX);
      // rolling along the photo's ground (not carrying it through the air): it grows and leaves a track
      const lastPt = trails.at(-1)?.ball === b ? trails.at(-1).pts.at(-1) : null;
      const rollingOnGround = hit?.field && moved > 0.5 && moved < 40 && (!lastPt || Math.abs(cursor.y - lastPt[3]) < 14);
      if (hit?.field && !hit.onGround && moved > 0.5 && moved < 40) b.r = Math.min(34, Math.sqrt(b.r * b.r + moved * 1.6)); // scooping snow off a branch or the roof
      if (rollingOnGround) {
        if (hit.onGround) b.r = Math.min(34, Math.sqrt(b.r * b.r + moved * 1.6));
        if (!hit.onGround) { /* only the ground keeps a track */ } else if (!lastPt || Math.hypot(b.x - lastPt[0], cursor.y - lastPt[3]) > 40) trails.push({ ball: b, pts: [], t: performance.now() });
        if (hit.onGround) trails.at(-1)?.pts.push([b.x, cursor.y + b.r * 0.15, b.r, cursor.y]);
        if (trails.length > 30) trails.shift();
      }
      const arr = hit?.pile ? hit.pile.h : hit?.ground ? ground : null;
      if (arr && moved > 0.5) {
        const i = hit.pile ? Math.round((b.x - hit.pile.x) / COL) : Math.round(b.x / COL);
        let took = 0;
        for (let k = -2; k <= 2; k++) { const j = i + k; if (j >= 0 && j < arr.length && arr[j] > 0) { const t = Math.min(arr[j], moved * 0.06); arr[j] -= t; took += t; } }
        b.r = Math.min(34, Math.sqrt(b.r * b.r + took * 6));
      }
    }
    return;
  }
  if (b.rest) {
    // keep sitting on whatever it's on
    if (b.on && b.on.r) { b.x = b.on.x; b.y = b.on.y - b.on.r - b.r * 0.85; if (!balls.includes(b.on)) { b.rest = false; b.on = null; } }
    else if (b.on && b.on.h) { if (!piles.has(b.on.id)) { b.rest = false; b.on = null; } else b.y = pileTop(b.on, b.x) - b.r * 0.8; }
    if (wind && b.x < wind.x + 60 && b.x > wind.x - 400) { b.rest = false; b.on = null; b.vx = 1800; b.vy = -300; b.blown = true; }
    return;
  }
  b.vy += G * dt; b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.landY && b.vy > 0 && b.y >= b.landY) { // landed on the photo's snowy ground
    if (b.thrown && Math.hypot(b.vx, b.vy) > 900) { splat(b.x, b.y, 10 + b.r); b.dead = true; return; }
    b.rest = true; b.on = FIELD; b.vx = b.vy = 0; b.y = b.landY; b.landY = null; return;
  }
  if (b.blown && b.x > W + 60) { b.dead = true; return; }
  if (b.atCursor && Math.hypot(b.x - cursor.x, b.y - cursor.y) < 18) { splat(cursor.x, cursor.y, 22); b.dead = true; return; } // got you!
  // hit a window (front first): it bursts, the window's snow shakes
  if (b.thrown && Math.abs(b.vx) + Math.abs(b.vy) > 400) {
    for (let i = 0; i < wins.length; i++) {
      const w = wins[i];
      if (b.x > w.x && b.x < w.x + w.w && b.y > w.y && b.y < w.y + w.h && !covered(b.x, b.y, i)) {
        splat(b.x, b.y, 10 + b.r);
        const p = piles.get(w.id);
        if (p) { p.shake = 0.6; for (let k = 0; k < p.h.length; k += 3) if (p.h[k] > 6 && Math.random() < 0.3) { burst(p.x + k * COL, p.y - p.h[k], 2, 0, -40, 60); p.h[k] *= 0.85; } }
        for (const s of snowmen) if (s.on === w.id) s.wobble = 1;
        b.dead = true;
        return;
      }
    }
  }
  // hit a snowman
  for (const s of snowmen) {
    if (s.state !== 'idle' || s === b.from) continue;
    const head = s.headPos();
    if (Math.hypot(b.x - head.x, b.y - head.y) < 12 + b.r) {
      splat(b.x, b.y, 14);
      s.wobble = 1;
      if (s.hat.on && b.y < head.y - 2) s.loseHat(b.vx * 0.3, -350);
      if (b.byYou) s.throwAt(cursor.x, cursor.y, true); // you started it
      b.dead = true;
      return;
    }
  }
  // land on another snowball (stacking), a drift or the ground
  for (const o of balls) {
    if (o === b || !o.rest || o.blown) continue;
    if (b.vy > 0 && Math.hypot(b.x - o.x, b.y - o.y) < b.r + o.r * 0.9 && b.y < o.y) {
      b.rest = true; b.on = o; b.vx = b.vy = 0;
      if (stackHeight(b) >= 3) buildFromStack(b);
      return;
    }
  }
  if (b.vy > 0 && cfg.mode === 'on') {
    for (let i = 0; i < wins.length; i++) {
      const p = piles.get(wins[i].id);
      if (!p || b.x < p.x || b.x > p.x + p.w || covered(b.x, p.y - 2, i)) continue;
      const top = pileTop(p, b.x);
      if (b.y + b.r * 0.8 >= top && b.y - b.vy * dt + b.r * 0.8 < top + 4) {
        if (b.thrown && Math.hypot(b.vx, b.vy) > 700) { splat(b.x, top, 8 + b.r); b.dead = true; return; }
        b.rest = true; b.on = p; b.vx = b.vy = 0; b.y = top - b.r * 0.8;
        return;
      }
    }
  }
  if (b.vy > 0 && !insideAnyWindow(b.x, b.y)) {
    for (const p of piles.values()) {
      if (!p.desk || b.x < p.x || b.x > p.x + p.w) continue;
      const top = pileTop(p, b.x);
      if (b.y + b.r * 0.8 >= top && b.y - b.vy * dt + b.r * 0.8 < top + 4) {
        if (b.thrown && Math.hypot(b.vx, b.vy) > 700) { splat(b.x, top, 8 + b.r); b.dead = true; return; }
        b.rest = true; b.on = p; b.vx = b.vy = 0; b.y = top - b.r * 0.8;
        return;
      }
    }
  }
  if (b.y + b.r * 0.8 >= groundTop(b.x)) {
    if (b.thrown && Math.hypot(b.vx, b.vy) > 500) { splat(b.x, groundTop(b.x), 8 + b.r); b.dead = true; return; }
    b.rest = true; b.on = null; b.vx = b.vy = 0; b.y = groundTop(b.x) - b.r * 0.8;
  }
  if (b.x < -100 || b.x > W + 100 || b.y > H + 100) b.dead = true;
}

function buildFromStack(top) {
  const mid = top.on, base = mid.on;
  const at = base.on && base.on.h ? base.on.id : null;
  for (const b of [top, mid, base]) b.dead = true;
  if (base.on?.field) { const sm = new Snowman('field', base.x, true, [base.r, mid.r, top.r]); sm.fy = base.y + base.r * 0.85; snowmen.push(sm); return; }
  const s = new Snowman(at, at ? base.x - piles.get(at).x : base.x, true, [base.r, mid.r, top.r]);
  snowmen.push(s);
}

// ---------------- snowmen ----------------
class Snowman {
  constructor(on, rx, instant = false, radii = null) {
    this.on = on; // window id, or null for the bottom of the screen
    this.rx = rx; // x relative to the window (or the screen)
    this.state = 'build'; this.t = instant ? 1.6 : 0;
    this.k = rand(1.25, 1.5); // size
    // bottom, middle, head: from the snowballs you stacked (or the usual sizes)
    this.radii = radii ?? [16 * this.k, 11 * this.k, 8 * this.k];
    if (radii) this.k = clamp(radii[2] / 8, 0.6, 4); // the face, arms and hat fit the head you made
    this.hat = { on: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, dropAt: instant ? 1.9 : 2.2 }; // the hat lands once the head is there
    this.wobble = 0; this.wave = 0; this.cool = rand(4, 9);
    this.fall = null; this.dir = Math.random() < 0.5 ? -1 : 1;
  }
  base() {
    if (this.fall) return this.fall;
    if (this.on === 'field') return { x: this.rx, y: this.fy };
    if (this.on) { const p = piles.get(this.on); if (!p) return null; const x = p.x + this.rx; return { x, y: pileTop(p, x) + 4 }; }
    return { x: this.rx, y: groundTop(this.rx) + 3 };
  }
  /** Where each ball's centre is, from the ground up (they squash into each other a little). */
  layout() {
    const [r1, r2, r3] = this.radii;
    const y1 = -r1, y2 = -r1 * 2 - r2 * 0.7, y3 = y2 - r2 - r3 * 0.7;
    return { y1, y2, y3 };
  }
  headPos() { const b = this.base() ?? { x: -999, y: -999 }; return { x: b.x, y: b.y + this.layout().y3 }; }
  knock(vx, vy) { const b = this.base(); if (!b) return; this.fall = { x: b.x, y: b.y, vx, vy }; this.state = 'falling'; }
  loseHat(vx, vy) { if (!this.hat.on) return; const h = this.headPos(); this.hat = { on: false, x: h.x, y: h.y - 10 * this.k, vx, vy, rot: 0, spin: rand(-8, 8), dropAt: 0, back: performance.now() + 4500 }; }
  throwAt(tx, ty, angry = false) {
    if (this.state !== 'idle') return;
    const h = this.headPos();
    const from = { x: h.x + this.dir * 14, y: h.y + 16 };
    const T = clamp(Math.hypot(tx - from.x, ty - from.y) / 650, 0.5, 1.3);
    balls.push({ x: from.x, y: from.y, r: 5, vx: (tx - from.x) / T, vy: (ty - from.y) / T - 0.5 * G * T, thrown: true, from: this, atCursor: angry });
    this.wave = 0.6; this.angry = angry ? 2 : 0; this.cool = rand(5, 10);
  }
  step(dt, now) {
    this.t += dt;
    if (this.state === 'build' && this.t > 2.6) this.state = 'idle';
    if (!this.hat.on && this.hat.dropAt && this.t > this.hat.dropAt) { // the hat lands on the head
      const h = this.headPos();
      if (this.hat.y === 0) { this.hat.y = h.y - 120; this.hat.x = h.x; }
      this.hat.vy += G * dt; this.hat.y += this.hat.vy * dt;
      if (this.hat.y >= h.y - 7 * this.k) { this.hat.on = true; this.hat.dropAt = 0; this.wobble = 0.4; }
    } else if (!this.hat.on && this.hat.back) { // knocked off: flies, then comes back
      this.hat.vy += G * 0.6 * dt; this.hat.x += this.hat.vx * dt; this.hat.y += this.hat.vy * dt; this.hat.rot += this.hat.spin * dt;
      if (now > this.hat.back && !(wind && wind.x < W + 200)) this.hat = { on: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, dropAt: this.t + 0.01 };
    }
    if (this.fall) {
      this.fall.vy += G * dt; this.fall.x += this.fall.vx * dt; this.fall.y += this.fall.vy * dt;
      if (this.fall.y > groundTop(this.fall.x) || this.fall.y > H + 80) { splat(this.fall.x, Math.min(H, this.fall.y), 40); this.dead = true; }
      return;
    }
    if (!this.base()) { this.knock(0, 0); return; }
    this.wobble = Math.max(0, this.wobble - dt * 1.5);
    this.wave = Math.max(0, this.wave - dt);
    this.angry = Math.max(0, (this.angry || 0) - dt);
    const h = this.headPos();
    const near = Math.hypot(cursor.x - h.x, cursor.y - h.y) < 170;
    if (near) this.wave = Math.max(this.wave, 0.3); // waves when you come close
    this.dir = cursor.x < h.x ? -1 : 1;
    // snowball fights when you leave them alone
    this.cool -= dt;
    if (cfg.fx.fights && this.state === 'idle' && this.cool <= 0 && now - lastMove > 6000) {
      const others = snowmen.filter((o) => o !== this && o.state === 'idle' && o.base());
      if (others.length) { const o = others[(Math.random() * others.length) | 0]; const oh = o.headPos(); this.dir = oh.x < h.x ? -1 : 1; this.throwAt(oh.x, oh.y); }
      else this.cool = 5;
    }
  }
  draw(gc) {
    const b0 = this.base();
    if (!b0) return;
    if (desk.scene === 'cabin' && !this.grading) { // drawn in daylight, then lit by the night at its spot
      const [R1, R2, R3] = this.radii, reach = Math.max(R1 * 1.6, R2 * 2.6) + 10, tall = (R1 + R2 + R3) * 2 + R3 * 2.4 + 20;
      if (!this.fall) softShadow(gc, b0.x + R1 * 0.3, b0.y + 1, R1 * 1.55, R1 * 0.32);
      this.grading = true;
      lit(b0.x - reach, b0.y - tall, reach * 2, tall + 8, lightAt(b0.x, b0.y), (c) => this.draw(c));
      this.grading = false;
      return;
    }
    const b = b0;
    const k = this.k;
    const seed = (this.seed ??= Math.random() * 100);
    const grow = this.state === 'build' ? this.t : 9;
    const [R1, R2, R3] = this.radii;
    const r1 = R1 * clamp(grow / 0.5, 0, 1), r2 = R2 * clamp((grow - 0.5) / 0.5, 0, 1), r3 = R3 * clamp((grow - 1) / 0.5, 0, 1);
    const tilt = Math.sin(this.t * 18) * 0.12 * this.wobble + (this.fall ? this.t * 4 : 0);
    if (!this.fall && r1 > 1 && !this.grading) softShadow(gc, b.x + r1 * 0.3, b.y + 1, r1 * 1.55, r1 * 0.32);
    gc.save();
    gc.translate(b.x, b.y);
    gc.rotate(tilt);
    const { y1, y2, y3 } = this.layout();
    const SP = this.grading ? DAY : palAt(b.x, b.y); // (when lit by the scene, start from white snow)
    snowSphere(gc, 0, y1, r1, seed, r2 * 0.9, SP);
    // twig arms behind/at the middle: tapered, with little side twigs and a forked end; one waves
    if (grow > 1.2) {
      const wave = this.wave > 0 ? Math.sin(this.t * 14) * 0.5 : 0;
      for (const side of [-1, 1]) {
        const up = side === this.dir ? -0.6 + wave - (this.angry ? 0.5 : 0) : 0.3 + Math.sin(seed + side) * 0.08;
        const len = Math.max(18 * k, R2 * 1.55);
        twig(gc, side * r2 * 0.75, y2 - r2 * 0.1, up, side, len, Math.max(1.6 * k, R2 / 8), seed + side);
      }
    }
    snowSphere(gc, 0, y2, r2, seed + 3, r3 * 0.9, SP);
    if (grow > 1.2) { // coal buttons
      for (const [i, yy] of [y2 - r2 * 0.35, y2 + r2 * 0.25, y1 - r1 * 0.45].entries()) coal(gc, Math.sin(seed + i) * r2 * 0.05, yy, Math.max(1.4 * k, r2 * 0.12), seed + i * 7);
    }
    snowSphere(gc, 0, y3, r3, seed + 6, 0, SP);
    if (grow > 1.5) {
      // coal eyes that look at your pointer
      const a = Math.atan2(cursor.y - (b.y + y3), cursor.x - b.x);
      const px = Math.cos(a) * r3 * 0.08, py = Math.sin(a) * r3 * 0.08;
      for (const ex of [-r3 * 0.36, r3 * 0.36]) coal(gc, ex + px, y3 - r3 * 0.22 + py, r3 * 0.13, seed + ex);
      if (this.angry) { gc.strokeStyle = '#141418'; gc.lineWidth = r3 * 0.1; gc.lineCap = 'round'; gc.beginPath(); gc.moveTo(-r3 * 0.6, y3 - r3 * 0.6); gc.lineTo(-r3 * 0.15, y3 - r3 * 0.42); gc.moveTo(r3 * 0.6, y3 - r3 * 0.6); gc.lineTo(r3 * 0.15, y3 - r3 * 0.42); gc.stroke(); }
      // a real carrot: tapered, curved a little, ridged, pointing your way
      const d = this.dir, L = r3 * 1.25, hw = r3 * 0.17;
      const cg = gc.createLinearGradient(0, y3 - hw, 0, y3 + hw);
      cg.addColorStop(0, '#ffad5a'); cg.addColorStop(0.5, '#f07a1a'); cg.addColorStop(1, '#b8540c');
      gc.fillStyle = cg;
      gc.beginPath(); gc.moveTo(0, y3 - hw); gc.quadraticCurveTo(d * L * 0.6, y3 - hw * 0.4, d * L, y3 + hw * 0.5); gc.quadraticCurveTo(d * L * 0.55, y3 + hw * 0.9, 0, y3 + hw); gc.closePath(); gc.fill();
      gc.strokeStyle = 'rgba(140,60,10,0.55)'; gc.lineWidth = Math.max(0.6, r3 * 0.03);
      for (const f of [0.25, 0.45, 0.65]) { gc.beginPath(); gc.moveTo(d * L * f, y3 - hw * (1 - f) * 0.9); gc.lineTo(d * L * f + d * r3 * 0.04, y3 + hw * (1 - f) * 0.7); gc.stroke(); }
      // a smile of little coal pebbles
      for (let i = -2; i <= 2; i++) coal(gc, i * r3 * 0.2, y3 + r3 * 0.42 - (2 - Math.abs(i)) * r3 * 0.05, r3 * 0.07, seed + i * 3);
    }
    if (grow > 1.9) knittedScarf(gc, y3, r3, this.dir, this.t, seed);
    if (this.hat.on) drawHat(gc, 0, y3 - r3 + r3 * 0.25, Math.max(k * 0.9, r3 / 8), 0);
    gc.restore();
    if (!this.hat.on && (this.hat.back || this.hat.dropAt) && this.hat.y) drawHat(gc, this.hat.x, this.hat.y, Math.max(k * 0.9, R3 / 8), this.hat.rot);
  }
}

/**
 * Draws something (a snowman, the plow, the sleigh) in daylight colours, then lights all of it with the scene's light at
 * that spot, like a photo at night: white snow becomes the photo's blue snow, and the red scarf, the carrot, the coal and
 * the hat dim and shift the same way (warmer by the fire). Only on the photo scene.
 */
const gradeA = document.createElement('canvas'), gradeB = document.createElement('canvas');
function lit(x0, y0, w, h, light, drawFn) {
  if (desk.scene !== 'cabin' || !light) return drawFn(g);
  const d = DPR, W2 = Math.ceil(w * d), H2 = Math.ceil(h * d);
  if (W2 < 1 || H2 < 1) return;
  for (const c of [gradeA, gradeB]) { if (c.width < W2) c.width = W2; if (c.height < H2) c.height = H2; }
  const a = gradeA.getContext('2d'), b = gradeB.getContext('2d');
  a.setTransform(1, 0, 0, 1, 0, 0); a.clearRect(0, 0, gradeA.width, gradeA.height);
  a.setTransform(d, 0, 0, d, -x0 * d, -y0 * d);
  drawFn(a);
  a.setTransform(1, 0, 0, 1, 0, 0);
  b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, gradeB.width, gradeB.height); b.drawImage(gradeA, 0, 0);
  a.globalCompositeOperation = 'multiply'; a.fillStyle = light; a.fillRect(0, 0, W2, H2); // the night light
  a.globalCompositeOperation = 'destination-in'; a.drawImage(gradeB, 0, 0); // keep only the thing's own shape
  a.globalCompositeOperation = 'source-over';
  g.drawImage(gradeA, 0, 0, W2, H2, x0, y0, W2 / d, H2 / d);
}
/** The light at a spot: the colour white snow would have there (the photo's snow, a little brighter). */
function lightAt(x, y, selfLit = 0) {
  if (desk.scene !== 'cabin') return null;
  // selfLit: things with their own lights (the plow's beacon and headlights) take only part of the night's tint
  const c = rgbOf(palAt(x, y).hi).map((v) => Math.min(255, v * 1.02 + 4));
  return hex(c.map((v) => v * (1 - selfLit) + 235 * selfLit));
}

/** A lump of coal: an irregular dark stone with a dull shine. */
function coal(gc, x, y, r, seed) {
  gc.save();
  gc.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, rr = r * (0.8 + 0.3 * Math.abs(Math.sin(seed * 3.1 + i * 1.7)));
    i ? gc.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : gc.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  gc.closePath();
  const cg = gc.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x, y, r * 1.1);
  cg.addColorStop(0, '#4a4a52'); cg.addColorStop(0.5, '#1b1b20'); cg.addColorStop(1, '#0b0b0e');
  gc.fillStyle = cg; gc.fill();
  gc.restore();
}

/** A twig arm: thick at the shoulder, thin at the end, with a side twig and a little fork like fingers. */
function twig(gc, sx, sy, up, side, len, thick, seed) {
  const ex = sx + side * len * Math.cos(up), ey = sy + len * Math.sin(up);
  const nx = -(ey - sy) / len, ny = (ex - sx) / len; // normal
  const bend = Math.sin(seed) * len * 0.06;
  const mx = (sx + ex) / 2 + nx * bend, my = (sy + ey) / 2 + ny * bend;
  const tg = gc.createLinearGradient(sx, sy, ex, ey);
  tg.addColorStop(0, '#5d4027'); tg.addColorStop(1, '#3b2716');
  gc.fillStyle = tg;
  gc.beginPath();
  gc.moveTo(sx + nx * thick, sy + ny * thick);
  gc.quadraticCurveTo(mx + nx * thick * 0.6, my + ny * thick * 0.6, ex + nx * thick * 0.25, ey + ny * thick * 0.25);
  gc.lineTo(ex - nx * thick * 0.25, ey - ny * thick * 0.25);
  gc.quadraticCurveTo(mx - nx * thick * 0.6, my - ny * thick * 0.6, sx - nx * thick, sy - ny * thick);
  gc.closePath(); gc.fill();
  gc.strokeStyle = '#3b2716'; gc.lineCap = 'round';
  const twigAt = (f, ang, l, w) => {
    const bx = sx + (ex - sx) * f + nx * bend * Math.sin(f * Math.PI), by = sy + (ey - sy) * f + ny * bend * Math.sin(f * Math.PI);
    const a = Math.atan2(ey - sy, ex - sx) + ang;
    gc.lineWidth = w; gc.beginPath(); gc.moveTo(bx, by); gc.lineTo(bx + Math.cos(a) * l, by + Math.sin(a) * l); gc.stroke();
  };
  twigAt(0.55, -0.7 * side, len * 0.28, thick * 0.6);
  twigAt(0.92, -0.55 * side, len * 0.16, thick * 0.45);
  twigAt(0.92, 0.5 * side, len * 0.14, thick * 0.4);
}

/** A striped knitted scarf wrapped around the neck, with a hanging end and fringe that sways. */
function knittedScarf(gc, y3, r3, dir, t, seed) {
  const ny = y3 + r3 * 0.88, w = r3 * 1.12, h = r3 * 0.34;
  const knit = (path, x0, y0, x1, y1) => {
    gc.save(); path(); gc.clip();
    const sg = gc.createLinearGradient(0, y0, 0, y1);
    sg.addColorStop(0, '#d8343a'); sg.addColorStop(1, '#8f171c');
    gc.fillStyle = sg; gc.fillRect(x0, y0, x1 - x0, y1 - y0);
    gc.fillStyle = 'rgba(245,235,220,0.9)'; // cream stripes
    for (let yy = y0 + (y1 - y0) * 0.3; yy < y1; yy += (y1 - y0) * 0.38) gc.fillRect(x0, yy, x1 - x0, Math.max(1, r3 * 0.07));
    gc.strokeStyle = 'rgba(60,0,0,0.25)'; gc.lineWidth = Math.max(0.5, r3 * 0.025); // knit ribs
    for (let xx = x0; xx < x1; xx += Math.max(1.6, r3 * 0.09)) { gc.beginPath(); gc.moveTo(xx, y0); gc.lineTo(xx + r3 * 0.03, y1); gc.stroke(); }
    gc.restore();
  };
  // the wrapped band
  knit(() => { gc.beginPath(); gc.ellipse(0, ny, w, h, 0, 0, 7); }, -w, ny - h, w, ny + h);
  // the hanging end, swaying a little
  const sway = Math.sin(t * 2.2 + seed) * 0.08;
  gc.save();
  gc.translate(-dir * w * 0.45, ny + h * 0.3);
  gc.rotate(-dir * 0.12 + sway);
  const tw = r3 * 0.38, tl = r3 * 1.15;
  knit(() => { gc.beginPath(); gc.roundRect(-tw / 2, 0, tw, tl, tw * 0.25); }, -tw / 2, 0, tw / 2, tl);
  gc.strokeStyle = '#c42a30'; gc.lineWidth = Math.max(0.7, r3 * 0.04);
  for (let i = 0; i < 5; i++) { const fx = -tw / 2 + (i + 0.5) * (tw / 5); gc.beginPath(); gc.moveTo(fx, tl); gc.lineTo(fx + Math.sin(t * 3 + i) * r3 * 0.03, tl + r3 * 0.18); gc.stroke(); }
  gc.restore();
}

function drawHat(gc, x, y, k, rot) {
  gc.save(); gc.translate(x, y); gc.rotate(rot);
  const fl = gc.createLinearGradient(-6.5 * k, 0, 6.5 * k, 0); // felt with a soft sheen
  fl.addColorStop(0, '#2e2e35'); fl.addColorStop(0.35, '#16161b'); fl.addColorStop(0.7, '#25252c'); fl.addColorStop(1, '#0e0e12');
  gc.fillStyle = fl;
  gc.beginPath(); gc.moveTo(-6 * k, -1 * k); gc.lineTo(-6.8 * k, -15 * k); gc.quadraticCurveTo(0, -16.2 * k, 6.8 * k, -15 * k); gc.lineTo(6 * k, -1 * k); gc.closePath(); gc.fill();
  gc.fillStyle = '#b8222a'; gc.fillRect(-6.2 * k, -5 * k, 12.4 * k, 2.6 * k); // band
  gc.fillStyle = 'rgba(255,255,255,0.12)'; gc.fillRect(-6.2 * k, -5 * k, 12.4 * k, 0.6 * k);
  const br = gc.createLinearGradient(0, -2 * k, 0, 1.5 * k); // brim
  br.addColorStop(0, '#2a2a31'); br.addColorStop(1, '#0c0c10');
  gc.fillStyle = br; gc.beginPath(); gc.ellipse(0, -0.5 * k, 10.5 * k, 2 * k, 0, 0, 7); gc.fill();
  gc.restore();
}

function maybeSnowman(now) {
  if (!cfg.fx.snowmen || cfg.mode !== 'on' || now < nextSnowman) return;
  nextSnowman = now + rand(25000, 50000);
  if (snowmen.length >= 5) return;
  // a window with a good drift, at a spot you can see
  const options = [];
  for (let i = 0; i < wins.length; i++) {
    const p = piles.get(wins[i].id);
    if (!p || p.w < 180) continue;
    for (let tries = 0; tries < 6; tries++) {
      const rx = rand(40, p.w - 40), col = Math.round(rx / COL);
      const h = p.h[col] ?? 0;
      if (h > 9 && !covered(p.x + rx, p.y - 80, i) && !snowmen.some((s) => s.on === p.id && Math.abs(s.rx - rx) < 60)) options.push([p.id, rx]);
    }
  }
  for (const p of deskPiles()) {
    if (!p.flat || p.w < 160) continue;
    for (let tries = 0; tries < 4; tries++) {
      const rx = rand(40, p.w - 40), h = p.h[Math.round(rx / COL)] ?? 0;
      if (h > 8 && !insideAnyWindow(p.x + rx, pileTop(p, p.x + rx) - 70) && !snowmen.some((s) => s.on === p.id && Math.abs(s.rx - rx) < 60)) options.push([p.id, rx]);
    }
  }
  if (!options.length) {
    if (ground.reduce((a, b) => a + b, 0) / ground.length > 6 && snowmen.filter((s) => !s.on).length < 2) snowmen.push(new Snowman(null, rand(80, W - 80)));
    return;
  }
  const [id, rx] = options[(Math.random() * options.length) | 0];
  snowmen.push(new Snowman(id, rx));
}

// ---------------- wind (shake the mouse) ----------------
function startWind() {
  if (wind) return;
  wind = { x: -300, t: 0 };
  for (const s of snowmen) s.loseHat(1400, -260);
  calmUntil = performance.now() + 4200;
}
function stepWind(dt) {
  if (!wind) return;
  wind.t += dt;
  wind.x += 2200 * dt;
  for (const f of flakes) if (f.x < wind.x && f.x > wind.x - 500) { f.blown = true; }
  for (const p of parts) if (p.x < wind.x) p.vx += 4000 * dt;
  for (const p of piles.values()) { // the wind front strips the snow off windows as it passes
    const from = Math.floor((wind.x - 2200 * dt - p.x) / COL), to = Math.floor((wind.x - p.x) / COL);
    for (let i = Math.max(0, from); i <= Math.min(p.h.length - 1, to); i++) if (p.h[i] > 0) {
      if (p.h[i] > 2 && i % 2 === 0) burst(p.x + i * COL, p.y - p.h[i] / 2, Math.ceil(p.h[i] / 6), 1600, -120, 90);
      p.h[i] = 0;
    }
  }
  if (wind.x > W + 600) wind = null;
}
function drawWind() {
  if (!wind) return;
  g.save();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    const y = (i / 60) * H + Math.sin(i * 7.3) * 20;
    const len = 120 + (i * 37) % 220;
    const x = wind.x - ((i * 53) % 400);
    g.lineWidth = 1 + (i % 3);
    g.globalAlpha = 0.25 + ((i * 13) % 10) / 25;
    g.beginPath(); g.moveTo(x - len, y); g.lineTo(x, y); g.stroke();
  }
  g.restore();
}

// ---------------- the sleigh ----------------
function startSleigh() { if (sleigh) return; lastSleigh = performance.now(); sleigh = { x: -420, t: 0 }; }
function drawSleigh(dt) {
  if (sleigh && desk.scene === 'cabin' && !drawSleigh.grading) {
    drawSleigh.grading = true;
    const x = sleigh.x, y = groundBase();
    const saved = g; lit(x - 60, y - 220, 520, 230, lightAt(x + 150, y - 40, 0.3), (c) => { g = c; try { drawSleigh(dt); } finally { g = saved; } });
    drawSleigh.grading = false;
    return;
  }
  if (!sleigh) return;
  sleigh.t += dt;
  sleigh.x += 260 * dt;
  const baseY = groundTop(clamp(sleigh.x, 0, W - 1)) - 4;
  const bob = (o) => Math.abs(Math.sin(sleigh.t * 9 + o)) * 3;
  // reindeer (three, ahead of the sleigh)
  for (let i = 0; i < 3; i++) {
    const x = sleigh.x + 150 + i * 62, y = baseY - 30 - bob(i);
    g.save(); g.translate(x, y);
    g.strokeStyle = '#5a3b22'; g.lineWidth = 3; g.lineCap = 'round';
    for (const [lx, ph] of [[-12, 0], [-6, 1.6], [10, 3.1], [15, 4.7]]) { const sw = Math.sin(sleigh.t * 12 + ph + i) * 6; g.beginPath(); g.moveTo(lx, 6); g.lineTo(lx + sw, 26 + bob(i) * 0.3); g.stroke(); }
    g.fillStyle = '#8a5a34'; g.beginPath(); g.ellipse(0, 0, 20, 10, 0, 0, 7); g.fill();
    g.fillStyle = '#f2e6d8'; g.beginPath(); g.ellipse(-14, 2, 5, 6, 0, 0, 7); g.fill(); // tail
    g.fillStyle = '#8a5a34'; g.beginPath(); g.ellipse(22, -12, 7, 6, -0.4, 0, 7); g.fill(); // head
    g.fillRect(14, -10, 7, 10); // neck
    g.fillStyle = i === 0 ? '#ff3b30' : '#2a1a10'; g.beginPath(); g.arc(29, -14, 2.5, 0, 7); g.fill(); // nose
    g.strokeStyle = '#6b4a2b'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(20, -17); g.lineTo(16, -28); g.lineTo(11, -31); g.moveTo(17, -25); g.lineTo(21, -32); g.moveTo(23, -17); g.lineTo(25, -29); g.lineTo(30, -32); g.stroke(); // antlers
    g.fillStyle = '#d02a35'; g.fillRect(-6, -9, 12, 8); // harness
    g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(0, -1, 2, 0, 7); g.fill(); // bell
    g.restore();
  }
  // reins
  g.strokeStyle = 'rgba(120,60,30,0.8)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(sleigh.x + 70, baseY - 44); g.quadraticCurveTo(sleigh.x + 160, baseY - 50, sleigh.x + 280, baseY - 38); g.stroke();
  // the sleigh with its driver
  const sx = sleigh.x, sy = baseY - bob(2) * 0.6;
  g.save(); g.translate(sx, sy);
  g.fillStyle = '#c0392b'; // driver's coat
  g.beginPath(); g.ellipse(40, -48, 13, 15, 0, 0, 7); g.fill();
  g.fillStyle = '#f5d0b0'; g.beginPath(); g.arc(44, -66, 7, 0, 7); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(44, -60, 8, 5, 0, 0, Math.PI); g.fill(); // beard
  g.fillStyle = '#c0392b'; g.beginPath(); g.moveTo(37, -70); g.lineTo(51, -70); g.lineTo(58, -80); g.closePath(); g.fill(); // hat
  g.fillStyle = '#fff'; g.beginPath(); g.arc(58, -80, 2.5, 0, 7); g.fill(); g.fillRect(36, -72, 16, 3);
  g.fillStyle = '#7a4a2a'; g.beginPath(); g.ellipse(14, -46, 14, 13, 0, 0, 7); g.fill(); // sack
  g.fillStyle = '#3aa655'; g.fillRect(6, -62, 9, 9); g.fillStyle = '#ffcc33'; g.fillRect(16, -60, 8, 7); // presents
  g.fillStyle = '#d63031'; // body
  g.beginPath(); g.moveTo(0, -40); g.lineTo(70, -40); g.quadraticCurveTo(78, -40, 76, -26); g.lineTo(70, -14); g.lineTo(6, -14); g.quadraticCurveTo(-6, -26, 0, -40); g.fill();
  g.fillStyle = '#ffcf4a'; g.fillRect(4, -28, 64, 3);
  g.strokeStyle = '#e6b23a'; g.lineWidth = 3; g.lineCap = 'round'; // runner
  g.beginPath(); g.moveTo(-6, -4); g.lineTo(78, -4); g.quadraticCurveTo(92, -4, 90, -16); g.moveTo(16, -14); g.lineTo(16, -4); g.moveTo(58, -14); g.lineTo(58, -4); g.stroke();
  g.restore();
  // kicking up snow behind it
  if (Math.random() < 0.8) burst(sx - 4, baseY - 2, 2, -180, -160, 70);
  if (sleigh.x > W + 60) sleigh = null;
}

// ---------------- the snowplow truck ----------------
// Every few minutes (when snow has built up along the bottom), an orange plow truck drives in from the right with its
// blade down, pushing the snow off the bottom of the screen and spraying it up; amber light flashing, headlights on.
let plow = null, nextPlow = performance.now() + rand(150000, 300000);
const plowPuffs = [];
function startPlow() { if (!plow) plow = { x: W + 120, t: 0, load: 0 }; }
function stepPlow(dt) {
  const now = performance.now();
  if (!plow && cfg.fx.plow !== false && now > nextPlow) {
    nextPlow = now + rand(240000, 480000);
    if (ground.reduce((a, b) => a + b, 0) / ground.length > 3) startPlow();
  }
  if (!plow) return;
  plow.t += dt;
  plow.x -= 165 * dt;
  const blade = plow.x - 26;
  const i0 = Math.max(0, Math.floor((blade - 4) / COL)), i1 = Math.min(ground.length - 1, Math.ceil((blade + 14) / COL));
  let moved = 0;
  for (let i = i0; i <= i1; i++) { moved += ground[i]; ground[i] = 0; }
  plow.load = Math.min(30, plow.load * (1 - dt * 0.6) + moved * 0.4);
  if (moved > 0.3 || (plow.load > 4 && Math.random() < dt * 20)) burst(blade - 8, groundBase() - 18, Math.min(10, 1 + Math.ceil(moved / 3)), -220, -300, 110);
  for (const b of balls) if (b.rest && !b.on && Math.abs(b.x - blade) < b.r + 12) { splat(b.x, b.y, 18); b.dead = true; }
  for (const sm of snowmen) if (!sm.on && !sm.fall && Math.abs(sm.rx - blade) < 24) sm.knock(-320, -420);
  if (Math.random() < dt * 6) plowPuffs.push({ x: plow.x + 78, y: groundBase() - 112, r: 4, life: 0 });
  if (plow.x < -340) plow = null;
}
function drawPlow() {
  if (plow && desk.scene === 'cabin' && !drawPlow.grading) {
    drawPlow.grading = true;
    const x = plow.x, y = groundBase();
    const saved = g; lit(x - 300, y - 200, 600, 210, lightAt(x + 100, y - 40, 0.45), (c) => { g = c; try { drawPlow(); } finally { g = saved; } });
    drawPlow.grading = false;
    return;
  }
  for (let i = plowPuffs.length - 1; i >= 0; i--) { // exhaust
    const p = plowPuffs[i];
    p.life += 1 / 60; p.y -= 0.6; p.x += 0.5; p.r += 0.35;
    if (p.life > 1.6) { plowPuffs.splice(i, 1); continue; }
    g.globalAlpha = 0.18 * (1 - p.life / 1.6); g.fillStyle = '#9aa0ab';
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  if (!plow) return;
  const x = plow.x, y = groundBase(), t = plow.t;
  g.save();
  softShadow(g, x + 110, y - 2, 170, 12);
  // headlight beam ahead (to the left)
  g.globalCompositeOperation = 'lighter';
  const hb = g.createLinearGradient(x + 10, 0, x - 260, 0);
  hb.addColorStop(0, 'rgba(255,240,200,0.28)'); hb.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = hb; g.beginPath(); g.moveTo(x + 12, y - 52); g.lineTo(x - 260, y - 90); g.lineTo(x - 260, y - 4); g.lineTo(x + 12, y - 40); g.closePath(); g.fill();
  g.globalCompositeOperation = 'source-over';
  // chassis
  g.fillStyle = '#16171b'; g.fillRect(x - 4, y - 36, 240, 10);
  // dump body (rear)
  const bodyG = g.createLinearGradient(0, y - 92, 0, y - 34);
  bodyG.addColorStop(0, '#ffc04a'); bodyG.addColorStop(0.5, '#f29a14'); bodyG.addColorStop(1, '#b8680a');
  g.fillStyle = bodyG; g.beginPath(); g.moveTo(x + 84, y - 36); g.lineTo(x + 80, y - 88); g.lineTo(x + 236, y - 92); g.lineTo(x + 236, y - 36); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(90,45,0,0.45)'; g.lineWidth = 1.2; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(x + 84 + i * 30, y - 89); g.lineTo(x + 84 + i * 30, y - 37); g.stroke(); }
  g.fillStyle = 'rgba(240,245,255,0.9)'; g.beginPath(); g.ellipse(x + 158, y - 92, 74, 6, 0, Math.PI, 0); g.fill(); // snow on top
  // cab
  const cabG = g.createLinearGradient(0, y - 104, 0, y - 34);
  cabG.addColorStop(0, '#ffb938'); cabG.addColorStop(1, '#c97508');
  g.fillStyle = cabG; g.beginPath(); g.moveTo(x + 4, y - 36); g.lineTo(x + 6, y - 70); g.lineTo(x + 20, y - 102); g.lineTo(x + 76, y - 102); g.lineTo(x + 78, y - 36); g.closePath(); g.fill();
  const win = g.createLinearGradient(x + 22, y - 98, x + 60, y - 70); // window with a reflection
  win.addColorStop(0, '#2b3e5e'); win.addColorStop(0.5, '#4b6688'); win.addColorStop(1, '#1b2740');
  g.fillStyle = win; g.beginPath(); g.moveTo(x + 14, y - 72); g.lineTo(x + 24, y - 96); g.lineTo(x + 68, y - 96); g.lineTo(x + 68, y - 72); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(x + 30, y - 96); g.lineTo(x + 40, y - 96); g.lineTo(x + 30, y - 74); g.lineTo(x + 22, y - 74); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(80,40,0,0.5)'; g.beginPath(); g.moveTo(x + 44, y - 70); g.lineTo(x + 44, y - 40); g.stroke(); // door
  g.fillStyle = 'rgba(240,245,255,0.95)'; g.fillRect(x + 20, y - 106, 56, 4); // snow on the roof
  // amber beacon, flashing
  const on = (Math.sin(t * 9) + 1) / 2;
  g.fillStyle = '#7a4a00'; g.fillRect(x + 42, y - 110, 10, 6);
  g.fillStyle = `rgba(255,${150 + 60 * on},0,1)`; g.beginPath(); g.arc(x + 47, y - 112, 4, Math.PI, 0); g.fill();
  g.globalCompositeOperation = 'lighter';
  const bg = g.createRadialGradient(x + 47, y - 112, 0, x + 47, y - 112, 60);
  bg.addColorStop(0, `rgba(255,160,0,${0.55 * on})`); bg.addColorStop(1, 'rgba(255,140,0,0)');
  g.fillStyle = bg; g.fillRect(x - 13, y - 172, 120, 120);
  // headlight
  const hl = g.createRadialGradient(x + 8, y - 46, 0, x + 8, y - 46, 16);
  hl.addColorStop(0, 'rgba(255,250,225,0.95)'); hl.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = hl; g.fillRect(x - 8, y - 62, 32, 32);
  g.globalCompositeOperation = 'source-over';
  // exhaust stack
  g.fillStyle = '#3a3c42'; g.fillRect(x + 76, y - 114, 5, 40);
  // wheels (spinning)
  for (const wx of [x + 42, x + 164, x + 208]) {
    g.fillStyle = '#18181c'; g.beginPath(); g.arc(wx, y - 16, 17, 0, 7); g.fill();
    g.fillStyle = '#6d7480'; g.beginPath(); g.arc(wx, y - 16, 8, 0, 7); g.fill();
    g.strokeStyle = '#3c4048'; g.lineWidth = 2;
    for (let k = 0; k < 5; k++) { const a = -x / 17 + (k / 5) * Math.PI * 2; g.beginPath(); g.moveTo(wx, y - 16); g.lineTo(wx + Math.cos(a) * 7, y - 16 + Math.sin(a) * 7); g.stroke(); }
    g.fillStyle = 'rgba(235,240,250,0.8)'; g.beginPath(); g.ellipse(wx, y - 3, 15, 3, 0, 0, 7); g.fill(); // snow on the tyre
  }
  // the plow blade (curved steel) with the snow it's pushing
  g.fillStyle = '#2a2d33'; g.fillRect(x - 10, y - 30, 16, 6); // arm
  const bl = g.createLinearGradient(x - 34, 0, x - 12, 0);
  bl.addColorStop(0, '#c3cad3'); bl.addColorStop(0.5, '#7d8590'); bl.addColorStop(1, '#4b5159');
  g.fillStyle = bl; g.beginPath(); g.moveTo(x - 14, y - 48); g.quadraticCurveTo(x - 40, y - 30, x - 30, y - 2); g.lineTo(x - 18, y - 2); g.quadraticCurveTo(x - 26, y - 28, x - 6, y - 44); g.closePath(); g.fill();
  if (plow.load > 0.5) { // snow piling against the blade
    const L = plow.load;
    const sg = g.createRadialGradient(x - 36, y - L * 0.6, 1, x - 36, y - L * 0.4, L * 1.6 + 6);
    sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, '#bccbe4');
    g.fillStyle = sg; g.beginPath(); g.ellipse(x - 36 - L * 0.3, y - L * 0.45, L * 1.1 + 6, L * 0.75 + 4, 0, Math.PI, 0); g.lineTo(x - 18, y); g.lineTo(x - 50 - L, y); g.fill();
  }
  g.restore();
}

// ---------------- drawing drifts ----------------
const SHOW = 2.6; // thinner than this isn't drawn (no white lines on bare windows)
function drawDrift(x0, y0, arr, shake = 0, corner = 0, baseFn = null, ownPal = null, tex = null) {
  const n = arr.length;
  const jx = shake ? Math.sin(performance.now() / 18) * 3 * shake : 0;
  const width = (n - 1) * COL;
  // where the window's top edge is at x (it curves down over the rounded corners)
  const base = (dx) => {
    if (baseFn) return baseFn(x0 + dx);
    if (!corner) return y0;
    const e = Math.min(dx, width - dx);
    if (e >= corner) return y0;
    const t = corner - Math.max(0, e);
    return y0 + corner - Math.sqrt(Math.max(0, corner * corner - t * t));
  };
  const P0 = desk.scene === 'cabin' ? NIGHT : DAY;
  let P = P0;
  const shade = (yb) => {
    const gr = g.createLinearGradient(0, yb - MAXH, 0, yb);
    gr.addColorStop(0, P.hi); gr.addColorStop(0.7, P.mid); gr.addColorStop(1, P.lo);
    return gr;
  };
  let i = 0;
  while (i < n) {
    while (i < n && arr[i] < SHOW) i++;
    if (i >= n) break;
    const start = i;
    while (i < n && arr[i] >= SHOW) i++;
    const end = i - 1;
    if (end - start < 2) continue;
    g.beginPath();
    let px = x0 + start * COL + jx, py = base(start * COL);
    g.moveTo(px, py);
    for (let k = start; k <= end; k++) {
      const dx = k * COL, x = x0 + dx + jx;
      const y = base(dx) - (arr[k] - SHOW * 0.7);
      g.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
      px = x; py = y;
    }
    g.quadraticCurveTo(px, py, px + 2, base(end * COL));
    // back along the window's edge
    for (let k = end; k >= start; k -= 2) g.lineTo(x0 + k * COL + jx, base(k * COL) + 0.5);
    g.closePath();
    P = ownPal ?? (baseFn && desk.scene === 'cabin' ? palAt(x0 + ((start + end) / 2) * COL, base(((start + end) / 2) * COL)) : P0); // the surface's own snow colours
    if (tex) {
      // painted from the photo's real snow, pixel for pixel: each column's top shows the snow at the real edge,
      // and deeper down the snow from further down (so it carries on the photo's own gradients)
      g.save();
      g.shadowColor = P.shadow; g.shadowBlur = 5; g.shadowOffsetY = 1;
      g.fillStyle = P.mid; g.fill(); // (just for the soft shadow under it)
      g.shadowColor = 'transparent';
      g.clip();
      for (let k = start; k <= end; k++) {
        const dx = k * COL, top = base(dx) - (arr[k] - SHOW * 0.7) - 2, depth = Math.max(1, base(dx) - top + 2);
        g.drawImage(tex, Math.min(tex.width - COL, Math.max(0, dx)), 0, COL, Math.min(tex.height, depth), x0 + dx + jx - 0.5, top, COL + 1, depth);
      }
      g.restore();
      continue;
    }
    g.fillStyle = shade(Math.max(base(start * COL), base(end * COL)));
    g.shadowColor = P.shadow; g.shadowBlur = 5; g.shadowOffsetY = 1;
    g.fill();
    g.shadowColor = 'transparent';
  }
}

// ---------------- the loop ----------------
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const minDt = cfg.saver ? 1000 / 30 : 0;
  if (now - last < minDt - 1) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  g.clearRect(0, 0, W, H);
  if (cfg.mode === 'off') return;

  // flakes: keep the right number, unless the wind just cleared them
  const target = now < calmUntil ? 0 : flakeTarget();
  while (flakes.length < target) flakes.push(newFlake(flakes.length > target * 0.5 ? true : !flakes.length || Math.random() < 0.02));
  if (flakes.length > target) flakes.length = Math.max(target, flakes.length - 4);
  const gust = now < blizzardUntil ? Math.sin(now / 900) * 120 + 80 : 0;
  for (let i = flakes.length - 1; i >= 0; i--) {
    const f = flakes[i];
    const prevY = f.y;
    if (f.blown) { f.x += 2400 * dt; f.y += (rand(-60, 60) - 20) * dt; if (f.x > W + 50) flakes.splice(i, 1); continue; }
    f.y += f.vy * dt * (now < blizzardUntil ? 1.6 : 1);
    const wind = windAt(Date.now() / 1000); // the same wind as the trees
    f.x += (Math.sin(now / 1000 * f.spin + f.ph) * f.sway + gust * f.z + wind * (14 + 46 * f.z)) * dt;
    if (landFlake(f, prevY) || f.y > H + 10) flakes[i] = newFlake(true);
  }

  // drifts settle; back to front so windows in front hide the snow of the ones behind
  for (const p of piles.values()) { settle(p.h, pileCap(p)); p.shake = Math.max(0, p.shake - dt); }
  settle(ground, groundCap);
  maybeSnowman(now);
  for (const s of snowmen) s.step(dt, now);
  snowmen = snowmen.filter((s) => !s.dead);
  for (const b of balls) stepBall(b, dt);
  balls = balls.filter((b) => !b.dead);
  stepWind(dt);

  // the desktop layer (scene, widgets): drifts, snowmen and snowballs there, hidden behind every window
  const deskList = deskPiles();
  const onDeskLayer = (b) => b.rest && (b.on?.desk || b.on?.on?.desk || b.on?.field || b.on?.on?.field || b.on?.on?.on?.field);
  if (deskList.length || desk.scene) {
    drawTrails(now);
    for (const p of deskList) drawDrift(p.x, null, p.h, p.shake, p.corner ?? 0, p.base, p.photoSurface ? surfacePal(p.photoSurface) : null, p.photoSurface ? surfaceTexture(p) : null);
    // snowmen and snowballs standing on the desktop, back to front (further up the screen = further away)
    const things = [...snowmen.filter((s) => (s.on === 'field' || isDesk({ id: s.on ?? '' })) && !s.fall).map((s) => [s.base()?.y ?? 0, () => s.draw(g)]),
      ...balls.filter(onDeskLayer).map((b) => [b.y + b.r, () => drawBall(b)])].sort((a, b) => a[0] - b[0]);
    for (const [, d] of things) d();
    if (desk.scene === 'cabin') warmLight(now);
    for (const w of wins) g.clearRect(w.x, w.y, w.w, w.h);
  }
  // ground along the bottom (behind everything)
  drawDrift(0, groundBase(), ground);
  { const dk = wins.find((w) => w.dock); if (dk) g.clearRect(dk.x, dk.y, dk.w, H - dk.y); }
  for (const s of snowmen) if (!s.on) s.draw(g);
  if (cfg.mode === 'on' && cfg.fx.piles) {
    for (let i = wins.length - 1; i >= 0; i--) {
      const w = wins[i];
      const p = piles.get(w.id);
      if (p) drawDrift(p.x, p.y, p.h, p.shake, w.dock ? 0 : CORNER);
      for (const s of snowmen) if (s.on === w.id) s.draw(g);
      for (const b of balls) if (b.rest && b.on && (b.on.id === w.id || b.on.on?.id === w.id)) drawBall(b);
      // windows in front hide what's behind them
      for (let j = 0; j < i; j++) g.clearRect(wins[j].x, wins[j].y, wins[j].w, wins[j].h);
    }
  }
  // flying snowmen (knocked off) and free snowballs
  for (const s of snowmen) if (s.fall) s.draw(g);
  for (const b of balls) if (!(b.rest && b.on && (b.on.id || b.on.on?.id || b.on.on?.on?.id))) drawBall(b);

  // clumps and puffs
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.vy += G * 0.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0 || p.y > H + 10) { parts.splice(i, 1); continue; }
    g.globalAlpha = clamp(p.life, 0, 1);
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
  }
  g.globalAlpha = 1;

  // falling flakes on top
  for (const f of flakes) {
    // near flakes are big, soft and see-through (out of focus); far ones small and faint
    const near = f.z > 0.8;
    const s = f.r * (near ? 4.2 : 2.6);
    g.globalAlpha = near ? 0.38 : 0.3 + f.z * 0.55;
    g.drawImage(flakeSprite, f.x - s / 2, f.y - s / 2, s, s);
  }
  g.globalAlpha = 1;
  drawSleigh(dt);
  stepPlow(dt);
  drawPlow();
  drawWind();
  // "desktop only": no snow in front of your windows
  if (cfg.mode === 'desktop') for (const w of wins) g.clearRect(w.x, w.y, w.w, w.h);
}
function drawBall(b) {
  if (b.rest) softShadow(g, b.x + b.r * 0.2, b.y + b.r * 0.85, b.r * 1.25, b.r * 0.3);
  snowSphere(g, b.x, b.y, b.r, b.seed ??= Math.random() * 10, 0, palAt(b.x, b.y)); // lit by the light where it is
}
/** A packed-snow ball: lumpy outline, lit from the upper left, bluish in the shade, with grain. */
function snowSphere(gc, x, y, r, seed = 1, aoFrom = 0, P = pal()) {
  if (r <= 0.5) return;
  gc.save();
  gc.beginPath();
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2, rr = r * (1 + 0.04 * Math.sin(a * 3 + seed) + 0.025 * Math.sin(a * 7 + seed * 2) + 0.018 * Math.sin(a * 13 + seed * 3)); // packed by hand: lumpy
    i ? gc.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : gc.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  gc.closePath();
  const gr = gc.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.05, x - r * 0.1, y - r * 0.1, r * 1.18);
  gr.addColorStop(0, P.hi); gr.addColorStop(0.45, P.mid); gr.addColorStop(0.82, P.shade); gr.addColorStop(1, P.deep);
  gc.fillStyle = gr; gc.fill();
  gc.clip();
  // the packed-snow surface: lumps, pits and sparkles, sized to the ball (a different patch for each ball)
  const tile = Math.min(256, Math.max(48, r * 3.2)), sxo = (seed * 37) % (256 - tile), syo = (seed * 53) % (256 - tile);
  gc.globalCompositeOperation = 'multiply'; gc.globalAlpha = 1; // shadows between the clumps and in the pits
  gc.drawImage(SNOW_MUL, sxo, syo, tile, tile, x - r * 1.05, y - r * 1.05, r * 2.1, r * 2.1);
  gc.globalAlpha = 0.55; // finer packed grains
  gc.drawImage(SNOW_MUL, (sxo + 64) % (256 - tile), (syo + 96) % (256 - tile), tile * 0.45, tile * 0.45, x - r * 1.05, y - r * 1.05, r * 2.1, r * 2.1);
  gc.globalCompositeOperation = 'soft-light'; gc.globalAlpha = 0.6; // lump tops catch a little light
  gc.drawImage(SNOW_TEX, sxo, syo, tile, tile, x - r * 1.05, y - r * 1.05, r * 2.1, r * 2.1);
  gc.globalCompositeOperation = 'source-over';
  // ice crystals glinting (more on the lit side)
  const rnd = (k) => { const v = Math.sin(seed * 91.7 + k * 12.9898) * 43758.5453; return v - Math.floor(v); };
  gc.fillStyle = 'rgba(255,255,255,0.85)';
  for (let k = 0, n = Math.round(r * 0.9); k < n; k++) {
    const a = rnd(k) * Math.PI * 2, d = Math.sqrt(rnd(k + 50)) * r * 0.92, gx = x + Math.cos(a) * d, gy = y + Math.sin(a) * d;
    if ((gx - x) * -0.6 + (gy - y) * -0.8 < -r * 0.2 && rnd(k + 99) < 0.6) continue; // fewer on the shadow side
    gc.globalAlpha = 0.35 + rnd(k + 7) * 0.6; gc.fillRect(gx, gy, 0.9, 0.9);
  }
  // shade the texture with the ball's roundness again (so the lumps sit on a sphere, not a flat disc)
  const rim = gc.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.3, x, y, r * 1.05);
  rim.addColorStop(0, 'rgba(255,255,255,0)'); rim.addColorStop(0.75, 'rgba(10,20,45,0.05)'); rim.addColorStop(1, 'rgba(10,20,45,0.32)');
  gc.globalAlpha = 1; gc.fillStyle = rim; gc.fillRect(x - r, y - r, r * 2, r * 2);
  if (aoFrom > 0) { // the ball sitting on top shades this one
    const ao = gc.createRadialGradient(x, y - r, 0, x, y - r, aoFrom * 1.25);
    ao.addColorStop(0, 'rgba(30,45,80,0.55)'); ao.addColorStop(1, 'rgba(30,45,80,0)');
    gc.globalAlpha = 1; gc.fillStyle = ao; gc.fillRect(x - r, y - r - aoFrom, r * 2, aoFrom * 2.4);
  }
  gc.restore();
}
function softShadow(gc, x, y, rx, ry) {
  gc.save();
  const sh = gc.createRadialGradient(x, y, 0, x, y, rx);
  sh.addColorStop(0, desk.scene === 'cabin' ? 'rgba(5,12,35,0.5)' : 'rgba(30,45,80,0.28)'); sh.addColorStop(1, 'rgba(5,12,35,0)');
  gc.fillStyle = sh;
  gc.beginPath(); gc.ellipse(x, y, rx, ry, 0, 0, 7); gc.fill();
  gc.restore();
}
/** Tracks of packed snow where snowballs were rolled on the photo's ground (they fade after a minute). */
function drawTrails(now) {
  trails = trails.filter((t) => now - t.t < 90000);
  for (const t of trails) {
    if (t.pts.length < 2) continue;
    const fade = 1 - (now - t.t) / 90000;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [w, col] of [[0.7, `rgba(15,25,55,${0.16 * fade})`], [0.42, `rgba(120,140,185,${0.12 * fade})`]]) { // pressed snow: a soft dent with a lighter middle
      g.strokeStyle = col;
      g.beginPath();
      t.pts.forEach(([x, y, r], i) => { g.lineWidth = Math.max(2, r * w); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    }
    g.restore();
  }
}
/** The fire and the lamps light up the snow near them (only the snow: drawn 'source-atop'). */
function warmLight(now) {
  const t = now / 1000;
  g.save(); g.globalCompositeOperation = 'source-atop';
  const glow = (x, y, R, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, `rgba(255,170,80,${a})`); gr.addColorStop(1, 'rgba(255,150,60,0)'); g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2); };
  const [fx, fy] = cover.pt([CABIN_FIRE.x, CABIN_FIRE.y - 20]);
  glow(fx, fy, 230 * cover.s, 0.16 * (0.75 + 0.25 * Math.sin(t * 11.3) * Math.sin(t * 7.1))); // the fire's flicker on the snow
  g.restore();
}
requestAnimationFrame(frame);
