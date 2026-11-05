# How bbokari.glb was made

The source was a 68 MB 3D-printing model (one gray mesh, about 1 million triangles, lying on its back).
These scripts turn it into `assets/models/bbokari.glb` (~390 KB): upright, simplified to 60k triangles,
cut into head / body / arms / legs at the joint pivots, and painted with vertex colours.

```bash
cd scripts/bbokari
npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer
mkdir -p work
node simplify.mjs /path/to/original.glb 0.06 work/simp.json   # weld + simplify, bake transforms
WORK=work node analyze.mjs                                      # stand it up, normalise, print the shape profile
WORK=work node build.mjs ../../assets/models/bbokari.glb --compress
```

`regions.mjs` holds the cut lines, pivots and colours. Keep `PIVOTS` in sync with `src/bbokari/BbokariRig.js`.
