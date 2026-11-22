// Liquid Glass for Bbokari's home screen and screen savers.
// The glass is from Liquid Glass Studio (https://github.com/bobarants-cyber/liquid-glass-studio, a fork of
// Charles Yin's project), MIT License © 2024 Charles Yin: its WebGL passes (background + shadow, two-pass Gaussian
// blur, and the final "step 9" glass pass with refraction, dispersion, fresnel, glare and tint) and its color
// library. Changed for Bbokari: instead of one shape that follows the mouse, every widget is a glass panel (up to
// 24), and panels close together melt into each other with the same smooth-min "merge".
// Plain WebGL2, no build step. Returns null when WebGL2 isn't available (the page then uses CSS glass).

export const GLASS_DEFAULTS = {
  refThickness: 20, refDistance: 0.05, refFactor: 1.4, refDispersion: 7, refFresnelRange: 30, refFresnelHardness: 20, refFresnelFactor: 20,
  glareRange: 30, glareHardness: 20, glareFactor: 90, glareConvergence: 50, glareOppositeFactor: 80, glareAngle: -45,
  blurRadius: 14, blurEdge: true, tint: { r: 255, g: 255, b: 255, a: 0.08 }, shadowExpand: 25, shadowFactor: 15,
  shadowX: 0, shadowY: -10, radius: 30, roundness: 5, merge: 0.05,
};

const MAX_SHAPES = 24;
const MAX_BLUR = 64;
const MAX_PIXELS = 700_000;

const VERTEX = `#version 300 es
in vec4 a_position;
out vec2 v_uv;
void main() {
  v_uv = (a_position.xy + 1.0) * 0.5;
  gl_Position = a_position;
}`;

// Shapes: u_rects[i] = (center x, center y, width, height) in device pixels, GL coordinates (y up);
// u_radii[i] = corner radius in device pixels. Distances are in units of 1 / u_resolution.y, like the original.
const SDF = `
uniform int u_count;
uniform vec4 u_rects[${MAX_SHAPES}];
uniform float u_radii[${MAX_SHAPES}];
uniform float u_roundness;
uniform float u_mergeRate;

float superellipseCornerSDF(vec2 p, float r, float n) {
  p = abs(p);
  float v = pow(pow(p.x, n) + pow(p.y, n), 1.0 / n);
  return v - r;
}

float roundedRectSDF(vec2 p, float width, float height, float cr, float n) {
  vec2 d = abs(p) - vec2(width, height) * 0.5;
  float dist;
  if (d.x > -cr && d.y > -cr) {
    vec2 cornerCenter = sign(p) * (vec2(width, height) * 0.5 - vec2(cr));
    dist = superellipseCornerSDF(p - cornerCenter, cr, n);
  } else {
    dist = min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
  }
  return dist;
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float mainSDF(vec2 p) {
  float d = 1.0;
  for (int i = 0; i < ${MAX_SHAPES}; i++) {
    if (i >= u_count) break;
    vec4 r = u_rects[i];
    float di = roundedRectSDF((p - r.xy) / u_resolution.y, r.z / u_resolution.y, r.w / u_resolution.y,
      min(u_radii[i], min(r.z, r.w) * 0.5) / u_resolution.y, u_roundness);
    d = i == 0 ? di : smin(d, di, u_mergeRate);
  }
  return d;
}
`;

