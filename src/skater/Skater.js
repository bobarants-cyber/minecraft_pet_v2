import * as THREE from 'three';
import skaterGlb from '../../assets/models/skater.glb?inline';
import { FINGERS } from '../../scripts/skater/model.mjs';
import { HOVER, buildSculptRig } from '../bbokari/BbokariRig.js';
import { Bbokari } from '../bbokari/Bbokari.js';

/** The GLB is height 1 (feet at y = 0, face towards +z, hair tuft included); his height in world units. */
const MODEL_HEIGHT = 1.3;
export const SKATER_HEIGHT = HOVER + MODEL_HEIGHT;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (t) => t * t * (3 - 2 * t);

// ---------- The skateboard ----------
// Strapped to his back: the deck's length runs up his back (slung diagonally), grip tape against him, wheels facing
// out, and the top leaning back a little to clear his big head.
const IDENTITY_Q = new THREE.Quaternion();
const BACK_Q = new THREE.Quaternion()
  .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.28)
  .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.45))
  .multiply(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))));
const BOARD = { length: 0.78, width: 0.21, deck: 0.018, kick: 0.07, wheelR: 0.032, height: 0.1 };

/** A real-looking board: a maple deck with kicked-up nose and tail, black grip tape, metal trucks, soft wheels. */
function buildSkateboard() {
  const g = new THREE.Group();
  const { length: L, width: W, deck: T, kick } = BOARD;
  // Deck outline: a long rounded shape (popsicle), extruded, then the ends bent up into kicktails.
  const s = new THREE.Shape();
  const r = W / 2;
  s.moveTo(-L / 2 + r, -r);
  s.lineTo(L / 2 - r, -r);
  s.absarc(L / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-L / 2 + r, r);
  s.absarc(-L / 2 + r, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  const bend = (geo) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), ax = Math.abs(x), start = L / 2 - 0.15;
      if (ax > start) p.setY(i, p.getY(i) + ((ax - start) / 0.15) ** 2 * kick);
      // A gentle concave across the width.
      p.setY(i, p.getY(i) + (p.getZ(i) / (W / 2)) ** 2 * 0.006);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const deckGeo = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 20, steps: 1 });
  deckGeo.rotateX(Math.PI / 2); // lie flat: the shape's y becomes z
  deckGeo.translate(0, 0, 0);
  // Subdivide along the length so the kicktails bend smoothly.
  const deck = new THREE.Mesh(bend(tessellate(deckGeo, 0.02)), new THREE.MeshStandardMaterial({ map: deckTexture(), roughness: 0.55 }));
  deck.position.y = -0.003;
  deck.castShadow = true;
  // Grip tape on top (slightly inset), sandpaper-dark.
  const grip = new THREE.Mesh(bend(tessellate(new THREE.ShapeGeometry(s, 24).rotateX(-Math.PI / 2), 0.02)), new THREE.MeshStandardMaterial({ color: 0x1d1d22, roughness: 1, map: gripTexture() }));
  grip.position.y = 0.0005;
  grip.scale.set(0.985, 1, 0.96);
  g.add(deck, grip);
  // Trucks and wheels.
  const metal = new THREE.MeshStandardMaterial({ color: 0xb9bcc4, metalness: 0.85, roughness: 0.35 });
  const urethane = new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.6 });
  const core = new THREE.MeshStandardMaterial({ color: 0xd6413a, roughness: 0.5 });
  g.userData.wheels = [];
  for (const sx of [-1, 1]) {
    const tx = sx * (L / 2 - 0.13);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.075), metal);
    base.position.set(tx, -T - 0.008, 0);
    const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.016, 0.03, 12), metal);
    hanger.position.set(tx, -T - 0.03, 0);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, W * 0.98, 12), metal);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(tx, -T - 0.045, 0);
    g.add(base, hanger, axle);
    for (const sz of [-1, 1]) {
      const w = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(BOARD.wheelR, BOARD.wheelR, 0.03, 24), urethane);
      tire.rotation.x = Math.PI / 2;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(BOARD.wheelR * 0.5, BOARD.wheelR * 0.5, 0.032, 16), core);
      hub.rotation.x = Math.PI / 2;
      w.add(tire, hub);
      w.position.set(tx, -T - 0.045, sz * (W / 2 - 0.005));
      tire.castShadow = true;
      g.add(w);
      g.userData.wheels.push(w);
    }
  }
  return g;
}

