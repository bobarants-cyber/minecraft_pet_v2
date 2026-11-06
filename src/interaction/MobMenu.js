import { MOBS, nextMob } from '../mobs/index.js';
import { GAME_LIST } from '../games/Games.js';
import { OUTFITS } from '../character/Outfits.js';

const MARGIN_PX = 8;
const OFFSET_PX = 14;

/** Right-click popup next to the pet: "Chat" opens the speech bubble; "Switch mob" shows the mob you'd switch to. */
export class MobMenu {
  constructor({ settings, save, onChat = null, onGame = null, onStopGame = null, onRewrite = null, onCaptions = null, onOpen = null, onClasses = null, onNotes = null, onVoice = null, onFeed = null, onBall = null, onOutfit = null, onHide = null, onCheck = null, parent = document.body }) {
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
      <button type="button" class="mob-menu__row mob-menu__hide">
        <span>🙈 Hide me</span>
        <span class="mob-menu__value">I keep working</span>
      </button>
      <button type="button" class="mob-menu__row mob-menu__switch">
        <span>Switch mob</span>
        <span class="mob-menu__value"></span>
      </button>
      <div class="mob-menu__text">
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
    this.el.querySelector('.mob-menu__switch').addEventListener('click', () => {
      this.save({ mob: nextMob(this.settings.mob) });
      this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
    parent.appendChild(this.el);
  }

  contains(node) {
    return this.el.contains(node);
  }

  open(px, py) {
    this.captionsRow.querySelector('.mob-menu__value').textContent = this.captionsOn?.() ? 'On' : 'Off';
    this.voiceRow.querySelector('span').textContent = `🗣 Hey ${MOBS[this.settings.mob]?.label ?? 'Bbokari'}`;
    this.voiceRow.querySelector('.mob-menu__value').textContent = this.voiceOn?.() ? 'Listening' : 'Off';
    const noting = this.notesOn?.();
    this.notesRow.querySelector('span').textContent = noting ? '⏹ Stop notes' : '📝 Take notes';
    this.notesRow.querySelector('.mob-menu__value').textContent = noting ? 'Write them up' : 'Listen & write';
    for (const o of this.el.querySelectorAll('.mob-menu__chip[data-outfit]')) o.classList.toggle('is-on', o.dataset.outfit === (this.settings.outfit ?? 'none'));
    this.el.querySelector('.mob-menu__outfits').style.display = this.el.querySelector('.mob-menu__outfit-label').style.display = this.settings.mob === 'bbokari' ? '' : 'none';
    const playing = this.playing?.();
    this.stopRow.style.display = playing ? '' : 'none';
    for (const chip of this.el.querySelectorAll('.mob-menu__game')) chip.classList.toggle('is-on', chip.dataset.game === playing);
    this.value.textContent = MOBS[nextMob(this.settings.mob)].label;
    this.isOpen = true;
    this.el.classList.add('open');
    // Sit to the right of the cursor, vertically centred on it, kept inside the window.
    const { offsetWidth: w, offsetHeight: h } = this.el;
    const x = Math.max(MARGIN_PX, Math.min(px + OFFSET_PX, window.innerWidth - w - MARGIN_PX));
    const y = Math.max(MARGIN_PX, Math.min(py - h / 2, window.innerHeight - h - MARGIN_PX));
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('open');
  }
}
