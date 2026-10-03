import { Quaternion } from 'three/src/math/Quaternion.js';
import { Vector3 } from 'three/src/math/Vector3.js';

export const BOOT_MOVE_SECONDS = 1.8;
const ease = value => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
export function bootPoseAt(progress) {
  const lift = ease(progress / .25);
  const move = ease((progress - .2) / .55);
  const lower = ease((progress - .75) / .25);
  return { x: 2.3 * move, y: .5 * lift - 1.36 * lower, z: .1 * move, turn: move };
}

export function createAssemblyBootPresentation(root) {
  const upright = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2));
  const rest = new Quaternion();
  let progress = 0;
  return { update(active, delta, reducedMotion) {
    progress = active ? (reducedMotion ? 1 : Math.min(1, progress + delta / BOOT_MOVE_SECONDS)) : 0;
    const pose = bootPoseAt(progress);
    root.position.set(pose.x, pose.y, pose.z);
    root.quaternion.copy(rest).slerp(upright, pose.turn);
    return progress;
  } };
}
