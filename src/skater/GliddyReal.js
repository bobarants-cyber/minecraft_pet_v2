import * as THREE from 'three';
import realGlb from '../../assets/models/gliddy-real.glb?url';
import { Skater } from './Skater.js';
import { ARM_JOINTS } from '../../scripts/skater/rig-real.mjs';
import { HEAD, JOWL } from '../../scripts/skater/model.mjs';
import { POSES, JOINTS, sideBone } from './poses.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const deg = Math.PI / 180;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const Z = new THREE.Vector3(0, 0, 1);

/** A damped spring (for cloth, ears and hair that lag behind and settle). */
class Spring {
  constructor(k = 60, damp = 8) {
    this.k = k;
    this.d = damp;
    this.x = 0;
    this.v = 0;
  }
  step(target, dt) {
    this.v += ((target - this.x) * this.k - this.v * this.d) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

/**
 * Realistic Gliddy: the same sculpt with a creased shirt and a full human-like skeleton (scripts/skater/rig-real.mjs).
 * Every joint moves: the spine and chest breathe and lean, the neck shares the head's turn, elbows and knees bend,
 * wrists and every finger move, ears and hair lag behind his movement, and the shirt's skirt swings on four cloth
 * springs (it flares out the way he turns and bounces when he hops).
 *
 * You can pose him any way (setPose: a named pose or joint angles), and he never puts a hand through his head or body:
 * after posing, any hand that would end up inside his head or torso pushes its arm back out.
 */
export class GliddyReal extends Skater {
  constructor() {
    super({ name: 'gliddy-real', glb: realGlb });
    this.time = 0;
    this.pose = null;
    this.custom = null; // { joints: {name: [x,y,z] radians}, w: 0..1, target: 0|1, until }
    this.cloth = { F: new Spring(70, 7), B: new Spring(70, 7), L: new Spring(70, 7), R: new Spring(70, 7) };
    this.earS = [new Spring(90, 9), new Spring(90, 9)];
    this.hairS = new Spring(55, 6);
    this.lastX = null;
    this.lastVX = 0;
    this.lastYaw = 0;
    this.parts.ready.then(() => {
      const B = this.parts.bones;
      this.B = B;
      // Hinge axes in each bone's own space (the bind pose has no rotation, so model axes are bone axes).
      this.axes = {};
      for (const J of ARM_JOINTS) {
        const s = J.side;
        const u = new THREE.Vector3(...J.W).sub(new THREE.Vector3(...J.S)).normalize();
        this.axes[`elbow_${s}`] = new THREE.Vector3().crossVectors(u, Z).normalize(); // + bends the forearm forward
        this.axes[`curl_${s}`] = new THREE.Vector3(...J.n).cross(new THREE.Vector3(...J.hu)).normalize(); // − curls
        this.axes[`hu_${s}`] = new THREE.Vector3(...J.hu);
        this.axes[`palm_${s}`] = new THREE.Vector3(...J.n);
      }
      this.handBones = ['R', 'L'].map((s) => B[`hand_${s}`]);
      // How far each arm already hangs out to the side and forward at rest (ARMS[0] is −x, ARMS[1] is +x).
      this.restArm = [0, 1].map((i) => {
        const J = ARM_JOINTS.find((j) => j.side === (i === 1 ? 'R' : 'L'));
        const d = new THREE.Vector3(...J.W).sub(new THREE.Vector3(...J.S));
        return { out: Math.atan2(Math.abs(d.x), -d.y), fwd: Math.atan2(d.z, -d.y) };
      });
    });
  }

  /** Strike a pose: a name from POSES, or { joint: [x, y, z] degrees }. hold = seconds (0 = until relax()). */
  setPose(spec, hold = 0) {
    const joints = typeof spec === 'string' ? POSES[spec]?.joints : spec;
    if (!joints) return false;
    const rad = {};
    for (const [k, v] of Object.entries(joints)) rad[k] = (Array.isArray(v) ? v : [v, 0, 0]).map((a) => a * deg);
    this.custom = { joints: rad, w: this.custom?.w ?? 0, target: 1, until: hold ? this.time + hold : Infinity };
    return true;
  }

  relax() {
    if (this.custom) this.custom.target = 0;
  }

  applyPose(p, breath = 0) {
    super.applyPose(p, breath);
    if (!this.B) return;
    const B = this.B;
    const t = this.time;
    const r = this.ride ?? 0;

    // Spine and chest: breathing, a little of the lean, and a relaxed sway.
    B.spine.rotation.set(p.torsoPitch * 0.3 + (this.lean ?? 0) * 0.2, 0, Math.sin(t * 0.6) * 0.015);
    B.chest.rotation.set(-breath * 0.012 + p.torsoPitch * 0.2, p.torsoYaw * 0.3, 0);
    B.chest.scale.set(1 + breath * 0.006, 1 + breath * 0.004, 1 + breath * 0.01);

    // Elbows bend softly (more when raising or swinging), wrists follow through.
    for (const s of ['R', 'L']) {
      const raise = p[`armRaise${s}`] ?? 0, swing = p[`armSwing${s}`] ?? 0, elbow = p[`elbow${s}`] ?? 0, wrist = p[`wrist${s}`] ?? 0;
      const bend = 0.18 + elbow * 1.1 + Math.abs(swing) * 0.35 + clamp(raise, 0, 2.5) * 0.12 + r * 0.25;
      B[`fore_${s}`].quaternion.setFromAxisAngle(this.axes[`elbow_${s}`], bend);
      B[`hand_${s}`].quaternion.setFromAxisAngle(this.axes[`elbow_${s}`], wrist * 0.5 + Math.sin(t * 0.9 + (s === 'R' ? 0 : 2)) * 0.03);
    }

    // Knees and ankles: a natural bend when standing, deeper in a crouch, and they flex through each step.
    for (const s of ['R', 'L']) {
      const phase = this.walkPhase + (s === 'R' ? 0 : Math.PI);
      const step = Math.max(0, Math.sin(phase)) * 0.6 * (this.walkAmount ?? 0) * (1 - r);
      const knee = 0.08 + p.crouch * 3 + step + r * 0.3 + (p[`knee${s}`] ?? 0);
      B[`shin_${s}`].rotation.set(knee, 0, 0);
      B[`foot_${s}`].rotation.set(-knee * 0.6, 0, 0);
    }

  }

  #applyCustom() {
    const c = this.custom;
    for (const [name, a] of Object.entries(c.joints)) {
      const J = JOINTS[name];
      if (!J) continue;
      if (J.kind === 'reach') {
        this.#reach(J.side, a.map((v) => v / deg), c.w); // (setPose turned everything into radians; undo that)
        continue;
      }
      const bone = this.B[J.bone];
      if (!bone) continue;
      _q.copy(bone.quaternion);
      if (J.kind === 'hinge') _q2.setFromAxisAngle(this.axes[J.axis], a[0] * (J.sign ?? 1));
      else if (J.kind === 'curl') _q2.setFromAxisAngle(this.axes[J.axis], -a[0]);
      else {
        let [ax, ay, az] = a;
        // Shoulder angles count from straight down; his arms rest a little out and forward, so take that off.
        if (J.arm !== undefined) {
          ax -= this.restArm[J.arm].fwd;
          az -= this.restArm[J.arm].out;
        }
        _q2.setFromEuler(_e.set(ax * (J.mx ?? 1), ay * (J.my ?? 1), az * (J.mz ?? 1), J.order ?? 'XYZ'));
      }
      bone.quaternion.slerpQuaternions(_q, _q2, c.w);
      if (J.fingers) {
        // "fingers" curls all four fingers and the thumb a bit.
        const s = J.side;
        for (let f = 0; f < 4; f++) this.B[`finger${f}_${s}`]?.quaternion.slerp(_q2.setFromAxisAngle(this.axes[`curl_${s}`], -a[0] * (1 - f * 0.05)), c.w);
        this.B[`thumb_${s}`]?.quaternion.slerp(_q2.setFromAxisAngle(this.axes[`hu_${s}`], a[0] * 0.5 * (s === 'R' ? -1 : 1)), c.w);
      }
    }
  }

  /**
   * Two-bone reach: bend the shoulder and elbow so his wrist lands on `target` (model space), with the elbow pointing
   * down and out like a person's. Blends in by w.
   */
  #reach(side, target, w) {
    const i = side === 'R' ? 1 : 0;
    const J = ARM_JOINTS.find((j) => j.side === side);
    const model = this.parts.model;
    const arm = this.B[`arm_${side}`], fore = this.B[`fore_${side}`];
    const S = new THREE.Vector3(...J.S), Wr = new THREE.Vector3(...J.W);
    const L1 = new THREE.Vector3(...J.E).distanceTo(S), L2 = Wr.distanceTo(new THREE.Vector3(...J.E));
    const T = new THREE.Vector3(...target);
    let d = T.clone().sub(S);
    const dist = clamp(d.length(), 0.02, L1 + L2 - 1e-4);
    d.setLength(dist);
    // Elbow on the circle where the two bones meet, pushed towards a pole (down, out to his side, a little back).
    const pole = new THREE.Vector3((side === 'R' ? 1 : -1) * 0.6, -1, -0.2).normalize();
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const dn = d.clone().normalize();
    const perp = pole.clone().sub(dn.clone().multiplyScalar(pole.dot(dn))).normalize();
    const E = S.clone().add(dn.clone().multiplyScalar(a)).add(perp.multiplyScalar(h));
    const W = S.clone().add(d);
    // Rest directions (bind pose: both bones point from shoulder to wrist).
    const rest = Wr.clone().sub(S).normalize();
    // Model → the arm's parent space.
    model.updateWorldMatrix(true, false);
    const qModel = model.getWorldQuaternion(new THREE.Quaternion());
    const qParent = arm.parent.getWorldQuaternion(new THREE.Quaternion());
    const toParent = qParent.clone().invert().multiply(qModel);
    const up = E.clone().sub(S).normalize().applyQuaternion(toParent);
    _q.setFromUnitVectors(rest, up);
    arm.quaternion.slerp(_q, w);
    arm.updateWorldMatrix(false, false);
    const qArm = arm.getWorldQuaternion(new THREE.Quaternion());
    const toArm = qArm.invert().multiply(qModel);
    const lo = W.clone().sub(E).normalize().applyQuaternion(toArm);
    _q.setFromUnitVectors(rest, lo);
    fore.quaternion.slerp(_q, w);
    fore.updateWorldMatrix(false, true);
    void i;
  }

