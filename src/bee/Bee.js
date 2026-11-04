import { BEE_HEIGHT, HOVER, buildBeeRig } from './BeeRig.js';
import { FaceDisplay } from './face/FaceDisplay.js';

const FLAP_SPEED = 42;
const LEG_LENGTH = 0.2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class Bee {
  constructor() {
    const { root, joints, parts } = buildBeeRig();
    this.root = root;
    this.joints = joints;
    this.parts = parts;
    this.face = new FaceDisplay();

    this.height = BEE_HEIGHT;
    this.halfWidth = 0.75;
    this.emoteLift = 0.95;

    this.flapPhase = 0;
    this.bobPhase = Math.random() * 10;
    /** 0 = flying, 1 = landed (set from the pose each frame). */
    this.grounded = 0;
    this.lean = 0;
    this.climb = 0;
  }

  applyPose(p, breath = 0) {
    const j = this.joints;
    const sit = clamp(p.sit, 0, 1);
    this.grounded = sit;

    const bob = Math.sin(this.bobPhase) * 0.045 * (1 - sit);
    j.hips.position.y = HOVER * (1 - sit) + LEG_LENGTH * sit + p.bodyY + bob - p.crouch * 0.5;

    const squash = 1 - p.crouch * 1.5;
    j.torso.scale.set(1 / Math.sqrt(squash) + breath * 0.004, squash + breath * 0.01, 1 / Math.sqrt(squash));

    j.torso.rotation.set(
      (p.torsoPitch * 0.5 + p.headPitch * 0.45) * (1 - 0.6 * sit) + this.lean - this.climb * 0.18,
      p.torsoYaw + p.headYaw * 0.6,
      p.torsoRoll + p.headRoll * 0.8,
    );

    if (!this.parts.loaded) return;
    // Model space: face -z, antennae point forward from the top-front edge, legs are flat plates under the body.
    const [aR, aL] = this.parts.antennae;
    aL.rotation.set(p.armRaiseL * 0.3 + p.headPitch * 0.3, 0, 0.1 + p.armSwingL * 0.3 + p.wristL * 0.4);
    aR.rotation.set(p.armRaiseR * 0.3 + p.headPitch * 0.3, 0, -0.1 - p.armSwingR * 0.3 - p.wristR * 0.4);

    this.parts.legs.forEach((leg, i) => {
      const swing = i % 2 === 0 ? p.legSwingL : p.legSwingR;
      leg.rotation.x = -0.55 * (1 - sit) - swing * 0.8;
    });
  }

  animate(dt) {
    this.bobPhase += dt * 3.2;
    const flying = 1 - this.grounded;
    this.flapPhase += dt * FLAP_SPEED * (0.25 + 0.75 * flying);
    const flap = Math.sin(this.flapPhase) * (0.08 + 0.3 * flying);
    if (!this.parts.loaded) return;
    const [wR, wL] = this.parts.wings; // model-space right (+x) and left (-x)
    const rest = 0.15 * flying;
    wR.rotation.z = flap + rest;
    wL.rotation.z = -flap - rest;

    this.parts.face.apply(this.face);
  }
}
