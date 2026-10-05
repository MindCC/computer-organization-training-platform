import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTaskChain } from './classroomTaskChain.js';

test('custom task nodes preserve completion choice and canvas position',()=>{
  const task=validateTaskChain({title:'课堂讨论',stages:[{id:'discussion',type:'custom',title:'解释判断依据',instructions:'小组讨论并提交解释',minutes:8,submissionMode:'text',position:{x:320,y:120}}]});
  assert.equal(task.stages[0].submissionMode,'text');
  assert.deepEqual(task.stages[0].position,{x:320,y:120});
  assert.throws(()=>validateTaskChain({title:'无效',stages:[{...task.stages[0],position:{x:Infinity,y:0}}]}),/位置/);
  assert.throws(()=>validateTaskChain({title:'无效',stages:[{...task.stages[0],submissionMode:'grade'}]}),/完成条件/);
});
