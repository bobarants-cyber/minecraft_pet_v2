import * as THREE from 'three';
import skaterGlb from '../../assets/models/skater.glb?inline';
import { FINGERS, MOUTH, faceZ } from '../../scripts/skater/model.mjs';
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
// ---------- His mouth (drawn live on the face, so it can change) ----------
// Closed: just the "m" (two little scallops under the nose). Smiling: the mouth opens below the "m", which becomes its
// top edge. Ta-da / excited: a narrow oval opens under the middle of the "m", cut off by it at the top.
const HEAD_PIVOT = [0, 0.5, 0];
const MW = 0.042;
const mY = (x) => { const u = Math.min(1, Math.abs(x - MOUTH.c[0]) / MW); return MOUTH.c[1] - 0.011 * Math.sin(Math.PI * u) + 0.006 * Math.max(0, u - 0.85) / 0.15; };
const onFace = (x, y, lift) => new THREE.Vector3(x - HEAD_PIVOT[0], y - HEAD_PIVOT[1], faceZ(x, y) + lift - HEAD_PIVOT[2]);
function faceMesh(pts2d, tris, color, lift) {
  const pos = [];
  for (const [x, y] of pts2d) pos.push(...onFace(x, y, lift).toArray());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(tris);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
}
/** A filled shape between a top and a bottom curve over x in [x0, x1]. */
function band(x0, x1, top, bottom, color, lift, N = 24) {
  const pts = [], tris = [];
  for (let i = 0; i <= N; i++) {
    const x = x0 + ((x1 - x0) * i) / N;
    pts.push([x, top(x)], [x, Math.min(top(x), bottom(x))]);
    if (i < N) tris.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  return faceMesh(pts, tris, color, lift);
}
function buildMouth() {
  const g = new THREE.Group();
  const [cx, cy] = MOUTH.c;
  // The "m": a thin dark line.
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 25 }, (_, i) => { const x = cx - MW + (2 * MW * i) / 24; return onFace(x, mY(x), 0.006); }));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.0034, 6), new THREE.MeshStandardMaterial({ color: 0x3a2622, roughness: 0.6 }));
  // Smile: opens below the "m" (unit size; scaled by how open it is).
  const smile = new THREE.Group();
  const H = 0.04;
  smile.add(band(cx - MW * 0.98, cx + MW * 0.98, mY, (x) => cy - 0.006 - H * Math.sqrt(Math.max(0, 1 - ((x - cx) / MW) ** 2)), 0x5b1e2a, 0.0055));
  smile.add(band(cx - MW * 0.5, cx + MW * 0.5, (x) => cy - 0.03 + 0.012 * (1 - ((x - cx) / (MW * 0.5)) ** 2), (x) => cy - 0.006 - H * Math.sqrt(Math.max(0, 1 - ((x - cx) / MW) ** 2)) + 0.002, 0xf28aa2, 0.0065));
  // Ta-da: a narrow oval under the middle of the "m", its top cut by the "m".
  const oval = new THREE.Group();
  const ow = 0.017, oh = 0.026, oc = cy - 0.006 - oh;
  const ovalTop = (x) => Math.min(mY(x), oc + oh * Math.sqrt(Math.max(0, 1 - ((x - cx) / ow) ** 2)));
  const ovalBot = (x) => oc - oh * Math.sqrt(Math.max(0, 1 - ((x - cx) / ow) ** 2));
  oval.add(band(cx - ow, cx + ow, ovalTop, ovalBot, 0x5b1e2a, 0.0055));
  oval.add(band(cx - ow * 0.75, cx + ow * 0.75, (x) => oc - oh * 0.25 + 0.006 * (1 - ((x - cx) / (ow * 0.75)) ** 2), (x) => ovalBot(x) + 0.0015, 0xf28aa2, 0.0065));
  g.add(m, smile, oval);
  g.userData = { smile, oval };
  return g;
}

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
    this.mouth = buildMouth();
    this.parts.ready.then(() => this.parts.head.add(this.mouth));
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
    const v = this.skate ? (this.skate.air > 0.005 || this.skate.grinding || this.skate.duck > 0.3 ? 0.001 : this.skate.speed) : this.speed ?? 0, dir = Math.sign(v) || 1;
    // The skate game: jump height, ducking, and crashing are on top of the riding pose.
    if (this.skate) {
      const sk = this.skate;
      j.hips.position.y += sk.air;
      j.torso.scale.y *= 1 - sk.duck * 0.28;
      j.torso.rotation.x += sk.duck * 0.25;
      if (sk.grab > 0) { legR.rotation.x -= sk.grab * 0.9; legL.rotation.x -= sk.grab * 0.9; }
      if (sk.bail > 0) j.torso.rotation.z += Math.sin(sk.bail * Math.PI) * 1.2;
    }
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
    const cap = 1.4 + r * 0.4;
    // ...and come a little forward as they go up, so the hand passes in front of his head, not into it.
    rx -= clamp(p.armRaiseR / 1.3, 0, 1) * 0.5 * (1 - r);
    lx -= clamp(p.armRaiseL / 1.3, 0, 1) * 0.5 * (1 - r);
    const tw = (raise) => clamp(raise / 1.4, 0, 1) * 1.45 * (1 - r);
    armR.rotation.order = armL.rotation.order = 'ZXY'; // twist about the arm first, then bring it forward, then raise
    armR.rotation.set(rx, tw(p.armRaiseR), Math.min(rz, cap));
    armL.rotation.set(lx, -tw(p.armRaiseL), -Math.min(lz, cap));
  }

  animate(dt) {
    super.animate(dt);
    const p = this.pose;
    // Hop on when going somewhere, off again once it's been still for a moment.
    const go = !!this.skate || this.walkAmount > 0.25 || Math.abs(this.speed ?? 0) > 0.15;
    this.stillFor = go ? 0 : (this.stillFor ?? 0) + dt;
    const target = go ? 1 : this.stillFor > 0.35 ? 0 : this.ride > 0.5 ? 1 : 0;
    this.ride = clamp(this.ride + Math.sign(target - this.ride) * dt * 2.6, 0, 1);
    const spd = this.skate ? (this.skate.air > 0.005 || this.skate.grinding ? 0 : this.skate.speed) : this.speed ?? 0;
    this.pushPhase += dt * (Math.abs(spd) > 0.25 ? 5 : 0);
    const r = ease(this.ride);
    const b = this.board;
    // On his back: upright, wheels out, slung diagonally. Riding: flat under his feet along the way he goes.
    const back = new THREE.Vector3(0.02, 0.62, -0.3);
    const under = new THREE.Vector3(0, 0.006, 0.02);
    b.position.lerpVectors(back, under, r);
    b.position.y += Math.sin(Math.PI * this.ride) * 0.15; // it swings round in an arc
    b.quaternion.slerpQuaternions(BACK_Q, IDENTITY_Q, r);
    // Tricks: the board flips under his feet (kickflip/heelflip spin it along its length, a shove-it turns it flat,
    // a 360 flip does both) and drops a little away from his feet while it spins.
    if (this.skate) {
      const sk = this.skate;
      b.rotateX(sk.flip * Math.PI * 2);
      b.rotateY(sk.shuv * Math.PI * 2);
      b.position.y -= Math.sin(Math.min(1, Math.max(Math.abs(sk.flip % 1), Math.abs(sk.shuv % 1))) * Math.PI) * 0.09;
      if (sk.bail > 0) { b.position.x += sk.bail * 0.6; b.rotateZ(sk.bail * 3); }
    }
    // Wheels roll with the distance travelled.
    this.wheelSpin += ((this.skate ? this.skate.speed : this.speed ?? 0) * dt) / BOARD.wheelR;
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
    // Mouth: closed "m", the open smile, or the ta-da oval, from how open the face wants it.
    {
      const o = this.face.current.mouthOpen ?? 0;
      const { smile, oval } = this.mouth.userData;
      const smiling = o > 0.12 && o < 0.62;
      smile.visible = smiling;
      oval.visible = o >= 0.62;
      // Grow from the "m" (its top edge) downwards.
      const top = new THREE.Vector3(0, MOUTH.c[1] - HEAD_PIVOT[1], 0);
      for (const [g, k] of [[smile, Math.min(1, 0.5 + o)], [oval, Math.min(1.15, 0.6 + o * 0.5)]]) {
        g.scale.set(1, k, 1);
        g.position.set(0, top.y * (1 - k), 0);
      }
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
