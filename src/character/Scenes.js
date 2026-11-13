import * as THREE from 'three';
import { SEAT_HEIGHT, box, buildChair, buildGlasses, buildOffice, mat } from './Props.js';

/**
 * Little scenes the pet acts out depending on what you're doing (see electron/activity.js): watching a video,
 * writing, music, a call, gaming, coding, reading, drawing. Each scene builds its props once and then poses the pet.
 *
 * Props go in four places:
 *   root  – furniture on the floor (pet units, ~1.25 tall, facing +z towards you)
 *   torso – things held in front of the belly / on the lap (moves with the body)
 *   head  – things worn (Bbokari's head bone, model units)
 *   handR / handL – things held in one hand (Bbokari's arm bones, model units)
 */

const rand = (a, b) => a + Math.random() * (b - a);
const pulse = (t, period, width) => {
  const k = (t % period) / width;
  return k < 1 ? Math.sin(k * Math.PI) : 0;
};

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function cyl(rt, rb, h, material, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.castShadow = true;
  return m;
}

function sphere(r, material) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), material);
  m.castShadow = true;
  return m;
}

// ---------- props ----------

function cinemaSeat() {
  const g = new THREE.Group();
  const velvet = mat(0xc81e3a, { roughness: 0.95 });
  const dark = mat(0x5a0f1c, { roughness: 0.9 });
  const gold = mat(0xe6b84a, { roughness: 0.35, metalness: 0.6 });
  const seat = box(0.72, 0.12, 0.55, velvet);
  seat.position.set(0, SEAT_HEIGHT - 0.06, -0.05);
  const back = box(0.74, 0.82, 0.14, velvet);
  back.position.set(0, SEAT_HEIGHT + 0.36, -0.34);
  back.rotation.x = -0.08;
  const backTop = cyl(0.07, 0.07, 0.74, velvet);
  backTop.rotation.z = Math.PI / 2;
  backTop.position.set(0, SEAT_HEIGHT + 0.77, -0.36);
  g.add(seat, back, backTop);
  for (const s of [-1, 1]) {
    const arm = box(0.09, 0.1, 0.55, dark);
    arm.position.set(s * 0.41, SEAT_HEIGHT + 0.12, -0.08);
    const post = box(0.07, SEAT_HEIGHT + 0.12, 0.07, dark);
    post.position.set(s * 0.41, (SEAT_HEIGHT + 0.12) / 2, 0.14);
    const stud = sphere(0.022, gold);
    stud.position.set(s * 0.41, SEAT_HEIGHT + 0.12, 0.2);
    g.add(arm, post, stud);
  }
  const base = box(0.6, SEAT_HEIGHT - 0.1, 0.42, dark);
  base.position.set(0, (SEAT_HEIGHT - 0.1) / 2, -0.08);
  g.add(base);
  return g;
}

function popcornBucket() {
  const g = new THREE.Group();
  const stripes = canvasTexture(128, 64, (x, w, h) => {
    for (let i = 0; i < 8; i++) {
      x.fillStyle = i % 2 ? '#ffffff' : '#e8243c';
      x.fillRect((i * w) / 8, 0, w / 8 + 1, h);
    }
  });
  const side = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.8 });
  const bucket = cyl(0.095, 0.07, 0.17, side);
  g.add(bucket);
  const kernel = mat(0xfff6dc, { roughness: 1 });
  const butter = mat(0xffe08a, { roughness: 1 });
  for (let i = 0; i < 22; i++) {
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(Math.random()) * 0.085;
    const k = sphere(rand(0.022, 0.03), i % 4 ? kernel : butter);
    k.position.set(Math.cos(a) * r, 0.09 + rand(0, 0.04) * (1 - r / 0.1), Math.sin(a) * r);
    g.add(k);
  }
  return g;
}

function popcornPiece() {
  const g = new THREE.Group();
  const kernel = mat(0xfff6dc, { roughness: 1 });
  for (const [x, y] of [[0, 0], [0.018, 0.01], [-0.012, 0.014]]) {
    const k = sphere(0.022, kernel);
    k.position.set(x, y, 0.03);
    g.add(k);
  }
  return g;
}

/** Where headphones sit on Bbokari's head (head-local, model units); other sculpts pass their own (`mob.headFit`). */
const BBOKARI_HEAD = { side: 0.325, cupY: 0.22, cupZ: -0.02, top: 0.64, bandZ: -0.02, square: 0.8, mouth: [0, 0.15, 0.31] };

