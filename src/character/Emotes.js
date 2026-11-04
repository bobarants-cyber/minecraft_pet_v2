import * as THREE from 'three';

const GLYPHS = {
  zzz: { char: 'Z', color: [0.5, 0.9, 1.0], intensity: 2.2, size: 0.28, life: 2.6 },
  heart: { char: '♥', color: [1.0, 0.3, 0.55], intensity: 2.6, size: 0.34, life: 1.8 },
  exclaim: { char: '!', color: [0.35, 0.95, 1.0], intensity: 3.2, size: 0.42, life: 1.3 },
  question: { char: '?', color: [0.35, 0.95, 1.0], intensity: 3.0, size: 0.4, life: 2.2 },
  note: { char: '♪', color: [0.45, 0.95, 1.0], intensity: 2.6, size: 0.32, life: 1.8 },
  sparkle: { char: '✦', color: [0.6, 1.0, 1.0], intensity: 3.0, size: 0.32, life: 1.4 },
};

const _anchor = new THREE.Vector3();
const easeOutBack = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;

function makeTexture(char) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 92px "SF Pro Rounded", "Arial Rounded MT Bold", "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'white';
  ctx.shadowBlur = 10;
  ctx.fillStyle = 'white';
  ctx.fillText(char, size / 2, size / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Emotes {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.textures = {};
    this.active = [];
  }

  /** `anchor` (an Object3D) makes the emote travel with the character instead of hanging in the air. */
  spawn(type, origin, scale = 1, side = 0, anchor = null) {
    const g = GLYPHS[type];
    if (!g) return;
    this.textures[type] ??= makeTexture(g.char);
    const material = new THREE.SpriteMaterial({
      map: this.textures[type],
      color: new THREE.Color(...g.color).multiplyScalar(g.intensity * 0.9),
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(origin);
    this.group.add(sprite);
    const offset = anchor ? origin.clone().sub(anchor.getWorldPosition(_anchor)) : null;
    this.active.push({ sprite, type, g, t: 0, origin: origin.clone(), anchor, offset, scale, drift: side || Math.random() - 0.5 });
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.t += dt;
      const k = e.t / e.g.life;
      if (k >= 1) {
        this.group.remove(e.sprite);
        e.sprite.material.dispose();
        this.active.splice(i, 1);
        continue;
      }
      if (e.anchor) e.origin.copy(e.anchor.getWorldPosition(_anchor)).add(e.offset);
      const pop = easeOutBack(Math.min(e.t / 0.25, 1));
      const grow = e.type === 'zzz' ? 0.6 + k * 0.8 : 1;
      const size = e.g.size * e.scale * pop * grow;
      e.sprite.scale.set(size, size, 1);
      e.sprite.position.set(
        e.origin.x + (e.drift * 0.35 * k + Math.sin(e.t * 4) * 0.03) * e.scale,
        e.origin.y + 0.55 * k * e.scale,
        e.origin.z,
      );
      e.sprite.material.rotation = Math.sin(e.t * 3) * 0.15;
      e.sprite.material.opacity = 1 - Math.max(0, (k - 0.6) / 0.4);
    }
  }
}
