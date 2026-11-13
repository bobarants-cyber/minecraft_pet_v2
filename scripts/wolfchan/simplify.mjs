import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, weld, simplify, getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';
await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
for (const p of doc.getRoot().listMeshes()[0].listPrimitives()) p.setAttribute('NORMAL', null);
await doc.transform(dequantize(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: Number(process.argv[3]), error: 0.0005, lockBorder: false }));
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const node = doc.getRoot().listNodes().find(n => n.getMesh());
const M = node.getWorldMatrix();
const pos = prim.getAttribute('POSITION').getArray();
const idx = prim.getIndices().getArray();
// Bake world transform into positions.
const out = new Float32Array(pos.length);
for (let i = 0; i < pos.length; i += 3) {
  const [x, y, z] = [pos[i], pos[i + 1], pos[i + 2]];
  out[i] = M[0]*x + M[4]*y + M[8]*z + M[12]; out[i+1] = M[1]*x + M[5]*y + M[9]*z + M[13]; out[i+2] = M[2]*x + M[6]*y + M[10]*z + M[14];
}
fs.writeFileSync(process.argv[4], JSON.stringify({ pos: Array.from(out), idx: Array.from(idx) }));
console.log('verts', out.length / 3, 'tris', idx.length / 3);
