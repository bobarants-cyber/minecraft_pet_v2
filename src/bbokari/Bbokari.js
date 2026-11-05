import { BBOKARI_HEIGHT, HOVER, buildBbokariRig } from './BbokariRig.js';
import { FaceDisplay } from '../bee/face/FaceDisplay.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/**
 * A chubby chick that walks on its stubby legs and, when it takes to the air, flaps its little arms like wings.
 * Same surface as the other mobs: root, joints, face, height, halfWidth, emoteLift, applyPose(), animate().
 */
export class Bbokari {
  constructor() {
    const { root, joints, parts } = buildBbokariRig();
    this.root = root;
    this.joints = joints;
    this.parts = parts;
    this.face = new FaceDisplay();

    this.height = BBOKARI_HEIGHT;
    this.halfWidth = 0.42;
    this.emoteLift = 0.8;

    this.time = Math.random() * 10;
    this.bobPhase = Math.random() * 10;
    this.flapPhase = 0;
    /** 0 = flying, 1 = standing (set from the pose each frame). */
    this.grounded = 1;
    this.airborne = 0;
    this.lift = 0;
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

    // How high above the floor it is (scale-relative, set by Character), eased into a 0-1 "flying" amount.
    this.airborne += (clamp((this.lift ?? 0) / 0.25, 0, 1) * (1 - sit) - this.airborne) * 0.15;

    const bob = Math.sin(this.bobPhase) * 0.03 * this.airborne;
    // A little waddle: the body rises at each step.
    const step = Math.abs(Math.sin(this.walkPhase)) * 0.025 * this.walkAmount * (1 - this.airborne);
    j.hips.position.y = HOVER * (1 - sit) + p.bodyY + bob + step - p.crouch * 0.4;

    const squash = 1 - p.crouch * 1.4;
    j.torso.scale.set(1 / Math.sqrt(squash) + breath * 0.004, squash + breath * 0.008, 1 / Math.sqrt(squash));
    const waddle = Math.sin(this.walkPhase) * 0.07 * this.walkAmount * (1 - this.airborne);
    j.torso.rotation.set(p.torsoPitch * 0.6 + this.lean * 0.4 - this.climb * 0.12, p.torsoYaw, p.torsoRoll + waddle);

    if (!this.parts.loaded) return;
    const [armR, armL] = this.parts.arms;
    const flap = Math.sin(this.flapPhase) * 0.55 * this.airborne;
    // Arm raise lifts the arm out sideways (wave, cheer); swing brings it forward; elbow/wrist add a wiggle.
    armR.rotation.set(-p.armSwingR * 0.9 - p.elbowR * 0.25, p.armTwistR * 0.3, 0.08 + p.armRaiseR * 0.85 + p.wristR * 0.35 + flap + 0.5 * this.airborne);
    armL.rotation.set(-p.armSwingL * 0.9 - p.elbowL * 0.25, -p.armTwistL * 0.3, -(0.08 + p.armRaiseL * 0.85 + p.wristL * 0.35 + flap + 0.5 * this.airborne));

    const [legR, legL] = this.parts.legs;
    const stride = Math.sin(this.walkPhase) * 0.45 * this.walkAmount * (1 - this.airborne);
    const dangle = 0.25 * this.airborne;
    legR.rotation.set(stride - p.legSwingR * 0.8 - dangle, 0, p.legSpreadR * 0.3);
    legL.rotation.set(-stride - p.legSwingL * 0.8 - dangle, 0, -p.legSpreadL * 0.3);
  }

  animate(dt) {
    this.time += dt;
    this.bobPhase += dt * 2.4;
    this.flapPhase += dt * (10 + 14 * this.airborne);
    if (!this.pose) return;
    const p = this.pose;

    // The head is a real joint, so ease it rather than following every eye saccade.
    const k = 1 - Math.exp(-9 * dt);
    const h = this.joints.head.rotation;
    h.x += (p.headPitch * 0.6 - h.x) * k;
    h.y += (p.headYaw * 0.7 - h.y) * k;
    h.z += (p.headRoll * 0.6 - h.z) * k;

    if (this.parts.loaded) this.parts.eyes.apply(this.face, dt);
  }
}
