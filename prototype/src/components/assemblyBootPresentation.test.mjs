import test from 'node:test';
import assert from 'node:assert/strict';
import { Group } from 'three/src/objects/Group.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import { bootPoseAt, createAssemblyBootPresentation } from './assemblyBootPresentation.js';

test('boot lifts the PC clear of the table before lowering it beside the desk', () => {
  assert.deepEqual(bootPoseAt(0), {x:0,y:0,z:0,turn:0});
  assert.equal(bootPoseAt(.2).x, 0);
  assert.ok(bootPoseAt(.2).y > .4);
  assert.ok(bootPoseAt(.75).x > 2.2);
  assert.ok(bootPoseAt(.75).y > .49);
  assert.ok(Math.abs(bootPoseAt(1).y + .86) < 1e-9);
});

test('all PC children move together, stand on the floor, and return on shutdown', () => {
  const root=new Group(), memory=new Group();
  memory.position.set(-.3,.12,.1); root.add(memory);
  const local=memory.position.clone(), motion=createAssemblyBootPresentation(root);
  assert.equal(motion.update(true, .5, false)<1,true);
  motion.update(true,2,false); root.updateMatrixWorld(true);
  assert.ok(memory.position.equals(local),'component installation coordinates remain unchanged');
  assert.ok(new Vector3(0,0,.635).applyMatrix4(root.matrixWorld).y > -1.5,'case feet stay above the floor');
  assert.ok(new Vector3(0,0,1).applyQuaternion(root.quaternion).distanceTo(new Vector3(0,-1,0))<1e-6);
  motion.update(false,.1,false);
  assert.ok(root.position.length()<1e-9);
  assert.ok(root.quaternion.angleTo(new Group().quaternion)<1e-9);
  assert.equal(motion.update(true,0,true),1,'reduced motion uses the final pose immediately');
});
