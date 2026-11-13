// Builds the Wolf Chan GLB: upright, height 1, feet at y=0, face +z, split into parts, painted with vertex colours.
import fs from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRMeshQuantization, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import { colorAt, weightsAt, PIVOTS } from './regions.mjs';

const { P } = JSON.parse(fs.readFileSync(process.env.WORK + '/norm.json'));
const { idx } = JSON.parse(fs.readFileSync(process.env.WORK + '/simp.json'));
const n = P.length / 3;
const v = (i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];

// Smooth vertex normals for the whole mesh (so cut seams still shade continuously).
const N = new Float32Array(P.length);
for (let t = 0; t < idx.length; t += 3) {
  const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map(v);
  const e1 = a.map((_, k) => b[k] - a[k]), e2 = a.map((_, k) => c[k] - a[k]);
  const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
  for (const i of [idx[t], idx[t + 1], idx[t + 2]]) { N[3 * i] += nx; N[3 * i + 1] += ny; N[3 * i + 2] += nz; }
}
for (let i = 0; i < n; i++) { const l = Math.hypot(N[3 * i], N[3 * i + 1], N[3 * i + 2]) || 1; N[3 * i] /= l; N[3 * i + 1] /= l; N[3 * i + 2] /= l; }

// "Bump": how far a vertex sticks out past its neighbours along its normal (finds the little sculpted freckles).
const sum = new Float64Array(P.length), cnt = new Uint32Array(n);
for (let t = 0; t < idx.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
  const i = idx[t + a], j = idx[t + b];
  for (let k = 0; k < 3; k++) { sum[3 * i + k] += P[3 * j + k]; sum[3 * j + k] += P[3 * i + k]; }
  cnt[i]++; cnt[j]++;
}
const bump = (i) => [0, 1, 2].reduce((s, k) => s + (P[3 * i + k] - sum[3 * i + k] / cnt[i]) * N[3 * i + k], 0);
const C = new Float32Array(n * 4);
for (let i = 0; i < n; i++) { const c = colorAt(v(i), [N[3 * i], N[3 * i + 1], N[3 * i + 2]], bump(i)); C.set([...c, 1], 4 * i); }

// One skinned mesh with a small skeleton: body → head, arms, legs. Each vertex follows its nearest bones and blends
// smoothly across the joints, so moving a limb bends the surface instead of opening a seam.
const BONES = ['body', 'head', 'arm_R', 'arm_L', 'leg_R', 'leg_L'];
const J = new Uint16Array(n * 4);
const W = new Float32Array(n * 4);
for (let i = 0; i < n; i++) {
  const w = weightsAt(v(i));
  const list = BONES.map((name, b) => [b, w[name] ?? 0]).filter(([, x]) => x > 0.001).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const total = list.reduce((s2, [, x]) => s2 + x, 0) || 1;
  list.forEach(([b, x], k) => { J[4 * i + k] = b; W[4 * i + k] = x / total; });
}

const doc = new Document();
const buffer = doc.createBuffer();
const mat = doc.createMaterial('wolfchan').setRoughnessFactor(0.85).setMetallicFactor(0);
const scene = doc.createScene('wolfchan');
const root = doc.createNode('wolfchan');
scene.addChild(root);
const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);

const bones = {};
bones.body = doc.createNode('body');
root.addChild(bones.body);
for (const name of BONES.slice(1)) {
  bones[name] = doc.createNode(name).setTranslation(PIVOTS[name]);
  bones.body.addChild(bones[name]);
}
const ibm = new Float32Array(16 * BONES.length);
BONES.forEach((name, b) => {
  const [x, y, z] = name === 'body' ? [0, 0, 0] : PIVOTS[name];
  ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1], 16 * b);
});
const skin = doc.createSkin('skeleton').setSkeleton(bones.body).setInverseBindMatrices(acc('MAT4', ibm));
for (const name of BONES) skin.addJoint(bones[name]);

const prim = doc.createPrimitive().setMaterial(mat)
  .setAttribute('POSITION', acc('VEC3', new Float32Array(P)))
  .setAttribute('NORMAL', acc('VEC3', N))
  .setAttribute('COLOR_0', acc('VEC4', C))
  .setAttribute('JOINTS_0', acc('VEC4', J))
  .setAttribute('WEIGHTS_0', acc('VEC4', W))
  .setIndices(acc('SCALAR', new Uint32Array(idx)));
root.addChild(doc.createNode('mesh').setMesh(doc.createMesh('wolfchan').addPrimitive(prim)).setSkin(skin));
console.log('vertices', n, 'triangles', idx.length / 3);
const out = process.argv[2];
if (process.argv.includes('--compress')) {
  const { quantize, reorder } = await import('@gltf-transform/functions');
  await MeshoptEncoder.ready;
  await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize());
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
}
await new NodeIO().registerExtensions([KHRMeshQuantization, EXTMeshoptCompression]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder }).write(out, doc);
console.log('wrote', out, fs.statSync(out).size, 'bytes');
