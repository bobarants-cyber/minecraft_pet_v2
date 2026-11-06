import { PIXELS_PER_UNIT } from '../core/Stage.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Week shown Monday first. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const EDGE_PX = 12;
const GAP_PX = 16;

const fmt = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

/**
 * "My classes": a small weekly calendar of your online classes, and a form to add or edit one (name, days, times,
 * link). The main process keeps the list and opens each class's link a couple of minutes before it starts.
 */
export class Classes {
  constructor({ character, host, onOpen = () => {}, parent = document.body }) {
    this.character = character;
    this.host = host;
    this.onOpen = onOpen;
    this.isOpen = false;
    this.list = [];
    this.lead = 2;

    this.el = document.createElement('div');
    this.el.className = 'classes';
    this.el.innerHTML = `
      <div class="classes__head">
        <span class="classes__title">📅 My classes</span>
        <button type="button" class="classes__close" aria-label="Close" title="Close (Esc)">×</button>
      </div>
      <div class="classes__view">
        <div class="classes__week"></div>
        <div class="classes__foot">
          <button type="button" class="game-btn classes__add">+ Add a class</button>
          <span class="classes__hint"></span>
        </div>
      </div>
      <form class="classes__form" autocomplete="off">
        <label class="classes__field">Class name<input name="name" maxlength="60" placeholder="Math" required /></label>
        <div class="classes__field">Days<div class="classes__days">
          ${WEEK.map((d) => `<button type="button" class="classes__day" data-day="${d}">${DAYS[d]}</button>`).join('')}
        </div></div>
        <div class="classes__row">
          <label class="classes__field">Starts<input name="start" type="time" required /></label>
          <label class="classes__field">Ends<input name="end" type="time" /></label>
        </div>
        <label class="classes__field">Class link (Zoom, Meet…)<input name="link" placeholder="https://zoom.us/j/…" /></label>
        <div class="classes__error" role="alert"></div>
        <div class="classes__actions">
          <button type="button" class="classes__btn classes__delete">Delete</button>
          <button type="button" class="classes__btn classes__join">Join now</button>
          <span class="classes__spacer"></span>
          <button type="button" class="classes__btn classes__cancel">Cancel</button>
          <button type="submit" class="game-btn">Save</button>
        </div>
      </form>
    `;
    this.week = this.el.querySelector('.classes__week');
    this.form = this.el.querySelector('.classes__form');
    this.errorEl = this.el.querySelector('.classes__error');
    this.hint = this.el.querySelector('.classes__hint');
    this.el.querySelector('.classes__close').addEventListener('click', () => this.close());
    this.el.querySelector('.classes__add').addEventListener('click', () => this.#edit(null));
    this.el.querySelector('.classes__cancel').addEventListener('click', () => this.#show('view'));
    this.el.querySelector('.classes__delete').addEventListener('click', () => this.#delete());
    this.el.querySelector('.classes__join').addEventListener('click', () => {
      if (this.editing?.id) this.host?.joinClass(this.editing.id);
      this.close();
    });
    for (const b of this.el.querySelectorAll('.classes__day')) b.addEventListener('click', () => b.classList.toggle('is-on'));
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.#save();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
    parent.appendChild(this.el);
  }

  get visible() {
    return this.isOpen;
  }

  contains(node) {
    return this.el.contains(node);
  }

  containsPoint(x, y) {
    if (!this.isOpen) return false;
    const r = this.el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  async open() {
    this.onOpen();
    this.isOpen = true;
    this.el.classList.add('on');
    this.host?.setChatFocus(true);
    await this.#refresh();
    this.#show(this.list.length ? 'view' : 'form');
    if (!this.list.length) this.#edit(null);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('on');
    this.host?.setChatFocus(false);
  }

  async #refresh() {
    const res = (await this.host?.classesList?.()) ?? { classes: [], lead: 2 };
    this.list = res.classes;
    this.lead = res.lead;
    this.hint.textContent = `I’ll open each class ${this.lead} minutes before it starts.`;
    this.#renderWeek();
  }

  #renderWeek() {
    this.week.replaceChildren();
    const today = new Date().getDay();
    for (const d of WEEK) {
      const col = document.createElement('div');
      col.className = `classes__col${d === today ? ' is-today' : ''}`;
      const head = document.createElement('div');
      head.className = 'classes__colhead';
      head.textContent = DAYS[d];
      col.appendChild(head);
      for (const c of this.list.filter((x) => x.days.includes(d))) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'classes__chip';
        chip.style.setProperty('--c', c.color ?? '#ffd43b');
        chip.title = `${c.name}: ${fmt(c.start)}${c.end ? `–${fmt(c.end)}` : ''}${c.link ? '' : ' (no link yet)'}`;
        chip.innerHTML = '<b></b><span></span>';
        chip.querySelector('b').textContent = fmt(c.start).replace(/\s?[AP]M$/i, (m) => m.trim().toLowerCase()[0]);
        chip.querySelector('span').textContent = c.name;
        chip.addEventListener('click', () => this.#edit(c));
        col.appendChild(chip);
      }
      this.week.appendChild(col);
    }
  }

  #show(which) {
    this.el.classList.toggle('editing', which === 'form');
    this.errorEl.textContent = '';
  }

  #edit(c) {
    this.editing = c;
    const f = this.form.elements;
    f.name.value = c?.name ?? '';
    f.start.value = c?.start ?? '';
    f.end.value = c?.end ?? '';
    f.link.value = c?.link ?? '';
    for (const b of this.el.querySelectorAll('.classes__day')) b.classList.toggle('is-on', !!c?.days.includes(Number(b.dataset.day)));
    this.el.querySelector('.classes__delete').style.display = c ? '' : 'none';
    this.el.querySelector('.classes__join').style.display = c?.link ? '' : 'none';
    this.#show('form');
    setTimeout(() => f.name.focus(), 50);
  }

  async #save() {
    const f = this.form.elements;
    const cls = {
      id: this.editing?.id ?? null,
      name: f.name.value,
      start: f.start.value,
      end: f.end.value,
      link: f.link.value,
      days: [...this.el.querySelectorAll('.classes__day.is-on')].map((b) => Number(b.dataset.day)),
    };
    const res = await this.host?.saveClass?.(cls);
    if (!res?.ok) {
      this.errorEl.textContent = res?.error ?? 'Couldn’t save that.';
      return;
    }
    await this.#refresh();
    this.#show('view');
    this.character.emote('sparkle', 0.5);
  }

  async #delete() {
    if (!this.editing?.id) return;
    await this.host?.removeClass?.(this.editing.id);
    await this.#refresh();
    this.#show('view');
  }

  /** Keep the panel beside the pet at the bottom of the screen. */
  update() {
    if (!this.isOpen) return;
    const c = this.character;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const x = W / 2 + c.loco.x * PIXELS_PER_UNIT;
    const half = c.mob.halfWidth * c.placement.scale * PIXELS_PER_UNIT;
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    let left = x + half + GAP_PX;
    if (left + w > W - EDGE_PX) left = x - half - GAP_PX - w;
    left = Math.max(EDGE_PX, Math.min(left, W - w - EDGE_PX));
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(Math.max(EDGE_PX, H - h - EDGE_PX))}px`;
  }
}
