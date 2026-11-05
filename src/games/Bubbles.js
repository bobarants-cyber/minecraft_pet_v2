import { MiniGame, el } from './MiniGame.js';

const ROUND_S = 30;
const AREA_W = 380;
const AREA_H = 320;
const rand = (a, b) => a + Math.random() * (b - a);

/**
 * Pop the bubbles the pet blows. They drift up inside a small area around the pet (not over the whole screen) and
 * burst on their own when they reach the top. Golden bubbles are worth 3.
 */
export class Bubbles extends MiniGame {
  constructor(opts) {
    super(opts, { id: 'bubbles', title: '🫧 Bubble pop' });
    this.go = el('button', 'game-btn', 'Start');
    this.go.type = 'button';
    this.go.addEventListener('click', () => this.#begin());
    this.timeEl = el('div', 'bubbles__time');
    this.body.append(this.timeEl, this.go);

    this.canvas = el('canvas', 'bubbles');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.addEventListener('pointerdown', (e) => this.#click(e));
    (opts.parent ?? document.body).appendChild(this.canvas);
    try {
      this.best = Number(localStorage.getItem('mob.bubbles.best')) || 0;
    } catch {
      this.best = 0;
    }
  }

  onStart() {
    this.lookAt = null;
    this.playing = false;
    this.bubbles = [];
    this.pops = [];
    this.score = 0;
    this.combo = 0;
    this.canvas.classList.add('on');
    this.go.textContent = 'Start';
    this.go.style.visibility = 'visible';
    this.timeEl.textContent = `${ROUND_S} seconds`;
    this.#renderScore();
    this.say(`${this.petName} will blow bubbles. Pop them! Golden ones are worth 3.`);
  }

  onStop() {
    this.playing = false;
    this.canvas.classList.remove('on');
  }

  #renderScore() {
    this.setScore(`Score ${this.score}${this.best ? ` · best ${this.best}` : ''}`);
  }

  #begin() {
    this.playing = true;
    this.timeLeft = ROUND_S;
    this.nextBubble = 0.3;
    this.score = 0;
    this.combo = 0;
    this.bubbles = [];
    this.go.style.visibility = 'hidden';
    this.say('Pop pop pop!');
    this.react('excited');
    this.#renderScore();
  }

