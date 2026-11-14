import { Bee } from '../bee/Bee.js';
import { Axolotl } from '../axolotl/Axolotl.js';
import { Bbokari } from '../bbokari/Bbokari.js';
import { WolfChan } from '../wolfchan/WolfChan.js';
import { Jiniret } from '../jiniret/Jiniret.js';
import { Cortis } from '../cortis/Cortis.js';
import { Skater } from '../skater/Skater.js';
import { GliddyReal } from '../skater/GliddyReal.js';

/** Every mob exposes the same surface: root, joints, face, height, halfWidth, emoteLift, applyPose(), animate(). */
export const MOBS = {
  bee: { label: 'Bee', create: () => new Bee() },
  axolotl: { label: 'Axolotl', create: () => new Axolotl() },
  bbokari: { label: 'Bbokari', create: () => new Bbokari() },
  wolfchan: { label: 'Wolf Chan', create: () => new WolfChan() },
  jiniret: { label: 'Jiniret', create: () => new Jiniret() },
  gliddy: { label: 'Gliddy', create: () => new Skater() },
  gliddyReal: { label: 'Gliddy (realistic)', create: () => new GliddyReal() },
  cortisYellow: { label: 'CORTIS (yellow)', create: () => new Cortis('yellow') },
  cortisWhite: { label: 'CORTIS (white)', create: () => new Cortis('white') },
  cortisBlue: { label: 'CORTIS (blue)', create: () => new Cortis('blue') },
  cortisPink: { label: 'CORTIS (pink)', create: () => new Cortis('pink') },
  cortisGreen: { label: 'CORTIS (green)', create: () => new Cortis('green') },
};

export const MOB_NAMES = Object.keys(MOBS);
export const DEFAULT_MOB = 'bee';

export function createMob(name) {
  return (MOBS[name] ?? MOBS[DEFAULT_MOB]).create();
}

export function nextMob(name) {
  return MOB_NAMES[(MOB_NAMES.indexOf(name) + 1) % MOB_NAMES.length];
}

/** Frees the GPU resources of a mob that has been removed from the scene. */
export function disposeMob(mob) {
  mob.root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    for (const m of [].concat(o.material ?? [])) {
      m.map?.dispose();
      m.dispose();
    }
  });
}
