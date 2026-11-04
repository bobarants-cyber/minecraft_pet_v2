import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import beeGlb from '../../assets/models/bee.glb?inline';
import { PixelFace } from './face/PixelFace.js';

/** Overall height in world units at scale 1 (body + hover + antennae), used to size the bee in pixels. */
export const BEE_HEIGHT = 1.25;
export const HOVER = 0.32;
/** Body height in world units; the model is rescaled so its torso matches this. */
const BODY_HEIGHT = 0.7;

const PART_PREFIXES = ['torso', 'right_antenna', 'left_antenna', 'stinger', 'back_legs', 'middle_legs', 'front_legs', 'right_wing', 'left_wing'];

function pivot(name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

function findMesh(node) {
  let found = null;
  node.traverse((o) => {
    if (!found && o.isMesh) found = o;
  });
  return found;
}

/** Re-parent a mesh (identity transform in model space) under a pivot at `point` so it rotates about that point. */
function hinge(parent, name, mesh, point) {
  const p = pivot(name, point.x, point.y, point.z);
  parent.add(p);
  p.add(mesh);
  mesh.position.set(-point.x, -point.y, -point.z);
  return p;
}

/**
 * Builds the bee from the Sketchfab GLB. Returns synchronously with empty joints that fill in once the
 * model has loaded; `parts.ready` resolves when everything is attached.
 */
export function buildBeeRig() {
  const root = pivot('bee');
  const hips = pivot('hips', 0, HOVER, 0);
  const torso = pivot('torso');
  root.add(hips);
  hips.add(torso);
  const joints = { hips, torso, head: torso };
  const parts = { wings: [], legs: [], antennae: [], loaded: false, face: null };

  parts.ready = new GLTFLoader().loadAsync(beeGlb).then((gltf) => {
    const scene = gltf.scene;
    const meshes = {};
    scene.traverse((o) => {
      const key = PART_PREFIXES.find((p) => o.name.startsWith(p));
      if (key && !meshes[key]) meshes[key] = findMesh(o);
    });

    // Model space: face points -z, stinger +z, wings along ±x, legs flat below y = 0.
    const bbox = (m) => new THREE.Box3().setFromObject(m);
    const torsoBox = bbox(meshes.torso);
    const bodySize = torsoBox.getSize(new THREE.Vector3());
    const unit = BODY_HEIGHT / bodySize.y;

    const model = new THREE.Group();
    model.name = 'model';
    model.rotation.y = Math.PI; // face the camera (+z)
    model.scale.setScalar(unit);
    model.position.y = -torsoBox.min.y * unit + 0.0;
    torso.add(model);

    for (const m of Object.values(meshes)) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.material.roughness = 1;
      m.material.metalness = 0;
    }

    model.add(meshes.torso, meshes.stinger);

    for (const side of ['right', 'left']) {
      const wing = meshes[`${side}_wing`];
      const b = bbox(wing);
      const inner = side === 'right' ? b.min.x : b.max.x;
      parts.wings[side === 'right' ? 0 : 1] = hinge(model, `${side}_wing`, wing, new THREE.Vector3(inner, b.max.y, (b.min.z + b.max.z) / 2));

      const ant = meshes[`${side}_antenna`];
      const ab = bbox(ant);
      parts.antennae[side === 'right' ? 0 : 1] = hinge(model, `${side}_antenna`, ant, new THREE.Vector3((ab.min.x + ab.max.x) / 2, ab.min.y + (ab.max.y - ab.min.y) * 0.3, ab.max.z));
    }
    for (const row of ['front', 'middle', 'back']) {
      const leg = meshes[`${row}_legs`];
      const lb = bbox(leg);
      parts.legs.push(hinge(model, `${row}_legs`, leg, new THREE.Vector3(0, lb.max.y, (lb.min.z + lb.max.z) / 2)));
    }

    parts.body = meshes.torso;
    parts.face = new PixelFace(meshes.torso.material);
    parts.loaded = true;
    return parts;
  });

  return { root, joints, parts };
}
