import figureGlb from '../../assets/models/sunoo.glb?inline';
import { buildSculptRig } from '../bbokari/BbokariRig.js';
import * as THREE from 'three';
import { Bbokari } from '../bbokari/Bbokari.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
/** The hand end of each pocket arm, from its shoulder joint (model units). */
const TIP_L = [-0.017, -0.133, 0.026], TIP_R = [0.014, -0.14, 0.004];

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
/** The GLB is height 1 (feet at y = 0, face towards +z); his height in world units. */
const MODEL_HEIGHT = 1.26; // the user's chosen proportions: size 1.4, head 1.12, chubby 1.05
const HEAD = 1.12, CHUB = 1.05;
/** Where the second pocket arm sits (offset x, y, z from the mirror, then tilt forward, tilt out): beside his body, into his pocket. */
const POCKET_FIX = [0, 0, 0, 0, 0]; // an exact mirror of his left arm (the shirt's right half is mirrored too)
export const SUNOO_HEIGHT = MODEL_HEIGHT;

/**
 * The user's own 3D-print file of a vinyl-figure style Sunoo (ENHYPEN), put back together from its 16 printable parts
 * (kept for personal use in this app). Big head with blond hair, black bead eyes, white tee, navy cargo trousers,
 * two-tone sneakers, a grey backpack, one hand in his pocket and the other up in a V sign.
 * He's a little figure standing on the desk: feet on the floor (no hovering, no flapping), both arms stay in their
 * sculpted pose (they're single printed pieces, and the straps, pouch and wristband stay with them), and he moves
 * like a toy: little hops and a side-to-side rock when he walks, a bob and a tilt of his big head, a bounce when happy.
 */
export class SunooFigure extends Bbokari {
  constructor() {
    super(
      buildSculptRig({ name: 'sunoo', glb: figureGlb, modelHeight: MODEL_HEIGHT, headStandIn: 0.55, eyes: false }),
      { height: SUNOO_HEIGHT, halfWidth: 0.3, emoteLift: 0.85, hover: 0, hand: [0.06, -0.14, 0.05], armScale: 0 },
    );
    this.outfitOffset = [0, 0.02, 0.02];
    this.outfitScale = 0.85;
    this.kpopFit = [0, 0.08, 0.02, 0.85];
    // headphones sized to his big head (head-local model units)
    this.headFit = { side: 0.215, cupY: 0.115, cupZ: -0.005, top: 0.425, bandZ: -0.03, square: 0.75, mouth: [0, 0.03, 0.2] }; // cups on his ears, just outside the hair
    this.parts.ready.then(() => {
      const m = this.parts.model;
      m.scale.set(MODEL_HEIGHT * CHUB, MODEL_HEIGHT, MODEL_HEIGHT); // wider, not deeper (the shirt's back stays put)
      m.userData.baseScale = MODEL_HEIGHT; // (the customizer scales from here)
      this.parts.head.scale.set(HEAD / CHUB, HEAD, HEAD);
      this.pocket2Home = this.parts.bones.pocket2.position.clone();
      this.vsign = 0; // 0 = both hands in his pockets (his usual pose), 1 = the V sign
    });
  }

  /** He shows his V sign for a bit (from a reaction, his cute routine, or now and then on his own). */
  peace(secs = 4) {
    this.vsignUntil = this.time + secs;
  }

  animate(dt) {
    super.animate(dt);
    if (!this.parts.loaded) return;
    const st = this.stateName;
    // the V sign for happy moments and waves, and now and then on his own; otherwise hands in his pockets
    if (['wave', 'happy', 'tada', 'excited'].includes(st) && !(this.vsignUntil > this.time)) this.peace(3.5);
    this.idleT = (this.idleT ?? 14 + Math.random() * 14) - dt;
    if (this.idleT <= 0 && st === 'idle') { this.peace(4 + Math.random() * 3); this.idleT = 18 + Math.random() * 22; }
    const want = this.vsignUntil > this.time && !this.holding ? 1 : 0;
    this.vsign += Math.sign(want - this.vsign) * Math.min(Math.abs(want - this.vsign), dt / 0.7);
  }

  /** His eyes are part of the figure (no bead eyes for the typing glasses to sit on). */
  setGlasses() {}

