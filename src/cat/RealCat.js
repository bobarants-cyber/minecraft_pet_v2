import * as THREE from 'three';
import walkUrl from '../../assets/cat/walk.webp?url';
import WALK from '../../assets/cat/walk.json';
import { FaceDisplay } from '../bee/face/FaceDisplay.js';

/** Her height on screen (world units, the frame's full height; the other pets are about 1.3–1.4 tall). */
const FRAME_H = 0.95;
const FRAME_W = (FRAME_H * WALK.w) / WALK.h;
/** The frame she stands still on (all four paws down). */
const IDLE_FRAME = 12;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/**
 * The user's own cat, for real: a grumpy tortoiseshell, cut out of a video of her walking (scripts in the
 * repo's cat notes: frames cut out with an AI background remover, cleaned, lined up on her feet, looped).
 * She's a flat cut-out that always faces the camera (like a photo standing up), flipped to face the way she walks.
 * Walking plays her real walk; standing still shows her standing, breathing gently.
 */
export class RealCat {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'realCat';
    const hips = new THREE.Group();
    const torso = new THREE.Group();
    const head = new THREE.Group();
    head.position.set(FRAME_W * 0.36, FRAME_H * 0.62, 0.02); // where her head is in the frames (for gaze and emotes)
    this.root.add(hips);
    hips.add(torso);
    torso.add(head);
    this.joints = { hips, torso, head };
    this.face = new FaceDisplay();
    this.height = FRAME_H;
    this.halfWidth = FRAME_W * 0.46;
    this.emoteLift = 0.9;
    this.walkAmount = 0;
    this.walkPhase = 0;
    this.time = 0;
    this.frame = IDLE_FRAME;
    this.dir = 1;

    const tex = new THREE.TextureLoader().load(walkUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.repeat.set(1 / WALK.cols, 1 / WALK.rows);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 4;
    this.tex = tex;
    const geo = new THREE.PlaneGeometry(FRAME_W, FRAME_H);
    geo.translate(0, FRAME_H / 2, 0); // feet on the floor
    this.sprite = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.04, depthWrite: false }));
    this.sprite.renderOrder = 2;
    torso.add(this.sprite);
    // a soft shadow under her
    const sh = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(FRAME_W * 0.38, FRAME_H * 0.1, 1);
    sh.position.y = 0.004;
    this.shadow = new THREE.Group(); // turned back each frame so the shadow stays level with the floor
    this.shadow.add(sh);
    hips.add(this.shadow);
    this.parts = { loaded: true, ready: Promise.resolve(), head, arms: [], legs: [] };
    this.#show(IDLE_FRAME);
  }

  #show(i) {
    const c = i % WALK.cols, r = Math.floor(i / WALK.cols);
    this.tex.offset.set(c / WALK.cols, 1 - (r + 1) / WALK.rows);
  }

  /** She doesn't wear glasses, hats or hold things (she's a photo of a real cat). */
  setGlasses() {}
  anchor() {
    return null;
  }

  applyPose(p, breath = 0) {
    const sit = clamp(p.sit ?? 0, 0, 1);
    this.joints.hips.position.y = (p.bodyY ?? 0) * 0.5 * (1 - sit);
    // always face the camera (the character turns the root towards where it walks), flipped to face her way
    this.sprite.rotation.y = -this.root.rotation.y;
    this.shadow.rotation.y = -this.root.rotation.y;
    if (Math.abs(this.speed ?? 0) > 0.05) this.dir = Math.sign(this.speed);
    this.sprite.scale.x = this.dir;
    // breathing while standing (her body rises and falls a little)
    const still = 1 - clamp(this.walkAmount * 3, 0, 1);
    this.sprite.scale.y = 1 + breath * 0.006 * still;
  }

  animate(dt) {
    this.time += dt;
    if (this.walkAmount > 0.15) {
      // her walk plays at the speed she's moving (the clip was filmed at about 0.9 body lengths per second)
      this.frame = (this.frame + dt * WALK.fps * clamp(Math.abs(this.speed ?? 0) / 0.9, 0.5, 1.6)) % WALK.frames;
    } else {
      this.frame = IDLE_FRAME;
    }
    this.#show(Math.floor(this.frame));
  }
}
