import * as THREE from 'three';
import { PIXELS_PER_UNIT } from '../core/Stage.js';

/**
 * Ping pong against the pet. A small table sits at the bottom of the screen; the pet stands behind the far end
 * holding a paddle and moves to return the ball; your paddle at the near end follows the mouse.
 *
 * The ball lives in table coordinates: u ∈ [-1, 1] across, v ∈ [0, 1] from your end (0) to the pet's end (1).
 * It is drawn on a 2D canvas laid over the 3D scene, so the table also hides the pet's legs like a real table would.
 */
const WIN_SCORE = 7;
const TABLE_DEPTH_PX = 170;
const BOTTOM_PX = 26;
const FAR_RATIO = 0.62;
const PLAYER_REACH_PX = 40;
const PET_REACH_PX = 46;
const BASE_SPEED = 0.72; // table lengths per second
const MAX_SPEED = 1.55;
const ARC_PX = 46;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3();

function makePaddle(radius) {
  const g = new THREE.Group();
  g.name = 'paddle';
  const rubber = new THREE.MeshStandardMaterial({ color: 0xd8323c, roughness: 0.6 });
  const back = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: 0xc68a4a, roughness: 0.8 });
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, radius * 0.14, 28), [wood, rubber, back]);
  blade.rotation.x = Math.PI / 2; // face the camera
  blade.position.y = radius * 1.05;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.32, radius * 0.95, radius * 0.22), wood);
  handle.position.y = radius * 0.05;
  for (const m of [blade, handle]) m.castShadow = true;
  g.add(blade, handle);
  return g;
}

export class PingPong {
  constructor({ character, stage, settings, host, onEnd = () => {}, parent = document.body }) {
    this.character = character;
    this.stage = stage;
    this.settings = settings;
    this.host = host;
    this.onEnd = onEnd;
    this.active = false;
    this.mouseX = null;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pong';
    this.ctx = this.canvas.getContext('2d');
    parent.appendChild(this.canvas);

    this.hud = document.createElement('div');
    this.hud.className = 'pong-hud';
    this.hud.innerHTML = `
      <span class="pong-hud__score"></span>
      <button type="button" class="pong-hud__btn pong-hud__again">Play again</button>
      <button type="button" class="pong-hud__btn pong-hud__quit" title="Stop playing (Esc)">✕</button>
      <div class="pong-hud__msg"></div>
    `;
    this.scoreEl = this.hud.querySelector('.pong-hud__score');
    this.msgEl = this.hud.querySelector('.pong-hud__msg');
    this.hud.querySelector('.pong-hud__quit').addEventListener('click', () => this.stop());
    this.hud.querySelector('.pong-hud__again').addEventListener('click', () => this.#newGame());
    parent.appendChild(this.hud);

    window.addEventListener('pointermove', (e) => (this.mouseX = e.clientX));
    window.addEventListener('pointerdown', (e) => {
      if (this.hud.contains(e.target)) return; // the score box's buttons, not a serve
      if (this.active && e.button === 0 && this.phase === 'serve' && this.server === 'you' && this.containsPoint(e.clientX, e.clientY)) this.#launch();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.active) this.stop();
    });
    window.addEventListener('resize', () => this.#layout());
  }

  get petName() {
    return { bee: 'Bee', axolotl: 'Axolotl', bbokari: 'Bbokari' }[this.settings.mob] ?? 'Pet';
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
    c.speedBoost = 2.6;
    this.startX = this.#petScreenX();
    this.#layout();
    this.#attachPaddle();
    c.trigger('pingpong', {}, true);
    this.#newGame();
  }

  stop(result = null) {
    if (!this.active) return;
    this.active = false;
    this.canvas.classList.remove('on');
    this.hud.classList.remove('on', 'over');
    const c = this.character;
    this.paddle?.removeFromParent();
    this.paddle = null;
    c.game = null;
    c.socialMode = false;
    c.loco.faceFront = false;
    c.speedBoost = 1;
    c.restLift = 0;
    c.attention = null;
    if (result === 'pet') c.trigger('dance', { then: 'idle' }, true);
    else if (result === 'you') c.trigger('sad', { then: 'idle' }, true);
    else c.trigger('idle', {}, true);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.onEnd();
  }

  /** The table, your paddle's strip and the score box catch the mouse; everything else stays click-through. */
  containsPoint(x, y) {
    if (!this.active || !this.L) return false;
    const { cx, nearY, farY, nearHalf } = this.L;
    if (y >= farY - 10 && y <= nearY + BOTTOM_PX && Math.abs(x - cx) <= nearHalf + 60) return true;
    const r = this.hud.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  contains(node) {
    return this.hud.contains(node) || node === this.canvas;
  }

  #layout() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const nearHalf = Math.min(250, W * 0.26);
    const cx = clamp(this.startX ?? W / 2, nearHalf + 70, W - nearHalf - 70);
    const nearY = H - BOTTOM_PX;
    const farY = nearY - TABLE_DEPTH_PX;
    this.L = { W, H, cx, nearY, farY, nearHalf, farHalf: nearHalf * FAR_RATIO };
    this.hud.style.left = `${Math.round(cx + nearHalf + 12)}px`;
    this.hud.style.top = `${Math.round(farY - 4)}px`;
  }

  /** Screen position of a point on the table (u across, v along, h height above the table in px). */
  #project(u, v, h = 0) {
    const { cx, nearY, farY, nearHalf, farHalf } = this.L;
    const half = lerp(nearHalf, farHalf, v);
    const k = lerp(1, FAR_RATIO, v);
    return { x: cx + u * half, y: lerp(nearY, farY, v) - h * k, k, half };
  }

  #attachPaddle() {
    const mob = this.character.mob;
    if (mob.holdItem) {
      this.paddle = makePaddle(0.085);
      mob.holdItem(this.paddle);
    } else {
      this.paddle = makePaddle(0.13);
      this.paddle.position.set(mob.halfWidth * 0.85, mob.height * 0.4, 0.3);
      mob.root.add(this.paddle);
    }
  }

