import * as THREE from 'three';
import { PIXELS_PER_UNIT } from '../core/Stage.js';

const NAMES = { bee: 'Bee', axolotl: 'Axolotl', bbokari: 'Bbokari' };
const ICONS = { bee: '🐝', axolotl: '🌸', bbokari: '🐥' };
const EDGE_PX = 12;
const GAP_PX = 16;
const SLEEPY = new Set(['sleep', 'sleepy']);

/**
 * Base for the small games played next to the pet. Each game is a compact panel parked beside the pet at the bottom
 * of the screen, so the rest of the screen (a Zoom call, say) stays visible and clickable. Mouse only: the keyboard
 * stays with whatever app you're using.
 *
 * Subclasses fill `this.body`, and override onStart / onStop / tick(dt).
 */
export class MiniGame {
  constructor({ character, stage, settings, parent = document.body }, { id, title }) {
    this.character = character;
    this.stage = stage;
    this.settings = settings;
    this.id = id;
    this.active = false;
    this.lookAt = null;

    this.panel = document.createElement('div');
    this.panel.className = `game-panel game-panel--${id}`;
    this.panel.innerHTML = `
      <div class="game-panel__head">
        <span class="game-panel__title">${title}</span>
        <span class="game-panel__score"></span>
        <button type="button" class="game-panel__close" title="Stop playing (Esc)" aria-label="Stop playing">×</button>
      </div>
      <div class="game-panel__body"></div>
      <div class="game-panel__msg" aria-live="polite"></div>
    `;
    this.body = this.panel.querySelector('.game-panel__body');
    this.scoreEl = this.panel.querySelector('.game-panel__score');
    this.msgEl = this.panel.querySelector('.game-panel__msg');
    this.panel.querySelector('.game-panel__close').addEventListener('click', () => this.stop());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.active) this.stop();
    });
    parent.appendChild(this.panel);
  }

  get petName() {
    return NAMES[this.settings.mob] ?? 'Pet';
  }

  get petIcon() {
    return ICONS[this.settings.mob] ?? '🐾';
  }

  start() {
    if (this.active) return;
    const c = this.character;
    this.active = true;
    this.panel.classList.add('on');
    c.game = this;
    c.socialMode = true;
    c.loco.stop();
    c.restLift = 0;
    c.trigger('minigame', {}, true);
    this.onStart();
    this.place();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.panel.classList.remove('on');
    const c = this.character;
    c.game = null;
    c.socialMode = false;
    c.attention = null;
    this.onStop();
    if (c.stateName === 'minigame') c.trigger('idle', {}, true);
  }

  onStart() {}
  onStop() {}
  tick() {}

  say(text) {
    this.msgEl.textContent = text;
  }

  setScore(text) {
    this.scoreEl.textContent = text;
  }

  /** Little reactions that return to the game afterwards. */
  react(kind) {
    const c = this.character;
    const back = { then: 'minigame' };
    if (kind === 'win') c.trigger('dance', back, true); // the pet won
    else if (kind === 'lose') c.trigger('sad', back, true);
    else if (kind === 'cheer') c.trigger('happy', back, true);
    else if (kind === 'wow') c.trigger('surprised', back, true);
    else if (kind === 'excited') c.trigger('excited', back, true);
    else if (kind === 'think') {
      c.face.setExpression('curious');
      c.emote('question', 0.5);
    } else if (kind === 'smug') {
      c.face.setExpression('smug');
      c.emote('note', 0.5);
    }
  }

  /** The pet's position on screen: centre x, head-top y and half width, in window pixels. */
  petBox() {
    const c = this.character;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const s = c.placement.scale;
    const x = W / 2 + c.loco.x * PIXELS_PER_UNIT;
    const floor = H / 2 - c.placement.floorY * PIXELS_PER_UNIT;
    return { x, floor, top: floor - c.mob.height * s * PIXELS_PER_UNIT, half: c.mob.halfWidth * s * PIXELS_PER_UNIT };
  }

  /** Park the panel beside the pet (whichever side has room), resting on the bottom of the screen. */
  place() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const { x, half } = this.petBox();
    const w = this.panel.offsetWidth;
    const h = this.panel.offsetHeight;
    let left = x + half + GAP_PX;
    if (left + w > W - EDGE_PX) left = x - half - GAP_PX - w;
    left = Math.max(EDGE_PX, Math.min(left, W - w - EDGE_PX));
    this.panel.style.left = `${Math.round(left)}px`;
    this.panel.style.top = `${Math.round(H - h - EDGE_PX)}px`;
  }

  containsPoint(x, y) {
    if (!this.active) return false;
    const r = this.panel.getBoundingClientRect();
    return x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4;
  }

  contains(node) {
    return this.panel.contains(node);
  }

  /** Point the pet's eyes at a spot on screen (window pixels), e.g. the game board. */
  #look(px, py) {
    const c = this.character;
    c.attention ??= new THREE.Vector3();
    c.attention.set((px - window.innerWidth / 2) / PIXELS_PER_UNIT, (window.innerHeight / 2 - py) / PIXELS_PER_UNIT, 4);
  }

  update(dt) {
    if (!this.active) return;
    const c = this.character;
    if (SLEEPY.has(c.stateName)) return this.stop();
    // Petting or dragging the pet mid-game is fine; once that's over, it comes back to the game.
    if (c.stateName === 'idle') c.trigger('minigame', {}, true);
    this.place();
    this.tick(Math.min(dt, 1 / 20));
    if (this.lookAt === 'board') {
      const r = this.panel.getBoundingClientRect();
      this.#look(r.left + r.width / 2, r.top + r.height / 2);
    } else if (Array.isArray(this.lookAt)) this.#look(...this.lookAt);
  }
}

/** Small helper: create an element with a class and optional text. */
export function el(tag, className, text = '') {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
