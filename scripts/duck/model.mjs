const len = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
const smin = (a, b, k) => { const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1); return mix(b, a, h) - k * h * (1 - h); };
const smax = (a, b, k) => -smin(-a, -b, k);
function ellipsoid(p, c, r) {
  const x = (p[0] - c[0]) / r[0], y = (p[1] - c[1]) / r[1], z = (p[2] - c[2]) / r[2];
  const k0 = len(x, y, z), k1 = len(x / r[0], y / r[1], z / r[2]);
  return k0 < 1e-9 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
}
function roundCone(p, a, b, ra, rb) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2];
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  return len(pax - bax * h, pay - bay * h, paz - baz * h) - mix(ra, rb, h);
}
/** A point in a part's own frame: moved to its centre, then turned (z, then y, then x). */
export function local(p, c, rz = 0, ry = 0, rx = 0) {
  let x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
  if (rz) { const cs = Math.cos(rz), sn = Math.sin(rz); [x, y] = [cs * x + sn * y, -sn * x + cs * y]; }
  if (ry) { const cs = Math.cos(ry), sn = Math.sin(ry); [x, z] = [cs * x - sn * z, sn * x + cs * z]; }
  if (rx) { const cs = Math.cos(rx), sn = Math.sin(rx); [y, z] = [cs * y + sn * z, -sn * y + cs * z]; }
  return [x, y, z];
}

// The duck (model units: height ≈ 1, feet at y = 0, face towards +z, his left = +x): a round white duckling with a
// big head, a wide smiling bill, a curly feather tuft, a perky tail feather, little wings, orange webbed feet and a
// light-blue polka-dot bandana. The eyes, cheeks, mouth line and dots are painted in regions.mjs.
export const HEAD = { c: [0, 0.665, 0.03], r: 0.215 };
export const BODY = { c: [0, 0.3, 0], r: [0.245, 0.215, 0.24] };
export const WINGS = [{ s: -1 }, { s: 1 }].map(({ s }) => ({ c: [s * 0.238, 0.315, -0.01], pivot: [s * 0.2, 0.42, 0] }));
export const EYES = [{ c: [-0.088, 0.695], color: 'L' }, { c: [0.088, 0.695], color: 'R' }];
export const BILL = { c: [0, 0.6, 0.225] };

function parts(p) {
  const [x, y, z] = p;
  const m = [Math.abs(x), y, z];
  const d = {};
  d.head = Math.hypot(x - HEAD.c[0], (y - HEAD.c[1]) * 1.04, z - HEAD.c[2]) - HEAD.r;
  // the bill: a wide, flat, rounded duck bill with a slight upturn at the corners (a smile)
  const bq = local(p, BILL.c, 0, 0, -0.12);
  const smile = 0.012 * (bq[0] / 0.1) ** 2;
  d.bill = smin(ellipsoid([bq[0], bq[1] - smile, bq[2]], [0, 0.008, 0], [0.104, 0.034, 0.082]),
    ellipsoid([bq[0], bq[1] - smile * 0.6, bq[2]], [0, -0.022, -0.006], [0.088, 0.024, 0.068]), 0.012);
  // the curly feather tuft on top of his head
  d.tuft = Math.min(
    roundCone(p, [0, 0.86, 0.02], [0.012, 0.935, 0.03], 0.026, 0.012),
    roundCone(p, [0.012, 0.935, 0.03], [0.05, 0.955, 0.03], 0.012, 0.007),
    roundCone(p, [-0.01, 0.86, 0.0], [-0.045, 0.915, -0.01], 0.022, 0.009));
  // round body with a perky tail feather sticking up at the back
  let body = ellipsoid(p, BODY.c, BODY.r);
  body = smin(body, Math.hypot(x, y - 0.47, z - 0.01) - 0.13, 0.08); // neck
  d.body = body;
  d.tail = roundCone(p, [0, 0.31, -0.19], [0, 0.43, -0.315], 0.07, 0.018);
  // little wings hugging his sides
  let wing = 1e3;
  for (const W of WINGS) {
    const q = local(p, W.c, W.c[0] > 0 ? 0.25 : -0.25);
    wing = Math.min(wing, ellipsoid(q, [0, 0, 0], [0.052, 0.125, 0.112]));
  }
  d.wing = wing;
  // short orange legs and webbed feet (three rounded toes)
  d.leg = Math.max(roundCone(m, [0.085, 0.13, 0.0], [0.09, 0.035, 0.02], 0.03, 0.026), 0.006 - Math.abs(x));
  let foot = 1e3;
  for (const s of [-1, 1]) {
    const q = [x - s * 0.095, y - 0.016, z - 0.075];
    let f = ellipsoid(q, [0, 0, 0], [0.072, 0.018, 0.085]);
    for (const a of [-0.55, 0, 0.55]) f = smin(f, ellipsoid(q, [Math.sin(a) * 0.06, 0, Math.cos(a) * 0.075], [0.03, 0.017, 0.032]), 0.02);
    foot = Math.min(foot, Math.max(f, -y));
  }
  d.foot = Math.max(foot, 0.006 - Math.abs(x));
  // the bandana: a soft band round his neck and a little triangle flap at the front
  const band = Math.hypot(Math.hypot(x / 0.145, (z - 0.015) / 0.14) * 0.14 - 0.14, (y - 0.49) * 1.6) - 0.022;
  const fq = local(p, [0, 0.425, 0.205], 0, 0, 0.42);
  const flap = Math.max(Math.abs(fq[2]) - 0.012, (Math.abs(fq[0]) * 1.5 + (0.05 - fq[1])) - 0.09, fq[1] - 0.055) - 0.004;
  d.bandana = smin(band, flap, 0.015);
  return d;
}

export function sdf(p) {
  const d = parts(p);
  let s = smin(d.head, d.body, 0.06);
  s = smin(s, d.bill, 0.012);
  s = smin(s, d.tuft, 0.02);
  s = smin(s, d.tail, 0.05);
  s = smin(s, d.wing, 0.015);
  s = Math.min(s, smin(d.leg, d.foot, 0.015));
  s = smin(s, d.bandana, 0.006);
  return s;
}

export const PARTS = ['head', 'bill', 'tuft', 'body', 'tail', 'wing', 'leg', 'foot', 'bandana'];
export function partAt(p) {
  const d = parts(p);
  let best = 'head', bd = Infinity;
  for (const k of PARTS) { const v = Math.abs(d[k]); if (v < bd) { bd = v; best = k; } }
  return { name: best, d };
}

export const BOUNDS = { min: [-0.33, -0.01, -0.37], max: [0.33, 1.0, 0.34] };
