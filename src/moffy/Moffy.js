import * as THREE from 'three';
import moffyGlb from '../../assets/models/moffy.glb?inline';
import { HOVER, buildSculptRig } from '../bbokari/BbokariRig.js';
import { Bbokari } from '../bbokari/Bbokari.js';
import { PIVOTS } from '../../scripts/moffy/regions.mjs';

/** The GLB is height ≈ 1 (feet at y = 0, face towards +z); his height in world units. */
const MODEL_HEIGHT = 1.25;
const FLOAT = 0.1; // how high his hoverboard floats
export const MOFFY_HEIGHT = HOVER + FLOAT + MODEL_HEIGHT;

/** His hoverboard: a purple deck with yellow lightning stripes, a dark underside, two little thrusters and a glow. */
function buildHoverboard() {
  const g = new THREE.Group();
  g.name = 'hoverboard';
  const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 48), flat(0x9c7bff));
  deck.scale.set(0.33, 0.035, 0.2);
  deck.castShadow = true;
  const under = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.93, 1, 48), flat(0x1d1b26, { roughness: 0.4 }));
  under.scale.set(0.34, 0.03, 0.205);
  under.position.y = -0.03;
  // yellow stripes with a little lightning bolt in the middle
  const stripeMat = flat(0xffc83d, { emissive: 0x6b4a00, emissiveIntensity: 0.25 });
  for (const s of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.004, 0.022), stripeMat);
    stripe.position.set(s * 0.15, 0.0185, 0.05);
    g.add(stripe);
  }
  const boltShape = new THREE.Shape([[-0.012, 0.03], [0.018, 0.03], [0.002, 0.004], [0.02, 0.004], [-0.016, -0.034], [-0.004, -0.006], [-0.022, -0.006]].map(([x, y]) => new THREE.Vector2(x, y)));
  const bolt = new THREE.Mesh(new THREE.ShapeGeometry(boltShape), stripeMat);
  bolt.rotation.x = -Math.PI / 2;
  bolt.position.set(0, 0.0185, 0.06);
  g.add(bolt);
  // thrusters underneath, with a soft glow below the board
  const thrusters = [];
  for (const s of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.038, 0.035, 20), flat(0x5b5f78, { metalness: 0.5, roughness: 0.35 }));
    t.position.set(s * 0.2, -0.055, 0);
    const flame = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), new THREE.MeshBasicMaterial({ color: 0x9cf6ff, transparent: true, opacity: 0.85 }));
    flame.rotation.x = Math.PI / 2;
    flame.position.set(s * 0.2, -0.074, 0);
    thrusters.push(flame);
    g.add(t, flame);
  }
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xb69cff, transparent: true, opacity: 0.35, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.scale.set(0.36, 0.22, 1);
  g.add(deck, under, glow);
  g.userData = { thrusters, glow };
  return g;
}

/**
 * Moffy: a mischievous milk-white teddy bear (the user's own mascot). A big round head, one bitten ear and a gold
 * hoop in the other, a stitched patch, one blue eye and one smug half-lidded green eye, a heart nose, a tongue-out
 * smirk, an oversized yellow hoodie with a pocket full of borrowed sweets, mismatched sneakers and a big heart tail.
 * He never walks: he floats everywhere on his hoverboard (it bobs and glows), and his heart tail wags.
 */
export class Moffy extends Bbokari {
  constructor() {
    super(
      buildSculptRig({ name: 'moffy', glb: moffyGlb, modelHeight: MODEL_HEIGHT, headStandIn: 0.55, eyes: false }),
      { height: MOFFY_HEIGHT, halfWidth: 0.42, emoteLift: 1.0, hand: [0.1, -0.16, 0.05], armScale: 0.72 }, // stubby arms lift less
    );
    this.outfitOffset = [0, -0.2, 0.02];
    this.outfitScale = 0.95;
    this.board = buildHoverboard();
    this.joints.hips.add(this.board);
    this.board.position.y = -0.005;
    this.wag = 0;
    this.parts.ready.then(() => {
      this.tail = this.parts.bones.tail;
      // his gold hoop earring, hanging from the bottom of his right ear (head-bone space, model units)
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0048, 10, 28), new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.85, roughness: 0.25 }));
      const h = PIVOTS.head;
      hoop.position.set(-0.3 - h[0], 0.8 - h[1], 0.0 - h[2]);
      hoop.rotation.y = 0.5;
      this.parts.head.add(hoop);
    });
  }

  /** The typing scene's glasses need bead eyes; his eyes are painted on, so he skips them. */
  setGlasses() {}

  applyPose(p, breath = 0) {
    // He floats on his hoverboard: no walking steps (his legs just stand on the board); the board does the moving.
    const moving = this.walkAmount;
    this.walkAmount = 0;
    super.applyPose(p, breath);
    this.walkAmount = moving;
    this.moving = moving;
    // Hover: float above the floor, bobbing gently (more while he zooms about), leaning into the way he goes.
    const j = this.joints;
    j.hips.position.y += FLOAT + Math.sin(this.time * 2.6) * 0.022 + Math.sin(this.time * 7) * 0.006 * moving;
    j.torso.rotation.z += Math.sin(this.time * 1.3) * 0.02;
  }

  animate(dt) {
    super.animate(dt);
    const b = this.board.userData;
    // The board stays level under him (it doesn't tilt with his body's lean); the thrusters flicker; the glow pulses.
    this.board.rotation.set(0, 0, -this.joints.torso.rotation.z * 0.4);
    const pulse = 0.75 + Math.sin(this.time * 12) * 0.15 + Math.random() * 0.1;
    for (const f of b.thrusters) { f.material.opacity = pulse; f.scale.setScalar(0.9 + (this.moving ?? 0) * 0.5 + Math.random() * 0.1); }
    b.glow.material.opacity = 0.28 + Math.sin(this.time * 2.6) * 0.06;
    // The heart tail wags: lazily when he's relaxed, fast when he's excited or zooming about.
    if (this.tail) {
      const excited = /joy|excited|happy|love|smug/.test(this.face?.current?.name ?? '') ? 1 : 0;
      this.wag += dt * (3 + 5 * Math.max(excited, this.moving ?? 0));
      this.tail.rotation.set(Math.sin(this.wag * 0.5) * 0.08, Math.sin(this.wag) * (0.22 + 0.18 * excited), Math.sin(this.wag) * 0.12);
    }
  }
}
