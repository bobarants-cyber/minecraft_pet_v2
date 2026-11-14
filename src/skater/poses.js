// Poses for Realistic Gliddy, and the words that ask for them. No three.js here: the Electron side uses it to
// understand chat ("Gliddy, raise your left arm", "do a dab", "bend your knees") and the pet uses it to move.
//
// Left/right are HIS left and right (like a person's). His left side is +x in the model, where the classic rig's
// bones end in _R (it named them from the viewer's side), so his left arm is bone arm_R.
//
// Angles are degrees. Euler joints are [x, y, z] in friendly terms:
//   head / neck: [nod down, turn to his left, tilt to his left]
//   chest / spine: [bend forward, twist to his left, lean to his left]
//   shoulderL/R: [raise forward, twist, raise out to the side]
//   hipL/R: [lift leg forward, twist, swing out to the side]
//   ankleL/R, earL/R, wristL/R: [bend]
// Hinges are one number: elbowL/R, kneeL/R (bend), fingersL/R (curl; negative spreads them open).

const E = (bone, mx = 1, my = 1, mz = 1, range = null, order = 'XYZ') => ({ kind: 'euler', bone, mx, my, mz, range, order });
export const JOINTS = {
  head: E('head', 1, 1, -1, [[-50, 50], [-80, 80], [-40, 40]], 'YXZ'),
  neck: E('neck', 1, 1, -1, [[-30, 30], [-45, 45], [-25, 25]], 'YXZ'),
  chest: E('chest', 1, 1, -1, [[-25, 45], [-45, 45], [-25, 25]]),
  spine: E('spine', 1, 1, -1, [[-20, 40], [-35, 35], [-20, 20]]),
  shoulderL: { ...E('arm_R', -1, 1, 1, [[-60, 180], [-90, 90], [-20, 170]], 'XZY'), arm: 1 },
  shoulderR: { ...E('arm_L', -1, -1, -1, [[-60, 180], [-90, 90], [-20, 170]], 'XZY'), arm: 0 },
  elbowL: { kind: 'hinge', bone: 'fore_R', axis: 'elbow_R', range: [[0, 150]] },
  elbowR: { kind: 'hinge', bone: 'fore_L', axis: 'elbow_L', range: [[0, 150]] },
  wristL: { kind: 'hinge', bone: 'hand_R', axis: 'elbow_R', range: [[-70, 70]] },
  wristR: { kind: 'hinge', bone: 'hand_L', axis: 'elbow_L', range: [[-70, 70]] },
  fingersL: { kind: 'curl', bone: 'finger0_R', axis: 'curl_R', fingers: true, side: 'R', range: [[-30, 100]] },
  fingersR: { kind: 'curl', bone: 'finger0_L', axis: 'curl_L', fingers: true, side: 'L', range: [[-30, 100]] },
  hipL: E('leg_R', -1, 1, 1, [[-40, 110], [-40, 40], [-15, 60]]),
  hipR: E('leg_L', -1, -1, -1, [[-40, 110], [-40, 40], [-15, 60]]),
  kneeL: E('shin_R', 1, 1, 1, [[0, 140], [0, 0], [0, 0]]),
  kneeR: E('shin_L', 1, 1, 1, [[0, 140], [0, 0], [0, 0]]),
  ankleL: E('foot_R', -1, 1, 1, [[-40, 40], [0, 0], [0, 0]]),
  ankleR: E('foot_L', -1, 1, 1, [[-40, 40], [0, 0], [0, 0]]),
  earL: E('ear_R', 1, 1, -1, [[-40, 40], [-30, 30], [-40, 40]]),
  earR: E('ear_L', 1, 1, 1, [[-40, 40], [-30, 30], [-40, 40]]),
  // Reach: put his wrist at a point (model units: x his left, y up from the floor, z forward; head centre ≈ 0, 0.67, 0).
  // The shoulder and elbow angles are worked out for you, and the point is kept outside his head and body.
  reachL: { kind: 'reach', side: 'R', range: [[-0.3, 0.42], [0.22, 0.95], [-0.15, 0.35]] },
  reachR: { kind: 'reach', side: 'L', range: [[-0.42, 0.3], [0.22, 0.95], [-0.15, 0.35]] },
};