function headphones({ mic = false, fit = BBOKARI_HEAD } = {}) {
  const f = { ...BBOKARI_HEAD, ...fit };
  const g = new THREE.Group();
  const band = mat(0x2b2f36, { roughness: 0.5 });
  const cup = mat(mic ? 0x3b4252 : 0xff5fa2, { roughness: 0.45 });
  const pad = mat(0x1d1f24, { roughness: 0.9 });
  const cupX = f.side + 0.035; // the cups sit just outside the head, the soft pads touching it
  // The band hugs the head: a rounded arch from one cup over the top to the other, tilting back to bandZ (Wolf Chan
  // wears it behind his ears). `square` < 1 makes the arch boxier so it clears a wide head's shoulders.
  const arch = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI;
    const c = Math.cos(a), sn = Math.sin(a);
    arch.push(new THREE.Vector3(
      (cupX + 0.01) * Math.sign(c) * Math.abs(c) ** f.square,
      f.cupY + 0.06 + (f.top + 0.03 - f.cupY - 0.06) * sn ** f.square,
      f.cupZ + (f.bandZ - f.cupZ) * sn,
    ));
  }
  const arc = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arch), 48, 0.026, 10), band);
  arc.castShadow = true;
  g.add(arc);
  for (const s of [-1, 1]) {
    const c = cyl(0.1, 0.1, 0.07, cup);
    c.rotation.z = Math.PI / 2;
    c.position.set(s * cupX, f.cupY, f.cupZ);
    const p = cyl(0.085, 0.085, 0.02, pad);
    p.rotation.z = Math.PI / 2;
    p.position.set(s * (cupX - 0.042), f.cupY, f.cupZ);
    g.add(c, p);
  }
  if (mic) {
    // The boom comes out of the front of the right cup and curves round to the mouth; the foam ball caps its end.
    const [mx, my, mz] = f.mouth;
    const end = new THREE.Vector3(mx + 0.09, my - 0.01, mz + 0.03);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(cupX + 0.02, f.cupY - 0.03, f.cupZ + 0.06),
      new THREE.Vector3(cupX + 0.01, f.cupY - 0.08, f.cupZ + 0.17),
      new THREE.Vector3((cupX + end.x) / 2 + 0.03, (f.cupY + end.y) / 2 - 0.07, end.z - 0.02),
      end,
    ]);
    const boom = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.011, 8), band);
    const foam = sphere(0.032, pad);
    foam.position.copy(end).addScaledVector(curve.getTangent(1), 0.022);
    g.add(boom, foam);
  }
  return g;
}

function notebook() {
  const g = new THREE.Group();
  const pages = canvasTexture(256, 192, (x, w, h) => {
    x.fillStyle = '#fffdf5';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = '#9cc3ff';
    x.lineWidth = 2;
    for (let y = 30; y < h; y += 18) {
      x.beginPath();
      x.moveTo(10, y);
      x.lineTo(w - 10, y);
      x.stroke();
    }
    x.strokeStyle = '#ff8fa3';
    x.beginPath();
    x.moveTo(34, 0);
    x.lineTo(34, h);
    x.stroke();
    x.strokeStyle = '#3a3a4a';
    x.lineWidth = 2.5;
    // Some scribbled "handwriting".
    for (let row = 0; row < 5; row++) {
      x.beginPath();
      let px = 42;
      const y = 26 + row * 18;
      x.moveTo(px, y);
      while (px < w - 30 - (row === 4 ? 80 : 0)) {
        px += rand(6, 12);
        x.lineTo(px, y - rand(2, 8));
        px += rand(4, 8);
        x.lineTo(px, y);
      }
      x.stroke();
    }
  });
  const cover = box(0.31, 0.014, 0.23, mat(0xff6b81));
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.21), new THREE.MeshStandardMaterial({ map: pages, roughness: 0.9 }));
  sheet.rotation.x = -Math.PI / 2;
  sheet.position.y = 0.008;
  const rings = mat(0xb0b4bc, { metalness: 0.5, roughness: 0.3 });
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 6, 12), rings);
    r.position.set(-0.145, 0.01, -0.08 + i * 0.04);
    r.rotation.y = Math.PI / 2;
    g.add(r);
  }
  g.add(cover, sheet);
  return g;
}

