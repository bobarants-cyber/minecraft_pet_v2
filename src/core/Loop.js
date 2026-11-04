const MAX_DT = 1 / 20;

export class Loop {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.elapsed = 0;
    this.last = 0;
    this.running = false;
    this.tick = this.tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
  }

  tick(now) {
    if (!this.running) return;
    const dt = Math.min(Math.max((now - this.last) / 1000, 0), MAX_DT);
    this.last = now;
    this.elapsed += dt;
    this.onFrame(dt, this.elapsed);
    requestAnimationFrame(this.tick);
  }
}