  /** Never through the head or the body: push a raised arm out (or forward) until its hand is clear. */
  #keepHandsOut() {
    const model = this.parts.model;
    if (!model) return;
    model.updateWorldMatrix(true, true);
    const head = new THREE.Vector3(...HEAD.c);
    const rad = new THREE.Vector3(HEAD.r[0] + 0.03, HEAD.r[1] + 0.03, HEAD.r[2] + 0.03);
    const inHead = (v) => {
      const a = ((v.x - head.x) / rad.x) ** 2 + ((v.y - head.y) / rad.y) ** 2 + ((v.z - head.z) / rad.z) ** 2;
      const b = (v.x / (JOWL.r[0] + 0.03)) ** 2 + ((v.y - JOWL.c[1]) / (JOWL.r[1] + 0.03)) ** 2 + ((v.z - JOWL.c[2]) / (JOWL.r[2] + 0.03)) ** 2;
      return Math.min(a, b) < 1;
    };
    // The torso is the shirt's own shape (it narrows towards the chest), with a little room.
    const inBody = (v) => {
      if (v.y < 0.29 || v.y > 0.5) return false;
      const t = clamp((v.y - 0.3) / 0.21, 0, 1), sh = Math.sqrt(Math.max(0, 1 - clamp((v.y - 0.455) / 0.06, 0, 1) ** 2));
      const rx = (0.122 + 0.036 * (1 - t) ** 1.4) * (0.55 + 0.45 * sh) + 0.01, rz = (0.09 + 0.022 * (1 - t)) * (0.7 + 0.3 * sh) + 0.01;
      return (v.x / rx) ** 2 + (v.z / rz) ** 2 < 1;
    };
    const headC = new THREE.Vector3(...HEAD.c);
    ['R', 'L'].forEach((s, i) => {
      const arm = this.B[`arm_${s}`], hand = this.handBones[i];
      const S = new THREE.Vector3(...ARM_JOINTS[i].S);
      for (let it = 0; it < 30; it++) {
        // The hand's middle and a fingertip, in model space.
        // The middle of the palm, in model space (fingertips may rest against him; the palm may not go inside).
        const wrist = hand.getWorldPosition(new THREE.Vector3());
        const mid = new THREE.Vector3(...ARM_JOINTS[i].hu).multiplyScalar(0.045).applyQuaternion(hand.getWorldQuaternion(_q)).add(wrist);
        model.worldToLocal(mid);
        const bad = [mid].find((v) => inHead(v) || inBody(v));
        if (!bad) break;
        // Swing the arm about the shoulder so the hand moves straight away from what it's inside of.
        const away = inHead(bad) ? bad.clone().sub(headC) : new THREE.Vector3(bad.x, 0, bad.z + 0.02);
        const r = bad.clone().sub(S);
        const axisModel = new THREE.Vector3().crossVectors(r, away);
        if (axisModel.lengthSq() < 1e-10) axisModel.set(0, 0, 1);
        const axisWorld = axisModel.normalize().transformDirection(model.matrixWorld);
        arm.rotateOnWorldAxis(axisWorld, 0.05);
        arm.updateWorldMatrix(false, true);
      }
    });
  }

  animate(dt) {
    super.animate(dt);
    this.time += dt;
    if (!this.B) return;
    const B = this.B;
    const p = this.pose;

    // Custom pose blend in/out.
    if (this.custom) {
      const c = this.custom;
      if (this.time > c.until) c.target = 0;
      c.w += (c.target - c.w) * (1 - Math.exp(-6 * dt));
      if (c.target === 0 && c.w < 0.01) this.custom = null;
    }

    // How he's moving: sideways speed (from his position) and how fast he's turning.
    const x = this.root.position.x;
    const vx = this.lastX === null ? 0 : (x - this.lastX) / Math.max(dt, 1e-3) / (this.root.scale.x || 1);
    const ax = (vx - this.lastVX) / Math.max(dt, 1e-3);
    this.lastX = x;
    this.lastVX = vx;
    const yaw = this.root.rotation.y;
    const turn = (yaw - this.lastYaw) / Math.max(dt, 1e-3);
    this.lastYaw = yaw;
    const hop = p ? p.bodyY : 0;

    // The shirt's skirt: each side swings on a spring. Sideways moves push the left/right panels, turning flares
    // them, hops lift them, and the front/back panels ripple with his steps.
    const step = Math.sin(this.walkPhase * 2) * 0.05 * (this.walkAmount ?? 0);
    const side = clamp(-ax * 0.02 - vx * 0.08, -0.35, 0.35);
    const flare = clamp(Math.abs(turn) * 0.05, 0, 0.3);
    const lift = clamp(-hop * 2, -0.2, 0.2);
    const c = this.cloth;
    const cl = (b, rx, rz) => b && b.rotation.set(rx, 0, rz);
    cl(B.hemR, 0, c.R.step(side - flare - lift, dt));
    cl(B.hemL, 0, c.L.step(side + flare + lift, dt));
    cl(B.hemF, c.F.step(-step - lift + Math.sin(this.time * 1.4) * 0.01, dt), 0);
    cl(B.hemB, c.B.step(step + lift, dt), 0);

    // Ears and hair: little lags and bounces.
    const e0 = this.earS[0].step(-vx * 0.04 + hop * 1.5, dt), e1 = this.earS[1].step(-vx * 0.04 + hop * 1.5, dt);
    B.ear_R?.rotation.set(e0 * 0.6, 0, -e0 * 0.4);
    B.ear_L?.rotation.set(e1 * 0.6, 0, e1 * 0.4);
    B.hair?.rotation.set(this.hairS.step(hop * 2, dt) * 0.4, 0, this.hairS.x * 0.3 - vx * 0.03);

    // Fingers: relaxed and slightly different from each other when resting, open when he lifts his arms.
    if (p) {
      for (const s of ['R', 'L']) {
        const raise = clamp((p[`armRaise${s}`] ?? 0) / 1.3, 0, 1);
        for (let f = 0; f < 4; f++) {
          const rest = 0.35 + f * 0.08 + Math.sin(this.time * 0.8 + f + (s === 'R' ? 0 : 3)) * 0.06;
          const a = rest * (1 - raise) - raise * 0.25 + (this.ride ?? 0) * -0.2;
          B[`finger${f}_${s}`]?.quaternion.setFromAxisAngle(this.axes[`curl_${s}`], -a);
        }
        B[`thumb_${s}`]?.quaternion.setFromAxisAngle(this.axes[`hu_${s}`], (0.25 - raise * 0.3) * (s === 'R' ? -1 : 1));
      }
    }
    // A custom pose (named or by joints) blends over the animation, then hands are kept out of the head and body.
    if (this.custom) this.#applyCustom();
    this.#keepHandsOut();
  }
}

export { sideBone };
