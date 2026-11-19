import figureGlb from '../../assets/models/sunoo.glb?inline';
import { HOVER, buildSculptRig } from '../bbokari/BbokariRig.js';
import { Bbokari } from '../bbokari/Bbokari.js';

/** The GLB is height 1 (feet at y = 0, face towards +z); his height in world units. */
const MODEL_HEIGHT = 1.15;
export const SUNOO_HEIGHT = HOVER + MODEL_HEIGHT;

/**
 * The user's own 3D-print file of a vinyl-figure style Sunoo (ENHYPEN), put back together from its 16 printable parts
 * (scripts: scratch tools; the file is a MakerWorld model the user downloaded, kept for personal use in this app).
 * Big head with blond hair, black bead eyes, white tee, navy cargo trousers, white sneakers, a backpack, and his right
 * hand up in a V sign. He moves like a little collectible figure on the desk: hops, waddles, waves, tilts his big head.
 */
export class SunooFigure extends Bbokari {
  constructor() {
    super(
      buildSculptRig({ name: 'sunoo', glb: figureGlb, modelHeight: MODEL_HEIGHT, headStandIn: 0.7, eyes: false }),
      { height: SUNOO_HEIGHT, halfWidth: 0.36, emoteLift: 1.05, hand: [0.06, -0.14, 0.05], armScale: 0.6 },
    );
    this.outfitOffset = [0, 0.02, 0.02];
    this.outfitScale = 1.05;
    this.kpopFit = [0, 0.1, 0.02, 1.05]; // K-pop head items sit on his big head
  }

  /** His eyes are part of the figure (no bead eyes for the typing glasses to sit on). */
  setGlasses() {}

  applyPose(p, breath = 0) {
    super.applyPose(p, breath);
    // a collectible figure's walk: a little side-to-side rock with each hop
    this.joints.torso.rotation.z += Math.sin(this.walkPhase) * 0.07 * this.walkAmount * (1 - this.airborne);
  }
}
