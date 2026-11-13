import * as THREE from 'three';
import { FaceDisplay } from '../bee/face/FaceDisplay.js';
import { furry } from './fur.js';

/**
 * The CORTIS plushies: fuzzy little balls with pom-pom bumps, one big embroidered eye and one small dot eye, a tiny
 * nose, an open mouth and a party hat. They start in an egg that wobbles, cracks open, and out they pop.
 * Colours come from the official plush photos (yellow, white, blue, pink); green was asked for on top.
 */
export const CORTIS_COLORS = {
  yellow: { fur: 0xf3e23c, tip: 0xfbee70, bobble: 0xf2a443, bobbleTip: 0xf8bd68, mouth: 0xf59a2c, sclera: 0xfbf7ee, pupil: 0x1d1a1a, hat: 0xf0a24a },
  white: { fur: 0xe6e6ea, tip: 0xf7f7f9, bobble: 0xc4c5cb, bobbleTip: 0xd8d9de, mouth: 0x9fa0a8, sclera: 0xeee6d8, pupil: 0x1d1a1a, hat: 0x5fbf7c },
  blue: { fur: 0x86aeea, tip: 0xa9c6f3, bobble: 0x4a80e0, bobbleTip: 0x6d9aea, mouth: 0x3c6fd8, sclera: 0xfbf7ee, pupil: 0x4a2c1c, hat: 0x5b74cc },
  pink: { fur: 0xf0b1bf, tip: 0xf8cdd6, bobble: 0xe07890, bobbleTip: 0xeb97a9, mouth: 0xf59ab2, sclera: 0xfbf7ee, pupil: 0x4a2c1c, hat: 0xd8466a },
  green: { fur: 0x9fd88e, tip: 0xc0e8b0, bobble: 0x52b45e, bobbleTip: 0x74c77c, mouth: 0x3f9e4e, sclera: 0xfbf7ee, pupil: 0x1d1a1a, hat: 0xf2c94c },
};

const R = 0.4; // the ball
const FUR = 0.065; // how long its fur is
const SKIN = R + FUR + 0.004; // where the embroidered face sits (on top of the fur)
const HOVER = 0.04;
export const CORTIS_HEIGHT = HOVER + 2 * (R + FUR) + 0.12;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const popIn = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2);

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });

/** A flat shape (in a plane facing +z) wrapped onto the ball's surface at the spot `at` = [x, y] on the front. */
function onBall(geometry, [x, y], lift = 0) {
  const dir = new THREE.Vector3(x, y, Math.sqrt(Math.max(0.05, 1 - x * x - y * y))).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const upT = new THREE.Vector3().crossVectors(dir, right).normalize();
  const pos = geometry.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.copy(dir).multiplyScalar(SKIN).addScaledVector(right, pos.getX(i)).addScaledVector(upT, pos.getY(i));
    p.setLength(SKIN + lift + pos.getZ(i));
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** The tangent frame at a front spot, for small parts that move (the pupil, the closed-eye lines). */
function frameAt([x, y], lift = 0) {
  const dir = new THREE.Vector3(x, y, Math.sqrt(Math.max(0.05, 1 - x * x - y * y))).normalize();
  const g = new THREE.Group();
  g.position.copy(dir).multiplyScalar(SKIN + lift);
  g.lookAt(dir.clone().multiplyScalar(10));
  return g;
}

function sprinkleTexture(base) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = `#${new THREE.Color(base).getHexString()}`;
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(255,255,255,0.9)';
  x.lineWidth = 3;
  x.lineCap = 'round';
  for (let i = 0; i < 40; i++) {
    const px = Math.random() * 128, py = Math.random() * 128, a = Math.random() * Math.PI;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * 6, py + Math.sin(a) * 6);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function partyHat(color) {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.2, 24, 1, true), flat(0xffffff, { map: sprinkleTexture(color), side: THREE.DoubleSide }));
  cone.position.y = 0.1;
  cone.castShadow = true;
  const pom = furry(new THREE.SphereGeometry(0.026, 16, 12), { color: 0xc9c9cf, tip: 0xeeeeF2, length: 0.016, shells: 8, density: 40, seed: 3 });
  pom.position.y = 0.205;
  g.add(cone, pom);
  return g;
}

