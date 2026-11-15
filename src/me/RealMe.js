import * as THREE from 'three';
import { FaceDisplay } from '../bee/face/FaceDisplay.js';

// Every clip in assets/me (a sprite sheet .webp + its .json), cut out of the user's own videos of themself.
// Clips are picked up automatically, so new ones can be added just by dropping them in the folder.
const SHEETS = import.meta.glob('../../assets/me/*.webp', { eager: true, query: '?url', import: 'default' });
const METAS = import.meta.glob('../../assets/me/*.json', { eager: true, import: 'default' });

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rand = (a, b) => a + Math.random() * (b - a);
const FADE = 0.45; // seconds of crossfade between clips

/**
 * frameH = height of a frame on screen (world units), chosen so you're the same size in every clip.
 *   stand – standing facing the camera, looking around, waving (IMG_6668)
 *   walk  – walking across the sidewalk (IMG_6675); mirrored for the other direction
 *   read  – reading a book in the gaming chair (IMG_6670)
 *   write – writing in a notebook, chewing the pen while thinking (IMG_6672)
 *   draw  – drawing on a tablet (IMG_6671)
 *   type  – typing on a laptop (IMG_6669)
 * The seated clips have the gaming chair drawn in behind (you sit right back in it, wheels on the floor).
 */
const SIZES = { stand: 1.3, walk: 1.3, read: 1.25, write: 1.25, draw: 1.25, type: 1.25 };
const CLIPS = {};
for (const [path, meta] of Object.entries(METAS)) {
  const name = path.split('/').pop().replace('.json', '');
  const url = SHEETS[path.replace('.json', '.webp')];
  if (url) CLIPS[name] = { url, meta, frameH: SIZES[name] ?? 1.25, noFlip: name !== 'walk' };
}
const has = (k) => !!CLIPS[k];

/** What you do on screen for each thing the app sees you doing on the computer (falls back to what's there). */
const FOR_ACTIVITY = {
  coding: ['type'], writing: ['type', 'write'], typing: ['type'], reading: ['read', 'write'],
  drawing: ['draw'], video: ['type', 'read'], gaming: ['type'], meeting: ['type'], music: ['stand'],
};
const SEATED = new Set(['read', 'write', 'draw', 'type']);

/** One layer of the picture (two crossfade when you change what you're doing). */
class Layer {
  constructor(parent) {
    this.tex = {};
    for (const [k, c] of Object.entries(CLIPS)) {
      const t = c.base.clone();
      t.needsUpdate = true;
      t.repeat.set(1 / c.meta.cols, 1 / c.meta.rows);
      this.tex[k] = t;
    }
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.02, depthWrite: false, opacity: 0 });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 2;
    parent.add(this.mesh);
    this.clip = null;
  }
  set(clip, frame) {
    const c = CLIPS[clip], m = c.meta, t = this.tex[clip];
    if (this.clip !== clip) { this.clip = clip; this.mat.map = t; this.mat.needsUpdate = true; }
    const i = clamp(Math.round(frame), 0, m.frames - 1);
    t.offset.set((i % m.cols) / m.cols, 1 - (Math.floor(i / m.cols) + 1) / m.rows);
  }
  place(dir) {
    const c = CLIPS[this.clip];
    if (!c) return;
    const w = (c.frameH * c.meta.w) / c.meta.h;
    this.mesh.position.y = -(1 - c.meta.ground) * c.frameH; // feet (or the chair's wheels) on the floor
    this.mesh.scale.set(w * (c.noFlip ? 1 : dir), c.frameH, 1);
  }
}

/**
 * You, as a desktop buddy: a flat cut-out of your real videos that always faces the camera. When you're idle you
 * stand around (random stretches of your standing clip, forwards or backwards, with pauses, and the odd wave);
 * walking plays your walk; and when the app sees what you're doing on the computer, you sit in your gaming chair and
 * do it too (typing, reading, writing, drawing).
 */
export class RealMe {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'realMe';
    const hips = new THREE.Group(), torso = new THREE.Group(), head = new THREE.Group();
    this.root.add(hips);
    hips.add(torso);
    torso.add(head);
    this.joints = { hips, torso, head };
    this.face = new FaceDisplay();
    this.idleClip = has('stand') ? 'stand' : Object.keys(CLIPS)[0];
    const ref = CLIPS[this.idleClip];
    const W0 = ref ? (ref.frameH * ref.meta.w) / ref.meta.h : 0.5;
    head.position.set(0, (ref?.frameH ?? 1.3) * 0.86, 0.02);
    this.height = (ref?.frameH ?? 1.3) * 0.95;
    this.halfWidth = W0 * 0.42;
    this.emoteLift = 1.0;
    this.walkAmount = 0;
    this.walkPhase = 0;
    this.time = 0;
    this.dir = 1;
    this.doing = null; // a clip you're doing because of what's happening on the computer
    for (const c of Object.values(CLIPS)) {
      const t = new THREE.TextureLoader().load(c.url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.anisotropy = 4;
      c.base = t;
    }
    this.view = new THREE.Group(); // turned to face the camera every frame
    torso.add(this.view);
    this.layers = [new Layer(this.view), new Layer(this.view)];
    this.cur = 0;
    this.fade = 1;
    const sh = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(W0 * 0.42, 0.08, 1);
    sh.position.y = 0.004;
    this.shadow = new THREE.Group();
    this.shadow.add(sh);
    hips.add(this.shadow);
    this.parts = { loaded: true, ready: Promise.resolve(), head, arms: [], legs: [] };
    this.act = null;
    if (ref) this.#next();
  }

