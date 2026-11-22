import * as THREE from 'three';
import { mat } from './Props.js';

/** Things Bbokari can wear on its head (head-bone units: the head top is at about y = 0.645). */
function cyl(rt, rb, h, m, seg = 24) {
  const x = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  x.castShadow = true;
  return x;
}
function ball(r, m) {
  const x = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m);
  x.castShadow = true;
  return x;
}

function stripes(colors) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  colors.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect((i * 128) / colors.length, 0, 128 / colors.length + 1, 64);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const BUILDERS = {
  party() {
    const g = new THREE.Group();
    const cone = cyl(0.0, 0.16, 0.36, new THREE.MeshStandardMaterial({ map: stripes(['#ff6b9a', '#ffd43b', '#4dabf7', '#69db7c', '#ff6b9a', '#ffd43b', '#4dabf7', '#69db7c']), roughness: 0.6 }));
    cone.position.y = 0.18;
    const pom = ball(0.05, mat(0xffffff, { roughness: 1 }));
    pom.position.y = 0.37;
    g.add(cone, pom);
    g.position.set(0.1, 0.6, 0);
    g.rotation.z = -0.3;
    return g;
  },
  crown() {
    const g = new THREE.Group();
    const gold = mat(0xf2c230, { metalness: 0.7, roughness: 0.25 });
    const band = cyl(0.17, 0.17, 0.08, gold, 28);
    band.material.side = THREE.DoubleSide;
    g.add(band);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = cyl(0, 0.035, 0.09, gold, 4);
      spike.position.set(Math.cos(a) * 0.15, 0.08, Math.sin(a) * 0.15);
      const gem = ball(0.02, mat([0xff4d6d, 0x4dabf7, 0x69db7c][i % 3], { roughness: 0.15, metalness: 0.2 }));
      gem.position.set(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17);
      g.add(spike, gem);
    }
    g.position.set(0.02, 0.64, 0);
    g.rotation.z = -0.12;
    return g;
  },
  beanie() {
    const g = new THREE.Group();
    const knit = mat(0x4c6ef5, { roughness: 1 });
    const cap = ball(0.33, knit);
    cap.scale.set(1, 0.6, 1);
    cap.position.y = 0.0;
    const cuff = cyl(0.335, 0.335, 0.08, mat(0x364fc7, { roughness: 1 }), 32);
    cuff.position.y = -0.02;
    const pom = ball(0.07, mat(0xffffff, { roughness: 1 }));
    pom.position.y = 0.22;
    g.add(cap, cuff, pom);
    g.position.set(0, 0.48, -0.01);
    return g;
  },
  /** ❄️ The snow hat: a red knitted hat with a white snowflake band, ear flaps with braids, a fluffy pom-pom and a
   *  little snow sitting on top (worn automatically while it's snowing). */
  snowhat() {
    const g = new THREE.Group();
    const knit = (base, band) => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = base;
      x.fillRect(0, 0, 256, 128);
      // knitted rib: little V stitches
      for (let row = 0; row < 16; row++) for (let col = 0; col < 32; col++) {
        const px = col * 8, py = row * 8;
        x.strokeStyle = 'rgba(0,0,0,0.16)';
        x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + 4, py + 7); x.lineTo(px + 8, py); x.stroke();
        x.strokeStyle = 'rgba(255,255,255,0.10)';
        x.beginPath(); x.moveTo(px + 1, py + 1); x.lineTo(px + 4, py + 5); x.stroke();
      }
      if (band) { // white band with snowflakes
        x.fillStyle = '#f4f6fa';
        x.fillRect(0, 70, 256, 26);
        x.strokeStyle = band;
        x.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
          const cx = 16 + i * 32, cy = 83;
          for (let k = 0; k < 3; k++) {
            const a = (k / 3) * Math.PI;
            x.beginPath(); x.moveTo(cx - Math.cos(a) * 8, cy - Math.sin(a) * 8); x.lineTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8); x.stroke();
          }
        }
        x.fillStyle = '#f4f6fa';
        for (let i = 0; i < 32; i++) { x.fillRect(i * 8 + 2, 60, 4, 4); x.fillRect(i * 8 + 2, 102, 4, 4); }
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      return t;
    };
    const red = new THREE.MeshStandardMaterial({ map: knit('#c8202f', '#c8202f'), roughness: 1 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), red);
    cap.scale.set(1, 0.85, 1);
    cap.castShadow = true;
    // ribbed white cuff
    const ribC = document.createElement('canvas');
    ribC.width = 128; ribC.height = 16;
    const rx = ribC.getContext('2d');
    for (let i = 0; i < 32; i++) { rx.fillStyle = i % 2 ? '#e9edf3' : '#ffffff'; rx.fillRect(i * 4, 0, 4, 16); }
    const ribT = new THREE.CanvasTexture(ribC);
    ribT.colorSpace = THREE.SRGBColorSpace;
    ribT.wrapS = THREE.RepeatWrapping;
    ribT.repeat.set(3, 1);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.045, 10, 40), new THREE.MeshStandardMaterial({ map: ribT, roughness: 1 }));
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = 0.01;
    cuff.castShadow = true;
    // fluffy pom-pom: a lumpy ball
    const pomGeo = new THREE.IcosahedronGeometry(0.085, 3);
    const pos = pomGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      v.multiplyScalar(1 + (Math.sin(v.x * 90) * Math.cos(v.y * 80) * Math.sin(v.z * 70)) * 0.12);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pomGeo.computeVertexNormals();
    const pom = new THREE.Mesh(pomGeo, mat(0xffffff, { roughness: 1 }));
    pom.position.y = 0.33;
    pom.castShadow = true;
    // a little snow on the crown of the hat
    const snowCap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), mat(0xf6f9ff, { roughness: 0.9 }));
    snowCap.scale.set(1.15, 0.45, 1);
    snowCap.position.set(0.04, 0.2, 0.02);
    // ear flaps with braids
    const flapMat = new THREE.MeshStandardMaterial({ map: knit('#c8202f'), roughness: 1 });
    for (const sx of [-1, 1]) {
      const flap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), flapMat);
      flap.scale.set(0.35, 1, 0.8);
      flap.position.set(sx * 0.31, -0.06, 0.02);
      flap.rotation.z = sx * 0.15;
      const braid = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const b = ball(0.022, mat(0xffffff, { roughness: 1 }));
        b.position.set(Math.sin(k * 1.7) * 0.006, -k * 0.035, 0);
        braid.add(b);
      }
      const tassel = ball(0.032, mat(0xffffff, { roughness: 1 }));
      tassel.position.y = -0.16;
      braid.add(tassel);
      braid.position.set(sx * 0.32, -0.15, 0.02);
      g.add(flap, braid);
    }
    g.add(cap, cuff, pom, snowCap);
    g.position.set(0, 0.42, -0.01);
    return g;
  },
  bow() {
    const g = new THREE.Group();
    const pink = mat(0xff5fa2, { roughness: 0.5 });
    for (const s of [-1, 1]) {
      const wing = cyl(0.0, 0.09, 0.16, pink, 4);
      wing.rotation.z = (s * Math.PI) / 2;
      wing.position.x = s * 0.08;
      wing.scale.z = 0.5;
      g.add(wing);
    }
    const knot = ball(0.04, mat(0xe8368f));
    g.add(knot);
    g.position.set(0.2, 0.55, 0.12);
    g.rotation.set(0.3, 0.3, -0.5);
    return g;
  },
  flower() {
    const g = new THREE.Group();
    const petal = mat(0xff8fc8, { roughness: 0.7 });
    for (let i = 0; i < 6; i++) {
      const p = ball(0.045, petal);
      const a = (i / 6) * Math.PI * 2;
      p.scale.set(1, 0.4, 0.7);
      p.position.set(Math.cos(a) * 0.055, 0, Math.sin(a) * 0.055);
      g.add(p);
    }
    const middle = ball(0.035, mat(0xfff3a0));
    middle.position.y = 0.01;
    g.add(middle);
    g.position.set(-0.22, 0.5, 0.15);
    g.rotation.set(1.1, 0, 0.5);
    return g;
  },
};

