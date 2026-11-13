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
