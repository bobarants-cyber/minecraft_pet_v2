export const POSE_KEYS = [
  'bodyY', 'crouch', 'sit',
  'torsoPitch', 'torsoYaw', 'torsoRoll',
  'headYaw', 'headPitch', 'headRoll',
  'armRaiseL', 'armRaiseR', 'armSwingL', 'armSwingR', 'armTwistL', 'armTwistR',
  'elbowL', 'elbowR', 'wristL', 'wristR',
  'legSwingL', 'legSwingR', 'kneeL', 'kneeR', 'legSpreadL', 'legSpreadR',
];

export function createPose() {
  return Object.fromEntries(POSE_KEYS.map((k) => [k, 0]));
}

export function resetPose(pose) {
  for (const k of POSE_KEYS) pose[k] = 0;
}

export function dampPose(current, target, rate, dt) {
  const a = 1 - Math.exp(-rate * dt);
  for (const k of POSE_KEYS) current[k] += (target[k] - current[k]) * a;
}