  #end() {
    this.playing = false;
    const record = this.score > this.best;
    if (record) {
      this.best = this.score;
      try {
        localStorage.setItem('mob.bubbles.best', String(this.best));
      } catch {}
    }
    this.say(record ? `New best: ${this.score}! 🎉` : `Time’s up! You popped ${this.score} points.`);
    this.react(this.score >= 15 ? 'win' : 'cheer');
    this.go.textContent = 'Play again';
    this.go.style.visibility = 'visible';
    this.#renderScore();
  }

  /** The play area: a box around the pet, sitting on the bottom of the screen. */
  #area() {
    const { x } = this.petBox();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const left = Math.max(0, Math.min(W - AREA_W, x - AREA_W / 2));
    return { left, top: H - AREA_H, w: AREA_W, h: AREA_H };
  }

  containsPoint(x, y) {
    if (super.containsPoint(x, y)) return true;
    if (!this.active || !this.playing) return false;
    const a = this.#area();
    return x >= a.left && x <= a.left + a.w && y >= a.top && y <= a.top + a.h;
  }

  contains(node) {
    return super.contains(node) || node === this.canvas;
  }

  #click(e) {
    if (!this.playing) return;
    const a = this.#area();
    const x = e.clientX - a.left;
    const y = e.clientY - a.top;
    // Pop the nearest bubble under the click (a little forgiving at the edges).
    let hit = null;
    let bestD = Infinity;
    for (const b of this.bubbles) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < b.r + 8 && d < bestD) {
        hit = b;
        bestD = d;
      }
    }
    if (!hit) {
      this.combo = 0;
      return;
    }
    this.bubbles.splice(this.bubbles.indexOf(hit), 1);
    const points = hit.gold ? 3 : 1;
    this.score += points;
    this.combo++;
    this.pops.push({ x: hit.x, y: hit.y, r: hit.r, t: 0, gold: hit.gold, label: `+${points}` });
    if (this.combo > 0 && this.combo % 6 === 0) {
      this.character.emote('heart', Math.random() < 0.5 ? -0.5 : 0.5);
      this.say(`${this.combo} in a row! 🔥`);
    }
    this.#renderScore();
  }

  tick(dt) {
    const a = this.#area();
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(a.w * dpr) || this.canvas.height !== Math.round(a.h * dpr)) {
      this.canvas.width = Math.round(a.w * dpr);
      this.canvas.height = Math.round(a.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.canvas.style.left = `${a.left}px`;
    this.canvas.style.top = `${a.top}px`;
    this.canvas.style.width = `${a.w}px`;
    this.canvas.style.height = `${a.h}px`;
    this.canvas.classList.toggle('live', this.playing);

    if (this.playing) {
      this.timeLeft -= dt;
      this.timeEl.textContent = `⏱ ${Math.max(0, Math.ceil(this.timeLeft))} s`;
      this.nextBubble -= dt;
      if (this.nextBubble <= 0) {
        // Faster as time runs out.
        this.nextBubble = rand(0.35, 0.75) * (0.55 + 0.45 * (this.timeLeft / ROUND_S));
        this.#blow(a);
      }
      if (this.timeLeft <= 0) this.#end();
    }

    for (const b of this.bubbles) {
      b.t += dt;
      b.y += b.vy * dt;
      b.x += Math.sin(b.t * b.wobble + b.phase) * 22 * dt + b.vx * dt;
      b.x = Math.max(b.r, Math.min(a.w - b.r, b.x));
    }
    // Bubbles that reach the top of the area burst by themselves.
    for (const b of this.bubbles.filter((b) => b.y < b.r + 4)) this.pops.push({ x: b.x, y: b.y, r: b.r, t: 0, gold: b.gold, label: '' });
    this.bubbles = this.bubbles.filter((b) => b.y >= b.r + 4);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 0.45);
    this.#draw(a);
  }

  #blow(a) {
    const { x, floor, top } = this.petBox();
    const beakY = floor - (floor - top) * 0.55;
    const gold = Math.random() < 0.12;
    this.bubbles.push({
      x: x - a.left + rand(-10, 10),
      y: beakY - a.top,
      r: gold ? rand(13, 17) : rand(14, 26),
      vx: rand(-30, 30),
      vy: -rand(45, 85),
      wobble: rand(1.5, 3),
      phase: rand(0, 6),
      t: 0,
      gold,
    });
    const c = this.character;
    if (Math.random() < 0.3) c.face.setExpression(Math.random() < 0.5 ? 'uwu' : 'happy');
  }

  #draw(a) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, a.w, a.h);
    for (const b of this.bubbles) {
      const grow = Math.min(1, b.t / 0.25);
      const r = b.r * grow;
      const g = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.35, r * 0.1, b.x, b.y, r);
      if (b.gold) {
        g.addColorStop(0, 'rgba(255,250,210,0.95)');
        g.addColorStop(0.6, 'rgba(255,205,60,0.55)');
        g.addColorStop(1, 'rgba(230,160,20,0.85)');
      } else {
        g.addColorStop(0, 'rgba(255,255,255,0.85)');
        g.addColorStop(0.55, 'rgba(170,220,255,0.18)');
        g.addColorStop(0.85, 'rgba(200,170,255,0.35)');
        g.addColorStop(1, 'rgba(120,190,255,0.75)');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = b.gold ? 'rgba(200,140,10,0.8)' : 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.ellipse(b.x - r * 0.38, b.y - r * 0.42, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of this.pops) {
      const k = p.t / 0.45;
      ctx.strokeStyle = p.gold ? `rgba(240,180,30,${1 - k})` : `rgba(255,255,255,${1 - k})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const r0 = p.r * (0.6 + k * 0.8);
        const r1 = r0 + 6;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(ang) * r0, p.y + Math.sin(ang) * r0);
        ctx.lineTo(p.x + Math.cos(ang) * r1, p.y + Math.sin(ang) * r1);
        ctx.stroke();
      }
      if (p.label) {
        ctx.fillStyle = p.gold ? `rgba(200,120,0,${1 - k})` : `rgba(40,60,90,${1 - k})`;
        ctx.font = '700 15px -apple-system, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.label, p.x, p.y - k * 24);
      }
    }
  }
}
