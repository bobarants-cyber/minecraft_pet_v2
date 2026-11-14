import * as THREE from 'three';
import plushGlb from '../../assets/models/gliddy-plush.glb?url';
import { Skater } from './Skater.js';

/** How many fur layers grow off the body, and how long the longest fur is (in model units; he's ~1.1 tall). */
const SHELLS = 6;
const FUR_LEN = 0.011;

/**
 * Plush Gliddy: the same Gliddy as a soft toy. A bigger head, a rounder body, short chunky arms with mitten hands and
 * stubby boots; his X, sleepy eyelid and "w" mouth are stitched flat into the fabric (a plushie's face doesn't move),
 * and he's covered in short soft fuzz (fur shells that bend with him) with a velvety sheen.
 */
export class GliddyPlush extends Skater {
  /** shirt: a colour for his shirt (plush colour versions); the classic one is white. */
  constructor({ shirt = null } = {}) {
    super({ name: 'gliddy-plush', glb: plushGlb });
    this.shirtColor = shirt;
    this.mouth.visible = false;
    this.parts.ready.then(() => this.#plushify());
  }

  #dyeShirt(mesh) {
    mesh.geometry = mesh.geometry.clone(); // the loaded model may be shared with another Gliddy
    const fur = mesh.geometry.getAttribute('_fur'), col = mesh.geometry.getAttribute('color');
    const c = new THREE.Color(this.shirtColor); // linear, like the vertex colours
    for (let i = 0; i < fur.count; i++) {
      if (Math.abs(fur.getX(i) - 0.3) > 0.01) continue;
      // Keep the shirt's own shading (white × shade) so folds and the hem still read.
      const shade = Math.min(1, (col.getX(i) + col.getY(i) + col.getZ(i)) / 3 / 0.85);
      col.setXYZ(i, c.r * shade, c.g * shade, c.b * shade);
    }
    col.needsUpdate = true;
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
      if (this.shirtColor != null) this.#dyeShirt(mesh);
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