function pencil() {
  const g = new THREE.Group();
  const body = cyl(0.011, 0.011, 0.15, mat(0xffc93c), 6);
  const tip = cyl(0.0, 0.011, 0.03, mat(0xf2d2a9), 6);
  tip.position.y = -0.09;
  const lead = cyl(0, 0.004, 0.012, mat(0x333333), 6);
  lead.position.y = -0.1;
  const eraser = cyl(0.012, 0.012, 0.025, mat(0xff8fab), 6);
  eraser.position.y = 0.087;
  g.add(body, tip, lead, eraser);
  return g;
}

function controller() {
  const g = new THREE.Group();
  const shell = mat(0x2f3440, { roughness: 0.4 });
  const body = box(0.24, 0.05, 0.1, shell);
  const gripL = cyl(0.04, 0.035, 0.09, shell);
  gripL.rotation.x = Math.PI / 2 - 0.4;
  gripL.position.set(-0.1, -0.02, -0.03);
  const gripR = gripL.clone();
  gripR.position.x = 0.1;
  g.add(body, gripL, gripR);
  const colors = [0x4dabf7, 0xff6b6b, 0x69db7c, 0xffd43b];
  [[0.07, 0.025], [0.095, 0], [0.07, -0.025], [0.045, 0]].forEach(([x, z], i) => {
    const b = cyl(0.011, 0.011, 0.012, mat(colors[i], { roughness: 0.3 }), 10);
    b.position.set(x, 0.03, z);
    g.add(b);
  });
  const stick = cyl(0.017, 0.017, 0.02, mat(0x15171c), 12);
  stick.position.set(-0.06, 0.035, 0);
  const pad = box(0.04, 0.012, 0.012, mat(0x15171c));
  pad.position.set(-0.03, 0.03, -0.025);
  g.add(stick, pad);
  return g;
}

function openBook() {
  const g = new THREE.Group();
  const text = canvasTexture(128, 160, (x, w, h) => {
    x.fillStyle = '#fffaf0';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#8a8a96';
    for (let y = 16; y < h - 10; y += 10) x.fillRect(10, y, w - 20 - (y % 30 === 6 ? 30 : 0), 3);
  });
  const paper = new THREE.MeshStandardMaterial({ map: text, roughness: 0.95, side: THREE.DoubleSide });
  const coverM = mat(0x4263eb);
  for (const s of [-1, 1]) {
    const half = new THREE.Group();
    const cover = box(0.15, 0.008, 0.2, coverM);
    cover.position.x = s * 0.075;
    const page = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.19), paper);
    page.rotation.x = -Math.PI / 2;
    page.position.set(s * 0.072, 0.006, 0);
    half.add(cover, page);
    half.rotation.z = s * -0.18;
    g.add(half);
  }
  // The page that flips over.
  const flip = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.19), paper);
  leaf.rotation.x = -Math.PI / 2;
  leaf.position.set(0.07, 0.008, 0);
  flip.add(leaf);
  g.add(flip);
  g.userData.flip = flip;
  return g;
}

function beret() {
  const g = new THREE.Group();
  const felt = mat(0xe03131, { roughness: 1 });
  const cap = sphere(0.27, felt);
  cap.scale.set(1, 0.32, 1);
  const nub = cyl(0.012, 0.018, 0.04, felt, 8);
  nub.position.y = 0.09;
  g.add(cap, nub);
  g.position.set(0.06, 0.575, -0.03);
  g.rotation.set(-0.12, 0, -0.3);
  return g;
}

function palette() {
  const g = new THREE.Group();
  const board = cyl(0.11, 0.11, 0.012, mat(0xd9a066), 24);
  board.scale.set(1, 1, 0.75);
  g.add(board);
  [0xff6b6b, 0xffd43b, 0x69db7c, 0x4dabf7, 0x9775fa].forEach((c, i) => {
    const blob = sphere(0.018, mat(c, { roughness: 0.4 }));
    const a = -0.4 + i * 0.55;
    blob.position.set(Math.cos(a) * 0.075, 0.01, Math.sin(a) * 0.05);
    blob.scale.y = 0.4;
    g.add(blob);
  });
  return g;
}

function brush() {
  const g = new THREE.Group();
  const handle = cyl(0.008, 0.01, 0.17, mat(0x8b5a2b), 6);
  const ferrule = cyl(0.011, 0.011, 0.025, mat(0xc0c4cc, { metalness: 0.6, roughness: 0.3 }), 8);
  ferrule.position.y = -0.095;
  const tip = cyl(0.0, 0.012, 0.035, mat(0x4dabf7), 8);
  tip.position.y = -0.125;
  tip.rotation.z = Math.PI;
  g.add(handle, ferrule, tip);
  return g;
}

