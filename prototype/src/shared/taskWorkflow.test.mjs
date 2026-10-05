import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTaskChain } from './classroomTaskChain.js';
import { dragTaskStage, connectTaskStages } from './taskWorkflow.js';

test('custom task nodes preserve completion choice and canvas position',()=>{
  const task=validateTaskChain({title:'课堂讨论',stages:[{id:'discussion',type:'custom',title:'解释判断依据',instructions:'小组讨论并提交解释',minutes:8,submissionMode:'text',position:{x:320,y:120}}]});
  assert.equal(task.stages[0].submissionMode,'text');
  assert.deepEqual(task.stages[0].position,{x:320,y:120});
  assert.throws(()=>validateTaskChain({title:'无效',stages:[{...task.stages[0],position:{x:Infinity,y:0}}]}),/位置/);
  assert.throws(()=>validateTaskChain({title:'无效',stages:[{...task.stages[0],submissionMode:'grade'}]}),/完成条件/);
});

test('dragging and connecting keep a complete, unique sequential route',()=>{
  const stages=['a','b','c'].map(id=>({id}));
  const dragged=dragTaskStage(stages,'c',{x:-200,y:180});
  assert.deepEqual(dragged.map(s=>s.id),['c','a','b']);assert.equal(dragged[0].position.y,180);
  assert.deepEqual(connectTaskStages(stages,'a','c').map(s=>s.id),['a','c','b']);
  assert.deepEqual(connectTaskStages(stages,'c','a').map(s=>s.id),['b','c','a']);
  assert.deepEqual(connectTaskStages(stages,'a','a'),stages);
  assert.equal(new Set(connectTaskStages(stages,'a','c').map(s=>s.id)).size,3);
});
