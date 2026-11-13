import * as THREE from 'three';
import { FaceDisplay } from '../bee/face/FaceDisplay.js';
import { furry } from './fur.js';

/**
 * The CORTIS plushies: long-haired fuzzy balls with pom-pom bumps and a party hat, hatching out of a soft egg.
 * Face (the same on every colour, traced from the official plush photos): one big embroidered eye, a white patch of
 * an uneven rounded shape with a brown pupil; one tiny brown eye, half hidden in the fur; and an open mouth, an uneven
 * pink shape. No nose. The face is embroidered into the fur, so the fur around it overlaps its edges.
 */
export const CORTIS_COLORS = {
  yellow: { fur: '#f2df3a', bobble: '#f0a03e', mouth: '#f39a2e', rim: '#d97c1c', sclera: '#fbf8ef', pupil: '#2a201c', tiny: '#2a201c', hat: '#f0a24a' },
  white: { fur: '#e4e4e8', bobble: '#c2c3c9', mouth: '#a3a4ac', rim: '#86878f', sclera: '#efe7d8', pupil: '#2a201c', tiny: '#2a201c', hat: '#5cbd78' },
  blue: { fur: '#86ade9', bobble: '#4a7fdf', mouth: '#3b6ed6', rim: '#2c58b4', sclera: '#fbf8ef', pupil: '#5a3422', tiny: '#5a3422', hat: '#5a72cb' },
  pink: { fur: '#f2b5c2', bobble: '#d9758b', mouth: '#f597b0', rim: '#e0718f', sclera: '#fdfaf3', pupil: '#6a3a22', tiny: '#6a3a22', hat: '#cf3f63' },
  green: { fur: '#9fd78f', bobble: '#4fb05c', mouth: '#46a656', rim: '#2f8a40', sclera: '#fbf8ef', pupil: '#2a201c', tiny: '#2a201c', hat: '#f2c94c' },
};

const R = 0.4;
const FUR = 0.075;
const HOVER = 0.03;
export const CORTIS_HEIGHT = HOVER + 2 * (R + FUR) + 0.12;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const popIn = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2);

// ---------- The face, drawn into the fur's colour map ----------
// Laid out by direction: the front of the ball is the middle of the canvas, 1 unit = 1 radian of arc on the ball
// (x right, y up). Traced from the full-size photo of the pink one (measured in pixels, turned into angles on the
// ball and re-centred, because the photo's plush is turned to one side).
// The photo's plush leans about 30° to one side, so the traced face is turned back level (the tiny eye sits a hair
// lower than the big one, as on the front-facing plushies) and centred, so it looks straight at you.
const BIG_AT = [0.192, 0.144];
const BIG_EYE = [[-0.14, 0.164], [-0.018, 0.224], [0.1, 0.19], [0.19, 0.103], [0.214, -0.045], [0.135, -0.173], [0.018, -0.224], [-0.118, -0.181], [-0.212, -0.081], [-0.214, 0.056]];
const PUPIL = { x: -0.044, y: 0.023, r: 0.088 };
const TINY = { x: -0.301, y: 0.11, rx: 0.105, ry: 0.09 };
const MOUTH = [[-0.266, -0.168], [-0.022, -0.176], [0.146, -0.287], [0.235, -0.368], [0.188, -0.443], [-0.02, -0.489], [-0.316, -0.472], [-0.381, -0.401], [-0.338, -0.282]];
const MOUTH_TOP = -0.168;
/** Arc units → canvas units (a degree of longitude is shorter away from the middle, so widen to keep shapes true). */
const P = ([x, y]) => [x / Math.cos(y), y];

/** A rounded closed curve through the points (Catmull-Rom as Bézier pieces). */
function smoothPath(ctx, pts) {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  ctx.closePath();
}