/** Keep every angle inside what a body can do. */
export function clampJoints(joints) {
  const out = {};
  for (const [k, v] of Object.entries(joints ?? {})) {
    const J = JOINTS[k];
    if (!J) continue;
    const a = (Array.isArray(v) ? v : [v]).map(Number);
    if (a.some((n) => !Number.isFinite(n))) continue;
    out[k] = (J.kind === 'euler' || J.kind === 'reach' ? [0, 1, 2] : [0]).map((i) => Math.min(J.range[i][1], Math.max(J.range[i][0], a[i] ?? 0)));
    if (J.kind !== 'euler' && J.kind !== 'reach') out[k] = out[k][0];
  }
  return out;
}

const both = (name, v) => ({ [`${name}L`]: v, [`${name}R`]: v });
export const POSES = {
  tpose: { say: 'T-pose! 🙆', joints: { ...both('shoulder', [0, 0, 85]), ...both('elbow', 0), ...both('fingers', -15) } },
  cheer: { say: 'Woohoo! 🙌', joints: { ...both('shoulder', [10, 0, 150]), ...both('elbow', 15), ...both('fingers', -25), head: [-15, 0, 0] } },
  stretch: { say: 'Aaaah, stretchy 😌', joints: { ...both('shoulder', [5, 0, 160]), ...both('elbow', 5), ...both('fingers', -10), head: [-20, 0, 0], chest: [-10, 0, 0] } },
  dab: { say: 'Dab! 😎', joints: { shoulderL: [0, 0, 130], elbowL: 5, shoulderR: [70, 10, 95], elbowR: 135, head: [10, -15, 0], chest: [4, -5, 0] } },
  thinking: { say: 'Hmm… 🤔', joints: { reachR: [-0.07, 0.5, 0.15], fingersR: 60, reachL: [0.06, 0.39, 0.13], fingersL: 30, head: [8, 12, 8] } },
  salute: { say: 'Yes sir! 🫡', joints: { reachR: [-0.2, 0.75, 0.13], fingersR: -10 } },
  flex: { say: 'Look at these muscles 💪', joints: { ...both('shoulder', [0, 85, 90]), ...both('elbow', 120), ...both('fingers', 90), chest: [-6, 0, 0] } },
  handsOnHips: { say: 'Hmph 😤', joints: { ...both('shoulder', [-10, -85, 45]), ...both('elbow', 100), ...both('fingers', 50), chest: [-5, 0, 0] } },
  armsCrossed: { say: '…fine 😒', joints: { reachL: [-0.005, 0.4, 0.14], reachR: [0.01, 0.385, 0.15], ...both('fingers', 40), head: [5, 0, 8] } },
  pointForward: { say: 'You! 👉', joints: { shoulderR: [88, 0, 10], elbowR: 5, fingersR: 20 } },
  pointLeft: { say: 'That way! 👈', joints: { shoulderL: [10, 0, 85], elbowL: 5, fingersL: 20, head: [0, 40, 0] } },
  pointRight: { say: 'Over there! 👉', joints: { shoulderR: [10, 0, 85], elbowR: 5, fingersR: 20, head: [0, -40, 0] } },
  peace: { say: 'Peace ✌️', joints: { reachR: [-0.235, 0.6, 0.1], fingersR: -15, head: [5, -10, 10] } },
  thumbsUp: { say: '👍', joints: { shoulderL: [60, 0, 15], elbowL: 95, fingersL: 95 } },
  shrug: { say: '¯\\_(ツ)_/¯', joints: { ...both('shoulder', [0, 0, 28]), ...both('elbow', 95), ...both('fingers', -20), head: [0, 0, 15] } },
  superhero: { say: 'Gliddy to the rescue! 🦸', joints: { ...both('shoulder', [-10, -85, 45]), ...both('elbow', 100), ...both('fingers', 80), chest: [-10, 0, 0], head: [-12, 0, 0] } },
  bow: { say: '*bows* 🙇', joints: { chest: [35, 0, 0], spine: [25, 0, 0], head: [15, 0, 0], ...both('shoulder', [25, 0, 5]), ...both('elbow', 10) } },
  heart: { say: '🫶', joints: { reachL: [0.03, 0.46, 0.15], reachR: [-0.03, 0.46, 0.15], ...both('fingers', 55), head: [5, 0, 10] } },
  kick: { say: 'Hi-yah! 🦵', joints: { hipL: [75, 0, 0], kneeL: 10, ...both('shoulder', [0, 0, 55]), ...both('elbow', 40), chest: [-10, 0, 0] } },
  flamingo: { say: 'Balance! 🦩', joints: { hipR: [25, 0, 0], kneeR: 100, ...both('shoulder', [0, 0, 80]), ...both('elbow', 5) } },
  clap: { say: '👏', joints: { reachL: [0.015, 0.42, 0.14], reachR: [-0.015, 0.42, 0.14], ...both('fingers', -10) } },
  facepalm: { say: 'Ugh… 🤦', joints: { reachR: [-0.11, 0.57, 0.2], fingersR: 10, head: [25, 0, 0] } },
  handOnHead: { say: 'Oops 😅', joints: { reachL: [0.24, 0.62, 0.0], fingersL: 20, head: [0, 0, 18] } },
  waveBoth: { say: 'Hiii! 👋👋', joints: { ...both('shoulder', [10, 0, 140]), ...both('elbow', 30), ...both('fingers', -25) } },
  lookUp: { say: '👀', joints: { head: [-40, 0, 0], neck: [-15, 0, 0] } },
  lookDown: { say: '👀', joints: { head: [40, 0, 0], neck: [15, 0, 0] } },
};

