import * as THREE from 'three';
import walkUrl from '../../assets/cat/walk.webp?url';
import WALK from '../../assets/cat/walk.json';
import frontUrl from '../../assets/cat/front.webp?url';
import FRONT from '../../assets/cat/front.json';
import crouchUrl from '../../assets/cat/crouch.webp?url';
import CROUCH from '../../assets/cat/crouch.json';
import lieUrl from '../../assets/cat/liedown.webp?url';
import LIE from '../../assets/cat/liedown.json';
import loafRugUrl from '../../assets/cat/loafrug.webp?url';
import LOAF_RUG from '../../assets/cat/loafrug.json';
import loafSofaUrl from '../../assets/cat/loafsofa.webp?url';
import LOAF_SOFA from '../../assets/cat/loafsofa.json';
import sitTallUrl from '../../assets/cat/sittall.webp?url';
import SIT_TALL from '../../assets/cat/sittall.json';
import curledUrl from '../../assets/cat/curled.webp?url';
import CURLED from '../../assets/cat/curled.json';
import { FaceDisplay } from '../bee/face/FaceDisplay.js';

// Puppet moves: her photos rigged with a skeleton (head, legs, tail on a fine triangle mesh) and animated, then
// rendered into sprite sheets. p_* are from her side photo (walk, stand, look/sniff, stretch, pounce), s_* from her
// sitting photo (reactions and activities, with their props). Picked up automatically from assets/cat/puppet.
const P_SHEETS = import.meta.glob('../../assets/cat/puppet/*.webp', { eager: true, query: '?url', import: 'default' });
const P_METAS = import.meta.glob('../../assets/cat/puppet/*.json', { eager: true, import: 'default' });

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rand = (a, b) => a + Math.random() * (b - a);

/**
 * Mike's clips. The video ones are cut out of the user's own videos of her; frameH = frame height on screen (world
 * units), chosen so her body is the same size in every clip. Puppet clips carry their own scale (meta.unit).
 */
const CLIPS = {
  walkVideo: { url: walkUrl, meta: WALK, frameH: 0.95 },
  front: { url: frontUrl, meta: FRONT, frameH: 0.72, noFlip: true },
  crouch: { url: crouchUrl, meta: CROUCH, frameH: 0.82 },
  lie: { url: lieUrl, meta: LIE, frameH: 0.8 },
  loafRug: { url: loafRugUrl, meta: LOAF_RUG, frameH: 0.5, still: true },
  loafSofa: { url: loafSofaUrl, meta: LOAF_SOFA, frameH: 0.58, still: true, noFlip: true },
  sitTall: { url: sitTallUrl, meta: SIT_TALL, frameH: 0.92, still: true, noFlip: true },
  curled: { url: curledUrl, meta: CURLED, frameH: 0.42, still: true },
};
for (const [path, meta] of Object.entries(P_METAS)) {
  const name = path.split('/').pop().replace('.json', '');
  const url = P_SHEETS[path.replace('.json', '.webp')];
  if (url) CLIPS[name] = { url, meta, frameH: meta.h * meta.unit, noFlip: name.startsWith('s_'), puppet: true, loop: meta.loop };
}
const has = (k) => !!CLIPS[k];
const LOADER = new THREE.TextureLoader();
/** True once a clip's sheet is loaded; starts loading it otherwise. */
function ready(k) {
  const c = CLIPS[k];
  if (!c) return false;
  if (!c.base) {
    c.base = LOADER.load(c.url, () => (c.ready = true));
    c.base.colorSpace = THREE.SRGBColorSpace;
    c.base.minFilter = THREE.LinearMipmapLinearFilter;
    c.base.anisotropy = 4;
  }
  return !!c.ready;
}
const WALK_CLIP = has('p_walk') ? 'p_walk' : 'walkVideo';

/** What she does while the app is in each state (first one that exists). */
const FOR_STATE = {
  happy: ['s_happy'], excited: ['s_happy', 's_dance'], tada: ['s_happy'], sad: ['s_sad'], sleepy: ['s_sleepy'],
  curious: ['s_curious', 'p_look'], surprised: ['s_startle'], wave: ['s_wave'], pet: ['s_love'], grumpy: ['s_grumpy'],
  dance: ['s_dance'], eat: ['s_eat'], stretch: ['p_stretch'], wake: ['p_stretch'], chase: ['p_pounce'], typing: ['s_typing'],
  carried: ['sitTall'], drop: ['sitTall'], settle: ['sitTall'],
};
/** What she does for each thing the app sees you doing on the computer. */
const FOR_ACTIVITY = {
  video: ['s_popcorn'], music: ['s_music'], reading: ['s_reading'], writing: ['s_typing'], coding: ['s_typing'],
  typing: ['s_typing'], drawing: ['s_drawing', 's_typing'], gaming: ['s_gaming'], meeting: ['s_meeting', 's_typing'],
};
const pick = (list) => list?.find(has) ?? null;

