// The home screen page (on the desktop, or in front with ⌃⌥H) and its editor.
import { createLiquidGlass, GLASS_DEFAULTS } from './liquidglass.js';
import { createWallpaper, GRADIENTS, ANIMATED } from './wallpapers.js';
import { WIDGETS } from './widgets.js';
import { SAVER_LIST } from './savers.js';

const host = window.homeHost;
const q = new URLSearchParams(location.search);
const MODE = q.get('mode') || 'front';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let config, petName = 'Bbokari';
let editing = false;
let dirty = true;
let wallpaper = null;
const mounted = new Map(); // widget id → { el, inst }
const canvas = $('#glass');
const glass = createLiquidGlass(canvas);
if (!glass) document.body.classList.add('css-glass');

// Glass looks you can pick in one click (values from Liquid Glass Studio's sliders).
const PRESETS = {
  Clear: {},
  Frosted: { blurRadius: 30, tint: { r: 255, g: 255, b: 255, a: 0.18 }, refDispersion: 3 },
  Thick: { refThickness: 45, refDistance: 0.09, refFactor: 1.8, blurRadius: 18 },
  Rainbow: { refDispersion: 40, refThickness: 32, refDistance: 0.08, glareFactor: 110 },
  Soft: { refThickness: 12, refDistance: 0.03, glareFactor: 50, blurRadius: 22, shadowFactor: 8 },
  Dark: { tint: { r: 20, g: 22, b: 30, a: 0.45 }, blurRadius: 24, glareFactor: 60 },
  Candy: { tint: { r: 255, g: 120, b: 200, a: 0.25 }, refDispersion: 20, blurRadius: 16 },
  Hacker: { tint: { r: 0, g: 255, b: 110, a: 0.18 }, refDispersion: 12, blurRadius: 20, glareAngle: 45 },
};

const SLIDERS = [
  ['Glass', [
    ['refThickness', 'Thickness', 1, 80, 0.5], ['refDistance', 'Bend', 0, 0.2, 0.001], ['refFactor', 'Refraction', 1, 4, 0.01],
    ['refDispersion', 'Rainbow edge', 0, 50, 0.5], ['blurRadius', 'Frost', 1, 64, 1], ['radius', 'Corners', 4, 80, 1],
    ['roundness', 'Squircle', 2, 7, 0.1], ['merge', 'Melt together', 0, 0.3, 0.01],
  ]],
  ['Light', [
    ['refFresnelFactor', 'Edge glow', 0, 100, 1], ['refFresnelRange', 'Glow size', 0, 100, 1], ['refFresnelHardness', 'Glow sharp', 0, 100, 1],
    ['glareFactor', 'Shine', 0, 120, 1], ['glareRange', 'Shine size', 0, 100, 1], ['glareHardness', 'Shine sharp', 0, 100, 1],
    ['glareConvergence', 'Shine focus', 0, 100, 1], ['glareOppositeFactor', 'Back shine', 0, 100, 1], ['glareAngle', 'Light angle', -180, 180, 1],
  ]],
  ['Shadow', [['shadowFactor', 'Strength', 0, 100, 1], ['shadowExpand', 'Spread', 2, 100, 1], ['shadowX', 'Left/right', -20, 20, 1], ['shadowY', 'Up/down', -20, 20, 1]]],
];

// The home screen's starting look: thinner rims than the studio's demo, so widgets read cleanly; only widgets that
// almost touch melt together.
const HOME_GLASS = { ...GLASS_DEFAULTS, refThickness: 14, glareFactor: 70, refFresnelFactor: 14, merge: 0.015, blurRadius: 18, radius: 28, tint: { r: 255, g: 255, b: 255, a: 0.1 } };
const glassParams = () => ({ ...HOME_GLASS, ...(config.glass ?? {}), tint: { ...HOME_GLASS.tint, ...(config.glass?.tint ?? {}) } });

// ---------- saving ----------
let saveTimer;
function save(patch, now = false) {
  Object.assign(config, patch);
  clearTimeout(saveTimer);
  const go = () => host.save(patch);
  now ? go() : (saveTimer = setTimeout(go, 350));
}
const saveWidgets = () => save({ widgets: config.widgets });

// ---------- wallpaper ----------
async function loadWallpaper() {
  wallpaper = createWallpaper(config.wallpaper, innerWidth, innerHeight);
  await wallpaper.ready;
  if (glass) glass.setBackground(wallpaper.canvas);
  else canvas.style.backgroundImage = `url(${wallpaper.canvas.toDataURL('image/jpeg', 0.9)})`;
  dirty = true;
}