  applyPose(p, breath = 0) {
    const j = this.joints;
    const sit = clamp(p.sit, 0, 1);
    this.grounded = 1;
    this.airborne = 0;
    this.pose = p;
    // feet on the floor: a small hop with each step, a bounce from the pose (happy, dance), never hovering
    const hop = Math.abs(Math.sin(this.walkPhase)) * 0.035 * this.walkAmount;
    // sitting: he drops onto the seat (the chair's seat is a bit lower than his hips)
    j.hips.position.y = (1 - sit) * Math.max(0, p.bodyY * 0.6) + hop - sit * 0.07 - p.crouch * 0.3;
    j.torso.scale.set(1 + breath * 0.003, 1 + breath * 0.006, 1 + breath * 0.003);
    const rock = Math.sin(this.walkPhase) * 0.08 * this.walkAmount;
    j.torso.rotation.set(clamp(p.torsoPitch * 0.4, -0.25, 0.25), p.torsoYaw * 0.6, clamp(p.torsoRoll * 0.5, -0.3, 0.3) + rock);
    if (!this.parts.loaded) return;
    const b = this.parts.bones;
    // holding something (a controller, the keyboard): both arms come forward out of the pockets
    const reach = clamp((Math.max(p.armSwingL, p.armSwingR) - 0.4) / 0.5, 0, 1);
    this.holding = reach > 0.3;
    const fwd = -0.85 * reach;   // down and forward to his lap
    const inward = 0.3 * reach;  // and in, so the hands meet in front of him
    // the V-sign swap is a real move: the pocket arm swings out and up, then the V-sign arm swings up into place
    const v = this.vsign ?? 0;
    const out = clamp(v / 0.5, 0, 1), up = clamp((v - 0.5) / 0.5, 0, 1);
    const ss = (x) => x * x * (3 - 2 * x);
    this.parts.arms[0].rotation.set(fwd, 0, -inward); // his left: always in the pocket (or forward to hold things)
    if (b?.vsign) {
      // aimed out at his own pocket (the mirror of his left hand about his legs, not at his middle)
      const fx = this.pocketFix ?? POCKET_FIX;
      b.pocket2.position.set(this.pocket2Home.x + fx[0], this.pocket2Home.y + fx[1], this.pocket2Home.z + fx[2]);
      b.pocket2.rotation.set(fwd - 0.6 * ss(out) + fx[3], 0, fx[4] + inward - 0.9 * ss(out));
      // whatever he's holding (the controller) goes between his hands
      if (reach > 0.05) {
        this.parts.model.updateMatrixWorld(true);
        this.parts.arms[0].localToWorld(_a.set(...TIP_L));
        b.pocket2.localToWorld(_b.set(...TIP_R));
        const mid = j.torso.worldToLocal(_a.add(_b).multiplyScalar(0.5));
        for (const o of j.torso.children) if (o !== this.parts.model && o.name !== 'model' && o.isObject3D && o.userData.full) o.position.lerp(mid.clone().add(new THREE.Vector3(0, -0.006, 0.02)), reach);
      }
      b.pocket2.scale.setScalar(v < 0.5 ? 1 : 0.0001);
      b.sleeve2?.scale.setScalar(v < 0.5 ? 1 : 0.0001);
      b.shirtR?.scale.setScalar(v >= 0.5 ? 1 : 0.0001);
      // fists (made from his V-sign hand) come out of the pockets with the arms when he holds something
      const show = reach > 0.25 ? 1 : 0.0001;
      if (b.fist_L) { b.fist_L.rotation.copy(this.parts.arms[0].rotation); b.fist_L.scale.setScalar(show); }
      if (b.fist_R) { b.fist_R.position.copy(b.pocket2.position); b.fist_R.rotation.copy(b.pocket2.rotation); b.fist_R.scale.setScalar(v < 0.5 ? show : 0.0001); }
      b.vsign.rotation.set(0.5 * (1 - ss(up)), 0, -1.3 * (1 - ss(up)));
      b.vsign.scale.setScalar(v >= 0.5 ? 1 : 0.0001);
    }
    this.parts.arms[1].rotation.set(0, 0, 0);
    // stiff toy legs: a little swing as he walks
    const [legR, legL] = this.parts.legs;
    const stride = Math.sin(this.walkPhase) * 0.22 * this.walkAmount;
    // legs bend forward at the hips to sit (and a little for kicks in a dance)
    legR.rotation.set(stride - clamp(p.legSwingR, 0, 1.6) * 0.95, 0, p.legSpreadR * 0.2);
    legL.rotation.set(-stride - clamp(p.legSwingL, 0, 1.6) * 0.95, 0, -p.legSpreadL * 0.2);
  }
}
