// Realistic Gliddy's skeleton: the same joints a person has, so he can be posed any way.
//
//   body (hips) → spine → chest → neck → head → ear_L/ear_R, hair
//                         chest → arm_X (shoulder) → fore_X (elbow) → hand_X (wrist) → finger0..3_X, thumb_X
//                         chest → hemF, hemB, hemL, hemR (the shirt's skirt, for cloth that sways)
//   body → leg_X (hip joint) → shin_X (knee) → foot_X (ankle)
//
// X = R for his +x side, L for −x (same naming as the classic rig, so walking/waving code keeps working).
// Weights blend smoothly over every joint (elbows, knees, wrists, spine), so bending looks like flesh, not hinges.
import { ARMS, FINGERS } from './model.mjs';
import { ownPart } from './regions.mjs';

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, k) => a.map((v) => v * k);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / Math.hypot(...a));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Per side: shoulder, elbow, wrist, the hand frame, and where each finger's knuckle is. */
export const ARM_JOINTS = ARMS.map((A, i) => {
  const F = FINGERS[i];
  const v = norm(cross(A.n, A.hu));
  const fingers = [-0.55, -0.18, 0.18, 0.55].map((ang) => add(F.H, add(mul(A.hu, 0.036 * Math.cos(ang)), mul(v, 0.04 * Math.sin(ang)))));
  const thumb = add(F.H, add(mul(A.hu, -0.008), mul(v, 0.042 * A.thumb)));
  return { S: A.S, E: add(A.S, mul(sub(A.W, A.S), 0.5)), W: A.W, H: F.H, hu: A.hu, v, n: A.n, fingers, thumb, side: i === 1 ? 'R' : 'L' };
});
const LEG = { hip: 0.3, knee: 0.256, ankle: 0.2 };

const P = { body: [0, 0.3, 0], spine: [0, 0.37, 0], chest: [0, 0.44, 0], neck: [0, 0.48, 0], head: [0, 0.5, 0] };
P.ear_R = [0.15, 0.82, -0.035];
P.ear_L = [-0.15, 0.82, -0.035];
P.hair = [0.02, 0.83, -0.01];
for (const J of ARM_JOINTS) {
  const s = J.side;
  P[`arm_${s}`] = J.S;
  P[`fore_${s}`] = J.E;
  P[`hand_${s}`] = J.W;
  J.fingers.forEach((k, f) => (P[`finger${f}_${s}`] = k));
  P[`thumb_${s}`] = J.thumb;
}
for (const s of ['R', 'L']) {
  const x = s === 'R' ? 0.05 : -0.05;
  P[`leg_${s}`] = [x, LEG.hip, 0];
  P[`shin_${s}`] = [x * 1.08, LEG.knee, 0];
  P[`foot_${s}`] = [x * 1.16, LEG.ankle, 0];
}
P.hemF = [0, 0.43, 0.06];
P.hemB = [0, 0.43, -0.06];
P.hemR = [0.09, 0.43, 0];
P.hemL = [-0.09, 0.43, 0];
export const PIVOTS = P;

export const PARENTS = {
  spine: 'body', chest: 'spine', neck: 'chest', head: 'neck', ear_R: 'head', ear_L: 'head', hair: 'head',
  hemF: 'chest', hemB: 'chest', hemR: 'chest', hemL: 'chest',
};
for (const s of ['R', 'L']) {
  Object.assign(PARENTS, { [`arm_${s}`]: 'chest', [`fore_${s}`]: `arm_${s}`, [`hand_${s}`]: `fore_${s}`, [`thumb_${s}`]: `hand_${s}` });
  for (let f = 0; f < 4; f++) PARENTS[`finger${f}_${s}`] = `hand_${s}`;
  Object.assign(PARENTS, { [`leg_${s}`]: 'body', [`shin_${s}`]: `leg_${s}`, [`foot_${s}`]: `shin_${s}` });
}

/** Spread weight `w` between two bones by a 0..1 blend. */
function split(out, a, b, t, w = 1) {
  out[a] = (out[a] ?? 0) + w * (1 - t);
  out[b] = (out[b] ?? 0) + w * t;
}