function easel() {
  const g = new THREE.Group();
  const wood = mat(0xb07a46);
  for (const [x, z, rz, rx] of [[-0.14, 0.05, 0.14, -0.08], [0.14, 0.05, -0.14, -0.08], [0, -0.16, 0, 0.3]]) {
    const leg = box(0.03, 0.95, 0.03, wood);
    leg.position.set(x, 0.46, z);
    leg.rotation.set(rx, 0, rz);
    g.add(leg);
  }
  const art = canvasTexture(200, 160, (x, w, h) => {
    x.fillStyle = '#fffdf7';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#bfe3ff';
    x.fillRect(0, 0, w, h * 0.62);
    x.fillStyle = '#8ce99a';
    x.fillRect(0, h * 0.62, w, h);
    x.fillStyle = '#ffd43b';
    x.beginPath();
    x.arc(w * 0.75, h * 0.25, 20, 0, Math.PI * 2);
    x.fill();
    // A little chick, of course.
    x.fillStyle = '#ffd84a';
    x.beginPath();
    x.arc(w * 0.38, h * 0.62, 26, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#222';
    x.beginPath();
    x.arc(w * 0.33, h * 0.58, 3, 0, Math.PI * 2);
    x.arc(w * 0.43, h * 0.58, 3, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#ff922b';
    x.beginPath();
    x.moveTo(w * 0.36, h * 0.64);
    x.lineTo(w * 0.4, h * 0.64);
    x.lineTo(w * 0.38, h * 0.68);
    x.fill();
  });
  const canvas = box(0.42, 0.34, 0.02, new THREE.MeshStandardMaterial({ color: 0xffffff }));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.32), new THREE.MeshStandardMaterial({ map: art, roughness: 0.9 }));
  canvas.position.set(0, 0.72, 0.07);
  face.position.set(0, 0.72, 0.081);
  const ledge = box(0.46, 0.03, 0.06, wood);
  ledge.position.set(0, 0.54, 0.08);
  g.add(canvas, face, ledge);
  return g;
}

// ---------- scenes ----------

/** Shared seated pose: legs out, sitting on a seat SEAT_HEIGHT high. `seated` is 0..1. */
function sit(c, seated) {
  c.target.sit = seated;
  c.target.bodyY = SEAT_HEIGHT * 0.55 * seated;
  c.target.legSwingL = c.target.legSwingR = 1.35 * seated;
}

