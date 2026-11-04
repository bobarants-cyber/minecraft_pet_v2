const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const WALK_FACING = 1.0;
const CYCLE_LENGTH = 0.8;

export class Locomotion {
  constructor() {
    this.x = 0;
    this.targetX = 0;
    this.speed = 0;
    this.maxSpeed = 0.9;
    this.phase = 0;
    this.walkAmount = 0;
    this.facing = 0;
    this.idleFacing = 0;
    this.minX = -3;
    this.maxX = 3;
    this.scale = 1;
  }

  setBounds(minX, maxX) {
    this.minX = minX;
    this.maxX = maxX;
    this.targetX = clamp(this.targetX, minX, maxX);
  }

  walkTo(x) {
    this.targetX = clamp(x, this.minX, this.maxX);
  }

  stop() {
    this.targetX = this.x;
  }

  get arrived() {
    return Math.abs(this.targetX - this.x) < 0.04 * this.scale && Math.abs(this.speed) < 0.08 * this.scale;
  }

  update(dt, scale) {
    this.scale = scale;
    const vmax = this.maxSpeed * scale;
    const dx = this.targetX - this.x;
    const desired = Math.abs(dx) > 0.01 * scale ? Math.sign(dx) * Math.min(vmax, Math.abs(dx) * 2.5) : 0;
    this.speed += (desired - this.speed) * (1 - Math.exp(-5 * dt));
    this.x += this.speed * dt;

    this.walkAmount = Math.min(1, Math.abs(this.speed) / (0.35 * vmax));
    this.phase += (Math.abs(this.speed) / (CYCLE_LENGTH * scale)) * Math.PI * 2 * dt;

    const facingTarget = Math.abs(this.speed) > 0.12 * vmax ? Math.sign(this.speed) * WALK_FACING : this.idleFacing;
    this.facing += (facingTarget - this.facing) * (1 - Math.exp(-6 * dt));
  }
}
