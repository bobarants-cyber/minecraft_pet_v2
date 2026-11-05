import { MiniGame, el, wait } from './MiniGame.js';

const SLOT_X = [14, 112, 210];
const CUP_W = 76;

/** The shell game: a seed goes under a cup, the cups shuffle (faster every round you win), you pick one. */
export class Cups extends MiniGame {
  constructor(opts) {
    super(opts, { id: 'cups', title: '🥤 Find the seed' });
    this.track = el('div', 'cups');
    this.seed = el('div', 'cups__seed', '🌻');
    this.track.appendChild(this.seed);
    this.cups = [0, 1, 2].map((i) => {
      const cup = el('button', 'cups__cup');
      cup.type = 'button';
      cup.innerHTML = '<span class="cups__band"></span>';
      cup.addEventListener('click', () => this.#pick(i));
      this.track.appendChild(cup);
      return { el: cup, slot: i };
    });
    this.go = el('button', 'game-btn', 'Start');
    this.go.type = 'button';
    this.go.addEventListener('click', () => this.#round());
    this.body.append(this.track, this.go);
    this.best = 0;
  }

  onStart() {
    this.lookAt = 'board';
    this.streak = 0;
    this.state = 'ready';
    this.runId = (this.runId ?? 0) + 1;
    this.cups.forEach((c, i) => {
      c.slot = i;
      c.el.classList.remove('cups__cup--up', 'cups__cup--moving');
      c.el.disabled = true;
    });
    this.#layout(0);
    this.seed.style.opacity = '0';
    this.go.textContent = 'Start';
    this.go.style.visibility = 'visible';
    this.#renderScore();
    this.say(`${this.petName} hides a seed. Keep your eye on it!`);
  }

  #renderScore() {
    this.setScore(`Streak ${this.streak}${this.best ? ` · best ${this.best}` : ''}`);
  }

  #layout(ms) {
    for (const c of this.cups) {
      c.el.style.transitionDuration = `${ms}ms`;
      c.el.style.left = `${SLOT_X[c.slot]}px`;
    }
  }

  #placeSeed() {
    const slot = this.cups[this.hidden].slot;
    this.seed.style.left = `${SLOT_X[slot] + CUP_W / 2}px`;
  }

  async #round() {
    if (this.state === 'busy') return;
    const id = this.runId;
    const alive = () => this.active && id === this.runId;
    this.state = 'busy';
    this.go.style.visibility = 'hidden';
    this.cups.forEach((c) => (c.el.disabled = true));

    // Show where the seed is.
    this.hidden = Math.floor(Math.random() * 3);
    this.#placeSeed();
    this.seed.style.opacity = '1';
    const cup = this.cups[this.hidden];
    cup.el.classList.add('cups__cup--up');
    this.say('The seed is here… 👀');
    this.react('excited');
    await wait(1400);
    if (!alive()) return;
    cup.el.classList.remove('cups__cup--up');
    await wait(350);
    if (!alive()) return;
    this.seed.style.opacity = '0';

    // Shuffle: more swaps and faster each round.
    const swaps = 4 + this.streak * 2;
    const ms = Math.max(170, 430 - this.streak * 35);
    this.say('Shuffling!');
    for (let n = 0; n < swaps; n++) {
      const a = Math.floor(Math.random() * 3);
      const b = (a + 1 + Math.floor(Math.random() * 2)) % 3;
      const ca = this.cups.find((c) => c.slot === a);
      const cb = this.cups.find((c) => c.slot === b);
      [ca.slot, cb.slot] = [cb.slot, ca.slot];
      ca.el.classList.add('cups__cup--moving');
      this.#layout(ms);
      await wait(ms + 30);
      if (!alive()) return;
      ca.el.classList.remove('cups__cup--moving');
    }
    this.#placeSeed();
    this.state = 'pick';
    this.cups.forEach((c) => (c.el.disabled = false));
    this.say('Where’s the seed? Click a cup!');
    this.react('think');
  }

  async #pick(i) {
    if (this.state !== 'pick') return;
    const id = this.runId;
    this.state = 'busy';
    this.cups.forEach((c) => (c.el.disabled = true));
    this.seed.style.opacity = '1';
    this.cups[i].el.classList.add('cups__cup--up');
    const found = i === this.hidden;
    if (!found) {
      await wait(450);
      if (!this.active || id !== this.runId) return;
      this.cups[this.hidden].el.classList.add('cups__cup--up');
    }
    if (found) {
      this.streak++;
      this.best = Math.max(this.best, this.streak);
      this.say(this.streak >= 3 ? `Wow, ${this.streak} in a row! 🌟 It gets faster…` : 'You found it! 🌻');
      this.react('cheer');
    } else {
      this.say(`Nope, it was there! Streak: ${this.streak}.`);
      this.streak = 0;
      this.react('smug');
    }
    this.#renderScore();
    await wait(1100);
    if (!this.active || id !== this.runId) return;
    this.cups.forEach((c) => c.el.classList.remove('cups__cup--up'));
    await wait(300);
    this.seed.style.opacity = '0';
    this.state = 'ready';
    this.go.textContent = found ? 'Next round' : 'Try again';
    this.go.style.visibility = 'visible';
  }

  onStop() {
    this.runId++;
  }
}
