import { Vector3 } from 'three/src/math/Vector3.js';
import { Quaternion } from 'three/src/math/Quaternion.js';

export const TEACHING_SCALE = 3.1;
export const CONNECTOR_IDS = ['psu-atx', 'psu-cpu', 'psu-sata', 'board-atx', 'cpu-power', 'cpu-fan', 'board-sata', 'cooler-fan', 'ssd-data', 'ssd-power'];
export const MOVING_NODES = ['cpu_retention_lever', 'dimm_latch_front', 'dimm_latch_back', 'cooler_fan_rotor', 'gpu_fan_left', 'gpu_fan_right'];

export function readSocketPose(anchor) {
  anchor.updateWorldMatrix(true, false);
  const position = new Vector3(), quaternion = new Quaternion(), scale = new Vector3();
  anchor.matrixWorld.decompose(position, quaternion, scale);
  return { position: position.multiplyScalar(TEACHING_SCALE), quaternion, scale: scale.multiplyScalar(TEACHING_SCALE),
    approach: new Vector3().fromArray(anchor.userData.approach ?? [0, 1, 0]).applyQuaternion(quaternion).normalize() };
}

export function attachTeachingPart(node, group, pose) {
  node.removeFromParent(); node.position.set(0, 0, 0); node.quaternion.identity(); node.scale.set(1, 1, 1);
  group.add(node); group.position.copy(pose.position); group.quaternion.copy(pose.quaternion); group.scale.copy(pose.scale);
}

export function socketApproachAllowed(pose, cameraPosition) {
  return cameraPosition.clone().sub(pose.position).normalize().dot(pose.approach) > -.1;
}

export function createTeachingMotion(scene, animations = []) {
  const hinges = ['cpu_retention_lever', 'dimm_latch_front', 'dimm_latch_back'].map(name => {
    const node = scene.getObjectByName(name);
    if (!node) return null;
    const clip = animations.find(clip => clip.name === name + '_close');
    const track = clip?.tracks.find(track => track.name === name + '.quaternion');
    return { node, rest: node.quaternion.clone(), angle: 0, progress: 0,
      track, interpolate: track?.createInterpolant() };
  }).filter(Boolean);
  const rotors = ['cooler_fan_rotor', 'gpu_fan_left', 'gpu_fan_right'].map(name => scene.getObjectByName(name)).filter(Boolean).map(node => ({node, rest:node.quaternion.clone()}));
  const x = new Vector3(1, 0, 0), y = new Vector3(0, 1, 0), q = new Quaternion();
  let rotation = 0;
  return { update(state, delta, reducedMotion) {
    for (const joint of hinges) {
      const closed = Boolean(state?.installed?.[joint.node.name.startsWith('cpu_') ? 'cpu' : 'memory']);
      const smoothing = reducedMotion ? 1 : 1 - Math.exp(-9 * delta);
      if (joint.interpolate) {
        joint.progress += ((closed ? 1 : 0) - joint.progress) * smoothing;
        const times = joint.track.times;
        joint.node.quaternion.fromArray(joint.interpolate.evaluate(times[0] + joint.progress * (times[times.length - 1] - times[0])));
        continue;
      }
      const target = closed ? 0 : Number(joint.node.userData.openAngle ?? .8);
      joint.angle += (target - joint.angle) * smoothing;
      joint.node.quaternion.copy(joint.rest).multiply(q.setFromAxisAngle(x, joint.angle));
    }
    if (state?.powered && !reducedMotion) rotation = (rotation + delta * 12) % (Math.PI * 2);
    for (const {node,rest} of rotors) node.quaternion.copy(rest).multiply(q.setFromAxisAngle(y, rotation));
  } };
}
