/** The name a mob goes by when it talks to you (every version of a character uses the character's name). */
const NAMES = { bee: 'Bee', axolotl: 'Axolotl', bbokari: 'Bbokari', wolfchan: 'Wolf Chan', jiniret: 'Jiniret', moffy: 'Moffy', duck: 'Ducky', myCat: 'Mike', me: 'Me' };
let CUSTOM = [];
/** Custom mobs go by the names you give them. */
export function setCustomNames(list) {
  CUSTOM = list ?? [];
}
export function petName(mob, fallback = 'Bee') {
  const m = String(mob ?? '');
  if (m.startsWith('custom:')) {
    const c = CUSTOM.find((x) => `custom:${x.id}` === m);
    return c?.name || (c ? petName(c.base, fallback) : fallback);
  }
  if (m.startsWith('gliddy')) return 'Gliddy';
  if (m.startsWith('cortis')) return 'CORTIS';
  return NAMES[m] ?? fallback;
}
