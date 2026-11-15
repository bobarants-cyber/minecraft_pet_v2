import * as THREE from 'three';
import walkUrl from '../../assets/cat/walk.webp?url';
import WALK from '../../assets/cat/walk.json';
import crouchUrl from '../../assets/cat/crouch.webp?url';
import CROUCH from '../../assets/cat/crouch.json';
import lieUrl from '../../assets/cat/liedown.webp?url';
import LIE from '../../assets/cat/liedown.json';
import frontUrl from '../../assets/cat/front.webp?url';
import FRONT from '../../assets/cat/front.json';
import { FaceDisplay } from '../bee/face/FaceDisplay.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/**
 * Her animations, cut out of the user's own videos of her (AI background removal, cleaned, lined up on her feet).
 * frameH = the frame's height on screen in world units, chosen so her body is the same size in every clip
 * (the clips were filmed from different distances).
 *   walk  – her real walk across the rug (IMG_6647), looped
 *   sit   – crouched, tail swishing (IMG_6648), looped
 *   lie   – lying down and stretching out on her side (end of IMG_6648), played once, then held
 */
const ANIMS = {
  walk: { url: walkUrl, meta: WALK, frameH: 0.95, loop: true },
  front: { url: frontUrl, meta: FRONT, frameH: 0.7, loop: true, noFlip: true }, // settled facing you, looking around (IMG_6644)
  sit: { url: crouchUrl, meta: CROUCH, frameH: 0.82, loop: true },
  lie: { url: lieUrl, meta: LIE, frameH: 0.8, loop: false },
};

/**
 * The user's own cat, for real: a grumpy tortoiseshell. She's a flat cut-out that always faces the camera (like a
 * photo standing up), flipped to face the way she goes. Walking plays her real walk; standing still she crouches
 * with her tail swishing; when she gets sleepy she lies down and stretches out.
 */
export class RealCat {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'realCat';
    const hips = new THREE.Group();
    const torso = new THREE.Group();
    const head = new THREE.Group();
    this.root.add(hips);
    hips.add(torso);
    torso.add(head);
    this.joints = { hips, torso, head };
    this.face = new FaceDisplay();
    const W0 = (ANIMS.walk.frameH * WALK.w) / WALK.h;
    head.position.set(W0 * 0.36, ANIMS.walk.frameH * 0.62, 0.02); // where her head is (for gaze and emotes)
    this.height = ANIMS.walk.frameH;
    this.halfWidth = W0 * 0.46;
    this.emoteLift = 0.9;
    this.walkAmount = 0;
    this.walkPhase = 0;
    this.time = 0;
    this.dir = 1;

    for (const a of Object.values(ANIMS)) {
      const t = new THREE.TextureLoader().load(a.url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.repeat.set(1 / a.meta.cols, 1 / a.meta.rows);
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.anisotropy = 4;
      a.tex = t;
      a.w = (a.frameH * a.meta.w) / a.meta.h;
    }
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0); // feet on the floor
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.04, depthWrite: false });
    this.sprite = new THREE.Mesh(geo, this.mat);
    this.sprite.renderOrder = 2;
    torso.add(this.sprite);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(W0 * 0.38, ANIMS.walk.frameH * 0.1, 1);
    sh.position.y = 0.004;
    this.shadow = new THREE.Group(); // turned back each frame so the shadow stays level with the floor
    this.shadow.add(sh);
    hips.add(this.shadow);
    this.parts = { loaded: true, ready: Promise.resolve(), head, arms: [], legs: [] };
    this.#play('front');
    this.idleLoops = 0;
  }

  #play(name) {
    if (this.anim === name) return;
    this.anim = name;
    this.frame = 0;
    const a = ANIMS[name];
    this.mat.map = a.tex;
    this.mat.needsUpdate = true;
    this.#show(0);
  }

  #show(i) {
    const a = ANIMS[this.anim], m = a.meta;
    const c = i % m.cols, r = Math.floor(i / m.cols);
    a.tex.offset.set(c / m.cols, 1 - (r + 1) / m.rows);
  }

  /** She doesn't wear glasses, hats or hold things (she's a photo of a real cat). */
  setGlasses() {}
  anchor() {
    return null;
  }

  applyPose(p, breath = 0) {
    this.joints.hips.position.y = (p.bodyY ?? 0) * 0.3;
    // always face the camera (the character turns the root towards where it walks), flipped to face her way
    this.sprite.rotation.y = -this.root.rotation.y;
    this.shadow.rotation.y = -this.root.rotation.y;
    if (Math.abs(this.speed ?? 0) > 0.05) this.dir = Math.sign(this.speed);
    const a = ANIMS[this.anim];
    const still = this.anim === 'walk' ? 0 : 1;
    this.sprite.scale.set(a.w * (a.noFlip ? 1 : this.dir), a.frameH * (1 + breath * 0.006 * still), 1);
  }

  animate(dt) {
    this.time += dt;
    const sleepy = /asleep|sleepy/.test(this.face?.expression ?? '');
    if (this.walkAmount > 0.15) this.#play('walk');
    else if (sleepy) this.#play('lie');
    else if (this.anim === 'walk' || this.anim === 'lie') { this.#play('front'); this.idleLoops = 0; }
    const a = ANIMS[this.anim], m = a.meta;
    // idle: mostly sitting facing you; every few loops she does the tail-swishing crouch, then turns back
    if ((this.anim === 'front' || this.anim === 'sit') && this.frame + dt * m.fps >= m.frames) {
      this.idleLoops++;
      const next = this.anim === 'front' && this.idleLoops % 3 === 0 ? 'sit' : 'front';
      if (next !== this.anim) { this.#play(next); return; }
    }
    // the walk plays at the speed she's moving (the clip was filmed at about 0.9 body lengths per second)
    const rate = this.anim === 'walk' ? clamp(Math.abs(this.speed ?? 0) / 0.9, 0.5, 1.6) : 1;
    this.frame += dt * m.fps * rate;
    this.frame = a.loop ? this.frame % m.frames : Math.min(this.frame, m.frames - 1);
    this.#show(Math.floor(this.frame));
  }
}
