import { MOBS, nextMob } from '../mobs/index.js';

const MARGIN_PX = 8;
const OFFSET_PX = 14;

/** Right-click popup next to the pet: "Chat" opens the speech bubble; "Switch mob" shows the mob you'd switch to. */
export class MobMenu {
  constructor({ settings, save, onChat = null, parent = document.body }) {
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
      <button type="button" class="mob-menu__row mob-menu__switch">
        <span>Switch mob</span>
        <span class="mob-menu__value"></span>
      </button>
    `;
    this.value = this.el.querySelector('.mob-menu__switch .mob-menu__value');
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
