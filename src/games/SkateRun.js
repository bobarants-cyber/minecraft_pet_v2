import { PIXELS_PER_UNIT } from '../core/Stage.js';

/**
 * Gliddy's skate run (an endless runner, Subway Surfers style but side-on). Gliddy rides in place on his board while
 * the street scrolls past him: jump the cones and benches, duck under the low signs, land on rails to grind, hit the
 * ramps for big air, and pull tricks in the air. Collect the music notes (his story: he leaves melting notes behind).
 *
 * Keys (the pet window takes the keyboard while you play):
 *   Space / ↑ / W  ollie (jump)          ↓ / S  duck
 *   K kickflip   H heelflip   J pop shove-it   L 360 flip   G grab        Esc  stop
 * Click also jumps. Three hearts; a crash costs one.
 *
 * World units are "H" = Gliddy's height on screen, so it plays the same at any pet size. Obstacles live in a 2D
 * canvas over the 3D scene; Gliddy himself is the 3D pet, posed through mob.skate.
 */
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const GRAVITY = 9.5; // H per second²
const OLLIE = 3.7; // jump speed, H/s (apex ≈ 0.72 H)
const RAMP_POP = 5.0; // off a ramp (apex ≈ 1.3 H)
const START_SPEED = 2.3; // H/s
const MAX_SPEED = 5.2;
const HEARTS = 3;
const TRICKS = {
  kickflip: { key: 'k', name: 'KICKFLIP', time: 0.42, points: 100, flip: 1, shuv: 0 },
  heelflip: { key: 'h', name: 'HEELFLIP', time: 0.42, points: 100, flip: -1, shuv: 0 },
  shuv: { key: 'j', name: 'POP SHOVE-IT', time: 0.38, points: 80, flip: 0, shuv: 0.5 },
  tre: { key: 'l', name: '360 FLIP', time: 0.62, points: 250, flip: 1, shuv: 1 },
  grab: { key: 'g', name: 'INDY GRAB', time: 0.45, points: 120, flip: 0, shuv: 0, grab: true },
};
const BY_KEY = Object.fromEntries(Object.entries(TRICKS).map(([id, t]) => [t.key, id]));

