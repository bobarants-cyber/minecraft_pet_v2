import duckGlb from '../../assets/models/duck.glb?inline';
import { HOVER, buildSculptRig } from '../bbokari/BbokariRig.js';
import { Bbokari } from '../bbokari/Bbokari.js';

/** The GLB is height ≈ 0.95 (feet at y = 0, face towards +z); his height in world units. */
const MODEL_HEIGHT = 1.05;
export const DUCK_HEIGHT = HOVER + MODEL_HEIGHT;

/**
 * Ducky: a cute little white duckling with a big round head, a wide smiling bill, big glossy eyes, rosy cheeks, a curly
 * feather tuft, a perky tail feather, flappy little wings, orange webbed feet and a light-blue polka-dot bandana.
 * He waddles everywhere (the shared Bbokari rig's walk is a waddle), flaps his wings, and his tail wiggles.
 */
export class Duck extends Bbokari {
  constructor() {
    super(
      buildSculptRig({ name: 'duck', glb: duckGlb, modelHeight: MODEL_HEIGHT, headStandIn: 0.5, eyes: false }),
      { height: DUCK_HEIGHT, halfWidth: 0.36, emoteLift: 0.95, hand: [0.1, -0.12, 0.05], armScale: 1 },
    );
    this.outfitOffset = [0, -0.18, 0.03];
    this.outfitScale = 0.85;
    this.kpopFit = [0, -0.01, 0.03, 0.65]; // K-pop head items: head top 0.41 above the joint, radius 0.215
  }

  /** The typing scene's glasses need bead eyes; his eyes are painted on, so he skips them. */
  setGlasses() {}

  applyPose(p, breath = 0) {
    super.applyPose(p, breath);
    // An extra-wobbly duck waddle: rock side to side with each step.
    this.joints.torso.rotation.z += Math.sin(this.walkPhase) * 0.09 * this.walkAmount * (1 - this.airborne);
  }
}
