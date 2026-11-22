// Screen savers. Bubbles and the lava lamp are real Liquid Glass (Liquid Glass Studio's shaders): glass blobs drift
// over the wallpaper and melt into each other when they touch. The rest are drawn on a plain canvas.
import { createLiquidGlass } from './liquidglass.js';
import { createWallpaper } from './wallpapers.js';

export const SAVER_LIST = [
  ['bubbles', '🫧 Glass bubbles'],
  ['lava', '🌋 Glass lava lamp'],
  ['aurora', '🌌 Aurora'],
  ['warp', '🚀 Warp speed'],
  ['matrix', '💻 Hacker rain'],
  ['photos', '🖼 My photos'],
  ['clock', '🕰 Big clock'],
  ['bounce', '📺 Bouncing pet'],
  ['fireflies', '✨ Fireflies'],
];

const rand = (a, b) => a + Math.random() * (b - a);
const pad = (n) => String(n).padStart(2, '0');

/** Starts a saver in `canvas` (full window). Returns stop(). */
export function runSaver(kind, canvas, { wallpaper, photos = [], petName = 'Bbokari', glassParams = {} } = {}) {
  const W = () => innerWidth, H = () => innerHeight;
  let raf = 0;
  const loop = (fn) => { const step = (t) => { raf = requestAnimationFrame(step); fn(t / 1000); }; raf = requestAnimationFrame(step); };

  if (kind === 'bubbles' || kind === 'lava') {
    const glass = createLiquidGlass(canvas);
    if (glass) {
      const wp = createWallpaper(kind === 'lava' ? { type: 'animated', value: 'lava' } : wallpaper ?? { type: 'gradient', value: 'ocean' }, W(), H());
      wp.ready.then(() => glass.setBackground(wp.canvas));
      const n = kind === 'lava' ? 9 : 14;
      const blobs = Array.from({ length: n }, () => {
        const r = kind === 'lava' ? rand(70, 150) : rand(40, 120);
        return { r, x: rand(r, W() - r), y: rand(0, H() * 1.2), vx: rand(-30, 30), vy: kind === 'lava' ? rand(-40, 40) : -rand(30, 90), ph: rand(0, 6) };
      });
      glass.setParams({ ...glassParams, merge: kind === 'lava' ? 0.12 : 0.06, roundness: 2, refThickness: kind === 'lava' ? 40 : 26, refDistance: 0.07, glareFactor: 70, refFresnelFactor: 20, refDispersion: 18, blurRadius: 6, shadowFactor: 10, tint: { r: 255, g: 255, b: 255, a: 0.03 } });
      let prev = 0;
      loop((t) => {
        const dt = Math.min(0.05, t - prev || 0.016); prev = t;
        if (wp.animated) { wp.draw(t); glass.setBackground(wp.canvas); }
        for (const b of blobs) {
          b.x += (b.vx + Math.sin(t * 0.8 + b.ph) * 20) * dt;
          b.y += b.vy * dt;
          if (kind === 'lava') {
            // up warm, down cool, like a lava lamp
            if (b.y < b.r * 0.5) b.vy = Math.abs(b.vy); if (b.y > H() - b.r * 0.5) b.vy = -Math.abs(b.vy);
          } else if (b.y < -b.r * 2) { b.y = H() + b.r; b.x = rand(b.r, W() - b.r); }
          if (b.x < b.r || b.x > W() - b.r) b.vx *= -1;
        }
        const wob = (b) => 1 + Math.sin(t * 2 + b.ph) * 0.06;
        glass.setShapes(blobs.map((b) => {
          const w = b.r * 2 * wob(b), h = b.r * 2 / wob(b);
          return { x: b.x - w / 2, y: b.y - h / 2, w, h, r: Math.min(w, h) / 2 };
        }));
        glass.render();
      });
      return () => cancelAnimationFrame(raf);
    }
    kind = 'aurora'; // no WebGL2: fall back to a 2D one
  }

  const g = canvas.getContext('2d');
  const fit = () => { canvas.width = W() * devicePixelRatio; canvas.height = H() * devicePixelRatio; g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); };
  fit();
  addEventListener('resize', fit);

  if (kind === 'aurora') {
    const wp = createWallpaper({ type: 'animated', value: 'aurora' }, W(), H());
    loop((t) => { wp.draw(t * 1.6); g.drawImage(wp.canvas, 0, 0, W(), H()); });
  } else if (kind === 'warp') {
    const stars = Array.from({ length: 600 }, () => ({ x: rand(-1, 1), y: rand(-1, 1), z: rand(0.05, 1) }));
    loop(() => {
      g.fillStyle = 'rgba(0,0,8,0.35)'; g.fillRect(0, 0, W(), H());
      const cx = W() / 2, cy = H() / 2;
      for (const s of stars) {
        const px = cx + (s.x / s.z) * cx, py = cy + (s.y / s.z) * cy;
        s.z -= 0.006;
        if (s.z <= 0.02) { s.x = rand(-1, 1); s.y = rand(-1, 1); s.z = 1; continue; }
        const nx = cx + (s.x / s.z) * cx, ny = cy + (s.y / s.z) * cy;
        g.strokeStyle = `hsla(${200 + s.x * 60},90%,${60 + (1 - s.z) * 40}%,${1 - s.z})`;
        g.lineWidth = (1 - s.z) * 3;
        g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
      }
    });
  } else if (kind === 'matrix') {
    const size = 18, glyphs = 'アカサタナハマヤラワ0123456789ABCDEF<>{}#$%';
    let cols = [];
    loop(() => {
      const n = Math.ceil(W() / size);
      if (cols.length !== n) cols = Array.from({ length: n }, () => rand(-50, 0));
      g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, 0, W(), H());
      g.font = `${size}px monospace`;
      cols.forEach((y, i) => {
        g.fillStyle = Math.random() < 0.05 ? '#dfffe5' : '#2bff6a';
        g.fillText(glyphs[(Math.random() * glyphs.length) | 0], i * size, y * size);
        cols[i] = y * size > H() && Math.random() > 0.975 ? 0 : y + 1;
      });
    });
  } else if (kind === 'photos' && photos.length) {
    const imgs = photos.map((p) => Object.assign(new Image(), { src: 'file://' + encodeURI(p) }));
    let i = 0, start = 0;
    loop((t) => {
      if (!start) start = t;
      const k = (t - start) / 8; // 8 s per photo, slow zoom (Ken Burns)
      if (k >= 1) { i = (i + 1) % imgs.length; start = t; }
      const img = imgs[i];
      g.fillStyle = '#000'; g.fillRect(0, 0, W(), H());
      if (img.complete && img.naturalWidth) {
        const s = Math.max(W() / img.naturalWidth, H() / img.naturalHeight) * (1.05 + 0.1 * k);
        const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
        g.globalAlpha = Math.min(1, k * 4, (1 - k) * 4);
        g.drawImage(img, (W() - dw) / 2 + (i % 2 ? -1 : 1) * k * 40, (H() - dh) / 2, dw, dh);
        g.globalAlpha = 1;
      }
      clockText(g, W() - 40, H() - 40, 'right', 46);
    });
  } else if (kind === 'bounce') {
    const b = { x: rand(0, W() - 260), y: rand(0, H() - 120), vx: 160, vy: 130, hue: rand(0, 360) };
    let prev = 0;
    loop((t) => {
      const dt = Math.min(0.05, t - prev || 0.016); prev = t;
      g.fillStyle = '#000'; g.fillRect(0, 0, W(), H());
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 0 || b.x > W() - 260) { b.vx *= -1; b.hue = rand(0, 360); }
      if (b.y < 0 || b.y > H() - 120) { b.vy *= -1; b.hue = rand(0, 360); }
      g.fillStyle = `hsl(${b.hue},90%,60%)`;
      g.font = '700 64px -apple-system, sans-serif';
      g.fillText('🐝', b.x, b.y + 70);
      g.fillText(petName, b.x + 80, b.y + 72);
    });
  } else if (kind === 'fireflies') {
    const flies = Array.from({ length: 90 }, () => ({ x: rand(0, W()), y: rand(0, H()), a: rand(0, 6), s: rand(10, 35), ph: rand(0, 6) }));
    loop((t) => {
      const grad = g.createLinearGradient(0, 0, 0, H());
      grad.addColorStop(0, '#061a12'); grad.addColorStop(1, '#0b0f1e');
      g.fillStyle = grad; g.fillRect(0, 0, W(), H());
      for (const f of flies) {
        f.a += rand(-0.3, 0.3) * 0.1;
        f.x = (f.x + Math.cos(f.a) * f.s * 0.016 + W()) % W();
        f.y = (f.y + Math.sin(f.a) * f.s * 0.016 + H()) % H();
        const glow = 0.3 + 0.7 * Math.max(0, Math.sin(t * 1.7 + f.ph));
        const gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, 16);
        gr.addColorStop(0, `rgba(230,255,140,${glow})`); gr.addColorStop(1, 'rgba(230,255,140,0)');
        g.fillStyle = gr; g.fillRect(f.x - 16, f.y - 16, 32, 32);
      }
    });
  } else {
    // big clock (also used for "photos" when no photos were picked)
    const wp = createWallpaper(wallpaper ?? { type: 'gradient', value: 'midnight' }, W(), H());
    loop(() => {
      g.drawImage(wp.canvas, 0, 0, W(), H());
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, W(), H());
      clockText(g, W() / 2, H() / 2, 'center', Math.min(W() * 0.22, 260));
    });
  }
  return () => cancelAnimationFrame(raf);
}

function clockText(g, x, y, align, size) {
  const now = new Date();
  g.textAlign = align;
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 20;
  g.font = `200 ${size}px -apple-system, "SF Pro Display", sans-serif`;
  g.fillText(`${((now.getHours() + 11) % 12) + 1}:${pad(now.getMinutes())}`, x, y);
  g.font = `600 ${size * 0.16}px -apple-system, sans-serif`;
  g.fillText(now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }), x, y + size * 0.35);
  g.shadowBlur = 0;
  g.textAlign = 'left';
}
