const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const env = (t, a, b, fade = 0.25) => smooth(a, a + fade, t) * (1 - smooth(b - fade, b, t));
const hop = (t, start, dur, h) => {
  const k = (t - start) / dur;
  return k > 0 && k < 1 ? 4 * h * k * (1 - k) : 0;
};
const dip = (t, at, depth, width = 0.12) => depth * Math.max(0, 1 - Math.abs(t - at) / width);
const then = (p, fallback = 'idle') => p.then ?? fallback;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const IDLE_FACES = ['uwu', 'smug', 'deadpan', 'nervous', 'pouty', 'love'];
const WALK_FACES = ['neutral', 'neutral', 'happy', 'uwu', 'smug'];

function jump(c, t, start, dur, height) {
  c.overlay.bodyY += hop(t, start, dur, height);
  c.overlay.crouch += dip(t, start - 0.04, 0.07) + dip(t, start + dur + 0.04, 0.06);
}

function sideToward(c) {
  if (c.attention) return c.attention.x > c.loco.x ? 'L' : 'R';
  return Math.random() < 0.5 ? 'L' : 'R';
}

export const STATES = {
  boot: {
    priority: 9,
    autoLook: false,
    blink: false,
    enter(c) {
      c.face.setExpression('asleep');
    },
    update(c, dt, t) {
      c.poseRate = 4;
      c.target.headPitch = t < 1.3 ? 0.4 : 0;
      c.target.crouch = t < 1.3 ? 0.05 : 0.01;
      c.target.armSwingL = c.target.armSwingR = t < 1.3 ? 0.15 : 0;
      if (t > 1.3 && c.face.expression === 'asleep') c.face.setExpression('neutral');
      if (t > 2.4) return { name: 'wave', params: { then: 'idle' } };
    },
  },

  idle: {
    priority: 0,
    enter(c, p, s) {
      s.baseExpr = c.socialMode ? 'neutral' : c.brain.idleExpression();
      c.face.setExpression(s.baseExpr);
      s.duration = p.duration ?? rand(4, 9);
      s.fidget = null;
      s.nextFidget = rand(1.5, 4);
    },
    update(c, dt, t, s) {
      c.target.torsoRoll = Math.sin(t * 0.5) * 0.025;
      c.target.crouch = 0.01 + 0.006 * Math.sin(t * 0.9);

      s.nextFidget -= dt;
      if (!s.fidget && s.nextFidget <= 0) {
        s.fidget = { type: pick(['tilt', 'tilt', 'lookBack', 'shrug', 'hands', 'sway', 'face', 'face']), t0: t, dur: rand(1.4, 2.4), side: Math.random() < 0.5 ? -1 : 1 };
        if (s.fidget.type === 'face') {
          s.fidget.dur = rand(1.8, 2.8);
          c.face.setExpression(pick(IDLE_FACES));
        }
      }
      if (s.fidget) {
        const f = s.fidget;
        const k = (t - f.t0) / f.dur;
        if (k >= 1) {
          if (f.type === 'face') c.face.setExpression(s.baseExpr);
          s.fidget = null;
          s.nextFidget = rand(2, 5);
        } else {
          if (f.type === 'face') c.target.headRoll += 0.15 * f.side * Math.sin(k * Math.PI);
          const e = Math.sin(k * Math.PI);
          if (f.type === 'tilt') c.target.headRoll += 0.3 * f.side * e;
          if (f.type === 'lookBack') {
            c.target.headYaw += 0.75 * f.side * e;
            c.lookHint = [f.side * 0.8 * e, 0.1];
          }
          if (f.type === 'shrug') {
            c.target.armRaiseL += 0.3 * e;
            c.target.armRaiseR += 0.3 * e;
            c.target.headRoll += 0.12 * f.side * e;
          }
          if (f.type === 'hands') {
            c.target.armSwingL = c.target.armSwingR = 0.55 * e;
            c.target.elbowL = c.target.elbowR = 1.0 * e;
            c.target.headPitch += 0.3 * e;
            c.lookHint = [0, -0.7 * e];
          }
          if (f.type === 'sway') {
            c.target.torsoRoll += 0.08 * f.side * Math.sin(k * Math.PI * 2);
            c.target.headRoll -= 0.1 * f.side * Math.sin(k * Math.PI * 2);
          }
        }
      }
      if (t > s.duration) return c.brain.nextAction(c);
    },
  },

  walk: {
    priority: 1,
    enter(c, p) {
      c.loco.walkTo(p.x ?? c.loco.x);
      if (p.lift !== undefined) c.restLift = p.lift;
      c.face.setExpression(p.mood ?? pick(WALK_FACES));
    },
    update(c, dt, t, s, p) {
      c.target.torsoPitch = 0.05;
      if (!c.attention) c.lookHint = [-Math.sign(c.loco.speed) * 0.35, -0.05];
      if (c.loco.arrived && Math.abs(c.restLift - c.lift) < 0.08 * c.placement.scale && t > 0.3) return then(p);
      if (t > 30) return 'idle';
    },
    exit(c) {
      c.loco.stop();
    },
  },

  happy: {
    priority: 2,
    enter(c) {
      c.face.setExpression('joy');
      c.emote('heart', 0.6);
    },
    update(c, dt, t, s, p) {
      c.poseRate = 10;
      if (t > 1.5 && c.face.expression === 'joy') c.face.setExpression('happy');
      jump(c, t, 0.35, 0.42, 0.16);
      jump(c, t, 1.05, 0.42, 0.16);
      const up = env(t, 0.2, 2.4, 0.3);
      c.target.armRaiseL = c.target.armRaiseR = 2.3 * up;
      c.target.elbowL = c.target.elbowR = 0.4 * up;
      c.overlay.wristL = Math.sin(t * 12) * 0.4 * up;
      c.overlay.wristR = -Math.sin(t * 12) * 0.4 * up;
      c.target.headPitch = -0.12 * up;
      if (t > 1.8 && !s.second) {
        s.second = true;
        c.emote('heart', -0.6);
      }
      if (t > 3) return then(p);
    },
  },

  sad: {
    priority: 2,
    enter(c) {
      c.face.setExpression('sad');
    },
    update(c, dt, t, s, p) {
      c.poseRate = 3;
      if (t > 1.3 && c.face.expression === 'sad') c.face.setExpression('crying');
      const crying = c.face.expression === 'crying';
      c.target.headPitch = crying ? 0.18 : 0.45;
      c.target.torsoPitch = 0.14;
      c.target.crouch = 0.03;
      c.target.armSwingL = c.target.armSwingR = 0.15;
      c.target.armRaiseL = c.target.armRaiseR = -0.08;
      c.target.headRoll = 0.1 * Math.sin(t * 0.7);
      c.overlay.bodyY = -0.012 * env(t, 1.5, 2.6, 0.5);
      c.lookHint = crying ? [0.15 * Math.sin(t * 0.5), -0.2] : [0.2 * Math.sin(t * 0.5), -0.8];
      if (t > 4.5) return then(p);
    },
  },

  sleepy: {
    priority: 2,
    autoLook: false,
    enter(c) {
      c.restLift = 0;
      c.face.setExpression('sleepy');
    },
    update(c, dt, t, s, p) {
      c.poseRate = 4;
      const yawn = env(t, 0.5, 2.6, 0.5);
      c.face.target.mouthOpen = 0.9 * yawn;
      c.face.target.eyeOpen[0] = c.face.target.eyeOpen[1] = 0.28 * (1 - yawn) + 0.05 * yawn;
      c.target.armRaiseL = c.target.armRaiseR = 2.6 * yawn;
      c.target.elbowL = c.target.elbowR = 0.3 * yawn;
      c.target.torsoPitch = -0.1 * yawn;
      c.target.headPitch = -0.25 * yawn;
      if (t > 2.6) {
        const nod = Math.max(0, Math.sin((t - 2.6) * 2.2));
        c.target.headPitch = 0.25 + nod * 0.15;
        c.target.crouch = 0.03;
      }
      if (t > 5.5) return 'sleep';
    },
  },

  sleep: {
    priority: 3,
    autoLook: false,
    blink: false,
    attentive: false,
    enter(c, p, s) {
      c.restLift = 0;
      c.face.setExpression('asleep');
      s.nextZ = 1.2;
      s.zSide = 1;
    },
    update(c, dt, t, s) {
      c.poseRate = 2.5;
      c.target.sit = 1;
      c.target.headPitch = 0.5;
      c.target.headRoll = 0.15;
      c.target.torsoPitch = 0.18;
      c.target.armSwingL = c.target.armSwingR = 0.35;
      c.target.elbowL = c.target.elbowR = 0.5;
      s.nextZ -= dt;
      if (s.nextZ <= 0) {
        c.emote('zzz', 0.5);
        s.nextZ = 1.6;
      }
      if (c.allowAutoWake && c.brain.energy >= 1 && t > 20) return 'wake';
    },
  },

  wake: {
    priority: 3,
    autoLook: false,
    enter(c) {
      c.face.setExpression('sleepy');
    },
    update(c, dt, t, s, p) {
      c.poseRate = 3.5;
      if (t > 1 && c.face.expression === 'sleepy') c.face.setExpression('neutral');
      const stretch = env(t, 1.0, 2.4, 0.4);
      c.target.armRaiseL = c.target.armRaiseR = 2.5 * stretch;
      c.target.torsoPitch = -0.08 * stretch;
      c.target.headPitch = t < 0.6 ? 0.4 : -0.15 * stretch;
      if (t > 3) return then(p);
    },
  },

  curious: {
    priority: 1,
    enter(c, p, s) {
      c.face.setExpression('curious');
      c.emote('question', 0.5);
      s.side = Math.random() < 0.5 ? -1 : 1;
      s.spot = [rand(-0.8, 0.8), rand(-0.3, 0.5)];
    },
    update(c, dt, t, s, p) {
      c.poseRate = 6;
      c.target.headRoll = 0.32 * s.side;
      c.target.torsoPitch = 0.12;
      c.target.headPitch = 0.05;
      c.target.armSwingR = 1.3;
      c.target.elbowR = 1.9;
      c.target.armRaiseR = -0.1;
      c.overlay.headRoll = 0.04 * Math.sin(t * 3);
      if (!c.attention) c.lookHint = s.spot;
      if (t > 4) return then(p);
    },
  },

  surprised: {
    priority: 4,
    enter(c) {
      c.face.setExpression('surprised');
      c.emote('exclaim', 0);
    },
    update(c, dt, t, s, p) {
      c.poseRate = 16;
      c.target.sit = 0;
      jump(c, t, 0.06, 0.3, 0.12);
      c.target.armRaiseL = c.target.armRaiseR = 1.0;
      c.target.elbowL = c.target.elbowR = 0.9;
      c.target.torsoPitch = -0.12;
      c.target.headPitch = -0.15;
      if (t > 1.6) return then(p);
    },
  },

  excited: {
    priority: 2,
    enter(c) {
      c.face.setExpression(Math.random() < 0.4 ? 'love' : 'excited');
      c.emote('sparkle', 0.6);
    },
    update(c, dt, t, s, p) {
      c.poseRate = 10;
      const on = env(t, 0, 3.4, 0.3);
      c.overlay.bodyY = Math.abs(Math.sin(t * 8)) * 0.07 * on;
      c.target.armRaiseL = c.target.armRaiseR = 1.5 * on;
      c.overlay.armRaiseL = Math.sin(t * 8) * 0.6 * on;
      c.overlay.armRaiseR = -Math.sin(t * 8) * 0.6 * on;
      c.target.elbowL = c.target.elbowR = 0.8 * on;
      c.overlay.headRoll = Math.sin(t * 4) * 0.12 * on;
      if (t > 1.6 && !s.second) {
        s.second = true;
        c.emote('sparkle', -0.6);
        c.face.setExpression('joy');
      }
      if (t > 3.5) return then(p);
    },
  },

  wave: {
    priority: 2,
    enter(c, p, s) {
      c.face.setExpression(pick(['happy', 'uwu', 'joy']));
      s.side = p.side ?? sideToward(c);
    },
    update(c, dt, t, s, p) {
      c.poseRate = 9;
      const S = s.side;
      const sign = S === 'L' ? 1 : -1;
      const up = env(t, 0, 2.7, 0.35);
      c.target[`armRaise${S}`] = 2.5 * up;
      c.target[`elbow${S}`] = 0.5 * up;
      c.target[`armSwing${S}`] = 0.25 * up;
      c.overlay[`armRaise${S}`] = Math.sin(t * 9) * 0.22 * up;
      c.overlay[`wrist${S}`] = Math.sin(t * 9 + 0.6) * 0.45 * up;
      c.target.headRoll = 0.15 * sign * up;
      c.target.torsoRoll = -0.05 * sign * up;
      if (t > 2.8) return then(p);
    },
  },

  pet: {
    priority: 2,
    enter(c, p, s) {
      s.count = p.count ?? 1;
      c.face.setExpression(s.count > 3 ? 'love' : pick(['uwu', 'happy', 'love']));
      c.emote(s.count > 3 ? 'sparkle' : 'heart', Math.random() < 0.5 ? -0.6 : 0.6);
      s.side = Math.random() < 0.5 ? -1 : 1;
    },
    update(c, dt, t, s, p) {
      c.poseRate = 10;
      const on = env(t, 0, 1.8, 0.3);
      c.target.headRoll = 0.3 * s.side * on;
      c.target.headPitch = 0.12 * on;
      c.target.crouch = 0.03 * on;
      c.overlay.bodyY = Math.abs(Math.sin(t * 9)) * 0.02 * on;
      c.target.armRaiseL = c.target.armRaiseR = 0.6 * on;
      c.target.elbowL = c.target.elbowR = 1.2 * on;
      c.overlay.headRoll = Math.sin(t * 5) * 0.05 * on;
      if (t > 1.9) return then(p);
    },
  },

  carried: {
    priority: 8,
    autoLook: false,
    freeLift: true,
    enter(c) {
      c.loco.stop();
      c.face.setExpression('surprised');
      c.emote('exclaim', 0);
    },
    update(c, dt, t, s) {
      c.poseRate = 7;
      if (t > 0.9 && c.face.expression === 'surprised') c.face.setExpression('nervous');
      const vx = c.carry?.vx ?? 0;
      const sway = clamp01(Math.abs(vx) / 6) * Math.sign(vx);
      c.target.sit = 0;
      c.target.armRaiseL = c.target.armRaiseR = 0.95;
      c.target.elbowL = c.target.elbowR = 0.35;
      c.target.legSwingL = 0.25 + Math.sin(t * 5) * 0.2 - sway * 0.4;
      c.target.legSwingR = 0.25 - Math.sin(t * 5) * 0.2 - sway * 0.4;
      c.target.kneeL = c.target.kneeR = 0.6;
      c.target.torsoRoll = -sway * 0.25;
      c.target.torsoPitch = sway * 0.1;
      c.target.headRoll = sway * 0.2;
      c.target.headPitch = 0.1;
      c.lookHint = [-sway * 0.5, -0.5];
    },
  },

  // Gentle release: stay right here and hover.
  settle: {
    priority: 8,
    enter(c, p, s) {
      c.restLift = c.lift;
      c.loco.stop();
      c.face.setExpression(c.lift > 0.1 ? 'happy' : 'neutral');
      s.side = Math.random() < 0.5 ? -1 : 1;
    },
    update(c, dt, t, s, p) {
      c.poseRate = 9;
      const k = Math.exp(-t * 2.2);
      c.overlay.bodyY = Math.sin(t * 9) * 0.06 * k;
      c.overlay.torsoRoll = Math.sin(t * 7) * 0.2 * k * s.side;
      c.target.headRoll = 0.15 * s.side * k;
      if (t > 1.2) return then(p);
    },
  },

  // Thrown: tumbles under gravity while dazed, then recovers, shrugs off the momentum and hovers where it ends up.
  // Only reaches the floor if the throw gets it there before it recovers.
  drop: {
    priority: 8,
    autoLook: false,
    freeLift: true,
    enter(c, p, s) {
      const scale = c.placement.scale;
      s.vy = p.vy ?? 0;
      s.vx = p.vx ?? 0;
      const speed = Math.hypot(s.vx, s.vy) / scale;
      s.daze = 0.2 + 0.3 * clamp01(speed / 10);
      s.spinDir = Math.sign(s.vx || 1);
      s.landed = -1;
      s.recovered = false;
      c.restLift = c.lift;
      c.face.setExpression('surprised');
    },
    update(c, dt, t, s, p) {
      c.poseRate = 12;
      const { scale, minX, maxX, halfHeight, floorY } = c.placement;
      if (s.landed < 0) {
        const dazed = t < s.daze;
        if (dazed) {
          s.vy -= 5.5 * scale * dt;
          s.vx *= Math.exp(-0.6 * dt);
        } else {
          // Wings catch: thrust cancels velocity, gravity no longer wins.
          s.vy += (-s.vy) * (1 - Math.exp(-7 * dt));
          s.vx += (-s.vx) * (1 - Math.exp(-3 * dt));
          if (!s.recovered) {
            s.recovered = true;
            c.face.setExpression('nervous');
          }
        }
        c.lift += s.vy * dt;
        const ceiling = halfHeight - floorY - 1.7 * scale;
        if (c.lift > ceiling) {
          c.lift = ceiling;
          s.vy = -Math.abs(s.vy) * 0.35;
        }
        let x = c.loco.x + s.vx * dt;
        if (x < minX || x > maxX) {
          x = clamp01((x - minX) / (maxX - minX)) * (maxX - minX) + minX;
          s.vx = -s.vx * 0.45;
        }
        c.loco.x = c.loco.targetX = x;
        c.restLift = c.lift;

        const speed = Math.hypot(s.vx, s.vy) / scale;
        const spin = dazed ? clamp01(speed / 6) : 0;
        c.overlay.torsoRoll = Math.sin(t * 18) * 0.6 * spin * s.spinDir;
        c.overlay.torsoPitch = Math.cos(t * 14) * 0.4 * spin;
        c.target.torsoPitch += (s.vx / (8 * scale)) * 0.5 * (1 - spin);
        c.target.torsoRoll += (-s.vx / (8 * scale)) * 0.3 * (1 - spin);
        c.target.headPitch = -0.15;
        c.lookHint = [0, 0.4];

        if (c.lift <= 0) {
          c.lift = 0;
          c.restLift = 0;
          s.landed = t;
          s.impact = clamp01(-s.vy / (7 * scale));
          s.slide = s.vx * 0.6;
          c.face.setExpression(s.impact > 0.6 ? 'annoyed' : 'nervous');
          c.loco.stop();
        } else if (!dazed && speed < 0.5) {
          return { name: 'grumpy', params: { then: then(p) } };
        }
        return;
      }
      const k = t - s.landed;
      // Skid to a halt, then shake it off.
      s.slide *= Math.exp(-5 * dt);
      c.loco.x = c.loco.targetX = Math.min(maxX, Math.max(minX, c.loco.x + s.slide * dt));
      const squash = s.impact * Math.max(0, 1 - k / 0.45);
      c.target.crouch = 0.12 * squash;
      c.target.torsoPitch = 0.22 * squash;
      c.target.headPitch = 0.35 * squash;
      c.target.sit = Math.max(0, 1 - k / 1.2);
      if (k > 0.5 && k < 1.6) c.overlay.headRoll = Math.sin(k * 14) * 0.12 * s.impact * (1.6 - k);
      if (k > 1.4) return { name: 'grumpy', params: { then: then(p) } };
    },
  },

  // Post-throw sulk: red eyes, a huffy shake, glares straight at the cursor.
  grumpy: {
    priority: 5,
    enter(c) {
      c.face.setExpression('angry');
      c.loco.stop();
    },
    update(c, dt, t, s, p) {
      c.poseRate = 9;
      const huff = env(t, 0, 3.6, 0.3);
      c.target.headPitch = 0.1 * huff;
      c.target.crouch = 0.02 * huff;
      c.overlay.torsoRoll = Math.sin(t * 22) * 0.04 * env(t, 0.2, 1.2, 0.2);
      c.overlay.bodyY = Math.abs(Math.sin(t * 11)) * 0.015 * env(t, 0.2, 1.2, 0.2);
      if (!c.attention) c.lookHint = [0, 0];
      if (t > 3.8) return then(p);
    },
  },

  dance: {
    priority: 1,
    enter(c, p, s) {
      c.face.setExpression('happy');
      s.nextNote = 0.2;
      s.noteSide = 1;
    },
    update(c, dt, t, s, p) {
      c.poseRate = 12;
      const beat = t * Math.PI * 4;
      const on = env(t, 0, 6, 0.4);
      c.overlay.crouch = (0.03 + 0.03 * Math.sin(beat)) * on;
      c.overlay.torsoRoll = Math.sin(beat / 2) * 0.12 * on;
      c.overlay.headRoll = -Math.sin(beat / 2) * 0.2 * on;
      c.overlay.torsoYaw = Math.sin(beat / 4) * 0.2 * on;
      c.target.armRaiseL = (1.2 + Math.sin(beat / 2) * 1.0) * on;
      c.target.armRaiseR = (1.2 - Math.sin(beat / 2) * 1.0) * on;
      c.target.elbowL = c.target.elbowR = 0.9 * on;
      c.overlay.legSwingL = Math.max(0, Math.sin(beat / 2)) * 0.25 * on;
      c.overlay.legSwingR = Math.max(0, -Math.sin(beat / 2)) * 0.25 * on;
      c.overlay.kneeL = c.overlay.legSwingL * 1.5;
      c.overlay.kneeR = c.overlay.legSwingR * 1.5;
      s.nextNote -= dt;
      if (s.nextNote <= 0) {
        c.face.setExpression(['happy', 'joy', 'uwu'][Math.floor(t / 1.1) % 3]);
        c.emote('note', 0.6 * s.noteSide);
        s.noteSide *= -1;
        s.nextNote = 1.1;
      }
      if (t > 6) return then(p);
    },
  },
};

export const ACTIONS = ['idle', 'happy', 'sad', 'sleepy', 'sleep', 'wake', 'curious', 'surprised', 'excited', 'wave', 'dance', 'pet'];
