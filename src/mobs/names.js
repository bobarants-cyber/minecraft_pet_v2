/** The name a mob goes by when it talks to you (every version of a character uses the character's name). */
const NAMES = { bee: 'Bee', axolotl: 'Axolotl', bbokari: 'Bbokari', wolfchan: 'Wolf Chan', jiniret: 'Jiniret', moffy: 'Moffy', duck: 'Ducky' };
export function petName(mob, fallback = 'Bee') {
  const m = String(mob ?? '');
  if (m.startsWith('gliddy')) return 'Gliddy';
  if (m.startsWith('cortis')) return 'CORTIS';
  return NAMES[m] ?? fallback;
}