export class SkateRun {
  constructor({ character, stage, settings, host, parent = document.body }) {
    this.character = character;
    this.stage = stage;
    this.settings = settings;
    this.host = host;
    this.active = false;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'skate';
    this.ctx = this.canvas.getContext('2d');
    parent.appendChild(this.canvas);

    this.hud = document.createElement('div');
    this.hud.className = 'skate-hud';
    this.hud.innerHTML = `
      <div class="skate-hud__row">
        <span class="skate-hud__hearts"></span>
        <span class="skate-hud__score"></span>
        <button type="button" class="skate-hud__btn skate-hud__again">Play again</button>
        <button type="button" class="skate-hud__btn skate-hud__quit" title="Stop playing (Esc)">✕</button>
      </div>
      <div class="skate-hud__msg"></div>
      <div class="skate-hud__keys">Space jump · ↓ duck · K kickflip · H heelflip · J shove-it · L 360 flip · G grab</div>
    `;
    this.heartsEl = this.hud.querySelector('.skate-hud__hearts');
    this.scoreEl = this.hud.querySelector('.skate-hud__score');
    this.msgEl = this.hud.querySelector('.skate-hud__msg');
    this.hud.querySelector('.skate-hud__quit').addEventListener('click', () => this.stop());
    this.hud.querySelector('.skate-hud__again').addEventListener('click', () => this.#newRun());
    parent.appendChild(this.hud);

    this.keys = new Set();
    window.addEventListener('keydown', (e) => this.#key(e, true));
    window.addEventListener('keyup', (e) => this.#key(e, false));
    window.addEventListener('pointerdown', (e) => {
      if (!this.active || this.hud.contains(e.target) || e.button !== 0) return;
      if (this.containsPoint(e.clientX, e.clientY)) this.#jump();
    });
    window.addEventListener('resize', () => this.#layout());
    try {
      this.best = Number(localStorage.getItem('skate.best')) || 0;
    } catch {
      this.best = 0;
    }
  }

  get isGliddy() {
    return this.settings.mob === 'gliddy';
  }

  start() {
    if (this.active) return;
    const c = this.character;
    this.active = true;
    this.canvas.classList.add('on');
    this.hud.classList.add('on');
    c.game = this;
    c.socialMode = true;
    c.loco.faceFront = true;
    c.restLift = 0;
    // The keyboard comes to the pet window while you play (and goes back when you stop).
    this.host?.setChatFocus?.(true);
    this.#layout();
    if (!this.isGliddy) {
      this.over = true;
      this.hud.classList.add('over', 'wrong');
      this.#say('This is Gliddy’s game 🛹 Pick Gliddy in ⚙️ Settings → Mob, then play!');
      this.#renderHud();
      return;
    }
    // Ride over to the left side of the screen, so the street has room to come at him.
    c.loco.walkTo(-(window.innerWidth / PIXELS_PER_UNIT) * 0.28);
    c.trigger('skate', {}, true);
    this.#newRun();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.canvas.classList.remove('on');
    this.hud.classList.remove('on', 'over', 'wrong');
    const c = this.character;
    if (c.mob) {
      c.mob.skate = null;
      c.mob.root.visible = true;
    }
    c.game = null;
    c.socialMode = false;
    c.loco.faceFront = false;
    c.attention = null;
    this.host?.setChatFocus?.(false);
    c.trigger('idle', {}, true);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  containsPoint(x, y) {
    if (!this.active || !this.L) return false;
    const r = this.hud.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    // The street catches clicks (a click jumps); everything above it stays click-through.
    return y >= this.L.floor - this.L.H * 1.5 && y <= this.L.floor + 30;
  }

  contains(node) {
    return this.hud.contains(node) || node === this.canvas;
  }

  // ---------- Setup ----------
  #layout() {
    const W = window.innerWidth;
    const Hw = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(Hw * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = this.character;
    const s = c.placement?.scale ?? 1;
    this.L = {
      W,
      Hw,
      H: (c.mob?.height ?? 1.3) * s * PIXELS_PER_UNIT, // Gliddy's height in px
      floor: Hw / 2 - (c.placement?.floorY ?? 0) * PIXELS_PER_UNIT,
      px: s * PIXELS_PER_UNIT, // px per model unit (for posing his jump)
    };
    this.hud.style.left = '14px';
    this.hud.style.top = `${Math.max(10, Math.round(this.L.floor - this.L.H * 2.1))}px`;
  }

  #newRun() {
    this.over = false;
    this.hud.classList.remove('over');
    this.t = 0;
    this.speed = START_SPEED;
    this.dist = 0;
    this.score = 0;
    this.combo = 0;
    this.hearts = HEARTS;
    this.y = 0; // feet height, H
    this.vy = 0;
    this.grind = null;
    this.trick = null;
    this.trickT = 0;
    this.airTricks = 0;
    this.hurt = 0;
    this.bail = 0;
    this.duck = 0;
    this.objects = [];
    this.popups = [];
    this.nextSpawn = 1.6;
    this.scroll = 0;
    this.#say('Go! Space to jump, ↓ to duck, K / H / J / L / G for tricks in the air');
    this.character.face.setExpression('happy');
    this.#renderHud();
  }

  // ---------- Input ----------
  #key(e, down) {
    if (!this.active) return;
    const k = e.key.toLowerCase();
    if (down && k === 'escape') return this.stop();
    if (!this.isGliddy) return;
    if ([' ', 'arrowup', 'arrowdown', 'w', 's'].includes(k) || BY_KEY[k]) e.preventDefault();
    if (down) {
      if (this.keys.has(k)) return; // key repeat
      this.keys.add(k);
      if (this.over && (k === ' ' || k === 'enter')) return this.#newRun();
      if (k === ' ' || k === 'arrowup' || k === 'w') this.#jump();
      if (BY_KEY[k]) this.#startTrick(BY_KEY[k]);
    } else this.keys.delete(k);
  }

  #jump() {
    if (this.over || this.bail > 0) return;
    if (this.y > 0.001 && !this.grind) return;
    this.grind = null;
    this.vy = OLLIE;
    this.y = Math.max(this.y, 0.001);
    this.airTricks = 0;
  }

  #startTrick(id) {
    if (this.over || this.trick || this.bail > 0) return;
    if (this.y <= 0.001 && !this.grind) return; // tricks are in the air (pop first)
    if (this.grind) this.#jump();
    this.trick = id;
    this.trickT = 0;
  }

  // ---------- The loop ----------
  update(dt) {
    if (!this.active) return;
    const c = this.character;
    dt = Math.min(dt, 1 / 20);
    this.#layout();
    if (!this.isGliddy || !c.mob) return this.#draw();
    if (c.stateName !== 'skate' && !['carried', 'drop'].includes(c.stateName)) c.trigger('skate', {}, true);
    if (!this.over) this.#step(dt);
    // Pose the 3D Gliddy from the game state.
    const T = this.trick ? TRICKS[this.trick] : null;
    const k = T ? clamp(this.trickT / T.time, 0, 1) : 0;
    c.mob.skate = {
      speed: this.over ? 0 : this.speed * 0.5,
      air: (this.y * this.L.H) / this.L.px,
      duck: this.duck,
      flip: T ? T.flip * k : 0,
      shuv: T ? T.shuv * k : 0,
      grab: T?.grab ? Math.sin(k * Math.PI) : 0,
      grinding: !!this.grind,
      bail: this.bail,
    };
    // Blink while he can't be hurt (just after a crash).
    c.mob.root.visible = this.hurt <= 0 || Math.floor(this.hurt * 10) % 2 === 0;
    this.#draw();
  }

  #step(dt) {
    this.t += dt;
    this.speed = Math.min(MAX_SPEED, START_SPEED + this.t * 0.045);
    const dx = this.speed * dt;
    this.dist += dx;
    this.scroll += dx;
    this.score += dx * 10;
    this.hurt = Math.max(0, this.hurt - dt);
    this.bail = this.bail > 0 ? Math.max(0, this.bail - dt * 1.6) : 0;
    const wantDuck = this.keys.has('arrowdown') || this.keys.has('s');
    this.duck += ((wantDuck && this.y <= 0.001 ? 1 : 0) - this.duck) * (1 - Math.exp(-18 * dt));

    // Gravity, grinding and landing.
    if (this.grind) {
      this.y = this.grind.h;
      this.score += dt * 200 * (1 + this.combo * 0.25);
      if (Math.random() < dt * 25) this.popups.push({ text: '✦', x: 0, y: this.grind.h, t: 0, small: true });
      if (this.grind.x + this.grind.w < -0.15) {
        this.grind = null;
        this.vy = 1.2;
      }
    } else if (this.y > 0 || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) this.#land(0);
    }
    if (this.trick) {
      this.trickT += dt;
      const T = TRICKS[this.trick];
      if (this.trickT >= T.time) this.#trickDone(T);
    }

