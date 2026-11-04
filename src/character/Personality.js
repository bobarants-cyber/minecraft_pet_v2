const rand = (a, b) => a + Math.random() * (b - a);

function weightedPick(options) {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [name, w] of options) {
    r -= w;
    if (r <= 0) return name;
  }
  return options[0][0];
}

export class Personality {
  constructor() {
    this.energy = 1;
  }

  update(dt, stateName) {
    if (stateName === 'sleep') this.energy = Math.min(1, this.energy + dt / 35);
    else this.energy = Math.max(0, this.energy - dt / 420);
  }

  idleExpression() {
    return this.energy < 0.3 ? 'sleepy' : 'neutral';
  }

  nextAction(c) {
    if (this.energy < 0.18) return 'sleepy';

    const options = c.socialMode
      ? [['idle', 3], ['curious', 1.2], ['happy', 0.8], ['wave', 0.5], ['dance', 0.6], ['excited', 0.4]]
      : [
          ['walk', c.settings.autoWalk ? 4 : 0],
          ['idle', 2],
          ['curious', 1],
          ['happy', 0.5],
          ['dance', 0.4],
          ['excited', 0.3],
          ['sad', 0.2],
          ['wave', 0.25],
        ];
    const name = weightedPick(options);
    if (name !== 'walk') return name;

    const { minX, maxX, x } = c.loco;
    const range = maxX - minX;
    let target = x;
    for (let i = 0; i < 6 && Math.abs(target - x) < range * 0.25; i++) target = rand(minX, maxX);
    const params = { x: target };
    // Roam the whole screen: sometimes a nearby altitude change, sometimes anywhere, sometimes back down low.
    const maxLift = c.placement.maxLift ?? 0;
    if (maxLift > 0) {
      const r = Math.random();
      if (r < 0.25) params.lift = 0;
      else if (r < 0.6) params.lift = rand(0, maxLift);
      else params.lift = Math.min(maxLift, Math.max(0, c.restLift + rand(-1.5, 1.5) * c.placement.scale));
    }
    return { name: 'walk', params };
  }
}