export const OUTFITS = {
  none: 'None',
  party: '🎉 Party hat',
  crown: '👑 Crown',
  beanie: '🧢 Beanie',
  bow: '🎀 Bow',
  flower: '🌼 Flower',
  sunglasses: '😎 Sunglasses',
  snowhat: '❄️ Snow hat',
};

/** Puts the chosen outfit on the pet (only pets with a head anchor, i.e. Bbokari, can dress up). */
export class Wardrobe {
  constructor() {
    this.cache = {};
    this.current = null;
    this.mob = null;
  }

  wear(mob, name) {
    if (this.mob === mob && this.name === name) return;
    this.current?.removeFromParent();
    if (this.name === 'sunglasses') this.mob?.setGlasses?.(false);
    this.current = null;
    this.mob = mob;
    this.name = name;
    if (!name || name === 'none') return;
    if (name === 'sunglasses') {
      mob.setGlasses?.(true, SUNGLASSES);
      return;
    }
    const a = mob.anchor?.('head');
    if (!a) {
      this.mob = null; // the model is still loading: try again next frame
      return;
    }
    if (!BUILDERS[name]) return;
    // Each pet's head is a different size: a small holder moves and scales the outfit to fit (Wolf Chan's head
    // top is lower, between his ears).
    const holder = new THREE.Group();
    holder.position.set(...(mob.outfitOffset ?? [0, 0, 0]));
    holder.scale.setScalar(mob.outfitScale ?? 1);
    holder.add((this.cache[name] ??= BUILDERS[name]()));
    a.parent.add(holder);
    this.current = holder;
  }

  /** Re-apply after something else took the glasses off (typing, scenes). */
  refresh() {
    if (this.name === 'sunglasses' && this.mob && !this.mob.glasses?.visible) this.mob.setGlasses?.(true, SUNGLASSES);
  }
}

export const SUNGLASSES = { lenses: [0x14141a, 0x14141a], frameColor: 0x111111 };
