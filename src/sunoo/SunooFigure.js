import figureGlb from '../../assets/models/sunoo.glb?inline';
import { buildSculptRig } from '../bbokari/BbokariRig.js';
import { Bbokari } from '../bbokari/Bbokari.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
/** The GLB is height 1 (feet at y = 0, face towards +z); his height in world units. */
const MODEL_HEIGHT = 1.26; // the user's chosen proportions: size 1.4, head 1.12, chubby 1.05
const HEAD = 1.12, CHUB = 1.05;
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
    this.headFit = { side: 0.175, cupY: 0.13, cupZ: -0.01, top: 0.34, bandZ: -0.05, square: 0.75, mouth: [0, 0.06, 0.2] };
    this.parts.ready.then(() => {
      const m = this.parts.model;
      m.scale.set(MODEL_HEIGHT * CHUB, MODEL_HEIGHT, MODEL_HEIGHT); // wider, not deeper (the shirt's back stays put)
      m.userData.baseScale = MODEL_HEIGHT; // (the customizer scales from here)
      this.parts.head.scale.set(HEAD / CHUB, HEAD, HEAD);
      this.#setHands(false);
    });
  }

  /** Both hands in his pockets (true) or the V sign (false): the raised arm and the second pocket arm swap. */
  #setHands(pockets) {
    const b = this.parts.bones;
    if (!b?.vsign) return;
    this.pockets = pockets;
    b.vsign.scale.setScalar(pockets ? 0.0001 : 1);
    b.pocket2.scale.setScalar(pockets ? 1 : 0.0001);
  }

  animate(dt) {
    super.animate(dt);
    if (!this.parts.loaded) return;
    // now and then he puts both hands in his pockets for a while, then back to his V sign
    this.handT = (this.handT ?? 8 + Math.random() * 10) - dt;
    if (this.handT <= 0) {
      const pockets = !this.pockets;
      this.#setHands(pockets);
      this.handT = pockets ? 6 + Math.random() * 10 : 12 + Math.random() * 20;
    }
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
    // both arms keep their sculpted pose (hand in the pocket, the V sign)
    for (const a of this.parts.arms) a.rotation.set(0, 0, 0);
    // stiff toy legs: a little swing as he walks
    const [legR, legL] = this.parts.legs;
    const stride = Math.sin(this.walkPhase) * 0.22 * this.walkAmount;
    // legs bend forward at the hips to sit (and a little for kicks in a dance)
    legR.rotation.set(stride - clamp(p.legSwingR, 0, 1.6) * 0.95, 0, p.legSpreadR * 0.2);
    legL.rotation.set(-stride - clamp(p.legSwingL, 0, 1.6) * 0.95, 0, -p.legSpreadL * 0.2);
  }
}
