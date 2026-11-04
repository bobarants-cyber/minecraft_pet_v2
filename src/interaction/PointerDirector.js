import * as THREE from 'three';

const SLEEPING = new Set(['sleep', 'sleepy']);
const AIRBORNE = new Set(['carried', 'drop']);
const DRAG_THRESHOLD_PX = 6;
const PET_WINDOW = 3;
const GAZE_DEPTH = 4;
const VELOCITY_WINDOW_MS = 80;
const MAX_THROW = 14;
/** Release speed (world units/s, scale-relative) below which the pet just stays where you left it. */
const THROW_SPEED = 3.5;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class PointerDirector {
  constructor({ character, screen, host, canvas, menu = null }) {
    this.character = character;
    this.screen = screen;
    this.host = host;
    this.menu = menu;
    this.pointer = null;
    this.over = false;
    this.airborne = false;
    this.press = null;
    this.drag = null;
    this.pets = [];
    this.attention = new THREE.Vector3();

    const target = canvas.ownerDocument;
    target.addEventListener('pointermove', (e) => this.#move(e));
    target.addEventListener('pointerdown', (e) => this.#down(e));
    target.addEventListener('pointerup', (e) => this.#up(e));
    target.addEventListener('pointercancel', (e) => this.#up(e));
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('mouseleave', () => (this.pointer = null));
    target.addEventListener('mouseout', (e) => {
      if (!e.relatedTarget && !this.drag) this.pointer = null;
    });
    window.addEventListener('blur', () => this.#up());
  }

  /** Pointer in world x and height above the floor; both stay valid when the window grows upward during a drag. */
  #world(px, py) {
    return { x: this.screen.toWorldX(px), h: this.screen.heightAboveFloor(py, this.character.placement.floorY) };
  }

  #hits(w) {
    const c = this.character;
    const { scale } = c.placement;
    const { halfWidth, height } = c.mob;
    return Math.abs(w.x - c.loco.x) < halfWidth * scale && w.h > c.lift && w.h < c.lift + height * scale;
  }

  #move(e) {
    this.pointer = { x: e.clientX, y: e.clientY, t: performance.now() };
    const w = this.#world(e.clientX, e.clientY);
    if (this.press && !this.drag && Math.hypot(e.clientX - this.press.px, e.clientY - this.press.py) > DRAG_THRESHOLD_PX) this.#startDrag(w);
    if (this.drag) {
      const d = this.drag;
      const now = performance.now();
      d.x = w.x - d.offsetX;
      d.h = w.h - d.offsetH;
      d.t = now;
      d.history.push({ x: d.x, h: d.h, t: now });
      while (d.history.length > 2 && now - d.history[0].t > VELOCITY_WINDOW_MS) d.history.shift();
    }
  }

  /** Release velocity from the recent pointer trail, so a flick throws and a pause drops. */
  #releaseVelocity(d) {
    const now = performance.now();
    const recent = d.history.filter((p) => now - p.t <= VELOCITY_WINDOW_MS);
    const first = recent[0];
    const last = recent[recent.length - 1];
    if (!first || !last || last.t - first.t < 16 || now - last.t > 90) return { vx: 0, vy: 0 };
    const dt = (last.t - first.t) / 1000;
    const scale = this.character.placement.scale;
    const cap = MAX_THROW * scale;
    return {
      vx: THREE.MathUtils.clamp((last.x - first.x) / dt, -cap, cap),
      vy: THREE.MathUtils.clamp((last.h - first.h) / dt, -cap, cap),
    };
  }

  #down(e) {
    const menu = this.menu;
    if (menu?.isOpen) {
      if (!menu.contains(e.target)) menu.close();
      return;
    }
    if (e.button === 2) {
      if (this.over && !this.drag) this.menu?.open(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0 || !this.over) return;
    this.press = { px: e.clientX, py: e.clientY };
  }

  #startDrag(w) {
    const c = this.character;
    this.drag = { offsetX: w.x - c.loco.x, offsetH: w.h - c.lift, x: c.loco.x, h: c.lift, t: performance.now(), history: [] };
    c.carry = { vx: 0 };
    c.trigger('carried', {}, true);
  }

  #up() {
    const c = this.character;
    if (this.drag) {
      const { vx, vy } = this.#releaseVelocity(this.drag);
      const speed = Math.hypot(vx, vy) / c.placement.scale;
      if (speed < THROW_SPEED) {
        c.trigger('settle', { then: 'idle' }, true);
      } else {
        c.trigger('drop', { vx, vy, then: 'idle' }, true);
      }
      c.carry = null;
      this.drag = null;
    } else if (this.press) {
      this.#pet();
    }
    this.press = null;
  }

  #pet() {
    const c = this.character;
    const now = performance.now() / 1000;
    this.pets = this.pets.filter((t) => now - t < PET_WINDOW);
    this.pets.push(now);
    const count = this.pets.length;
    if (SLEEPING.has(c.stateName)) c.trigger('surprised', { then: 'wake' }, true);
    else if (count >= 6 && c.stateName !== 'dance') c.trigger('dance', { then: 'idle' }, true);
    else c.trigger('pet', { count, then: 'idle' }, true);
  }

  update(dt) {
    const c = this.character;
    const w = this.pointer ? this.#world(this.pointer.x, this.pointer.y) : null;

    const over = !!this.drag || !!this.menu?.isOpen || (!!w && this.#hits(w));
    if (over !== this.over) {
      this.over = over;
      this.host?.setPointerOver(over);
      document.body.classList.toggle('grab', over);
    }

    const airborne = !!this.drag || AIRBORNE.has(c.stateName) || c.lift > 0.03 || c.restLift > 0.03;
    if (airborne !== this.airborne) {
      this.airborne = airborne;
      this.host?.setExpanded(airborne);
    }

    if (this.drag) {
      const d = this.drag;
      const { minX, maxX } = c.placement;
      c.loco.x = c.loco.targetX = clamp(d.x, minX, maxX);
      c.loco.speed = 0;
      c.lift = Math.max(0, d.h);
      const trail = d.history;
      const a = trail[0];
      const b = trail[trail.length - 1];
      const vx = a && b && b.t > a.t ? ((b.x - a.x) / (b.t - a.t)) * 1000 : 0;
      c.carry.vx += (vx - c.carry.vx) * (1 - Math.exp(-8 * dt));
      c.attention = null;
      return;
    }

    if (w && c.stateName !== 'drop') {
      this.attention.set(w.x, c.placement.floorY + w.h, GAZE_DEPTH);
      c.attention = this.attention;
    } else c.attention = null;
  }
}
