import wolfGlb from '../../assets/models/wolfchan.glb?inline';
import { HOVER, buildSculptRig } from '../bbokari/BbokariRig.js';
import { Bbokari } from '../bbokari/Bbokari.js';

/** The GLB is height 1 (feet at y = 0, face towards +z, ears included); his height in world units. */
const MODEL_HEIGHT = 1.4;
export const WOLF_HEIGHT = HOVER + MODEL_HEIGHT;

/**
 * Wolf Chan: a big-headed little wolf with tall ears, a hair curl and a sweet smile. Built and animated exactly like
 * Bbokari (one painted, skinned sculpt over body → head, arms, legs bones; see scripts/wolfchan), so he walks,
 * waves, dances, sleeps, types and plays everything Bbokari does. Keep the spots in sync with scripts/wolfchan/regions.mjs.
 */
export class WolfChan extends Bbokari {
  constructor() {
    super(
      buildSculptRig({
        name: 'wolfchan',
        glb: wolfGlb,
        modelHeight: MODEL_HEIGHT,
        headStandIn: 0.25,
        eyes: { headY: 0.25, eye: { x: 0.088, y: 0.448, r: 0.02, tall: 1.6, maxScale: 1.06 },
          cheek: { x: 0.132, y: 0.361 },
          mouth: { w: 0.066, top: [0.3576, 0.0064], bottom: [0.3395, 0.0181] },
        },
      }),
      { height: WOLF_HEIGHT, halfWidth: 0.37, emoteLift: 1.05, hand: [0.06, -0.095, 0.03], armScale: 0.4 },
    );
    // Hats sit on his head between the ears (lower than on Bbokari).
    this.outfitOffset = [0, -0.13, 0.02];
    this.outfitScale = 0.95;
    // Headphones: a narrower head, and the band goes behind his tall ears.
    this.headFit = { side: 0.262, cupY: 0.2, cupZ: -0.01, top: 0.47, bandZ: -0.15, square: 0.6, mouth: [0, 0.11, 0.24] };
  }
}