const NAMES = [
  [/\bt[\s-]?pose\b/, 'tpose'], [/\bcheer|hooray|arms? up\b|hands? up\b|raise (?:both|your) (?:arms|hands)\b/, 'cheer'], [/\bstretch/, 'stretch'],
  [/\bdab\b/, 'dab'], [/\bthink|thinking|ponder/, 'thinking'], [/\bsalute/, 'salute'], [/\bflex|muscles?\b/, 'flex'],
  [/\bhands? on (?:your |his )?hips|sassy|hmph/, 'handsOnHips'], [/\b(?:cross|fold) (?:your |his )?arms|arms? crossed/, 'armsCrossed'],
  [/\bpoint (?:to (?:your |the )?)?left\b/, 'pointLeft'], [/\bpoint (?:to (?:your |the )?)?right\b/, 'pointRight'], [/\bpoint\b/, 'pointForward'],
  [/\bpeace|v sign/, 'peace'], [/\bthumbs? up/, 'thumbsUp'], [/\bshrug/, 'shrug'], [/\bsuper ?hero|hero pose/, 'superhero'],
  [/\bbow\b|take a bow/, 'bow'], [/\bheart (?:hands|sign)|make a heart/, 'heart'], [/\bkick\b/, 'kick'], [/\bflamingo|stand on one leg|one leg/, 'flamingo'],
  [/\bclap/, 'clap'], [/\bface ?palm/, 'facepalm'], [/\bhand on (?:your |his )?head|scratch (?:your |his )?head/, 'handOnHead'], [/\bwave (?:with )?both/, 'waveBoth'],
  [/\blook up\b/, 'lookUp'], [/\blook down\b/, 'lookDown'],
];

/**
 * Understand a pose request. Returns { pose } (a name), { joints } (angles), { relax: true }, or null if it isn't one.
 * Handles named poses ("do a dab", "strike a superhero pose") and body parts ("raise your left arm", "bend your knees",
 * "turn your head right", "close your hands", "lift your right leg", "tilt your head").
 */