class FaceCanvas {
  constructor(C) {
    this.C = C;
    this.W = 1024;
    this.H = 512;
    const mk = () => { const c = document.createElement('canvas'); c.width = this.W; c.height = this.H; return c; };
    this.color = mk();
    this.mask = mk();
    const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.wrapS = THREE.RepeatWrapping; return t; };
    this.colorTex = tex(this.color);
    this.maskTex = tex(this.mask);
    this.key = '';
  }
  frame(ctx) {
    const k = this.H / Math.PI;
    ctx.setTransform(k, 0, 0, -k, this.W / 2, this.H / 2);
  }
  draw(s) {
    const key = JSON.stringify(s);
    if (key === this.key) return;
    this.key = key;
    const { C } = this;
    const ctx = this.color.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.fur;
    ctx.fillRect(0, 0, this.W, this.H);
    const m = this.mask.getContext('2d');
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.filter = 'none';
    m.fillStyle = '#fff';
    m.fillRect(0, 0, this.W, this.H);
    this.frame(ctx);
    this.frame(m);
    m.filter = 'blur(1.5px)';
    m.fillStyle = '#000';

    // Blush, in the fur (so it stays fuzzy).
    if (s.blush > 0.05) {
      for (const [x, y] of [[-0.5, -0.12], [0.46, -0.12]]) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, 0.13);
        g.addColorStop(0, `rgba(255,120,150,${0.5 * s.blush})`);
        g.addColorStop(1, 'rgba(255,120,150,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 0.14, y - 0.14, 0.28, 0.28);
      }
    }

    // The big eye: an embroidered white patch with a stitched edge, and the pupil.
    const eye = BIG_EYE.map(([x, y]) => P([BIG_AT[0] + x, BIG_AT[1] + y]));
    smoothPath(ctx, eye);
    ctx.fillStyle = C.sclera;
    ctx.fill();
    ctx.lineWidth = 0.012;
    ctx.strokeStyle = 'rgba(120,110,100,0.35)';
    ctx.stroke();
    smoothPath(m, eye);
    m.fill();
    const py = BIG_AT[1] + PUPIL.y + s.lookY * 0.035, px = (BIG_AT[0] + PUPIL.x + s.lookX * 0.04) / Math.cos(py), wide = 1 / Math.cos(py);
    ctx.fillStyle = C.pupil;
    ctx.strokeStyle = C.pupil;
    ctx.lineCap = 'round';
    if (s.happy) {
      ctx.lineWidth = 0.026;
      ctx.beginPath();
      ctx.arc(px, py - 0.035, 0.08, 0.25, Math.PI - 0.25);
      ctx.stroke();
    } else if (s.big < 0.25) {
      ctx.lineWidth = 0.022;
      ctx.beginPath();
      ctx.moveTo(px - 0.085, py);
      ctx.lineTo(px + 0.085, py);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(px, py, PUPIL.r * s.size * wide, PUPIL.r * s.size * s.big, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // The tiny eye.
    ctx.fillStyle = C.tiny;
    ctx.strokeStyle = C.tiny;
    if (s.happy) {
      ctx.lineWidth = 0.022;
      ctx.beginPath();
      ctx.arc(TINY.x / Math.cos(TINY.y), TINY.y - 0.03, 0.07, 0.3, Math.PI - 0.3);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(TINY.x / Math.cos(TINY.y), TINY.y, TINY.rx / Math.cos(TINY.y), Math.max(0.01, TINY.ry * s.small), 0, 0, Math.PI * 2);
      ctx.fill();
      m.beginPath();
      m.ellipse(TINY.x / Math.cos(TINY.y), TINY.y, (TINY.rx * 0.85) / Math.cos(TINY.y), Math.max(0.008, TINY.ry * s.small * 0.85), 0, 0, Math.PI * 2);
      m.fill();
    }

    // The mouth grows from its top edge as it opens (and shrinks when it's sad).
    const k = s.mouth;
    const mouth = MOUTH.map(([x, y]) => P([x, MOUTH_TOP - (MOUTH_TOP - y) * k]));
    smoothPath(ctx, mouth);
    ctx.fillStyle = C.mouth;
    ctx.fill();
    ctx.lineWidth = 0.014;
    ctx.strokeStyle = C.rim;
    ctx.stroke();
    // A softer, lighter tongue inside.
    ctx.save();
    smoothPath(ctx, mouth);
    ctx.clip();
    const ty = MOUTH_TOP - 0.24 * k;
    const tg = ctx.createRadialGradient(-0.1, ty, 0, -0.1, ty, 0.17);
    tg.addColorStop(0, 'rgba(255,255,255,0.28)');
    tg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = tg;
    ctx.fillRect(-0.5, -0.7, 0.9, 0.7);
    ctx.restore();
    smoothPath(m, mouth);
    m.fill();

    this.colorTex.needsUpdate = true;
    this.maskTex.needsUpdate = true;
  }
}

