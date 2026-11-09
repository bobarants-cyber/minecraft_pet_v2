// Keeps Bbokari's pop-ups (chat bubble, notes pill, focus timer, captions, classes, games) from covering each other,
// and lets you drag any of them where you like.
//
// Each pop-up still places itself next to the pet as before. Every frame, this goes through them in order and, if
// one overlaps one placed before it, moves it up (or down, or to the side) until it fits. The move is applied with
// the CSS `translate` property, which adds on top of the pop-up's own `transform`/left/top, so their code is unchanged.
// Drag a pop-up (anywhere that isn't a button or text box) to put it somewhere else: it stays there. Double-click it
// to send it back next to Bbokari.

const GAP = 8;
const EDGE = 8;
const INTERACTIVE = 'button, input, textarea, select, a, label, [contenteditable], .chat__log, .classes__list, .captions__lines';

const overlap = (a, b) => a.left < b.right + GAP && a.right + GAP > b.left && a.top < b.bottom + GAP && a.bottom + GAP > b.top;

export class PanelStack {
  /** `getPanels()` returns the pop-up elements, most important first (the first one never moves). */
  constructor(getPanels) {
    this.getPanels = getPanels;
    this.offset = new WeakMap(); // el → { x, y } we added
    this.pinned = new Map(); // el → { left, top } where you dropped it
    this.wired = new WeakSet();
    this.drag = null;
  }

  #visible(el) {
    if (!el?.isConnected || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05;
  }

  #wire(el) {
    if (this.wired.has(el)) return;
    this.wired.add(el);
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest(INTERACTIVE)) return;
      const r = el.getBoundingClientRect();
      this.drag = { el, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false, id: e.pointerId };
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || d.el !== el) return;
      const r = el.getBoundingClientRect();
      const left = Math.max(EDGE, Math.min(window.innerWidth - r.width - EDGE, e.clientX - d.dx));
      const top = Math.max(EDGE, Math.min(window.innerHeight - r.height - EDGE, e.clientY - d.dy));
      if (!d.moved && Math.hypot(left - r.left, top - r.top) < 3) return;
      d.moved = true;
      el.classList.add('panel-moved', 'panel-dragging');
      this.pinned.set(el, { left, top });
      e.preventDefault();
    });
    const end = () => {
      if (this.drag?.el === el) {
        el.classList.remove('panel-dragging');
        this.drag = null;
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', (e) => {
      if (e.target.closest(INTERACTIVE)) return;
      this.pinned.delete(el);
      el.classList.remove('panel-moved');
    });
  }

  update() {
    const placed = [];
    const W = window.innerWidth;
    const H = window.innerHeight;
    for (const el of this.getPanels()) {
      if (!el) continue;
      this.#wire(el);
      if (!this.#visible(el)) {
        // Hidden pop-ups forget where you dragged them, so next time they appear next to Bbokari again.
        if (this.pinned.has(el) && this.drag?.el !== el) {
          this.pinned.delete(el);
          el.classList.remove('panel-moved');
        }
        continue;
      }
      const off = this.offset.get(el) ?? { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      // Where it would be on its own (without our nudge).
      const nat = { left: r.left - off.x, top: r.top - off.y, width: r.width, height: r.height };
      let pos;
      const pin = this.pinned.get(el);
      if (pin) pos = { left: pin.left, top: pin.top };
      else {
        pos = { left: nat.left, top: nat.top };
        const box = () => ({ left: pos.left, top: pos.top, right: pos.left + nat.width, bottom: pos.top + nat.height });
        for (let tries = 0; tries < 8; tries++) {
          const hit = placed.find((p) => overlap(box(), p));
          if (!hit) break;
          // Above the one it hits; if there's no room, below it; if still no room, beside it.
          const above = hit.top - GAP - nat.height;
          const below = hit.bottom + GAP;
          if (above >= EDGE) pos.top = above;
          else if (below + nat.height <= H - EDGE) pos.top = below;
          else {
            const right = hit.right + GAP;
            pos.left = right + nat.width <= W - EDGE ? right : Math.max(EDGE, hit.left - GAP - nat.width);
          }
        }
      }
      const next = { x: Math.round(pos.left - nat.left), y: Math.round(pos.top - nat.top) };
      if (next.x !== off.x || next.y !== off.y) {
        el.style.translate = next.x || next.y ? `${next.x}px ${next.y}px` : '';
        this.offset.set(el, next);
      }
      // A bubble that moved away from Bbokari doesn't point at him any more.
      el.classList.toggle('panel-nudged', !!(next.x || next.y));
      placed.push({ left: pos.left, top: pos.top, right: pos.left + nat.width, bottom: pos.top + nat.height });
    }
  }
}
