// ❄️ Winter Bbokari: while it's snowing he wears a knitted snow hat and shivers. Carry him to the campfire in the
// Snowy cabin theme and he warms up (happy, no more shivering). The warmth lasts a while, then he gets cold again.
// Without the cabin there's no fire, so he only shivers now and then.

const WARM_FOR = 90; // seconds of warmth after leaving the fire

export class Winter {
  constructor({ character, chat, screen, stage }) {
    Object.assign(this, { character, chat, screen, stage });
    this.cold = false;
    this.fire = null; // the fire's position on the screen (only with the Snowy cabin)
    this.warmth = 0; // 0 = freezing, 1 = toasty
    this.nearFor = 0;
    this.toasty = false;
    this.shiver = 0; // eased 0..1
    this.burst = 0; // seconds left in a shiver burst (no fire around)
    this.nextBurst = 4;
    this.nextFlake = 2;
    this.wobbled = false;
  }

  set({ cold, fire, enabled = true }) {
    const now = !!cold && enabled;
    if (now && !this.cold) {
      this.warmth = 0;
      this.toasty = false;
      setTimeout(() => this.cold && this.chat.say(fire ? 'Brrr… 🥶 It’s freezing! Carry me to the campfire? 🔥' : 'Brrr… 🥶 It’s snowing! Good thing I have my hat.'), 1500);
    }
    this.cold = now;
    this.fire = now ? fire ?? null : null;
  }

  /** The hat he wears while it's cold (or null: his normal outfit). */
  get hat() {
    return this.cold ? 'snowhat' : null;
  }

  /** Where his chest is on the screen, in screen pixels. */
  petOnScreen() {
    const r = this.character.mob.root.position;
    const s = this.screen;
    const y = r.y + 0.55 * this.character.placement.scale;
    return {
      x: window.screenX + (r.x / (2 * s.halfWidth) + 0.5) * this.stage.width,
      y: window.screenY + (0.5 - y / (2 * s.halfHeight)) * this.stage.height,
    };
  }

  update(dt) {
    if (!this.cold) {
      this.shiver = Math.max(0, this.shiver - dt * 3);
      return;
    }
    let near = false;
    if (this.fire) {
      const p = this.petOnScreen();
      const reach = Math.max(170, 0.13 * window.screen.width);
      near = Math.hypot(p.x - this.fire.x, (p.y - this.fire.y) * 0.8) < reach;
    }
    if (near) {
      this.nearFor += dt;
      this.warmth = Math.min(1, this.warmth + dt / 3);
      if (!this.toasty && this.nearFor > 1.5) {
        this.toasty = true;
        this.character.face.setExpression('happy');
        this.character.emote('heart', 0.4);
        this.chat.say(['Ahh… toasty! 🔥 Thank you 💛', 'So warm… 🔥😌', 'Mmm, the fire is the best 🔥'][Math.floor(Math.random() * 3)]);
      }
    } else {
      this.nearFor = 0;
      this.warmth = Math.max(0, this.warmth - dt / WARM_FOR);
      if (this.toasty && this.warmth < 0.05) {
        this.toasty = false;
        this.chat.say(this.fire ? 'Brrr… 🥶 I’m cold again. Back to the fire?' : 'Brrr… 🥶');
      }
    }

    let want;
    if (this.fire) want = this.warmth < 0.35 ? 1 - this.warmth / 0.35 : 0;
    else {
      // no fire around: shiver in bursts so it isn't constant
      this.nextBurst -= dt;
      if (this.nextBurst <= 0) { this.burst = 2.5 + Math.random() * 1.5; this.nextBurst = 14 + Math.random() * 10; }
      this.burst = Math.max(0, this.burst - dt);
      want = this.burst > 0 ? 1 : 0;
    }
    const was = this.shiver;
    this.shiver += (want - this.shiver) * (1 - Math.exp(-6 * dt));
    if (was < 0.4 && this.shiver >= 0.4 && ['idle', 'walk'].includes(this.character.stateName)) this.character.face.setExpression('sad');
    if (this.shiver > 0.5) {
      this.nextFlake -= dt;
      if (this.nextFlake <= 0) { this.character.emote('cold', (Math.random() - 0.5) * 0.6); this.nextFlake = 4 + Math.random() * 4; }
    }
  }

  /** Call after the character has posed itself (it resets its position every frame) and before rendering. */
  applyShiver(t) {
    const root = this.character.mob.root;
    const k = this.shiver;
    if (k < 0.01) {
      if (this.wobbled) { root.rotation.z = 0; this.wobbled = false; }
      return;
    }
    const s = this.character.placement.scale;
    root.position.x += (Math.sin(t * 71) * 0.7 + Math.sin(t * 43) * 0.3) * 0.014 * s * k;
    root.position.y += Math.abs(Math.sin(t * 37)) * 0.006 * s * k;
    root.rotation.z = Math.sin(t * 57) * 0.04 * k;
    this.wobbled = true;
  }
}
