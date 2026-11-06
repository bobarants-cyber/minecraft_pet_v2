import { PIXELS_PER_UNIT } from '../core/Stage.js';

const pad = (n) => String(n).padStart(2, '0');

/** "🍅 Focus · 18:42 · Stop" above the pet while a focus timer runs (stacked above the notes badge if both show). */
export class FocusBadge {
  constructor({ character, host, parent = document.body }) {
    this.character = character;
    this.host = host;
    this.state = { active: false };
    this.el = document.createElement('div');
    this.el.className = 'notes-badge focus-badge';
    this.el.innerHTML = '<span class="notes-badge__text"></span><button type="button" class="notes-badge__stop">Stop</button>';
    this.text = this.el.querySelector('.notes-badge__text');
    this.el.querySelector('button').addEventListener('click', () => this.host?.ask?.({ text: 'stop focus' }));
    parent.appendChild(this.el);
  }

  get visible() {
    return !!this.state.active;
  }

  set(state) {
    this.state = state;
  }

  contains(node) {
    return this.el.contains(node);
  }

  containsPoint(x, y) {
    if (!this.visible) return false;
    const r = this.el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  update(hidden = false, stackAbove = false) {
    const show = this.visible && !hidden;
    if (show !== this.el.classList.contains('on')) this.el.classList.toggle('on', !!show);
    if (!show) return;
    const left = Math.max(0, this.state.endAt - Date.now());
    const secs = Math.ceil(left / 1000);
    const text = `🍅 Focus · ${Math.floor(secs / 60)}:${pad(secs % 60)}`;
    if (text !== this.shown) {
      this.text.textContent = text;
      this.shown = text;
      this.w = this.el.offsetWidth;
      this.h = this.el.offsetHeight;
    }
    const c = this.character;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const x = W / 2 + c.loco.x * PIXELS_PER_UNIT;
    const floor = H / 2 - c.placement.floorY * PIXELS_PER_UNIT;
    const top = floor - (c.mob.height * c.placement.scale + c.lift) * PIXELS_PER_UNIT;
    const lx = Math.round(Math.max(10, Math.min(W - this.w - 10, x - this.w / 2)));
    const ly = Math.round(Math.max(10, top - this.h - 10 - (stackAbove ? this.h + 8 : 0)));
    const tr = `translate(${lx}px, ${ly}px)`;
    if (tr !== this.tr) {
      this.el.style.transform = tr;
      this.tr = tr;
    }
  }
}