/** Splits a geometry's triangles until no edge is longer than `max`, so it can bend smoothly. */
function tessellate(geo, max) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  let pos = Array.from(geo.attributes.position.array);
  const uv = geo.attributes.uv ? Array.from(geo.attributes.uv.array) : null;
  let uvs = uv;
  for (let pass = 0; pass < 6; pass++) {
    const out = [], ouv = [];
    let split = false;
    for (let t = 0; t < pos.length; t += 9) {
      const v = [0, 1, 2].map((k) => pos.slice(t + 3 * k, t + 3 * k + 3));
      const u = uvs ? [0, 1, 2].map((k) => uvs.slice((t / 3) * 2 + 2 * k, (t / 3) * 2 + 2 * k + 2)) : null;
      const d = [0, 1, 2].map((k) => Math.hypot(...v[k].map((c, a) => c - v[(k + 1) % 3][a])));
      const k = d.indexOf(Math.max(...d));
      if (d[k] <= max) { out.push(...v.flat()); if (u) ouv.push(...u.flat()); continue; }
      split = true;
      const a = k, b = (k + 1) % 3, c = (k + 2) % 3;
      const m = v[a].map((x, i) => (x + v[b][i]) / 2);
      out.push(...v[a], ...m, ...v[c], ...m, ...v[b], ...v[c]);
      if (u) { const mu = u[a].map((x, i) => (x + u[b][i]) / 2); ouv.push(...u[a], ...mu, ...u[c], ...mu, ...u[b], ...u[c]); }
    }
    pos = out;
    uvs = uv ? ouv : null;
    if (!split) break;
  }
  const g2 = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uvs) g2.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g2.computeVertexNormals();
  return g2;
}

/** The deck's bottom and edges: layered maple with a bold red graphic (his cape was red). */
function deckTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#d93a32';
  x.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 9; i++) { x.fillStyle = i % 2 ? '#e8c590' : '#c99a5c'; x.fillRect(0, i * 4, 512, 2); }
  x.fillStyle = '#fff3e6';
  x.font = 'bold 54px sans-serif';
  x.textAlign = 'center';
  x.fillText('✕ ✕ ✕', 256, 90);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1.6, 6);
  return t;
}
function gripTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const img = x.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) { const v = 120 + Math.random() * 135; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 3);
  return t;
}

/**
 * Gliddy (EVAN's official character, always on his skateboard): a tan-and-white critter with an X-stitched eye and a sleepy purple one, a white shirt and big black
 * shoes and a big red tail, sculpted from the Meshy screenshots (see scripts/skater). When he goes somewhere his
 * skateboard pops out under his feet and he rides it, facing you, wheels spinning.
 */
