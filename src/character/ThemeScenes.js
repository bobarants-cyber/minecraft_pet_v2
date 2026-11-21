// Scenes for FaceAway's themes, for every pet: when you pick a theme in FaceAway (or in the pet's menu), the pet
// matches it while nothing else is going on. Hacker: a dark desk with a green code screen, typing fast, now and then
// "ACCESS GRANTED". Liquid Glass: floating in a shimmering glass bubble. Midnight: under stars and a moon, sleepy.
// Sunset: warm glow, sunglasses, chill sway.
import * as THREE from 'three';
import { buildOffice, mat } from './Props.js';

const rand = (a, b) => a + Math.random() * (b - a);

/** A screen texture that scrolls columns of green code (and flashes ACCESS GRANTED when asked). */
function codeScreen() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const cols = Array.from({ length: 21 }, () => rand(0, 128));
  const glyphs = '01<>{}[]/=+*#$%&@ABCDEFabcdef';
  return {
    tex,
    draw(dt, granted) {
      g.fillStyle = 'rgba(0, 10, 4, 0.35)';
      g.fillRect(0, 0, 256, 128);
      g.font = 'bold 12px monospace';
      for (let i = 0; i < cols.length; i++) {
        g.fillStyle = Math.random() < 0.1 ? '#d8ffd8' : '#2bff6a';
        g.fillText(glyphs[(Math.random() * glyphs.length) | 0], i * 12 + 2, cols[i]);
        cols[i] = cols[i] > 128 + rand(0, 60) ? 0 : cols[i] + 60 * dt * rand(0.7, 1.4);
      }
      if (granted) {
        g.fillStyle = 'rgba(0, 0, 0, 0.75)';
        g.fillRect(28, 44, 200, 40);
        g.strokeStyle = '#2bff6a'; g.lineWidth = 2; g.strokeRect(28, 44, 200, 40);
        g.fillStyle = '#2bff6a'; g.font = 'bold 20px monospace';
        g.fillText('ACCESS GRANTED', 44, 71);
      }
      tex.needsUpdate = true;
    },
  };
}

function starfield() {
  const g = new THREE.Group();
  const star = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(rand(0.008, 0.018)), star);
    s.position.set(rand(-0.75, 0.75), rand(0.55, 1.35), rand(-0.45, -0.15));
    s.userData.tw = rand(0, 6);
    g.add(s);
  }
  // a crescent moon
  const sh = new THREE.Shape();
  sh.absarc(0, 0, 0.11, Math.PI * 0.3, Math.PI * 1.7, false);
  sh.absarc(0.05, 0, 0.095, Math.PI * 1.62, Math.PI * 0.38, true);
  const moon = new THREE.Mesh(new THREE.ShapeGeometry(sh, 24), new THREE.MeshBasicMaterial({ color: 0xfff1b8 }));
  moon.position.set(0.55, 1.2, -0.5); moon.rotation.z = 0.5;
  g.add(moon);
  return g;
}

function glassBubble() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 1, thickness: 0.25, roughness: 0.04, ior: 1.35, iridescence: 1, iridescenceIOR: 1.3,
    transparent: true, opacity: 0.55, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide, depthWrite: false,
  });
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.62, 48, 32), m);
  b.position.y = 0.48;
  b.renderOrder = 5;
  const shine = new THREE.Mesh(new THREE.CircleGeometry(0.09, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
  shine.position.set(-0.25, 0.32, 0.52); shine.rotation.set(-0.4, -0.4, 0);
  b.add(shine);
  const wrap = new THREE.Group(); // (the app pops the scene in by scaling this; the bubble itself breathes inside it)
  wrap.add(b);
  wrap.userData.bubble = b;
  return wrap;
}

function sunglow() {
  const g = new THREE.Group();
  const sun = new THREE.Mesh(new THREE.CircleGeometry(0.3, 40), new THREE.MeshBasicMaterial({ color: 0xffa05a, transparent: true, opacity: 0.85 }));
  sun.scale.setScalar(0.55);
  sun.position.set(0.58, 1.05, -0.5);   // up to the side, where it's seen (not hidden behind the pet)
  for (let i = 0; i < 3; i++) {   // the retro sunset stripes across it
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.016), new THREE.MeshBasicMaterial({ color: 0xff6f91 }));
    s.position.set(0.58, 0.96 + i * 0.045, -0.49);
    g.add(s);
  }
  g.add(sun);
  return g;
}