// ---------- Shapes ----------
/** A slightly squashed, lumpy ball, like a stuffed plush. */
function plushBall() {
  const g = new THREE.SphereGeometry(R, 96, 72);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    v.multiplyScalar(1 + 0.025 * Math.sin(n.x * 5 + n.y * 3) * Math.sin(n.z * 4 - n.y * 2) + 0.015 * Math.sin(n.y * 9 + n.x * 7));
    v.y *= 0.96;
    v.x *= 1.03;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function sprinkles(base) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,255,255,0.95)';
  x.lineWidth = 5;
  x.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const px = Math.random() * 256, py = Math.random() * 256, a = Math.random() * Math.PI;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * 11, py + Math.sin(a) * 11);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The party hat: a soft velvety cone with sprinkles and a fuzzy pom-pom. */
function partyHat(color) {
  const g = new THREE.Group();
  const cone = furry(new THREE.ConeGeometry(0.085, 0.2, 40, 6, false), { map: sprinkles(color), length: 0.007, shells: 7, density: 260, bend: 0.2, swirl: 0.3, seed: 5 });
  cone.position.y = 0.1;
  const pom = furry(new THREE.SphereGeometry(0.028, 20, 14), { color: 0xc8c8ce, tip: 0xf2f2f5, length: 0.018, shells: 10, density: 70, seed: 3, bend: 0.3 });
  pom.position.y = 0.21;
  g.add(cone, pom);
  return g;
}

/** One half of the egg: a thick, soft terry-cloth shell with a zigzag crack. */
function eggHalf(top) {
  const U = 90, V = 20, H = 1.12, W = 0.58, T = 0.05;
  const crack = (u) => 0.425 + 0.15 * (1 - Math.abs(((u * 8) % 1) * 2 - 1));
  const radius = (v) => { const m = 0.42, d = (v - m) / (v < m ? m : 1 - m); return W * Math.sqrt(Math.max(0, 1 - d * d)) ** 0.9; };
  const pos = [], index = [];
  const grid = (inset, flip) => {
    const start = pos.length / 3;
    for (let i = 0; i <= U; i++) {
      const u = i / U, c = crack(u), a = u * Math.PI * 2;
      for (let j = 0; j <= V; j++) {
        const v = top ? c + (1 - c) * (j / V) : c * (j / V);
        const r = Math.max(0, radius(v) - inset);
        pos.push(Math.cos(a) * r, v * H + (inset && !top && j === 0 ? inset : 0), Math.sin(a) * r);
      }
    }
    for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
      const a = start + i * (V + 1) + j, b = start + (i + 1) * (V + 1) + j;
      if (flip) index.push(a, b, a + 1, b, b + 1, a + 1);
      else index.push(a, a + 1, b, b, a + 1, b + 1);
    }
    return start;
  };
  const outer = grid(0, false);
  const inner = grid(T, true);
  // The rim along the crack joins the outside to the inside, so the shell has a thickness.
  const edge = top ? 0 : V;
  for (let i = 0; i < U; i++) {
    const a = outer + i * (V + 1) + edge, b = outer + (i + 1) * (V + 1) + edge;
    const c = inner + i * (V + 1) + edge, d = inner + (i + 1) * (V + 1) + edge;
    if (top) index.push(a, b, c, b, d, c);
    else index.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  geo.translate(0, -0.42 * H, 0); // centred, so the terry fur grows outwards evenly
  const g = new THREE.Group();
  const fur = furry(geo, { color: 0xf3f2ee, tip: 0xffffff, length: 0.012, shells: 7, density: 150, bend: 0.15, swirl: 0.5, seed: 9 });
  fur.position.y = 0.42 * H;
  g.add(fur);
  return g;
}