  /** The app tells us what you're doing on the computer (or null). Returns true if there's a clip for it. */
  realActivity(kind) {
    if (!kind) { this.doing = null; return true; }
    const options = (FOR_ACTIVITY[kind] ?? ['type', 'read']).filter(has);
    if (!options.length) return false;
    this.doingOptions = options;
    this.doing = options[0];
    this.#next();
    return true;
  }

  #start(clip, a, b, fps, hold = 0) {
    const prev = this.act;
    const contiguous = prev && prev.clip === clip && Math.abs(prev.frame - a) < 1.5;
    this.act = { clip, frame: a, a, b, fps: Math.abs(fps) * Math.sign(b - a || 1), hold };
    if (!contiguous && prev) { this.cur = 1 - this.cur; this.fade = 0; }
    this.layers[this.cur].set(clip, a);
  }

  /** The next stretch of footage: a random piece of the right clip, forwards or backwards, sometimes pausing. */
  #next() {
    let clip = this.idleClip;
    if (this.doing) {
      // studying swaps between reading and writing now and then
      if (this.doingOptions?.length > 1 && Math.random() < 0.25) this.doing = this.doingOptions[Math.floor(Math.random() * this.doingOptions.length)];
      clip = this.doing;
    }
    if (!clip || !CLIPS[clip]) return;
    const n = CLIPS[clip].meta.frames;
    const len = Math.min(n - 1, Math.round(rand(n * 0.25, n * 0.6)));
    let a = Math.floor(rand(0, Math.max(1, n - len)));
    // keep going from where we are when it's the same clip (no visible jump)
    if (this.act?.clip === clip) a = clamp(Math.round(this.act.frame), 0, n - 1);
    const fwd = a + len < n && (a - len < 0 || Math.random() < 0.55);
    const b = fwd ? a + len : a - len;
    const pause = SEATED.has(clip) ? (Math.random() < 0.25 ? rand(0.4, 1.4) : 0) : (Math.random() < 0.4 ? rand(0.5, 2) : 0);
    this.#start(clip, a, clamp(b, 0, n - 1), CLIPS[clip].meta.fps * rand(0.85, 1.1), pause);
  }

  /** You don't wear the pet glasses, hats or hold things (you're you). */
  setGlasses() {}
  anchor() {
    return null;
  }

  applyPose() {
    this.joints.hips.position.y = 0;
    this.view.rotation.y = -this.root.rotation.y;
    this.shadow.rotation.y = -this.root.rotation.y;
    if (Math.abs(this.speed ?? 0) > 0.05) this.dir = Math.sign(this.speed);
    for (const L of this.layers) L.place(this.dir);
  }

  animate(dt) {
    this.time += dt;
    const A = this.act;
    if (!A) return;
    const walking = this.walkAmount > 0.15 && has('walk');
    if (walking) {
      const W = CLIPS.walk.meta;
      if (A.clip !== 'walk') this.#start('walk', 0, W.frames, W.fps);
      // the walk plays at the speed you're moving (filmed at about 0.9 body heights per second)
      A.frame = (A.frame + dt * W.fps * clamp(Math.abs(this.speed ?? 0) / 0.9, 0.5, 1.6)) % W.frames;
    } else if (A.clip === 'walk' || (this.doing && A.clip !== this.doing && !this.doingOptions?.includes(A.clip)) || (!this.doing && SEATED.has(A.clip))) {
      this.#next(); // stopped walking, or started / stopped doing something
    } else {
      const step = A.fps * dt;
      if ((step > 0 && A.frame + step >= A.b) || (step < 0 && A.frame + step <= A.b)) {
        A.frame = A.b;
        if (A.hold > 0) A.hold -= dt;
        else this.#next();
      } else A.frame += step;
    }
    this.fade = Math.min(1, this.fade + dt / FADE);
    const cur = this.layers[this.cur], old = this.layers[1 - this.cur];
    cur.set(this.act.clip, this.act.frame);
    cur.mat.opacity = this.fade;
    old.mat.opacity = 1 - this.fade;
    cur.mesh.renderOrder = 3;
    old.mesh.renderOrder = 2;
  }
}
