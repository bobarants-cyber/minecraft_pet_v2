import { PingPong } from './PingPong.js';
import { TicTacToe } from './TicTacToe.js';
import { RockPaperScissors } from './RockPaperScissors.js';
import { Cups } from './Cups.js';
import { Bubbles } from './Bubbles.js';

/** The games you can play with the pet, in menu order. */
export const GAME_LIST = [
  { id: 'pingpong', label: '🏓 Ping pong' },
  { id: 'tictactoe', label: '⭕ Tic-tac-toe' },
  { id: 'rps', label: '✊ Rock paper scissors' },
  { id: 'cups', label: '🥤 Cups' },
  { id: 'bubbles', label: '🫧 Bubbles' },
];

/** Runs one game at a time and looks like a single game to the rest of the app (pointer handling, the loop). */
export class Games {
  constructor(opts) {
    this.games = {
      pingpong: new PingPong(opts),
      tictactoe: new TicTacToe(opts),
      rps: new RockPaperScissors(opts),
      cups: new Cups(opts),
      bubbles: new Bubbles(opts),
    };
    this.current = null;
  }

  get active() {
    return !!this.current?.active;
  }

  get currentId() {
    return this.active ? Object.keys(this.games).find((k) => this.games[k] === this.current) : null;
  }

  start(id) {
    const g = this.games[id];
    if (!g) return;
    if (this.current === g && g.active) return;
    this.stop();
    this.current = g;
    g.start();
  }

  /** Start `id`, or stop it if it's the one already running. */
  toggle(id) {
    if (this.currentId === id) this.stop();
    else this.start(id);
  }

  stop() {
    this.current?.stop();
    this.current = null;
  }

  update(dt) {
    if (this.current && !this.current.active) this.current = null;
    this.current?.update(dt);
  }

  containsPoint(x, y) {
    return !!this.current?.containsPoint(x, y);
  }

  contains(node) {
    return Object.values(this.games).some((g) => g.contains(node));
  }
}
