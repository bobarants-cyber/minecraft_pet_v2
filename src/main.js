import { Stage, PIXELS_PER_UNIT } from './core/Stage.js';
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
import { NotesBadge } from './interaction/NotesBadge.js';
import { Voice } from './interaction/Voice.js';
import { FocusBadge } from './interaction/FocusBadge.js';
import { Wardrobe } from './character/Outfits.js';
import { Toys } from './character/Toys.js';
import { PanelStack } from './interaction/PanelStack.js';

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
const notesBadge = new NotesBadge({ character, host });
const voice = new Voice({ character, chat, captions, settings, host });
const focusBadge = new FocusBadge({ character, host });
const wardrobe = new Wardrobe();
const toys = new Toys({ character, stage, wardrobe });
/** Effects that skills ask for (confetti when your to-do list is done, sunglasses for sunny weather…). */
function playEffect(effect) {
  if (!effect) return;
  if (effect === 'confetti') toys.burst();
  else if (effect === 'sparkle') character.emote('sparkle', 0.5);
  else if (effect === 'tada') character.trigger('tada', { then: 'idle' }, true);
  else if (effect.startsWith('pose:')) {
    // Realistic Gliddy strikes a pose (or relaxes); he holds it 12 s, or until told to relax.
    const req = JSON.parse(effect.slice(5));
    const m = character.mob;
    if (req.relax) m.relax?.();
    else m.setPose?.(req.pose ?? req.joints, 12);
  }
  else if (effect.startsWith('weather:')) toys.weather(effect.slice(8));
}
host?.onEffect?.(({ effect }) => playEffect(effect));
// Mistakes it spotted while you write or code.
host?.onSuggestions?.((s) => {
  chat.showSuggestions(s);
  character.emote('exclaim', 0.4);
  if (character.stateName !== 'activity') character.face.setExpression('curious');
});
// While the pet talks out loud, the mic would hear it, so pause listening (and a moment after).
host?.onSpeaking?.(({ on }) => (captions.mutedUntil = on ? Infinity : performance.now() + 900));
captions.onNotice = (text, isProblem) => notesBadge.notice(text, isProblem);
chat.onReply = (reply) => {
  if (reply.kind === 'classes') setTimeout(() => classes.open(), 600);
  playEffect(reply.effect);
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
  onNotes: () => (notesBadge.state.active ? host?.stopNotes() : host?.startNotes()),
  onVoice: () => save({ voiceOn: !settings.voiceOn }),
  onFeed: () => toys.feed(),
  onBall: () => toys.playBall(),
  onOutfit: (name) => save({ outfit: name }),
  onCheck: () => host?.checkWriting?.(),
  onQuit: () => host?.quit?.(),
  onCursor: () => becomeCursor(),
  onHide: () => {
    chat.say('Hiding! 🙈 I’m still here and still working. Press ⌃⌥P or use the menu bar to bring me back.');
    setTimeout(() => save({ hidden: true }), 1200);
  },
});
menu.captionsOn = () => settings.captionsOn;
menu.notesOn = () => notesBadge.state.active;
menu.voiceOn = () => settings.voiceOn;
menu.playing = () => game.currentId;
const director = new PointerDirector({ character, screen, host, canvas: stage.renderer.domElement, menu, chat, game, panels: [captions, classes, notesBadge, focusBadge] });

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

/**
 * 🖱 "Be my cursor": the pet spins and shrinks into the spot where it stands, then hides while a tiny Bbokari pointer
 * follows your mouse (the main process draws that one). Coming back, it grows out of the same spot.
 */
