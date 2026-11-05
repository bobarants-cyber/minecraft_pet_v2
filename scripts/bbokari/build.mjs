// Builds the Bbokari GLB: upright, height 1, feet at y=0, face +z, split into parts, painted with vertex colours.
import fs from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRMeshQuantization, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import { colorAt, partOf, PIVOTS } from './regions.mjs';

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

const parts = {};
for (let t = 0; t < idx.length; t += 3) {
  const tri = [idx[t], idx[t + 1], idx[t + 2]];
  const cen = [0, 1, 2].map((k) => tri.reduce((s, i) => s + P[3 * i + k], 0) / 3);
  (parts[partOf(cen)] ??= []).push(...tri);
}

const doc = new Document();
const buffer = doc.createBuffer();
const mat = doc.createMaterial('bbokari').setRoughnessFactor(0.85).setMetallicFactor(0);
const scene = doc.createScene('bbokari');
const root = doc.createNode('bbokari');
scene.addChild(root);
for (const [name, tris] of Object.entries(parts)) {
  const map = new Map(); const pos = [], nor = [], col = [], ind = [];
  const piv = PIVOTS[name] ?? [0, 0, 0];
  for (const i of tris) {
    if (!map.has(i)) { map.set(i, map.size); pos.push(P[3 * i] - piv[0], P[3 * i + 1] - piv[1], P[3 * i + 2] - piv[2]); nor.push(N[3 * i], N[3 * i + 1], N[3 * i + 2]); col.push(...C.slice(4 * i, 4 * i + 4)); }
    ind.push(map.get(i));
  }
  const acc = (type, arr, T) => doc.createAccessor().setType(type).setArray(new T(arr)).setBuffer(buffer);
  const prim = doc.createPrimitive().setMaterial(mat)
    .setAttribute('POSITION', acc('VEC3', pos, Float32Array)).setAttribute('NORMAL', acc('VEC3', nor, Float32Array))
    .setAttribute('COLOR_0', acc('VEC4', col, Float32Array)).setIndices(acc('SCALAR', ind, Uint32Array));
  root.addChild(doc.createNode(name).setTranslation(piv).setMesh(doc.createMesh(name).addPrimitive(prim)));
  console.log(name, ind.length / 3, 'tris');
}
const out = process.argv[2];
if (process.argv.includes('--compress')) {
  const { quantize, reorder } = await import('@gltf-transform/functions');
  await MeshoptEncoder.ready;
  await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize());
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
}
await new NodeIO().registerExtensions([KHRMeshQuantization, EXTMeshoptCompression]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder }).write(out, doc);
console.log('wrote', out, fs.statSync(out).size, 'bytes');
