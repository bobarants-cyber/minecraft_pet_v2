import * as THREE from 'three';

/**
 * Plush fur by "shell texturing": the same shape drawn several times, each copy a little bigger. Every shell keeps
 * only the spots where a strand reaches that high, and strands get thinner towards their tips, so together the shells
 * look like soft, fuzzy fibres (and the outline goes fuzzy too). The strands are laid out in 3D along each point's
 * direction from the centre, so they line up from shell to shell and never pinch at the poles.
 *
 * Uses the scene's own lights (it's a MeshStandardMaterial with a few lines added), so it shades like everything else.
 */
const cache = new Map();

function shellMaterial({ color, tip, layer, density, seed }) {
  const key = [color, tip, layer.toFixed(3), density, seed].join('|');
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLayer = { value: layer };
    shader.uniforms.uDensity = { value: density };
    shader.uniforms.uSeed = { value: seed };
    shader.uniforms.uTip = { value: new THREE.Color(tip) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFurDir;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFurDir = normalize(position);');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vFurDir;
uniform float uLayer;
uniform float uDensity;
uniform float uSeed;
uniform vec3 uTip;
float furHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7)) + uSeed) * 43758.5453); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 q = vFurDir * uDensity;
  vec3 cell = floor(q);
  // Each cell holds one strand of random length, set off-centre at random.
  float len = 0.45 + 0.55 * furHash(cell);
  vec3 c = cell + 0.5 + (vec3(furHash(cell + 1.3), furHash(cell + 2.7), furHash(cell + 4.1)) - 0.5) * 0.5;
  float d = length(q - c);
  float h = uLayer / len;
  if (uLayer > 0.0 && (h > 1.0 || d > 0.62 * (1.0 - h) + 0.12)) discard;
  // Darker down at the roots, the fibre colour at the tips: that's what makes fur read as soft and deep.
  diffuseColor.rgb = mix(diffuseColor.rgb * 0.62, uTip, clamp(uLayer, 0.0, 1.0)) ;
}`,
      );
  };
  m.customProgramCacheKey = () => 'plush-fur';
  cache.set(key, m);
  return m;
}

/**
 * A fuzzy version of `geometry`: a group of shells. `length` is how long the fur is (world units), `shells` how many
 * layers, `density` how many strands across (per unit of direction), `tip` the colour at the strand tips.
 */
export function furry(geometry, { color, tip = color, length = 0.06, shells = 18, density = 60, seed = 0, castShadow = true }) {
  const g = new THREE.Group();
  geometry.computeBoundingSphere();
  const r = geometry.boundingSphere.radius || 1;
  for (let i = 0; i <= shells; i++) {
    const layer = i / shells;
    const mesh = new THREE.Mesh(geometry, shellMaterial({ color, tip, layer, density, seed }));
    mesh.scale.setScalar(1 + (layer * length) / r);
    mesh.castShadow = castShadow && i === 0;
    mesh.receiveShadow = i === 0;
    mesh.renderOrder = i;
    g.add(mesh);
  }
  return g;
}
