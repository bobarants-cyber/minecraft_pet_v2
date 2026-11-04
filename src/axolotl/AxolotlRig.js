import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import axolotlGlb from '../../assets/models/axolotl.glb?inline';
import { AxolotlFace } from './AxolotlFace.js';

/** Overall height in world units at scale 1 (legs + body + gills + hover), used for hit testing and the ceiling. */
export const AXOLOTL_HEIGHT = 1.25;
export const HOVER = 0.3;
/** Body height in world units; the model is rescaled so its body matches this. */
const BODY_HEIGHT = 0.34;

const PART_NAME = /^(body|head|bone3|bone2|bone|tail2|tail|leg[0-3])_\d+$/;
const _zero = new THREE.Vector3();

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

/**
 * Re-parent a mesh (identity transform in model space) under a pivot at `point` so it rotates about that point.
 * `origin` is the parent's own position in model space when the parent is itself a pivot.
 */
function hinge(parent, name, mesh, point, origin = _zero) {
  const p = pivot(name, point.x - origin.x, point.y - origin.y, point.z - origin.z);
  parent.add(p);
  p.add(mesh);
  mesh.position.set(-point.x, -point.y, -point.z);
  return p;
}

/**
 * Builds the axolotl from the Sketchfab GLB. Returns synchronously with empty joints that fill in once the
 * model has loaded; `parts.ready` resolves when everything is attached.
 */
export function buildAxolotlRig() {
  const root = pivot('axolotl');
  const hips = pivot('hips', 0, HOVER, 0);
  const torso = pivot('torso');
  const head = pivot('head');
  root.add(hips);
  hips.add(torso);
  const joints = { hips, torso, head };
  const parts = { legs: [], gills: [], tail: null, legLength: 0.34, loaded: false, face: null };

  parts.ready = new GLTFLoader().loadAsync(axolotlGlb).then((gltf) => {
    const meshes = {};
    gltf.scene.traverse((o) => {
      const m = PART_NAME.exec(o.name);
      if (m && !meshes[m[1]]) meshes[m[1]] = findMesh(o);
    });

    // Model space: face points -z, tail +z, gills fan out at the back of the head, legs are flat plates at x = ±4.
    const bbox = (m) => new THREE.Box3().setFromObject(m);
    const bodyBox = bbox(meshes.body);
    const unit = BODY_HEIGHT / bodyBox.getSize(new THREE.Vector3()).y;

    const model = new THREE.Group();
    model.name = 'model';
    model.rotation.y = Math.PI; // face the camera (+z)
    model.scale.setScalar(unit);
    model.position.y = -bodyBox.min.y * unit;
    torso.add(model);

    for (const m of Object.values(meshes)) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.material.roughness = 1;
      m.material.metalness = 0;
    }

    model.add(meshes.body, meshes.tail);

    const headBox = bbox(meshes.head);
    const neck = new THREE.Vector3(0, (headBox.min.y + headBox.max.y) / 2, headBox.max.z);
    head.position.copy(neck);
    model.add(head);
    head.add(meshes.head);
    meshes.head.position.copy(neck).negate();

    const top = bbox(meshes.bone3);
    parts.gills[0] = hinge(head, 'gill_top', meshes.bone3, new THREE.Vector3(0, top.min.y, top.min.z), neck);
    for (const [i, key, side] of [[1, 'bone', 1], [2, 'bone2', -1]]) {
      const b = bbox(meshes[key]);
      const inner = side > 0 ? b.min.x : b.max.x;
      parts.gills[i] = hinge(head, `gill_${side > 0 ? 'right' : 'left'}`, meshes[key], new THREE.Vector3(inner, (b.min.y + b.max.y) / 2, b.min.z), neck);
    }

    for (const key of ['leg0', 'leg1', 'leg2', 'leg3']) {
      const b = bbox(meshes[key]);
      parts.legs.push(hinge(model, key, meshes[key], new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2)));
      parts.legLength = (bodyBox.min.y - b.min.y) * unit;
    }

    const tb = bbox(meshes.tail2);
    parts.tail = hinge(model, 'tail', meshes.tail2, new THREE.Vector3(0, (tb.min.y + tb.max.y) / 2, tb.min.z));

    parts.body = meshes.body;
    parts.face = new AxolotlFace(meshes.head.material);
    parts.loaded = true;
    return parts;
  });

  return { root, joints, parts };
}
