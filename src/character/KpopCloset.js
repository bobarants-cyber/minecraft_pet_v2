import * as THREE from 'three';

/**
 * K-pop items for the pets: things to hold (lightsticks, mics, photocards, albums, slogan towels, glow fans) and things
 * to wear on the head (performance headsets, hats, ear headbands, bows, tiaras, clips). Every item is built from a
 * base design and a style, in any of 16 colours and 4 finishes, so there are thousands of combinations. All designs
 * are original, generic K-pop fan-culture items (no group's official lightstick or logo).
 *
 * An item id is "design.style.colour.finish", e.g. "lightstick.heart.pink.glitter".
 * Held items are built in model units with the grip at the origin (y up); head items in head-bone units like the
 * wardrobe's hats (the head top is at about y = 0.645, the head about 0.33 across) and moved to fit each pet.
 * See docs/MODEL_QA.md for the checks every item goes through.
 */

export const COLORS = {
  pink: '#ff7eb6', red: '#ff4d5e', coral: '#ff8a65', orange: '#ffa53d', yellow: '#ffd84a', lime: '#b6f05a',
  mint: '#6fe3c1', teal: '#2ec4c4', sky: '#6cc8ff', blue: '#4c7dff', navy: '#2f3d8f', purple: '#9b6bff',
  lilac: '#c9a8ff', white: '#f7f6fb', black: '#26242e', silver: '#c9ced8',
};
export const FINISHES = { matte: 'Matte', glossy: 'Glossy', glitter: 'Glitter', holo: 'Holographic' };

const C = (name) => new THREE.Color(COLORS[name] ?? name);
const lighten = (name, k) => C(name).lerp(new THREE.Color('#ffffff'), k);
const darken = (name, k) => C(name).lerp(new THREE.Color('#000000'), k);

