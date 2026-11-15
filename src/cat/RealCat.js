import * as THREE from 'three';
import walkUrl from '../../assets/cat/walk.webp?url';
import WALK from '../../assets/cat/walk.json';
import frontUrl from '../../assets/cat/front.webp?url';
import FRONT from '../../assets/cat/front.json';
import crouchUrl from '../../assets/cat/crouch.webp?url';
import CROUCH from '../../assets/cat/crouch.json';
import lieUrl from '../../assets/cat/liedown.webp?url';
import LIE from '../../assets/cat/liedown.json';
import { FaceDisplay } from '../bee/face/FaceDisplay.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rand = (a, b) => a + Math.random() * (b - a);
const FADE = 0.4; // seconds of crossfade between moves (hides the cuts)

/**
 * Mike's clips, all cut out of the user's own videos of her (AI background removal, cleaned, lined up on her body).
 * frameH = frame height on screen (world units), chosen so her body is the same size in every clip.
 *   walk   – her real walk across the rug (IMG_6647)
 *   front  – settled facing you, looking around, tail flicking (IMG_6644)
 *   crouch – crouched, tail swishing (IMG_6648)
 *   lie    – lying down and stretching out on her side (end of IMG_6648); played backwards she gets up
 */
const CLIPS = {
  walk: { url: walkUrl, meta: WALK, frameH: 0.95 },
  front: { url: frontUrl, meta: FRONT, frameH: 0.72, noFlip: true },
  crouch: { url: crouchUrl, meta: CROUCH, frameH: 0.82 },
  lie: { url: lieUrl, meta: LIE, frameH: 0.8 },
};

/** One layer of her picture (two of them crossfade when she changes what she's doing). */
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
  place(dir, breath) {
    const c = CLIPS[this.clip];
    if (!c) return;
    const w = (c.frameH * c.meta.w) / c.meta.h;
    // her paws (the clip's typical floor row) sit on the floor
    this.mesh.position.y = -(1 - c.meta.ground) * c.frameH;
    this.mesh.scale.set(w * (c.noFlip ? 1 : dir), c.frameH * (1 + breath), 1);
  }
}