export const THEME_SCENES = {
  hacker: {
    label: 'hacking',
    seated: true,
    glasses: { color: 0x2bff6a },
    build() {
      const office = buildOffice();
      const scr = codeScreen();
      office.userData.screen.material = new THREE.MeshBasicMaterial({ map: scr.tex });
      office.userData.code = scr;
      // a floating green terminal beside the pet, facing you (the laptop's own screen faces the pet)
      const term = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.24), new THREE.MeshBasicMaterial({ map: scr.tex, transparent: true, opacity: 0.92 }));
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.27), new THREE.MeshBasicMaterial({ color: 0x0b2412, transparent: true, opacity: 0.85 }));
      frame.position.set(-0.62, 0.78, -0.12); frame.rotation.y = 0.35;
      term.position.set(0, 0, 0.002); frame.add(term);
      office.add(frame);
      office.userData.term = frame;
      const mug = office.userData.desk.children.at(-1);
      if (mug) mug.material = mat(0x1d1f24); // a black mug, obviously
      return { root: office };
    },
    pose(c, t, s, parts) {
      const fast = t > (s.grantAt ?? 9) ? 0.4 : 1;
      c.target.armSwingL = c.target.armSwingR = 1.05;
      c.target.elbowL = c.target.elbowR = 0.35;
      c.overlay.armSwingR = Math.max(0, Math.sin(t * 22)) * 0.22 * fast;
      c.overlay.armSwingL = Math.max(0, Math.sin(t * 24.5 + 1.7)) * 0.22 * fast;
      c.target.headPitch = 0.12;
      c.target.torsoPitch = 0.1; // leaning in, very focused
      c.lookHint = [Math.sin(t * 3.1) * 0.3, -0.5];
      s.grantAt ??= rand(7, 12);
      const granted = t > s.grantAt && t < s.grantAt + 1.8;
      if (granted && !s.cheered) {
        s.cheered = true;
        c.face.setExpression('smug');
        c.emote('sparkle', 0.5);
        c.target.armRaiseL = c.target.armRaiseR = 1.6;
      }
      if (t > s.grantAt + 1.8) { s.grantAt = t + rand(9, 16); s.cheered = false; c.face.setExpression('neutral'); }
      const term = parts.root?.userData.term;
      if (term) term.position.y = 0.78 + Math.sin(t * 1.6) * 0.012;
      parts.root?.userData.code?.draw(Math.min(0.05, c.lastDt ?? 0.016), granted);
    },
  },

  glass: {
    label: 'liquid glass',
    seated: false,
    build() { return { root: glassBubble() }; },
    pose(c, t, s, parts) {
      c.overlay.bodyY = 0.04 + Math.sin(t * 1.3) * 0.03; // floating inside
      c.overlay.torsoRoll = Math.sin(t * 0.9) * 0.06;
      c.target.armRaiseL = c.target.armRaiseR = 0.4 + Math.sin(t * 1.3) * 0.15;
      const b = parts.root?.userData.bubble;
      if (b) { b.rotation.y = t * 0.3; b.scale.setScalar(1 + Math.sin(t * 2.1) * 0.015); b.position.y = 0.48 + Math.sin(t * 1.3) * 0.03; }
      if (t > (s.next ??= 3)) { s.next = t + rand(4, 8); c.emote('sparkle', rand(-0.6, 0.6)); }
    },
  },

  midnight: {
    label: 'midnight',
    seated: false,
    build() { return { root: starfield() }; },
    pose(c, t, s, parts) {
      c.target.headRoll = Math.sin(t * 0.5) * 0.12;
      c.overlay.torsoRoll = Math.sin(t * 0.5) * 0.05;
      c.target.headPitch = -0.15; // looking up at the stars
      for (const st of parts.root?.children ?? []) if (st.userData.tw !== undefined) st.scale.setScalar(0.7 + 0.5 * Math.abs(Math.sin(t * 2 + st.userData.tw)));
      if (t > (s.next ??= 5)) { s.next = t + rand(8, 14); c.emote(Math.random() < 0.5 ? 'zzz' : 'sparkle', 0.5); c.face.setExpression(Math.random() < 0.5 ? 'sleepy' : 'uwu'); }
    },
  },

  sunset: {
    label: 'sunset',
    seated: false,
    glasses: {},
    build() { return { root: sunglow() }; },
    pose(c, t, s) {
      const beat = t * Math.PI * 0.9;
      c.overlay.torsoRoll = Math.sin(beat) * 0.08;
      c.target.headRoll = -Math.sin(beat) * 0.1;
      c.target.armRaiseL = 0.25; c.target.armRaiseR = 0.25;
      if (t > (s.next ??= 4)) { s.next = t + rand(6, 11); c.emote('note', rand(-0.6, 0.6)); c.face.setExpression('happy'); }
    },
  },
};