// ---------- materials (cached) ----------
const matCache = new Map();
let sparkleTex = null;
function sparkle() {
  if (sparkleTex) return sparkleTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.65})`;
    const s = Math.random() < 0.15 ? 2 : 1;
    g.fillRect(Math.random() * 128, Math.random() * 128, s, s);
  }
  sparkleTex = new THREE.CanvasTexture(c);
  sparkleTex.wrapS = sparkleTex.wrapT = THREE.RepeatWrapping;
  sparkleTex.repeat.set(3, 3);
  return sparkleTex;
}
/** A coloured material in one of the finishes. */
export function finishMat(color, finish = 'glossy', extra = {}) {
  const col = color instanceof THREE.Color ? color : C(color);
  const key = `${col.getHexString()}|${finish}|${JSON.stringify(extra)}`;
  if (matCache.has(key)) return matCache.get(key);
  let m;
  if (finish === 'matte') m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, ...extra });
  else if (finish === 'glitter') m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.35, emissive: 0xffffff, emissiveMap: sparkle(), emissiveIntensity: 0.55, ...extra });
  else if (finish === 'holo') m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.18, metalness: 0.3, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [180, 820], ...extra });
  else m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12, ...extra });
  matCache.set(key, m);
  return m;
}
const plain = (color, extra = {}) => finishMat(color, 'matte', { roughness: 0.6, ...extra });
const metal = (color = '#d7dbe3') => finishMat(color, 'matte', { metalness: 0.85, roughness: 0.25 });
/** The glowing, see-through-ish head of a lightstick. */
const glow = (color) => finishMat(color, 'glossy', { emissive: C(color), emissiveIntensity: 0.6, transparent: true, opacity: 0.9 });

// ---------- shape helpers ----------
const mesh = (geo, m) => { const x = new THREE.Mesh(geo, m); x.castShadow = true; return x; };
const cyl = (rt, rb, h, m, seg = 24) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const ball = (r, m, seg = 20) => mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), m);
const ring = (R, r, m, arc = Math.PI * 2) => mesh(new THREE.TorusGeometry(R, r, 10, 36, arc), m);
function extrude(shape, depth, m, bevel = depth * 0.45) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 18 });
  geo.center();
  return mesh(geo, m);
}
function heartShape(s = 1) {
  const h = new THREE.Shape();
  h.moveTo(0, -0.9 * s);
  h.bezierCurveTo(-0.15 * s, -0.7 * s, -1 * s, -0.25 * s, -1 * s, 0.25 * s);
  h.bezierCurveTo(-1 * s, 0.75 * s, -0.35 * s, 1 * s, 0, 0.55 * s);
  h.bezierCurveTo(0.35 * s, 1 * s, 1 * s, 0.75 * s, 1 * s, 0.25 * s);
  h.bezierCurveTo(1 * s, -0.25 * s, 0.15 * s, -0.7 * s, 0, -0.9 * s);
  return h;
}
function starShape(R, r, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? r : R;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  return s;
}
function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function moonShape(R) {
  const s = new THREE.Shape();
  s.absarc(0, 0, R, Math.PI * 0.35, Math.PI * 1.65, false);
  s.absarc(R * 0.45, 0, R * 0.78, Math.PI * 1.45, Math.PI * 0.55, true);
  return s;
}
function noteShape(k) {
  // an eighth note: a tilted oval head, a stem rising from its right side, and a flag curling down to the right
  const head = new THREE.Shape();
  head.absellipse(-0.22 * k, -0.62 * k, 0.3 * k, 0.21 * k, 0, Math.PI * 2, false, 0.35);
  const stem = new THREE.Shape();
  stem.moveTo(0.0 * k, -0.6 * k);
  stem.lineTo(0.0 * k, 0.78 * k);
  stem.bezierCurveTo(0.12 * k, 0.55 * k, 0.6 * k, 0.45 * k, 0.48 * k, 0.05 * k);
  stem.bezierCurveTo(0.5 * k, 0.32 * k, 0.25 * k, 0.42 * k, 0.11 * k, 0.48 * k);
  stem.lineTo(0.11 * k, -0.6 * k);
  stem.closePath();
  return [head, stem];
}

// ---------- canvas faces (photocards, albums, towels, fans) ----------
const texCache = new Map();
function canvasTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
const hex = (name) => `#${C(name).getHexString()}`;
const hexL = (name, k) => `#${lighten(name, k).getHexString()}`;
const hexD = (name, k) => `#${darken(name, k).getHexString()}`;
function drawHeart(g, x, y, s, fill) {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(x, y + 0.9 * s);
  g.bezierCurveTo(x - 0.15 * s, y + 0.7 * s, x - s, y + 0.25 * s, x - s, y - 0.25 * s);
  g.bezierCurveTo(x - s, y - 0.75 * s, x - 0.35 * s, y - s, x, y - 0.55 * s);
  g.bezierCurveTo(x + 0.35 * s, y - s, x + s, y - 0.75 * s, x + s, y - 0.25 * s);
  g.bezierCurveTo(x + s, y + 0.25 * s, x + 0.15 * s, y + 0.7 * s, x, y + 0.9 * s);
  g.fill();
}
function drawStar(g, x, y, R, fill) {
  g.fillStyle = fill;
  g.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? R * 0.45 : R;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.fill();
}
function drawSparkle(g, x, y, s, fill) {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(x, y - s); g.quadraticCurveTo(x, y, x + s, y); g.quadraticCurveTo(x, y, x, y + s);
  g.quadraticCurveTo(x, y, x - s, y); g.quadraticCurveTo(x, y, x, y - s);
  g.fill();
}
/** A photocard / album face: a soft gradient in the colour, a pattern, and a little doodle of a smiling face. */
function cardFace(style, color) {
  return canvasTex(`card|${style}|${color}`, 256, 384, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, hexL(color, 0.55));
    grd.addColorStop(1, hex(color));
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    const ink = hexD(color, 0.45), soft = 'rgba(255,255,255,0.75)';
    if (style === 'polaroid') {
      g.fillStyle = '#fbfaf7';
      g.fillRect(0, 0, w, h);
      g.fillStyle = grd;
      g.fillRect(18, 18, w - 36, h - 110);
    }
    for (let i = 0; i < 14; i++) {
      const x = (i * 97) % w, y = (i * 151) % h, s = 10 + (i % 4) * 6;
      if (style === 'hearts') drawHeart(g, x, y, s, soft);
      else if (style === 'stars') drawStar(g, x, y, s, soft);
      else drawSparkle(g, x, y, s, soft);
    }
    // a cute smiling doodle in the middle
    const cy = style === 'polaroid' ? h * 0.38 : h * 0.45;
    g.fillStyle = '#fffaf2';
    g.beginPath(); g.arc(w / 2, cy, 62, 0, Math.PI * 2); g.fill();
    g.fillStyle = ink;
    g.beginPath(); g.ellipse(w / 2 - 22, cy - 8, 7, 10, 0, 0, Math.PI * 2); g.ellipse(w / 2 + 22, cy - 8, 7, 10, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = ink; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.arc(w / 2, cy + 10, 18, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    g.fillStyle = 'rgba(255,140,170,0.7)';
    g.beginPath(); g.ellipse(w / 2 - 40, cy + 12, 11, 7, 0, 0, Math.PI * 2); g.ellipse(w / 2 + 40, cy + 12, 11, 7, 0, 0, Math.PI * 2); g.fill();
    if (style === 'polaroid') { drawHeart(g, w - 46, h - 50, 18, hex(color)); }
  });
}
function towelFace(style, color) {
  const words = { love: '♡ LOVE ♡', best: 'BEST ★ STAN', fighting: 'FIGHTING!' };
  return canvasTex(`towel|${style}|${color}`, 512, 128, (g, w, h) => {
    g.fillStyle = hex(color);
    g.fillRect(0, 0, w, h);
    g.fillStyle = hexL(color, 0.6);
    g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    g.font = '900 64px "Arial Rounded MT Bold", "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = hexD(color, 0.35); g.strokeText(words[style] ?? words.love, w / 2, h / 2 + 4);
    g.fillStyle = '#ffffff'; g.fillText(words[style] ?? words.love, w / 2, h / 2 + 4);
  });
}
function stripeTex(color) {
  return canvasTex(`stripe|${color}`, 64, 64, (g) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : hex(color); g.fillRect(0, i * 8, 64, 8); }
  });
}
function grilleTex() {
  return canvasTex('grille', 128, 128, (g) => {
    g.fillStyle = '#c3c7cf'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#7d828c'; g.lineWidth = 2;
    for (let i = -128; i < 256; i += 10) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); g.beginPath(); g.moveTo(i, 128); g.lineTo(i + 128, 0); g.stroke(); }
  });
}

