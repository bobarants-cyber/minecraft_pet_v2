import figureGlb from '../../assets/models/sunoo.glb?inline';
import { buildSculptRig } from '../bbokari/BbokariRig.js';
import { Bbokari } from '../bbokari/Bbokari.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
/** The GLB is height 1 (feet at y = 0, face towards +z); his height in world units. */
const MODEL_HEIGHT = 0.9;
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
    j.hips.position.y = Math.max(0, p.bodyY * 0.6) + hop - sit * 0.05;
    j.torso.scale.set(1 + breath * 0.003, 1 + breath * 0.006, 1 + breath * 0.003);
    const rock = Math.sin(this.walkPhase) * 0.08 * this.walkAmount;
    j.torso.rotation.set(clamp(p.torsoPitch * 0.4, -0.25, 0.25), p.torsoYaw * 0.6, clamp(p.torsoRoll * 0.5, -0.3, 0.3) + rock);
    if (!this.parts.loaded) return;
    // both arms keep their sculpted pose (hand in the pocket, the V sign)
    for (const a of this.parts.arms) a.rotation.set(0, 0, 0);
    // stiff toy legs: a little swing as he walks
    const [legR, legL] = this.parts.legs;
    const stride = Math.sin(this.walkPhase) * 0.22 * this.walkAmount;
    legR.rotation.set(stride, 0, 0);
    legL.rotation.set(-stride, 0, 0);
  }
}
