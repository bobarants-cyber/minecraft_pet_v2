// Runs before every build (so before every start): if a package the app needs is missing — for example after a
// `git pull` that added one — install it, so you never have to remember `npm install`.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const wanted = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const missing = wanted.filter((name) => !fs.existsSync(`node_modules/${name}/package.json`));
if (missing.length) {
  console.log(`Installing what's new: ${missing.join(', ')}…`);
  execSync('npm install --no-audit --no-fund', { stdio: 'inherit' });
}

// Newer npm versions skip packages' install steps unless approved, so Electron's app download may not have happened.
// Electron's own installer can also quit silently on very new Node versions, so on a Mac fall back to downloading
// the official zip from GitHub ourselves.
const EL = 'node_modules/electron';
if (fs.existsSync(`${EL}/install.js`) && !fs.existsSync(`${EL}/path.txt`)) {
  console.log('Finishing the Electron download (one time, about 100 MB)…');
  try {
    execSync(`node ${EL}/install.js`, { stdio: 'inherit' });
  } catch {}
  if (!fs.existsSync(`${EL}/path.txt`) && process.platform === 'darwin') {
    const version = JSON.parse(fs.readFileSync(`${EL}/package.json`, 'utf8')).version;
    let arch = 'x64';
    try {
      if (execSync('sysctl -n hw.optional.arm64', { encoding: 'utf8' }).trim() === '1') arch = 'arm64';
    } catch {}
    const zip = path.join(os.tmpdir(), `electron-v${version}-darwin-${arch}.zip`);
    execSync(`curl -fL --progress-bar -o "${zip}" https://github.com/electron/electron/releases/download/v${version}/electron-v${version}-darwin-${arch}.zip`, { stdio: 'inherit' });
    fs.rmSync(`${EL}/dist`, { recursive: true, force: true });
    fs.mkdirSync(`${EL}/dist`, { recursive: true });
    execSync(`ditto -x -k "${zip}" "${EL}/dist"`, { stdio: 'inherit' });
    fs.writeFileSync(`${EL}/dist/version`, version);
    fs.writeFileSync(`${EL}/path.txt`, 'Electron.app/Contents/MacOS/Electron');
    fs.rmSync(zip, { force: true });
    console.log('Electron is ready ✓');
  }
}