// ---------- designs ----------
// Each: label, slot ('hand' | 'head'), styles { id: label }, build(style, colour, finish) → THREE.Group.
export const DESIGNS = {
  lightstick: {
    label: 'Lightstick', slot: 'hand', emoji: '🔦',
    styles: { orb: 'Orb', heart: 'Heart', star: 'Star', crown: 'Crown', bunny: 'Bunny', cube: 'Cube', moon: 'Moon', note: 'Music note', gem: 'Gem', cloud: 'Cloud' },
    handles: { classic: 'Classic', slim: 'Slim', chunky: 'Chunky', striped: 'Striped' },
    build(style, color, finish, handle = 'classic') {
      const g = new THREE.Group();
      // handle: grip rings, a power button, a wrist strap and a collar under the head
      const hm = handle === 'slim' ? plain('#2a2832', { roughness: 0.4 }) : handle === 'chunky' ? finishMat(lighten(color, 0.45), finish) : handle === 'striped' ? new THREE.MeshStandardMaterial({ map: stripeTex(color), roughness: 0.5 }) : plain('#f6f5fa', { roughness: 0.35 });
      const hr = handle === 'slim' ? 0.016 : handle === 'chunky' ? 0.027 : 0.021;
      const hd = cyl(hr * 0.92, hr, 0.2, hm);
      hd.position.y = 0.06;
      g.add(hd);
      for (const y of [-0.01, 0.025]) { const r = ring(hr + 0.001, 0.004, finishMat(color, finish)); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); }
      const btn = ball(0.007, finishMat(color, 'glossy'));
      btn.position.set(0, 0.1, hr * 0.95);
      const strap = ring(0.018, 0.0025, plain(darken(color, 0.25)));
      strap.position.set(0, -0.055, 0);
      const collar = cyl(0.03, hr + 0.004, 0.03, finishMat(color, finish));
      collar.position.y = 0.175;
      const rim = ring(0.03, 0.005, metal());
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.19;
      g.add(btn, strap, collar, rim);
      // the glowing head
      const head = new THREE.Group();
      head.position.y = 0.26;
      const gm = glow(color), trim = metal('#e9ecf2');
      if (style === 'orb') { head.add(ball(0.065, gm, 28)); const band = ring(0.066, 0.004, trim); band.rotation.x = Math.PI / 2; head.add(band); }
      if (style === 'heart') head.add(extrude(heartShape(0.07), 0.03, gm, 0.012));
      if (style === 'star') head.add(extrude(starShape(0.08, 0.036), 0.028, gm, 0.012));
      if (style === 'moon') { head.add(extrude(moonShape(0.07), 0.028, gm, 0.012)); const st = extrude(starShape(0.022, 0.01), 0.008, gm, 0.004); st.position.set(0.045, 0.04, 0); head.add(st); }
      if (style === 'note') for (const s of noteShape(0.085)) head.add(extrude(s, 0.024, gm, 0.008));
      if (style === 'cube') { const c = mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), gm); c.rotation.set(0.6, 0.6, 0); head.add(c); }
      if (style === 'gem') { const d = mesh(new THREE.OctahedronGeometry(0.075, 0), gm); d.scale.y = 1.3; head.add(d); }
      if (style === 'cloud') for (const [x, y, r] of [[0, 0.01, 0.045], [-0.045, -0.01, 0.035], [0.045, -0.01, 0.035], [-0.022, 0.035, 0.032], [0.025, 0.035, 0.03]]) { const b = ball(r, gm); b.position.set(x, y, 0); head.add(b); }
      if (style === 'bunny') {
        head.add(ball(0.058, gm, 28));
        for (const s of [-1, 1]) { const e = mesh(new THREE.CapsuleGeometry(0.016, 0.06, 6, 12), gm); e.position.set(s * 0.028, 0.085, 0); e.rotation.z = -s * 0.25; head.add(e); }
      }
      if (style === 'crown') {
        const base = cyl(0.06, 0.055, 0.04, gm, 28); base.position.y = -0.02; head.add(base);
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const sp = cyl(0, 0.018, 0.05, gm, 6); sp.position.set(Math.cos(a) * 0.05, 0.022, Math.sin(a) * 0.05); head.add(sp); const gem = ball(0.008, trim); gem.position.set(Math.cos(a) * 0.06, -0.02, Math.sin(a) * 0.06); head.add(gem); }
      }
      // a soft halo of light round the head
      const halo = mesh(new THREE.SphereGeometry(0.1, 20, 14), new THREE.MeshBasicMaterial({ color: C(color), transparent: true, opacity: 0.12, depthWrite: false }));
      halo.castShadow = false;
      head.add(halo);
      g.add(head);
      return g;
    },
  },
  mic: {
    label: 'Microphone', slot: 'hand', emoji: '🎤',
    styles: { stage: 'Stage mic', retro: 'Retro mic', wireless: 'Wireless' },
    build(style, color, finish) {
      const g = new THREE.Group();
      const body = finishMat(color, finish);
      const grille = new THREE.MeshStandardMaterial({ map: grilleTex(), metalness: 0.6, roughness: 0.35 });
      if (style === 'retro') {
        const cap = mesh(new THREE.CapsuleGeometry(0.035, 0.05, 8, 20), metal('#dfe3ea'));
        cap.position.y = 0.17;
        for (let i = 0; i < 5; i++) { const slot = mesh(new THREE.BoxGeometry(0.05, 0.003, 0.074), plain('#3a3d45')); slot.position.y = 0.15 + i * 0.011; g.add(slot); }
        const neck = cyl(0.012, 0.016, 0.08, body); neck.position.y = 0.09;
        const grip = cyl(0.018, 0.022, 0.12, body); grip.position.y = 0.0;
        g.add(cap, neck, grip);
        return g;
      }
      const head = ball(0.042, grille, 24); head.position.y = 0.19;
      const band = cyl(0.036, 0.034, 0.018, metal()); band.position.y = 0.16;
      const handle = cyl(0.03, 0.02, 0.2, body); handle.position.y = 0.05;
      const tip = cyl(0.02, 0.016, 0.02, metal()); tip.position.y = -0.055;
      g.add(head, band, handle, tip);
      if (style === 'wireless') {
        const led = ball(0.005, glow('#62ff9a')); led.position.set(0, 0.11, 0.027);
        const ant = cyl(0.006, 0.006, 0.035, plain('#2a2832')); ant.position.y = -0.08;
        const stripe = ring(0.026, 0.003, plain('#ffffff')); stripe.rotation.x = Math.PI / 2; stripe.position.y = 0.12;
        g.add(led, ant, stripe);
      }
      return g;
    },
  },
  photocard: {
    label: 'Photocard', slot: 'hand', emoji: '🃏',
    styles: { hearts: 'Hearts', stars: 'Stars', sparkle: 'Sparkle', polaroid: 'Polaroid' },
    build(style, color, finish) {
      const g = new THREE.Group();
      const card = mesh(new THREE.BoxGeometry(0.1, 0.15, 0.003), [plain('#ffffff'), plain('#ffffff'), plain('#ffffff'), plain('#ffffff'), new THREE.MeshStandardMaterial({ map: cardFace(style, color), roughness: 0.45 }), plain('#ffffff')]);
      card.position.y = 0.09;
      // a clear toploader with a couple of stickers on it, in the finish
      const loader = mesh(new THREE.BoxGeometry(0.112, 0.163, 0.008), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.05, clearcoat: 1, depthWrite: false }));
      loader.position.y = 0.09;
      for (const [x, y, k] of [[0.04, 0.155, 0.016], [-0.042, 0.03, 0.012]]) {
        const st = extrude(heartShape(k), 0.003, finishMat(lighten(color, 0.2), finish === 'matte' ? 'glossy' : finish), 0.0015);
        st.position.set(x, y, 0.006);
        g.add(st);
      }
      g.add(card, loader);
      return g;
    },
  },
  album: {
    label: 'Album', slot: 'hand', emoji: '💿',
    styles: { square: 'Square album', photobook: 'Photobook', mini: 'Mini album', vinyl: 'Vinyl' },
    build(style, color, finish) {
      const g = new THREE.Group();
      const [w, h, d] = { square: [0.16, 0.16, 0.028], photobook: [0.13, 0.18, 0.034], mini: [0.09, 0.09, 0.014], vinyl: [0.18, 0.18, 0.008] }[style];
      const face = new THREE.MeshStandardMaterial({ map: cardFace(style === 'vinyl' ? 'stars' : style === 'mini' ? 'hearts' : 'sparkle', color), roughness: 0.4 });
      const side = finishMat(color, finish);
      const cover = mesh(new THREE.BoxGeometry(w, h, d), [side, side, side, side, face, side]);
      cover.position.y = h / 2 - 0.02;
      g.add(cover);
      if (style === 'vinyl') {
        const disc = cyl(0.082, 0.082, 0.004, plain('#151418', { roughness: 0.25 }), 40);
        disc.rotation.x = Math.PI / 2; disc.position.set(0.04, h / 2 - 0.02, -0.007);
        const label = cyl(0.026, 0.026, 0.005, finishMat(color, finish), 24);
        label.rotation.x = Math.PI / 2; label.position.set(0.04, h / 2 - 0.02, -0.007);
        g.add(disc, label);
      } else {
        // the spine and a shiny sticker in the corner
        const spine = mesh(new THREE.BoxGeometry(0.006, h, d + 0.002), finishMat(darken(color, 0.25), finish));
        spine.position.set(-w / 2, h / 2 - 0.02, 0);
        const st = extrude(starShape(0.016, 0.007), 0.003, finishMat('#ffd84a', 'holo'), 0.0015);
        st.position.set(w / 2 - 0.022, h - 0.042, d / 2 + 0.002);
        g.add(spine, st);
      }
      return g;
    },
  },
  towel: {
    label: 'Slogan towel', slot: 'hand', emoji: '🏳️',
    styles: { love: '♡ LOVE ♡', best: 'BEST ★ STAN', fighting: 'FIGHTING!' },
    build(style, color, finish) {
      const g = new THREE.Group();
      const face = new THREE.MeshStandardMaterial({ map: towelFace(style, color), roughness: 0.9 });
      // a slogan flag on a stick, flying out to the side (away from his body, so it never crosses his face)
      const towel = mesh(new THREE.BoxGeometry(0.3, 0.08, 0.006), [plain(color), plain(color), plain(color), plain(color), face, face]);
      towel.position.set(-0.155, 0.22, 0);
      const stick = cyl(0.007, 0.008, 0.3, finishMat(color === 'white' ? 'silver' : 'white', finish)); stick.position.y = 0.13;
      const top = ball(0.014, finishMat(color, finish)); top.position.y = 0.285;
      g.add(towel, stick, top);
      return g;
    },
  },
  fan: {
    label: 'Glow fan', slot: 'hand', emoji: '💗',
    styles: { round: 'Round', heart: 'Heart', star: 'Star' },
    build(style, color, finish) {
      const g = new THREE.Group();
      const shape = style === 'heart' ? heartShape(0.075) : style === 'star' ? starShape(0.09, 0.05) : (() => { const s = new THREE.Shape(); s.absarc(0, 0, 0.075, 0, Math.PI * 2); return s; })();
      const paddle = extrude(shape, 0.006, finishMat(color, finish), 0.004);
      paddle.position.y = 0.2;
      // a white border (a slightly bigger paddle behind) and stickers on the front
      const border = extrude(shape, 0.004, plain('#ffffff'), 0.008);
      border.position.set(0, 0.2, -0.004);
      border.scale.setScalar(1.1);
      const big = extrude(heartShape(0.03), 0.004, finishMat('#ffffff', 'glossy'), 0.002);
      big.position.set(0, 0.2, 0.008);
      for (const [x, y] of [[-0.035, 0.235], [0.04, 0.17]]) { const s2 = extrude(starShape(0.012, 0.005), 0.003, finishMat('#ffd84a', 'holo'), 0.0015); s2.position.set(x, y, 0.008); g.add(s2); }
      const handle = cyl(0.009, 0.011, 0.15, plain('#f6f5fa', { roughness: 0.4 })); handle.position.y = 0.06;
      g.add(border, paddle, big, handle);
      return g;
    },
  },
  // ---------- head items (head-bone units, Bbokari's head: top ≈ 0.645, radius ≈ 0.33) ----------
  headwear: {
    label: 'Headwear', slot: 'head', emoji: '🎧',
    styles: { headset: 'Stage headset', bucket: 'Bucket hat', beret: 'Beret', cap: 'Backwards cap', catears: 'Cat-ear headband', bunnyears: 'Bunny-ear headband', bigbow: 'Big bow', tiara: 'Tiara', starclips: 'Star clips', hearthair: 'Heart hairband' },
    build(style, color, finish) {
      const g = new THREE.Group();
      const m = finishMat(color, finish);
      const band = () => { const b = ring(0.338, 0.012, m, Math.PI); b.position.y = 0.33; return b; };
      if (style === 'headset') {
        const b = ring(0.345, 0.009, plain('#2a2832', { roughness: 0.4 }), Math.PI); b.position.y = 0.32; g.add(b);
        for (const s of [-1, 1]) { const pad = cyl(0.05, 0.05, 0.04, m); pad.rotation.z = Math.PI / 2; pad.position.set(s * 0.345, 0.3, 0); g.add(pad); }
        const boom = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.35, 0.28, 0.02), new THREE.Vector3(-0.32, 0.18, 0.18), new THREE.Vector3(-0.2, 0.12, 0.3), new THREE.Vector3(-0.09, 0.12, 0.34)]), 24, 0.006, 8), plain('#2a2832'));
        const tip = ball(0.016, m); tip.position.set(-0.085, 0.12, 0.345);
        g.add(boom, tip);
      }
      if (style === 'bucket') {
        // (sits down on the head: the crown wraps the top of the head, the brim rests just above the eyes)
        // (the brim sits high enough to clear every pet's eyes: some have them high on the head)
        const crown = cyl(0.3, 0.35, 0.17, m, 40); crown.position.y = 0.6;
        const top = cyl(0.3, 0.3, 0.01, m, 40); top.position.y = 0.685;
        const brim = cyl(0.35, 0.47, 0.05, m, 40); brim.position.y = 0.51; brim.material.side = THREE.DoubleSide;
        const stripe = cyl(0.352, 0.352, 0.03, finishMat(darken(color, 0.25), finish), 40); stripe.position.y = 0.545;
        g.add(crown, top, brim, stripe);
      }
      if (style === 'beret') {
        const b = ball(0.34, m, 32); b.scale.set(1.08, 0.34, 1.08); b.position.set(0.05, 0.575, 0); b.rotation.z = -0.25;
        const stem = cyl(0.008, 0.012, 0.04, m); stem.position.set(0.0, 0.69, 0);
        g.add(b, stem);
      }
      if (style === 'cap') {
        // (sits above the eyes: the dome covers only the top of the head; the brim sticks out at the back)
        const dome = mesh(new THREE.SphereGeometry(0.345, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), m); dome.scale.y = 0.62; dome.position.y = 0.47;
        const brim = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.016, 32, 1, false, Math.PI * 0.5, Math.PI), m); brim.scale.set(1, 1, 0.9); brim.position.set(0, 0.48, -0.31); brim.rotation.x = 0.15;
        const btn = ball(0.02, finishMat(darken(color, 0.3), finish)); btn.position.y = 0.685;
        g.add(dome, brim, btn);
      }
      if (style === 'catears' || style === 'bunnyears') {
        g.add(band());
        for (const s of [-1, 1]) {
          if (style === 'catears') {
            const e = cyl(0, 0.08, 0.14, m, 3); e.position.set(s * 0.2, 0.71, 0); e.rotation.set(0, Math.PI / 6, -s * 0.35); e.scale.z = 0.45;
            const inner = cyl(0, 0.045, 0.08, plain('#ffc2d4'), 3); inner.position.set(s * 0.198, 0.70, 0.024); inner.rotation.set(0, Math.PI / 6, -s * 0.35); inner.scale.z = 0.3;
            g.add(e, inner);
          } else {
            const e = mesh(new THREE.CapsuleGeometry(0.045, 0.2, 8, 16), m); e.scale.z = 0.5; e.position.set(s * 0.12, 0.79, 0); e.rotation.z = -s * 0.2;
            const inner = mesh(new THREE.CapsuleGeometry(0.026, 0.16, 8, 16), plain('#ffc2d4')); inner.scale.z = 0.3; inner.position.set(s * 0.12, 0.79, 0.018); inner.rotation.z = -s * 0.2;
            g.add(e, inner);
          }
        }
      }
      if (style === 'bigbow') {
        for (const s of [-1, 1]) { const loop = ball(0.1, m); loop.scale.set(1.15, 0.75, 0.4); loop.position.set(s * 0.1, 0.0, 0); loop.rotation.z = s * 0.25; g.add(loop); }
        const knot = ball(0.045, finishMat(darken(color, 0.2), finish)); g.add(knot);
        for (const s of [-1, 1]) { const tail = cyl(0.02, 0.035, 0.12, m, 4); tail.position.set(s * 0.04, -0.08, 0); tail.rotation.z = s * 0.35; tail.scale.z = 0.4; g.add(tail); }
        g.position.set(0.17, 0.6, 0.06); g.rotation.set(0.2, 0.25, -0.45);
      }
      if (style === 'tiara') {
        const silver = metal('#e7eaf0');
        const b = ring(0.3, 0.01, silver, Math.PI); b.rotation.x = -Math.PI / 2 + 0.25; b.rotation.z = 0; b.position.set(0, 0.53, 0.0);
        g.add(b);
        for (let i = 0; i < 5; i++) {
          const a = Math.PI * (0.15 + 0.7 * (i / 4)), r = 0.3;
          const sp = extrude(starShape(i === 2 ? 0.05 : 0.032, i === 2 ? 0.022 : 0.014, 4), 0.008, silver, 0.004);
          sp.position.set(Math.cos(a) * r, 0.56 + (i === 2 ? 0.04 : 0.02), Math.sin(a) * r);
          sp.lookAt(0, sp.position.y, 0); sp.rotateY(Math.PI);
          const gem = ball(i === 2 ? 0.018 : 0.012, finishMat(color, finish === 'matte' ? 'glossy' : finish)); gem.position.copy(sp.position).multiplyScalar(1.02);
          g.add(sp, gem);
        }
      }
      if (style === 'starclips') {
        for (const [x, y, z, k] of [[-0.25, 0.53, 0.17, 0.07], [-0.3, 0.42, 0.13, 0.05], [-0.18, 0.62, 0.15, 0.045]]) {
          const st = extrude(starShape(k, k * 0.45), 0.012, m, 0.006); st.position.set(x, y, z); st.rotation.y = -0.7; g.add(st);
        }
      }
      if (style === 'hearthair') {
        g.add(band());
        const h = extrude(heartShape(0.06), 0.02, m, 0.008); h.position.set(0.2, 0.6, 0.12); h.rotation.set(0, 0.5, -0.4); g.add(h);
      }
      return g;
    },
  },
};

