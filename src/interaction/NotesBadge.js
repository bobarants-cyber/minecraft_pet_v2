import { PIXELS_PER_UNIT } from '../core/Stage.js';

const pad = (n) => String(n).padStart(2, '0');

/** A small "📝 Taking notes · Math · 12:03 · Stop" pill above the pet while a notes session runs. */
export class NotesBadge {
  constructor({ character, host, parent = document.body }) {
    this.character = character;
    this.host = host;
    this.state = { active: false };
    this.lines = 0;
    this.el = document.createElement('div');
    this.el.className = 'notes-badge';
    this.el.innerHTML = `
      <span class="notes-badge__dot"></span>
      <span class="notes-badge__text"></span>
      <button type="button" class="notes-badge__stop">Stop</button>
    `;
    this.text = this.el.querySelector('.notes-badge__text');
    this.stopBtn = this.el.querySelector('.notes-badge__stop');
    this.stopBtn.addEventListener('click', () => this.host?.stopNotes());
    parent.appendChild(this.el);
  }

  get visible() {
    return this.state.active || this.state.writing;
  }

  set(state) {
    this.state = state;
    if (state.active) {
      this.lines = 0;
      this.problem = null;
    }
  }

  line() {
    this.lines++;
    // A little sign of life now and then while listening.
    if (this.lines % 6 === 0) this.character.emote('note', Math.random() < 0.5 ? -0.5 : 0.5);
  }

  notice(text, isProblem) {
    if (this.state.active) this.problem = isProblem ? text : null;
    if (this.state.active && !isProblem && text) this.hint = text;
  }

  contains(node) {
    return this.el.contains(node);
  }

  containsPoint(x, y) {
    if (!this.visible) return false;
    const r = this.el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  update(hidden = false) {
    const show = this.visible && !hidden;
    if (show !== this.el.classList.contains('on')) {
      this.el.classList.toggle('on', show);
      this.shown = null;
    }
    if (!show) return;
    const s = this.state;
    this.el.classList.toggle('writing', !!s.writing);
    this.el.classList.toggle('problem', !!this.problem);
    let text;
    if (s.writing) text = `✍️ Writing your ${s.title ? `${s.title} ` : ''}notes…`;
    else if (this.problem) text = `📝 ${this.problem}`;
    else {
      const secs = Math.floor((Date.now() - s.startedAt) / 1000);
      const time = `${Math.floor(secs / 60)}:${pad(secs % 60)}`;
      const lines = this.lines || secs < 40 ? `${this.lines} line${this.lines === 1 ? '' : 's'}` : 'nothing heard yet: is the sound on Multi-Output Device?';
      text = `📝 Taking notes${s.title && s.title !== 'Notes' ? ` · ${s.title}` : ''} · ${time} · ${lines}`;
    }
    // Only touch the page when something changed (the timer ticks once a second), so it isn't redrawn every frame.
    if (text !== this.shown) {
      this.text.textContent = text;
      this.shown = text;
      this.width = this.el.offsetWidth;
      this.height = this.el.offsetHeight;
    }
    const stopDisplay = s.writing ? 'none' : '';
    if (this.stopBtn.style.display !== stopDisplay) this.stopBtn.style.display = stopDisplay;
    // Just above the pet's head.
    const c = this.character;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const x = W / 2 + c.loco.x * PIXELS_PER_UNIT;
    const floor = H / 2 - c.placement.floorY * PIXELS_PER_UNIT;
    const top = floor - (c.mob.height * c.placement.scale + c.lift) * PIXELS_PER_UNIT;
    const w = this.width ?? this.el.offsetWidth;
    const left = Math.round(Math.max(10, Math.min(W - w - 10, x - w / 2)));
    const y = Math.round(Math.max(10, top - (this.height ?? this.el.offsetHeight) - 10));
    const transform = `translate(${left}px, ${y}px)`;
    if (transform !== this.transform) {
      this.el.style.transform = transform;
      this.transform = transform;
    }
  }
}