/** The egg: a soft white shell in two halves, split by a zigzag crack. */
function eggHalf(top) {
  const U = 72, V = 24, H = 1.12, W = 0.56;
  const crack = (u) => 0.52 + 0.06 * (1 - Math.abs(((u * 9) % 1) * 2 - 1)) * 2 - 0.06;
  // A real egg: round, widest a bit below the middle, a gentler dome on top.
  const radius = (v) => { const m = 0.42, d = (v - m) / (v < m ? m : 1 - m); return W * Math.sqrt(Math.max(0, 1 - d * d)) ** 0.9; };
  const pos = [], index = [];
  for (let i = 0; i <= U; i++) {
    const u = i / U, a = u * Math.PI * 2, c = crack(u);
    for (let j = 0; j <= V; j++) {
      const v = top ? c + (1 - c) * (j / V) : c * (j / V);
      const r = radius(v);
      pos.push(Math.cos(a) * r, v * H, Math.sin(a) * r);
    }
  }
  for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
    const a = i * (V + 1) + j, b = (i + 1) * (V + 1) + j;
    index.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, flat(0xfbfbf8, { roughness: 1, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class Cortis {
  constructor(color = 'yellow') {
    const C = CORTIS_COLORS[color] ?? CORTIS_COLORS.yellow;
    this.colorName = color;
    this.root = new THREE.Group();
    this.root.name = `cortis_${color}`;
    const hips = new THREE.Group();
    const torso = new THREE.Group();
    this.root.add(hips);
    hips.add(torso);
    // Everything that hatches lives in `body` (centred on the ball), so the hatch never fights the poses.
    const body = new THREE.Group();
    body.position.y = R + FUR;
    torso.add(body);
    this.body = body;

    // The fuzzy ball and its pom-pom bumps.
    body.add(furry(new THREE.SphereGeometry(R, 72, 54), { color: C.fur, tip: C.tip, length: FUR, shells: 22, density: 70, seed: 1 }));
    const bobbleGeo = new THREE.SphereGeometry(0.062, 24, 18);
    for (const [x, y, z, s] of [[-0.62, 0.62, 0.2, 1], [-0.3, 0.88, 0.1, 0.95], [0.22, 0.9, 0.05, 1], [0.6, 0.66, 0.08, 1.05], [0.86, 0.3, 0.05, 0.95], [0.92, -0.08, 0.05, 0.9], [-0.86, 0.32, 0.1, 0.9], [0.0, 0.7, -0.6, 0.9], [-0.55, 0.5, -0.55, 0.85], [0.55, 0.45, -0.6, 0.85]]) {
      const b = furry(bobbleGeo, { color: C.bobble, tip: C.bobbleTip, length: 0.03, shells: 12, density: 34, seed: 2 });
      b.position.copy(new THREE.Vector3(x, y, z).normalize().multiplyScalar(R + FUR * 0.4));
      b.scale.setScalar(s);
      body.add(b);
    }

    // The embroidered face (on the front, +z). Big eye on its right (the viewer's right), small dot eye on the left.
    const face = new THREE.Group();
    body.add(face);
    const BIG = [0.34, 0.26];
    const SMALL = [-0.22, 0.27];
    const outline = new THREE.Mesh(onBall(new THREE.CircleGeometry(0.112, 40), BIG, 0), flat(new THREE.Color(C.sclera).multiplyScalar(0.8)));
    const sclera = new THREE.Mesh(onBall(new THREE.CircleGeometry(0.1, 40), BIG, 0.002), flat(C.sclera));
    this.bigEye = new THREE.Group();
    this.bigEye.add(outline, sclera);
    face.add(this.bigEye);
    this.pupilFrame = frameAt(BIG, 0.004);
    this.pupil = new THREE.Mesh(new THREE.CircleGeometry(0.036, 28), flat(C.pupil, { roughness: 1 }));
    this.pupilFrame.add(this.pupil);
    face.add(this.pupilFrame);
    this.smallFrame = frameAt(SMALL, 0.002);
    this.smallEye = new THREE.Mesh(new THREE.CircleGeometry(0.03, 24), flat(C.pupil, { roughness: 1 }));
    this.smallFrame.add(this.smallEye);
    face.add(this.smallFrame);
    const nose = new THREE.Mesh(onBall(new THREE.CircleGeometry(0.024, 20), [-0.05, 0.07], 0.002), flat(0x2a1d18));
    nose.scale.set(1, 1, 1);
    face.add(nose);
    // The open mouth: a soft rounded shape, flat on top.
    const mouthShape = new THREE.Shape();
    // Like the plush: a wide open mouth, flat and a little slanted on top, round at the bottom.
    mouthShape.moveTo(-0.075, 0.035);
    mouthShape.quadraticCurveTo(0, 0.05, 0.08, 0.03);
    mouthShape.bezierCurveTo(0.098, -0.035, 0.055, -0.085, 0.002, -0.085);
    mouthShape.bezierCurveTo(-0.055, -0.085, -0.095, -0.03, -0.075, 0.035);
    this.mouthFrame = frameAt([0.1, -0.12], 0.002);
    this.mouth = new THREE.Mesh(new THREE.ShapeGeometry(mouthShape, 16), flat(C.mouth));
    this.mouth.rotation.z = -0.12;
    this.mouthFrame.add(this.mouth);
    face.add(this.mouthFrame);
    // Closed and happy eyes (shown instead of the open ones).
    const lineMat = flat(C.pupil);
    this.closedBig = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.1, 4, 8), lineMat);
    this.closedBig.rotation.z = Math.PI / 2;
    this.happyBig = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 8, 24, Math.PI), lineMat);
    const bigFrame = frameAt(BIG, 0.006);
    bigFrame.add(this.closedBig, this.happyBig);
    face.add(bigFrame);
    this.happySmall = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 8, 20, Math.PI), lineMat);
    this.smallFrame.add(this.happySmall);
    // Blush that shows when it's flustered or happy.
    this.blush = [];
    for (const at of [[-0.38, 0.06], [0.5, 0.05]]) {
      const b = new THREE.Mesh(onBall(new THREE.CircleGeometry(0.06, 24), at, 0.001), new THREE.MeshBasicMaterial({ color: 0xff7a9c, transparent: true, opacity: 0, depthWrite: false }));
      b.scale.set(1, 1, 1);
      face.add(b);
      this.blush.push(b);
    }

    // Party hat, tilted on top (hidden while it wears an outfit or headphones).
    this.hat = partyHat(C.hat);
    this.hat.position.copy(new THREE.Vector3(-0.18, 0.95, 0.12).normalize().multiplyScalar(R + FUR * 0.5));
    this.hat.rotation.set(0.12, 0, 0.28);
    body.add(this.hat);

    // Outfits and headphones are made for Bbokari's head; this holder scales and places them onto the ball.
    const s = (R + FUR * 0.6) / 0.324;
    this.headHolder = new THREE.Group();
    this.headHolder.scale.setScalar(s);
    this.headHolder.position.y = -0.28 * s;
    body.add(this.headHolder);
    // In that holder's units the ball is ~0.33 across from its centre at y ≈ 0.28: hats sit a touch higher, and the
    // headphones hug the ball with the band tucked behind the top pom-poms.
    this.outfitOffset = [0, 0.04, 0];
    this.headFit = { side: 0.33, cupY: 0.3, cupZ: -0.01, top: 0.6, bandZ: -0.13, square: 0.75, mouth: [0.03, 0.24, 0.33] };

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
    const hop = Math.abs(Math.sin(this.walkPhase)) * 0.11 * this.walkAmount;
    j.hips.position.y = HOVER + p.bodyY + hop - p.crouch * 0.4;
    // Squash when it lands from a hop, and a little breathing.
    const land = this.walkAmount * Math.max(0, Math.cos(this.walkPhase * 2)) * 0.06;
    const squash = 1 - p.crouch * 1.2 - land;
    j.torso.scale.set(1 / Math.sqrt(squash) + breath * 0.006, squash + breath * 0.01, 1 / Math.sqrt(squash));
    j.torso.rotation.set(p.torsoPitch * 0.6 + p.headPitch * 0.5 + this.lean * 0.5, p.torsoYaw + p.headYaw * 0.5, p.torsoRoll + p.headRoll * 0.6);
    this.pose = p;
  }

  animate(dt) {
    this.time += dt;
    if (!this.hatched) this.#hatch(dt);
    const c = this.face.current;
    const blink = this.face.blinkFactor;
    const happy = Math.max(c.happy ?? 0, c.squeeze ?? 0, c.cat ?? 0) > 0.5;
    const openBig = clamp(c.eyeOpen[1] * blink, 0, 1.2);
    const openSmall = clamp(c.eyeOpen[0] * blink, 0, 1.2);
    const closedBig = !happy && openBig < 0.22;
    this.bigEye.visible = this.pupil.visible = !happy && !closedBig;
    this.closedBig.visible = closedBig;
    this.happyBig.visible = happy;
    this.happySmall.visible = happy;
    this.smallEye.visible = !happy;
    const size = Math.min(c.eyeScale[1] ?? 1, 1.12);
    this.bigEye.scale.set(1, 1, 1);
    this.pupil.scale.set(size, size * Math.max(0.15, openBig), 1);
    this.smallEye.scale.set(1, Math.max(0.15, openSmall), 1);
    // The pupil wanders a little with the gaze (and sits a bit towards the middle, like on the plush).
    this.pupil.position.set(-0.022 + this.face.look.x * 0.03, 0.006 + this.face.look.y * 0.025, 0);
    const open = clamp(0.85 + (c.mouthOpen ?? 0) * 0.35, 0.5, 1.2);
    this.mouth.scale.set(1, (c.mouthCurve ?? 0) < -0.3 ? -open * 0.6 : open, 1);
    for (const b of this.blush) b.material.opacity = clamp((c.blush ?? 0) * 0.55, 0, 0.5);
    // The party hat steps aside for outfits and headphones.
    this.hat.visible = this.headHolder.children.length === 0;
    // A gentle wobble, like a plush being jiggled, and fuzz that sways a touch as it hops.
    this.body.rotation.z = Math.sin(this.time * 1.7) * 0.025 + Math.sin(this.walkPhase) * 0.05 * this.walkAmount;
  }

  /** Wobble, wobble, crack! The top flies off and it pops out; then the shell shrinks away. */
  #hatch(dt) {
    const t = (this.hatchT += dt);
    const egg = this.egg;
    egg.scale.setScalar(popIn(t / 0.4));
    const wob = t < 1.75 ? Math.sin(t * 20) * 0.12 * ease((t - 0.4) / 1.2) * (t > 0.4 ? 1 : 0) : 0;
    egg.rotation.z = wob;
    egg.position.y = t > 0.9 && t < 1.75 ? Math.abs(Math.sin(t * 10)) * 0.03 : 0;
    if (t > 1.75) {
      const k = t - 1.75;
      this.eggTop.position.set(-k * 0.5, k * 1.6 - k * k * 2.2, 0);
      this.eggTop.rotation.z = k * 2.4;
      this.eggTop.material.transparent = true; // only while it fades (a see-through egg lets fur specks show)
      this.eggTop.material.opacity = clamp(1 - k / 0.7, 0, 1);
      this.body.visible = true;
      const g = popIn((t - 1.8) / 0.5);
      this.body.scale.setScalar(Math.max(0.001, 0.35 + 0.65 * g));
      this.body.position.y = R + FUR + (1 - g) * -0.2;
    }
    if (t > 2.7) {
      const k = clamp((t - 2.7) / 0.6, 0, 1);
      this.eggBottom.scale.setScalar(1 - ease(k) * 0.999);
      this.eggBottom.material.transparent = true;
      this.eggBottom.material.opacity = 1 - k;
    }
    if (t > 3.35) {
      this.egg.removeFromParent();
      this.body.scale.setScalar(1);
      this.body.position.y = R + FUR;
      this.hatched = true;
    }
  }
}