/** Every combination counts: design × style × (handle, for lightsticks) × colour × finish. */
export function catalogSize() {
  const nc = Object.keys(COLORS).length, nf = Object.keys(FINISHES).length;
  return Object.values(DESIGNS).reduce((s, d) => s + Object.keys(d.styles).length * (d.handles ? Object.keys(d.handles).length : 1) * nc * nf, 0);
}
/** Parses "design.style.colour.finish[.handle]". */
export function parseItem(id) {
  const [design, style, color, finish, handle] = String(id || '').split('.');
  if (!DESIGNS[design]?.styles[style]) return null;
  return { design, style, color: COLORS[color] ? color : 'pink', finish: FINISHES[finish] ? finish : 'glossy', handle };
}
export function buildItem(id) {
  const it = parseItem(id);
  return it ? DESIGNS[it.design].build(it.style, it.color, it.finish, it.handle) : null;
}
export function randomItem(slot) {
  const pick = (o) => { const k = Object.keys(o); return k[Math.floor(Math.random() * k.length)]; };
  const designs = Object.entries(DESIGNS).filter(([, d]) => d.slot === slot).map(([k]) => k);
  const design = designs[Math.floor(Math.random() * designs.length)];
  const d = DESIGNS[design];
  return [design, pick(d.styles), pick(COLORS), pick(FINISHES), ...(d.handles ? [pick(d.handles)] : [])].join('.');
}

