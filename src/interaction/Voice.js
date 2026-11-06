import { findWake, isEmptyQuestion, wakePrompt } from './wake.js';

const FOLLOW_UP_MS = 9000;

/**
 * "Hey Bbokari": listens to your microphone only (never the computer's sound), and when it hears the pet's name it
 * answers what you said after it, using the same assistant as the chat (so "set a timer…" and "open …" work too).
 * Say just the name and it answers whatever you say next.
 */
export class Voice {
  constructor({ character, chat, captions, settings, host }) {
    this.character = character;
    this.chat = chat;
    this.captions = captions;
    this.settings = settings;
    this.host = host;
    this.on = false;
    this.waitingUntil = 0;
    this.busy = false;
  }

  /** Every frame: follow the setting. */
  update() {
    const want = !!this.settings.voiceOn && !!this.host?.transcribe;
    if (want === this.on && this.mob === this.settings.mob) return;
    this.on = want;
    this.mob = this.settings.mob;
    if (want) this.captions.listen('voice', { mic: true, computer: false, prompt: wakePrompt(this.mob), onLine: (l) => this.#heard(l) });
    else this.captions.unlisten('voice');
  }

  async #heard(line) {
    if (line.kind !== 'mic' || this.busy) return;
    const wake = findWake(line.text, this.settings.mob);
    let question = null;
    if (wake && !isEmptyQuestion(wake.question)) question = wake.question;
    else if (wake) {
      // Just the name: perk up and take the next thing you say as the question.
      this.waitingUntil = performance.now() + FOLLOW_UP_MS;
      this.character.trigger('surprised', { then: 'idle' }, true);
      this.character.emote('exclaim', 0.4);
      this.chat.say('Yes? 👂');
      return;
    } else if (performance.now() < this.waitingUntil) question = line.text;
    if (!question) return;
    this.waitingUntil = 0;
    this.busy = true;
    try {
      await this.chat.voiceAsk(question);
    } finally {
      this.busy = false;
    }
  }
}
