import * as THREE from 'three';
import { mat } from './Props.js';
import { PIXELS_PER_UNIT } from '../core/Stage.js';
import { SUNGLASSES } from './Outfits.js';

const rand = (a, b) => a + Math.random() * (b - a);
const GRAVITY = 9;

function strawberry() {
  const g = new THREE.Group();
  const berry = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), mat(0xe8283e, { roughness: 0.5 }));
  berry.scale.set(1, 1.25, 1);
  const seeds = mat(0xffe08a);
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), seeds);
    const a = Math.random() * Math.PI * 2;
    const y = rand(-0.1, 0.08);
    const r = 0.12 * Math.sqrt(1 - (y / 0.15) ** 2);
    s.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    g.add(s);
  }
  const leaf = mat(0x2f9e44);
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), leaf);
    const a = (i / 5) * Math.PI * 2;
    l.position.set(Math.cos(a) * 0.04, 0.15, Math.sin(a) * 0.04);
    l.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
    g.add(l);
  }
  g.add(berry);
  return g;
}

function cookie() {
  const g = new THREE.Group();
  const dough = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 24), mat(0xd9a05b, { roughness: 0.9 }));
  dough.rotation.x = Math.PI / 2;
  g.add(dough);
  const choc = mat(0x4a2c17);
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), choc);
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.1;
    c.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.022);
    g.add(c);
  }
  return g;
}

function beachBall() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  ['#ff6b6b', '#ffffff', '#4dabf7', '#ffffff', '#ffd43b', '#ffffff'].forEach((col, i) => {
    x.fillStyle = col;
    x.fillRect((i * 256) / 6, 0, 256 / 6 + 1, 128);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 16), new THREE.MeshStandardMaterial({ map: t, roughness: 0.45 }));
  m.castShadow = true;
  return m;
}

function umbrella() {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? '#ffffff' : '#ff5fa2';
    x.fillRect(i * 32, 0, 33, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.6 }));
  canopy.scale.y = 0.6;
  canopy.position.y = 0.55;
  canopy.castShadow = true;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.7, 8), mat(0x444444));
  pole.position.y = 0.25;
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 6, 12, Math.PI), mat(0x444444));
  hook.position.set(0.04, -0.1, 0);
  hook.rotation.z = Math.PI;
  g.add(canopy, pole, hook);
  return g;
}

/**
 * Things to do with the pet: feed it, play ball, confetti, and weather props (sunglasses when sunny, an umbrella when it
 * rains). Lives in the 3D scene (world units) next to the pet.
 */
export class Toys {
  constructor({ character, stage, wardrobe }) {
    this.character = character;
    this.stage = stage;
    this.wardrobe = wardrobe;
    this.snack = null;
    this.ball = null;
    this.confetti = [];
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'confetti';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.weatherUntil = 0;
  }

  get busy() {
    return !!(this.snack || this.ball);
  }

  // ---- feeding ----
  feed() {
    if (this.snack) return;
    const c = this.character;
    const s = c.placement.scale;
    const mesh = Math.random() < 0.5 ? strawberry() : cookie();
    mesh.scale.setScalar(s);
    const head = c.mob.root.position.y + c.mob.height * s;
    mesh.position.set(c.loco.x + rand(-0.15, 0.15) * s, head + 2.2 * s, 0.35 * s);
    this.stage.scene.add(mesh);
    this.snack = { mesh, vy: 0, target: c.mob.root.position.y + c.mob.height * s * 0.62 };
    c.loco.stop();
    c.trigger('curious', { then: 'idle' }, true);
  }

  // ---- ball ----
  playBall() {
    if (this.ball) return;
    const c = this.character;
    const s = c.placement.scale;
    const mesh = beachBall();
    mesh.scale.setScalar(s);
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = Math.max(c.placement.minX, Math.min(c.placement.maxX, c.loco.x + side * 1.6 * s));
    mesh.position.set(x, c.placement.floorY + 1.5 * s, 0.25 * s);
    this.stage.scene.add(mesh);
    this.ball = { mesh, vx: -side * 0.6 * s, vy: 0, kicks: 0, t: 0, cooldown: 0 };
    c.restLift = 0;
    c.trigger('chase', { toy: this }, true);
  }

