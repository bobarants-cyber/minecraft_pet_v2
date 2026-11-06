const { chromium } = require('playwright');
const FPS = 24, LEN = 36, SIZE = 480;
const T = [
  [0.3, 'wave', 2.2, 'Hi! I\'m right here 👋'],
  [5, 'hop', 1.0, 'Bbok bbok! 🐥'],
  [10, 'think', 2.0, null],
  [14, 'dance', 3.2, '🎵 la la la~'],
  [19.5, 'wave', 1.5, 'Drink some water! 💧'],
  [24, 'hop', 1.0, 'You got this! 💪'],
  [28.5, 'surprised', 0.6, null],
  [30, 'idle', 0, 'Take a little break 🧘'],
];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => { const u = new URL(r.request().url()); r.fulfill({ path: 'node_modules/three/' + u.pathname.replace('/npm/three@0.160.0/', ''), contentType: 'text/javascript' }); });
  await p.addInitScript(() => { window.__RENDER__ = true; let s = 7; Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647); });
  await p.goto('file://' + process.cwd() + '/render.html');
  await p.waitForFunction(() => window.__api?.loaded, null, { timeout: 60000 });
  await p.evaluate(() => { for (let i = 0; i < 48; i++) window.__step(1 / 24); });
  let ev = 0;
  for (let f = 0; f < FPS * LEN; f++) {
    const t = f / FPS;
    while (ev < T.length && T[ev][0] <= t) {
      const [, a, d, line] = T[ev++];
      await p.evaluate(([a, d, line]) => { if (a !== 'idle') window.__api.play(a, d); if (line) window.__api.say(line, a === 'idle' ? 3 : 3.2); }, [a, d, line]);
    }
    await p.evaluate(() => window.__step(1 / 24));
    await p.screenshot({ path: `frames/f${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  await b.close();
})();
