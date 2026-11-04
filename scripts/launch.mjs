// Launches Electron. With --dev it also starts the Vite dev server and points Electron at it.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dev = process.argv.includes('--dev');
const PORT = 5173;
const URL = `http://localhost:${PORT}`;

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (dev) env.VITE_DEV_SERVER_URL = URL;

let vite = null;
if (dev) {
  vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'inherit', env });
  for (let i = 0; ; i++) {
    try {
      await fetch(URL);
      break;
    } catch {
      if (i > 100) throw new Error('Vite dev server did not start');
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

const electron = spawn(require('electron'), ['.'], { stdio: 'inherit', env });
const stop = () => {
  vite?.kill();
  electron.kill();
};
electron.on('exit', (code) => {
  vite?.kill();
  process.exit(code ?? 0);
});
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
