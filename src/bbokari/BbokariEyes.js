import * as THREE from 'three';

/** Head-relative spots on the sculpt (model units, height 1): eye sockets and cheeks. */
const HEAD_Y = 0.355;
const EYE_SPOT = { x: 0.115, y: 0.575, r: 0.036 };
const CHEEK_SPOT = { x: 0.185, y: 0.505 };

const DARK = 0x2a1a10;
const _o = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Finds where a ray straight at the face from the front hits the head, in head-local space. */
function surface(head, mesh, x, y, headY = HEAD_Y) {
  _o.set(x, y - headY, 1);
  _t.set(x, y - headY, 0);
  head.localToWorld(_o);
  head.localToWorld(_t);
  const ray = new THREE.Raycaster(_o, _t.sub(_o).normalize());
  const hit = ray.intersectObject(mesh, true)[0];
  if (!hit) return { point: new THREE.Vector3(x, y - headY, 0.28), normal: new THREE.Vector3(0, 0, 1) };
  const point = head.worldToLocal(hit.point.clone());
  _n.copy(hit.face?.normal ?? new THREE.Vector3(0, 0, 1)).transformDirection(hit.object.matrixWorld);
  const normal = _n.clone().transformDirection(head.matrixWorld.clone().invert()).normalize();
  return { point, normal };
}

function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0, ...extra });
}

/**
 * Bbokari's eyes are separate meshes laid on the sculpted eye sockets, so they can blink, squint (^ ^),
 * close for sleep, look around, cry and blush. Reads the shared FaceDisplay state each frame.
 */
export class BbokariEyes {
  /** `spots` moves the eyes and cheeks for another sculpt (Wolf Chan): { headY, eye: { x, y, r }, cheek: { x, y } }. */
  constructor(head, headMesh, spots = {}) {
    const headY = spots.headY ?? HEAD_Y;
    const EYE = (this.EYE = spots.eye ?? { ...EYE_SPOT });
    const CHEEK = spots.cheek ?? CHEEK_SPOT;
    this.eyes = [];
    this.blush = [];
    this.tears = [];
    const black = material(DARK, { roughness: 0.2 });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pink = new THREE.MeshBasicMaterial({ color: 0xff7aa2, transparent: true, opacity: 0, depthWrite: false });
    const tear = material(0x7fd4ff, { transparent: true, opacity: 0.9 });
    const r = EYE.r;

    for (const side of [1, -1]) {
      const { point, normal } = surface(head, headMesh, side * EYE.x, EYE.y, headY);
      const eye = new THREE.Group();
      eye.position.copy(point).addScaledVector(normal, 0.002);
      eye.lookAt(eye.position.clone().add(normal));
      head.add(eye);

      // Open: a glossy dark bead with a sparkle that drifts with the gaze.
      const open = new THREE.Group();
      const bead = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), black);
      bead.scale.set(1, 1.12, 0.35);
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

      const cheek = surface(head, headMesh, side * CHEEK.x, CHEEK.y, headY);
      const blush = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 24), pink);
      blush.position.copy(cheek.point).addScaledVector(cheek.normal, 0.003);
      blush.lookAt(blush.position.clone().add(cheek.normal));
      blush.scale.set(1.3, 0.75, 1);
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
      const size = c.eyeScale[i] ?? 1;
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
