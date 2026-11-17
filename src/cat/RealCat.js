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
// rendered into sprite sheets (assets/cat/puppet, picked up automatically, loaded the first time she needs them).
//   p_*  side photo: walk, trot, stand, look/sniff, stretch, pounce, settle down, lie down, lying, washing her face
//   s_*  sitting photo: sitting idle, lying down into a loaf, reactions and activities (with their props)
//   q_*  her other photos brought to life: rug loaf, sofa loaf, curled up asleep (breathing, nods, ear twitches)
const P_SHEETS = import.meta.glob('../../assets/cat/puppet/*.webp', { eager: true, query: '?url', import: 'default' });
const P_METAS = import.meta.glob('../../assets/cat/puppet/*.json', { eager: true, import: 'default' });

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rand = (a, b) => a + Math.random() * (b - a);

/**
 * Mike's clips. The video ones are cut out of the user's own videos of her; frameH = frame height on screen (world
 * units), chosen so her body is the same size in every clip. Puppet clips carry their own scale (meta.unit).
 * mirror: the picture faces left (her side puppet faces right), so it's flipped to match.
 */
const CLIPS = {
  walkVideo: { url: walkUrl, meta: WALK, frameH: 0.95 },
  front: { url: frontUrl, meta: FRONT, frameH: 0.72, noFlip: true },
  crouch: { url: crouchUrl, meta: CROUCH, frameH: 0.82 },
  lie: { url: lieUrl, meta: LIE, frameH: 0.8 },
  loafRug: { url: loafRugUrl, meta: LOAF_RUG, frameH: 0.5, still: true, mirror: true },
  loafSofa: { url: loafSofaUrl, meta: LOAF_SOFA, frameH: 0.58, still: true, noFlip: true },
  sitTall: { url: sitTallUrl, meta: SIT_TALL, frameH: 0.92, still: true, noFlip: true },
  curled: { url: curledUrl, meta: CURLED, frameH: 0.42, still: true, mirror: true },
};
for (const [path, meta] of Object.entries(P_METAS)) {
  const name = path.split('/').pop().replace('.json', '');
  const url = P_SHEETS[path.replace('.json', '.webp')];
  if (!url) continue;
  CLIPS[name] = { url, meta, frameH: meta.h * meta.unit, noFlip: /^s_|^q_loafsofa/.test(name), puppet: true, loop: meta.loop,
    mirror: name === 'q_loafrug' || name === 'q_curled' };
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
/** Loaded in the background after start-up, transitions and everyday poses first. */
const PRELOAD = ['s_down', 'q_loafsofa', 'p_groom', 'q_curled', 'p_stretch', 'p_pounce', 's_love', 's_curious', 's_grumpy', 'p_run', 'crouch', 'sitTall', 'loafRug', 'loafSofa', 'curled'];

// ---------- poses, and how she gets from one to another ----------
/** Which pose each clip starts and ends in. */
function family(clip) {
  if (/^s_down$/.test(clip)) return 'FRONT';
  if (/^s_|^sitTall$|^front$/.test(clip)) return 'FRONT';
  if (/^q_loafsofa$|^loafSofa$/.test(clip)) return 'FLOAF';
  if (/^q_curled$|^curled$/.test(clip)) return 'CURL';
  if (/^p_lieidle$|^q_loafrug$|^loafRug$/.test(clip)) return 'LIE';
  if (clip === 'lie') return 'LIEVID';
  if (/^p_groom$/.test(clip)) return 'CROUCH';
  return 'STAND'; // walk, trot, stand, look, stretch, pounce, the crouch video
}
/** The moves that join two poses: a clip played forwards or backwards; 'turn' = she turns to face you / away. */
const EDGES = {
  'STAND>CROUCH': [['p_settle', 1]], 'CROUCH>STAND': [['p_settle', -1]],
  'STAND>LIE': [['p_liedown', 1]], 'LIE>STAND': [['p_liedown', -1]],
  'CROUCH>FRONT': [['s_idle', 0, 'turn']], 'FRONT>CROUCH': [['p_settle', 0, 'turn']],
  'FRONT>FLOAF': [['s_down', 1]], 'FLOAF>FRONT': [['s_down', -1]],
  'LIE>CURL': [], 'CURL>LIE': [], 'LIE>LIEVID': [], 'LIEVID>LIE': [],
};
const NEXT = {};
for (const k of Object.keys(EDGES)) { const [a, b] = k.split('>'); (NEXT[a] ??= []).push(b); }
/** Shortest chain of poses from a to b. */
function route(a, b) {
  if (a === b) return [];
  const prev = { [a]: null }, q = [a];
  while (q.length) {
    const f = q.shift();
    for (const n of NEXT[f] ?? []) if (!(n in prev)) { prev[n] = f; q.push(n); }
  }
  if (!(b in prev)) return [];
  const path = [];
  for (let f = b; prev[f] !== null; f = prev[f]) path.unshift(`${prev[f]}>${f}`);
  return path;
}

/** What she does while the app is in each state (first one that exists). */
const FOR_STATE = {
  happy: ['s_happy'], excited: ['s_happy', 's_dance'], tada: ['s_happy'], sad: ['s_sad'], sleepy: ['s_sleepy'],
  curious: ['s_curious', 'p_look'], surprised: ['s_startle'], wave: ['s_wave'], pet: ['s_love'], grumpy: ['s_grumpy'],
  dance: ['s_dance'], eat: ['s_eat'], stretch: ['p_stretch'], wake: ['p_stretch'], chase: ['p_pounce'], typing: ['s_typing'],
  carried: ['s_idle', 'sitTall'], drop: ['s_idle', 'sitTall'], settle: ['s_idle', 'sitTall'],
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
    this.squash = 1; // narrower while she turns (to face you or away)
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
    const sx = (c.noFlip ? 1 : dir) * (c.mirror ? -1 : 1);
    // her paws (the clip's floor row) on the floor; her body (not the props beside her) centred on the spot
    this.mesh.position.set((0.5 - (c.meta.cx ?? 0.5)) * w * sx * this.squash, -(1 - c.meta.ground) * c.frameH, 0);
    this.mesh.scale.set(w * sx * this.squash, c.frameH * (1 + breath), 1);
  }
}

