import { Stage } from './core/Stage.js';
import { Loop } from './core/Loop.js';
import { ScreenSpace } from './core/ScreenSpace.js';
import { connectSettings } from './core/Settings.js';
import { MOBS, createMob, disposeMob } from './mobs/index.js';
import { Character } from './character/Character.js';
import { ACTIONS } from './character/states.js';
import { PointerDirector } from './interaction/PointerDirector.js';
import { MobMenu } from './interaction/MobMenu.js';
import { Chat } from './interaction/Chat.js';
import { Games } from './games/Games.js';
import { Captions } from './captions/Captions.js';
import { Classes } from './interaction/Classes.js';

const host = window.mobHost ?? null;
const { settings, save } = await connectSettings();

const stage = new Stage(document.getElementById('app'));
const screen = new ScreenSpace(stage);

let mobName = MOBS[settings.mob] ? settings.mob : 'bee';
const character = new Character({ mob: createMob(mobName), scene: stage.scene, settings });
stage.scene.add(character.mob.root);
const chat = new Chat({ character, stage, settings, host });
const game = new Games({ character, stage, settings, host });
const captions = new Captions({ character, settings, save, host });
const classes = new Classes({ character, host, onOpen: () => chat.close() });
chat.onReply = (reply) => {
  if (reply.kind === 'classes') setTimeout(() => classes.open(), 600);
};
const playGame = (id) => {
  chat.close();
  game.toggle(id);
};
const menu = new MobMenu({
  settings,
  save,
  onChat: () => (game.stop(), chat.open()),
  onGame: playGame,
  onStopGame: () => game.stop(),
  onRewrite: (mode) => host?.rewrite(mode),
  onCaptions: () => save({ captionsOn: !settings.captionsOn }),
  onOpen: (what) => (what ? host?.openThing(what) : chat.prefill('open ')),
  onClasses: () => classes.open(),
});
menu.captionsOn = () => settings.captionsOn;
menu.playing = () => game.currentId;
const director = new PointerDirector({ character, screen, host, canvas: stage.renderer.domElement, menu, chat, game, panels: [captions, classes] });

/** Swap the pet's body in place; the character keeps its position, mood and state. */
function applyMob(name) {
  if (!MOBS[name] || name === mobName) return;
  const previous = character.mob;
  const next = createMob(name);
  stage.scene.remove(previous.root);
  disposeMob(previous);
  stage.scene.add(next.root);
  character.setMob(next);
  mobName = name;
  character.trigger('idle', {}, true);
}

function updatePlacement() {
  const scale = screen.scaleForPixels(settings.petSize);
  const [minX, maxX] = screen.movementRange(scale);
  const floorY = screen.floorY(scale);
  const screenH = Math.max(window.screen.availHeight || 0, stage.height);
  const maxLift = Math.max(0, (screenH - 24) / screen.pixelsPerUnit - character.mob.height * scale);
  character.setPlacement({ scale, floorY, minX, maxX, maxLift, halfWidth: screen.halfWidth, halfHeight: screen.halfHeight });
  stage.setFocus(character.loco.x, floorY, scale);
  stage.setShadowStrength(1 - character.lift / (1.2 * scale));
}

const loop = new Loop((dt, t) => {
  if (settings.mob !== mobName) applyMob(settings.mob);
  updatePlacement();
  director.update(dt);
  game.update(dt);
  character.update(dt, t);
  stage.render();
  chat.update();
  captions.update();
  classes.update();
});
loop.start();

character.fsm.listeners.add((name) => host?.reportState(name));

host?.onReminder(({ text }) => chat.announce(text));
host?.onRewrite((r) => chat.showRewrite(r));

host?.onTyping(({ on }) => (on ? character.startTyping('type') : character.stopTyping()));
host?.onSay(({ text, error }) => chat.say(text, { error }));
// Class time: wake up if napping, sit at the desk for a moment, and say which class is opening.
host?.onClassTime(({ text }) => {
  if (['sleep', 'sleepy'].includes(character.stateName)) character.trigger('surprised', { then: 'idle' }, true);
  setTimeout(() => character.startTyping('type'), 700);
  setTimeout(() => character.stopTyping(), 4500);
  chat.say(text);
  character.emote('exclaim', 0.4);
});

host?.onCommand(({ type, name, surprised, prefill }) => {
  if (type === 'chat') {
    game.stop();
    if (prefill) chat.prefill(prefill);
    else chat.open();
  } else if (type === 'classes') {
    classes.open();
  } else if (type === 'game') {
    if (name === 'stop') game.stop();
    else playGame(name);
  } else if (type === 'trigger' && name === 'wake' && surprised) {
    character.trigger('surprised', { then: 'wake' }, true);
  } else if (type === 'trigger' && name === 'wake') {
    character.trigger('wake', {}, true);
  } else if (type === 'trigger' && ACTIONS.includes(name)) {
    character.trigger(name, { then: 'idle' }, true);
  }
});

// Browser fallback (npx vite): number keys trigger moods.
if (!host) {
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const key = e.key.toLowerCase();
    if (/^[0-9]$/.test(key) && ACTIONS[Number(key)]) character.trigger(ACTIONS[Number(key)], { then: 'idle' }, true);
  });
}

window.mob = { stage, character, director, menu, chat, game, captions, settings, screen, loop, get pet() { return character.mob; } };
