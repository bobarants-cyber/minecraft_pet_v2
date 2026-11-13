# How skater.glb was made

There was no downloadable model, so he's sculpted in code from the Meshy screenshots: `model.mjs` is a signed-distance
field where every part (head, cheeks, ears, tuft, eyes, mouth, shirt, arms, hands, legs, shoes) is blended into the
next like clay. `make.mjs` turns it into a mesh (surface nets on a 4 mm grid, snapped onto the surface, simplified),
and `build.mjs` paints it (`regions.mjs`), rigs it (body → head, arms, legs) and writes the GLB.

```bash
cd scripts/skater
node make.mjs 0.004 160000
WORK=work node build.mjs ../../assets/models/skater.glb --compress
```

His red cape became a skateboard, built in `src/skater/Skater.js`.
