// Every pet's own little routines: short sequences of moves that fit who they are (from their personality in the
// app). They play now and then when the pet is idle, one routine after another in order. Moves only use the shared
// pose (head, body, arms, legs) and the emotes, so they work on every rig; pets with fixed arms simply skip arm moves.
const smooth = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
const bell = (k) => Math.sin(Math.PI * Math.min(1, Math.max(0, k)));

/** Moves: each gets (c, k) with k going 0 → 1 over the step. */
const M = {
  tilt: (side) => (c, k) => { c.target.headRoll = 0.35 * side * bell(k); c.target.headPitch = -0.05 * bell(k); },
  nod: (c, k) => { c.overlay.headPitch = Math.sin(k * Math.PI * 4) * 0.15; },
  look: (side) => (c, k) => { c.target.headYaw = 0.7 * side * bell(k); },
  hop: (n = 1, h = 0.09) => (c, k) => { c.overlay.bodyY = Math.abs(Math.sin(k * Math.PI * n)) * h; c.overlay.crouch = Math.max(0, -Math.cos(k * Math.PI * n * 2)) * 0.02; },
  bounce: (c, k) => { c.overlay.bodyY = Math.abs(Math.sin(k * Math.PI * 6)) * 0.04; },
  sway: (n = 2, a = 0.14) => (c, k) => { c.overlay.torsoRoll = Math.sin(k * Math.PI * 2 * n) * a; c.overlay.headRoll = -Math.sin(k * Math.PI * 2 * n) * a * 0.8; },
  spin: (c, k) => { c.overlay.torsoYaw = Math.sin(k * Math.PI * 2) * 0.9; c.overlay.bodyY = bell(k) * 0.05; },
  shy: (c, k) => { const b = bell(k); c.target.headPitch = 0.25 * b; c.target.headRoll = 0.18 * b; c.overlay.torsoRoll = Math.sin(k * Math.PI * 4) * 0.06 * b; },
  arms: (c, k) => { const b = bell(k); c.target.armRaiseL = c.target.armRaiseR = 2.0 * b; c.overlay.wristL = c.overlay.wristR = Math.sin(k * 30) * 0.4 * b; },
  wave: (c, k) => { const b = bell(k); c.target.armRaiseR = 2.1 * b; c.overlay.wristR = Math.sin(k * 28) * 0.5 * b; },
  flap: (c, k) => { const b = bell(k); c.target.armRaiseL = c.target.armRaiseR = (1.0 + Math.sin(k * 40) * 0.6) * b; },
  crouch: (c, k) => { c.overlay.crouch = 0.06 * bell(k); c.target.headPitch = 0.15 * bell(k); },
  tumble: (c, k) => { c.overlay.torsoRoll = 0.5 * bell(Math.min(1, k * 2)); c.overlay.crouch = 0.07 * bell(Math.min(1, k * 2)); c.overlay.bodyY = k > 0.5 ? bell((k - 0.5) * 2) * 0.1 : 0; },
  tiptoe: (c, k) => { c.overlay.crouch = 0.04; c.overlay.torsoRoll = Math.sin(k * Math.PI * 6) * 0.07; c.target.headYaw = Math.sin(k * Math.PI * 2) * 0.5; },
  pose: (c, k) => { const b = smooth(0, 0.25, k) * (1 - smooth(0.8, 1, k)); c.target.armRaiseR = 2.2 * b; c.target.headRoll = -0.2 * b; c.overlay.torsoRoll = 0.08 * b; },
  still: () => {},
  peace: (c, k) => { c.mob.peace?.(2.5); c.target.headRoll = -0.25 * bell(k); }, // the V sign (figures that have one)
};

