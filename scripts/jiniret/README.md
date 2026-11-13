# How jiniret.glb was made

The source was a 14 MB 3D-printing model (one gray mesh, about 3 million triangles, lying down: up = −z, face = +y).
These scripts turn it into `assets/models/jiniret.glb` (~740 KB): upright, simplified to 120k triangles, rigged
(body → head, arms, legs) and painted with vertex colours, the same way as Bbokari.

```bash
cd scripts/jiniret
npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer
mkdir -p work
node simplify.mjs /path/to/original.glb 0.12 work/simp.json   # weld + simplify, bake transforms
WORK=work node analyze.mjs                                      # stand him up, normalise, print the shape profile
WORK=work node build.mjs ../../assets/models/jiniret.glb --compress
```

`regions.mjs` holds the joints, skin weights and colours. Keep `PIVOTS` and the eye spots in sync with
`src/jiniret/WolfChan.js`.
