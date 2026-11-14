import * as THREE from 'three';
import plushGlb from '../../assets/models/gliddy-plush.glb?url';
import { Skater } from './Skater.js';

/** How many fur layers grow off the body, and how long the longest fur is (in model units; he's ~1.1 tall). */
const SHELLS = 6;
const FUR_LEN = 0.011;

/**
 * Plush Gliddy: the same Gliddy as a soft toy. A huge head (almost twice as tall as his body), a short stout stuffed
 * body, stubby chunky arms with mitten hands and fat boots, a seam down the back of his head and a sewn-in tag; his X, sleepy eyelid and "w" mouth are stitched flat into the fabric (a plushie's face doesn't move),
 * and he's covered in short soft fuzz (fur shells that bend with him) with a velvety sheen.
 */
export class GliddyPlush extends Skater {
  /**
   * Versions: fur (a colour for his tan fur, ears, lid and nose), shirt and tie colours, and mini (a tiny keychain
   * plush with a metal ring on his head). Without options he's the classic orange plush in a white shirt.
   */
  constructor({ fur = null, shirt = null, tie = null, mini = false } = {}) {
    super({ name: 'gliddy-plush', glb: plushGlb });
    this.dyes = { fur, shirt, tie };
    this.mini = mini;
    this.boardBack = new THREE.Vector3(0.02, 0.52, -0.45); // behind his big head, not through it
    this.armCap = 0.95; // his head overhangs his shoulders: raised arms stop out to the side
    this.mouth.visible = false;
    this.parts.ready.then(() => {
      this.#plushify();
      if (mini) this.#keychain();
    });
  }

