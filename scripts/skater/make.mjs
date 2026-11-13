// Turns the sculpted distance field (model.mjs) into a mesh: samples it on a fine 3D grid, builds the surface with
// "surface nets" (one vertex per surface cell, smoothed onto the true surface), then simplifies it. Writes
// work/norm.json ({ P }) and work/simp.json ({ idx }) for build.mjs, like the other sculpt pipelines.
import fs from 'node:fs';
import { MeshoptSimplifier } from 'meshoptimizer';
import { sdf, BOUNDS } from './model.mjs';

const STEP = Number(process.argv[2] ?? 0.004);
const TARGET_TRIS = Number(process.argv[3] ?? 140000);
const [x0, y0, z0] = BOUNDS.min, [x1, y1, z1] = BOUNDS.max;
const NX = Math.ceil((x1 - x0) / STEP) + 1, NY = Math.ceil((y1 - y0) / STEP) + 1, NZ = Math.ceil((z1 - z0) / STEP) + 1;
const F = new Float32Array(NX * NY * NZ);
const at = (i, j, k) => i + NX * (j + NY * k);
console.time('sample');
const p = [0, 0, 0];
for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
  p[0] = x0 + i * STEP; p[1] = y0 + j * STEP; p[2] = z0 + k * STEP;
  F[at(i, j, k)] = sdf(p);
}
console.timeEnd('sample');

// Surface nets: a vertex in every cell the surface passes through, at the average of its edge crossings.
const vid = new Int32Array((NX - 1) * (NY - 1) * (NZ - 1)).fill(-1);
const cell = (i, j, k) => i + (NX - 1) * (j + (NY - 1) * k);
const P = [];
const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
for (let k = 0; k < NZ - 1; k++) for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
  const v = corners.map(([a, b, c]) => F[at(i + a, j + b, k + c)]);
  let inside = 0;
  for (const x of v) if (x < 0) inside++;
  if (inside === 0 || inside === 8) continue;
  let sx = 0, sy = 0, sz = 0, n = 0;
  for (const [a, b] of edges) {
    if ((v[a] < 0) === (v[b] < 0)) continue;
    const t = v[a] / (v[a] - v[b]);
    const ca = corners[a], cb = corners[b];
    sx += ca[0] + (cb[0] - ca[0]) * t; sy += ca[1] + (cb[1] - ca[1]) * t; sz += ca[2] + (cb[2] - ca[2]) * t; n++;
  }
  vid[cell(i, j, k)] = P.length / 3;
  P.push(x0 + (i + sx / n) * STEP, y0 + (j + sy / n) * STEP, z0 + (k + sz / n) * STEP);
}
// Quads across every grid edge with a sign change, joining the four cells around it.
const idx = [];
const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
for (let k = 1; k < NZ - 1; k++) for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) {
  const f0 = F[at(i, j, k)] < 0;
  if (f0 !== (F[at(i + 1, j, k)] < 0)) quad(vid[cell(i, j - 1, k - 1)], vid[cell(i, j, k - 1)], vid[cell(i, j, k)], vid[cell(i, j - 1, k)], !f0);
  if (f0 !== (F[at(i, j + 1, k)] < 0)) quad(vid[cell(i - 1, j, k - 1)], vid[cell(i - 1, j, k)], vid[cell(i, j, k)], vid[cell(i, j, k - 1)], !f0);
  if (f0 !== (F[at(i, j, k + 1)] < 0)) quad(vid[cell(i - 1, j - 1, k)], vid[cell(i, j - 1, k)], vid[cell(i, j, k)], vid[cell(i - 1, j, k)], !f0);
}
console.log('raw vertices', P.length / 3, 'triangles', idx.length / 3);

// Snap each vertex exactly onto the surface (a couple of Newton steps along the field's gradient).
const e = STEP * 0.25;
for (let v = 0; v < P.length; v += 3) {
  for (let it = 0; it < 2; it++) {
    const q = [P[v], P[v + 1], P[v + 2]];
    const d = sdf(q);
    const g = [0, 1, 2].map((a) => { const q1 = [...q], q2 = [...q]; q1[a] += e; q2[a] -= e; return (sdf(q1) - sdf(q2)) / (2 * e); });
    const gl = Math.hypot(...g) || 1;
    for (let a = 0; a < 3; a++) P[v + a] -= (d * g[a]) / (gl * gl);
  }
}

await MeshoptSimplifier.ready;
const pos = new Float32Array(P);
const ind = new Uint32Array(idx);
const [out] = MeshoptSimplifier.simplify(ind, pos, 3, Math.min(ind.length, TARGET_TRIS * 3), 0.0004, []);
// Drop vertices nothing uses any more.
const remap = new Int32Array(P.length / 3).fill(-1);
const P2 = [], I2 = [];
for (const i of out) { if (remap[i] < 0) { remap[i] = P2.length / 3; P2.push(P[3 * i], P[3 * i + 1], P[3 * i + 2]); } I2.push(remap[i]); }
console.log('simplified vertices', P2.length / 3, 'triangles', I2.length / 3);
fs.mkdirSync('work', { recursive: true });
fs.writeFileSync('work/norm.json', JSON.stringify({ P: P2 }));
fs.writeFileSync('work/simp.json', JSON.stringify({ idx: I2 }));