/** One layer of her picture (two of them crossfade when she changes what she's doing). */
class Layer {
  constructor(parent) {
    this.tex = {};
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.02, depthWrite: false, opacity: 0 });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 2;
    parent.add(this.mesh);
    this.clip = null;
  }
  set(clip, frame) {
    const c = CLIPS[clip], m = c.meta;
    if (!this.tex[clip]) {
      const t = c.base.clone();
      t.needsUpdate = true;
      t.repeat.set(1 / m.cols, 1 / m.rows);
      this.tex[clip] = t;
    }
    const t = this.tex[clip];
    if (this.clip !== clip) { this.clip = clip; this.mat.map = t; this.mat.needsUpdate = true; }
    const i = clamp(Math.round(frame), 0, m.frames - 1);
    t.offset.set((i % m.cols) / m.cols, 1 - (Math.floor(i / m.cols) + 1) / m.rows);
  }
  place(dir, breath) {
    const c = CLIPS[this.clip];
    if (!c) return;
    const w = (c.frameH * c.meta.w) / c.meta.h;
    const sx = c.noFlip ? 1 : dir;
    // her paws (the clip's floor row) on the floor; her body (not the props beside her) centred on the spot
    this.mesh.position.set((0.5 - (c.meta.cx ?? 0.5)) * w * sx, -(1 - c.meta.ground) * c.frameH, 0);
    this.mesh.scale.set(w * sx, c.frameH * (1 + breath), 1);
  }
}

/**
 * Mike, the user's own cat, for real: a grumpy tortoiseshell. A flat picture of her that always faces the camera.
 * Idle, she strings together random stretches of her real footage and her puppet moves (looking around, sniffing,
 * stretching, loafing, lying down, being grumpy), with soft crossfades. She walks with her puppet walk, reacts to
 * what happens (petting, waving, surprises, dancing, food) and acts out what you're doing on the computer (typing,
 * popcorn for videos, headphones for music, reading, drawing, gaming, video calls).
 */