export class Skater extends Bbokari {
  constructor() {
    super(
      buildSculptRig({ name: 'skater', glb: skaterGlb, modelHeight: MODEL_HEIGHT, headStandIn: 0.52, eyes: false }),
      { height: SKATER_HEIGHT, halfWidth: 0.42, emoteLift: 1.0, hand: [0.12, -0.2, 0.04], armScale: 1 },
    );
    this.outfitOffset = [0, -0.265, 0.02];
    this.outfitScale = 0.85;
    this.headFit = { side: 0.255, cupY: 0.17, cupZ: -0.02, top: 0.38, bandZ: -0.13, square: 0.65, mouth: [0.02, 0.046, 0.17] };
    this.board = buildSkateboard();
    this.joints.torso.add(this.board);
    this.ride = 0; // 0 = board on his back, 1 = riding it
    this.speed = 0;
    this.wheelSpin = 0;
    this.pushPhase = 0;
    this.hemA = 0;
    this.hemV = 0;
    this.fingers = [];
    this.handOpen = [0, 0];
    this.handSeed = [Math.random() * 10, Math.random() * 10];
    this.parts.ready.then(() => this.root.traverse((o) => {
      if (!o.isBone) return;
      if (o.name === 'hem') this.hem = o;
      // fingers_R is on his +x side (FINGERS[1]), fingers_L on −x (FINGERS[0]).
      if (o.name === 'fingers_R') this.fingers[0] = { bone: o, axis: new THREE.Vector3(...FINGERS[1].axis), raise: 'R' };
      if (o.name === 'fingers_L') this.fingers[1] = { bone: o, axis: new THREE.Vector3(...FINGERS[0].axis), raise: 'L' };
    }));
  }

  /** The typing scene's glasses need bead eyes; his eyes are sculpted, so he skips them. */
  setGlasses() {}

  applyPose(p, breath = 0) {
    const moving = this.walkAmount;
    // On the board there's no walking: hide the stride from the walk cycle while riding.
    this.walkAmount = moving * (1 - this.ride);
    super.applyPose(p, breath);
    this.walkAmount = moving;
    if (!this.parts.loaded) return;
    const j = this.joints;
    const r = ease(this.ride);
    const [armR, armL] = this.parts.arms; // +x (his left) and −x (his right)
    const [legR, legL] = this.parts.legs;

    // His arms hang down at rest, so they can go all the way up (ta-da!, waving) instead of stopping at the shoulder.
    const arm = (raise, swing, elbow, wrist) => [-swing * 0.8 - elbow * 0.25, 0, raise * 0.78 + wrist * 0.25];
    let [rx, , rz] = arm(p.armRaiseR, p.armSwingR, p.elbowR, p.wristR);
    let [lx, , lz] = arm(p.armRaiseL, p.armSwingL, p.elbowL, p.wristL);

    // Riding: stand on the deck sideways, facing you, knees soft, and kick-push with the back foot now and then.
    j.hips.position.y += r * (BOARD.height - this.hover) + Math.sin(Math.PI * this.ride) * 0.12;
    j.torso.rotation.y -= r * (this.root?.rotation.y ?? 0);
    const v = this.speed ?? 0, dir = Math.sign(v) || 1;
    const pushing = r > 0.9 && Math.abs(v) > 0.25;
    const ph = this.pushPhase % (Math.PI * 2);
    const stroke = pushing ? Math.max(0, Math.sin(ph)) : 0; // foot down and pushing back
    const lift = pushing ? Math.max(0, -Math.sin(ph)) : 0; // foot coming back up to the board
    // Lean into the way he's going, dipping over the front knee on each push.
    j.torso.rotation.z += r * clamp(-v * 0.14, -0.22, 0.22) - dir * stroke * 0.06;
    j.hips.position.y -= stroke * 0.035;
    // Feet: front foot planted on the board, back foot reaches down behind and pushes, then swings back.
    const front = dir > 0 ? legR : legL, back = dir > 0 ? legL : legR;
    front.rotation.z += r * 0.13 * dir;
    back.rotation.z += r * (-0.13 * dir) - dir * (stroke * 0.55 + lift * 0.15);
    back.rotation.x += -lift * 0.35;
    // Arms out a little for balance, swinging against the push.
    rz += r * (0.55 + stroke * 0.2 * dir);
    lz += r * (0.55 - stroke * 0.2 * dir);
    // Raised arms stop out to the side of his big head (never through it), and turn so the open palm faces you.
    const cap = 1.5 + r * 0.3;
    const tw = (raise) => clamp(raise / 1.4, 0, 1) * 1.45 * (1 - r);
    armR.rotation.order = armL.rotation.order = 'ZYX'; // twist about the arm first, then raise
    armR.rotation.set(rx, tw(p.armRaiseR), Math.min(rz, cap));
    armL.rotation.set(lx, -tw(p.armRaiseL), -Math.min(lz, cap));
  }

