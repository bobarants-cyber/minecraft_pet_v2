// Builds the the skater GLB: upright, height 1, feet at y=0, face +z, split into parts, painted with vertex colours.
import fs from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRMeshQuantization, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import { colorAt, weightsAt as weightsBase, PIVOTS as PIVOTS_BASE } from './regions.mjs';
import * as REAL from './rig-real.mjs';
// VARIANT=real builds the realistic Gliddy: a full human-like skeleton (see rig-real.mjs).
const IS_REAL = process.env.VARIANT === 'real';
const PIVOTS = IS_REAL ? REAL.PIVOTS : PIVOTS_BASE;
const PARENTS = IS_REAL ? REAL.PARENTS : { fingers_R: 'arm_R', fingers_L: 'arm_L' };
const weightsAt = IS_REAL ? REAL.weightsAt : weightsBase;

const { P: P0 } = JSON.parse(fs.readFileSync(process.env.WORK + '/norm.json'));
const { idx: idx0 } = JSON.parse(fs.readFileSync(process.env.WORK + '/simp.json'));

// Crisp colour edges: vertex colours blend across a triangle, so where a colour edge crosses big triangles it looks
// jagged and flickers. Split only the triangles that straddle a colour edge (and, to keep the surface watertight, the
// edges they share with their neighbours) a few times over, so every border follows the drawing closely.
function vertexNormals(P, idx) {
  const N = new Float32Array(P.length);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const e1 = [0, 1, 2].map((k) => P[3 * b + k] - P[3 * a + k]), e2 = [0, 1, 2].map((k) => P[3 * c + k] - P[3 * a + k]);
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const i of [a, b, c]) for (let k = 0; k < 3; k++) N[3 * i + k] += f[k];
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}
function refine(P, idx, rounds) {
  P = Array.from(P); idx = Array.from(idx);
  for (let r = 0; r < rounds; r++) {
    const N = vertexNormals(P, idx);
    const col = [];
    for (let i = 0; i < P.length / 3; i++) col.push(colorAt([P[3 * i], P[3 * i + 1], P[3 * i + 2]], [N[3 * i], N[3 * i + 1], N[3 * i + 2]], 0, true).map((x) => x.toFixed(4)).join());
    const ek = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
    const marked = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      if (col[a] !== col[b] || col[b] !== col[c]) for (const [x, y] of [[a, b], [b, c], [c, a]]) marked.set(ek(x, y), -1);
    }
    const mid = (a, b) => {
      const k = ek(a, b);
      let m = marked.get(k);
      if (m === -1) { m = P.length / 3; for (let q = 0; q < 3; q++) P.push((P[3 * a + q] + P[3 * b + q]) / 2); marked.set(k, m); }
      return m;
    };
    const out = [];
    for (let t = 0; t < idx.length; t += 3) {
      let [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      let m = [marked.has(ek(a, b)), marked.has(ek(b, c)), marked.has(ek(c, a))];
      const count = m.filter(Boolean).length;
      if (count === 0) { out.push(a, b, c); continue; }
      if (count === 3) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca); continue; }
      // Rotate so the pattern starts at edge a–b.
      while (!(count === 1 ? m[0] : m[0] && m[1])) { [a, b, c] = [b, c, a]; m = [m[1], m[2], m[0]]; }
      if (count === 1) { const ab = mid(a, b); out.push(a, ab, c, ab, b, c); } else { const ab = mid(a, b), bc = mid(b, c); out.push(ab, b, bc, a, ab, bc, a, bc, c); }
    }
    idx = out;
  }
  return { P, idx };
}
const { P, idx } = refine(P0, idx0, 3);
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
// The source sculpt is faceted on its big smooth areas (head, body): soften the shading by averaging each normal with
// its neighbours a few times. Only normals change, so the shape and the carved details stay where they are.
{
  const nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { nb[idx[t + a]].add(idx[t + b]); nb[idx[t + b]].add(idx[t + a]); }
  for (let pass = 0; pass < 4; pass++) {
    const M = new Float32Array(N);
    for (let i = 0; i < n; i++) {
      let x = N[3 * i], y = N[3 * i + 1], z = N[3 * i + 2];
      for (const j of nb[i]) { x += N[3 * j]; y += N[3 * j + 1]; z += N[3 * j + 2]; }
      const l = Math.hypot(x, y, z) || 1;
      M[3 * i] = x / l; M[3 * i + 1] = y / l; M[3 * i + 2] = z / l;
    }
    N.set(M);
  }
}

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
const BONES = ['body', ...Object.keys(PIVOTS).filter((k) => k !== 'body')];
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
const mat = doc.createMaterial('skater').setRoughnessFactor(0.85).setMetallicFactor(0);
const scene = doc.createScene('skater');
const root = doc.createNode('skater');
scene.addChild(root);
const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);

const bones = {};
bones.body = doc.createNode('body');
root.addChild(bones.body);
// Parents are created before their children (PIVOTS lists them in that order).
for (const name of BONES.slice(1)) {
  const parent = PARENTS[name] ?? 'body';
  const pp = parent === 'body' ? [0, 0, 0] : PIVOTS[parent];
  bones[name] = doc.createNode(name).setTranslation(PIVOTS[name].map((v, k) => v - pp[k]));
  bones[parent].addChild(bones[name]);
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
root.addChild(doc.createNode('mesh').setMesh(doc.createMesh('skater').addPrimitive(prim)).setSkin(skin));
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
