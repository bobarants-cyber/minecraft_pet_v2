import jiniretGlb from '../../assets/models/jiniret.glb?inline';
import { HOVER, buildSculptRig } from '../bbokari/BbokariRig.js';
import { Bbokari } from '../bbokari/Bbokari.js';

/** The GLB is height 1 (feet at y = 0, face towards +z, ears included); his height in world units. */
const MODEL_HEIGHT = 1.25;
export const JINIRET_HEIGHT = HOVER + MODEL_HEIGHT;

/**
 * Jiniret: Hyunjin's SKZOO, a white ferret with round pink-lined ears, a pink nose and whiskers, a lopsided smile and
 * a beauty mark under his eye. Built and animated exactly like Bbokari (one painted, skinned sculpt over body → head,
 * arms, legs bones; see scripts/jiniret). Keep the spots in sync with scripts/jiniret/regions.mjs.
 */
export class Jiniret extends Bbokari {
  constructor() {
    super(
      buildSculptRig({
        name: 'jiniret',
        glb: jiniretGlb,
        modelHeight: MODEL_HEIGHT,
        headStandIn: 0.37,
        eyes: { headY: 0.37, eye: { x: 0.116, y: 0.584, r: 0.046 }, cheek: { x: 0.13, y: 0.47 } },
      }),
      { height: JINIRET_HEIGHT, halfWidth: 0.45, emoteLift: 0.95, hand: [0.05, -0.15, 0.03], armScale: 0.5 },
    );
    this.outfitOffset = [0, -0.06, 0.02];
    this.outfitScale = 1;
    // Headphones: the band goes behind his round ears.
    this.headFit = { side: 0.33, cupY: 0.2, cupZ: -0.02, top: 0.53, bandZ: -0.16, square: 0.6, mouth: [0, 0.11, 0.29] };
  }
}