// ---------- widgets ----------
function placeWidget(w, el) {
  const W = innerWidth, H = innerHeight;
  const ww = Math.min(w.w, W - 16), hh = Math.min(w.h, H - 16);
  const x = Math.max(8, Math.min(W - ww - 8, w.x * W));
  const y = Math.max(8, Math.min(H - hh - 8, w.y * H));
  Object.assign(el.style, { left: x + 'px', top: y + 'px', width: ww + 'px', height: hh + 'px' });
}

function mountWidget(w) {
  const def = WIDGETS[w.type];
  if (!def) return;
  const el = document.createElement('div');
  el.className = 'widget';
  el.dataset.id = w.id;
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;position:relative';
  el.append(body);
  const x = Object.assign(document.createElement('button'), { className: 'x', textContent: '✕', title: 'Remove' });
  const rs = Object.assign(document.createElement('div'), { className: 'rs', title: 'Drag to resize' });
  el.append(x, rs);
  $('#widgets').append(el);
  placeWidget(w, el);
  const ctx = {
    host, petName,
    get opts() { return w.opts ?? {}; },
    setOpts(patch) { w.opts = { ...(w.opts ?? {}), ...patch }; saveWidgets(); remount(w); },
    edit: () => editing,
  };
  if (def === WIDGETS.photo) { body.style.position = 'absolute'; body.style.inset = '0'; body.className = 'photo-w'; }
  const inst = def.mount(body, ctx) ?? {};
  mounted.set(w.id, { el, inst, w });
  x.onclick = (e) => { e.stopPropagation(); removeWidget(w.id); };
  rs.onpointerdown = (e) => startResize(e, w, el, def);
  el.onpointerdown = (e) => editing && e.target !== rs && e.target !== x && !e.target.closest('.pick') && startDrag(e, w, el);
}

function unmount(id) {
  const m = mounted.get(id);
  if (!m) return;
  m.inst.stop?.();
  m.el.remove();
  mounted.delete(id);
}
function remount(w) { unmount(w.id); mountWidget(w); dirty = true; }
function mountAll() {
  for (const id of [...mounted.keys()]) unmount(id);
  for (const w of config.widgets) mountWidget(w);
  dirty = true;
}
function removeWidget(id) {
  unmount(id);
  config.widgets = config.widgets.filter((w) => w.id !== id);
  saveWidgets();
  dirty = true;
}
function addWidget(type) {
  const def = WIDGETS[type];
  const [w, h] = def.size;
  const n = config.widgets.length;
  const wd = { id: 'w' + Date.now().toString(36), type, x: 0.35 + (n % 5) * 0.02, y: 0.3 + (n % 5) * 0.03, w, h };
  config.widgets.push(wd);
  mountWidget(wd);
  saveWidgets();
  dirty = true;
}

// drag & resize (snaps to a 10 px grid; the glass follows live)
const snap = (v) => Math.round(v / 10) * 10;
function startDrag(e, w, el) {
  e.preventDefault();
  el.classList.add('dragging');
  el.setPointerCapture(e.pointerId);
  const ox = e.clientX - el.offsetLeft, oy = e.clientY - el.offsetTop;
  el.onpointermove = (ev) => {
    w.x = Math.max(0, snap(ev.clientX - ox)) / innerWidth;
    w.y = Math.max(0, snap(ev.clientY - oy)) / innerHeight;
    placeWidget(w, el);
    dirty = true;
  };
  el.onpointerup = () => { el.classList.remove('dragging'); el.onpointermove = el.onpointerup = null; saveWidgets(); };
}
function startResize(e, w, el, def) {
  e.preventDefault(); e.stopPropagation();
  const rs = e.target;
  rs.setPointerCapture(e.pointerId);
  const sx = e.clientX, sy = e.clientY, sw = w.w, sh = w.h;
  rs.onpointermove = (ev) => {
    w.w = Math.max(def.min[0], snap(sw + ev.clientX - sx));
    w.h = Math.max(def.min[1], snap(sh + ev.clientY - sy));
    placeWidget(w, el);
    mounted.get(w.id)?.inst.refresh?.();
    dirty = true;
  };
  rs.onpointerup = () => { rs.onpointermove = rs.onpointerup = null; saveWidgets(); };
}

// ---------- the glass ----------
function shapes() {
  const r = glassParams().radius;
  return [...mounted.values()].map(({ el }) => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, r }));
}

let last = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const moving = wallpaper?.animated && !document.hidden;
  if (!dirty && !moving && !editing) return;
  if (t - last < (moving && !editing ? 40 : 16)) return; // ~25 fps for moving wallpapers, smooth while editing
  last = t;
  if (moving) { wallpaper.draw(t / 1000); glass?.setBackground(wallpaper.canvas); }
  if (glass) {
    glass.setParams(glassParams());
    glass.setShapes(shapes());
    glass.render();
  } else if (moving) canvas.style.backgroundImage = `url(${wallpaper.canvas.toDataURL('image/jpeg', 0.7)})`;
  document.documentElement.style.setProperty('--r', glassParams().radius + 'px');
  dirty = false;
}