/**
 * Mike, the user's own cat, for real: a grumpy tortoiseshell. A flat picture of her that always faces the camera,
 * mostly her rigged puppets. She moves between real poses (standing, crouched, lying, sitting facing you, loafing,
 * curled up asleep) with real transitions: settling down, lying down, getting up, turning to face you, lowering
 * herself into a loaf. Idle, she wanders through them (looking around, sniffing, washing her face, stretching,
 * pouncing, being grumpy, napping); she walks and trots, reacts to what happens (petting, waving, surprises,
 * dancing, food) and acts out what you're doing on the computer.
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
    this.queue = []; // transition moves still to play before what she's going to do
    // the everyday ones load straight away (the rest the first time she needs them)
    for (const k of [WALK_CLIP, 'p_stand', 'p_look', 'p_settle', 'p_liedown', 'p_lieidle', 's_idle', 'q_loafrug', 'front']) ready(k);
    this.view = new THREE.Group(); // turned to face the camera every frame
    torso.add(this.view);
    this.layers = [new Layer(this.view), new Layer(this.view)];
    this.cur = 0;
    this.fade = 1;
    this.fadeTime = 0.4;
    this.turning = false;
    const sh = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(W0 * 0.36, CLIPS.walkVideo.frameH * 0.09, 1);
    sh.position.y = 0.004;
    this.shadow = new THREE.Group();
    this.shadow.add(sh);
    hips.add(this.shadow);
    this.parts = { loaded: true, ready: Promise.resolve(), head, arms: [], legs: [] };
    this.act = null;
  }

  /** The app tells us what you're doing on the computer (or null). Returns true if she has a clip for it. */
  realActivity(kind) {
    if (!kind) { this.doing = null; return true; }
    const clip = pick(FOR_ACTIVITY[kind]);
    if (!clip) return false;
    this.doing = clip;
    return true;
  }

  // ---------- playing clips ----------
  /** Starts a stretch of one clip, from frame a to b at some speed; holds the last frame, then runs `then`. */
  #start(clip, a, b, fps, hold = 0, then = null, extra = {}) {
    if (!ready(clip)) return false;
    const prev = this.act;
    const contiguous = prev && prev.clip === clip && Math.abs(prev.frame - a) < 1.5;
    this.act = { clip, frame: a, a, b, fps: Math.abs(fps) * Math.sign(b - a || 1), hold, then, ...extra };
    if (!contiguous && prev) {
      this.cur = 1 - this.cur;
      this.fade = 0;
      this.turning = !!extra.turn;
      // quick cuts into and out of walking (no ghostly double cat), a slower turn, soft blends between poses
      this.fadeTime = extra.turn ? 0.36 : clip === WALK_CLIP || prev.clip === WALK_CLIP || /p_run/.test(clip + prev.clip) ? 0.18 : 0.35;
    }
    this.layers[this.cur].set(clip, a);
    return true;
  }

  /** Plays a whole clip (looping ones wrap round; one-shots hold their last frame unless told to go on). */
  #play(clip, extra = {}, hold) {
    const m = CLIPS[clip].meta;
    return this.#start(clip, 0, m.frames - 1, m.fps ?? 10, hold ?? (CLIPS[clip].loop ? 0 : 1e9), null, extra);
  }

  /**
   * Gets her to `clip`: if it's in another pose, she first plays the moves that join the poses (settling, lying
   * down, turning, getting up), then `go()` starts it. Returns false while something still has to load.
   */
  #goTo(clip, go, speed = 1) {
    const from = this.act ? family(this.act.clip) : family(clip);
    const steps = [];
    for (const edge of route(from, family(clip))) {
      for (const [c, dir, how] of EDGES[edge] ?? []) if (has(c)) steps.push([c, dir, how]);
      if (!(EDGES[edge] ?? []).length) steps.push([null, 0, 'fade']);
    }
    let waiting = !ready(clip);
    for (const [c] of steps) if (c && !ready(c)) waiting = true;
    if (waiting) { this.pending = () => this.#goTo(clip, go, speed); return true; } // tried again every frame
    this.pending = null;
    this.queue = steps.map(([c, dir, how]) => () => {
      if (!c) return this.#runQueue(); // a plain blend: just carry on
      const m = CLIPS[c].meta, n = m.frames - 1, fps = (m.fps ?? 10) * speed * 1.15;
      const extra = { trans: true, turn: how === 'turn' };
      if (dir === 1) this.#start(c, 0, n, fps, 0, () => this.#runQueue(), extra);
      else if (dir === -1) this.#start(c, n, 0, fps, 0, () => this.#runQueue(), extra);
      else this.#start(c, dir === 0 && /^p_settle$/.test(c) ? n : 0, dir === 0 && /^p_settle$/.test(c) ? n : 0, 1, 0.12, () => this.#runQueue(), extra);
    });
    this.queue.push(go);
    this.#runQueue();
    return true;
  }
  #runQueue() {
    const f = this.queue.shift();
    if (f) f();
  }
  get #busy() {
    return !!this.act?.trans;
  }

  // ---------- what she does when nothing's going on ----------
  #next() {
    const fam = this.act ? family(this.act.clip) : 'STAND';
    const options = {
      STAND: { stand: 0.26, sniff: 0.14, stretch: 0.05, pounce: 0.04, crouchVid: 0.05, groom: 0.1, sit: 0.18, lie: 0.14, trot: 0.04 },
      CROUCH: { groom: 0.3, sit: 0.4, stand: 0.3 },
      FRONT: { idle: 0.3, frontVid: 0.14, curious: 0.06, grumpy: 0.08, loaf: 0.14, stand: 0.14, sitPhoto: 0.04 },
      FLOAF: { loaf: 0.55, sit: 0.45 },
      LIE: { lieIdle: 0.3, rugLoaf: 0.3, stand: 0.25, lieVid: 0.05, curl: 0.1 },
      LIEVID: { lieIdle: 1 },
      CURL: { curl: 0.5, lieIdle: 0.5 },
    }[fam];
    const w = { ...options };
    if (this.lastKind && w[this.lastKind] && !['stand', 'idle', 'lieIdle', 'loaf', 'curl', 'rugLoaf'].includes(this.lastKind)) w[this.lastKind] *= 0.2;
    let r = Math.random() * Object.values(w).reduce((s, v) => s + v, 0), choice = 'stand';
    for (const [k, v] of Object.entries(w)) if ((r -= v) <= 0) { choice = k; break; }
    const ok = this.#doIdle(choice);
    if (!ok && !this.act) this.#start(has('p_stand') ? 'p_stand' : 'front', 0, 0, 1, 0.3);
    else if (!ok && this.act) this.act.hold = 0.4; // something's still loading: wait a moment, then choose again
    this.lastKind = choice;
  }

  #doIdle(choice) {
    const span = (clip, min, max) => {
      const n = CLIPS[clip].meta.frames, len = Math.min(n - 1, Math.round(rand(min, max)));
      const a = Math.floor(rand(0, Math.max(1, n - len)));
      return Math.random() < 0.5 ? [a, a + len] : [a + len, a];
    };
    const loopFor = (clip, secs) => () => {
      const m = CLIPS[clip].meta, n = m.frames - 1;
      const reps = Math.max(1, Math.round(secs / (n / (m.fps ?? 10))));
      let left = reps;
      const again = () => (--left > 0 ? this.#start(clip, 0, n, m.fps ?? 10, 0, again) : this.#next());
      // ping-pong for the side poses (they read the same both ways), wrap for the rest
      this.#start(clip, 0, n, m.fps ?? 10, 0, again);
    };
    switch (choice) {
      case 'stand': return has('p_stand') && this.#goTo('p_stand', loopFor('p_stand', rand(4, 10)));
      case 'sniff': return has('p_look') && this.#goTo('p_look', () => this.#play('p_look', {}, 0));
      case 'stretch': return has('p_stretch') && this.#goTo('p_stretch', () => this.#play('p_stretch', {}, 0));
      case 'pounce': return has('p_pounce') && this.#goTo('p_pounce', () => this.#play('p_pounce', {}, 0));
      case 'trot': return has('p_run') && this.#goTo('p_stand', loopFor('p_stand', 2)); // (trotting only while she moves)
      case 'crouchVid': return this.#goTo('crouch', () => { const [a, b] = span('crouch', 18, 45); this.#start('crouch', a, b, rand(8, 11), 0); });
      case 'groom': return has('p_groom') && this.#goTo('p_groom', () => this.#play('p_groom', {}, 0));
      case 'sit': case 'idle': return has('s_idle') && this.#goTo('s_idle', loopFor('s_idle', rand(6, 14)));
      case 'frontVid': return this.#goTo('front', () => { const [a, b] = span('front', 14, 40); this.#start('front', a, b, rand(7, 11), Math.random() < 0.4 ? rand(0.5, 1.8) : 0); });
      case 'sitPhoto': return this.#goTo('sitTall', () => this.#start('sitTall', 0, 0, 1, rand(1.5, 3)));
      case 'curious': return has('s_curious') && this.#goTo('s_curious', () => this.#play('s_curious', {}, 0));
      case 'grumpy': return has('s_grumpy') && this.#goTo('s_grumpy', () => this.#play('s_grumpy', {}, 0));
      case 'loaf': return has('q_loafsofa') && this.#goTo('q_loafsofa', loopFor('q_loafsofa', rand(10, 25)));
      case 'lie': case 'lieIdle': return has('p_lieidle') && this.#goTo('p_lieidle', loopFor('p_lieidle', rand(6, 14)));
      case 'rugLoaf': return has('q_loafrug') && this.#goTo('q_loafrug', loopFor('q_loafrug', rand(10, 25)));
      case 'lieVid': return this.#goTo('lie', () => this.#start('lie', 0, CLIPS.lie.meta.frames - 1, 9, rand(2, 5)));
      case 'curl': return has('q_curled') && this.#goTo('q_curled', loopFor('q_curled', rand(15, 40)));
    }
    return false;
  }

  /** For tests and demos: do one of her idle moves now (going through the transitions to get there). */
  debugDo(choice) {
    this.queue = [];
    this.pending = null;
    if (this.act) this.act.trans = false;
    return this.#doIdle(choice);
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
    const still = this.act?.clip === WALK_CLIP || c?.puppet ? 0 : c?.still ? 2.2 : 1; // photos breathe a bit
    for (const L of this.layers) L.place(this.dir, breath * 0.006 * still);
  }

  /** The clip she should be playing right now because of what's going on (a reaction, or what you're doing). */
  #wanted() {
    const st = this.stateName;
    if (st === 'activity' && this.doing) return this.doing;
    if (st === 'sleep' || (/asleep/.test(this.face?.expression ?? '') && st !== 'sleepy')) return pick(['q_curled', 'curled']);
    return pick(FOR_STATE[st]);
  }

  animate(dt) {
    this.time += dt;
    if (!this.act) { this.#next(); if (!this.act) return; } // her first clip is still loading
    if (this.pending && !this.#busy) { const p = this.pending; this.pending = null; p(); }
    // the rest of her moves load quietly in the background, one every couple of seconds
    this.preloadT = (this.preloadT ?? 0) + dt;
    if (this.preloadT > 2.5) {
      this.preloadT = 0;
      const next = PRELOAD.find((k) => has(k) && !CLIPS[k].base);
      if (next) ready(next);
    }
    const walking = this.walkAmount > 0.15;
    const want = walking ? null : this.#wanted();
    const A = this.act;
    if (walking && !this.#busy) {
      const fast = Math.abs(this.speed ?? 0) > 1.25 && has('p_run');
      const clip = fast ? 'p_run' : WALK_CLIP, W = CLIPS[clip].meta;
      if (A.clip !== clip) {
        // in another pose: get up first (quickly); then walk
        if (family(A.clip) !== 'STAND') this.#goTo(clip, () => this.#start(clip, 0, W.frames, W.fps, 0, null, { walk: true }), 2);
        else this.#start(clip, 0, W.frames, W.fps, 0, null, { walk: true });
      } else {
        // the walk plays at the speed she's moving (a stride covers about 0.9 body lengths a second)
        A.frame = (A.frame + dt * W.fps * clamp(Math.abs(this.speed ?? 0) / (fast ? 1.6 : 0.9), 0.5, 1.6)) % W.frames;
      }
    } else if (want && !this.#busy) {
      if (A.clip !== want || !A.react) {
        const fam = family(want);
        if (!this.#goTo(want, () => this.#play(want, { react: true }), 1.8)) this.#step(dt, () => this.#next());
        void fam;
      } else this.#step(dt, () => (CLIPS[want].loop ? this.#play(want, { react: true }) : null));
    } else if (!this.#busy && (A.walk || A.react) && !walking) {
      this.#next(); // stopped walking, or the reaction / activity is over
    } else {
      this.#step(dt, () => this.#next());
    }
    // draw: current layer at its frame, crossfading over the previous one (narrowing while she turns)
    this.fade = Math.min(1, this.fade + dt / this.fadeTime);
    const cur = this.layers[this.cur], old = this.layers[1 - this.cur];
    cur.set(this.act.clip, this.act.frame);
    cur.mat.opacity = this.fade;
    old.mat.opacity = 1 - this.fade;
    const k = this.turning ? Math.sin(this.fade * Math.PI) : 0;
    cur.squash = this.turning ? 0.45 + 0.55 * this.fade : 1;
    old.squash = this.turning ? 1 - 0.55 * this.fade : 1;
    void k;
    cur.mesh.renderOrder = 3;
    old.mesh.renderOrder = 2;
  }

  /** Plays the current stretch; at its end holds (if asked), then runs `then` or `done`. */
  #step(dt, done) {
    const A = this.act;
    const step = A.fps * dt;
    if ((step > 0 && A.frame + step >= A.b) || (step < 0 && A.frame + step <= A.b) || step === 0) {
      A.frame = A.b;
      if (A.hold > 0) A.hold -= dt;
      else if (A.then) { const t = A.then; A.then = null; t(); }
      else done?.();
    } else A.frame += step;
  }
}
