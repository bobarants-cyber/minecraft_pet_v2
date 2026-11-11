// Builds Pocket Bbokari (the phone version) from template.html:
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 meshoptimizer
//   node phone/build.mjs          (also builds Bbokari's skills for the phone: phone/build-brain.mjs)
// Writes phone/pocket-bbokari.html (the claude.ai page) and ios/Resources/pocket.html (the iPhone app's copy).
// The model is embedded uncompressed so the page needs no WebAssembly decoder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(path.join(repo, 'assets/models/bbokari.glb'));
for (const e of doc.getRoot().listExtensionsUsed()) e.dispose();
const glb = Buffer.from(await io.writeBinary(doc));

// Bbokari's skills for the phone (phone/build-brain.mjs makes this file).
await import('./build-brain.mjs');
const brain = fs.readFileSync(path.join(here, 'brain.bundle.js'), 'utf8').replace(/<\/script/gi, '<\\/script');

const html = fs
  .readFileSync(path.join(here, 'template.html'), 'utf8')
  .replace('__BRAIN__', () => brain)
  .replace('__GLB__', glb.toString('base64'))
  .replace('__MP4__', fs.readFileSync(path.join(repo, 'ios/Resources/float.mp4')).toString('base64'));
fs.writeFileSync(path.join(here, 'pocket-bbokari.html'), html);
const viewport = '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n';
fs.writeFileSync(path.join(repo, 'ios/Resources/pocket.html'), viewport + html);
console.log('built', (html.length / 1e6).toFixed(1), 'MB');
