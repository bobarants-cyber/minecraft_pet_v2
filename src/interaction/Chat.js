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
        <input class="chat__input" type="text" maxlength="6000" spellcheck="true" />
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
    if (this.inboxShowing) this.#endInbox();
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

  /** Mistakes it spotted while you were writing or coding. */
  showSuggestions({ kind, issues }) {
    if (this.isOpen) {
      this.#add('pet', `🔍 ${issues.map((i) => `“${i.quote}” → “${i.fix}”${i.why ? ` (${i.why})` : ''}`).join('\n')}`);
      return;
    }
    const row = document.createElement('div');
    row.className = 'chat__msg chat__msg--pet';
    const head = document.createElement('b');
    head.textContent = `🔍 I spotted ${issues.length === 1 ? 'something' : `${issues.length} things`} in your ${kind === 'coding' ? 'code' : 'writing'}:`;
    const list = document.createElement('div');
    list.className = 'chat__suggestions';
    for (const i of issues) {
      const item = document.createElement('div');
      const from = document.createElement('s');
      from.textContent = i.quote;
      const to = document.createElement('b');
      to.textContent = i.fix;
      item.append('• ', from, ' → ', to);
      if (i.why) item.append(` (${i.why})`);
      list.appendChild(item);
    }
    row.append(head, list);
    this.#toast(row, { opensChat: false, hideAfter: 15_000 });
  }

  // ---------- 📬 inbox cards: one message at a time, with Yes / No / My reply ----------

  /** New messages from Gmail, Google Chat and Classroom. */
  showInbox(items, intro = '') {
    if (intro) this.inboxIntro = intro;
    // Clicking the same message again (from the menu bar) shouldn't add it twice.
    const queued = new Set((this.inboxQueue ?? []).map((i) => i.id));
    this.inboxQueue = [...(this.inboxQueue ?? []), ...items.filter((i) => !queued.has(i.id) && i.id !== this.inboxCurrent?.id)];
    if (!this.inboxShowing) this.#nextInbox();
  }

  #endInbox() {
    this.inboxShowing = false;
    this.inboxQueue = [];
    if (this.inboxTyping) {
      this.inboxTyping = false;
      this.host?.setChatFocus(false);
    }
  }

  #nextInbox() {
    // Moving on from a card counts as having seen it.
    if (this.inboxCurrent) this.host?.inboxDone?.(this.inboxCurrent.id);
    this.inboxCurrent = null;
    if (this.inboxTyping) {
      this.inboxTyping = false;
      this.host?.setChatFocus(false);
    }
    const item = this.inboxQueue?.shift();
    if (!item) {
      this.inboxShowing = false;
      if (this.mode === 'toast') this.close();
      return;
    }
    // Don't pop up over a conversation: wait until the chat is closed.
    if (this.isOpen) {
      this.inboxQueue.unshift(item);
      this.inboxShowing = false;
      clearTimeout(this.inboxWait);
      this.inboxWait = setTimeout(() => !this.inboxShowing && this.#nextInbox(), 15_000);
      return;
    }
    this.inboxShowing = true;
    this.inboxCurrent = item;
    const c = this.character;
    if (SLEEPING.has(c.stateName)) c.trigger('surprised', { then: 'wake' }, true);
    c.emote(item.needsReply ? 'question' : 'note', 0.4);

    const icon = { gmail: '📧', chat: '💬', classroom: '🏫' }[item.source] ?? '📬';
    const row = document.createElement('div');
    row.className = 'chat__msg chat__msg--pet chat__inbox';
    if (this.inboxIntro) {
      const hi = document.createElement('div');
      hi.className = 'chat__inbox-intro';
      hi.textContent = this.inboxIntro;
      row.append(hi);
      this.inboxIntro = '';
    }
    const head = document.createElement('b');
    const more = this.inboxQueue.length;
    head.textContent = `${icon} ${item.from}${more ? `  ·  ${more} more` : ''}`;
    const sub = document.createElement('small');
    if (item.source === 'classroom') {
      const kind = { assignment: 'New assignment', announcement: 'New announcement', due: '⏰ Due soon' }[item.kind] ?? 'Classroom';
      sub.textContent = `${kind}${item.kind !== 'announcement' ? `: ${item.subject}` : ''}${item.due ? ` · due ${new Date(item.due).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}`;
    } else sub.textContent = item.source === 'gmail' ? item.subject : `in ${item.where}`;
    const sum = document.createElement('div');
    sum.className = 'chat__inbox-sum';
    sum.textContent = item.summary;
    row.append(head, sub, sum);
    const canTemplate = item.source === 'classroom' && (item.kind === 'assignment' || item.kind === 'due');
    if (item.question || canTemplate) {
      const q = document.createElement('div');
      q.className = 'chat__inbox-q';
      q.textContent = item.question ? `❓ ${item.question}` : '📝 Want me to make you a template to work on?';
      row.append(q);
    }
    const acts = document.createElement('div');
    acts.className = 'chat__inbox-acts';
    row.append(acts);
    this.#inboxButtons(item, acts);
    this.#toast(row, { opensChat: false, hideAfter: 0 });
  }

  #button(label, onClick, primary = false) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `chat__act${primary ? ' chat__replace' : ''}`;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  #inboxButtons(item, acts) {
    acts.replaceChildren();
    const last = !this.inboxQueue?.length;
    if (item.needsReply && item.source !== 'classroom') {
      acts.append(
        this.#button('👍 Yes', () => this.#draft(item, acts, 'yes'), true),
        this.#button('👎 No', () => this.#draft(item, acts, 'no')),
        this.#button('✏️ My reply', () => this.#ownReply(item, acts)),
      );
    }
    if (item.source === 'classroom' && (item.kind === 'assignment' || item.kind === 'due')) {
      acts.append(this.#button('📝 Make a template', () => this.#template(item.id, acts, () => this.#nextInbox()), true));
    }
    acts.append(
      this.#button('Open', () => {
        this.host?.inboxOpen(item.id);
        this.#nextInbox();
      }),
      this.#button(last ? 'OK' : 'Next ▸', () => this.#nextInbox(), !item.needsReply && !(item.source === 'classroom' && (item.kind === 'assignment' || item.kind === 'due'))),
    );
  }

  #typingBox(acts, value, placeholder) {
    const box = document.createElement('textarea');
    box.className = 'chat__draft';
    box.value = value;
    box.placeholder = placeholder;
    box.maxLength = 1500;
    acts.replaceChildren(box);
    this.inboxTyping = true;
    this.host?.setChatFocus(true);
    for (const ms of [30, 150, 400]) setTimeout(() => this.inboxTyping && box.focus(), ms);
    return box;
  }

  #ownReply(item, acts) {
    const box = this.#typingBox(acts, '', 'What do you want to say?');
    const row = document.createElement('div');
    row.className = 'chat__inbox-acts';
    row.append(
      this.#button('✨ Make it nice', () => box.value.trim() && this.#draft(item, acts, 'own', box.value), true),
      this.#button('Send as is', () => box.value.trim() && this.#send(item, acts, box.value)),
      this.#button('Back', () => this.#inboxButtons(item, acts)),
    );
    acts.append(row);
  }

  async #draft(item, acts, choice, own = '') {
    acts.replaceChildren(Object.assign(document.createElement('div'), { className: 'chat__hint', textContent: 'Writing your reply… ✍️' }));
    const res = await this.host?.inboxDraft({ id: item.id, choice, own });
    if (!res?.ok) {
      acts.replaceChildren(Object.assign(document.createElement('div'), { className: 'chat__hint', textContent: res?.text ?? 'That didn’t work.' }));
      setTimeout(() => this.inboxShowing && this.#inboxButtons(item, acts), 3500);
      return;
    }
    // You always see (and can change) the reply before it goes out.
    const box = this.#typingBox(acts, res.text, '');
    const row = document.createElement('div');
    row.className = 'chat__inbox-acts';
    row.append(this.#button('Send ✉️', () => box.value.trim() && this.#send(item, acts, box.value), true), this.#button('Cancel', () => this.#inboxButtons(item, acts)));
    acts.append(row);
  }

  async #send(item, acts, text) {
    acts.replaceChildren(Object.assign(document.createElement('div'), { className: 'chat__hint', textContent: 'Sending… ✉️' }));
    if (this.inboxTyping) {
      this.inboxTyping = false;
      this.host?.setChatFocus(false);
    }
    const res = await this.host?.inboxSend({ id: item.id, text });
    acts.replaceChildren(Object.assign(document.createElement('div'), { className: 'chat__inbox-q', textContent: res?.text ?? 'That didn’t work.' }));
    if (res?.ok) {
      this.character.emote('sparkle', 0.4);
      setTimeout(() => this.inboxShowing && this.#nextInbox(), 1800);
    } else setTimeout(() => this.inboxShowing && this.#inboxButtons(item, acts), 4000);
  }

  /** Asks for a blank template for a Classroom assignment; Bbokari then writes it and opens it. */
  async #template(id, acts, then) {
    acts.replaceChildren(Object.assign(document.createElement('div'), { className: 'chat__hint', textContent: 'On it! ✍️' }));
    const res = await this.host?.inboxTemplate(id);
    acts.replaceChildren(Object.assign(document.createElement('div'), { className: 'chat__inbox-q', textContent: res?.text ?? 'That didn’t work.' }));
    setTimeout(() => then?.(), 2500);
  }

  /** Classroom work due this week, each with “📝 Template” and “Open”. */
  showTodo({ items, daily = false }) {
    if (this.isOpen) return;
    if (this.inboxShowing) {
      // Show it after the message cards.
      clearTimeout(this.todoWait);
      this.todoWait = setTimeout(() => this.showTodo({ items, daily }), 20_000);
      return;
    }
    const c = this.character;
    if (SLEEPING.has(c.stateName)) c.trigger('surprised', { then: 'wake' }, true);
    c.emote('note', 0.4);
    const row = document.createElement('div');
    row.className = 'chat__msg chat__msg--pet chat__inbox';
    const head = document.createElement('b');
    head.textContent = `📚 ${daily ? 'Good morning! ' : ''}You have ${items.length} thing${items.length === 1 ? '' : 's'} to do this week`;
    const sub = document.createElement('small');
    sub.textContent = 'Want me to make a template for any of them?';
    row.append(head, sub);
    for (const it of items) {
      const line = document.createElement('div');
      line.className = 'chat__todo';
      const label = document.createElement('div');
      label.className = 'chat__todo-label';
      label.textContent = `${it.course}: ${it.title} · ${new Date(it.due).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
      const btns = document.createElement('div');
      btns.className = 'chat__inbox-acts';
      btns.append(
        this.#button('📝 Template', () => this.#template(it.id, btns, null), true),
        this.#button('Open', () => this.host?.inboxOpen(it.id)),
      );
      line.append(label, btns);
      row.append(line);
    }
    const end = document.createElement('div');
    end.className = 'chat__inbox-acts';
    end.append(this.#button('OK', () => this.close()));
    row.append(end);
    this.#toast(row, { opensChat: false, hideAfter: 0 });
  }

  /** Filling a Canva template: each page's text with a Copy button (paste it into the template's text boxes). */
  showFill({ pages, intro }) {
    if (this.isOpen) this.close();
    if (this.inboxShowing) this.#endInbox();
    this.character.emote('note', 0.4);
    const row = document.createElement('div');
    row.className = 'chat__msg chat__msg--pet chat__inbox';
    const head = document.createElement('b');
    head.textContent = '🎨 Your math for the Canva template';
    const sub = document.createElement('small');
    sub.textContent = intro;
    row.append(head, sub);
    const copy = (text, btn) => {
      this.host?.copyText(text);
      btn.textContent = '✓ Copied';
      btn.closest('.chat__todo')?.classList.add('chat__todo--done');
    };
    pages.forEach((p, i) => {
      const line = document.createElement('div');
      line.className = 'chat__todo';
      const label = document.createElement('div');
      label.className = 'chat__todo-label';
      label.textContent = `Page ${i + 1} · ${p.title}`;
      const preview = document.createElement('small');
      preview.className = 'chat__fill-preview';
      preview.textContent = p.text.split('\n').slice(0, 2).join(' · ');
      const btns = document.createElement('div');
      btns.className = 'chat__inbox-acts';
      const both = this.#button('📋 Copy page', () => copy(`${p.title}\n${p.text}`, both), true);
      const title = this.#button('Title only', () => copy(p.title, title));
      btns.append(both, title);
      if (p.text) {
        const body = this.#button('Text only', () => copy(p.text, body));
        btns.append(body);
      }
      line.append(label, preview, btns);
      row.append(line);
    });
    const end = document.createElement('div');
    end.className = 'chat__inbox-acts';
    const all = this.#button('Copy everything', () => {
      this.host?.copyText(pages.map((p, i) => `PAGE ${i + 1}: ${p.title}\n${p.text}`).join('\n\n'));
      all.textContent = '✓ Copied';
    });
    end.append(all, this.#button('Done', () => this.close()));
    row.append(end);
    this.#toast(row, { opensChat: false, hideAfter: 0 });
  }

  /** "Clean up my inbox": what junk was found, and Trash / Archive / Cancel. */
  showJunk({ total, senders }) {
    if (this.isOpen) this.close();
    if (this.inboxShowing) this.#endInbox();
    const row = document.createElement('div');
    row.className = 'chat__msg chat__msg--pet chat__inbox';
    const head = document.createElement('b');
    head.textContent = `🧹 I found ${total}${total >= 500 ? '+' : ''} junk emails`;
    const sub = document.createElement('small');
    sub.textContent = 'Ads, social media and newsletters (never starred or important ones). Mostly from:';
    const list = document.createElement('div');
    list.className = 'chat__inbox-sum';
    list.textContent = senders.map((s) => `• ${s.name} (${s.count})`).join('\n');
    const acts = document.createElement('div');
    acts.className = 'chat__inbox-acts';
    const go = async (how) => {
      acts.replaceChildren(Object.assign(document.createElement('div'), { className: 'chat__hint', textContent: 'Cleaning up… 🧹' }));
      this.character.trigger('happy', { then: 'idle' }, true);
      const res = await this.host?.inboxClean(how);
      acts.replaceChildren(Object.assign(document.createElement('div'), { className: 'chat__inbox-q', textContent: res?.text ?? 'Done!' }));
      if (res?.ok) this.character.emote('sparkle', 0.4);
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.mode === 'toast' && this.close(), 8000);
    };
    acts.append(this.#button('🗑 Move to Trash', () => go('trash'), true), this.#button('📦 Archive', () => go('archive')), this.#button('Cancel', () => this.close()));
    row.append(head, sub, list, acts);
    this.#toast(row, { opensChat: false, hideAfter: 0 });
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
    // No pointer to an invisible pet.
    this.el.classList.toggle('ghost', !!c.hidden);
    this.tail.style.left = `${Math.round(Math.max(18, Math.min(w - 18, px - x)))}px`;
  }
}
