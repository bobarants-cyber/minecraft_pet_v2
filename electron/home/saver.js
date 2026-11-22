// The screen saver page: runs the chosen saver until you move or press a key.
import { runSaver } from './savers.js';
const host = window.homeHost;
const kind = new URLSearchParams(location.search).get('kind') || 'bubbles';
const c = document.getElementById('c');
const r = await host?.get().catch(() => null);
const cfg = r?.config ?? {};
runSaver(kind, c, { wallpaper: cfg.wallpaper, photos: cfg.saver?.photos ?? [], petName: r?.name, glassParams: cfg.glass });
requestAnimationFrame(() => c.classList.add('on'));
// any key or a real mouse move stops it (after a moment, so it doesn't stop as it starts)
const ready = Date.now() + 1500;
let start = null;
const stop = () => { if (Date.now() > ready) host?.stopSaver(); };
addEventListener('keydown', stop);
addEventListener('mousedown', stop);
addEventListener('mousemove', (e) => {
  if (!start) start = [e.screenX, e.screenY];
  if (Math.hypot(e.screenX - start[0], e.screenY - start[1]) > 12) stop();
});
