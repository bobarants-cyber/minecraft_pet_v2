// Wallpapers for the home screen and the screen savers: soft gradient presets, moving ones, or your own photo.
// Everything is drawn into a canvas that the Liquid Glass renderer uses as its background.

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
export const ANIMATED = { aurora: '🌌 Aurora', lava: '🌋 Lava', stars: '⭐ Stars', waves: '🌊 Waves' };

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
export function createWallpaper(spec, width, height) {
  const scale = spec?.type === 'animated' ? 0.5 : 1; // moving ones are drawn smaller (the glass blurs anyway)
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
