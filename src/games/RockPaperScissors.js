import { MiniGame, el, wait } from './MiniGame.js';

const MOVES = {
  rock: { icon: '✊', beats: 'scissors', name: 'Rock' },
  paper: { icon: '✋', beats: 'rock', name: 'Paper' },
  scissors: { icon: '✌️', beats: 'paper', name: 'Scissors' },
};
const KEYS = Object.keys(MOVES);
const counter = (move) => KEYS.find((k) => MOVES[k].beats === move);

export class RockPaperScissors extends MiniGame {
  constructor(opts) {
    super(opts, { id: 'rps', title: '✊ Rock paper scissors' });
    const arena = el('div', 'rps__arena');
    this.youHand = el('div', 'rps__hand', '❔');
    this.petHand = el('div', 'rps__hand', '❔');
    const you = el('div', 'rps__side');
    you.append(this.youHand, el('div', 'rps__label', 'You'));
    this.petSide = el('div', 'rps__side');
    this.petLabel = el('div', 'rps__label');
    this.petSide.append(this.petHand, this.petLabel);
    arena.append(you, el('div', 'rps__vs', 'vs'), this.petSide);
    const buttons = el('div', 'rps__buttons');
    this.buttons = KEYS.map((k) => {
      const b = el('button', 'game-btn rps__btn', `${MOVES[k].icon} ${MOVES[k].name}`);
      b.type = 'button';
      b.addEventListener('click', () => this.#throw(k));
      buttons.appendChild(b);
      return b;
    });
    this.body.append(arena, buttons);
    this.score = { you: 0, pet: 0 };
    this.history = [];
  }

  onStart() {
    this.lookAt = null; // watches your mouse
    this.petLabel.textContent = this.petName;
    this.youHand.textContent = this.petHand.textContent = '❔';
    this.#renderScore();
    this.say('Pick one!');
  }

  #renderScore() {
    this.setScore(`You ${this.score.you} · ${this.petName} ${this.score.pet}`);
  }

  /** Mostly random, but it notices if you keep picking the same thing. */
  #petMove() {
    const recent = this.history.slice(-5);
    if (recent.length >= 3 && Math.random() < 0.4) {
      const counts = {};
      for (const m of recent) counts[m] = (counts[m] ?? 0) + 1;
      const fav = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      return counter(fav);
    }
    return KEYS[Math.floor(Math.random() * 3)];
  }

  async #throw(move) {
    if (this.busy) return;
    this.busy = true;
    this.buttons.forEach((b) => (b.disabled = true));
    this.youHand.textContent = this.petHand.textContent = '✊';
    this.panel.classList.add('rps--shake');
    this.react('excited');
    for (const word of ['Rock…', 'Paper…', 'Scissors…']) {
      this.say(word);
      await wait(330);
      if (!this.active) return;
    }
    this.panel.classList.remove('rps--shake');
    const pet = this.#petMove();
    this.history.push(move);
    this.youHand.textContent = MOVES[move].icon;
    this.petHand.textContent = MOVES[pet].icon;
    if (move === pet) {
      this.say(`Both ${MOVES[move].name.toLowerCase()}! Again!`);
      this.react('wow');
    } else if (MOVES[move].beats === pet) {
      this.score.you++;
      this.say(`${MOVES[move].name} beats ${MOVES[pet].name.toLowerCase()}. You win! 🎉`);
      this.react('lose');
    } else {
      this.score.pet++;
      const caught = this.history.slice(-4, -1).every((m) => m === move) && this.history.length >= 4;
      this.say(`${MOVES[pet].name} beats ${MOVES[move].name.toLowerCase()}. ${this.petName} wins!${caught ? ' (It noticed your favourite 👀)' : ''}`);
      this.react('win');
    }
    this.#renderScore();
    await wait(400);
    this.buttons.forEach((b) => (b.disabled = false));
    this.busy = false;
  }

  onStop() {
    this.panel.classList.remove('rps--shake');
    this.buttons.forEach((b) => (b.disabled = false));
    this.busy = false;
  }
}
