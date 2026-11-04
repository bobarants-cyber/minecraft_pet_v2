import * as THREE from 'three';
import { StateMachine } from '../animation/StateMachine.js';
import { createPose, dampPose, resetPose } from '../animation/Pose.js';
import { Locomotion } from './Locomotion.js';
import { Personality } from './Personality.js';
import { Emotes } from './Emotes.js';
import { STATES } from './states.js';

const _head = new THREE.Vector3();
const _dir = new THREE.Vector3();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class Character {
  constructor({ mob, scene, settings }) {
    this.mob = mob;
    this.face = mob.face;
    this.settings = settings;

    this.target = createPose();
    this.current = createPose();
    this.overlay = createPose();
    this.final = createPose();
    this.poseRate = 8;

    this.lookHint = null;
    this.attention = null;
    this.socialMode = false;
    this.allowAutoWake = true;
    this.placement = { scale: 0.55, floorY: -1.5, minX: -3, maxX: 3, halfWidth: 4, halfHeight: 2 };
    this.breathPhase = 0;
    /** Current height above the floor and the height it drifts back to when left alone. */
    this.lift = 0;
    this.restLift = 0;
    this.climb = 0;

    this.loco = new Locomotion();
    this.brain = new Personality();
    this.emotes = new Emotes(scene);
    this.fsm = new StateMachine(this, STATES);
    this.fsm.remap = (name) => this.mob.stateAliases?.[name] ?? name;
    this.fsm.go('boot');
  }

  get stateName() {
    return this.fsm.name;
  }

  trigger(name, params = {}, force = false) {
    const current = this.fsm.state;
    const next = STATES[name];
    if (!next) return false;
    if (!force && current && (current.priority ?? 0) > (next.priority ?? 0)) return false;
    this.fsm.go(name, params);
    return true;
  }

  setPlacement(p) {
    Object.assign(this.placement, p);
    this.loco.setBounds(p.minX, p.maxX);
  }

  /** Swap the body being driven; position carries over, the face starts out neutral. */
  setMob(mob) {
    this.mob = mob;
    this.face = mob.face;
    this.face.setExpression('neutral');
  }

  emote(type, side = 0) {
    const s = this.placement.scale;
    this.mob.joints.head.getWorldPosition(_head);
    _head.y += this.mob.emoteLift * s;
    _head.x += side * 0.5 * s;
    _head.z += 0.3 * s;
    this.emotes.spawn(type, _head, s, side, this.mob.joints.head);
  }

  update(dt, t) {
    resetPose(this.target);
    resetPose(this.overlay);
    this.poseRate = 8;
    this.lookHint = null;

    this.fsm.update(dt);
    const state = this.fsm.state;
    this.brain.update(dt, this.fsm.name);

    const { scale, floorY } = this.placement;
    this.loco.maxSpeed = 0.9 * this.settings.walkSpeed;
    this.loco.update(dt, scale);
    if (state.freeLift !== true) {
      this.restLift = clamp(this.restLift, 0, this.placement.maxLift ?? Infinity);
      const maxV = 1.4 * this.settings.walkSpeed * scale;
      const step = clamp((this.restLift - this.lift) * 3, -maxV, maxV) * dt;
      this.lift += step;
      this.climb += (step / Math.max(dt, 1e-3) / scale - this.climb) * (1 - Math.exp(-6 * dt));
    } else this.climb *= Math.exp(-6 * dt);
    const mob = this.mob;
    mob.climb = this.climb;
    mob.lean = this.loco.walkAmount * 0.28;
    mob.walkAmount = this.loco.walkAmount;
    mob.walkPhase = this.loco.phase;

    dampPose(this.current, this.target, this.poseRate, dt);
    const f = this.final;
    for (const k in f) f[k] = this.current[k] + this.overlay[k];
    this.#applyWalk(f);
    this.#applyGaze(f, state);

    const sleeping = this.fsm.name === 'sleep';
    this.breathPhase += dt * (sleeping ? 1.1 : 1.7);
    const breath = Math.sin(this.breathPhase) * (sleeping ? 1.8 : 1);

    const root = mob.root;
    root.position.set(this.loco.x, floorY + this.lift, 0);
    root.scale.setScalar(scale);
    root.rotation.y = this.loco.facing;
    mob.applyPose(f, breath);

    this.face.autoBlink = state.blink !== false;
    this.face.update(dt, t);
    mob.animate(dt);
    this.emotes.update(dt);
  }

  #applyWalk(f) {
    const w = this.loco.walkAmount;
    if (w < 0.001) return;
    const s = Math.sin(this.loco.phase);
    const c = Math.cos(this.loco.phase);
    // In flight: a gentle bob and lean into the direction of travel.
    f.bodyY += Math.abs(s) * 0.02 * w;
    f.torsoRoll += s * 0.02 * w;
    f.headRoll -= s * 0.03 * w;
    f.headPitch += c * 0.02 * w;
    f.torsoPitch += 0.05 * w;
    f.armSwingL += 0.1 * w;
    f.armSwingR += 0.1 * w;
  }

  #applyGaze(f, state) {
    let look = null;
    if (this.attention && state.attentive !== false) {
      this.mob.joints.head.getWorldPosition(_head);
      _dir.subVectors(this.attention, _head);
      const yaw = Math.atan2(_dir.x, _dir.z);
      const pitch = Math.atan2(_dir.y, Math.hypot(_dir.x, _dir.z));
      look = [clamp((yaw - this.loco.facing) / 0.9, -1, 1), clamp(pitch / 0.5, -1, 1)];
      this.loco.idleFacing = clamp(yaw * 0.45, -0.6, 0.6);
    } else {
      this.loco.idleFacing = 0;
      look = this.lookHint;
    }

    this.face.autoLook = !look && state.autoLook !== false;
    if (look) this.face.lookAt(look[0], look[1]);
    else if (state.autoLook === false) this.face.lookAt(0, 0);

    f.headYaw += this.face.look.x * 0.45;
    f.headPitch -= this.face.look.y * 0.3;
  }
}