export function parsePose(text) {
  const t = String(text ?? '').toLowerCase().replace(/[.!?]+$/, '').replace(/^(?:hey |ok |oye )?(?:gliddy|glidy|glitty)[, ]*/, '').trim();
  if (/^(?:relax|reset|stand normal(?:ly)?|normal pose|stop posing|at ease|rest)$/.test(t)) return { relax: true };
  for (const [re, name] of NAMES) if (re.test(t)) return { pose: name };
  const side = /\bleft\b/.test(t) ? 'L' : /\bright\b/.test(t) ? 'R' : 'both';
  const pick = (base, v) => (side === 'both' ? both(base, v) : { [`${base}${side}`]: v });
  // Arms
  if (/\b(?:raise|lift|put up|wave)\b.*\b(?:arm|hand)s?\b/.test(t)) return { joints: pick('shoulder', [0, 0, 150]), say: 'Up! ✋' };
  if (/\b(?:lower|put down|drop)\b.*\b(?:arm|hand)s?\b/.test(t)) return { joints: pick('shoulder', [0, 0, 0]), say: 'Down 👇' };
  if (/\b(?:stretch out|spread|open)\b.*\barms?\b/.test(t)) return { joints: pick('shoulder', [0, 0, 85]), say: 'Wiiide 🙆' };
  if (/\b(?:arm|hand)s?\b.*\bforward\b|\breach (?:out|forward)/.test(t)) return { joints: { ...pick('shoulder', [88, 0, 8]), ...pick('elbow', 5) }, say: 'Reaching 🤲' };
  if (/\bbend\b.*\belbows?\b/.test(t)) return { joints: pick('elbow', 110), say: 'Bent 💪' };
  if (/\bstraighten\b.*\b(?:arm|elbow)s?\b/.test(t)) return { joints: pick('elbow', 0), say: 'Straight ➖' };
  // Hands
  if (/\b(?:make a fist|fists?|close (?:your |his )?hands?|clench)\b/.test(t)) return { joints: pick('fingers', 95), say: '✊' };
  if (/\b(?:open|spread)\b.*\b(?:hands?|fingers)\b|\bjazz hands\b/.test(t)) return { joints: { ...pick('fingers', -28), ...(t.includes('jazz') ? both('shoulder', [40, 0, 60]) : {}) }, say: '🖐' };
  // Head
  if (/\b(?:turn|look)\b.*\b(?:head|left|right)\b/.test(t) && side !== 'both') return { joints: { head: [0, side === 'L' ? 50 : -50, 0], neck: [0, side === 'L' ? 15 : -15, 0] }, say: '👀' };
  if (/\btilt\b.*\bhead\b/.test(t)) return { joints: { head: [0, 0, side === 'R' ? -25 : 25] }, say: '🙃' };
  if (/\bnod\b/.test(t)) return { joints: { head: [30, 0, 0] }, say: '😌' };
  // Body
  if (/\blean (?:forward|in)\b/.test(t)) return { joints: { chest: [25, 0, 0], spine: [15, 0, 0] }, say: '🧐' };
  if (/\blean back\b/.test(t)) return { joints: { chest: [-20, 0, 0], spine: [-12, 0, 0], head: [-10, 0, 0] }, say: '😎' };
  if (/\blean\b/.test(t) && side !== 'both') return { joints: { chest: [0, 0, side === 'L' ? 20 : -20], spine: [0, 0, side === 'L' ? 12 : -12] }, say: '↔️' };
  if (/\btwist|turn your (?:body|chest)/.test(t)) return { joints: { chest: [0, side === 'R' ? -35 : 35, 0], spine: [0, side === 'R' ? -20 : 20, 0] }, say: '🌀' };
  // Legs
  if (/\b(?:raise|lift|kick)\b.*\b(?:leg|foot|knee)\b/.test(t)) return { joints: side === 'R' ? { hipR: [95, 0, 0], kneeR: 25 } : { hipL: [95, 0, 0], kneeL: 25 }, say: '🦵' };
  if (/\bbend\b.*\bknees?\b|\bsquat\b|\bcrouch\b/.test(t)) return { joints: { ...both('knee', 50), ...both('hip', [35, 0, 0]), ...both('ankle', [-20, 0, 0]) }, say: 'Bendy 🦵' };
  // Ears
  if (/\bwiggle\b.*\bears?\b|\bears?\b.*\b(?:up|down|back)\b/.test(t)) return { joints: { earL: [/\bdown|back\b/.test(t) ? 35 : -25, 0, 15], earR: [/\bdown|back\b/.test(t) ? 35 : -25, 0, 15] }, say: '🐹' };
  return null;
}

/** Does this sound like a request to move his body (for the AI fallback, when parsePose doesn't know it)? */
export function soundsLikePose(text) {
  return /\b(?:pose|arms?|hands?|legs?|knees?|elbows?|head|fingers?|feet|foot|shoulders?|hips?|spine|back|ears?)\b/i.test(text) && /\b(?:move|put|raise|lift|bend|turn|hold|do|make|pose|strike|touch|reach|cross|spread|point|show)\b/i.test(text);
}

export const sideBone = (s) => (s === 'L' ? 'R' : 'L');
