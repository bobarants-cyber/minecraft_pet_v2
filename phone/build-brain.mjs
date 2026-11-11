// Builds phone/brain.bundle.js: Bbokari's skills (electron/*.js) for the phone, with phone stand-ins for Node's
// fs/path/os/child_process. phone/build.mjs puts it into the phone page.  node phone/build-brain.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const shim = (name) => path.join(here, 'shims', `${name}.js`);
await build({
  entryPoints: [path.join(here, 'brain.js')],
  outfile: path.join(here, 'brain.bundle.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'safari16',
  minify: true,
  legalComments: 'none',
  define: { 'process.env.OLLAMA_HOST': 'undefined', 'process.platform': '"ios"' },
  alias: { 'node:fs': shim('fs'), 'node:path': shim('path'), 'node:os': shim('os'), 'node:child_process': shim('child_process'), fs: shim('fs'), path: shim('path') },
});
console.log('built phone/brain.bundle.js');
