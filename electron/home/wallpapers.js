// Wallpapers for the home screen and the screen savers: soft gradient presets, moving ones, or your own photo.
// Everything is drawn into a canvas that the Liquid Glass renderer uses as its background.

import { winterLayout, pineTiers, cabinRoof } from './winterScene.js';

const rand = (a, b) => a + Math.random() * (b - a);

// [base color, ...blobs: [x, y, radius (fractions of the larger side), color]]
export const GRADIENTS = {
  dawn: ['#f6c9a8', [0.15, 0.2, 0.7, '#ff9a8b'], [0.85, 0.15, 0.6, '#8fb8ff'], [0.6, 0.85, 0.7, '#ffd29d'], [0.2, 0.9, 0.5, '#c59bff']],
  sunset: ['#2b1b4a', [0.2, 0.8, 0.8, '#ff6f61'], [0.8, 0.9, 0.7, '#ffb347'], [0.7, 0.2, 0.6, '#6a3093'], [0.1, 0.1, 0.5, '#3a1c71']],
  ocean: ['#0b2a4a', [0.2, 0.3, 0.7, '#1e90ff'], [0.8, 0.7, 0.8, '#00c9a7'], [0.5, 1.0, 0.6, '#0052d4'], [0.9, 0.1, 0.5, '#65c7f7']],
  candy: ['#ffd6e8', [0.1, 0.2, 0.6, '#ff8fd8'], [0.9, 0.3, 0.6, '#8fd3ff'], [0.4, 0.9, 0.7, '#fff38f'], [0.8, 0.9, 0.5, '#b18fff']],
  midnight: ['#070b1f', [0.2, 0.3, 0.7, '#1b2a6b'], [0.8, 0.8, 0.7, '#4b1d6b'], [0.6, 0.1, 0.4, '#0e4d6e']],
  mint: ['#d8fff1', [0.2, 0.2, 0.6, '#7cf2c6'], [0.8, 0.8, 0.7, '#7cc4f2'], [0.9, 0.2, 0.5, '#e8ff9c']],
  grape: ['#22113a', [0.3, 0.3, 0.7, '#7b2ff7'], [0.8, 0.7, 0.7, '#f107a3'], [0.1, 0.9, 0.5, '#3a0ca3']],
  forest: ['#0f2a1d', [0.2, 0.7, 0.8, '#2d6a4f'], [0.8, 0.3, 0.7, '#95d5b2'], [0.6, 0.9, 0.5, '#d8f3dc']],
  mono: ['#d9d9de', [0.2, 0.2, 0.7, '#ffffff'], [0.8, 0.8, 0.8, '#9a9aa6']],
};
export const ANIMATED = { matrix: '💻 Hacker', winter: '❄️ Winter night', aurora: '🌌 Aurora', lava: '🌋 Lava', stars: '⭐ Stars', waves: '🌊 Waves' };