let shrinking = false;
let wasCursor = !!settings.cursorMode;
function petPoint() {
  const c = character;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const x = W / 2 + c.loco.x * PIXELS_PER_UNIT;
  const floor = H / 2 - c.placement.floorY * PIXELS_PER_UNIT;
  return { x, y: floor - (c.mob.height * c.placement.scale * PIXELS_PER_UNIT) / 2 };
}
function becomeCursor() {
  if (shrinking || settings.cursorMode) return;
  shrinking = true;
  game.stop();
  chat.say('Watch this! ✨ I’ll be your cursor (I still take notes and do everything). Say “come back” or press ⌃⌥P to get me back.');
  character.trigger('surprised', { then: 'idle' }, true);
  const canvas = stage.renderer.domElement;
  const { x, y } = petPoint();
  setTimeout(() => {
    canvas.style.transformOrigin = `${Math.round(x)}px ${Math.round(y)}px`;
    canvas.style.transition = 'transform 0.9s cubic-bezier(.6,-0.2,.8,.4), opacity 0.9s ease-in';
    canvas.style.transform = 'scale(0.02) rotate(540deg)';
    canvas.style.opacity = '0';
  }, 900);
  setTimeout(() => {
    wasCursor = true;
    save({ cursorMode: true, hidden: true });
    chat.close();
    setTimeout(() => {
      canvas.style.transition = 'none';
      canvas.style.transform = '';
      canvas.style.opacity = '';
      shrinking = false;
    }, 200);
  }, 1850);
}
/** Back from being the cursor: grow out of the floor spot with a little spin. */
function growBack() {
  const canvas = stage.renderer.domElement;
  const { x, y } = petPoint();
  canvas.style.transition = 'none';
  canvas.style.transformOrigin = `${Math.round(x)}px ${Math.round(y)}px`;
  canvas.style.transform = 'scale(0.02) rotate(-360deg)';
  canvas.style.opacity = '0';
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      canvas.style.transition = 'transform 0.7s cubic-bezier(.3,1.5,.5,1), opacity 0.4s ease-out';
      canvas.style.transform = '';
      canvas.style.opacity = '';
    }),
  );
}

/** Invisible mode: the pet keeps working (notes, captions, reminders, voice) but isn't drawn or clickable. */
let wasHidden = null;
function applyHidden() {
  const hidden = !!settings.hidden;
  if (hidden === wasHidden) return;
  wasHidden = hidden;
  character.hidden = hidden;
  stage.renderer.domElement.style.visibility = hidden ? 'hidden' : '';
  if (hidden) {
    game.stop();
    menu.close();
  } else if (wasHidden !== null) {
    if (wasCursor) growBack();
    wasCursor = false;
    character.trigger('surprised', { then: 'idle' }, true);
    character.emote('sparkle', 0.4);
  }
}

// Pop-ups stack instead of covering each other, and can be dragged anywhere (most important first).
const stack = new PanelStack(() => [chat.el, notesBadge.el, focusBadge.el, captions.el, classes.el, ...document.querySelectorAll('.game-panel, .pong-hud')]);

const loop = new Loop((dt, t) => {
  if (settings.mob !== mobName) applyMob(settings.mob);
  updatePlacement();
  director.update(dt);
  game.update(dt);
  applyHidden();
  character.update(dt, t);
  if (!character.hidden) stage.render();
  chat.update();
  captions.update();
  classes.update();
  notesBadge.update(chat.isOpen || character.hidden);
  focusBadge.update(chat.isOpen || character.hidden, notesBadge.visible);
  stack.update();
  toys.update(dt);
  wardrobe.wear(character.mob, settings.outfit);
  if (!['typing', 'activity'].includes(character.stateName)) wardrobe.refresh();
  voice.update();
});
loop.start();

character.fsm.listeners.add((name) => host?.reportState(name));

host?.onReminder(({ text }) => chat.announce(text));
host?.onRewrite((r) => chat.showRewrite(r));