export class RealCat {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'realCat';
    const hips = new THREE.Group(), torso = new THREE.Group(), head = new THREE.Group();
    this.root.add(hips);
    hips.add(torso);
    torso.add(head);
    this.joints = { hips, torso, head };
    this.face = new FaceDisplay();
    const W0 = (CLIPS.walkVideo.frameH * WALK.w) / WALK.h;
    head.position.set(W0 * 0.36, CLIPS.walkVideo.frameH * 0.55, 0.02);
    this.height = CLIPS.walkVideo.frameH * WALK.ground;
    this.halfWidth = W0 * 0.46;
    this.emoteLift = 0.85;
    this.walkAmount = 0;
    this.walkPhase = 0;
    this.time = 0;
    this.dir = 1;
    this.doing = null; // a clip she's doing because of what you're doing on the computer
    for (const k of ['front', WALK_CLIP, 'p_stand', 'crouch', 'loafRug', 'loafSofa', 'sitTall', 'lie', 'curled']) ready(k); // the everyday ones
    this.view = new THREE.Group(); // turned to face the camera every frame
    torso.add(this.view);
    this.layers = [new Layer(this.view), new Layer(this.view)];
    this.cur = 0;
    this.fade = 1;
    this.fadeTime = 0.4;
    const sh = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(W0 * 0.36, CLIPS.walkVideo.frameH * 0.09, 1);
    sh.position.y = 0.004;
    this.shadow = new THREE.Group();
    this.shadow.add(sh);
    hips.add(this.shadow);
    this.parts = { loaded: true, ready: Promise.resolve(), head, arms: [], legs: [] };
    this.act = null;
    this.#next('look');
  }

  /** The app tells us what you're doing on the computer (or null). Returns true if she has a clip for it. */
  realActivity(kind) {
    if (!kind) { this.doing = null; return true; }
    const clip = pick(FOR_ACTIVITY[kind]);
    if (!clip) return false;
    this.doing = clip;
    return true;
  }

  // ---------- what she's doing ----------
  /** Starts a move: a stretch of one clip, from frame a to b at some speed, optionally holding the last frame. */
  #start(clip, a, b, fps, hold = 0, then = null, extra = {}) {
    if (!ready(clip)) {
      return false;
    }
    const prev = this.act;
    const contiguous = prev && prev.clip === clip && Math.abs(prev.frame - a) < 1.5;
    this.act = { clip, frame: a, a, b, fps: Math.abs(fps) * Math.sign(b - a || 1), hold, then, ...extra };
    if (!contiguous && prev) {
      this.cur = 1 - this.cur;
      this.fade = 0;
      // quick cuts into and out of walking (no ghostly double cat), softer between poses
      this.fadeTime = clip === WALK_CLIP || prev.clip === WALK_CLIP ? 0.18 : 0.35;
    }
    this.layers[this.cur].set(clip, a);
    return true;
  }

  /** Plays a whole clip (a reaction or an activity); loops round to the start with a crossfade if it loops. */
  #play(clip, extra) {
    const m = CLIPS[clip].meta;
    return this.#start(clip, 0, m.frames - 1, m.fps ?? 10, CLIPS[clip].loop ? 0 : 1e9, null, extra);
  }

  #next(kind) {
    let choice = kind ?? this.#choose();
    const needs = { stand: 'p_stand', sniff: 'p_look', stretch: 'p_stretch', pounce: 'p_pounce', grumpy: 's_grumpy', curious: 's_curious' }[choice];
    if (needs && !ready(needs)) choice = 'look'; // still loading: next time
    if (!this.act && !ready('front')) { this.#start('front', 0, 0, 1, 0.3); return; }
    const span = (clip, min, max) => {
      const n = CLIPS[clip].meta.frames, len = Math.min(n - 1, Math.round(rand(min, max)));
      const a = Math.floor(rand(0, Math.max(1, n - len)));
      return Math.random() < 0.5 ? [a, a + len] : [a + len, a]; // forwards or backwards
    };
    if (choice === 'look') {
      const [a, b] = span('front', 14, 40);
      this.#start('front', a, b, rand(7, 11), Math.random() < 0.45 ? rand(0.6, 2.2) : 0);
    } else if (choice === 'swish') {
      const [a, b] = span('crouch', 18, 45);
      this.#start('crouch', a, b, rand(8, 11), Math.random() < 0.3 ? rand(0.5, 1.5) : 0);
    } else if (choice === 'loaf') {
      this.#start(Math.random() < 0.5 ? 'loafRug' : 'loafSofa', 0, 0, 1, rand(5, 12));
    } else if (choice === 'sittall') {
      this.#start('sitTall', 0, 0, 1, rand(3, 7));
    } else if (choice === 'liedown') {
      const n = CLIPS.lie.meta.frames - 1;
      this.#start('lie', 0, n, 9, rand(4, 11), () => this.#start('lie', n, 0, 9, 0, null));
    } else if (choice === 'stand') { // standing side-on, breathing, tail swaying
      const n = CLIPS.p_stand.meta.frames - 1;
      this.#start('p_stand', 0, n, 12, 0, () => this.#start('p_stand', n, 0, 12, rand(0, 1.5)));
    } else if (choice === 'sniff') { // looks up at something, then sniffs the floor
      this.#play('p_look');
    } else if (choice === 'stretch') {
      if (this.#play('p_stretch')) this.act.hold = 0;
    } else if (choice === 'pounce') { // hunting a bug only she can see
      if (this.#play('p_pounce')) this.act.hold = 0;
    } else if (choice === 'grumpy' || choice === 'curious') {
      const c = choice === 'grumpy' ? 's_grumpy' : 's_curious';
      const n = CLIPS[c].meta.frames - 1;
      this.#start(c, 0, n, 12, 0);
    }
    this.lastKind = choice;
  }

  #choose() {
    const w = { look: 0.24, swish: 0.1, loaf: 0.14, sittall: 0.08, liedown: 0.1 };
    if (has('p_stand')) w.stand = 0.12;
    if (has('p_look')) w.sniff = 0.1;
    if (has('p_stretch')) w.stretch = 0.05;
    if (has('p_pounce')) w.pounce = 0.04;
    if (has('s_grumpy')) w.grumpy = 0.06; // she is grumpy, after all
    if (has('s_curious')) w.curious = 0.04;
    for (const k of ['loaf', 'sittall', 'liedown', 'stretch', 'pounce', 'grumpy', 'curious', 'sniff']) if (this.lastKind === k) w[k] = 0;
    if (this.lastKind === 'swish') w.swish *= 0.4;
    let r = Math.random() * Object.values(w).reduce((s, v) => s + v, 0);
    for (const [k, v] of Object.entries(w)) if ((r -= v) <= 0) return k;
    return 'look';
  }

  /** She doesn't wear glasses, hats or hold things (she's a real cat; her props come with her moves). */
  setGlasses() {}
  anchor() {
    return null;
  }

  applyPose(p, breath = 0) {
    this.joints.hips.position.y = 0;
    this.view.rotation.y = -this.root.rotation.y;
    this.shadow.rotation.y = -this.root.rotation.y;
    if (Math.abs(this.speed ?? 0) > 0.05) this.dir = Math.sign(this.speed);
    const c = CLIPS[this.act?.clip];
    const still = this.act?.clip === WALK_CLIP || c?.puppet ? 0 : c?.still ? 2.2 : 1; // photo poses breathe a bit more
    for (const L of this.layers) L.place(this.dir, breath * 0.006 * still);
  }

  /** The clip she should be playing right now because of what's going on (a reaction, or what you're doing). */
  #wanted() {
    const st = this.stateName;
    if (st === 'activity' && this.doing) return this.doing;
    const r = pick(FOR_STATE[st]);
    if (r) return r;
    return null;
  }

  animate(dt) {
    this.time += dt;
    if (!this.act) { this.#next('look'); if (!this.act) return; } // her first clip is still loading
    const sleepy = /asleep|sleepy/.test(this.face?.expression ?? '') && this.stateName !== 'sleepy';
    const walking = this.walkAmount > 0.15;
    const A = this.act;
    const want = walking ? null : this.#wanted();
    if (walking) {
      const W = CLIPS[WALK_CLIP].meta;
      if (A.clip !== WALK_CLIP && !this.#start(WALK_CLIP, 0, W.frames, W.fps)) return;
      // her walk plays at the speed she's moving (filmed at about 0.9 body lengths per second)
      this.act.frame = (this.act.frame + dt * W.fps * clamp(Math.abs(this.speed ?? 0) / 0.9, 0.5, 1.6)) % W.frames;
    } else if (want) {
      if (A.clip !== want || !A.react) {
        if (!this.#play(want, { react: true })) this.#step(dt, () => this.#next()); // keeps going while it loads
      } else this.#step(dt, () => (CLIPS[want].loop ? this.#play(want, { react: true }) : null));
    } else if (A.clip === WALK_CLIP || A.react) {
      this.#next('look'); // stopped walking, or the reaction / activity is over
    } else if (sleepy && A.clip !== 'curled' && !A.sleep) {
      // sleepy: lie down, then curl up asleep (her photo) until she wakes
      this.#start('lie', A.clip === 'lie' ? A.frame : 0, CLIPS.lie.meta.frames - 1, 9, 1.2, () => this.#start('curled', 0, 0, 1, 1e9));
      this.act.sleep = true;
    } else if (!sleepy && (A.clip === 'curled' || A.sleep)) {
      this.#next(has('p_stretch') ? 'stretch' : 'look'); // woke up: a big stretch
    } else {
      this.#step(dt, () => this.#next());
    }
    // draw: current layer at its frame, crossfading over the previous one
    this.fade = Math.min(1, this.fade + dt / this.fadeTime);
    const cur = this.layers[this.cur], old = this.layers[1 - this.cur];
    cur.set(this.act.clip, this.act.frame);
    cur.mat.opacity = this.fade;
    old.mat.opacity = 1 - this.fade;
    cur.mesh.renderOrder = 3;
    old.mesh.renderOrder = 2;
  }

  /** Plays the current stretch; at its end holds (if asked), then runs `then` or `done`. */
  #step(dt, done) {
    const A = this.act;
    const step = A.fps * dt;
    if ((step > 0 && A.frame + step >= A.b) || (step < 0 && A.frame + step <= A.b)) {
      A.frame = A.b;
      if (A.hold > 0) A.hold -= dt;
      else if (A.then) { const t = A.then; A.then = null; t(); }
      else done?.();
    } else A.frame += step;
  }
}
