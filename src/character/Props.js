import * as THREE from 'three';

/**
 * The little office the pet sets up when it types or thinks: a chair behind it, a desk in front with a laptop.
 * Built in the pet's own units (about 1.25 tall), so it can be a child of the pet's root and scale with it.
 * The laptop faces the pet, so from the screen you see the back of its lid (with a sticker) and the pet's face above.
 */
function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...extra });
}

function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function stickerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffd84a';
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.font = '76px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('🐥', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const SEAT_HEIGHT = 0.24;

export function buildOffice() {
  const office = new THREE.Group();
  office.name = 'office';

  // Chair: a cushy seat and backrest on a single stem with a round foot.
  const chair = new THREE.Group();
  const cushion = mat(0x7c6cf2, { roughness: 0.85 });
  const metal = mat(0x3a3a44, { roughness: 0.4, metalness: 0.3 });
  const seat = box(0.62, 0.07, 0.5, cushion);
  seat.position.set(0, SEAT_HEIGHT - 0.035, -0.06);
  const back = box(0.6, 0.48, 0.07, cushion);
  back.position.set(0, SEAT_HEIGHT + 0.26, -0.33);
  back.rotation.x = -0.12;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, SEAT_HEIGHT - 0.06, 10), metal);
  stem.position.set(0, (SEAT_HEIGHT - 0.06) / 2 + 0.02, -0.06);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 20), metal);
  foot.position.set(0, 0.015, -0.06);
  for (const m of [stem, foot]) m.castShadow = true;
  chair.add(seat, back, stem, foot);

  // Desk in front with a laptop on it.
  const desk = new THREE.Group();
  const wood = mat(0xc68a4a);
  const deskTop = 0.32;
  const top = box(0.95, 0.045, 0.4, wood);
  top.position.set(0, deskTop, 0.56);
  desk.add(top);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = box(0.045, deskTop, 0.045, wood);
      leg.position.set(sx * 0.43, deskTop / 2, 0.56 + sz * 0.16);
      desk.add(leg);
    }
  }
  const shell = mat(0xd9dde3, { roughness: 0.35, metalness: 0.2 });
  const base = box(0.4, 0.022, 0.26, shell);
  base.position.set(0, deskTop + 0.034, 0.5);
  const keys = box(0.34, 0.006, 0.14, mat(0x2b2f36));
  keys.position.set(0, deskTop + 0.047, 0.47);
  // Lid hinged at the far edge, screen facing the pet, tilted back a little.
  const lid = new THREE.Group();
  lid.position.set(0, deskTop + 0.045, 0.63);
  lid.rotation.x = 0.18;
  const lidPanel = box(0.4, 0.2, 0.016, shell);
  lidPanel.position.y = 0.1;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.17), new THREE.MeshBasicMaterial({ color: 0x9fd4ff }));
  screen.position.set(0, 0.104, -0.0095);
  screen.rotation.y = Math.PI;
  const sticker = new THREE.Mesh(new THREE.CircleGeometry(0.055, 24), new THREE.MeshBasicMaterial({ map: stickerTexture(), transparent: true }));
  sticker.position.set(0, 0.105, 0.0095);
  lid.add(lidPanel, screen, sticker);
  // A tiny steaming mug, because typing is thirsty work.
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.032, 0.07, 14), mat(0xff8fab));
  mug.position.set(0.36, deskTop + 0.058, 0.52);
  mug.castShadow = true;
  desk.add(base, keys, lid, mug);

  office.add(chair, desk);
  office.userData = { chair, desk, screen };
  return office;
}

/** Round glasses, sized for Bbokari's head (model units); `eyes` are the eye groups to centre the lenses on. */
export function buildGlasses(eyes) {
  const g = new THREE.Group();
  g.name = 'glasses';
  const frame = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.3, metalness: 0.2 });
  const glass = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.18, depthWrite: false });
  const pts = eyes.map((e) => e.eye.position.clone());
  const centers = pts.map((p) => p.clone().add(new THREE.Vector3(0, 0.002, 0.022)));
  for (const [i, c] of centers.entries()) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.007, 8, 28), frame);
    ring.position.copy(c);
    ring.rotation.y = eyes[i].side * 0.12;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.052, 24), glass);
    lens.position.copy(c);
    lens.rotation.y = eyes[i].side * 0.12;
    // Arm back towards the ear.
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.2), frame);
    arm.position.set(c.x + eyes[i].side * 0.06, c.y + 0.01, c.z - 0.1);
    arm.rotation.y = eyes[i].side * 0.35;
    g.add(ring, lens, arm);
  }
  const mid = centers[0].clone().add(centers[1]).multiplyScalar(0.5);
  const gap = Math.max(0.015, centers[0].distanceTo(centers[1]) / 2 - 0.056);
  const bridge = new THREE.Mesh(new THREE.TorusGeometry(gap, 0.006, 6, 12, Math.PI), frame);
  bridge.position.set(mid.x, mid.y + 0.012, mid.z + 0.004);
  g.add(bridge);
  return g;
}