  #petScreenX() {
    return this.L ? this.L.W / 2 + this.character.loco.x * PIXELS_PER_UNIT : window.innerWidth / 2 + this.character.loco.x * PIXELS_PER_UNIT;
  }

  /** Where the pet's paddle blade is on screen (x), so hits are judged against the paddle it's really holding. */
  #petPaddleX() {
    if (!this.paddle) return this.#petScreenX();
    this.paddle.getWorldPosition(_v);
    _v.project(this.stage.camera);
    return ((_v.x + 1) / 2) * this.stage.width;
  }

  #newGame() {
    this.score = { you: 0, pet: 0 };
    this.server = 'you';
    this.hud.classList.remove('over');
    this.#say('');
    this.#serve();
  }

  #serve() {
    const servesSoFar = this.score.you + this.score.pet;
    this.server = Math.floor(servesSoFar / 2) % 2 === 0 ? 'you' : 'pet';
    this.phase = 'serve';
    this.phaseT = 0;
    this.speed = BASE_SPEED;
    this.ball = { u: 0, v: this.server === 'you' ? 0 : 1, vu: 0, vv: 0 };
    this.#renderScore();
    this.#say(this.server === 'you' ? 'Click the table to serve!' : `${this.petName} is serving…`);
  }

  #launch() {
    const b = this.ball;
    this.phase = 'rally';
    this.#say('');
    if (this.server === 'you') {
      b.u = this.paddleU ?? 0;
      b.v = 0.02;
      this.#aim(b, 1, rand(-0.6, 0.6));
    } else {
      b.u = this.#toU(this.#petPaddleX(), 1);
      b.v = 0.98;
      this.character.swingT = 0;
      this.#aim(b, -1, rand(-0.7, 0.7));
    }
  }

  /** Send the ball towards the other end (dir +1 = to the pet), landing at `targetU`. */
  #aim(b, dir, targetU) {
    this.speed = Math.min(MAX_SPEED, this.speed * 1.05);
    b.vv = dir * this.speed;
    const travel = dir > 0 ? 1 - b.v : b.v;
    b.vu = (clamp(targetU, -0.92, 0.92) - b.u) * (this.speed / Math.max(0.2, travel));
    if (dir > 0) this.petPlan = null;
  }

  #toU(x, v) {
    const p = this.#project(0, v);
    return (x - p.x) / p.half;
  }

  #point(winner) {
    this.score[winner]++;
    this.phase = 'point';
    this.phaseT = 0;
    const c = this.character;
    if (winner === 'pet') {
      c.face.setExpression(Math.random() < 0.5 ? 'smug' : 'happy');
      c.emote('note', 0.5);
    } else {
      c.face.setExpression(Math.random() < 0.5 ? 'pouty' : 'surprised');
      c.emote('exclaim', 0.5);
    }
    this.#renderScore();
    if (this.score.you >= WIN_SCORE || this.score.pet >= WIN_SCORE) {
      const youWon = this.score.you > this.score.pet;
      this.phase = 'over';
      this.hud.classList.add('over');
      this.#say(youWon ? `You win! 🎉 ${this.petName} wants a rematch.` : `${this.petName} wins! Good game 🏓`);
      if (youWon) c.face.setExpression('crying');
      else {
        c.face.setExpression('joy');
        c.emote('sparkle', -0.5);
      }
    } else {
      this.#say(winner === 'you' ? 'Your point!' : `${this.petName}'s point!`);
    }
  }

  #renderScore() {
    this.scoreEl.textContent = `You ${this.score.you} : ${this.score.pet} ${this.petName}`;
  }

  #say(text) {
    this.msgEl.textContent = text;
  }

  update(dt) {
    if (!this.active) return;
    const c = this.character;
    // Anything else taking over the pet (being picked up, falling asleep) ends the game.
    if (c.stateName !== 'pingpong') return this.stop();
    if (Math.abs(this.L.W - window.innerWidth) > 1 || Math.abs(this.L.H - window.innerHeight) > 1) this.#layout();
    dt = Math.min(dt, 1 / 20);
    this.phaseT += dt;
    if (c.swingT !== undefined && c.swingT !== null) c.swingT += dt;

    const { nearHalf } = this.L;
    // Your paddle follows the mouse along the near edge.
    if (this.mouseX !== null) this.paddleU = clamp((this.mouseX - this.L.cx) / nearHalf, -1.25, 1.25);
    this.paddleU ??= 0;

    const b = this.ball;
    if (this.phase === 'serve') {
      if (this.server === 'you') b.u = this.paddleU;
      else if (this.phaseT > 1.3) this.#launch();
    } else if (this.phase === 'rally') {
      b.u += b.vu * dt;
      b.v += b.vv * dt;
      if (b.vv < 0 && b.v <= 0.03) {
        const dx = (b.u - this.paddleU) * nearHalf;
        if (Math.abs(dx) <= PLAYER_REACH_PX) {
          // Where it hits the paddle steers the return, like a real angled bat.
          const target = clamp(b.u + (dx / PLAYER_REACH_PX) * 0.7 + rand(-0.15, 0.15), -0.92, 0.92);
          b.v = 0.03;
          this.#aim(b, 1, target);
        } else if (b.v < -0.12) this.#point('pet');
      } else if (b.vv > 0 && b.v >= 0.97) {
        const p = this.#project(b.u, 1);
        if (Math.abs(p.x - this.#petPaddleX()) <= PET_REACH_PX * p.k + 8) {
          c.swingT = 0;
          b.v = 0.97;
          // Aim away from where your paddle is, a little more cleverly as the rally speeds up.
          const away = this.paddleU > 0 ? -1 : 1;
          this.#aim(b, -1, away * rand(0.2, 0.9));
        } else if (b.v > 1.12) this.#point('you');
      }
    } else if (this.phase === 'point' && this.phaseT > 1.4) {
      c.face.setExpression('happy');
      this.#serve();
    }

    this.#drivePet(dt);
    this.#draw();
  }

  /** Move the pet along the far edge to meet the ball, with a little reaction time and aiming error. */
  #drivePet() {
    const c = this.character;
    const b = this.ball;
    const L = this.L;
    // Stand so the feet are just behind the far edge: the table hides the legs.
    const floorPx = L.H / 2 - c.placement.floorY * PIXELS_PER_UNIT;
    c.restLift = Math.max(0, (floorPx - (L.farY + 22)) / PIXELS_PER_UNIT);

    let targetPx = L.cx;
    if (this.phase === 'rally' && b.vv > 0) {
      if (!this.petPlan) {
        const timeToEnd = (1 - b.v) / b.vv;
        const landing = b.u + b.vu * timeToEnd;
        // Faster balls are harder to read: the guess wobbles more.
        const err = rand(-1, 1) * (0.05 + (this.speed - BASE_SPEED) * 0.55);
        this.petPlan = { u: landing + err, wait: rand(0.08, 0.22) };
      }
      this.petPlan.wait -= 1 / 60;
      if (this.petPlan.wait <= 0) targetPx = this.#project(this.petPlan.u, 1).x;
    } else if (this.phase === 'serve' && this.server === 'pet') {
      targetPx = L.cx + L.farHalf * 0.2;
    }
    const offset = this.#petPaddleX() - this.#petScreenX();
    const lo = L.cx - L.farHalf - 40;
    const hi = L.cx + L.farHalf + 40;
    c.loco.walkTo((clamp(targetPx - offset, lo, hi) - L.W / 2) / PIXELS_PER_UNIT);

    // Watch the ball.
    const p = this.#project(b.u, clamp(b.v, 0, 1), this.#height(b.v));
    c.attention ??= new THREE.Vector3();
    c.attention.set((p.x - L.W / 2) / PIXELS_PER_UNIT, (L.H / 2 - p.y) / PIXELS_PER_UNIT, 4);
  }

  /** Ball height above the table: it bounces once on each half and flies highest over the net and at the bats. */
  #height(v) {
    if (this.phase === 'serve') return ARC_PX * 0.8;
    return ARC_PX * Math.abs(Math.cos(2 * Math.PI * clamp(v, -0.2, 1.2))) + 6;
  }

  #draw() {
    const ctx = this.ctx;
    const L = this.L;
    ctx.clearRect(0, 0, L.W, L.H);
    const P = (u, v, h) => this.#project(u, v, h);

    // Legs and a soft shadow under the table.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(L.cx, L.nearY + 14, L.nearHalf * 1.05, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5b3a1f';
    for (const s of [-1, 1]) {
      const n = P(s * 0.85, 0.08);
      ctx.fillRect(n.x - 4, n.y, 8, BOTTOM_PX - 4);
    }

    // Table top: green with white edges and a centre line.
    const corners = [P(-1, 0), P(1, 0), P(1, 1), P(-1, 1)];
    const top = () => {
      ctx.beginPath();
      corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
    };
    ctx.fillStyle = '#2e6b4f';
    ctx.fillRect(corners[0].x, corners[0].y, corners[1].x - corners[0].x, 9);
    top();
    const grad = ctx.createLinearGradient(0, L.farY, 0, L.nearY);
    grad.addColorStop(0, '#2f8a5e');
    grad.addColorStop(1, '#3aa070');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    top();
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const m0 = P(0, 0);
    const m1 = P(0, 1);
    ctx.moveTo(m0.x, m0.y);
    ctx.lineTo(m1.x, m1.y);
    ctx.stroke();

    const ball = this.ball;
    const vb = clamp(ball.v, -0.15, 1.15);
    const drawBall = () => {
      const s = P(ball.u, vb, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, 7 * s.k, 3 * s.k, 0, 0, Math.PI * 2);
      ctx.fill();
      const p = P(ball.u, vb, this.#height(ball.v));
      ctx.fillStyle = '#fff7e8';
      ctx.strokeStyle = '#e0a060';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7.5 * p.k, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };

    // Ball behind the net is drawn before it, in front of the net after it.
    if (vb > 0.5) drawBall();
    const nl = P(-1.08, 0.5);
    const nr = P(1.08, 0.5);
    const netH = 16 * nl.k;
    ctx.fillStyle = 'rgba(240,240,240,0.55)';
    ctx.fillRect(nl.x, nl.y - netH, nr.x - nl.x, netH);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(nl.x, nl.y - netH);
    ctx.lineTo(nr.x, nr.y - netH);
    ctx.stroke();
    ctx.fillStyle = '#333';
    ctx.fillRect(nl.x - 3, nl.y - netH - 2, 4, netH + 2);
    ctx.fillRect(nr.x - 1, nr.y - netH - 2, 4, netH + 2);
    if (vb <= 0.5) drawBall();

    // Your paddle.
    const pp = P(this.paddleU ?? 0, -0.02, 18);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate((this.paddleU ?? 0) * 0.25);
    ctx.fillStyle = '#c68a4a';
    ctx.fillRect(-5, 14, 10, 26);
    ctx.fillStyle = '#d8323c';
    ctx.strokeStyle = '#7a1a20';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