    // Move the street, spawn new things.
    for (const o of this.objects) o.x -= dx;
    this.objects = this.objects.filter((o) => o.x + o.w > -1.5 && !o.gone);
    this.nextSpawn -= dx;
    if (this.nextSpawn <= 0) this.#spawn();

    // Collisions. Gliddy's box: x from −0.17 to 0.17 H around him, from his feet up to his head.
    const top = this.y + (this.duck > 0.5 ? 0.55 : 0.9);
    for (const o of this.objects) {
      if (o.x > 0.17 || o.x + o.w < -0.17) continue;
      if (o.kind === 'note') {
        if (this.y < o.h + 0.12 && top > o.h - 0.12) {
          o.gone = true;
          this.score += 50;
          this.popups.push({ text: '♪ +50', x: 0, y: o.h, t: 0 });
        }
        continue;
      }
      if (o.kind === 'ramp') {
        if (this.y <= 0.02 && this.vy <= 0 && !o.used) {
          o.used = true;
          this.vy = RAMP_POP;
          this.y = 0.02;
          this.airTricks = 0;
          this.popups.push({ text: 'BIG AIR!', x: 0, y: 0.9, t: 0 });
        }
        continue;
      }
      if (o.kind === 'rail' && !this.grind && this.vy <= 0 && this.y >= o.h - 0.08 && this.y <= o.h + 0.25) {
        this.grind = o;
        this.#land(o.h, true);
        continue;
      }
      if (this.grind === o) continue;
      const hit = o.kind === 'sign' ? top > o.h0 : this.y < o.h - 0.02;
      if (hit && this.hurt <= 0) this.#crash();
    }
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < (p.small ? 0.4 : 1.2));
    this.#renderHud();
  }

  #spawn() {
    const level = clamp(this.t / 60, 0, 1);
    const kinds = ['cone', 'cone', 'bench', 'rail', 'sign', 'ramp', 'notes'];
    if (level > 0.3) kinds.push('sign', 'bench', 'combo');
    const k = pick(kinds);
    const at = 3.2; // spawn just past the right edge of the screen, in H from Gliddy
    const edge = (this.L.W - this.#gliddyX()) / this.L.H + 0.3;
    const x = Math.max(at, edge);
    if (k === 'cone') this.objects.push({ kind: 'cone', x, w: 0.16, h: 0.24 });
    if (k === 'bench') this.objects.push({ kind: 'bench', x, w: 0.55, h: 0.3 });
    if (k === 'rail') this.objects.push({ kind: 'rail', x, w: rand(1.4, 2.4), h: 0.3 });
    if (k === 'sign') this.objects.push({ kind: 'sign', x, w: 0.35, h0: 0.62, h: 1.2 });
    if (k === 'ramp') {
      this.objects.push({ kind: 'ramp', x, w: 0.6, h: 0.26 });
      for (let i = 0; i < 4; i++) this.objects.push({ kind: 'note', x: x + 1.0 + i * 0.32, w: 0.12, h: 0.9 + Math.sin(i * 0.9) * 0.25 });
    }
    if (k === 'notes') for (let i = 0; i < 5; i++) this.objects.push({ kind: 'note', x: x + i * 0.3, w: 0.12, h: 0.25 + (i === 2 ? 0.45 : i % 2 ? 0.3 : 0) });
    if (k === 'combo') {
      this.objects.push({ kind: 'cone', x, w: 0.16, h: 0.24 });
      this.objects.push({ kind: 'sign', x: x + 1.5, w: 0.35, h0: 0.62, h: 1.2 });
    }
    // Room to react: more space when it's fast, a bit less as you get better.
    this.nextSpawn = rand(1.5, 2.6) + this.speed * 0.18 - level * 0.4;
  }

  #land(h, onRail = false) {
    this.y = h;
    this.vy = 0;
    if (this.trick) {
      // Landing mid-trick: sketchy, the combo's gone.
      const T = TRICKS[this.trick];
      if (this.trickT < T.time * 0.75) {
        this.popups.push({ text: 'SKETCHY!', x: 0, y: 0.8, t: 0, bad: true });
        this.combo = 0;
        this.character.face.setExpression('nervous');
      } else this.#trickDone(T);
      this.trick = null;
    }
    if (onRail) {
      this.popups.push({ text: '50-50 GRIND!', x: 0, y: h + 0.8, t: 0 });
      this.character.emote('sparkle', 0.5);
    } else if (this.airTricks > 0) this.character.face.setExpression(pick(['joy', 'excited', 'smug']));
    this.airTricks = 0;
  }

  #trickDone(T) {
    if (!this.trick) return;
    this.trick = null;
    this.combo += 1;
    this.airTricks += 1;
    const pts = Math.round(T.points * (1 + (this.combo - 1) * 0.5));
    this.score += pts;
    this.popups.push({ text: `${T.name}!  +${pts}${this.combo > 1 ? `  x${this.combo}` : ''}`, x: 0, y: this.y + 0.95, t: 0, big: true });
    this.character.emote(this.combo % 3 === 0 ? 'sparkle' : 'note', 0.5);
  }

  #crash() {
    this.hearts -= 1;
    this.combo = 0;
    this.trick = null;
    this.hurt = 1.4;
    this.bail = 1;
    this.grind = null;
    this.popups.push({ text: 'OUCH!', x: 0, y: 0.9, t: 0, bad: true });
    this.character.face.setExpression('surprised');
    this.character.emote('exclaim', 0.5);
    if (this.hearts <= 0) this.#gameOver();
  }

  #gameOver() {
    this.over = true;
    const s = Math.round(this.score);
    const record = s > this.best;
    if (record) {
      this.best = s;
      try {
        localStorage.setItem('skate.best', String(s));
      } catch {}
    }
    this.hud.classList.add('over');
    this.#say(record ? `New best: ${s}! 🛹✨ Press Space or Play again` : `Score ${s} (best ${this.best}). Press Space or Play again`);
    this.character.face.setExpression(record ? 'joy' : 'sad');
    if (record) this.character.emote('sparkle', 0.5);
    this.#renderHud();
  }

  // ---------- Drawing ----------
  #gliddyX() {
    return window.innerWidth / 2 + this.character.loco.x * PIXELS_PER_UNIT;
  }

  #say(t) {
    this.msgEl.textContent = t;
  }

  #renderHud() {
    this.heartsEl.textContent = '❤️'.repeat(Math.max(0, this.hearts ?? 0)) + '🤍'.repeat(Math.max(0, HEARTS - (this.hearts ?? 0)));
    const s = Math.round(this.score ?? 0);
    this.scoreEl.textContent = this.isGliddy ? `${s}${this.combo > 1 ? `  · combo x${this.combo}` : ''}  · best ${this.best}` : '';
  }

  #draw() {
    const { ctx } = this;
    const { W, Hw, H, floor } = this.L;
    ctx.clearRect(0, 0, W, Hw);
    if (!this.isGliddy) return;
    const gx = this.#gliddyX();
    const X = (u) => gx + u * H; // world (H from Gliddy) → screen x
    const Y = (h) => floor - h * H; // height (H) → screen y

    // The street: a soft dark strip with a moving kerb and lane dashes, and a faint city skyline sliding slower.
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#5b3fd1';
    const sky = (this.scroll * 0.25 * H) % (H * 1.8);
    for (let i = -1; i < W / (H * 0.6) + 2; i++) {
      const bx = i * H * 0.6 - (sky % (H * 0.6));
      const bh = H * (0.6 + 0.5 * Math.abs(Math.sin(i * 12.9898 + Math.floor(sky / (H * 0.6)))));
      ctx.fillRect(bx, floor - bh, H * 0.5, bh);
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(40, 36, 52, 0.55)';
    ctx.fillRect(0, floor - 2, W, 26);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    const dash = (this.scroll * H) % 60;
    for (let x = -dash; x < W; x += 60) ctx.fillRect(x, floor + 10, 30, 3);

    // Things on the street.
    for (const o of this.objects) {
      const x0 = X(o.x), x1 = X(o.x + o.w);
      if (x1 < -50 || x0 > W + 50) continue;
      if (o.kind === 'cone') {
        ctx.fillStyle = '#ff7a1a';
        ctx.beginPath();
        ctx.moveTo((x0 + x1) / 2, Y(o.h));
        ctx.lineTo(x1, Y(0));
        ctx.lineTo(x0, Y(0));
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(x0 + (x1 - x0) * 0.28, Y(o.h * 0.55), (x1 - x0) * 0.44, H * 0.035);
        ctx.fillStyle = '#ff7a1a';
        ctx.fillRect(x0 - 4, Y(0) - 4, x1 - x0 + 8, 5);
      } else if (o.kind === 'bench') {
        ctx.fillStyle = '#8a5a34';
        ctx.fillRect(x0, Y(o.h), x1 - x0, H * 0.06);
        ctx.fillStyle = '#3b3b44';
        ctx.fillRect(x0 + 4, Y(o.h), 6, o.h * H);
        ctx.fillRect(x1 - 10, Y(o.h), 6, o.h * H);
      } else if (o.kind === 'rail') {
        ctx.strokeStyle = this.grind === o ? '#ffe066' : '#c9ccd6';
        ctx.lineWidth = Math.max(4, H * 0.04);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, Y(o.h));
        ctx.lineTo(x1, Y(o.h));
        ctx.stroke();
        ctx.lineWidth = 4;
        for (const px of [x0 + 8, x1 - 8]) {
          ctx.beginPath();
          ctx.moveTo(px, Y(o.h));
          ctx.lineTo(px, Y(0));
          ctx.stroke();
        }
      } else if (o.kind === 'sign') {
        ctx.fillStyle = '#3b3b44';
        ctx.fillRect((x0 + x1) / 2 - 3, Y(o.h), 6, (o.h - o.h0) * H);
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(x0, Y(o.h0 + 0.2), x1 - x0, H * 0.2);
        ctx.fillStyle = '#2b2412';
        ctx.font = `800 ${Math.round(H * 0.11)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('DUCK!', (x0 + x1) / 2, Y(o.h0 + 0.06));
      } else if (o.kind === 'ramp') {
        ctx.fillStyle = '#6d7cff';
        ctx.beginPath();
        ctx.moveTo(x0, Y(0));
        ctx.quadraticCurveTo(x1 - (x1 - x0) * 0.2, Y(0), x1, Y(o.h));
        ctx.lineTo(x1, Y(0));
        ctx.closePath();
        ctx.fill();
      } else if (o.kind === 'note') {
        const bob = Math.sin(this.t * 5 + o.x * 3) * 0.03;
        ctx.fillStyle = '#ff5fa2';
        ctx.font = `700 ${Math.round(H * 0.2)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('♪', (x0 + x1) / 2, Y(o.h + bob) + H * 0.07);
      }
    }

    // Speed lines behind him when he's flying along.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const ly = Y(this.y + 0.2 + i * 0.18);
      const len = H * (0.25 + 0.1 * Math.sin(this.t * 9 + i));
      ctx.beginPath();
      ctx.moveTo(gx - H * 0.3, ly);
      ctx.lineTo(gx - H * 0.3 - len, ly);
      ctx.stroke();
    }

    // Trick names and points floating up.
    for (const p of this.popups) {
      const k = p.t / (p.small ? 0.4 : 1.2);
      ctx.globalAlpha = 1 - k;
      ctx.textAlign = 'center';
      ctx.font = `900 ${Math.round(H * (p.big ? 0.17 : p.small ? 0.1 : 0.13))}px system-ui, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(30, 20, 60, 0.85)';
      ctx.fillStyle = p.bad ? '#ff6b6b' : p.big ? '#ffe066' : '#ffffff';
      const ty = Y(p.y + k * 0.35);
      ctx.strokeText(p.text, gx, ty);
      ctx.fillText(p.text, gx, ty);
      ctx.globalAlpha = 1;
    }
  }
}