function paintGradient(g, w, h, spec) {
  const [base, ...blobs] = spec;
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const big = Math.max(w, h);
  for (const [x, y, r, c] of blobs) {
    const grad = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * big);
    grad.addColorStop(0, c);
    grad.addColorStop(1, c + '00');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
  // a little grain so it doesn't band
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 6;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

/** A wallpaper: { canvas, animated, draw(t), ready }. spec = { type: 'gradient' | 'animated' | 'photo', value }. */
export function createWallpaper(spec, width, height, { animatedScale = 0.5 } = {}) {
  const scale = spec?.type === 'animated' ? animatedScale : 1; // moving ones can be drawn smaller
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(width * scale));
  canvas.height = Math.max(2, Math.round(height * scale));
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const wp = { canvas, animated: false, draw() {}, ready: Promise.resolve() };

  if (spec?.type === 'photo' && spec.value) {
    wp.ready = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
        g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        resolve();
      };
      img.onerror = () => { paintGradient(g, W, H, GRADIENTS.dawn); resolve(); };
      img.src = spec.value.startsWith('/') ? 'file://' + encodeURI(spec.value) : spec.value;
    });
    return wp;
  }

  if (spec?.type === 'animated') {
    wp.animated = true;
    const kind = spec.value;
    if (kind === 'matrix') {
      // green code rain over a dark desk glow
      const size = 14, glyphs = '01<>{}[]/=+*#$%&@ABCDEFabcdef';
      let cols = [], lastT = 0;
      g.fillStyle = '#000805'; g.fillRect(0, 0, W, H);
      wp.draw = (t) => {
        const n = Math.ceil(W / size);
        if (cols.length !== n) cols = Array.from({ length: n }, () => rand(-40, H / size));
        const steps = Math.min(4, Math.floor((t - lastT) * 18));
        if (steps <= 0) return;
        lastT = t;
        for (let s = 0; s < steps; s++) {
          g.fillStyle = 'rgba(0,8,5,0.12)'; g.fillRect(0, 0, W, H);
          g.font = `${size}px monospace`;
          for (let i = 0; i < n; i++) {
            g.fillStyle = Math.random() < 0.04 ? '#d8ffe0' : '#20e060';
            g.fillText(glyphs[(Math.random() * glyphs.length) | 0], i * size, cols[i] * size);
            cols[i] = cols[i] * size > H && Math.random() > 0.97 ? 0 : cols[i] + 1;
          }
        }
      };
      wp.draw(1);
      return wp;
    }
    if (kind === 'winter') {
      // a snowy night: moon, mountains, pines, a warm little window, and snow falling
      const scene = document.createElement('canvas');
      scene.width = W; scene.height = H;
      const s = scene.getContext('2d');
      const sky = s.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0a1030'); sky.addColorStop(0.6, '#26305e'); sky.addColorStop(1, '#5b6aa0');
      s.fillStyle = sky; s.fillRect(0, 0, W, H);
      for (let i = 0; i < 120; i++) { s.fillStyle = `rgba(255,255,255,${rand(0.2, 0.8)})`; s.fillRect(rand(0, W), rand(0, H * 0.5), 1, 1); }
      const mx = W * 0.75, my = H * 0.18, mr = Math.min(W, H) * 0.06;
      const glow = s.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4);
      glow.addColorStop(0, 'rgba(255,250,220,0.35)'); glow.addColorStop(1, 'rgba(255,250,220,0)');
      s.fillStyle = glow; s.fillRect(0, 0, W, H);
      s.fillStyle = '#f6f1dc'; s.beginPath(); s.arc(mx, my, mr, 0, 7); s.fill();
      s.fillStyle = 'rgba(200,190,160,0.35)'; for (const [dx, dy, r] of [[-0.3, -0.2, 0.2], [0.25, 0.15, 0.15], [-0.1, 0.35, 0.1]]) { s.beginPath(); s.arc(mx + dx * mr, my + dy * mr, r * mr, 0, 7); s.fill(); }
      const ridge = (base, amp, color, snow, seed) => {
        s.fillStyle = color; s.beginPath(); s.moveTo(0, H);
        const pts = [];
        for (let x = 0; x <= W; x += W / 12) { const y = base - Math.abs(Math.sin(x / W * 7 + seed)) * amp - Math.sin(x / W * 19 + seed * 2) * amp * 0.15; pts.push([x, y]); s.lineTo(x, y); }
        s.lineTo(W, H); s.fill();
        if (snow) { s.fillStyle = 'rgba(235,240,255,0.85)'; for (const [x, y] of pts) if (y < base - amp * 0.55) { s.beginPath(); s.moveTo(x - W / 40, y + amp * 0.18); s.lineTo(x, y); s.lineTo(x + W / 40, y + amp * 0.18); s.fill(); } }
      };
      ridge(H * 0.62, H * 0.3, '#3a4678', true, 1.3);
      ridge(H * 0.75, H * 0.18, '#2c3763', true, 4.1);
      s.fillStyle = '#e9eef9'; s.fillRect(0, H * 0.82, W, H); // snowy ground (the real snow piles on top of it)
      // the trees and the cabin come from the shared layout, so the real snow can settle on them (snow/snow.js)
      const lay = winterLayout(W / scale, H / scale);
      s.save(); s.scale(scale, scale);
      for (const t of lay.trees) {
        s.fillStyle = '#16283d';
        for (const tier of pineTiers(t)) { s.beginPath(); s.moveTo(...tier.l); s.lineTo(...tier.a); s.lineTo(...tier.r); s.fill(); }
        s.fillStyle = '#4a3020'; s.fillRect(t.x - t.h * 0.03, t.y, t.h * 0.06, t.h * 0.08);
      }
      // a cabin with a warm window
      const c = lay.cabin, cx = c.x, cy = c.y, cw = c.w, roof = cabinRoof(c);
      s.fillStyle = '#5a3a26'; s.fillRect(cx, cy - cw * 0.55, cw, cw * 0.55);
      s.fillStyle = '#3a2618'; s.beginPath(); s.moveTo(...roof.l); s.lineTo(...roof.a); s.lineTo(...roof.r); s.fill();
      const win = s.createRadialGradient(cx + cw * 0.3, cy - cw * 0.28, 0, cx + cw * 0.3, cy - cw * 0.28, cw * 0.5);
      win.addColorStop(0, 'rgba(255,200,110,0.6)'); win.addColorStop(1, 'rgba(255,200,110,0)');
      s.fillStyle = win; s.fillRect(cx - cw, cy - cw * 1.2, cw * 3, cw * 1.5);
      s.fillStyle = '#ffc56b'; s.fillRect(cx + cw * 0.18, cy - cw * 0.4, cw * 0.24, cw * 0.18);
      s.restore();
      const flakes = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), r: rand(0.6, 2), sp: rand(0.02, 0.06), ph: rand(0, 6) }));
      wp.draw = (t) => {
        g.drawImage(scene, 0, 0);
        g.fillStyle = 'rgba(255,255,255,0.85)';
        for (const f of flakes) { const y = ((f.y + t * f.sp) % 1) * H, x = (f.x + Math.sin(t * 0.5 + f.ph) * 0.01) * W; g.beginPath(); g.arc(x, y, f.r, 0, 7); g.fill(); }
      };
      wp.draw(0);
      return wp;
    }
    if (kind === 'stars') {
      const stars = Array.from({ length: 260 }, () => ({ x: Math.random(), y: Math.random(), r: rand(0.3, 1.6), tw: rand(0, 6), sp: rand(0.002, 0.01) }));
      wp.draw = (t) => {
        const grad = g.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#05081c'); grad.addColorStop(1, '#1b1446');
        g.fillStyle = grad; g.fillRect(0, 0, W, H);
        for (const s of stars) {
          const x = ((s.x + t * s.sp) % 1) * W;
          g.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + s.tw));
          g.fillStyle = '#fff';
          g.beginPath(); g.arc(x, s.y * H, s.r, 0, Math.PI * 2); g.fill();
        }
        g.globalAlpha = 1;
      };
    } else if (kind === 'waves') {
      wp.draw = (t) => {
        const grad = g.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#9fd8ff'); grad.addColorStop(1, '#0b3b74');
        g.fillStyle = grad; g.fillRect(0, 0, W, H);
        const cols = ['#5ab0ff', '#2f86e0', '#1b62b8', '#0f4790', '#0a3570'];
        cols.forEach((c, i) => {
          g.fillStyle = c; g.globalAlpha = 0.75;
          g.beginPath(); g.moveTo(0, H);
          const base = H * (0.45 + i * 0.12);
          for (let x = 0; x <= W; x += 8) g.lineTo(x, base + Math.sin(x / (90 + i * 30) + t * (0.6 + i * 0.15) + i) * (18 + i * 6));
          g.lineTo(W, H); g.fill();
        });
        g.globalAlpha = 1;
      };
    } else {
      // aurora and lava: soft blobs drifting around
      const pal = kind === 'lava' ? ['#ff4e50', '#fc913a', '#f9d423', '#e1306c', '#ff6f91'] : ['#00f5a0', '#00d9f5', '#7b2ff7', '#36d1dc', '#5b86e5'];
      const base = kind === 'lava' ? '#2a0a12' : '#041325';
      const blobs = pal.map((c, i) => ({ c, x: Math.random(), y: Math.random(), r: rand(0.35, 0.6), sx: rand(0.03, 0.08), sy: rand(0.03, 0.08), p: i * 1.7 }));
      wp.draw = (t) => {
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = base; g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'lighter';
        const big = Math.max(W, H);
        for (const b of blobs) {
          const x = (0.5 + 0.45 * Math.sin(t * b.sx * 6 + b.p)) * W;
          const y = (0.5 + 0.45 * Math.cos(t * b.sy * 6 + b.p * 1.3)) * H;
          const gr = g.createRadialGradient(x, y, 0, x, y, b.r * big);
          gr.addColorStop(0, b.c + 'aa'); gr.addColorStop(1, b.c + '00');
          g.fillStyle = gr; g.fillRect(0, 0, W, H);
        }
        g.globalCompositeOperation = 'source-over';
      };
    }
    wp.draw(0);
    return wp;
  }

  paintGradient(g, W, H, GRADIENTS[spec?.value] ?? GRADIENTS.dawn);
  return wp;
}