const BG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_dpr;
uniform sampler2D u_bgTexture;
uniform float u_bgTextureRatio;
uniform float u_shadowExpand;
uniform float u_shadowFactor;
uniform vec2 u_shadowPosition;
uniform float u_bakeShadow;
out vec4 fragColor;
${SDF}
vec2 getCoverUV(vec2 uv, float canvasAspect, float textureAspect) {
  if (canvasAspect > textureAspect) {
    float scale = textureAspect / canvasAspect;
    uv.y = uv.y * scale + 0.5 - 0.5 * scale;
  } else {
    float scale = canvasAspect / textureAspect;
    uv.x = uv.x * scale + 0.5 - 0.5 * scale;
  }
  return uv;
}
void main() {
  vec2 u_resolution1x = u_resolution.xy / u_dpr;
  vec2 uv = getCoverUV(v_uv, u_resolution.x / u_resolution.y, u_bgTextureRatio);
  vec3 bgColor = texture(u_bgTexture, vec2(uv.x, 1.0 - uv.y)).rgb;
  float merged = mainSDF(gl_FragCoord.xy - u_shadowPosition * u_dpr);
  float shadow = exp(-1.0 / u_shadowExpand * abs(merged) * u_resolution1x.y) * 0.6 * u_shadowFactor;
  fragColor = vec4(bgColor - vec3(shadow) * u_bakeShadow, 1.0);
}`;

const blurPass = (dir) => `#version 300 es
precision highp float;
#define MAX_BLUR_RADIUS (${MAX_BLUR})
in vec2 v_uv;
uniform sampler2D u_prevPassTexture;
uniform vec2 u_resolution;
uniform int u_blurRadius;
uniform float u_blurWeights[MAX_BLUR_RADIUS + 1];
out vec4 fragColor;
void main() {
  vec2 texelSize = 1.0 / u_resolution;
  vec4 color = texture(u_prevPassTexture, v_uv) * u_blurWeights[0];
  for (int i = 1; i <= MAX_BLUR_RADIUS; ++i) {
    if (i > u_blurRadius) break;
    float w = u_blurWeights[i];
    vec2 offset = ${dir === 'h' ? 'vec2(float(i) * texelSize.x, 0.0)' : 'vec2(0.0, float(i) * texelSize.y)'};
    color += texture(u_prevPassTexture, v_uv + offset) * w;
    color += texture(u_prevPassTexture, v_uv - offset) * w;
  }
  fragColor = color;
}`;

const MAIN = `#version 300 es
precision highp float;
#define PI (3.14159265359)
const float N_R = 1.0 - 0.02;
const float N_G = 1.0;
const float N_B = 1.0 + 0.02;
in vec2 v_uv;
uniform sampler2D u_blurredBg;
uniform sampler2D u_bg;
uniform vec2 u_resolution;
uniform float u_dpr;
uniform vec4 u_tint;
uniform float u_refThickness;
uniform float u_refDistance;
uniform float u_refFactor;
uniform float u_refDispersion;
uniform float u_refFresnelRange;
uniform float u_refFresnelFactor;
uniform float u_refFresnelHardness;
uniform float u_glareRange;
uniform float u_glareConvergence;
uniform float u_glareOppositeFactor;
uniform float u_glareFactor;
uniform float u_glareHardness;
uniform float u_glareAngle;
uniform int u_blurEdge;
uniform int u_transparent;
uniform float u_shadowExpand;
uniform float u_shadowFactor;
uniform vec2 u_shadowPosition;
out vec4 fragColor;
${SDF}
float safeAsin(float x) { return asin(clamp(x, -1.0, 1.0)); }

vec2 getNormal(vec2 p) {
  vec2 h = vec2(max(abs(dFdx(p.x)), 0.0001), max(abs(dFdy(p.y)), 0.0001));
  vec2 grad = vec2(
    mainSDF(p + vec2(h.x, 0.0)) - mainSDF(p - vec2(h.x, 0.0)),
    mainSDF(p + vec2(0.0, h.y)) - mainSDF(p - vec2(0.0, h.y))
  ) / (2.0 * h);
  return grad * 1.414213562 * 1000.0;
}

// --- color library from Liquid Glass Studio (shaders/lib/color.glsl) ---
// Color space conversions: HSV / sRGB / linear RGB / XYZ / Lab / LCH.
// Pure helper functions (no uniforms) — meant to be '#include'd into a shader
// that already declares '#version' and 'precision'.
// LCH stack from https://github.com/Rachmanin0xFF/GLSL-Color-Functions/blob/main/color-functions.glsl

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

