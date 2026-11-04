import { AXOLOTL_HEIGHT, HOVER, buildAxolotlRig } from './AxolotlRig.js';
import { FaceDisplay } from '../bee/face/FaceDisplay.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class Axolotl {
  constructor() {
    const { root, joints, parts } = buildAxolotlRig();
    this.root = root;
    this.joints = joints;
    this.parts = parts;
    this.face = new FaceDisplay();

    this.height = AXOLOTL_HEIGHT;
    this.halfWidth = 0.9;
    this.emoteLift = 0.8;

    /** Waving arms reads as nothing on gills, so wave becomes a happy hop instead. */
    this.stateAliases = { wave: 'happy' };

    this.time = Math.random() * 10;
    this.bobPhase = Math.random() * 10;
    // Speed-dependent rhythms accumulate phase per frame; `sin(t * f(speed))` would jump whenever the speed changes.
    this.tailPhase = Math.random() * 10;
    this.paddlePhase = Math.random() * 10;
    /** 0 = swimming, 1 = standing on the floor (set from the pose each frame). */
    this.grounded = 0;
    this.lean = 0;
    this.climb = 0;
    this.walkAmount = 0;
    this.walkPhase = 0;
    this.pose = null;
  }

  applyPose(p, breath = 0) {
    const j = this.joints;
    const sit = clamp(p.sit, 0, 1);
    this.grounded = sit;
    this.pose = p;

    const bob = Math.sin(this.bobPhase) * 0.035 * (1 - sit);
    j.hips.position.y = HOVER * (1 - sit) + this.parts.legLength * sit + p.bodyY + bob - p.crouch * 0.5;

    const squash = 1 - p.crouch * 1.5;
    j.torso.scale.set(1 / Math.sqrt(squash) + breath * 0.004, squash + breath * 0.01, 1 / Math.sqrt(squash));

    j.torso.rotation.set(p.torsoPitch * (1 - 0.6 * sit) + this.lean * 0.6 - this.climb * 0.15, p.torsoYaw, p.torsoRoll);
  }

  animate(dt) {
    this.time += dt;
    this.bobPhase += dt * 2.6;
    if (!this.pose) return;
    const p = this.pose;

    // The head is a real joint here, so eye saccades would read as head flicks; ease it separately.
    // The head pivot lives inside the model group (which is yawed 180° to face the camera), so pitch and roll flip sign.
    const k = 1 - Math.exp(-9 * dt);
    const h = this.joints.head.rotation;
    h.x += (-p.headPitch * 0.7 - h.x) * k;
    h.y += (p.headYaw * 0.7 - h.y) * k;
    h.z += (-p.headRoll * 0.7 - h.z) * k;

    if (!this.parts.loaded) return;
    const t = this.time;
    const swim = 1 - this.grounded;
    const move = this.walkAmount;
    this.tailPhase += dt * (2.2 + 4 * move);
    this.paddlePhase += dt * (3 + 3 * move);

    // Tail sweeps side to side: lazily while hovering, quicker while travelling.
    this.parts.tail.rotation.y = Math.sin(this.tailPhase) * (0.12 + 0.3 * move + 0.08 * swim);

    // Gills flutter; the arm channels flare them (shrug, wave, carried).
    const [top, right, left] = this.parts.gills;
    top.rotation.x = -Math.sin(t * 2.1) * 0.08 - (p.armRaiseL + p.armRaiseR) * 0.15;
    right.rotation.z = 0.08 + Math.sin(t * 2.3) * 0.06 + p.armRaiseR * 0.35 + p.armSwingR * 0.25;
    left.rotation.z = -(0.08 + Math.sin(t * 2.3 + 1) * 0.06 + p.armRaiseL * 0.35 + p.armSwingL * 0.25);

    // Legs trail back and paddle while swimming, step in diagonal pairs on the floor, and dangle via legSwing.
    this.parts.legs.forEach((leg, i) => {
      const isLeft = i === 0 || i === 3;
      const diag = i === 0 || i === 2 ? 0 : Math.PI;
      const swing = isLeft ? p.legSwingL : p.legSwingR;
      const paddle = Math.sin(this.paddlePhase + diag) * (0.25 + 0.2 * move);
      const step = Math.sin(this.walkPhase + diag) * 0.5 * move;
      leg.rotation.x = (-0.9 + paddle) * swim + step * this.grounded - swing * 0.8;
    });

    this.parts.face.apply(this.face);
  }
}
