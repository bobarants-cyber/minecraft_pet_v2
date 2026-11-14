// The "Be my cursor" pointer, themed for every mob and version: its colours, and a little head (with its own face and
// topper: ears, antennae, gills, a party hat, a key ring...). Each head is drawn centred on (0, 0) for a head about
// 26 px across (radius 13); the cursor shapes (arrow, I-beam, hands, crosshair, resize) place and scale it.
// Plain script (loaded by cursor.html), so it defines a global.
(function () {
  const circle = (fill, line, extra = '') => `<circle r="13" fill="${fill}" stroke="${line}" stroke-width="2" ${extra}/>`;
  const fuzzy = (fill, line) =>
    // Plush/fuzzy heads: a soft fuzz ring (dashed, like fibres) round a slightly bigger ball.
    `<circle r="13.6" fill="${fill}" stroke="${line}" stroke-width="2.6" stroke-dasharray="1.1 1.3" stroke-linecap="round"/>` +
    `<circle r="12.4" fill="${fill}"/>`;

  // ---------- Bbokari: the yellow chick with the wavy curl (the original pointer) ----------
  const bbokariFace = `<g class="eyes"><ellipse cx="-4.2" cy="-1" rx="2.2" ry="2.6" fill="#1d1408"/><ellipse cx="4.2" cy="-1" rx="2.2" ry="2.6" fill="#1d1408"/>
    <circle cx="-3.5" cy="-2" r=".75" fill="#fff"/><circle cx="4.9" cy="-2" r=".75" fill="#fff"/></g>
    <ellipse cx="-7.2" cy="3" rx="2" ry="1.2" fill="#FF9AA8" opacity=".85"/><ellipse cx="7.2" cy="3" rx="2" ry="1.2" fill="#FF9AA8" opacity=".85"/>
    <path d="M-2.2 2.2 Q0 0.7 2.2 2.2 Q0 5.2 -2.2 2.2 Z" fill="#FF8A1F" stroke="#C25E00" stroke-width=".5"/>`;
  const happyEyes = (c) => `<path d="M-6.4 -0.5 Q-4.2 -3.6 -2 -0.5 M2 -0.5 Q4.2 -3.6 6.4 -0.5" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`;
  const bbokari = {
    fill: '#FFD84D', line: '#3b2f14', shine: '#FFF2B0',
    top: `<path class="hair" d="M-3 -12 C -3 -21, 9 -22, 8 -15 C 7 -11, 1 -11, 2 -15" fill="none" stroke="#E8A800" stroke-width="3" stroke-linecap="round"/>`,
    face: bbokariFace,
    happy: `${happyEyes('#1d1408')}<ellipse cx="-7.2" cy="3" rx="2" ry="1.2" fill="#FF9AA8" opacity=".9"/><ellipse cx="7.2" cy="3" rx="2" ry="1.2" fill="#FF9AA8" opacity=".9"/>
      <path d="M-2.2 2.2 Q0 0.7 2.2 2.2 Q0 5.2 -2.2 2.2 Z" fill="#FF8A1F" stroke="#C25E00" stroke-width=".5"/>`,
  };

  // ---------- Bee: yellow with a black stripe, square eyes and antennae ----------
  const bee = {
    fill: '#F6C744', line: '#3a2a10', shine: '#FFF0A8',
    base: `${circle('#F6C744', '#3a2a10')}<path d="M-12.4 5 H12.4 L11 8.6 H-11 Z" fill="#3a2a10"/>`,
    top: `<path d="M-4 -12 Q-6 -19 -10 -20 M4 -12 Q6 -19 10 -20" fill="none" stroke="#3a2a10" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="-10" cy="-20" r="1.6" fill="#3a2a10"/><circle cx="10" cy="-20" r="1.6" fill="#3a2a10"/>`,
    face: `<g class="eyes"><rect x="-8" y="-5" width="4.6" height="5.6" fill="#1b1410"/><rect x="3.4" y="-5" width="4.6" height="5.6" fill="#1b1410"/>
      <rect x="-6.8" y="-4.4" width="1.6" height="1.6" fill="#fff"/><rect x="4.6" y="-4.4" width="1.6" height="1.6" fill="#fff"/></g>
      <path d="M-2 2 Q0 3.4 2 2" fill="none" stroke="#3a2a10" stroke-width="1.1" stroke-linecap="round"/>`,
    happy: `${happyEyes('#1b1410')}<path d="M-2 2 Q0 3.4 2 2" fill="none" stroke="#3a2a10" stroke-width="1.1" stroke-linecap="round"/>`,
  };

  // ---------- Axolotl: pink with frilly gills ----------
  const gill = (s) => `<path d="M${9 * s} -7 q${6 * s} -6 ${9 * s} -4 M${11.5 * s} -3 q${6 * s} -2.5 ${8 * s} 0.5 M${11.5 * s} 1 q${5.5 * s} 0 ${7 * s} 4" fill="none" stroke="#ef6f8c" stroke-width="2.4" stroke-linecap="round"/>`;
  const axolotl = {
    fill: '#F7A9C3', line: '#8b3a5e', shine: '#FFE0EC',
    top: gill(-1) + gill(1),
    face: `<g class="eyes"><circle cx="-5.4" cy="-1" r="1.9" fill="#4a1636"/><circle cx="5.4" cy="-1" r="1.9" fill="#4a1636"/>
      <circle cx="-4.9" cy="-1.6" r=".6" fill="#fff"/><circle cx="5.9" cy="-1.6" r=".6" fill="#fff"/></g>
      <path d="M-3.4 2.4 Q0 5.4 3.4 2.4" fill="none" stroke="#4a1636" stroke-width="1.2" stroke-linecap="round"/>
      <ellipse cx="-8" cy="3" rx="1.8" ry="1.1" fill="#ef6f8c" opacity=".7"/><ellipse cx="8" cy="3" rx="1.8" ry="1.1" fill="#ef6f8c" opacity=".7"/>`,
    happy: `${happyEyes('#4a1636')}<path d="M-3.4 2.4 Q0 5.4 3.4 2.4" fill="none" stroke="#4a1636" stroke-width="1.2" stroke-linecap="round"/>`,
  };

  // ---------- Wolf Chan: grey with a white muzzle, tall pointy ears and a little curl ----------
  const ear = (s, fill, line, inner) => `<path d="M${-11 * s} -5 L${-9.5 * s} -20 L${-2.5 * s} -11.5 Z" fill="${fill}" stroke="${line}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M${-9.4 * s} -8 L${-8.8 * s} -16 L${-4.6 * s} -11.4 Z" fill="${inner}"/>`;
  const wolfchan = {
    fill: '#AAB0BC', line: '#3a3a48', shine: '#E3E6EE',
    base: `${circle('#AAB0BC', '#3a3a48')}<ellipse cy="5" rx="8.6" ry="6.4" fill="#F7F5F1"/>`,
    top: `${ear(1, '#AAB0BC', '#3a3a48', '#f4b6c3')}${ear(-1, '#AAB0BC', '#3a3a48', '#f4b6c3')}
      <path class="hair" d="M0 -12.5 C 0 -18, 5 -18, 4.5 -15" fill="none" stroke="#8d93a0" stroke-width="2" stroke-linecap="round"/>`,
    face: `<g class="eyes"><ellipse cx="-4.6" cy="-2" rx="1.9" ry="2.3" fill="#2e2a33"/><ellipse cx="4.6" cy="-2" rx="1.9" ry="2.3" fill="#2e2a33"/>
      <circle cx="-4" cy="-2.8" r=".7" fill="#fff"/><circle cx="5.2" cy="-2.8" r=".7" fill="#fff"/></g>
      <path d="M-1.6 1.6 H1.6 L0 3.2 Z" fill="#2e2a33"/><path d="M-2.6 4.4 Q-1.3 5.8 0 4.4 Q1.3 5.8 2.6 4.4" fill="none" stroke="#2e2a33" stroke-width="1" stroke-linecap="round"/>
      <ellipse cx="-8" cy="3.4" rx="1.8" ry="1.1" fill="#f6a9bb" opacity=".85"/><ellipse cx="8" cy="3.4" rx="1.8" ry="1.1" fill="#f6a9bb" opacity=".85"/>`,
    happy: `${happyEyes('#2e2a33')}<path d="M-1.6 1.6 H1.6 L0 3.2 Z" fill="#2e2a33"/>`,
  };

  // ---------- Jiniret: a white ferret, round pink-lined ears, pink nose, whiskers and a beauty mark ----------
  const jiniret = {
    fill: '#FBFAF7', line: '#3e3036', shine: '#FFFFFF',
    top: `<circle cx="-9" cy="-9.5" r="4.6" fill="#FBFAF7" stroke="#3e3036" stroke-width="1.8"/><circle cx="-9" cy="-9.5" r="2.4" fill="#f6b3c4"/>
      <circle cx="9" cy="-9.5" r="4.6" fill="#FBFAF7" stroke="#3e3036" stroke-width="1.8"/><circle cx="9" cy="-9.5" r="2.4" fill="#f6b3c4"/>`,
    face: `<g class="eyes"><ellipse cx="-4.6" cy="-1.4" rx="1.9" ry="2.3" fill="#231c22"/><ellipse cx="4.6" cy="-1.4" rx="1.9" ry="2.3" fill="#231c22"/>
      <circle cx="-4" cy="-2.2" r=".7" fill="#fff"/><circle cx="5.2" cy="-2.2" r=".7" fill="#fff"/></g>
      <ellipse cy="2" rx="1.7" ry="1.2" fill="#f28daa"/>
      <path d="M-2.2 4.2 Q0 5.6 2.8 3.6" fill="none" stroke="#3e3036" stroke-width="1" stroke-linecap="round"/>
      <path d="M-5 2.6 H-10.5 M-5 4 L-10 5.6 M5 2.6 H10.5 M5 4 L10 5.6" stroke="#f4a9bd" stroke-width=".8" stroke-linecap="round"/>
      <circle cx="6.6" cy="1.2" r=".65" fill="#231c22"/>`,
    happy: `${happyEyes('#231c22')}<ellipse cy="2" rx="1.7" ry="1.2" fill="#f28daa"/><circle cx="6.6" cy="1.2" r=".65" fill="#231c22"/>`,
  };

  // ---------- Gliddy (every version): tan head with the white face mask, the X eye and the sleepy purple eye ----------
  function gliddy({ fur = '#EEB27A', ear = '#E19A5A', lid = '#D98A48', nose = '#C7773F', line = '#4a2c18', shine = '#FFE2C4', plush = false, real = false, mini = false } = {}) {
    const base = plush
      ? fuzzy(fur, line) + `<path d="M-12.6 1.6 Q0 -2.6 12.6 1.6 A13 13 0 0 1 -12.6 1.6 Z" fill="#FBF8F2"/>` + `<path d="M0 -12.4 V-8" stroke="${line}" stroke-width=".7" stroke-dasharray="1 1" opacity=".6"/>`
      : circle(real ? 'url(#cur-shade)' : fur, line) + `<path d="M-12.4 1.6 Q0 -2.6 12.4 1.6 A13 13 0 0 1 -12.4 1.6 Z" fill="#FBF8F2"/>`;
    const ears = [-1, 1].map((s) => `<circle cx="${9.6 * s}" cy="-9.6" r="4.6" fill="${ear}" stroke="${line}" stroke-width="1.8"/><circle cx="${9.6 * s}" cy="-9.6" r="2.2" fill="#fcefe4"/>`).join('');
    const tuft = `<path class="hair" d="M-2.5 -12.4 C -1 -21, 5 -22, 3.4 -15.5 C 6 -18, 8 -15, 4.5 -12.2" fill="${fur}" stroke="${line}" stroke-width="1.5" stroke-linejoin="round"/>`;
    // Each version's signature: the classic rides his skateboard, the realistic one wears his collar and tie, the
    // plushies have their sewn-in heart tag, and the mini hangs from its key ring.
    const ring = mini
      ? `<path d="M-6 -13.6 v-2.4" stroke="#d8463a" stroke-width="1.8"/><circle cx="-6" cy="-21" r="5" fill="none" stroke="#b9bfc8" stroke-width="2"/>
         <path d="M-6 -26 v-2.5 M-6 -29.5 v-2.5" stroke="#b9bfc8" stroke-width="1.6" stroke-linecap="round"/>`
      : '';
    const extra = mini || plush
      ? `<g transform="rotate(-12 11 9)"><rect x="9" y="7" width="6.4" height="8" rx="1" fill="#fff" stroke="${line}" stroke-width=".9"/>
         <path d="M12.2 12.6 l-1.6 -1.6 a1 1 0 0 1 1.6 -1.2 a1 1 0 0 1 1.6 1.2 Z" fill="#d8463a"/></g>`
      : real
        ? `<path d="M-6 11.6 L0 14.6 L6 11.6 L4 16.4 L0 14.8 L-4 16.4 Z" fill="#fff" stroke="#9a9aa4" stroke-width=".7" stroke-linejoin="round"/>
           <path d="M-1.3 14.6 H1.3 L1.9 20 L0 22 L-1.9 20 Z" fill="#3b4566"/>`
        : `<rect x="-11" y="14.4" width="22" height="3.2" rx="1.6" fill="#d8463a" stroke="#4a1a14" stroke-width=".9"/>
           <circle cx="-6.5" cy="19.2" r="1.7" fill="#f2f2ef" stroke="#555" stroke-width=".6"/><circle cx="6.5" cy="19.2" r="1.7" fill="#f2f2ef" stroke="#555" stroke-width=".6"/>`;
    const xeye = `<ellipse cx="-5" cy="-2" rx="4.5" ry="5" fill="#FBF8F2" stroke="#1b1a1e" stroke-width="1.1"/>
      <path d="M-7 -4.2 L-3 0.2 M-3 -4.2 L-7 0.2" stroke="#1b1a1e" stroke-width="1.6" stroke-linecap="round"/>`;
    const sleepy = `<ellipse cx="5.2" cy="-2" rx="4.4" ry="4.9" fill="#FBF8F2" stroke="#1b1a1e" stroke-width="1.1"/>
      <circle cx="5.2" cy="0.2" r="2.5" fill="#6f45c4"/><circle cx="5.2" cy="0.4" r="1.1" fill="#3a2170"/>
      <path d="M0.8 -1.8 A4.4 4.9 0 0 1 9.6 -1.8 Z" fill="${lid}" stroke="#1b1a1e" stroke-width="1.1" stroke-linejoin="round"/>`;
    const nm = `<ellipse cx="0.2" cy="2.4" rx="1.1" ry=".8" fill="${nose}"/>
      <path d="M-2.2 4 Q-1.1 5.3 0 4 Q1.1 5.3 2.2 4" fill="none" stroke="#5b1e2a" stroke-width=".9" stroke-linecap="round"/>`;
    return {
      fill: fur, line, shine,
      base: extra + base, top: ears + tuft + ring,
      face: `<g class="eyes">${xeye}${sleepy}</g>${nm}`,
      happy: `${xeye}<path d="M1.6 -1.6 Q5.2 -5 8.8 -1.6" fill="none" stroke="#1b1a1e" stroke-width="1.6" stroke-linecap="round"/>${nm}`,
    };
  }

  // ---------- CORTIS: fuzzy balls with one big embroidered eye, one tiny eye, an open pink mouth and a party hat ----------
  function cortis(c) {
    const face = `<path d="M-9 -3.6 C -9 -8, -2 -8.4, -1.4 -4 C -1 -0.6, -3.4 1.6, -6 1.2 C -8.4 0.8, -9 -1, -9 -3.6 Z" fill="${c.sclera}" stroke="${c.rim}" stroke-width=".7"/>
      <circle cx="-4.8" cy="-3" r="1.9" fill="${c.pupil}"/><circle cx="-4.2" cy="-3.6" r=".6" fill="#fff"/>
      <circle cx="5.6" cy="-3.4" r="1" fill="${c.tiny}"/>
      <path d="M0.4 3 C 1.6 1.6, 5.8 1.8, 6.4 3.6 C 6.8 5.6, 4.6 7.4, 2.8 6.8 C 1 6.2, -0.6 4.6, 0.4 3 Z" fill="${c.mouth}"/>`;
    return {
      fill: c.fur, line: c.rim, shine: '#ffffff',
      base: fuzzy(c.fur, c.rim) + [[-10, 6], [10, 5], [-5, 11], [6, 10.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="${c.bobble}" opacity=".55"/>`).join(''),
      top: `<path d="M-5.6 -11 L0.6 -25 L6.4 -11 Z" fill="${c.hat}" stroke="${c.rim}" stroke-width="1.4" stroke-linejoin="round"/>
        <circle cx="-1.6" cy="-15" r=".9" fill="#fff"/><circle cx="2.4" cy="-19" r=".9" fill="#fff"/><circle cx="1.4" cy="-13.4" r=".9" fill="#fff"/>
        <circle cx="0.6" cy="-25.4" r="2.6" fill="${c.bobble}" stroke="${c.rim}" stroke-width="1" stroke-dasharray=".8 .8"/>`,
      face,
      happy: `<path d="M-8.6 -2.4 Q-5 -6.4 -1.6 -2.4" fill="none" stroke="${c.pupil}" stroke-width="1.6" stroke-linecap="round"/><circle cx="5.6" cy="-3.4" r="1" fill="${c.tiny}"/>
        <path d="M0.4 3 C 1.6 1.6, 5.8 1.8, 6.4 3.6 C 6.8 5.6, 4.6 7.4, 2.8 6.8 C 1 6.2, -0.6 4.6, 0.4 3 Z" fill="${c.mouth}"/>`,
    };
  }
  const CORTIS = {
    yellow: { fur: '#f2df3a', bobble: '#f0a03e', mouth: '#f39a2e', rim: '#a8661a', sclera: '#fbf8ef', pupil: '#2a201c', tiny: '#2a201c', hat: '#f0a24a' },
    white: { fur: '#e4e4e8', bobble: '#c2c3c9', mouth: '#a3a4ac', rim: '#6e6f78', sclera: '#efe7d8', pupil: '#2a201c', tiny: '#2a201c', hat: '#5cbd78' },
    blue: { fur: '#86ade9', bobble: '#4a7fdf', mouth: '#3b6ed6', rim: '#2c58b4', sclera: '#fbf8ef', pupil: '#5a3422', tiny: '#5a3422', hat: '#5a72cb' },
    pink: { fur: '#f2b5c2', bobble: '#d9758b', mouth: '#f597b0', rim: '#c0566f', sclera: '#fdfaf3', pupil: '#6a3a22', tiny: '#6a3a22', hat: '#cf3f63' },
    green: { fur: '#9fd78f', bobble: '#4fb05c', mouth: '#46a656', rim: '#2f8a40', sclera: '#fbf8ef', pupil: '#2a201c', tiny: '#2a201c', hat: '#f2c94c' },
  };

  const plush = (fur, ear, lid, nose, line) => gliddy({ fur, ear, lid, nose, line, shine: '#ffffff', plush: true });
  window.CURSOR_THEMES = {
    bbokari, bee, axolotl, wolfchan, jiniret,
    gliddy: gliddy(),
    gliddyReal: gliddy({ real: true, line: '#2e1c10' }),
    gliddyPlush: gliddy({ plush: true, shine: '#ffffff' }),
    gliddyPlushStrawberry: plush('#f3a0b5', '#e7849d', '#e0789a', '#d06a8a', '#7a3048'),
    gliddyPlushMint: plush('#92d9bd', '#74c6a6', '#62b896', '#4f9e80', '#2b5c4a'),
    gliddyPlushMidnight: plush('#9a90c2', '#8579b4', '#7a6eb0', '#6a5f9c', '#3a335c'),
    gliddyPlushChoco: plush('#a8754e', '#956541', '#8a5a38', '#7a4c2e', '#3e2414'),
    gliddyPlushMini: { ...gliddy({ plush: true, mini: true, shine: '#ffffff' }) },
    cortisYellow: cortis(CORTIS.yellow), cortisWhite: cortis(CORTIS.white), cortisBlue: cortis(CORTIS.blue),
    cortisPink: cortis(CORTIS.pink), cortisGreen: cortis(CORTIS.green),
  };
})();