/**
 * Mike, the user's own cat, for real: a grumpy tortoiseshell. A flat cut-out of her that always faces the camera.
 * She never just repeats one loop: while she's chilling she strings together random stretches of her real footage
 * (looking around, sometimes pausing; the tail-swishing crouch; lying down for a while and getting back up), played
 * forwards or backwards at slightly different speeds, with soft crossfades between them. Walking plays her walk.
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
    const W0 = (CLIPS.walk.frameH * WALK.w) / WALK.h;
    head.position.set(W0 * 0.36, CLIPS.walk.frameH * 0.55, 0.02);
    this.height = CLIPS.walk.frameH * WALK.ground;
    this.halfWidth = W0 * 0.46;
    this.emoteLift = 0.85;
    this.walkAmount = 0;
    this.walkPhase = 0;
    this.time = 0;
    this.dir = 1;
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
    const sh = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(W0 * 0.36, CLIPS.walk.frameH * 0.09, 1);
    sh.position.y = 0.004;
    this.shadow = new THREE.Group();
    this.shadow.add(sh);
    hips.add(this.shadow);
    this.parts = { loaded: true, ready: Promise.resolve(), head, arms: [], legs: [] };
    this.act = null;
    this.#next('look');
  }

  // ---------- what she's doing ----------
  /** Starts a move: a stretch of one clip, from frame a to b at some speed, optionally holding the last frame. */
  #start(clip, a, b, fps, hold = 0, then = null) {
    const prev = this.act;
    const contiguous = prev && prev.clip === clip && Math.abs(prev.frame - a) < 1.5;
    this.act = { clip, frame: a, a, b, fps: Math.abs(fps) * Math.sign(b - a || 1), hold, then };
    if (!contiguous && prev) { this.cur = 1 - this.cur; this.fade = 0; } // crossfade into the new move
    this.layers[this.cur].set(clip, a);
  }

  #next(kind) {
    const pick = kind ?? this.#choose();
    const span = (clip, min, max) => {
      const n = CLIPS[clip].meta.frames, len = Math.round(rand(min, max));
      const a = Math.floor(rand(0, Math.max(1, n - len)));
      return Math.random() < 0.5 ? [a, a + len] : [a + len, a]; // forwards or backwards
    };
    if (pick === 'look') {
      const [a, b] = span('front', 14, 40);
      this.#start('front', a, b, rand(7, 11), Math.random() < 0.45 ? rand(0.6, 2.2) : 0);
    } else if (pick === 'swish') {
      const [a, b] = span('crouch', 18, 45);
      this.#start('crouch', a, b, rand(8, 11), Math.random() < 0.3 ? rand(0.5, 1.5) : 0);
    } else if (pick === 'liedown') {
      // lie down, stay a while (breathing), then get back up (the same clip backwards)
      const n = CLIPS.lie.meta.frames - 1;
      this.#start('lie', 0, n, 9, rand(4, 11), () => this.#start('lie', n, 0, 9, 0, null));
    }
    this.lastKind = pick;
  }

  #choose() {
    const w = { look: 0.55, swish: 0.3, liedown: 0.15 };
    if (this.lastKind === 'liedown') w.liedown = 0;
    if (this.lastKind === 'swish') w.swish *= 0.4;
    let r = Math.random() * (w.look + w.swish + w.liedown);
    for (const [k, v] of Object.entries(w)) if ((r -= v) <= 0) return k;
    return 'look';
  }

  /** She doesn't wear glasses, hats or hold things (she's a real cat). */
  setGlasses() {}
  anchor() {
    return null;
  }

  applyPose(p, breath = 0) {
    this.joints.hips.position.y = 0;
    this.view.rotation.y = -this.root.rotation.y;
    this.shadow.rotation.y = -this.root.rotation.y;
    if (Math.abs(this.speed ?? 0) > 0.05) this.dir = Math.sign(this.speed);
    const still = this.act?.clip === 'walk' ? 0 : 1;
    for (const L of this.layers) L.place(this.dir, breath * 0.006 * still);
  }

  animate(dt) {
    this.time += dt;
    const sleepy = /asleep|sleepy/.test(this.face?.expression ?? '');
    const walking = this.walkAmount > 0.15;
    const A = this.act;
    if (walking) {
      if (A.clip !== 'walk') this.#start('walk', 0, WALK.frames, 30);
      // her walk plays at the speed she's moving (filmed at about 0.9 body lengths per second)
      A.frame = (A.frame + dt * WALK.fps * clamp(Math.abs(this.speed ?? 0) / 0.9, 0.5, 1.6)) % WALK.frames;
    } else if (A.clip === 'walk') {
      this.#next('look');
    } else if (sleepy && !(A.clip === 'lie' && A.b > A.a)) {
      this.#start('lie', A.clip === 'lie' ? A.frame : 0, CLIPS.lie.meta.frames - 1, 9, 1e9); // lie down and stay
    } else if (!sleepy && A.clip === 'lie' && A.hold > 1e8) {
      this.#start('lie', A.frame, 0, 9); // woke up: get up
    } else {
      // play the current stretch; at its end hold (if asked), then move on
      const end = A.b;
      const step = A.fps * dt;
      if ((step > 0 && A.frame + step >= end) || (step < 0 && A.frame + step <= end)) {
        A.frame = end;
        if (A.hold > 0) A.hold -= dt;
        else if (A.then) { const t = A.then; A.then = null; t(); }
        else this.#next();
      } else A.frame += step;
    }
    // draw: current layer at its frame, crossfading over the previous one
    this.fade = Math.min(1, this.fade + dt / FADE);
    const cur = this.layers[this.cur], old = this.layers[1 - this.cur];
    cur.set(this.act.clip, this.act.frame);
    cur.mat.opacity = this.fade;
    old.mat.opacity = 1 - this.fade;
    cur.mesh.renderOrder = 3;
    old.mesh.renderOrder = 2;
  }
}
