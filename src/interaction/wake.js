// Spotting "Hey Bbokari" in what the speech recogniser heard. Whisper spells a made-up name many ways
// ("Bokari", "Pokari", "Bo Kari", "Bocari"…), so each pet's name is a forgiving pattern.

const NAMES = {
  bbokari: String.raw`(?:b{1,2}|p)[ou]{1,2}\s?-?\s?(?:k{1,2}|c{1,2}|q)a+r+[iíy]+`,
  bee: String.raw`bee`,
  axolotl: String.raw`axolotl|axolote|axo`,
  wolfchan: String.raw`wol(?:f|ve)s?\s?-?\s?ch?[aeu]n+|wolf`,
  jiniret: String.raw`(?:j|g|y)[iey]n+[iey]{0,2}\s?-?\s?r+[eiay]+t+h?|jinny`,
};
NAMES.gliddy = String.raw`gl[iey]+d+[iy]e?|glitt?y|gladd?y|glid[ie]y`;
NAMES.gliddyReal = NAMES.gliddy;
for (const k of ['gliddyPlush', 'gliddyPlushStrawberry', 'gliddyPlushMint', 'gliddyPlushMidnight', 'gliddyPlushChoco', 'gliddyPlushMini']) NAMES[k] = NAMES.gliddy;
for (const c of ['Yellow', 'White', 'Blue', 'Pink', 'Green']) NAMES[`cortis${c}`] = String.raw`c[ou]rt[iey]s|curtis|cortez|kortis`;
const GREETING = String.raw`(?:hey|hi|ok(?:ay)?|hello|yo|oye|hola|ey)`;

/** The parts of a wake phrase in `text` for `mob`: { question } (may be '' if only the name was said), or null. */
export function findWake(text, mob = 'bbokari') {
  const name = NAMES[mob] ?? NAMES.bbokari;
  const t = String(text ?? '').trim();
  // "Hey Bbokari, what's …" anywhere in the clip.
  const greet = new RegExp(String.raw`\b${GREETING}[\s,!.]+(?:${name})\b[\s,!.?:-]*(.*)$`, 'i').exec(t);
  if (greet) return { question: tidy(greet[1]) };
  // "Bbokari, what's …" at the start (a name on its own in the middle of a sentence doesn't count).
  const lead = new RegExp(String.raw`^(?:${name})\b[\s,!.?:-]*(.*)$`, 'i').exec(t);
  if (lead && (mob === 'bbokari' || mob === 'wolfchan' || mob === 'jiniret' || mob === 'gliddy' || mob.startsWith('gliddy') || mob.startsWith('cortis') || /[,!.]/.test(t.slice(0, 12)))) return { question: tidy(lead[1]) };
  return null;
}

function tidy(s) {
  return String(s ?? '')
    .replace(/^[\s,.!?:-]+/, '')
    .trim();
}

/** Short filler-only "questions" mean the person just said the name. */
export function isEmptyQuestion(q) {
  return !q || /^(?:um+|uh+|hm+|hey|hi|yes|so|okay|ok|please)[\s.!?,]*$/i.test(q) || q.replace(/[^\p{L}\p{N}]/gu, '').length < 3;
}

/** What Whisper is told to expect, so it spells the name right. */
export function wakePrompt(mob) {
  return { bbokari: 'Hey Bbokari.', bee: 'Hey Bee.', axolotl: 'Hey Axolotl.' }[mob] ?? 'Hey Bbokari.';
}