export const SCENES = {
  video: {
    label: 'movie time',
    seated: true,
    build() {
      return { root: cinemaSeat(), torso: place(popcornBucket(), -0.04, 0.24, 0.32), handR: popcornPiece() };
    },
    glasses: { lenses: [0xff2a3d, 0x2a8cff], frameColor: 0xfafafa },
    pose(c, t, s, parts) {
      c.lookHint = [Math.sin(t * 0.4) * 0.15, 0.18];
      c.target.headPitch = -0.06;
      c.target.armSwingL = 0.75;
      c.target.armRaiseL = 0.15;
      c.target.elbowL = 0.3;
      // Every few seconds: reach into the bucket, pop one in, munch.
      const cycle = 3.4;
      const k = (t % cycle) / cycle;
      const reach = k < 0.18 ? k / 0.18 : 1;
      const lift = k < 0.18 ? 0 : k < 0.38 ? (k - 0.18) / 0.2 : k < 0.5 ? 1 : Math.max(0, 1 - (k - 0.5) / 0.15);
      c.target.armSwingR = 0.6 + 0.35 * reach + 0.85 * lift;
      c.target.armRaiseR = 0.25 * lift;
      c.target.elbowR = 0.4 + 0.5 * lift;
      if (parts.handR) parts.handR.visible = k > 0.16 && k < 0.5;
      const chewing = k > 0.45 && k < 0.85;
      c.overlay.headPitch = chewing ? Math.sin(t * 22) * 0.025 : 0;
      if (chewing && !s.chewFace) c.face.setExpression(Math.random() < 0.5 ? 'uwu' : 'happy');
      s.chewFace = chewing;
      // Exciting scene!
      if (t > (s.nextGasp ??= rand(8, 16))) {
        s.nextGasp = t + rand(10, 20);
        c.face.setExpression(Math.random() < 0.5 ? 'surprised' : 'joy');
        c.emote(Math.random() < 0.5 ? 'exclaim' : 'heart', 0.5);
      }
    },
  },

  writing: {
    label: 'writing',
    seated: true,
    build() {
      const book = place(notebook(), 0.02, 0.17, 0.34);
      book.rotation.x = 0.55;
      const pen = pencil();
      pen.rotation.set(0.9, 0, -0.4);
      return { root: buildChair(), torso: book, handR: pen };
    },
    glasses: {},
    pose(c, t, s) {
      c.target.headPitch = 0.32;
      c.lookHint = [Math.sin(t * 1.3) * 0.2, -0.75];
      c.target.armSwingL = 0.85;
      c.target.elbowL = 0.3;
      // Writing: little loops with the pencil, a pause to think now and then.
      const thinking = pulse(t, 9, 1.8);
      c.target.armSwingR = 0.95 + 0.6 * thinking;
      c.target.armRaiseR = 0.12 + 0.2 * thinking;
      c.overlay.armSwingR = (1 - thinking) * Math.sin(t * 9) * 0.06;
      c.overlay.armRaiseR = (1 - thinking) * Math.cos(t * 9) * 0.05;
      c.overlay.headRoll = thinking * 0.15;
      if (thinking > 0.5 && !s.thought) {
        s.thought = true;
        c.face.setExpression('curious');
        if (Math.random() < 0.4) c.emote('question', 0.5);
      } else if (thinking < 0.1 && s.thought) {
        s.thought = false;
        c.face.setExpression('neutral');
      }
    },
  },

  music: {
    label: 'music',
    seated: false,
    build(mob) {
      return { head: headphones({ fit: mob?.headFit }) };
    },
    pose(c, t, s) {
      const beat = t * Math.PI * 1.8; // ~108 bpm
      c.overlay.bodyY = Math.abs(Math.sin(beat)) * 0.035;
      c.overlay.crouch = Math.max(0, -Math.sin(beat * 2)) * 0.02;
      c.target.headPitch = Math.sin(beat * 2) * 0.12;
      c.target.torsoRoll = Math.sin(beat) * 0.09;
      c.target.headRoll = -Math.sin(beat) * 0.1;
      c.target.armSwingL = 0.35 + Math.sin(beat) * 0.3;
      c.target.armSwingR = 0.35 - Math.sin(beat) * 0.3;
      c.target.armRaiseL = c.target.armRaiseR = 0.3;
      if (t > (s.nextNote ??= 1)) {
        s.nextNote = t + rand(1.6, 3);
        c.emote('note', Math.random() < 0.5 ? -0.6 : 0.6);
        if (Math.random() < 0.3) c.face.setExpression(Math.random() < 0.5 ? 'uwu' : 'happy');
      }
    },
  },

  meeting: {
    label: 'in a call',
    seated: true,
    build(mob) {
      const office = buildOffice();
      office.userData.desk.children.at(-1).visible = false; // no mug in meetings
      return { root: office, head: headphones({ mic: true, fit: mob?.headFit }) };
    },
    pose(c, t, s) {
      c.target.armSwingL = c.target.armSwingR = 0.9;
      c.target.elbowL = c.target.elbowR = 0.25;
      c.lookHint = [0, -0.15];
      // A friendly wave hello, then quiet nodding now and then.
      const hello = t < 2.4 ? Math.sin((t / 2.4) * Math.PI) : 0;
      c.target.armRaiseR += 1.8 * hello;
      c.overlay.wristR = Math.sin(t * 10) * 0.4 * hello;
      c.overlay.headPitch = pulse(t, 6.5, 0.9) * 0.18;
      if (t > (s.nextFace ??= 5)) {
        s.nextFace = t + rand(6, 12);
        c.face.setExpression(Math.random() < 0.6 ? 'neutral' : 'happy');
      }
    },
  },

  gaming: {
    label: 'gaming',
    seated: true,
    build() {
      return { root: buildChair(), torso: place(controller(), 0, 0.26, 0.37) };
    },
    pose(c, t, s) {
      c.target.armSwingL = c.target.armSwingR = 1.0;
      c.target.elbowL = c.target.elbowR = 0.35;
      c.target.torsoPitch = 0.08;
      c.target.headPitch = 0.08;
      c.lookHint = [Math.sin(t * 2.7) * 0.3, 0.05];
      // Button mashing.
      c.overlay.wristL = Math.sin(t * 19) * 0.25;
      c.overlay.wristR = Math.sin(t * 23 + 1) * 0.25;
      c.overlay.torsoRoll = Math.sin(t * 1.7) * 0.06;
      if (t > (s.nextBig ??= rand(6, 11))) {
        s.nextBig = t + rand(8, 15);
        const win = Math.random() < 0.7;
        s.bigUntil = t + 1.2;
        s.win = win;
        c.face.setExpression(win ? 'joy' : 'pouty');
        c.emote(win ? 'sparkle' : 'question', 0.5);
      }
      if (t < (s.bigUntil ?? 0) && s.win) {
        c.target.armRaiseL = c.target.armRaiseR = 1.4;
        c.overlay.bodyY = Math.abs(Math.sin(t * 12)) * 0.04;
      } else if (t >= (s.bigUntil ?? 0) && s.bigUntil) {
        s.bigUntil = 0;
        c.face.setExpression('smug');
      }
    },
  },

  coding: {
    label: 'coding',
    seated: true,
    build() {
      return { root: buildOffice() };
    },
    glasses: {},
    pose(c, t) {
      const burst = 0.6 + 0.4 * Math.sin(t * 0.9);
      c.target.armSwingL = c.target.armSwingR = 1.05;
      c.target.elbowL = c.target.elbowR = 0.35;
      c.overlay.armSwingR = Math.max(0, Math.sin(t * 13)) * 0.2 * burst;
      c.overlay.armSwingL = Math.max(0, Math.sin(t * 14.7 + 1.7)) * 0.2 * burst;
      c.target.headPitch = 0.16;
      c.lookHint = [Math.sin(t * 2.2) * 0.25, -0.55];
    },
  },

  reading: {
    label: 'reading',
    seated: true,
    build() {
      const book = place(openBook(), 0, 0.27, 0.35);
      book.rotation.x = 0.85;
      return { root: buildChair(), torso: book };
    },
    glasses: {},
    pose(c, t, s, parts) {
      c.target.armSwingL = c.target.armSwingR = 0.95;
      c.target.elbowL = c.target.elbowR = 0.3;
      c.target.headPitch = 0.28;
      c.lookHint = [Math.sin(t * 1.6) * 0.3, -0.6];
      // Turn a page every few seconds.
      const k = (t % 7) / 1.1;
      const flip = parts.torso?.userData.flip;
      if (flip) flip.rotation.z = k < 1 ? k * Math.PI : 0;
      c.overlay.armSwingR = k < 1 ? Math.sin(k * Math.PI) * 0.2 : 0;
      if (t > (s.nextFace ??= 4)) {
        s.nextFace = t + rand(5, 10);
        c.face.setExpression(['neutral', 'curious', 'happy', 'surprised'][Math.floor(Math.random() * 4)]);
      }
    },
  },

  drawing: {
    label: 'drawing',
    seated: false,
    build() {
      const e = easel();
      e.position.set(0.62, 0, 0.12);
      e.rotation.y = -0.65;
      const b = brush();
      b.rotation.set(1.2, 0, 0.2);
      const p = palette();
      p.rotation.set(1.35, 0, -0.2); // face the palette towards you, held up on the left
      return { root: e, head: beret(), handR: b, handL: p };
    },
    pose(c, t, s) {
      c.target.headYaw = 0.45;
      c.lookHint = [0.6, 0];
      c.target.torsoYaw = 0.25;
      c.target.armSwingL = 0.6;
      c.target.armRaiseL = 0.4;
      // Brush strokes, then a step back to admire the work.
      const admire = pulse(t, 8, 1.6);
      c.target.armSwingR = 0.85 * (1 - admire) + 0.3 * admire;
      c.target.armRaiseR = 0.55 + Math.sin(t * 6) * 0.25 * (1 - admire);
      c.overlay.wristR = Math.sin(t * 6 + 1) * 0.3 * (1 - admire);
      c.overlay.headRoll = admire * 0.2;
      if (admire > 0.5 && !s.admired) {
        s.admired = true;
        c.face.setExpression('happy');
        c.emote('sparkle', 0.6);
      } else if (admire < 0.1) s.admired = false;
    },
  },
};

function place(obj, x, y, z) {
  obj.position.set(x, y, z);
  return obj;
}
