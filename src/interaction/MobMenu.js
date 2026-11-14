import { MOBS, nextMob } from '../mobs/index.js';
import { petName } from '../mobs/names.js';
import { GAME_LIST } from '../games/Games.js';
import { OUTFITS } from '../character/Outfits.js';
import { DESIGNS, COLORS, FINISHES, catalogSize, randomItem, parseItem } from '../character/KpopCloset.js';

const MARGIN_PX = 8;
const OFFSET_PX = 14;

/** Right-click popup next to the pet: "Chat" opens the speech bubble; "Switch mob" shows the mob you'd switch to. */
export class MobMenu {
  constructor({ settings, save, onChat = null, onGame = null, onStopGame = null, onRewrite = null, onCaptions = null, onOpen = null, onClasses = null, onNotes = null, onVoice = null, onFeed = null, onBall = null, onOutfit = null, onCustomize = null, onHide = null, onCursor = null, onCheck = null, onQuit = null, parent = document.body }) {
    this.settings = settings;
    this.save = save;
    this.isOpen = false;

    this.el = document.createElement('div');
    this.el.className = 'mob-menu';
    this.el.innerHTML = `
      <button type="button" class="mob-menu__row mob-menu__chat">
        <span>💬 Chat</span>
        <span class="mob-menu__value">Ask me anything</span>
      </button>
      <div class="mob-menu__text mob-menu__play">
        <div class="mob-menu__text-label">🐥 Play with me</div>
        <div class="mob-menu__chips mob-menu__chips--wrap">
          <button type="button" class="mob-menu__chip" data-toy="feed">🍓 Feed</button>
          <button type="button" class="mob-menu__chip" data-toy="ball">⚽ Ball</button>
        </div>
        <div class="mob-menu__text-label mob-menu__outfit-label">🎀 Outfit</div>
        <div class="mob-menu__chips mob-menu__chips--wrap mob-menu__outfits">
          ${Object.entries(OUTFITS).map(([k, label]) => `<button type="button" class="mob-menu__chip" data-outfit="${k}" title="${label}">${k === 'none' ? '✖' : label.split(' ')[0]}</button>`).join('')}
        </div>
        <div class="mob-menu__text-label">💖 K-pop items <span class="kpop__count">(${catalogSize().toLocaleString()} to mix)</span></div>
        <div class="kpop">
          <div class="kpop__row">
            <select class="kpop__design">${Object.entries(DESIGNS).map(([k, d]) => `<option value="${k}">${d.emoji} ${d.label}${d.slot === 'head' ? ' (head)' : ''}</option>`).join('')}</select>
            <select class="kpop__style"></select>
            <select class="kpop__handle"></select>
            <select class="kpop__finish">${Object.entries(FINISHES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          </div>
          <div class="kpop__colors">${Object.entries(COLORS).map(([k, v]) => `<button type="button" class="kpop__swatch" data-color="${k}" title="${k}" style="background:${v}"></button>`).join('')}</div>
          <div class="mob-menu__chips mob-menu__chips--wrap">
            <button type="button" class="mob-menu__chip kpop__random">🎲 Surprise me</button>
            <button type="button" class="mob-menu__chip kpop__off" data-slot="hand">✖ Hands</button>
            <button type="button" class="mob-menu__chip kpop__off" data-slot="head">✖ Head</button>
          </div>
        </div>
      </div>
      <div class="mob-menu__text mob-menu__games">
        <div class="mob-menu__text-label">🎮 Play a game</div>
        <div class="mob-menu__chips mob-menu__chips--wrap">
          ${GAME_LIST.map((g) => `<button type="button" class="mob-menu__chip mob-menu__game" data-game="${g.id}">${g.label}</button>`).join('')}
        </div>
        <button type="button" class="mob-menu__row mob-menu__stop">⏹ Stop the game</button>
      </div>
      <div class="mob-menu__text mob-menu__open">
        <div class="mob-menu__text-label">🚀 Open for me</div>
        <div class="mob-menu__chips mob-menu__chips--wrap">
          <button type="button" class="mob-menu__chip" data-open="youtube">YouTube</button>
          <button type="button" class="mob-menu__chip" data-open="google">Google</button>
          <button type="button" class="mob-menu__chip" data-open="google meet">Meet</button>
          <button type="button" class="mob-menu__chip" data-open="zoom">Zoom</button>
          <button type="button" class="mob-menu__chip" data-open="">Other…</button>
        </div>
      </div>
      <button type="button" class="mob-menu__row mob-menu__classes">
        <span>📅 My classes</span>
        <span class="mob-menu__value">Calendar</span>
      </button>
      <button type="button" class="mob-menu__row mob-menu__voice">
        <span>🗣 Hey Bbokari</span>
        <span class="mob-menu__value">Off</span>
      </button>
      <button type="button" class="mob-menu__row mob-menu__notes">
        <span>📝 Take notes</span>
        <span class="mob-menu__value">Listen &amp; write</span>
      </button>
      <button type="button" class="mob-menu__row mob-menu__captions">
        <span>🎙 Live captions</span>
        <span class="mob-menu__value">Off</span>
      </button>
      <button type="button" class="mob-menu__row mob-menu__cursor">
        <span>🖱 Be my cursor</span>
        <span class="mob-menu__value">I keep working</span>
      </button>
      <button type="button" class="mob-menu__row mob-menu__hide">
        <span>🙈 Hide me</span>
        <span class="mob-menu__value">I keep working</span>
      </button>
      <button type="button" class="mob-menu__row mob-menu__switch">
        <span>Switch mob</span>
        <span class="mob-menu__value"></span>
      </button>
      <button type="button" class="mob-menu__row mob-menu__customize">
        <span>🎨 Make your own mob</span>
        <span class="mob-menu__value">colours, size, extras</span>
      </button>
      <div class="mob-menu__text mob-menu__write">
        <div class="mob-menu__text-label">✏️ Highlight text in any app, then:</div>
        <button type="button" class="mob-menu__row mob-menu__check">🔍 Check my writing <span class="mob-menu__value">spot mistakes</span></button>
        <div class="mob-menu__chips">
          <button type="button" class="mob-menu__chip" data-mode="summarize" title="⌃⌥S">Summarize</button>
          <button type="button" class="mob-menu__chip" data-mode="humanize" title="⌃⌥H">Humanize</button>
          <button type="button" class="mob-menu__chip" data-mode="improve" title="⌃⌥B">Improve</button>
        </div>
      </div>
    `;
    for (const chip of this.el.querySelectorAll('.mob-menu__chip[data-mode]')) {
      chip.addEventListener('click', () => {
        this.close();
        onRewrite?.(chip.dataset.mode);
      });
    }
    this.value = this.el.querySelector('.mob-menu__switch .mob-menu__value');
    for (const chip of this.el.querySelectorAll('.mob-menu__game')) {
      chip.addEventListener('click', () => {
        this.close();
        onGame?.(chip.dataset.game);
      });
    }
    for (const chip of this.el.querySelectorAll('.mob-menu__chip[data-open]')) {
      chip.addEventListener('click', () => {
        this.close();
        onOpen?.(chip.dataset.open);
      });
    }
    this.el.querySelector('.mob-menu__classes').addEventListener('click', () => {
      this.close();
      onClasses?.();
    });
    for (const chip of this.el.querySelectorAll('.mob-menu__chip[data-toy]')) {
      chip.addEventListener('click', () => {
        this.close();
        (chip.dataset.toy === 'feed' ? onFeed : onBall)?.();
      });
    }
    this.#setupKpop(save);
    for (const chip of this.el.querySelectorAll('.mob-menu__chip[data-outfit]')) {
      chip.addEventListener('click', () => {
        onOutfit?.(chip.dataset.outfit);
        for (const o of this.el.querySelectorAll('.mob-menu__chip[data-outfit]')) o.classList.toggle('is-on', o === chip);
      });
    }
    this.el.querySelector('.mob-menu__check').addEventListener('click', () => {
      this.close();
      onCheck?.();
    });
    this.el.querySelector('.mob-menu__cursor').addEventListener('click', () => {
      this.close();
      onCursor?.();
    });
    this.el.querySelector('.mob-menu__hide').addEventListener('click', () => {
      this.close();
      onHide?.();
    });
    this.voiceRow = this.el.querySelector('.mob-menu__voice');
    this.voiceRow.addEventListener('click', () => {
      this.close();
      onVoice?.();
    });
    this.notesRow = this.el.querySelector('.mob-menu__notes');
    this.notesRow.addEventListener('click', () => {
      this.close();
      onNotes?.();
    });
    this.captionsRow = this.el.querySelector('.mob-menu__captions');
    this.captionsRow.addEventListener('click', () => {
      this.close();
      onCaptions?.();
    });
    this.stopRow = this.el.querySelector('.mob-menu__stop');
    this.stopRow.addEventListener('click', () => {
      this.close();
      onStopGame?.();
    });
    this.el.querySelector('.mob-menu__chat').addEventListener('click', () => {
      this.close();
      onChat?.();
    });
    this.el.querySelector('.mob-menu__customize').addEventListener('click', () => {
      this.close();
      onCustomize?.();
    });
    this.el.querySelector('.mob-menu__switch').addEventListener('click', () => {
      this.save({ mob: nextMob(this.settings.mob) });
      this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
    const quit = document.createElement('button');
    quit.type = 'button';
    quit.className = 'mob-menu__row mob-menu__quit';
    quit.innerHTML = '<span>⏻ Quit</span><span class="mob-menu__value">close the app</span>';
    quit.addEventListener('click', () => {
      this.close();
      onQuit?.();
    });
    this.el.appendChild(quit);
    window.addEventListener('resize', () => this.place());
    parent.appendChild(this.el);
  }

  contains(node) {
    return this.el.contains(node);
  }

  open(px, py) {
    this.captionsRow.querySelector('.mob-menu__value').textContent = this.captionsOn?.() ? 'On' : 'Off';
    this.voiceRow.querySelector('span').textContent = `🗣 Hey ${petName(this.settings.mob, 'Bbokari')}`;
    this.voiceRow.querySelector('.mob-menu__value').textContent = this.voiceOn?.() ? 'Listening' : 'Off';
    const noting = this.notesOn?.();
    this.notesRow.querySelector('span').textContent = noting ? '⏹ Stop notes' : '📝 Take notes';
    this.notesRow.querySelector('.mob-menu__value').textContent = noting ? 'Write them up' : 'Listen & write';
    for (const o of this.el.querySelectorAll('.mob-menu__chip[data-outfit]')) o.classList.toggle('is-on', o.dataset.outfit === (this.settings.outfit ?? 'none'));
    this.el.querySelector('.mob-menu__outfits').style.display = this.el.querySelector('.mob-menu__outfit-label').style.display = !['bee', 'axolotl', 'myCat'].includes(this.settings.mob) ? '' : 'none'; // (every sculpted pet can dress up)
    const playing = this.playing?.();
    this.stopRow.style.display = playing ? '' : 'none';
    for (const chip of this.el.querySelectorAll('.mob-menu__game')) chip.classList.toggle('is-on', chip.dataset.game === playing);
    this.value.textContent = MOBS[nextMob(this.settings.mob)].label;
    this.isOpen = true;
    this.el.classList.add('open');
    // Remember where you clicked as a distance from the bottom: the window grows upwards to make room for the menu
    // (it's only a strip along the bottom of the screen otherwise), and the click spot moves with it.
    this.anchor = { px, fromBottom: window.innerHeight - py };
    this.place();
  }

  /** Right of the cursor, vertically centred on it, inside the window (it scrolls if it's taller than the window). */
  place() {
    if (!this.isOpen || !this.anchor) return;
    const H = window.innerHeight;
    this.el.style.maxHeight = `${H - 2 * MARGIN_PX}px`;
    const { offsetWidth: w, offsetHeight: h } = this.el;
    const py = H - this.anchor.fromBottom;
    const x = Math.max(MARGIN_PX, Math.min(this.anchor.px + OFFSET_PX, window.innerWidth - w - MARGIN_PX));
    const y = Math.max(MARGIN_PX, Math.min(py - h / 2, H - h - MARGIN_PX));
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('open');
  }

  /** The K-pop items picker: design, style, (lightstick handle), colour and finish; changes apply straight away. */
  #setupKpop(save) {
    const q = (c) => this.el.querySelector(c);
    const state = { design: 'lightstick', style: 'heart', handle: 'classic', color: 'pink', finish: 'glossy' };
    const fill = () => {
      const d = DESIGNS[state.design];
      q('.kpop__style').innerHTML = Object.entries(d.styles).map(([k, v]) => `<option value="${k}"${k === state.style ? ' selected' : ''}>${v}</option>`).join('');
      q('.kpop__handle').style.display = d.handles ? '' : 'none';
      q('.kpop__handle').innerHTML = d.handles ? Object.entries(d.handles).map(([k, v]) => `<option value="${k}"${k === state.handle ? ' selected' : ''}>${v} handle</option>`).join('') : '';
      q('.kpop__design').value = state.design;
      q('.kpop__finish').value = state.finish;
      for (const b of this.el.querySelectorAll('.kpop__swatch')) b.classList.toggle('is-on', b.dataset.color === state.color);
    };
    const apply = () => {
      const d = DESIGNS[state.design];
      const id = [state.design, state.style, state.color, state.finish, ...(d.handles ? [state.handle] : [])].join('.');
      save(d.slot === 'head' ? { kpopHead: id } : { kpopHand: id });
    };
    q('.kpop__design').addEventListener('change', (e) => { state.design = e.target.value; state.style = Object.keys(DESIGNS[state.design].styles)[0]; fill(); apply(); });
    q('.kpop__style').addEventListener('change', (e) => { state.style = e.target.value; apply(); });
    q('.kpop__handle').addEventListener('change', (e) => { state.handle = e.target.value; apply(); });
    q('.kpop__finish').addEventListener('change', (e) => { state.finish = e.target.value; apply(); });
    for (const b of this.el.querySelectorAll('.kpop__swatch')) b.addEventListener('click', () => { state.color = b.dataset.color; fill(); apply(); });
    q('.kpop__random').addEventListener('click', () => {
      const id = randomItem(Math.random() < 0.6 ? 'hand' : 'head');
      Object.assign(state, parseItem(id));
      if (!DESIGNS[state.design].handles) state.handle = 'classic';
      fill();
      save(DESIGNS[state.design].slot === 'head' ? { kpopHead: id } : { kpopHand: id });
    });
    for (const b of this.el.querySelectorAll('.kpop__off')) b.addEventListener('click', () => save(b.dataset.slot === 'head' ? { kpopHead: '' } : { kpopHand: '' }));
    fill();
  }
}
