import * as THREE from 'three';

/** Head-relative spots on the sculpt (model units, height 1): eye sockets and cheeks. */
const HEAD_Y = 0.355;
const EYE_SPOT = { x: 0.115, y: 0.575, r: 0.036 };
const CHEEK_SPOT = { x: 0.185, y: 0.505 };

const DARK = 0x2a1a10;
/**
 * The front of the face as a height map, in head-local space: where each skinned vertex really is right now (read with
 * getVertexPosition, so it matches what's drawn; raycasting a skinned, quantised mesh could land far in front of it).
 */
class FaceSurface {
  constructor(head, mesh, headY) {
    this.cell = 0.01;
    this.grid = new Map();
    const v = new THREE.Vector3();
    mesh.skeleton?.update();
    mesh.updateMatrixWorld(true);
    head.updateMatrixWorld(true);
    const count = mesh.geometry.attributes.position.count;
    for (let i = 0; i < count; i++) {
      mesh.getVertexPosition(i, v);
      mesh.localToWorld(v);
      head.worldToLocal(v);
      if (v.z < 0) continue; // only the front half
      const k = this.key(v.x, v.y);
      let list = this.grid.get(k);
      if (!list) this.grid.set(k, (list = []));
      list.push(v.x, v.y, v.z);
    }
    this.headY = headY;
  }
  key(x, y) {
    return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`;
  }
  /** The front-most surface depth at (x, y) (head-local), or null if nothing is there. */
  zAt(x, y, r = 0.006) {
    let best = null;
    for (let gx = Math.floor((x - r) / this.cell); gx <= Math.floor((x + r) / this.cell); gx++) {
      for (let gy = Math.floor((y - r) / this.cell); gy <= Math.floor((y + r) / this.cell); gy++) {
        const list = this.grid.get(`${gx},${gy}`);
        if (!list) continue;
        for (let i = 0; i < list.length; i += 3) {
          if ((list[i] - x) ** 2 + (list[i + 1] - y) ** 2 < r * r && (best === null || list[i + 2] > best)) best = list[i + 2];
        }
      }
    }
    return best ?? (r < 0.03 ? this.zAt(x, y, r * 2) : null);
  }
  /** The face at a spot given in model units (height 1): { point, normal } in head-local space. */
  at(x, y) {
    const ly = y - this.headY;
    const z = this.zAt(x, ly) ?? 0.28;
    const d = 0.012;
    const zx = ((this.zAt(x + d, ly) ?? z) - (this.zAt(x - d, ly) ?? z)) / (2 * d);
    const zy = ((this.zAt(x, ly + d) ?? z) - (this.zAt(x, ly - d) ?? z)) / (2 * d);
    return { point: new THREE.Vector3(x, ly, z), normal: new THREE.Vector3(-zx, -zy, 1).normalize() };
  }
}

/**
 * A soft oval painted onto the cheek: each point of the oval is laid on the face, so it follows the curve of the face
 * instead of sticking out past it as a flat disc would.
 */
function cheekDecal(face, cheek, rx, ry) {
  const geo = new THREE.CircleGeometry(1, 24);
  const n = cheek.normal.clone();
  const u = new THREE.Vector3(0, 1, 0).cross(n).normalize(); // sideways along the face
  const v = n.clone().cross(u).normalize(); // up along the face
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const p = cheek.point.clone().addScaledVector(u, pos.getX(i) * rx).addScaledVector(v, pos.getY(i) * ry);
    p.z = (face.zAt(p.x, p.y) ?? p.z) + 0.004;
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * A smooth crescent smile laid on the face (`mouth`: half-width w, and the top and bottom edges as
 * y = y0 + k·(x/w)² in model units). Drawn as its own shape, it stays crisp where painting the sculpt's points would
 * leave jagged, flickering edges.
 */
function smileDecal(face, { w, top: [t0, tk], bottom: [b0, bk] }) {
  const N = 28;
  const edge = (y0, k, i) => { const x = -w + (2 * w * i) / N; return [x, y0 + k * (x / w) ** 2]; };
  const verts = [];
  const index = [];
  for (let i = 0; i <= N; i++) {
    for (const [x, y] of [edge(t0, tk, i), edge(b0, bk, i)]) {
      const ly = y - face.headY;
      verts.push(x, ly, (face.zAt(x, ly) ?? 0.2) + 0.003);
    }
    if (i < N) index.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0, ...extra });
}

/**
 * Bbokari's eyes are separate meshes laid on the sculpted eye sockets, so they can blink, squint (^ ^),
 * close for sleep, look around, cry and blush. Reads the shared FaceDisplay state each frame.
 */
export class BbokariEyes {
  /** `spots` moves the eyes and cheeks for another sculpt (Wolf Chan): { headY, eye: { x, y, r, tall?, maxScale? }, cheek: { x, y }, mouth? }. */
  constructor(head, headMesh, spots = {}) {
    const headY = spots.headY ?? HEAD_Y;
    const EYE = (this.EYE = spots.eye ?? { ...EYE_SPOT });
    const CHEEK = spots.cheek ?? CHEEK_SPOT;
    const face = new FaceSurface(head, headMesh, headY);
    this.eyes = [];
    this.blush = [];
    this.tears = [];
    const black = material(DARK, { roughness: 0.2 });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pink = new THREE.MeshBasicMaterial({ color: 0xff7aa2, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const tear = material(0x7fd4ff, { transparent: true, opacity: 0.9 });
    const r = EYE.r;
    if (spots.mouth) {
      const mouth = new THREE.Mesh(smileDecal(face, spots.mouth), new THREE.MeshBasicMaterial({ color: 0x3a2c31, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      head.add(mouth);
    }

    for (const side of [1, -1]) {
      const { point, normal } = face.at(side * EYE.x, EYE.y);
      const eye = new THREE.Group();
      eye.position.copy(point).addScaledVector(normal, 0.002);
      eye.lookAt(eye.position.clone().add(normal));
      head.add(eye);

      // Open: a glossy dark bead with a sparkle that drifts with the gaze.
      const open = new THREE.Group();
      const bead = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), black);
      bead.scale.set(1, EYE.tall ?? 1.12, 0.35); // `tall` stretches it for oval eyes (Wolf Chan)
      const sparkle = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 12, 8), white);
      sparkle.position.set(r * 0.32, r * 0.4, r * 0.3);
      const sparkle2 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 8, 6), white);
      sparkle2.position.set(-r * 0.3, -r * 0.35, r * 0.3);
      open.add(bead, sparkle, sparkle2);

      // Closed: a soft line; happy: an upside-down U (^ ^).
      const closed = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.16, r * 1.5, 4, 8), black);
      closed.rotation.z = Math.PI / 2;
      closed.position.y = -r * 0.2;
      const happy = new THREE.Mesh(new THREE.TorusGeometry(r * 0.8, r * 0.17, 8, 20, Math.PI), black);
      happy.position.y = -r * 0.35;

      eye.add(open, closed, happy);
      this.eyes.push({ eye, open, closed, happy, sparkle, side });

      const cheek = face.at(side * CHEEK.x, CHEEK.y);
      const blush = new THREE.Mesh(cheekDecal(face, cheek, r * 1.2, r * 0.7), pink);
      head.add(blush);
      this.blush.push(blush);

      const drop = new THREE.Mesh(new THREE.SphereGeometry(r * 0.32, 12, 10), tear);
      drop.scale.set(0.8, 1.2, 0.6);
      drop.visible = false;
      eye.add(drop);
      this.tears.push(drop);
    }
    this.time = 0;
  }

  /** `face` is the shared FaceDisplay; `dt` drives the tear drip. */
  apply(face, dt = 1 / 60) {
    const EYE = this.EYE;
    this.time += dt;
    const c = face.current;
    const look = face.look;
    const squint = Math.max(c.happy ?? 0, c.squeeze ?? 0, c.cat ?? 0);
    this.eyes.forEach(({ open, closed, happy, sparkle, side }, i) => {
      const openness = THREE.MathUtils.clamp(c.eyeOpen[i] * face.blinkFactor, 0, 1.2);
      const size = Math.min(c.eyeScale[i] ?? 1, EYE.maxScale ?? Infinity);
      const showHappy = squint > 0.5 && openness > 0.2;
      const showClosed = !showHappy && openness < 0.22;
      happy.visible = showHappy;
      closed.visible = showClosed;
      open.visible = !showHappy && !showClosed;
      open.scale.set(size, size * Math.max(0.25, openness), size);
      // The whole eye glances a little; the sparkle moves the other way, which reads as a rolling eyeball.
      open.position.set(look.x * EYE.r * 0.35, look.y * EYE.r * 0.3, 0);
      sparkle.position.x = EYE.r * 0.32 - look.x * EYE.r * 0.12;
      happy.scale.setScalar(size);
      const t = this.tears[i];
      t.visible = (c.tears ?? 0) > 0.4;
      if (t.visible) {
        const k = (this.time * 0.8 + i * 0.4) % 1;
        t.position.set(side * EYE.r * 0.6, -EYE.r * (0.9 + k * 2.2), EYE.r * 0.2);
        t.material.opacity = 0.9 * (1 - k);
      }
    });
    const blush = THREE.MathUtils.clamp(0.25 + (c.blush ?? 0) * 0.55, 0, 0.8);
    for (const b of this.blush) b.material.opacity = blush;
  }
}
