import * as THREE from 'three';

/**
 * Plush fur by "shell texturing": the shape is drawn many times, each copy a little bigger, and every copy keeps only
 * the spots where a strand reaches that high. Strands taper to their tips, so together the shells read as soft fibres
 * and the outline goes fuzzy.
 *
 * What makes it look like a real plush instead of a hedgehog:
 *   • strands lie down: each shell slides a bit further along a combed-down flow (with gentle swirls), so the fur
 *     drapes and overlaps whatever is next to it, the embroidered face included
 *   • clumps: neighbouring strands share a length, so the fur tufts like faux fur
 *   • darker roots, lighter tips
 *   • a colour map and a length mask (both laid out by direction from the centre): the face is drawn into the colour,
 *     and the mask makes the fur short and flat there (satin embroidery), so the fur around it overlaps its edges
 *
 * It's a MeshStandardMaterial with a few lines added, so it shades with the scene's own lights.
 */
export function furry(geometry, opts = {}) {
  const {
    color = 0xffffff,
    tip = null, // strand tip colour (default: the base colour, lightened)
    length = 0.06, // fur length (object units)
    shells = 24,
    density = 70, // strands across, per unit of direction
    seed = 0,
    bend = 0.55, // how far the tips droop, as a fraction of the length
    swirl = 0.6,
    colorMap = null, // CanvasTexture: equirectangular by direction (u = around, v = up)
    maskMap = null, // same layout; red = fur length (0 = flat embroidery)
    map = null, // an ordinary UV texture (e.g. the hat's sprinkles)
    castShadow = true,
  } = opts;
  geometry.computeBoundingSphere();
  const r = geometry.boundingSphere.radius || 1;
  const group = new THREE.Group();
  const tipColor = new THREE.Color(tip ?? color);
  if (tip === null) tipColor.offsetHSL(0, -0.04, 0.06);
  for (let i = 0; i <= shells; i++) {
    const layer = i / shells;
    const m = new THREE.MeshStandardMaterial({ color: colorMap ? 0xffffff : color, roughness: 1, metalness: 0, map });
    if (colorMap) m.defines = { FUR_DIRMAP: '' };
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uLayer: { value: layer },
        uDensity: { value: density },
        uSeed: { value: seed },
        uBend: { value: bend * length },
        uSwirl: { value: swirl },
        uTip: { value: tipColor },
        uHasTip: { value: tip !== null && !colorMap ? 1 : 0 },
        uColorMap: { value: colorMap },
        uMaskMap: { value: maskMap },
      });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFurDir;\nuniform float uLayer;\nuniform float uBend;\nuniform float uSwirl;\nuniform float uSeed;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vec3 fn = normalize(position);
vFurDir = fn;
vec3 g = vec3(0.0, -1.0, 0.0);
vec3 flow = g - dot(g, fn) * fn;
vec3 sw = vec3(sin(fn.y * 7.0 + fn.z * 5.0 + uSeed), sin(fn.z * 6.0 + fn.x * 8.0 + uSeed), sin(fn.x * 5.0 + fn.y * 9.0));
sw -= dot(sw, fn) * fn;
transformed += (flow * 0.8 + sw * uSwirl) * uBend * uLayer * uLayer;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vFurDir;
uniform float uLayer;
uniform float uDensity;
uniform float uSeed;
uniform vec3 uTip;
uniform float uHasTip;
uniform sampler2D uColorMap;
uniform sampler2D uMaskMap;
float furHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7)) + uSeed) * 43758.5453); }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
{
  vec3 d = normalize(vFurDir);
  float mask = 1.0;
#ifdef FUR_DIRMAP
  vec2 fuv = vec2(atan(d.x, d.z) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5);
  diffuseColor.rgb *= pow(texture2D(uColorMap, fuv).rgb, vec3(2.2));
  mask = texture2D(uMaskMap, fuv).r;
#endif
  vec3 q = d * uDensity;
  vec3 cell = floor(q);
  // Strands come in clumps (neighbours share a length), each one a bit different.
  float len = mask * (0.72 + 0.28 * furHash(floor(q / 3.5) + 11.0)) * (0.62 + 0.38 * furHash(cell));
  vec3 c = cell + 0.5 + (vec3(furHash(cell + 1.3), furHash(cell + 2.7), furHash(cell + 4.1)) - 0.5) * 0.6;
  float h = uLayer / max(len, 0.001);
  if (uLayer > 0.0 && (h > 1.0 || length(q - c) > 0.8 * (1.0 - h) + 0.12)) discard;
  // Darker down at the roots, lighter at the tips (flat embroidery stays its own colour).
  vec3 base = diffuseColor.rgb;
  vec3 tipC = uHasTip > 0.5 ? uTip : min(base * 1.18 + 0.02, vec3(1.0));
  diffuseColor.rgb = mix(base * mix(1.0, 0.6, mask), tipC, uLayer);
}`,
        );
    };
    m.customProgramCacheKey = () => `plush-fur-${colorMap ? 'dir' : 'plain'}-${map ? 'map' : ''}`;
    const mesh = new THREE.Mesh(geometry, m);
    mesh.scale.setScalar(1 + (layer * length) / r);
    mesh.castShadow = castShadow && i === 0;
    mesh.receiveShadow = i === 0;
    group.add(mesh);
  }
  return group;
}
