import * as THREE from 'three';
import { PIXELS_PER_UNIT } from '../core/Stage.js';

const MARGIN_PX = 10;
const GAP_PX = 12;
const TOAST_MS = 12_000;
const MAX_HISTORY = 16;
const SLEEPING = new Set(['sleep', 'sleepy']);
const NAMES = { bee: 'Bee', axolotl: 'Axolotl', bbokari: 'Bbokari' };
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
      <div class="chat__note" aria-live="polite"></div>
      <form class="chat__form" autocomplete="off">
        <input class="chat__input" type="text" maxlength="1000" spellcheck="true" />
        <button type="submit" class="chat__send" aria-label="Send">➤</button>
      </form>
      <div class="chat__actions">
        <button type="button" class="chat__act chat__replace">Replace</button>
        <button type="button" class="chat__act chat__copy">Copy</button>
      </div>
      <div class="chat__hint">Tip: press <b>Fn</b> twice (or 🎤) to talk instead of typing.</div>
      <div class="chat__tail"></div>
    `;
    this.log = this.el.querySelector('.chat__log');
    this.note = this.el.querySelector('.chat__note');
    this.input = this.el.querySelector('.chat__input');
    this.tail = this.el.querySelector('.chat__tail');
    this.el.querySelector('.chat__close').addEventListener('click', () => this.close());
    this.el.querySelector('.chat__form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.send();
    });
    // Clicking a reminder toast opens the full chat.
    this.el.addEventListener('pointerdown', (e) => {
      if (this.mode === 'toast' && this.toastOpensChat && !e.target.closest('button')) this.open();
    });
    this.replaceBtn = this.el.querySelector('.chat__replace');
    this.copyBtn = this.el.querySelector('.chat__copy');
    // The first result button is "Replace" for rewrites and "Open notes" for class notes.
    this.replaceBtn.addEventListener('click', () => (this.resultAction ? this.resultAction() : this.#replace()));
    this.copyBtn.addEventListener('click', () => this.#copy());
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
    this.el.classList.remove('toast', 'result', 'working');
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
    this.el.classList.remove('open', 'toast', 'result', 'working');
    this.result = null;
    this.input.blur();
    this.character.socialMode = false;
    if (wasOpen) this.host?.setChatFocus(false);
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Show one message in a bubble without the text box (and without taking keyboard focus). */
  #toast(row, { opensChat = false, hideAfter = TOAST_MS, result = false } = {}) {
    this.note.replaceChildren(row);
    this.mode = 'toast';
    this.toastOpensChat = opensChat;
    this.el.classList.add('toast');
    this.el.classList.toggle('result', result);
    this.el.classList.remove('open');
    clearTimeout(this.toastTimer);
    if (hideAfter) this.toastTimer = setTimeout(() => this.mode === 'toast' && this.close(), hideAfter);
  }

  /** Progress and results of the highlighted-text commands (summarize / humanize / make it better). */
  showRewrite({ stage, text, title }) {
    const c = this.character;
    const row = document.createElement('div');
    row.className = 'chat__msg chat__msg--pet';
    if (this.isOpen) this.close();
    if (stage === 'working') {
      row.textContent = text;
      const dots = document.createElement('div');
      dots.className = 'chat__msg--typing';
      dots.innerHTML = '<span></span><span></span><span></span>';
      row.appendChild(dots);
      if (!this.el.classList.contains('working')) c.startTyping('think');
      this.el.classList.add('working');
      this.#toast(row, { hideAfter: 0 });
      return;
    }
    this.el.classList.remove('working');
    c.stopTyping();
    if (stage === 'error') {
      row.classList.add('chat__msg--error');
      row.textContent = text;
      c.face.setExpression('nervous');
      this.#toast(row, { hideAfter: 16_000 });
      return;
    }
    // Done: title, the new text, and Replace / Copy.
    const head = document.createElement('b');
    head.textContent = title;
    const body = document.createElement('div');
    body.className = 'chat__result';
    body.textContent = text;
    row.append(head, body);
    this.result = text;
    this.resultAction = null;
    this.replaceBtn.textContent = 'Replace';
    this.copyBtn.textContent = 'Copy';
    this.replaceBtn.disabled = this.copyBtn.disabled = false;
    c.face.setExpression('happy');
    c.emote('sparkle', -0.5);
    this.#toast(row, { hideAfter: 0, result: true });
  }

  async #replace() {
    if (!this.result || !this.host?.replaceText) return;
    this.replaceBtn.disabled = true;
    this.replaceBtn.textContent = 'Replacing…';
    const res = await this.host.replaceText(this.result);
    if (res?.ok) {
      this.character.emote('note', 0.5);
      this.close();
    } else {
      this.showRewrite({ stage: 'error', text: res?.text ?? 'That didn’t work.' });
    }
  }

  #copy() {
    if (!this.result) return;
    this.host?.copyText(this.result);
    this.copyBtn.textContent = 'Copied ✓';
    setTimeout(() => this.mode === 'toast' && this.el.classList.contains('result') && this.close(), 900);
  }

  /** Finished class notes: the summary in the bubble, with "Open notes" (the saved file) and "Copy". */
  showNotes({ title, file, notes, ok, lines }) {
    if (this.isOpen) this.close();
    const c = this.character;
    const row = document.createElement('div');
    row.className = 'chat__msg chat__msg--pet';
    const head = document.createElement('b');
    head.textContent = `📝 ${title} notes`;
    const body = document.createElement('div');
    body.className = 'chat__result chat__result--notes';
    // Headings bold, the rest as plain text (never as HTML, since it comes from the AI).
    if (ok) {
      for (const line of notes.trim().split('\n')) {
        const h = /^#+\s*(.*)$/.exec(line);
        const el = document.createElement(h ? 'b' : 'div');
        el.className = h ? 'chat__notes-h' : '';
        el.textContent = (h ? h[1] : line.replace(/\*\*(.+?)\*\*/g, '$1')) || '\u00a0';
        body.appendChild(el);
      }
    } else body.textContent = lines
        ? 'I saved everything that was said, but couldn’t write the summary. Is the Ollama app open?'
        : 'I didn’t hear anything, so there’s nothing to write down. Check that 🎤 or 💻 works in Live captions.';
    if (ok) body.style.whiteSpace = 'normal';
    row.append(head, body);
    this.result = ok ? notes : null;
    this.resultAction = () => {
      this.host?.openNotes(file);
      this.close();
    };
    this.replaceBtn.textContent = 'Open notes';
    this.copyBtn.textContent = 'Copy';
    this.replaceBtn.disabled = !file;
    this.copyBtn.disabled = !ok;
    c.face.setExpression(ok ? 'joy' : 'nervous');
    if (ok) c.emote('sparkle', -0.5);
    this.#toast(row, { hideAfter: 0, result: true });
  }

  /** A short note from the pet in a bubble (e.g. "I opened YouTube"), added to the chat if it's open. */
  say(text, { error = false } = {}) {
    if (this.isOpen) {
      this.#add('pet', text, error ? 'error' : '');
      return;
    }
    const row = document.createElement('div');
    row.className = `chat__msg chat__msg--pet${error ? ' chat__msg--error' : ''}`;
    row.textContent = text;
    this.#toast(row, { opensChat: true, hideAfter: error ? 16_000 : 6000 });
  }

  /** Open the chat with something already typed in the box (e.g. "open "). */
  prefill(text) {
    this.open();
    this.input.value = text;
    setTimeout(() => this.input.setSelectionRange(text.length, text.length), 450);
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
    this.#toast(this.log.lastElementChild.cloneNode(true), { opensChat: true });
  }

  /** A question you asked out loud ("Hey Bbokari, …"): answered like a chat message, shown in a bubble. */
  async voiceAsk(text) {
    if (this.busy) return;
    const c = this.character;
    this.#add('me', `🎤 ${text}`);
    this.history.push({ role: 'user', content: text });
    this.busy = true;
    const asked = () => {
      const q = document.createElement('div');
      q.className = 'chat__asked';
      q.textContent = `🎤 “${text}”`;
      return q;
    };
    let typing = null;
    if (this.isOpen) typing = this.#add('pet', '', 'typing');
    else {
      const row = document.createElement('div');
      row.className = 'chat__msg chat__msg--pet';
      const dots = document.createElement('div');
      dots.className = 'chat__msg--typing';
      dots.innerHTML = '<span></span><span></span><span></span>';
      row.append(asked(), dots);
      this.#toast(row, { hideAfter: 0, opensChat: true });
    }
    c.startTyping('think');
    const reply = this.host?.ask
      ? await this.host.ask({ text, history: this.history.slice(-MAX_HISTORY), mob: this.settings.mob })
      : { ok: false, text: 'I can only think inside the desktop app.' };
    typing?.remove();
    this.#add('pet', reply.text, reply.ok ? '' : 'error');
    this.history.push({ role: 'assistant', content: reply.text });
    this.history = this.history.slice(-MAX_HISTORY * 2);
    this.busy = false;
    c.stopTyping();
    this.onReply?.(reply);
    c.face.setExpression(reply.ok ? 'happy' : 'nervous');
    if (!this.isOpen) {
      const row = document.createElement('div');
      row.className = `chat__msg chat__msg--pet${reply.ok ? '' : ' chat__msg--error'}`;
      const answer = document.createElement('div');
      answer.textContent = reply.text;
      row.append(asked(), answer);
      // Long answers stay up longer.
      this.#toast(row, { opensChat: true, hideAfter: Math.min(30_000, 8000 + reply.text.length * 60) });
    }
    if (reply.ok && this.settings.voiceSpeak) this.host?.speak?.(reply.text);
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
    c.startTyping('think');

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
    c.stopTyping();
    this.onReply?.(reply);
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
