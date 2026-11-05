import { MiniGame, el, wait } from './MiniGame.js';

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
/** How often the pet plays its best move; the rest of the time it picks any free square, so it can be beaten. */
const SKILL = 0.72;

function winner(b) {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return { who: b[a], line: [a, c, d] };
  return b.every(Boolean) ? { who: 'draw' } : null;
}

/** Best move for `me` by minimax (the board is tiny, so a full search is instant). */
function bestMove(b, me, them) {
  let best = { score: -Infinity, moves: [] };
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = me;
    const s = -negamax(b, them, me, 1);
    b[i] = null;
    if (s > best.score) best = { score: s, moves: [i] };
    else if (s === best.score) best.moves.push(i);
  }
  return best.moves[Math.floor(Math.random() * best.moves.length)];
}

function negamax(b, turn, other, depth) {
  const w = winner(b);
  if (w) return w.who === 'draw' ? 0 : w.who === turn ? 10 - depth : depth - 10;
  let best = -Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn;
    best = Math.max(best, -negamax(b, other, turn, depth + 1));
    b[i] = null;
  }
  return best;
}

export class TicTacToe extends MiniGame {
  constructor(opts) {
    super(opts, { id: 'ttt', title: '⭕ Tic-tac-toe' });
    this.grid = el('div', 'ttt');
    this.cells = Array.from({ length: 9 }, (_, i) => {
      const b = el('button', 'ttt__cell');
      b.type = 'button';
      b.addEventListener('click', () => this.#play(i));
      this.grid.appendChild(b);
      return b;
    });
    this.again = el('button', 'game-btn', 'New game');
    this.again.type = 'button';
    this.again.addEventListener('click', () => this.#newGame());
    this.body.append(this.grid, this.again);
    this.tally = { you: 0, pet: 0, draw: 0 };
    this.youStart = true;
  }

  onStart() {
    this.lookAt = 'board';
    this.#newGame();
  }

  #renderScore() {
    this.setScore(`You ${this.tally.you} · ${this.petName} ${this.tally.pet}${this.tally.draw ? ` · ties ${this.tally.draw}` : ''}`);
  }

  #newGame() {
    this.board = Array(9).fill(null);
    this.gameId = (this.gameId ?? 0) + 1;
    this.over = false;
    this.busy = false;
    this.cells.forEach((c) => {
      c.textContent = '';
      c.className = 'ttt__cell';
      c.disabled = false;
    });
    this.again.style.visibility = 'hidden';
    this.#renderScore();
    if (this.youStart) this.say('You’re ⭐. Your turn!');
    else {
      this.say(`${this.petName} goes first…`);
      this.#petTurn();
    }
    this.youStart = !this.youStart;
  }

  #mark(i, who) {
    this.board[i] = who;
    const c = this.cells[i];
    c.textContent = who === 'you' ? '⭐' : this.petIcon;
    c.classList.add('ttt__cell--on', `ttt__cell--${who}`);
    c.disabled = true;
  }

  #play(i) {
    if (this.over || this.busy || this.board[i]) return;
    this.#mark(i, 'you');
    if (!this.#check()) this.#petTurn();
  }

  async #petTurn() {
    this.busy = true;
    const id = this.gameId;
    this.react('think');
    await wait(550 + Math.random() * 450);
    if (!this.active || id !== this.gameId || this.over) return;
    const free = this.board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    const i = Math.random() < SKILL ? bestMove(this.board, 'pet', 'you') : free[Math.floor(Math.random() * free.length)];
    this.#mark(i, 'pet');
    this.character.emote('sparkle', 0.4);
    this.busy = false;
    if (!this.#check()) this.say('Your turn!');
  }

  #check() {
    const w = winner(this.board);
    if (!w) return false;
    this.over = true;
    this.cells.forEach((c) => (c.disabled = true));
    w.line?.forEach((i) => this.cells[i].classList.add('ttt__cell--win'));
    if (w.who === 'you') {
      this.tally.you++;
      this.say(`You win! 🎉 ${this.petName} is sulking.`);
      this.react('lose');
    } else if (w.who === 'pet') {
      this.tally.pet++;
      this.say(`${this.petName} wins! 🐥 Try again?`);
      this.react('win');
    } else {
      this.tally.draw++;
      this.say('It’s a tie! 🤝');
      this.react('wow');
    }
    this.#renderScore();
    this.again.style.visibility = 'visible';
    return true;
  }
}
