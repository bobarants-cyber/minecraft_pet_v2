// Runs before every build (so before every start): if a package the app needs is missing — for example after a
// `git pull` that added one — install it, so you never have to remember `npm install`.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const wanted = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const missing = wanted.filter((name) => !fs.existsSync(`node_modules/${name}/package.json`));
if (missing.length) {
  console.log(`Installing what's new: ${missing.join(', ')}…`);
  execSync('npm install --no-audit --no-fund', { stdio: 'inherit' });
}