// ---------- editor ----------
function setEditing(on) {
  editing = on;
  document.body.classList.toggle('editing', on);
  $('#toolbar').hidden = !on;
  if (!on) closePanel();
  for (const m of mounted.values()) m.inst.refresh?.();
  dirty = true;
}

let openPanelName = null;
function closePanel() {
  openPanelName = null;
  $('#panel').hidden = true;
  document.querySelectorAll('#toolbar [data-panel]').forEach((b) => b.classList.remove('on'));
  dirty = true;
}
function openPanel(name) {
  if (openPanelName === name) return closePanel();
  openPanelName = name;
  document.querySelectorAll('#toolbar [data-panel]').forEach((b) => b.classList.toggle('on', b.dataset.panel === name));
  const p = $('#panel');
  p.hidden = false;
  PANELS[name](p);
  dirty = true;
}

const slider = (key, label, min, max, step, value, onInput) => {
  const row = document.createElement('label');
  row.className = 'sl';
  row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output>${+(+value).toFixed(step < 0.1 ? 2 : 0)}</output>`;
  const [input, out] = [row.querySelector('input'), row.querySelector('output')];
  input.oninput = () => { out.textContent = +(+input.value).toFixed(step < 0.1 ? 2 : 0); onInput(+input.value); };
  return row;
};
const toggle = (label, on, onChange) => {
  const row = document.createElement('label');
  row.className = 'toggle';
  row.innerHTML = `<span>${label}</span><input type="checkbox" ${on ? 'checked' : ''}>`;
  row.querySelector('input').onchange = (e) => onChange(e.target.checked);
  return row;
};

const PANELS = {
  add(p) {
    p.innerHTML = '<h3>Add a widget</h3><div class="cards"></div>';
    const cards = p.querySelector('.cards');
    for (const [type, def] of Object.entries(WIDGETS)) {
      const b = document.createElement('button');
      b.className = 'card';
      b.innerHTML = `<span>${def.icon}</span>${esc(def.label)}`;
      b.onclick = () => addWidget(type);
      cards.append(b);
    }
  },
  wall(p) {
    p.innerHTML = '<h3>Wallpaper</h3><h4>Colors</h4><div class="swatches"></div><h4>Moving</h4><div class="chips moving"></div><h4>Your photo</h4><button class="big-btn photo">📷 Choose a photo…</button><h4>Text</h4>';
    const sw = p.querySelector('.swatches');
    for (const name of Object.keys(GRADIENTS)) {
      const c = createWallpaper({ type: 'gradient', value: name }, 140, 100).canvas;
      const b = document.createElement('button');
      b.className = 'sw' + (config.wallpaper.type === 'gradient' && config.wallpaper.value === name ? ' on' : '');
      b.title = name;
      b.style.backgroundImage = `url(${c.toDataURL()})`;
      b.onclick = () => setWallpaper({ type: 'gradient', value: name }, p);
      sw.append(b);
    }
    const mv = p.querySelector('.moving');
    for (const [name, label] of Object.entries(ANIMATED)) {
      const b = document.createElement('button');
      b.textContent = label;
      b.classList.toggle('on', config.wallpaper.type === 'animated' && config.wallpaper.value === name);
      b.onclick = () => setWallpaper({ type: 'animated', value: name }, p);
      mv.append(b);
    }
    p.querySelector('.photo').onclick = async () => {
      const [photo] = await host.pickPhotos({ multiple: false });
      if (photo) setWallpaper({ type: 'photo', value: photo }, p);
    };
    p.append(toggle('Dark text (for light wallpapers)', config.textDark, (on) => { save({ textDark: on }); document.body.classList.toggle('dark', on); }));
    p.append(toggle('Show on my desktop', config.on, (on) => { config.on = on; host.action('deskOn', on); }));
  },
  glass(p) {
    p.innerHTML = '<h3>Liquid Glass</h3><h4>Looks</h4><div class="chips presets"></div>';
    const pr = p.querySelector('.presets');
    for (const [name, vals] of Object.entries(PRESETS)) {
      const b = document.createElement('button');
      b.textContent = name;
      b.onclick = () => { save({ glass: { ...vals } }); dirty = true; PANELS.glass(p); };
      pr.append(b);
    }
    const g = glassParams();
    for (const [group, list] of SLIDERS) {
      const h = document.createElement('h4');
      h.textContent = group;
      p.append(h);
      for (const [key, label, min, max, step] of list) {
        p.append(slider(key, label, min, max, step, g[key], (v) => { save({ glass: { ...(config.glass ?? {}), [key]: v } }); dirty = true; }));
      }
    }
    const h = document.createElement('h4');
    h.textContent = 'Tint';
    p.append(h);
    const row = document.createElement('label');
    row.className = 'sl';
    row.innerHTML = `<span>Color</span><input type="color" value="#${[g.tint.r, g.tint.g, g.tint.b].map((v) => v.toString(16).padStart(2, '0')).join('')}"><span></span>`;
    row.querySelector('input').oninput = (e) => {
      const hex = e.target.value;
      const tint = { ...glassParams().tint, r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
      save({ glass: { ...(config.glass ?? {}), tint } }); dirty = true;
    };
    p.append(row);
    p.append(slider('tintA', 'Amount', 0, 1, 0.01, g.tint.a, (v) => { save({ glass: { ...(config.glass ?? {}), tint: { ...glassParams().tint, a: v } } }); dirty = true; }));
    p.append(toggle('Frost the edges too', g.blurEdge, (on) => { save({ glass: { ...(config.glass ?? {}), blurEdge: on } }); dirty = true; }));
    const credit = document.createElement('p');
    credit.className = 'muted';
    credit.style.cssText = 'font-size:10px;margin-top:14px;color:rgba(255,255,255,.6)';
    credit.textContent = 'Glass from Liquid Glass Studio · MIT © 2024 Charles Yin';
    p.append(credit);
  },
  saver(p) {
    const s = config.saver;
    p.innerHTML = '<h3>Screen saver</h3><div class="chips kinds"></div>';
    const kinds = p.querySelector('.kinds');
    for (const [kind, label] of SAVER_LIST) {
      const b = document.createElement('button');
      b.textContent = label;
      b.classList.toggle('on', s.kind === kind);
      b.onclick = () => { save({ saver: { ...config.saver, kind } }, true); PANELS.saver(p); };
      kinds.append(b);
    }
    p.append(toggle('Start when I’m away', s.on, (on) => save({ saver: { ...config.saver, on } }, true)));
    p.append(slider('after', 'After (min)', 1, 30, 1, s.after, (v) => save({ saver: { ...config.saver, after: v } })));
    const prev = document.createElement('button');
    prev.className = 'big-btn';
    prev.textContent = '▶︎ Preview';
    prev.onclick = () => host.action('saver', config.saver.kind);
    p.append(prev);
    if (s.kind === 'photos') {
      const pick = document.createElement('button');
      pick.className = 'big-btn';
      pick.textContent = `📷 Choose photos (${(s.photos ?? []).length})`;
      pick.onclick = async () => { const photos = await host.pickPhotos({ multiple: true }); if (photos.length) { save({ saver: { ...config.saver, photos } }, true); PANELS.saver(p); } };
      p.append(pick);
    }
  },
};

async function setWallpaper(spec, panel) {
  save({ wallpaper: spec }, true);
  await loadWallpaper();
  if (panel) PANELS.wall(panel);
}

// ---------- coming and going ----------
function leave() {
  if (MODE !== 'front') return;
  document.body.classList.add('leaving');
  setTimeout(() => host.action('leave'), 260);
}

document.querySelectorAll('#toolbar [data-panel]').forEach((b) => (b.onclick = () => openPanel(b.dataset.panel)));
$('#done').onclick = () => setEditing(false);
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (openPanelName) closePanel();
  else if (editing) setEditing(false);
  else leave();
});
document.addEventListener('dblclick', (e) => { if (MODE === 'front' && (e.target === canvas || e.target.id === 'widgets')) setEditing(!editing); });
addEventListener('resize', () => { for (const m of mounted.values()) placeWidget(m.w, m.el); loadWallpaper(); });
host.onConfig((c) => {
  const wallChanged = JSON.stringify(c.wallpaper) !== JSON.stringify(config.wallpaper);
  const widgetsChanged = JSON.stringify(c.widgets) !== JSON.stringify(config.widgets);
  config = c;
  document.body.classList.toggle('dark', !!c.textDark);
  if (wallChanged) loadWallpaper();
  if (widgetsChanged && !editing) mountAll();
  dirty = true;
});
host.onEdit((on) => setEditing(on));
host.onLeave(leave);

(async () => {
  const r = await host.get();
  config = r.config;
  petName = r.name;
  document.body.classList.toggle('dark', !!config.textDark);
  if (MODE === 'front') { document.body.classList.add('entering'); $('#hint').hidden = false; setTimeout(() => ($('#hint').style.opacity = 0), 4000); }
  await loadWallpaper();
  mountAll();
  requestAnimationFrame(frame);
  requestAnimationFrame(() => document.body.classList.remove('entering'));
  if (q.get('edit') === '1') setEditing(true);
})();
