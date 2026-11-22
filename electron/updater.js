// ⬇️ Keeps Bbokari (and FaceAway, which lives in the same folder) up to date from GitHub.
// check(): is there anything new?  apply(): pull it, install new packages if they changed, rebuild, restart.
// The Bbokari app (npm run make-app) also pulls every time you open it.
import { execFile } from 'node:child_process';
import path from 'node:path';

const REPO = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
export const UPDATE_BRANCH = 'claude/focused-clarke-n2vhgf';
const PATHS = ['/opt/homebrew/bin', '/opt/homebrew/opt/node@22/bin', '/usr/local/bin', '/usr/bin', '/bin'];
const env = () => ({ ...process.env, PATH: [...PATHS, process.env.PATH ?? ''].join(':'), GIT_TERMINAL_PROMPT: '0' });

function run(cmd, args, timeout = 120_000) {
  return new Promise((resolve) => execFile(cmd, args, { cwd: REPO, env: env(), timeout, maxBuffer: 8 << 20 }, (err, out, errOut) =>
    resolve({ ok: !err, out: String(out).trim(), err: String(errOut || err?.message || '').trim() })));
}

/** How many new changes are waiting on GitHub (0 = up to date, null = couldn't check, e.g. offline). */
export async function check() {
  const f = await run('git', ['fetch', '--quiet', 'origin', UPDATE_BRANCH], 30_000);
  if (!f.ok) return null;
  const n = await run('git', ['rev-list', '--count', 'HEAD..FETCH_HEAD']);
  return n.ok ? Number(n.out) || 0 : null;
}

/** Pulls the update and rebuilds. Returns {ok, changed, text}. */
export async function apply(onStep = () => {}) {
  const before = (await run('git', ['rev-parse', 'HEAD'])).out;
  onStep('⬇️ Downloading the update…');
  const p = await run('git', ['pull', '--no-edit', '--no-rebase', 'origin', UPDATE_BRANCH], 120_000);
  if (!p.ok) return { ok: false, text: /local changes|overwritten|conflict/i.test(p.err) ? 'Some files in the folder were changed by hand, so I can’t update over them. Ask Claude to help.' : `Couldn’t download it (${p.err.split('\n')[0].slice(0, 140)}).` };
  const after = (await run('git', ['rev-parse', 'HEAD'])).out;
  if (before === after) return { ok: true, changed: false, text: 'Already up to date ✅' };
  const files = (await run('git', ['diff', '--name-only', before, after])).out.split('\n');
  if (files.some((f) => f === 'package.json' || f === 'package-lock.json')) {
    onStep('📦 Installing new parts…');
    const i = await run('npm', ['install', '--no-audit', '--no-fund'], 600_000);
    if (!i.ok) return { ok: false, text: `npm install failed: ${i.err.split('\n').slice(-2).join(' ').slice(0, 160)}` };
  }
  onStep('🔨 Building…');
  const b = await run('npm', ['run', 'build'], 300_000);
  if (!b.ok) return { ok: false, text: `The build failed: ${b.err.split('\n').slice(-2).join(' ').slice(0, 160)}` };
  const log = (await run('git', ['log', '--format=• %s', `${before}..${after}`])).out.split('\n').slice(0, 6).join('\n');
  return { ok: true, changed: true, faceAway: files.some((f) => f.startsWith('faceaway/')), text: log };
}
