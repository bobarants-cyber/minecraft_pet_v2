import * as THREE from 'three';
import { MOBS } from '../mobs/index.js';
import { OUTFITS } from './Outfits.js';
import { PIXELS_PER_UNIT } from '../core/Stage.js';

/**
 * The mob customizer: make your own versions of any pet. Recolour each of its colours (fur, ears, eyes, cheeks,
 * clothes…), change its size, head size and chubbiness, give it an outfit and K-pop items, name it, and save as many
 * as you like. Saved ones are mobs like the others ("custom:<id>"), in the menus and the mob switcher.
 *
 * A custom mob: { id, name, base, colors: { '#origHex': '#newHex' }, size, head, chub, outfit, kpopHand, kpopHead }.
 */

// ---------- colours ----------
const _c = new THREE.Color();
const hexOf = (r, g, b) => `#${_c.setRGB(r, g, b, THREE.LinearSRGBColorSpace).getHexString()}`;
function skinnedMesh(mob) {
  let mesh = mob.parts?.mesh ?? null;
  if (!mesh) mob.root.traverse((o) => { if (!mesh && o.isSkinnedMesh && !o.userData.furShell) mesh = o; });
  return mesh;
}
/** The model's original vertex colours as plain 0–1 numbers (kept, so recolouring always starts from them). The
 *  compressed models store colours as packed integers: getX/getY/getZ unpack them. */
function origColors(mesh, col) {
  if (mesh.userData.origColors) return mesh.userData.origColors;
  const a = new Float32Array(col.count * 3);
  for (let i = 0; i < col.count; i++) { a[i * 3] = col.getX(i); a[i * 3 + 1] = col.getY(i); a[i * 3 + 2] = col.getZ(i); }
  return (mesh.userData.origColors = a);
}
/** The model's vertex colours as a palette: its main colours, most-used first (merged when nearly the same). */
export function paletteOf(mob) {
  const mesh = skinnedMesh(mob);
  const col = mesh?.geometry?.getAttribute('color');
  if (!col) return [];
  const orig = origColors(mesh, col);
  const n = col.count;
  const bins = new Map();
  for (let i = 0; i < n; i++) {
    const r = orig[i * 3], g = orig[i * 3 + 1], b = orig[i * 3 + 2];
    // bin in sRGB so similar-looking colours group together
    const s = [r, g, b].map((v) => Math.round(Math.pow(Math.max(0, v), 1 / 2.2) * 15));
    const key = s.join(',');
    const e = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    bins.set(key, e);
  }
  const list = [...bins.values()].filter((e) => e.n > n * 0.004).sort((a, b) => b.n - a.n)
    .map((e) => ({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n, n: e.n }));
  // merge near-duplicates (shading of one colour)
  const out = [];
  for (const e of list) {
    const near = out.find((o) => Math.hypot(Math.sqrt(o.r) - Math.sqrt(e.r), Math.sqrt(o.g) - Math.sqrt(e.g), Math.sqrt(o.b) - Math.sqrt(e.b)) < 0.12);
    if (near) near.n += e.n;
    else out.push(e);
  }
  return out.slice(0, 12).map((e) => ({ hex: hexOf(e.r, e.g, e.b), n: e.n }));
}
/** Recolours the model: every vertex close to a palette colour takes the new colour, keeping its own light and shade. */
export function applyColors(mob, colors = {}) {
  const mesh = skinnedMesh(mob);
  const col = mesh?.geometry?.getAttribute('color');
  if (!col) return;
  const orig = origColors(mesh, col);
  const pal = paletteOf(mob).map((p) => {
    const o = new THREE.Color(p.hex);
    const to = colors[p.hex] ? new THREE.Color(colors[p.hex]) : null;
    return { o, to, lum: Math.max(1e-4, o.r * 0.3 + o.g * 0.59 + o.b * 0.11) };
  });
  for (let i = 0; i < col.count; i++) {
    const r = orig[i * 3], g = orig[i * 3 + 1], b = orig[i * 3 + 2];
    let best = null, bd = Infinity;
    for (const p of pal) {
      const d = Math.hypot(Math.sqrt(r) - Math.sqrt(p.o.r), Math.sqrt(g) - Math.sqrt(p.o.g), Math.sqrt(b) - Math.sqrt(p.o.b));
      if (d < bd) { bd = d; best = p; }
    }
    if (best?.to && bd < 0.2) {
      const k = Math.min(1.6, (r * 0.3 + g * 0.59 + b * 0.11) / best.lum);
      col.setXYZ(i, Math.min(1, best.to.r * k), Math.min(1, best.to.g * k), Math.min(1, best.to.b * k));
    } else col.setXYZ(i, r, g, b);
  }
  col.needsUpdate = true;
}

