// The Winter night scene's layout, shared by the wallpaper (which draws it) and the snow (which piles on it).
// Seeded, so for the same screen size both get exactly the same trees, cabin and ground.
function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function winterLayout(W, H) {
  const r = seeded(20261122);
  const rand = (a, b) => a + r() * (b - a);
  const groundY = H * 0.82;
  const trees = Array.from({ length: 14 }, () => ({ x: rand(0, W), y: H * rand(0.8, 0.9), h: H * rand(0.12, 0.22) })).sort((a, b) => a.y - b.y);
  const cabin = { x: W * 0.22, y: H * 0.86, w: W * 0.1 };
  return { groundY, trees, cabin };
}

/** A pine's tiers, bottom to top: each a triangle { left, top, right } (x, y). */
export function pineTiers(t) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const w = t.h * (0.5 - i * 0.09), yy = t.y - i * t.h * 0.22;
    out.push({ l: [t.x - w / 2, yy], a: [t.x, yy - t.h * 0.35], r: [t.x + w / 2, yy] });
  }
  return out;
}

/** The cabin's roof: left eave, peak, right eave. */
export function cabinRoof(c) {
  return { l: [c.x - c.w * 0.12, c.y - c.w * 0.5], a: [c.x + c.w / 2, c.y - c.w * 0.95], r: [c.x + c.w * 1.12, c.y - c.w * 0.5] };
}

/** Surfaces snow can settle on (top edges), in screen points: [{ id, pts: [[x, y], …], flat }]. */
export function winterSurfaces(W, H) {
  const { groundY, trees, cabin } = winterLayout(W, H);
  const out = [{ id: 'ground', pts: [[0, groundY], [W, groundY]], flat: true }];
  const roof = cabinRoof(cabin);
  out.push({ id: 'roof', pts: [roof.l, roof.a, roof.r] });
  trees.forEach((t, i) => pineTiers(t).forEach((tier, k) => out.push({ id: `tree${i}-${k}`, pts: [tier.l, tier.a, tier.r] })));
  return out;
}