/** Puts the chosen K-pop items on the pet: one held in its left hand, one on its head. */
export class KpopCloset {
  constructor() {
    this.worn = { hand: null, head: null };
    this.ids = { hand: '', head: '' };
    this.mob = null;
  }

  wear(mob, hand = '', head = '') {
    if (!mob) return;
    if (mob !== this.mob) { this.#drop('hand'); this.#drop('head'); this.mob = mob; }
    for (const [slot, id] of [['hand', hand], ['head', head]]) {
      if (id === this.ids[slot] && (this.worn[slot] || !id)) continue;
      this.#drop(slot);
      this.ids[slot] = id;
      if (!id) continue;
      const a = mob.anchor?.(slot === 'hand' ? 'handL' : 'head');
      if (!a) { this.ids[slot] = ''; continue; } // the model is still loading: try again next frame
      const item = buildItem(id);
      if (!item) continue;
      const holder = new THREE.Group();
      if (slot === 'hand') {
        // held upright in the hand (model units), a little out to the side and forward, tilted out, and big enough
        // to read at pet size
        // (tilted well out, away from the big heads these pets have: a lightstick head at cheek height went into it)
        holder.position.set(a.at[0] * 1.35, a.at[1] - 0.04, a.at[2] + 0.07);
        holder.rotation.set(0.2, 0, 0.62);
        holder.scale.setScalar((mob.propScale ?? 1) * 1.45);
        holder.add(item);
        a.parent.add(holder);
      } else {
        // fitted to this pet's head: kpopFit = [x, y, z, scale] worked out from its head top, size and eye height (the
        // wardrobe's offsets suit beanies that pull down over the head, and put brims over some pets' eyes)
        const fit = mob.kpopFit ?? [...(mob.outfitOffset ?? [0, 0, 0]), mob.outfitScale ?? 1];
        holder.position.set(fit[0], fit[1], fit[2]);
        holder.scale.setScalar(fit[3]);
        holder.add(item);
        a.parent.add(holder);
      }
      this.worn[slot] = holder;
    }
  }

  #drop(slot) {
    this.worn[slot]?.removeFromParent();
    this.worn[slot] = null;
    this.ids[slot] = '';
  }
}
