// Films the Mac scenes as still pictures for the iPhone Dynamic Island (ios/Resources/Assets.xcassets/pose-*).
// Run `npm run build && npx vite preview --port 4173` first, then `node phone/island-poses.cjs` and crop the raw-*.png files.
const { chromium } = require('playwright');
const KINDS = ['idle', 'video', 'music', 'writing', 'gaming', 'coding', 'reading', 'drawing', 'meeting', 'sleep'];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 700, height: 550 }, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.addInitScript(() => {
    const noop = () => {};
    window.mobHost = new Proxy({ getSettings: async () => ({ mob: 'bbokari', petSize: 260, autoWalk: false, walkSpeed: 1, idleSleepMin: 0, reactToActivity: true, outfit: 'none' }), ask: async () => ({ ok: true, text: '' }) }, { get: (t, k) => (k in t ? t[k] : noop) });
    try { localStorage.setItem('mob.greeted', new Date().toDateString()); } catch {}
  });
  await p.goto('http://localhost:4173/');
  await p.waitForTimeout(5000);
  await p.evaluate(() => { document.documentElement.style.background = 'transparent'; document.body.style.background = 'transparent'; });
  for (const k of KINDS) {
    await p.evaluate((k) => {
      const c = window.mob.character;
      c.activity = ['idle', 'sleep'].includes(k) ? null : k;
      if (k === 'sleep') c.trigger('sleep', {}, true);
    }, k);
    await p.waitForTimeout(k === 'sleep' ? 6000 : 3500);
    await p.screenshot({ path: `raw-${k}.png`, omitBackground: true });
    if (k === 'sleep') await p.evaluate(() => window.mob.character.trigger('idle', {}, true));
  }
  await b.close();
})();