// ---------- shape ----------
/** Size (whole pet), head size and chubbiness (wider body, the head keeps its shape). */
export function applyShape(mob, { size = 1, head = 1, chub = 1 } = {}) {
  const model = mob.parts?.model;
  if (!model) return;
  const base = (model.userData.baseScale ??= model.scale.x);
  model.scale.set(base * size * chub, base * size, base * size * chub);
  const h = mob.parts.head;
  if (h) h.scale.set(head / chub, head, head / chub);
  mob.customSize = size;
}

/** Applies a saved custom mob (once its model has loaded). */
export function applyCustom(mob, preset) {
  if (!preset) return;
  const go = () => { applyColors(mob, preset.colors); applyShape(mob, preset); };
  if (mob.parts?.loaded) go();
  else mob.parts?.ready?.then(go);
}

// ---------- the panel ----------
let counter = 0;
const newId = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export class CustomizerPanel {
  constructor({ character, settings, save, getMob, onOpen = () => {}, parent = document.body }) {
    this.character = character;
    this.settings = settings;
    this.save = save;
    this.getMob = getMob;
    this.onOpen = onOpen;
    this.isOpen = false;
    this.el = document.createElement('div');
    this.el.className = 'cz';
    this.el.innerHTML = `
      <div class="cz__head"><span class="cz__title">🎨 Make your own mob</span><button type="button" class="cz__close" title="Close (Esc)">×</button></div>
      <label class="cz__field">Start from <select class="cz__base">${Object.entries(MOBS).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join('')}</select></label>
      <label class="cz__field">Name <input class="cz__name" maxlength="24" placeholder="My mob" /></label>
      <div class="cz__label">Colours <span class="cz__hint">tap a colour to change it</span></div>
      <div class="cz__colors"></div>
      <div class="cz__label">Shape</div>
      <label class="cz__slider">Size <input type="range" class="cz__size" min="0.6" max="1.4" step="0.02" /></label>
      <label class="cz__slider">Head <input type="range" class="cz__headsz" min="0.75" max="1.35" step="0.02" /></label>
      <label class="cz__slider">Chubby <input type="range" class="cz__chub" min="0.8" max="1.3" step="0.02" /></label>
      <div class="cz__label">Accessories</div>
      <label class="cz__field">Outfit <select class="cz__outfit">${Object.entries(OUTFITS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="cz__check"><input type="checkbox" class="cz__kpop" /> Keep the K-pop items it has on now</label>
      <div class="cz__saved"></div>
      <div class="cz__actions">
        <button type="button" class="cz__btn cz__reset">Reset</button>
        <button type="button" class="cz__btn cz__delete">Delete</button>
        <span class="cz__spacer"></span>
        <button type="button" class="game-btn cz__save">Save</button>
      </div>`;
    const q = (s) => this.el.querySelector(s);
    this.q = q;
    q('.cz__close').addEventListener('click', () => this.close());
    q('.cz__base').addEventListener('change', (e) => { this.draft.base = e.target.value; this.draft.colors = {}; this.#preview(true); });
    q('.cz__name').addEventListener('input', (e) => (this.draft.name = e.target.value));
    for (const [cls, key] of [['.cz__size', 'size'], ['.cz__headsz', 'head'], ['.cz__chub', 'chub']]) q(cls).addEventListener('input', (e) => { this.draft[key] = +e.target.value; this.#preview(); });
    q('.cz__outfit').addEventListener('change', (e) => { this.draft.outfit = e.target.value; this.#preview(); });
    q('.cz__reset').addEventListener('click', () => { Object.assign(this.draft, { colors: {}, size: 1, head: 1, chub: 1, outfit: 'none' }); this.#fill(); this.#preview(); });
    q('.cz__delete').addEventListener('click', () => this.#delete());
    q('.cz__save').addEventListener('click', () => this.#save());
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    parent.appendChild(this.el);
  }

  get visible() { return this.isOpen; }
  contains(node) { return this.el.contains(node); }
  containsPoint(x, y) {
    if (!this.isOpen) return false;
    const r = this.el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /** Opens the panel to edit the current custom mob, or to make a new one from the current pet. */
  open() {
    this.onOpen();
    const cur = String(this.settings.mob);
    const existing = cur.startsWith('custom:') ? (this.settings.customMobs ?? []).find((c) => `custom:${c.id}` === cur) : null;
    this.draft = existing ? JSON.parse(JSON.stringify(existing))
      : { id: null, name: '', base: MOBS[cur] ? cur : 'bbokari', colors: {}, size: 1, head: 1, chub: 1, outfit: this.settings.outfit ?? 'none' };
    this.isOpen = true;
    this.el.classList.add('on');
    this.#fill();
    this.#preview(true);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('on');
    // back to the saved look (drop an unsaved preview)
    this.save({ customPreview: null });
  }

  #fill() {
    const d = this.draft, q = this.q;
    q('.cz__base').value = d.base;
    q('.cz__name').value = d.name ?? '';
    q('.cz__size').value = d.size; q('.cz__headsz').value = d.head; q('.cz__chub').value = d.chub;
    q('.cz__outfit').value = d.outfit ?? 'none';
    q('.cz__kpop').checked = !!(d.kpopHand || d.kpopHead);
    q('.cz__delete').style.display = d.id ? '' : 'none';
    const saved = this.settings.customMobs ?? [];
    q('.cz__saved').innerHTML = saved.length
      ? `<div class="cz__label">Your mobs</div><div class="cz__list">${saved.map((c) => `<button type="button" class="cz__item${c.id === d.id ? ' is-on' : ''}" data-id="${c.id}">${c.name || 'My mob'}</button>`).join('')}</div>`
      : '';
    for (const b of q('.cz__saved').querySelectorAll('.cz__item')) b.addEventListener('click', () => { this.save({ mob: `custom:${b.dataset.id}` }); setTimeout(() => this.open(), 50); });
  }

  /** Shows the draft live on the pet (switching its body when the base changes), then lists its colours. */
  #preview(rebuild = false) {
    this.save({ customPreview: { ...this.draft } });
    const paint = () => {
      const mob = this.getMob();
      if (!mob?.parts?.loaded) return setTimeout(paint, 120);
      applyCustom(mob, this.draft);
      if (rebuild || !this.q('.cz__colors').children.length) this.#colors(mob);
    };
    setTimeout(paint, rebuild ? 250 : 0);
  }

  #colors(mob) {
    const pal = paletteOf(mob);
    const box = this.q('.cz__colors');
    if (!pal.length) { box.innerHTML = '<span class="cz__hint">This pet’s colours can’t be changed yet.</span>'; return; }
    box.innerHTML = pal.map((p) => `<label class="cz__swatch" title="${p.hex}"><input type="color" value="${this.draft.colors[p.hex] ?? p.hex}" data-hex="${p.hex}" /><span style="background:${this.draft.colors[p.hex] ?? p.hex}"></span></label>`).join('');
    for (const inp of box.querySelectorAll('input')) {
      inp.addEventListener('input', () => {
        this.draft.colors[inp.dataset.hex] = inp.value;
        inp.nextElementSibling.style.background = inp.value;
        applyColors(this.getMob(), this.draft.colors);
      });
    }
  }

  #save() {
    const d = this.draft;
    if (!d.name?.trim()) d.name = `My ${MOBS[d.base]?.label ?? 'mob'}`;
    if (this.q('.cz__kpop').checked) { d.kpopHand = this.settings.kpopHand ?? ''; d.kpopHead = this.settings.kpopHead ?? ''; } else { d.kpopHand = ''; d.kpopHead = ''; }
    const list = [...(this.settings.customMobs ?? [])];
    if (!d.id) { d.id = newId(); list.push(d); } else list.splice(list.findIndex((c) => c.id === d.id), 1, d);
    this.save({ customMobs: list, mob: `custom:${d.id}`, customPreview: null });
    this.#fill();
  }

  #delete() {
    const d = this.draft;
    if (!d.id) return;
    const list = (this.settings.customMobs ?? []).filter((c) => c.id !== d.id);
    this.save({ customMobs: list, mob: d.base, customPreview: null });
    this.close();
  }

  update() {
    if (!this.isOpen) return;
    const c = this.character;
    const W = window.innerWidth, H = window.innerHeight;
    const x = W / 2 + c.loco.x * PIXELS_PER_UNIT;
    const half = c.mob.halfWidth * c.placement.scale * PIXELS_PER_UNIT;
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    let left = x + half + 12;
    if (left + w > W - 8) left = x - half - 12 - w;
    left = Math.max(8, Math.min(left, W - w - 8));
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(Math.max(8, H - h - 8))}px`;
  }
}