  animate(dt) {
    super.animate(dt);
    const p = this.pose;
    // Hop on when going somewhere, off again once it's been still for a moment.
    const go = this.walkAmount > 0.25 || Math.abs(this.speed ?? 0) > 0.15;
    this.stillFor = go ? 0 : (this.stillFor ?? 0) + dt;
    const target = go ? 1 : this.stillFor > 0.35 ? 0 : this.ride > 0.5 ? 1 : 0;
    this.ride = clamp(this.ride + Math.sign(target - this.ride) * dt * 2.6, 0, 1);
    this.pushPhase += dt * (Math.abs(this.speed ?? 0) > 0.25 ? 5 : 0);
    const r = ease(this.ride);
    const b = this.board;
    // On his back: upright, wheels out, slung diagonally. Riding: flat under his feet along the way he goes.
    const back = new THREE.Vector3(0.02, 0.62, -0.3);
    const under = new THREE.Vector3(0, 0.006, 0.02);
    b.position.lerpVectors(back, under, r);
    b.position.y += Math.sin(Math.PI * this.ride) * 0.15; // it swings round in an arc
    b.quaternion.slerpQuaternions(BACK_Q, IDENTITY_Q, r);
    // Wheels roll with the distance travelled.
    this.wheelSpin += ((this.speed ?? 0) * dt) / BOARD.wheelR;
    for (const w of b.userData.wheels) w.rotation.z = -this.wheelSpin;

    // Hands: they open wide for big moves (waving, ta-da, dancing, cheering, riding for balance), and otherwise rest
    // gently curled, each one flexing a little on its own now and then so they never look frozen or identical.
    if (p) {
      this.fingers.forEach((f, i) => {
        if (!f) return;
        const raise = p[`armRaise${f.raise}`] ?? 0;
        const sd = this.handSeed[i];
        const fidget = 0.18 * Math.sin(this.time * 0.7 + sd) + 0.12 * Math.sin(this.time * 1.9 + sd * 2.3);
        const target = clamp(raise / 1.3, 0, 1) * 1.1 + r * 0.5 > 0.05
          ? -Math.min(0.75, clamp(raise / 1.3, 0, 1) * 0.8 + r * 0.35)
          : 0.32 + fidget; // relaxed: curled a little more than the sculpt, drifting
        this.handOpen[i] += (target - this.handOpen[i]) * (1 - Math.exp(-10 * dt));
        // Negative opens (fingers straighten out), positive curls them towards the palm.
        f.bone.quaternion.setFromAxisAngle(f.axis, -this.handOpen[i]);
      });
    }
    // The shirt moves like cloth: its lower half swings behind his movement on a spring, bounces a little, and lifts
    // and flares out when he raises his arms.
    if (this.hem && p) {
      const goal = clamp(-(this.speed ?? 0) * 0.14, -0.22, 0.22) - (this.joints.torso.rotation.z ?? 0) * 0.5;
      this.hemV += ((goal - this.hemA) * 70 - this.hemV * 7) * dt;
      this.hemA += this.hemV * dt;
      const up = clamp(Math.max(p.armRaiseL ?? 0, p.armRaiseR ?? 0) / 2.5, 0, 1);
      this.hem.rotation.z = this.hemA;
      this.hem.rotation.x = Math.sin(this.time * 1.3) * 0.015 - (this.lean ?? 0) * 0.2;
      this.hem.position.y = 0.47 + up * 0.022;
      this.hem.scale.set(1 + up * 0.06, 1 - up * 0.04, 1 + up * 0.03);
    }
  }
}