//                          0.3127/0.3290  1.0  (1.0-0.3127-0.3290)/0.329
const vec3 D65_WHITE = vec3(0.95045592705, 1.0, 1.08905775076);
//                          0.3457/0.3585  1.0  (1.0-0.3457-0.3585)/0.3585
const vec3 D50_WHITE = vec3(0.96429567643, 1.0, 0.82510460251);
vec3 WHITE = D65_WHITE;
const mat3 RGB_TO_XYZ_M = mat3(
  0.4124, 0.3576, 0.1805,
  0.2126, 0.7152, 0.0722,
  0.0193, 0.1192, 0.9505
);
const mat3 XYZ_TO_XYZ50_M = mat3(
   1.0479298208405488  ,  0.022946793341019088, -0.05019222954313557 ,
   0.029627815688159344,  0.990434484573249   , -0.01707382502938514 ,
  -0.009243058152591178,  0.015055144896577895,  0.7518742899580008
);
const mat3 XYZ_TO_RGB_M = mat3(
   3.2406255, -1.537208 , -0.4986286,
  -0.9689307,  1.8757561,  0.0415175,
   0.0557101, -0.2040211,  1.0569959
);
const mat3 XYZ50_TO_XYZ_M = mat3(
   0.9554734527042182  , -0.023098536874261423,  0.0632593086610217  ,
  -0.028369706963208136,  1.0099954580058226  ,  0.021041398966943008,
   0.012314001688319899, -0.020507696433477912,  1.3303659366080753
);
float UNCOMPAND_SRGB(float a) {
  return a > 0.04045
    ? pow((a + 0.055) / 1.055, 2.4)
    : a / 12.92;
}
float COMPAND_RGB(float a) {
  return a <= 0.0031308
    ? 12.92 * a
    : 1.055 * pow(a, 0.41666666666) - 0.055;
}
vec3 RGB_TO_XYZ(vec3 rgb) {
  return WHITE == D65_WHITE
    ? rgb * RGB_TO_XYZ_M
    : rgb * RGB_TO_XYZ_M * XYZ_TO_XYZ50_M;
}
vec3 SRGB_TO_RGB(vec3 srgb) {
  return vec3(UNCOMPAND_SRGB(srgb.x), UNCOMPAND_SRGB(srgb.y), UNCOMPAND_SRGB(srgb.z));
}
vec3 RGB_TO_SRGB(vec3 rgb) {
  return vec3(COMPAND_RGB(rgb.x), COMPAND_RGB(rgb.y), COMPAND_RGB(rgb.z));
}
vec3 SRGB_TO_XYZ(vec3 srgb) {
  return RGB_TO_XYZ(SRGB_TO_RGB(srgb));
}
float XYZ_TO_LAB_F(float x) {
  //          (24/116)^3                         1/(3*(6/29)^2)     4/29
  return x > 0.00885645167
    ? pow(x, 0.333333333)
    : 7.78703703704 * x + 0.13793103448;
}
vec3 XYZ_TO_LAB(vec3 xyz) {
  vec3 xyz_scaled = xyz / WHITE;
  xyz_scaled = vec3(
    XYZ_TO_LAB_F(xyz_scaled.x),
    XYZ_TO_LAB_F(xyz_scaled.y),
    XYZ_TO_LAB_F(xyz_scaled.z)
  );
  return vec3(
    116.0 * xyz_scaled.y - 16.0,
    500.0 * (xyz_scaled.x - xyz_scaled.y),
    200.0 * (xyz_scaled.y - xyz_scaled.z)
  );
}
vec3 SRGB_TO_LAB(vec3 srgb) {
  return XYZ_TO_LAB(SRGB_TO_XYZ(srgb));
}
vec3 LAB_TO_LCH(vec3 Lab) {
  return vec3(Lab.x, sqrt(dot(Lab.yz, Lab.yz)), atan(Lab.z, Lab.y) * 57.2957795131);
}
vec3 SRGB_TO_LCH(vec3 srgb) {
  return LAB_TO_LCH(SRGB_TO_LAB(srgb));
}
vec3 XYZ_TO_RGB(vec3 xyz) {
  return WHITE == D65_WHITE
    ? xyz * XYZ_TO_RGB_M
    : xyz * XYZ50_TO_XYZ_M * XYZ_TO_RGB_M;
}
vec3 XYZ_TO_SRGB(vec3 xyz) {
  return RGB_TO_SRGB(XYZ_TO_RGB(xyz));
}
float LAB_TO_XYZ_F(float x) {
  //                                     3*(6/29)^2         4/29
  return x > 0.206897
    ? x * x * x
    : 0.12841854934 * (x - 0.137931034);
}
vec3 LAB_TO_XYZ(vec3 Lab) {
  float w = (Lab.x + 16.0) / 116.0;
  return WHITE *
  vec3(LAB_TO_XYZ_F(w + Lab.y / 500.0), LAB_TO_XYZ_F(w), LAB_TO_XYZ_F(w - Lab.z / 200.0));
}
vec3 LAB_TO_SRGB(vec3 lab) {
  return XYZ_TO_SRGB(LAB_TO_XYZ(lab));
}
vec3 LCH_TO_LAB(vec3 LCh) {
  return vec3(LCh.x, LCh.y * cos(LCh.z * 0.01745329251), LCh.y * sin(LCh.z * 0.01745329251));
}
vec3 LCH_TO_SRGB(vec3 lch) {
  return LAB_TO_SRGB(LCH_TO_LAB(lch));
}