  /** Recolours the baked vertex colours for this version (only the parts each dye is for). */
  #dye(mesh) {
    const { fur, shirt, tie } = this.dyes;
    if (fur == null && shirt == null && tie == null) return;
    mesh.geometry = mesh.geometry.clone(); // the loaded model may be shared with another Gliddy
    const furLen = mesh.geometry.getAttribute('_fur'), col = mesh.geometry.getAttribute('color');
    const c = new THREE.Color(), hsl = {}, ref = {}, tgt = {};
    new THREE.Color('#eeb27a').getHSL(ref, THREE.SRGBColorSpace); // his tan fur in the classic model
    if (fur != null) new THREE.Color(fur).getHSL(tgt, THREE.SRGBColorSpace);
    for (let i = 0; i < col.count; i++) {
      const f = furLen.getX(i);
      c.setRGB(col.getX(i), col.getY(i), col.getZ(i), THREE.LinearSRGBColorSpace);
      if (shirt != null && Math.abs(f - 0.3) < 0.01) {
        // Shirt, collar and sleeves (fur length 0.3): keep the cloth's own shading so folds and the hem still read.
        const shade = Math.min(1, (col.getX(i) + col.getY(i) + col.getZ(i)) / 3 / 0.85);
        c.set(shirt).multiplyScalar(shade);
      } else if (tie != null && Math.abs(f - 0.15) < 0.01) {
        c.set(tie);
      } else if (fur != null) {
        // Every orange (fur, ears, ear lines, lid, nose) moves to the new colour, keeping how light or dark it was;
        // whites, blacks, the purple eye and the pink tongue aren't orange, so they stay.
        c.getHSL(hsl, THREE.SRGBColorSpace);
        const orange = hsl.s > 0.25 && hsl.h > 0.02 && hsl.h < 0.13 && hsl.l > 0.15 && hsl.l < 0.9;
        if (!orange) continue;
        c.setHSL(tgt.h, Math.min(1, tgt.s * (hsl.s / ref.s)), Math.min(0.95, hsl.l * (tgt.l / ref.l)), THREE.SRGBColorSpace);
      } else continue;
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  /** Mini: a tiny keychain plush, with a ribbon loop sewn on top of his head and a metal key ring through it. */
  #keychain() {
    this.parts.model.scale.multiplyScalar(0.62);
    this.board.scale.multiplyScalar(0.62);
    this.height *= 0.7;
    const metal = new THREE.MeshStandardMaterial({ color: 0xd9dde3, metalness: 1, roughness: 0.22 });
    const ribbon = new THREE.MeshStandardMaterial({ color: 0xd8463a, roughness: 0.8 });
    const g = new THREE.Group();
    g.position.set(-0.11, 0.515, -0.02); // sewn on top of his head, left of the hair tuft (head-bone space, model units)
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 10, 24), ribbon);
    loop.position.y = 0.012;
    loop.rotation.y = Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.0055, 12, 40), metal);
    ring.position.y = 0.075;
    // A few chain links, alternating at right angles, up to a little clasp.
    const link = new THREE.TorusGeometry(0.012, 0.0028, 8, 16);
    for (let k = 0; k < 4; k++) {
      const l = new THREE.Mesh(link, metal);
      l.scale.set(1, 1.6, 1);
      l.position.y = 0.135 + k * 0.03;
      l.rotation.y = k % 2 ? Math.PI / 2 : 0;
      g.add(l);
    }
    const clasp = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 8, 20, Math.PI * 1.6), metal);
    clasp.position.y = 0.265;
    g.add(loop, ring, clasp);
    g.scale.setScalar(1.7); // big enough to read at his small size
    this.parts.head.add(g);
    this.keyring = g;
  }

  #plushify() {
    const meshes = [];
    this.root.traverse((o) => { if (o.isSkinnedMesh && !o.userData.furShell) meshes.push(o); });
    for (const mesh of meshes) {
      const old = mesh.material;
      // Felt/minky fabric: fully matte with a soft sheen where light grazes the fuzz.
      mesh.material = new THREE.MeshPhysicalMaterial({
        vertexColors: true, roughness: 0.92, metalness: 0,
        sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xfff4ea),
      });
      // The sheen takes the fabric's own colour: white sheen on dark fabric glowed between the dark fur strands
      // and read as grey static.
      mesh.material.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
          material.sheenColor *= clamp(vColor.rgb * 1.6, 0.0, 1.0);`);
      };
      old?.dispose?.();
      if (!mesh.geometry.getAttribute('_fur')) continue;
      this.#dye(mesh);
      for (let i = 1; i <= SHELLS; i++) {
        const shell = new THREE.SkinnedMesh(mesh.geometry, furMaterial(i / SHELLS));
        shell.userData.furShell = true;
        shell.frustumCulled = false;
        shell.castShadow = false;
        shell.renderOrder = i;
        shell.bind(mesh.skeleton, mesh.bindMatrix);
        shell.position.copy(mesh.position);
        shell.quaternion.copy(mesh.quaternion);
        shell.scale.copy(mesh.scale);
        mesh.parent.add(shell);
      }
    }
  }
}

/** One fur layer: pushed out along the (skinned) normal, keeping only the strands that reach this high. */
function furMaterial(layer) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLayer = { value: layer };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float _fur;
        uniform float uLayer;
        varying vec3 vFurP;
        varying float vFur;`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        // Fur droops a little as it grows (gravity), so it reads as soft fuzz, not spikes.
        transformed += normalize(objectNormal) * ${FUR_LEN.toFixed(4)} * uLayer * _fur;
        transformed.y -= 0.0025 * uLayer * uLayer * _fur;
        vFurP = position;
        vFur = _fur;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uLayer;
        varying vec3 vFurP;
        varying float vFur;
        float furHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vFur < 0.02) discard;
        // Each strand is a tiny cell with its own height; thinner towards its tip.
        vec3 c = vFurP * 520.0;
        vec3 cell = floor(c);
        float h = furHash(cell);
        float r = length(fract(c) - 0.5);
        if (h < uLayer || r > 0.5 * (1.0 - uLayer * 0.7)) discard;
        // Deeper fur is shadowed by the fur above it.
        diffuseColor.rgb *= mix(0.72, 1.0, uLayer);
        diffuseColor.a = 1.0 - uLayer * 0.35;`);
  };
  return m;
}
