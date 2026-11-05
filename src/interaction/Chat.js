import * as THREE from 'three';
import { PIXELS_PER_UNIT } from '../core/Stage.js';

const MARGIN_PX = 10;
const GAP_PX = 12;
const TOAST_MS = 12_000;
const MAX_HISTORY = 16;
const SLEEPING = new Set(['sleep', 'sleepy']);
const NAMES = { bee: 'Bee', axolotl: 'Axolotl' };
const _top = new THREE.Vector3();

const greeting = (name) =>
  `Hi! I'm ${name}, your desktop buddy. Ask me anything, or say “remind me in 10 minutes to stretch” or “set a timer for 5 minutes”.`;

/**
 * The speech bubble above the pet. "Open" shows the conversation and a text box; "toast" shows one
 * message (for example a reminder going off) without taking keyboard focus.
 */
export class Chat {
  constructor({ character, stage, settings, host, parent = document.body }) {
    this.character = character;
    this.stage = stage;
    this.settings = settings;
    this.host = host;
    this.mode = 'closed';
    this.history = [];
    this.busy = false;
    this.toastTimer = null;
    this.greeted = false;

    this.el = document.createElement('div');
    this.el.className = 'chat';
    this.el.innerHTML = `
      <button type="button" class="chat__close" aria-label="Close chat" title="Close (Esc)">×</button>
      <div class="chat__log" role="log" aria-live="polite"></div>
      <form class="chat__form" autocomplete="off">
        <input class="chat__input" type="text" maxlength="1000" spellcheck="true" />
        <button type="submit" class="chat__send" aria-label="Send">➤</button>
      </form>
      <div class="chat__hint">Tip: press <b>Fn</b> twice (or 🎤) to talk instead of typing.</div>
      <div class="chat__tail"></div>
    `;
    this.log = this.el.querySelector('.chat__log');
    this.input = this.el.querySelector('.chat__input');
    this.tail = this.el.querySelector('.chat__tail');
    this.el.querySelector('.chat__close').addEventListener('click', () => this.close());
    this.el.querySelector('.chat__form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.send();
    });
    // Clicking a reminder toast opens the full chat.
    this.el.addEventListener('pointerdown', () => {
      if (this.mode === 'toast') this.open();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.mode !== 'closed') this.close();
    });
    parent.appendChild(this.el);
  }

  get name() {
    return NAMES[this.settings.mob] ?? 'Bee';
  }

  get isOpen() {
    return this.mode === 'open';
  }

  get visible() {
    return this.mode !== 'closed';
  }

  contains(node) {
    return this.el.contains(node);
  }

  containsPoint(x, y) {
    if (!this.visible) return false;
    const r = this.el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom + GAP_PX;
  }

  open() {
    clearTimeout(this.toastTimer);
    const wasClosed = this.mode === 'closed';
    this.mode = 'open';
    this.el.classList.add('open');
    this.el.classList.remove('toast');
    this.input.placeholder = `Message ${this.name}…`;
    this.host?.setChatFocus(true);
    const c = this.character;
    c.socialMode = true;
    if (SLEEPING.has(c.stateName)) c.trigger('surprised', { then: 'wake' }, true);
    else if (wasClosed) c.trigger('wave', { then: 'idle' }, true);
    if (!this.greeted) {
      this.greeted = true;
      this.#add('pet', greeting(this.name));
    }
    this.#scroll();
    // The window only becomes focusable a moment after we ask, so retry focusing the text box briefly.
    for (const ms of [30, 150, 400]) setTimeout(() => this.isOpen && this.input.focus(), ms);
  }

  close() {
    if (this.mode === 'closed') return;
    clearTimeout(this.toastTimer);
    const wasOpen = this.isOpen;
    this.mode = 'closed';
    this.el.classList.remove('open', 'toast');
    this.input.blur();
    this.character.socialMode = false;
    if (wasOpen) this.host?.setChatFocus(false);
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Show a message from the pet without opening the text box, e.g. when a reminder goes off. */
  announce(text) {
    this.#add('pet', text, 'alert');
    this.history.push({ role: 'assistant', content: text });
    const c = this.character;
    if (SLEEPING.has(c.stateName)) c.trigger('surprised', { then: 'excited' }, true);
    else c.trigger('excited', { then: 'idle' }, true);
    c.emote('exclaim', 0.4);
    if (this.isOpen) return;
    this.mode = 'toast';
    this.el.classList.add('toast');
    this.el.classList.remove('open');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.mode === 'toast' && this.close(), TOAST_MS);
  }

  async send() {
    const text = this.input.value.trim();
    if (!text || this.busy) return;
    this.input.value = '';
    this.#add('me', text);
    this.history.push({ role: 'user', content: text });
    this.busy = true;
    this.el.classList.add('busy');
    const typing = this.#add('pet', '', 'typing');
    const c = this.character;
    c.face.setExpression('curious');
    c.emote('question', 0.5);

    let reply;
    if (this.host?.ask) {
      reply = await this.host.ask({ text, history: this.history.slice(-MAX_HISTORY), mob: this.settings.mob });
    } else {
      reply = { ok: false, text: 'I can only think inside the desktop app. Start me with “npm start”!' };
    }

    typing.remove();
    this.#add('pet', reply.text, reply.ok ? '' : 'error');
    this.history.push({ role: 'assistant', content: reply.text });
    this.history = this.history.slice(-MAX_HISTORY * 2);
    this.busy = false;
    this.el.classList.remove('busy');
    c.face.setExpression(reply.ok ? 'happy' : 'nervous');
    c.emote(reply.kind === 'reminder' ? 'sparkle' : reply.ok ? 'note' : 'question', -0.5);
    if (this.isOpen) this.input.focus();
  }

  #add(who, text, extra = '') {
    const row = document.createElement('div');
    row.className = `chat__msg chat__msg--${who}${extra ? ` chat__msg--${extra}` : ''}`;
    if (extra === 'typing') row.innerHTML = '<span></span><span></span><span></span>';
    else row.textContent = text;
    this.log.appendChild(row);
    while (this.log.children.length > 60) this.log.firstChild.remove();
    this.#scroll();
    return row;
  }

  #scroll() {
    this.log.scrollTop = this.log.scrollHeight;
  }

  /** Keep the bubble just above the pet's head, inside the window, with its tail pointing at the pet. */
  update() {
    if (!this.visible) return;
    const c = this.character;
    const { scale } = c.placement;
    const root = c.mob.root;
    _top.set(root.position.x, root.position.y + c.mob.height * scale, 0).project(this.stage.camera);
    const px = ((_top.x + 1) / 2) * this.stage.width;
    const py = ((1 - _top.y) / 2) * this.stage.height;
    const { offsetWidth: w, offsetHeight: h } = this.el;
    const W = window.innerWidth;
    const H = window.innerHeight;
    let x = Math.max(MARGIN_PX, Math.min(px - w / 2, W - w - MARGIN_PX));
    let y = py - h - GAP_PX;
    // Not enough room above the head: sit beside the pet instead, so the bubble never covers it.
    const side = y < MARGIN_PX;
    if (side) {
      _top.set(root.position.x, root.position.y + (c.mob.height * scale) / 2, 0).project(this.stage.camera);
      const midY = ((1 - _top.y) / 2) * this.stage.height;
      const halfW = (c.mob.halfWidth ?? 0.6) * scale * PIXELS_PER_UNIT + GAP_PX;
      x = px + halfW + w + MARGIN_PX <= W ? px + halfW : Math.max(MARGIN_PX, px - halfW - w);
      y = Math.max(MARGIN_PX, Math.min(midY - h / 2, H - h - MARGIN_PX));
    }
    this.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    this.el.classList.toggle('side', side);
    this.tail.style.left = `${Math.round(Math.max(18, Math.min(w - 18, px - x)))}px`;
  }
}