float vec2ToAngle(vec2 v) {
  float angle = atan(v.y, v.x);
  if (angle < 0.0) angle += 2.0 * PI;
  return angle;
}

vec4 getTextureDispersion(sampler2D tex1, sampler2D tex2, float mixRate, vec2 offset, float factor) {
  vec4 pixel = vec4(1.0);
  float bgR = texture(tex1, v_uv + offset * (1.0 - (N_R - 1.0) * factor)).r;
  float bgG = texture(tex1, v_uv + offset * (1.0 - (N_G - 1.0) * factor)).g;
  float bgB = texture(tex1, v_uv + offset * (1.0 - (N_B - 1.0) * factor)).b;
  float blurR = texture(tex2, v_uv + offset * (1.0 - (N_R - 1.0) * factor)).r;
  float blurG = texture(tex2, v_uv + offset * (1.0 - (N_G - 1.0) * factor)).g;
  float blurB = texture(tex2, v_uv + offset * (1.0 - (N_B - 1.0) * factor)).b;
  pixel.r = mix(bgR, blurR, mixRate);
  pixel.g = mix(bgG, blurG, mixRate);
  pixel.b = mix(bgB, blurB, mixRate);
  return pixel;
}

void main() {
  vec2 u_resolution1x = u_resolution.xy / u_dpr;
  float merged = mainSDF(gl_FragCoord.xy);
  vec4 outColor;
  if (merged < 0.005) {
    float nmerged = -1.0 * (merged * u_resolution1x.y);
    float x_R_ratio = 1.0 - nmerged / u_refThickness;
    float thetaI = safeAsin(pow(x_R_ratio, 2.0));
    float thetaT = safeAsin(1.0 / u_refFactor * sin(thetaI));
    float edgeFactor = -1.0 * tan(thetaT - thetaI);
    if (nmerged >= u_refThickness) edgeFactor = 0.0;

    if (edgeFactor <= 0.0) {
      outColor = texture(u_blurredBg, v_uv);
      outColor = mix(outColor, vec4(u_tint.r, u_tint.g, u_tint.b, 1.0), u_tint.a * 0.8);
    } else {
      float edgeH = nmerged / u_refThickness;
      vec2 normal = getNormal(gl_FragCoord.xy);
      vec4 blurredPixel = getTextureDispersion(
        u_bg, u_blurredBg, u_blurEdge > 0 ? 1.0 : edgeH,
        -normal * edgeFactor * u_refDistance * u_dpr * vec2(u_resolution.y / (u_resolution1x.x * u_dpr), 1.0),
        u_refDispersion
      );
      outColor = mix(blurredPixel, vec4(u_tint.r, u_tint.g, u_tint.b, 1.0), u_tint.a * 0.8);

      float fresnelFactor = clamp(pow(1.0 + merged * u_resolution1x.y / 1500.0 * pow(500.0 / u_refFresnelRange, 2.0) + u_refFresnelHardness, 5.0), 0.0, 1.0);
      vec3 fresnelTintLCH = SRGB_TO_LCH(mix(vec3(1.0), vec3(u_tint.r, u_tint.g, u_tint.b), u_tint.a * 0.5));
      fresnelTintLCH.x += 20.0 * fresnelFactor * u_refFresnelFactor;
      fresnelTintLCH.x = clamp(fresnelTintLCH.x, 0.0, 100.0);
      outColor = mix(outColor, vec4(LCH_TO_SRGB(fresnelTintLCH), 1.0), fresnelFactor * u_refFresnelFactor * 0.7 * length(normal));

      float glareGeoFactor = clamp(pow(1.0 + merged * u_resolution1x.y / 1500.0 * pow(500.0 / u_glareRange, 2.0) + u_glareHardness, 5.0), 0.0, 1.0);
      float glareAngle = (vec2ToAngle(normalize(normal)) - PI / 4.0 + u_glareAngle) * 2.0;
      int glareFarside = 0;
      if (glareAngle > PI * (2.0 - 0.5) && glareAngle < PI * (4.0 - 0.5) || glareAngle < PI * (0.0 - 0.5)) glareFarside = 1;
      float glareAngleFactor = (0.5 + sin(glareAngle) * 0.5) * (glareFarside == 1 ? 1.2 * u_glareOppositeFactor : 1.2) * u_glareFactor;
      glareAngleFactor = clamp(pow(glareAngleFactor, 0.1 + u_glareConvergence * 2.0), 0.0, 1.0);
      vec3 glareTintLCH = SRGB_TO_LCH(mix(blurredPixel.rgb, vec3(u_tint.r, u_tint.g, u_tint.b), u_tint.a * 0.5));
      glareTintLCH.x += 150.0 * glareAngleFactor * glareGeoFactor;
      glareTintLCH.y += 30.0 * glareAngleFactor * glareGeoFactor;
      glareTintLCH.x = clamp(glareTintLCH.x, 0.0, 120.0);
      outColor = mix(outColor, vec4(LCH_TO_SRGB(glareTintLCH), 1.0), glareAngleFactor * glareGeoFactor * length(normal));
    }
  } else {
    outColor = texture(u_bg, v_uv);
  }
  vec4 outside = texture(u_bg, v_uv);
  if (u_transparent == 1) { // only the glass is drawn here; the sharp wallpaper is a layer underneath
    float sm = mainSDF(gl_FragCoord.xy - u_shadowPosition * u_dpr);
    float shadow = exp(-1.0 / u_shadowExpand * abs(sm) * u_resolution1x.y) * 0.6 * u_shadowFactor;
    outside = vec4(0.0, 0.0, 0.0, clamp(shadow, 0.0, 0.6));
    if (merged >= 0.005) outColor = outside;
  }
  outColor = mix(outColor, outside, smoothstep(-0.001, 0.001, merged));
  fragColor = outColor;
}`;

/** Liquid Glass Studio's blur kernel (utils/index.ts). */
function gaussianKernel(radius) {
  const sigma = radius / 3.0;
  const k = [];
  let sum = 0;
  for (let i = 0; i <= radius; i++) {
    const w = Math.exp(-0.5 * (i * i) / (sigma * sigma));
    k.push(w);
    sum += i === 0 ? w : w * 2;
  }
  return k.map((w) => w / sum);
}

/**
 * new LiquidGlass(canvas) → renderer, or null if WebGL2 is missing.
 *   setBackground(source)  an <img>, <canvas> or <video> (call again each frame for moving wallpapers)
 *   setShapes([{x, y, w, h, r}])  CSS pixels from the canvas's top-left; r = corner radius (optional)
 *   setParams({...GLASS_DEFAULTS})
 *   render()
 */
export function createLiquidGlass(canvas, { transparent = false } = {}) {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, alpha: true });
  if (!gl) return null;
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; canvas.dispatchEvent(new Event('glass-lost')); });
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = (fs) => {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a_position');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const loc = {};
    return { p, u: (n) => (n in loc ? loc[n] : (loc[n] = gl.getUniformLocation(p, n))) };
  };
  let progs;
  try {
    progs = { bg: program(BG), h: program(blurPass('h')), v: program(blurPass('v')), main: program(MAIN) };
  } catch (e) {
    console.warn('Liquid glass shaders failed:', e);
    return null;
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const makeTex = () => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const bgTex = makeTex();
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([40, 60, 110, 255]));
  let bgRatio = 1;
  const targets = [0, 1, 2].map(() => ({ tex: makeTex(), fb: gl.createFramebuffer(), w: 0, h: 0 }));
  const sizeTarget = (t, w, h) => {
    if (t.w === w && t.h === h) return;
    t.w = w; t.h = h;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
  };

  let params = { ...GLASS_DEFAULTS };
  let shapes = [];

  const setShapeUniforms = (pr, dpr, H) => {
    const n = Math.min(shapes.length, MAX_SHAPES);
    const rects = new Float32Array(MAX_SHAPES * 4);
    const radii = new Float32Array(MAX_SHAPES);
    for (let i = 0; i < n; i++) {
      const s = shapes[i];
      rects.set([(s.x + s.w / 2) * dpr, H - (s.y + s.h / 2) * dpr, s.w * dpr, s.h * dpr], i * 4);
      radii[i] = (s.r ?? params.radius) * dpr;
    }
    gl.uniform1i(pr.u('u_count'), n);
    gl.uniform4fv(pr.u('u_rects'), rects);
    gl.uniform1fv(pr.u('u_radii'), radii);
    gl.uniform1f(pr.u('u_roundness'), params.roundness);
    gl.uniform1f(pr.u('u_mergeRate'), params.merge);
  };

  const draw = (pr, target, W, H) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(pr.p);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
  const bindTex = (pr, name, tex, unit) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(pr.u(name), unit);
  };

  return {
    setBackground(src) {
      const w = src.videoWidth || src.naturalWidth || src.width;
      const h = src.videoHeight || src.naturalHeight || src.height;
      if (!w || !h) return;
      gl.bindTexture(gl.TEXTURE_2D, bgTex);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); bgRatio = w / h; } catch (e) { console.warn(e); }
    },
    setShapes(list) { shapes = list; },
    setParams(p) { params = { ...GLASS_DEFAULTS, ...p, tint: { ...GLASS_DEFAULTS.tint, ...(p?.tint ?? {}) } }; },
    render() {
      if (lost) return;
      // Drawn at a capped resolution (about 0.7 million pixels): full Retina size is far too much work for the
      // graphics chip (it gets reset and the window dies), and the glass is blurry anyway. Text stays sharp (it's HTML).
      const cssW = canvas.clientWidth || 1, cssH = canvas.clientHeight || 1;
      const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_PIXELS / (cssW * cssH)));
      const W = Math.max(1, Math.round(cssW * dpr));
      const H = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      targets.forEach((t) => sizeTarget(t, W, H));
      const res = [W, H];
      const P = params;

      // 1) background (cover-fit wallpaper) with the panels' soft shadow
      let pr = progs.bg;
      gl.useProgram(pr.p);
      gl.uniform2fv(pr.u('u_resolution'), res);
      gl.uniform1f(pr.u('u_dpr'), dpr);
      gl.uniform1f(pr.u('u_bgTextureRatio'), bgRatio);
      gl.uniform1f(pr.u('u_shadowExpand'), P.shadowExpand);
      gl.uniform1f(pr.u('u_shadowFactor'), P.shadowFactor / 100);
      gl.uniform2fv(pr.u('u_shadowPosition'), [P.shadowX, P.shadowY]);
      gl.uniform1f(pr.u('u_bakeShadow'), transparent ? 0 : 1);
      setShapeUniforms(pr, dpr, H);
      bindTex(pr, 'u_bgTexture', bgTex, 0);
      draw(pr, targets[0], W, H);

      // 2) blur it (horizontal, then vertical)
      const radius = Math.max(1, Math.min(MAX_BLUR, Math.round(P.blurRadius * dpr))); // the slider is in screen points
      const weights = new Float32Array(MAX_BLUR + 1);
      weights.set(gaussianKernel(radius));
      for (const [key, from, to] of [['h', 0, 1], ['v', 1, 2]]) {
        pr = progs[key];
        gl.useProgram(pr.p);
        gl.uniform2fv(pr.u('u_resolution'), res);
        gl.uniform1i(pr.u('u_blurRadius'), radius);
        gl.uniform1fv(pr.u('u_blurWeights'), weights);
        bindTex(pr, 'u_prevPassTexture', targets[from].tex, 0);
        draw(pr, targets[to], W, H);
      }

      // 3) the glass
      pr = progs.main;
      gl.useProgram(pr.p);
      gl.uniform2fv(pr.u('u_resolution'), res);
      gl.uniform1f(pr.u('u_dpr'), dpr);
      setShapeUniforms(pr, dpr, H);
      const t = P.tint;
      gl.uniform4fv(pr.u('u_tint'), [t.r / 255, t.g / 255, t.b / 255, t.a]);
      gl.uniform1f(pr.u('u_refThickness'), P.refThickness);
      gl.uniform1f(pr.u('u_refDistance'), P.refDistance);
      gl.uniform1f(pr.u('u_refFactor'), P.refFactor);
      gl.uniform1f(pr.u('u_refDispersion'), P.refDispersion);
      gl.uniform1f(pr.u('u_refFresnelRange'), P.refFresnelRange);
      gl.uniform1f(pr.u('u_refFresnelHardness'), P.refFresnelHardness / 100);
      gl.uniform1f(pr.u('u_refFresnelFactor'), P.refFresnelFactor / 100);
      gl.uniform1f(pr.u('u_glareRange'), P.glareRange);
      gl.uniform1f(pr.u('u_glareHardness'), P.glareHardness / 100);
      gl.uniform1f(pr.u('u_glareConvergence'), P.glareConvergence / 100);
      gl.uniform1f(pr.u('u_glareOppositeFactor'), P.glareOppositeFactor / 100);
      gl.uniform1f(pr.u('u_glareFactor'), P.glareFactor / 100);
      gl.uniform1f(pr.u('u_glareAngle'), (P.glareAngle * Math.PI) / 180);
      gl.uniform1i(pr.u('u_blurEdge'), P.blurEdge ? 1 : 0);
      gl.uniform1i(pr.u('u_transparent'), transparent ? 1 : 0);
      gl.uniform1f(pr.u('u_shadowExpand'), P.shadowExpand);
      gl.uniform1f(pr.u('u_shadowFactor'), P.shadowFactor / 100);
      gl.uniform2fv(pr.u('u_shadowPosition'), [P.shadowX, P.shadowY]);
      bindTex(pr, 'u_bg', targets[0].tex, 0);
      bindTex(pr, 'u_blurredBg', targets[2].tex, 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      draw(pr, null, W, H);
    },
  };
}
