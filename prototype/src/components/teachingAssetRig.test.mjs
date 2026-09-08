import test from 'node:test';
import assert from 'node:assert/strict';
import { Group } from 'three/src/objects/Group.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import { attachTeachingPart, readSocketPose, socketApproachAllowed, createTeachingMotion } from './teachingAssetRig.js';

test('installation preserves translated, rotated and scaled authoring anchors under a parent', () => {
  const root = new Group(), parent = new Group(), socket = new Group(), part = new Group(), target = new Group();
  root.add(parent); parent.position.set(.1, .2, .3); parent.rotation.y = .4;
  parent.add(socket); socket.position.set(.2, .1, 0); socket.rotation.x = -.7; socket.scale.setScalar(.9);
  root.add(part); part.name = 'cpu'; root.updateMatrixWorld(true);
  const expected = socket.getWorldPosition(new Vector3()).multiplyScalar(3.1);
  const pose = readSocketPose(socket);
  attachTeachingPart(part, target, pose);
  assert.ok(target.position.distanceTo(expected) < 1e-6);
  assert.ok(target.quaternion.angleTo(pose.quaternion) < 1e-6);
  assert.ok(Math.abs(target.scale.x - 2.79) < 1e-6);
  assert.deepEqual(part.position.toArray(), [0, 0, 0]);
});

test('socket approach rejects the back of an insertion plane and accepts its front', () => {
  const pose = { position: new Vector3(), approach: new Vector3(0, 1, 0) };
  assert.equal(socketApproachAllowed(pose, new Vector3(0, 3, 1)), true);
  assert.equal(socketApproachAllowed(pose, new Vector3(0, -3, 1)), false);
});

test('connector follows its part when installed under a rotated and scaled anchor', () => {
  const socket=new Group(),part=new Group(),port=new Group(),target=new Group();
  socket.position.set(.1,.2,.3);socket.rotation.y=Math.PI/2;socket.scale.setScalar(.5);
  port.position.set(.2,0,0);part.add(port);
  attachTeachingPart(part,target,readSocketPose(socket));
  assert.ok(port.getWorldPosition(new Vector3()).distanceTo(new Vector3(.31,.62,.62))<1e-6);
  target.position.x+=1;
  assert.ok(port.getWorldPosition(new Vector3()).distanceTo(new Vector3(1.31,.62,.62))<1e-6);
});

test('mechanical motion preserves authored rest, closes on install and stops fans when off or reduced', () => {
  const scene=new Group(),lever=new Group(),fan=new Group();
  lever.name='cpu_retention_lever';lever.rotation.z=.25;lever.userData.openAngle=-1.2;
  fan.name='cooler_fan_rotor';fan.rotation.x=.15;scene.add(lever,fan);
  const rest=lever.quaternion.clone(),fanRest=fan.quaternion.clone(),motion=createTeachingMotion(scene);
  motion.update({installed:{}},.1,true);assert.ok(lever.quaternion.angleTo(rest)>1);
  motion.update({installed:{cpu:true},powered:true},.1,true);
  assert.ok(lever.quaternion.angleTo(rest)<1e-6);assert.ok(fan.quaternion.angleTo(fanRest)<1e-6);
  motion.update({installed:{cpu:true},powered:true},.1,false);
  const running=fan.quaternion.clone();assert.ok(running.angleTo(fanRest)>1);
  motion.update({installed:{cpu:true},powered:false},.1,false);assert.ok(fan.quaternion.angleTo(running)<1e-6);
  motion.update({installed:{cpu:true},powered:true},.1,true);assert.ok(fan.quaternion.angleTo(running)<1e-6);
});
