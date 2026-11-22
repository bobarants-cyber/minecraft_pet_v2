// ❄️ Bbokari's snow (all drawn here, no images): flakes, drifts on windows and along the bottom, snowmen, snowballs,
// wind and a sleigh. Window rectangles come from the helper, front to back.
const host = window.snowHost;
const cv = document.getElementById('c');
const g = cv.getContext('2d');

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
const pileTop = (p, x) => p.y - (p.h[clamp(Math.round((x - p.x) / COL), 0, p.h.length - 1)] || 0);
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
const pileCap = (p) => (i) => MAXH * Math.min(1, (i + 1) / 5, (p.h.length - i) / 5) * p.capK;
const groundCap = () => 22;

function burst(x, y, n, vx = 0, vy = -120, spread = 160) {
  for (let i = 0; i < n && parts.length < 1500; i++) parts.push({ x: x + rand(-4, 4), y: y + rand(-3, 3), vx: vx + rand(-spread, spread), vy: vy + rand(-spread, spread * 0.4), r: rand(1, 2.6), life: rand(0.8, 1.6) });
}

// ---------------- windows from the helper ----------------
host.onWins(({ w, f }) => {
  const now = performance.now();
  const next = w.map(([id, x, y, ww, hh]) => ({ id, x, y, w: ww, h: hh }));
  const seen = new Set();
  for (const win of next) {
    seen.add(win.id);
    let p = piles.get(win.id);
    const n = Math.max(2, Math.ceil(win.w / COL));
    if (!p) { p = { id: win.id, x: win.x, y: win.y, w: win.w, h: new Float32Array(n), t: now, shake: 0, capK: rand(0.7, 1.05) }; piles.set(win.id, p); continue; }
    const dt = Math.max(0.008, (now - p.t) / 1000);
    const vx = (win.x - p.x) / dt, vy = (win.y - p.y) / dt;
    const speed = Math.hypot(vx, vy);
    if (speed > 1600) { // flung: the snow bursts loose
      for (let i = 0; i < p.h.length; i += 2) if (p.h[i] > 1) burst(p.x + i * COL, p.y - p.h[i] / 2, Math.ceil(p.h[i] / 5), vx * 0.35, vy * 0.35 - 150, 120);
      p.h.fill(0);
      for (const s of snowmen) if (s.on === p.id) s.knock(vx * 0.35, vy * 0.35 - 300);
    }
    if (n !== p.h.length) { const old = p.h; p.h = new Float32Array(n); for (let i = 0; i < n; i++) p.h[i] = old[Math.floor((i * old.length) / n)] || 0; }
    p.x = win.x; p.y = win.y; p.w = win.w; p.t = now;
  }
  for (const [id, p] of piles) if (!seen.has(id)) { // closed (or minimised): everything on top falls
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
  for (const b of balls) if (b.rest && Math.hypot(b.x - x, b.y - y) < b.r + 6) return { ball: b };
  if (!cfg.fx.piles || cfg.mode !== 'on') return null;
  for (let i = 0; i < wins.length; i++) {
    const p = piles.get(wins[i].id);
    if (!p || x < p.x || x > p.x + p.w) continue;
    const top = pileTop(p, x);
    if (p.y - top > 4 && y >= top - 6 && y <= p.y + 2 && !covered(x, y, i)) return { pile: p };
    if (x >= wins[i].x && x <= wins[i].x + wins[i].w && y >= wins[i].y && y <= wins[i].y + wins[i].h) return null; // on the window itself
  }
  if (ground[Math.round(x / COL)] > 4 && y >= groundTop(x) - 6 && !insideAnyWindow(x, y)) return { ground: true };
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
  const z = Math.random(); // 0 far … 1 near
  return { x: rand(-40, W + 40), y: top ? rand(-60, -5) : rand(0, H), z, r: 1 + z * 2.6, vy: 35 + z * 70, ph: rand(0, 6.28), sway: rand(8, 26) };
}

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
        addTo(p.h, Math.round((f.x - p.x) / COL), 0.8 + f.r * 0.45, pileCap(p));
        return true;
      }
      if (f.y > w.y && f.y < w.y + w.h) return false; // falling in front of this window
    }
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
        if (b.vy > 900 || b.thrown && Math.abs(b.vx) > 700) { splat(b.x, top, 8 + b.r); b.dead = true; return; }
        b.rest = true; b.on = p; b.vx = b.vy = 0; b.y = top - b.r * 0.8;
        return;
      }
    }
  }
  if (b.y + b.r * 0.8 >= groundTop(b.x)) {
    if (b.vy > 900 || b.thrown) { splat(b.x, groundTop(b.x), 8 + b.r); b.dead = true; return; }
    b.rest = true; b.on = null; b.vx = b.vy = 0; b.y = groundTop(b.x) - b.r * 0.8;
  }
  if (b.x < -100 || b.x > W + 100 || b.y > H + 100) b.dead = true;
}

