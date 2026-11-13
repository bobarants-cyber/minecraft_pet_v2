import { BBOKARI_HEIGHT, HOVER, buildBbokariRig } from './BbokariRig.js';
import { FaceDisplay } from '../bee/face/FaceDisplay.js';
import { buildGlasses } from '../character/Props.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/**
 * A chubby chick that walks on its stubby legs and, when it takes to the air, flaps its little arms like wings.
 * Same surface as the other mobs: root, joints, face, height, halfWidth, emoteLift, applyPose(), animate().
 */
export class Bbokari {
  /** Other mobs built the same way (Wolf Chan) pass their own rig and sizes. */
  constructor(rig = buildBbokariRig(), sizes = {}) {
    const { root, joints, parts } = rig;
    this.root = root;
    this.joints = joints;
    this.parts = parts;
    this.face = new FaceDisplay();

    this.height = sizes.height ?? BBOKARI_HEIGHT;
    this.halfWidth = sizes.halfWidth ?? 0.42;
    this.emoteLift = sizes.emoteLift ?? 0.8;
    this.hover = sizes.hover ?? HOVER;
    /** Where the hands are, from the shoulder joint (model units). */
    this.hand = sizes.hand ?? [0.1, -0.13, 0.05];

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

  /** Glasses on or off (for typing and thinking); `style` picks other lenses, e.g. red/blue 3D glasses. */
  setGlasses(on, style = {}) {
    if (!this.parts.loaded) return;
    this.allGlasses ??= {};
    const key = JSON.stringify(style);
    if (on && !this.allGlasses[key]) {
      this.allGlasses[key] = buildGlasses(this.parts.eyes.eyes, style);
      this.parts.head.add(this.allGlasses[key]);
    }
    for (const [k, g] of Object.entries(this.allGlasses)) g.visible = on && k === key;
    this.glasses = this.allGlasses[key];
  }

  /** Where scene props go: 'head' (worn) or 'handR' / 'handL' (held), as { parent, at } in model units. */
  anchor(slot) {
    if (!this.parts.loaded) return null;
    if (slot === 'head') return { parent: this.parts.head, at: null };
    if (slot === 'handR') return { parent: this.parts.arms[0], at: [...this.hand] };
    if (slot === 'handL') return { parent: this.parts.arms[1], at: [-this.hand[0], this.hand[1], this.hand[2]] };
    return null;
  }

  /** Put something (a ping pong paddle) in Bbokari's right hand. */
  holdItem(item) {
    const attach = () => {
      const arm = this.parts.arms[0];
      // The hand is at the end of the arm bone: model units, relative to the shoulder joint.
      item.position.set(...this.hand);
      item.rotation.set(0, 0, -0.35);
      arm.add(item);
    };
    if (this.parts.loaded) attach();
    else this.parts.ready.then(attach);
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
    j.hips.position.y = this.hover * (1 - sit) + p.bodyY + bob + step - p.crouch * 0.4;

    const squash = 1 - p.crouch * 1.4;
    j.torso.scale.set(1 / Math.sqrt(squash) + breath * 0.004, squash + breath * 0.008, 1 / Math.sqrt(squash));
    const waddle = Math.sin(this.walkPhase) * 0.07 * this.walkAmount * (1 - this.airborne);
    j.torso.rotation.set(p.torsoPitch * 0.6 + this.lean * 0.4 - this.climb * 0.12, p.torsoYaw, p.torsoRoll + waddle);

    if (!this.parts.loaded) return;
    const [armR, armL] = this.parts.arms;
    const flap = Math.sin(this.flapPhase) * 0.4 * this.airborne;
    // Stubby arms: raising lifts them out sideways, but never above the shoulders (they'd vanish behind the big
    // head), and brings them a little forward so a wave stays in view. Swing brings them forward; wrist wiggles.
    const arm = (raise, swing, elbow, wrist, twist) => {
      const up = Math.min(1.1, raise * 0.5) + wrist * 0.22 + flap + 0.45 * this.airborne;
      return [-swing * 0.8 - elbow * 0.2 - Math.min(1, raise * 0.5) * 0.45, twist * 0.3, 0.06 + up];
    };
    const [rx, ry, rz] = arm(p.armRaiseR, p.armSwingR, p.elbowR, p.wristR, p.armTwistR);
    armR.rotation.set(rx, ry, rz);
    const [lx, ly, lz] = arm(p.armRaiseL, p.armSwingL, p.elbowL, p.wristL, p.armTwistL);
    armL.rotation.set(lx, -ly, -lz);

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
    const h = (this.parts.head ?? this.joints.head).rotation;
    h.x += (p.headPitch * 0.6 - h.x) * k;
    h.y += (p.headYaw * 0.7 - h.y) * k;
    h.z += (p.headRoll * 0.6 - h.z) * k;

    if (this.parts.loaded) this.parts.eyes.apply(this.face, dt);
  }
}
