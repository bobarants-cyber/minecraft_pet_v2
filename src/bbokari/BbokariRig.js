import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import bbokariGlb from '../../assets/models/bbokari.glb?inline';
import { BbokariEyes } from './BbokariEyes.js';

/** Overall height in world units at scale 1 (hover + model), used for hit testing and the ceiling. */
export const BBOKARI_HEIGHT = 1.25;
export const HOVER = 0.06;
/** The GLB is normalised to height 1 (feet at y = 0, face towards +z); this is its height in world units. */
const MODEL_HEIGHT = 1.12;

/**
 * Joint pivots in model space, matching scripts/bbokari/regions.mjs, which cut the sculpt into these parts.
 * Each part's node in the GLB is translated to its pivot, so its geometry sits relative to that point.
 */
const PIVOTS = {
  head: [0, 0.355, 0],
  arm_R: [0.175, 0.31, 0],
  arm_L: [-0.175, 0.31, 0],
  leg_R: [0.08, 0.11, 0],
  leg_L: [-0.08, 0.11, 0],
};

function pivot(name, [x, y, z] = [0, 0, 0]) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

/** Attach a loaded part under a pivot. The node's own transform is pivot + mesh quantisation, so drop the pivot. */
function mount(parent, name, node) {
  const at = PIVOTS[name];
  const p = pivot(name, at);
  parent.add(p);
  node.position.sub(new THREE.Vector3(...at));
  p.add(node);
  return p;
}

/**
 * Builds Bbokari from the GLB (one sculpt cut into head, body, arms and legs, painted with vertex colours).
 * Returns synchronously with empty joints that fill in once the model has loaded; `parts.ready` resolves when attached.
 */
export function buildBbokariRig() {
  const root = pivot('bbokari');
  const hips = pivot('hips', [0, HOVER, 0]);
  const torso = pivot('torso');
  const head = pivot('head');
  root.add(hips);
  hips.add(torso);
  const joints = { hips, torso, head };
  const parts = { arms: [], legs: [], loaded: false, eyes: null };

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  parts.ready = loader.loadAsync(bbokariGlb).then((gltf) => {
    const nodes = {};
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.material.vertexColors = true;
        o.material.side = THREE.DoubleSide; // seen through the joint slits, the inside reads as skin, not a gap
        o.material.roughness = 0.85;
        o.material.metalness = 0;
      }
      if (['head', 'body', 'arm_R', 'arm_L', 'leg_R', 'leg_L'].includes(o.name) && !nodes[o.name]) nodes[o.name] = o;
    });

    const model = new THREE.Group();
    model.name = 'model';
    model.scale.setScalar(MODEL_HEIGHT);
    torso.add(model);

    model.add(nodes.body);
    // The head pivot is a joint of its own so it can nod and turn; it lives inside the scaled model group.
    head.position.set(...PIVOTS.head);
    model.add(head);
    nodes.head.position.sub(new THREE.Vector3(...PIVOTS.head));
    head.add(nodes.head);

    parts.arms = [mount(model, 'arm_R', nodes.arm_R), mount(model, 'arm_L', nodes.arm_L)];
    parts.legs = [mount(model, 'leg_R', nodes.leg_R), mount(model, 'leg_L', nodes.leg_L)];

    // The parts were cut from one solid sculpt, so turning a joint opens a thin slit. Skin-coloured "plugs"
    // inside each joint fill the slit, so you see Bbokari rather than the desktop through it.
    const skin = new THREE.MeshStandardMaterial({ color: '#ffd84a', roughness: 0.85, metalness: 0 });
    const plug = (center, radii) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), skin);
      m.position.set(...center);
      m.scale.set(...radii);
      model.add(m);
    };
    plug([0, PIVOTS.head[1], -0.01], [0.178, 0.06, 0.13]);
    for (const s of [1, -1]) {
      plug([s * 0.17, 0.3, 0], [0.035, 0.045, 0.05]);
      plug([s * 0.08, PIVOTS.leg_R[1] - 0.005, -0.01], [0.085, 0.025, 0.1]);
    }

    head.updateWorldMatrix(true, true);
    parts.eyes = new BbokariEyes(head, nodes.head);
    parts.loaded = true;
    return parts;
  });

  return { root, joints, parts };
}