host?.onTyping(({ on }) => (on ? character.startTyping('type') : character.stopTyping()));
host?.onSay(({ text, error }) => {
  chat.say(text, { error });
  // "I opened YouTube", "Done!", "Here's your…": a little ta-da.
  if (!error && /\b(?:i(?:'|’)?ve opened|i opened|opening|opened|done!?|all set|here(?:'|’)s|ta-?da)\b/i.test(text)) character.trigger('tada', { then: 'idle' }, true);
});
host?.onInbox?.(({ items, intro }) => chat.showInbox(items, intro));
host?.onInboxJunk?.((j) => chat.showJunk(j));
host?.onInboxTodo?.((t) => chat.showTodo(t));
host?.onQuiz?.((q) => chat.showQuiz(q));

// React to what you're doing (the Mac side tells us: video, writing, music, meeting, gaming, coding, reading, drawing).
let seenActivity = null;
let focusing = false;
const applyActivity = () => (character.activity = focusing ? 'coding' : settings.reactToActivity ? seenActivity : null);
host?.onActivity?.(({ kind }) => {
  seenActivity = kind;
  applyActivity();
});
// Focus timer: the pet works at its desk next to you; confetti when it's done.
host?.onFocus?.((f) => {
  focusBadge.set(f);
  focusing = f.active;
  applyActivity();
  if (f.finished) toys.burst();
});
host?.onWellbeing?.(({ kind, minutes }) => {
  if (kind === 'break') {
    character.trigger('stretch', { then: 'idle' }, true);
    chat.say(`You’ve been on the computer for ${minutes} minutes. Stretch break! 🧘 Stand up, roll your shoulders and look at something far away for a bit.`);
  } else if (kind === 'late') {
    character.face.setExpression('sleepy');
    character.emote('zzz', 0.4);
    chat.say('It’s getting late! 🌙 Don’t forget to sleep. I’m getting sleepy too…');
  }
});
// Say hello once a day, depending on the time.
setTimeout(() => {
  const today = new Date().toDateString();
  let last = null;
  try {
    last = localStorage.getItem('mob.greeted');
    localStorage.setItem('mob.greeted', today);
  } catch {}
  if (last === today) return;
  const h = new Date().getHours();
  const name = { bee: 'Bee', axolotl: 'Axolotl', bbokari: 'Bbokari' }[settings.mob] ?? 'your buddy';
  const hello = h < 5 ? `You’re up late! 🌙 ${name} is here.` : h < 12 ? 'Good morning! ☀️ Ready for today?' : h < 18 ? 'Good afternoon! 🌤 Nice to see you.' : 'Good evening! 🌆 How was your day?';
  chat.say(hello);
}, 6500);
// Class notes: listen in the background (computer sound first, the mic if there's no BlackHole) while a session runs.
host?.onNotes((state) => {
  notesBadge.set(state);
  if (state.active) {
    // Hear both: the teacher through the computer (💻, needs BlackHole) and you through the microphone (🎤).
    captions.listen('notes', {
      computer: true,
      mic: true,
      anySource: true,
      onLine: (line) => {
        host.notesAdd(line);
        notesBadge.line();
      },
    });
    character.emote('exclaim', 0.4);
  } else {
    captions.unlisten('notes');
    if (state.writing) character.startTyping('think');
  }
});
host?.onNotesDone((r) => {
  character.stopTyping();
  chat.showNotes(r);
});
// Class time: wake up if napping, sit at the desk for a moment, and say which class is opening.
host?.onClassTime(({ text }) => {
  if (['sleep', 'sleepy'].includes(character.stateName)) character.trigger('surprised', { then: 'idle' }, true);
  setTimeout(() => character.startTyping('type'), 700);
  setTimeout(() => character.stopTyping(), 4500);
  chat.say(text);
  character.emote('exclaim', 0.4);
});

host?.onCommand(({ type, name, surprised, prefill, ask }) => {
  if (type === 'chat') {
    game.stop();
    if (ask) chat.ask(ask);
    else if (prefill) chat.prefill(prefill);
    else chat.open();
  } else if (type === 'cursor') {
    becomeCursor();
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

window.mob = { stage, character, director, menu, chat, game, captions, toys, settings, screen, loop, get pet() { return character.mob; } };