  // ---- confetti (2D, over everything) ----
  burst() {
    const c = this.character;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const x = W / 2 + c.loco.x * PIXELS_PER_UNIT;
    const y = H / 2 - (c.mob.root.position.y + c.mob.height * c.placement.scale) * PIXELS_PER_UNIT;
    const colors = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa', '#ff8fab'];
    for (let i = 0; i < 90; i++) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const v = rand(250, 620);
      this.confetti.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rand(0, 6), vr: rand(-10, 10), w: rand(5, 9), h: rand(3, 6), color: colors[i % colors.length], life: rand(1.6, 2.6), t: 0 });
    }
    c.trigger('happy', { then: 'idle' }, true);
  }

  // ---- weather ----
  weather(mood) {
    const c = this.character;
    if (mood === 'sunny') {
      // Put on below (in update), once it's done with its desk: leaving the desk takes glasses off.
      c.face.setExpression('smug');
      this.weatherUntil = performance.now() + 8000;
      this.weatherKind = 'sunny';
    } else if (mood === 'rain' && c.mob.anchor?.('handR')) {
      this.umbrellaMesh ??= umbrella();
      const a = c.mob.anchor('handR');
      this.umbrellaMesh.position.set(...a.at);
      this.umbrellaMesh.rotation.set(0, 0, 0.35);
      a.parent.add(this.umbrellaMesh);
      c.trigger('umbrella', { then: 'idle' }, true);
      this.weatherUntil = performance.now() + 7000;
      this.weatherKind = 'rain';
    } else if (mood === 'snow' || mood === 'rain') {
      c.face.setExpression('nervous');
      c.emote('question', 0.4);
    }
  }

  update(dt) {
    const c = this.character;
    const s = c.placement.scale;
    // Snack falls; the pet watches it, then catches it in its beak.
    if (this.snack) {
      const sn = this.snack;
      sn.vy -= GRAVITY * s * dt * 0.35;
      sn.mesh.position.y += sn.vy * dt;
      sn.mesh.rotation.y += dt * 3;
      sn.mesh.position.x += (c.loco.x - sn.mesh.position.x) * Math.min(1, dt * 2);
      c.attention ??= new THREE.Vector3();
      c.attention.copy(sn.mesh.position);
      if (sn.mesh.position.y <= sn.target + c.lift) {
        sn.mesh.removeFromParent();
        this.snack = null;
        c.attention = null;
        c.trigger('eat', { then: 'idle' }, true);
      }
    }
    // Ball: bounces on the floor, bumps off the screen edges, slows down; the chase state kicks it.
    if (this.ball) {
      const b = this.ball;
      b.t += dt;
      b.cooldown -= dt;
      const r = 0.18 * s;
      const floor = c.placement.floorY + r;
      b.vy -= GRAVITY * s * dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.x += b.vx * dt;
      if (b.mesh.position.y < floor) {
        b.mesh.position.y = floor;
        b.vy = Math.abs(b.vy) > 0.6 * s ? -b.vy * 0.62 : 0;
        b.vx *= 0.9;
      }
      const lo = c.placement.minX - 0.5 * s;
      const hi = c.placement.maxX + 0.5 * s;
      if (b.mesh.position.x < lo || b.mesh.position.x > hi) {
        b.vx = -b.vx * 0.8;
        b.mesh.position.x = Math.max(lo, Math.min(hi, b.mesh.position.x));
      }
      b.vx *= Math.exp(-0.35 * dt);
      b.mesh.rotation.z -= (b.vx / r) * dt;
      const done = b.kicks >= 6 || b.t > 30;
      if (done && Math.abs(b.vx) < 0.3 * s && b.vy === 0) {
        b.mesh.scale.multiplyScalar(Math.exp(-6 * dt));
        if (b.mesh.scale.x < 0.02 * s) {
          b.mesh.removeFromParent();
          this.ball = null;
        }
      }
    }
    // Sunglasses on as soon as nothing else is using the glasses (typing and scenes have their own).
    if (this.weatherKind === 'sunny' && !['typing', 'activity'].includes(c.stateName) && !c.mob.glasses?.visible) {
      c.mob.setGlasses?.(true, SUNGLASSES);
    }
    // Weather props come off after a few seconds.
    if (this.weatherKind && performance.now() > this.weatherUntil) {
      if (this.weatherKind === 'sunny') c.mob.setGlasses?.(false);
      this.umbrellaMesh?.removeFromParent();
      this.weatherKind = null;
      this.wardrobe?.refresh();
    }
    this.#drawConfetti(dt);
  }

  /** Called by the chase state: is the ball close enough to kick? Then kick it. */
  tryKick() {
    const b = this.ball;
    if (!b || b.cooldown > 0) return false;
    const c = this.character;
    const s = c.placement.scale;
    const dx = b.mesh.position.x - c.loco.x;
    if (Math.abs(dx) > 0.55 * s || b.mesh.position.y > c.placement.floorY + 0.6 * s) return false;
    const away = c.loco.x > (c.placement.minX + c.placement.maxX) / 2 ? -1 : 1;
    const dir = Math.random() < 0.75 ? away : Math.sign(dx) || 1;
    b.vx = dir * rand(1.6, 3) * s;
    b.vy = rand(2, 3.4) * s;
    b.kicks++;
    b.cooldown = 0.8;
    return true;
  }

  #drawConfetti(dt) {
    const ctx = this.ctx;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const live = this.confetti.length > 0;
    this.canvas.classList.toggle('on', live);
    if (!live && !this.wasLive) return;
    this.wasLive = live;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(W * dpr) || this.canvas.height !== Math.round(H * dpr)) {
      this.canvas.width = Math.round(W * dpr);
      this.canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.clearRect(0, 0, W, H);
    for (const p of this.confetti) {
      p.t += dt;
      p.vy += 700 * dt;
      p.vx *= Math.exp(-1.2 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 1.7)));
      ctx.restore();
    }
    this.confetti = this.confetti.filter((p) => p.t < p.life && p.y < H + 40);
  }
}