/** A step: [seconds, move, emote?, expression?]. */
const ROUTINES = {
  bee: [
    [[1.6, M.sway(2), 'note'], [1.2, M.flap, 'sparkle'], [1.0, M.spin], [1.0, M.hop(2, 0.07), 'heart', 'happy']],
    [[1.2, M.look(-1)], [1.2, M.look(1), 'question'], [1.2, M.bounce, 'sparkle', 'happy']],
  ],
  axolotl: [
    [[2.0, M.sway(1, 0.1)], [1.4, M.tilt(1), 'heart', 'uwu'], [1.6, M.nod, 'zzz', 'sleepy']],
    [[1.4, M.bounce, 'question'], [1.4, M.tilt(-1), 'sparkle', 'happy']],
  ],
  bbokari: [
    [[1.0, M.hop(1, 0.1), 'sparkle', 'happy'], [1.4, M.arms, 'sparkle'], [1.4, M.sway(2), 'note'], [1.0, M.tilt(1), 'heart', 'uwu']],
    [[1.6, M.hop(3, 0.07), 'exclaim', 'excited'], [1.2, M.wave, 'heart', 'happy']],
  ],
  wolfchan: [
    [[1.2, M.look(-1)], [1.2, M.look(1)], [1.0, M.nod], [1.4, M.wave, 'heart', 'happy']],
    [[1.6, M.tilt(1), 'question', 'curious'], [1.2, M.hop(1, 0.08), 'heart', 'happy']],
  ],
  jiniret: [
    [[1.0, M.spin, 'sparkle'], [1.6, M.pose, 'sparkle', 'happy'], [1.4, M.sway(3, 0.16), 'note'], [0.8, M.tilt(-1), 'heart', 'uwu']],
    [[1.4, M.tilt(1), 'sparkle', 'happy'], [1.4, M.arms, 'heart']],
  ],
  gliddy: [
    [[1.0, M.tumble, 'exclaim', 'surprised'], [0.8, M.crouch], [1.0, M.hop(1, 0.12), 'sparkle', 'happy'], [1.4, M.sway(2), 'note']],
    [[1.6, M.bounce, 'note', 'happy'], [1.0, M.look(1)]],
  ],
  moffy: [
    [[1.8, M.tiptoe, null, 'curious'], [1.0, M.look(-1)], [1.0, M.look(1), 'question'], [1.4, M.tilt(1), 'sparkle', 'happy']],
    [[1.2, M.crouch], [1.0, M.hop(1, 0.1), 'heart', 'excited'], [1.2, M.sway(2), 'sparkle']],
  ],
  duck: [
    [[1.6, M.sway(3, 0.18)], [1.0, M.flap, 'note'], [1.0, M.hop(2, 0.08), 'exclaim', 'excited'], [1.0, M.tilt(1), 'heart', 'happy']],
    [[1.2, M.crouch, 'question', 'curious'], [1.2, M.bounce, 'sparkle', 'happy']],
  ],
  cortis: [
    [[1.6, M.hop(3, 0.12), 'sparkle', 'excited'], [1.2, M.spin, 'note'], [1.0, M.tilt(1), 'heart', 'happy']],
    [[1.4, M.look(-1), 'question'], [1.2, M.hop(2, 0.1), 'exclaim', 'excited']],
  ],
  // the little figure: cute, sunny and a bit shy (his arms are sculpted in place, so it's all head, body and hops)
  sunoo: [
    [[1.2, M.tilt(-1), 'heart'], [2.4, M.peace, 'sparkle'], [1.2, M.tilt(1), 'heart'], [1.4, M.hop(2, 0.07), 'sparkle'], [1.4, M.shy, 'heart']],
    [[1.6, M.sway(2, 0.12), 'note'], [1.0, M.hop(1, 0.11), 'sparkle'], [1.2, M.tilt(1), 'heart']],
    [[1.4, M.bounce, 'sparkle'], [1.6, M.shy, 'heart'], [1.0, M.nod]],
  ],
};

/** The routines for the current pet (by its key in the mob list), or null. */
export function routinesFor(c) {
  const key = String(c.settings?.mob ?? '');
  if (ROUTINES[key]) return ROUTINES[key];
  if (key.startsWith('gliddy')) return ROUTINES.gliddy;
  if (key.startsWith('cortis')) return ROUTINES.cortis;
  return null;
}

/** The state that plays them: the next routine in order, step by step, then back to idle. */
export const SIGNATURE_STATE = {
  priority: 1,
  enter(c, p, s) {
    const list = routinesFor(c);
    if (!list) return;
    c.sigIndex = ((c.sigIndex ?? -1) + 1) % list.length;
    s.steps = list[c.sigIndex];
    s.at = -1;
    c.loco.stop();
  },
  update(c, dt, t, s) {
    if (!s.steps) return 'idle';
    c.poseRate = 10;
    let t0 = 0;
    for (let i = 0; i < s.steps.length; i++) {
      const [dur, move, emote, face] = s.steps[i];
      if (t < t0 + dur) {
        if (s.at !== i) {
          s.at = i;
          if (emote) c.emote(emote, Math.random() < 0.5 ? -0.5 : 0.5);
          if (face) c.face.setExpression(face);
        }
        move(c, (t - t0) / dur);
        return;
      }
      t0 += dur;
    }
    return 'idle';
  },
};