function buildFromStack(top) {
  const mid = top.on, base = mid.on;
  const at = base.on && base.on.h ? base.on.id : null;
  for (const b of [top, mid, base]) b.dead = true;
  const s = new Snowman(at, at ? base.x - piles.get(at).x : base.x, true);
  snowmen.push(s);
}

// ---------------- snowmen ----------------
class Snowman {
  constructor(on, rx, instant = false) {
    this.on = on; // window id, or null for the bottom of the screen
    this.rx = rx; // x relative to the window (or the screen)
    this.state = 'build'; this.t = instant ? 1.6 : 0;
    this.k = rand(1.25, 1.5); // size
    this.hat = { on: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, dropAt: instant ? 0 : 2.2 };
    this.wobble = 0; this.wave = 0; this.cool = rand(4, 9);
    this.fall = null; this.dir = Math.random() < 0.5 ? -1 : 1;
  }
  base() {
    if (this.fall) return this.fall;
    if (this.on) { const p = piles.get(this.on); if (!p) return null; const x = p.x + this.rx; return { x, y: pileTop(p, x) + 4 }; }
    return { x: this.rx, y: groundTop(this.rx) + 3 };
  }
  headPos() { const b = this.base() ?? { x: -999, y: -999 }; return { x: b.x, y: b.y - 55 * this.k }; }
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
    const b = this.base();
    if (!b) return;
    const k = this.k;
    const grow = this.state === 'build' ? this.t : 9;
    const r1 = 16 * k * clamp(grow / 0.5, 0, 1), r2 = 11 * k * clamp((grow - 0.5) / 0.5, 0, 1), r3 = 8 * k * clamp((grow - 1) / 0.5, 0, 1);
    const tilt = Math.sin(this.t * 18) * 0.12 * this.wobble + (this.fall ? this.t * 4 : 0);
    gc.save();
    gc.translate(b.x, b.y);
    gc.rotate(tilt);
    const ball = (y, r) => {
      if (r <= 0.5) return;
      const gr = gc.createRadialGradient(-r * 0.35, y - r * 0.4, r * 0.1, 0, y, r);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.7, '#eef3fb'); gr.addColorStop(1, '#c9d5e8');
      gc.fillStyle = gr; gc.beginPath(); gc.arc(0, y, r, 0, Math.PI * 2); gc.fill();
    };
    const y1 = -r1, y2 = -r1 * 2 - r2 + 4 * k, y3 = y2 - r2 - r3 + 3 * k;
    ball(y1, r1); ball(y2, r2);
    // arms (sticks): one waves
    if (grow > 1.2) {
      gc.strokeStyle = '#6b4a2b'; gc.lineWidth = 2 * k; gc.lineCap = 'round';
      const wave = this.wave > 0 ? Math.sin(this.t * 14) * 0.5 : 0;
      for (const side of [-1, 1]) {
        const up = side === this.dir ? -0.6 + wave - (this.angry ? 0.5 : 0) : 0.35;
        const sx = side * r2 * 0.8, sy = y2;
        const ex = sx + side * 18 * k * Math.cos(up), ey = sy + 18 * k * Math.sin(up) - 4 * k;
        gc.beginPath(); gc.moveTo(sx, sy); gc.lineTo(ex, ey);
        gc.moveTo(sx + (ex - sx) * 0.7, sy + (ey - sy) * 0.7); gc.lineTo(ex + side * 3 * k, ey - 5 * k); gc.stroke();
      }
      // buttons
      gc.fillStyle = '#26262b';
      for (const yy of [y2 - 3 * k, y2 + 4 * k, y1 - 6 * k]) { gc.beginPath(); gc.arc(0, yy, 1.5 * k, 0, 7); gc.fill(); }
    }
    ball(y3, r3);
    if (grow > 1.5) {
      // eyes follow the pointer
      const hx = b.x, hy = b.y + y3;
      const a = Math.atan2(cursor.y - hy, cursor.x - hx);
      const px = Math.cos(a) * 1.3 * k, py = Math.sin(a) * 1.3 * k;
      gc.fillStyle = '#1d1d22';
      for (const ex of [-3 * k, 3 * k]) { gc.beginPath(); gc.arc(ex + px, y3 - 2 * k + py, 1.6 * k, 0, 7); gc.fill(); }
      if (this.angry) { gc.strokeStyle = '#1d1d22'; gc.lineWidth = 1.4 * k; gc.beginPath(); gc.moveTo(-5 * k, y3 - 6 * k); gc.lineTo(-1 * k, y3 - 4.5 * k); gc.moveTo(5 * k, y3 - 6 * k); gc.lineTo(1 * k, y3 - 4.5 * k); gc.stroke(); }
      // carrot nose, pointing your way
      gc.fillStyle = '#ff8a1f';
      gc.beginPath(); gc.moveTo(0, y3); gc.lineTo(this.dir * 10 * k, y3 + 1.5 * k); gc.lineTo(0, y3 + 3 * k); gc.closePath(); gc.fill();
      // mouth
      gc.fillStyle = '#2a2a30';
      for (let i = -2; i <= 2; i++) { gc.beginPath(); gc.arc(i * 1.8 * k, y3 + 5 * k + Math.abs(i) * -0.6 * k, 0.8 * k, 0, 7); gc.fill(); }
    }
    if (grow > 1.9) { // scarf
      gc.fillStyle = '#e0303a';
      gc.beginPath(); gc.ellipse(0, y3 + r3 - 1 * k, r3 * 1.05, 3.2 * k, 0, 0, 7); gc.fill();
      gc.fillRect(-this.dir * 4 * k - 2.5 * k, y3 + r3, 5 * k, 11 * k + Math.sin(this.t * 3) * 1.5);
      gc.fillStyle = '#b81f2a'; gc.fillRect(-this.dir * 4 * k - 2.5 * k, y3 + r3 + 8 * k, 5 * k, 1.5 * k);
    }
    if (this.hat.on) drawHat(gc, 0, y3 - r3 + 2 * k, k, 0);
    gc.restore();
    if (!this.hat.on && (this.hat.back || this.hat.dropAt) && this.hat.y) drawHat(gc, this.hat.x, this.hat.y, k, this.hat.rot);
  }
}
function drawHat(gc, x, y, k, rot) {
  gc.save(); gc.translate(x, y); gc.rotate(rot);
  gc.fillStyle = '#18181c';
  gc.fillRect(-10 * k, -2 * k, 20 * k, 3 * k); // brim
  gc.fillRect(-6.5 * k, -15 * k, 13 * k, 13 * k); // top
  gc.fillStyle = '#e0303a'; gc.fillRect(-6.5 * k, -5 * k, 13 * k, 2.5 * k); // band
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

// ---------------- drawing drifts ----------------
function drawDrift(x0, y0, arr, shake = 0) {
  const n = arr.length;
  const jx = shake ? Math.sin(performance.now() / 18) * 3 * shake : 0;
  g.beginPath();
  g.moveTo(x0 - 3 + jx, y0 + 1);
  let prevX = x0 - 3, prevY = y0 - Math.max(0, arr[0] - 1);
  g.lineTo(prevX + jx, prevY);
  for (let i = 1; i < n; i++) {
    const x = x0 + i * COL, y = y0 - arr[i];
    g.quadraticCurveTo(prevX + jx, prevY, (prevX + x) / 2 + jx, (prevY + y) / 2);
    prevX = x; prevY = y;
  }
  g.lineTo(x0 + (n - 1) * COL + 3 + jx, y0 - Math.max(0, arr[n - 1] - 1));
  g.lineTo(x0 + (n - 1) * COL + 3 + jx, y0 + 1);
  g.closePath();
  const gr = g.createLinearGradient(0, y0 - MAXH, 0, y0 + 2);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.75, '#f3f7fd'); gr.addColorStop(1, '#cfdcee');
  g.fillStyle = gr;
  g.shadowColor = 'rgba(40,60,100,0.25)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
  g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1; g.stroke();
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
    f.x += (Math.sin(now / 1000 + f.ph) * f.sway + gust * f.z) * dt;
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

  // ground along the bottom (behind everything)
  drawDrift(0, groundBase(), ground);
  for (const s of snowmen) if (!s.on) s.draw(g);
  if (cfg.mode === 'on' && cfg.fx.piles) {
    for (let i = wins.length - 1; i >= 0; i--) {
      const w = wins[i];
      const p = piles.get(w.id);
      if (p) drawDrift(p.x, p.y, p.h, p.shake);
      for (const s of snowmen) if (s.on === w.id) s.draw(g);
      for (const b of balls) if (b.rest && b.on && (b.on.id === w.id || b.on.on?.id === w.id)) drawBall(b);
      // windows in front hide what's behind them
      for (let j = 0; j < i; j++) g.clearRect(wins[j].x, wins[j].y, wins[j].w, wins[j].h);
    }
  }
  // flying snowmen (knocked off) and free snowballs
  for (const s of snowmen) if (s.fall) s.draw(g);
  for (const b of balls) if (!(b.rest && b.on && (b.on.id || b.on.on?.id))) drawBall(b);

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
    const s = f.r * 2.6;
    g.globalAlpha = 0.45 + f.z * 0.5;
    g.drawImage(flakeSprite, f.x - s / 2, f.y - s / 2, s, s);
  }
  g.globalAlpha = 1;
  drawSleigh(dt);
  drawWind();
  // "desktop only": no snow in front of your windows
  if (cfg.mode === 'desktop') for (const w of wins) g.clearRect(w.x, w.y, w.w, w.h);
}
function drawBall(b) {
  const gr = g.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.1, b.x, b.y, b.r);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.75, '#eef3fb'); gr.addColorStop(1, '#c4d2e8');
  g.fillStyle = gr;
  g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7); g.fill();
}
requestAnimationFrame(frame);
