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

function pivot(name, [x, y, z] = [0, 0, 0]) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

/**
 * Builds Bbokari from the GLB: one skinned mesh (the sculpt, painted with vertex colours) over a small skeleton
 * (body → head, arm_R, arm_L, leg_R, leg_L; see scripts/bbokari). Turning a bone bends the surface smoothly.
 * Returns synchronously; `parts.ready` resolves once the model has loaded and the bones are in `parts`.
 */
export function buildBbokariRig() {
  return buildSculptRig({ name: 'bbokari', glb: bbokariGlb, modelHeight: MODEL_HEIGHT });
}

/**
 * The same kind of rig for any sculpt made by the scripts in scripts/bbokari or scripts/wolfchan (a skinned mesh
 * with body → head, arm_R, arm_L, leg_R, leg_L bones). `eyes` places the blinking eyes and cheeks on its face.
 */
export function buildSculptRig({ name, glb, modelHeight, eyes = {}, headStandIn = 0.4 }) {
  const root = pivot(name);
  const hips = pivot('hips', [0, HOVER, 0]);
  const torso = pivot('torso');
  root.add(hips);
  hips.add(torso);
  // Until the model loads, the head joint is a stand-in at neck height (used for emotes).
  const joints = { hips, torso, head: pivot('head', [0, headStandIn, 0]) };
  torso.add(joints.head);
  const parts = { arms: [], legs: [], head: null, loaded: false, eyes: null };

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  parts.ready = loader.loadAsync(glb).then((gltf) => {
    const bones = {};
    let mesh = null;
    gltf.scene.traverse((o) => {
      if (o.isSkinnedMesh) {
        mesh = o;
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false; // its bounds don't follow the bones
        o.material.vertexColors = true;
        o.material.roughness = 0.85;
        o.material.metalness = 0;
      }
      if (o.isBone) bones[o.name] = o;
    });

    const model = new THREE.Group();
    model.name = 'model';
    model.scale.setScalar(modelHeight);
    model.add(gltf.scene);
    torso.remove(joints.head);
    torso.add(model);

    parts.bones = bones; // every bone by name (the realistic Gliddy has a full skeleton)
    parts.mesh = mesh;
    parts.model = model;
    parts.head = bones.head;
    joints.head = bones.head;
    parts.arms = [bones.arm_R, bones.arm_L];
    parts.legs = [bones.leg_R, bones.leg_L];

    // The raycasts that place the eyes and blush read the bones' last skinning pose: bring it up to date first, or
    // they land where the model was a frame ago (e.g. mid pop-in) and the blush floats off the cheek.
    model.updateWorldMatrix(true, true);
    mesh.skeleton.update();
    // eyes: false = the eyes are sculpted and painted on the model (no blinking bead eyes).
    parts.eyes = eyes === false ? { eyes: [], apply() {} } : new BbokariEyes(bones.head, mesh, eyes);
    parts.loaded = true;
    return parts;
  });

  return { root, joints, parts };
}