export class Cortis {
  constructor(color = 'yellow') {
    const C = CORTIS_COLORS[color] ?? CORTIS_COLORS.yellow;
    this.root = new THREE.Group();
    this.root.name = `cortis_${color}`;
    const hips = new THREE.Group();
    const torso = new THREE.Group();
    this.root.add(hips);
    hips.add(torso);
    const body = new THREE.Group();
    body.position.y = R + FUR * 0.6;
    torso.add(body);
    this.body = body;

    // The ball, with the face drawn into its fur.
    this.faceCanvas = new FaceCanvas(C);
    this.faceCanvas.draw({ big: 1, small: 1, size: 1, happy: false, mouth: 1.0, blush: 0, lookX: 0, lookY: 0 });
    body.add(furry(plushBall(), { length: FUR, shells: 30, density: 85, seed: 1, bend: 0.6, swirl: 0.7, colorMap: this.faceCanvas.colorTex, maskMap: this.faceCanvas.maskTex }));

    // Pom-pom bumps, sunk a little into the fur.
    const bobbleGeo = new THREE.SphereGeometry(0.06, 28, 20);
    for (const [x, y, z, s] of [[-0.62, 0.62, 0.22, 1], [-0.3, 0.9, 0.12, 0.95], [0.25, 0.9, 0.06, 1], [0.62, 0.64, 0.1, 1.05], [0.88, 0.28, 0.06, 0.95], [0.93, -0.1, 0.05, 0.9], [-0.88, 0.3, 0.12, 0.9], [0.0, 0.7, -0.6, 0.9], [-0.55, 0.5, -0.55, 0.85], [0.55, 0.45, -0.6, 0.85]]) {
      const b = furry(bobbleGeo, { color: C.bobble, length: 0.028, shells: 14, density: 46, seed: 2 + x, bend: 0.35 });
      b.position.copy(new THREE.Vector3(x, y, z).normalize().multiplyScalar(R + FUR * 0.25));
      b.scale.setScalar(s);
      body.add(b);
    }

    // Party hat, tilted on top (it steps aside for outfits and headphones).
    this.hat = partyHat(C.hat);
    this.hat.position.copy(new THREE.Vector3(-0.2, 0.95, 0.12).normalize().multiplyScalar(R + FUR * 0.35));
    this.hat.rotation.set(0.12, 0, 0.3);
    body.add(this.hat);

    // Outfits and headphones are made for Bbokari's head; this holder scales and places them onto the ball.
    const s = (R + FUR * 0.6) / 0.324;
    this.headHolder = new THREE.Group();
    this.headHolder.scale.setScalar(s);
    this.headHolder.position.y = -0.28 * s;
    body.add(this.headHolder);
    this.outfitOffset = [0, 0.04, 0];
    this.headFit = { side: 0.34, cupY: 0.3, cupZ: -0.01, top: 0.6, bandZ: -0.13, square: 0.75, mouth: [0.05, 0.26, 0.33] };

    this.joints = { hips, torso, head: body };
    this.parts = { loaded: true };
    this.face = new FaceDisplay();
    this.height = CORTIS_HEIGHT;
    this.halfWidth = R + FUR + 0.04;
    this.emoteLift = 0.95;
    this.stateAliases = { wave: 'happy' }; // no arms to wave: it bounces instead
    this.walkAmount = 0;
    this.walkPhase = 0;
    this.lean = 0;
    this.climb = 0;
    this.grounded = 1;
    this.time = Math.random() * 10;
    this.roll = 0;
    this.speed = 0;

    // The egg it hatches from.
    this.egg = new THREE.Group();
    this.eggBottom = eggHalf(false);
    this.eggTop = eggHalf(true);
    this.egg.add(this.eggBottom, this.eggTop);
    hips.add(this.egg);
    this.hatchT = 0;
    this.hatched = false;
    body.visible = false;
  }

  anchor(slot) {
    return slot === 'head' ? { parent: this.headHolder, at: null } : null;
  }