export function weightsAt(p) {
  const { name, d } = ownPart(p);
  const [x, y, z] = p;
  const s = x > 0 ? 'R' : 'L';
  const w = {};
  const torso = (k = 1) => {
    // Lower back follows the spine, the chest area follows the chest, the neck blends into the head.
    if (y > 0.47) split(w, 'chest', 'neck', smooth(0.47, 0.51, y), k);
    else split(w, 'spine', 'chest', smooth(0.36, 0.44, y), k);
  };
  switch (name) {
    case 'ear': case 'earFold': case 'earFuzz': {
      const e = P[`ear_${s}`];
      split(w, 'head', `ear_${s}`, smooth(0.0, 0.05, Math.hypot(x - e[0], y - e[1], z - e[2])));
      break;
    }
    case 'tuft':
      split(w, 'head', 'hair', smooth(0.84, 0.95, y));
      break;
    case 'shirt': case 'tie': case 'collar': {
      // The skirt of the shirt (below the chest) hangs from four cloth bones by direction; above, it's the torso.
      const h = name === 'collar' ? 0 : clamp((0.45 - y) / 0.15, 0, 1) ** 1.3;
      torso(1 - h);
      if (name === 'shirt' && y > 0.36) {
        const k = 0.5 * (1 - clamp(d.sleeve / 0.05, 0, 1)) ** 1.4;
        for (const key of Object.keys(w)) w[key] *= 1 - k;
        w[`arm_${s}`] = (w[`arm_${s}`] ?? 0) + k;
      }
      if (h > 0) {
        const a = Math.atan2(x, z);
        const parts = { hemF: Math.max(0, Math.cos(a)), hemB: Math.max(0, -Math.cos(a)), hemR: Math.max(0, Math.sin(a)), hemL: Math.max(0, -Math.sin(a)) };
        const tot = Object.values(parts).reduce((q, v) => q + v, 0) || 1;
        for (const [k, v] of Object.entries(parts)) w[k] = (w[k] ?? 0) + (h * v) / tot;
      }
      break;
    }
    case 'sleeve': case 'arm': {
      const J = ARM_JOINTS[x > 0 ? 1 : 0];
      const L = Math.hypot(...sub(J.W, J.S));
      const t = dot(sub(p, J.S), norm(sub(J.W, J.S))) / L;
      if (name === 'sleeve') split(w, 'chest', `arm_${s}`, 0.5 + 0.5 * clamp(d.shirt / 0.05, 0, 1) ** 0.7);
      else if (t < 0.1) split(w, 'chest', `arm_${s}`, smooth(-0.15, 0.1, t)); // into the shoulder
      else if (t < 0.75) split(w, `arm_${s}`, `fore_${s}`, smooth(0.38, 0.62, t)); // the elbow
      else split(w, `fore_${s}`, `hand_${s}`, smooth(0.9, 1.05, t)); // the wrist
      break;
    }
    case 'hand': {
      const J = ARM_JOINTS[x > 0 ? 1 : 0];
      const q = sub(p, J.H);
      const along = dot(q, J.hu), across = dot(q, J.v);
      // Thumb: on its side of the palm, past the palm's middle.
      const thumbSide = across * Math.sign(ARMS[x > 0 ? 1 : 0].thumb);
      if (thumbSide > 0.03 && along < 0.03) {
        split(w, `hand_${s}`, `thumb_${s}`, smooth(0.03, 0.045, thumbSide));
        break;
      }
      // Wrist end of the palm blends into the forearm.
      if (along < -0.03) {
        split(w, `fore_${s}`, `hand_${s}`, smooth(-0.06, -0.03, along));
        break;
      }
      // Fingers: the nearest knuckle by angle; beyond the knuckle line the finger bone takes over.
      const ang = Math.atan2(across / 0.04, along / 0.036);
      let f = 0, best = Infinity;
      [-0.55, -0.18, 0.18, 0.55].forEach((a, i) => { if (Math.abs(ang - a) < best) { best = Math.abs(ang - a); f = i; } });
      const r = Math.hypot(along / 0.036, across / 0.04);
      split(w, `hand_${s}`, `finger${f}_${s}`, smooth(0.85, 1.15, r));
      break;
    }
    case 'leg': {
      if (y > LEG.knee + 0.02) w[`leg_${s}`] = 1;
      else split(w, `leg_${s}`, `shin_${s}`, smooth(LEG.knee + 0.018, LEG.knee - 0.012, y));
      break;
    }
    case 'cuff':
      w[`shin_${s}`] = 1;
      break;
    case 'shoe':
      split(w, `shin_${s}`, `foot_${s}`, 1 - smooth(0.17, 0.215, y));
      break;
    default:
      w.head = 1; // the head and its face parts
  }
  return w;
}