  applyPose(p, breath = 0) {
    const j = this.joints;
    // It rolls instead of walking, so only a tiny bounce.
    const hop = Math.abs(Math.sin(this.walkPhase * 2)) * 0.015 * this.walkAmount;
    j.hips.position.y = HOVER + p.bodyY + hop - p.crouch * 0.4;
    const squash = 1 - p.crouch * 1.2;
    j.torso.scale.set(1 / Math.sqrt(squash) + breath * 0.006, squash + breath * 0.01, 1 / Math.sqrt(squash));
    // Always face you: undo the turn the other pets make towards where they walk (a ball just rolls there).
    j.torso.rotation.set(p.torsoPitch * 0.6 + p.headPitch * 0.5, p.torsoYaw + p.headYaw * 0.5 - this.root.rotation.y, p.torsoRoll + p.headRoll * 0.6);
  }

  animate(dt) {
    this.time += dt;
    if (!this.hatched) this.#hatch(dt);
    const c = this.face.current;
    const blink = this.face.blinkFactor;
    // Redraw the embroidered face only when it visibly changes (quantised, so it isn't every frame).
    const q = (x, n) => Math.round(x * n) / n;
    const sad = (c.mouthCurve ?? 0) < -0.3;
    this.faceCanvas.draw({
      big: q(clamp(c.eyeOpen[1] * blink, 0, 1), 6),
      small: q(clamp(c.eyeOpen[0] * blink, 0, 1), 6),
      size: q(Math.min(c.eyeScale[1] ?? 1, 1.12), 10),
      happy: Math.max(c.happy ?? 0, c.squeeze ?? 0, c.cat ?? 0) > 0.5,
      mouth: q(sad ? 0.5 : clamp(1 + (c.mouthOpen ?? 0) * 0.25, 0.7, 1.2), 10),
      blush: q(clamp(c.blush ?? 0, 0, 1), 5),
      lookX: q(this.face.look.x, 4),
      lookY: q(this.face.look.y, 4),
    });
    this.hat.visible = this.headHolder.children.length === 0;
    // Rolling: it turns over as it moves (distance ÷ radius), and when it stops it rolls on to land face-up again.
    const v = this.speed ?? 0;
    if (Math.abs(v) > 0.05) this.roll -= (v * dt) / (R + FUR);
    else {
      const home = Math.round(this.roll / (Math.PI * 2)) * Math.PI * 2;
      const step = clamp((home - this.roll) * 4 * dt, -4 * dt, 4 * dt);
      this.roll += step;
    }
    this.body.rotation.z = this.roll + Math.sin(this.time * 1.7) * 0.02;
  }

  /** Wobble, wobble, crack! The top flies off and it pops out; then the shell shrinks away. */
  #hatch(dt) {
    const t = (this.hatchT += dt);
    const egg = this.egg;
    egg.scale.setScalar(popIn(t / 0.4));
    egg.rotation.z = t > 0.4 && t < 1.75 ? Math.sin(t * 20) * 0.12 * ease((t - 0.4) / 1.2) : 0;
    egg.position.y = t > 0.9 && t < 1.75 ? Math.abs(Math.sin(t * 10)) * 0.03 : 0;
    if (t > 1.75) {
      const k = t - 1.75;
      this.eggTop.position.set(-k * 0.5, k * 1.6 - k * k * 2.2, 0);
      this.eggTop.rotation.z = k * 2.4;
      this.eggTop.scale.setScalar(Math.max(0.001, 1 - ease(k / 0.7)));
      this.body.visible = true;
      const g = popIn((t - 1.8) / 0.5);
      this.body.scale.setScalar(Math.max(0.001, 0.35 + 0.65 * g));
      this.body.position.y = R + FUR * 0.6 - (1 - g) * 0.2;
    }
    if (t > 2.7) this.eggBottom.scale.setScalar(Math.max(0.001, 1 - ease((t - 2.7) / 0.6)));
    if (t > 3.35) {
      this.egg.removeFromParent();
      this.body.scale.setScalar(1);
      this.body.position.y = R + FUR * 0.6;
      this.hatched = true;
    }
  }
}
