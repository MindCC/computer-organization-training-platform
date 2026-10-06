import test from 'node:test';
import assert from 'node:assert/strict';
import * as templates from './classroomTaskChain.js';
const {taskChainTemplate,adoptTaskChainTemplate,validateTaskChain}=templates;
import { buildTeachingTemplate } from './teachingLoop.js';
import { knowledgePointOf, knowledgePointsForChallenge } from '../knowledgePoints.js';

test('shortcut templates provide canonical goals and bind their nodes to those goals',()=>{
  for(const key of ['twos','data-flow']){
    const chain=validateTaskChain(taskChainTemplate(key));
    assert.ok(chain.knowledgePointIds.length>0);
    assert.ok(chain.stages.every(stage=>stage.knowledgePointIds.length>0));
    assert.ok(chain.stages.every(stage=>stage.knowledgePointIds.every(id=>chain.knowledgePointIds.includes(id))));
    assert.equal(knowledgePointOf(chain.knowledgePointIds[0]).chapterId,key==='twos'?'ch2':'ch1');
    if(key==='twos')assert.ok(chain.knowledgePointIds.every(id=>knowledgePointOf(id)?.chapterId==='ch2'));
  }
  assert.ok(taskChainTemplate('twos').knowledgePointIds.includes('concept-twos-complement'));
  const flow=taskChainTemplate('data-flow');
  for(const stage of flow.stages)assert.deepEqual(stage.knowledgePointIds,knowledgePointsForChallenge(stage.challengeId).map(point=>point.id));
});

test('template switches replace previous goals and empty custom templates reset them',()=>{
  const twos=taskChainTemplate('twos');
  const flow=adoptTaskChainTemplate(twos,taskChainTemplate('data-flow'));
  assert.deepEqual(flow.knowledgePointIds,taskChainTemplate('data-flow').knowledgePointIds);
  assert.ok(!flow.knowledgePointIds.includes('concept-twos-complement'));
  assert.deepEqual(adoptTaskChainTemplate(flow,taskChainTemplate('empty')).knowledgePointIds,[]);
  const generic=buildTeachingTemplate('diagnostic-lab',['ch4','ch6']);
  assert.deepEqual(adoptTaskChainTemplate(twos,generic).knowledgePointIds,generic.knowledgePointIds);
});

test('follow-up adoption retains teacher selected goals and recipients without stale node bindings',()=>{
  const goals=['concept-twos-complement'];
  const current={...taskChainTemplate('twos'),knowledgePointIds:goals,followUp:{sourceTaskId:1,sourceSessionId:2,studentIds:[3]}};
  const adopted=adoptTaskChainTemplate(current,taskChainTemplate('twos'));
  assert.deepEqual(adopted.followUp,current.followUp);
  assert.deepEqual(adopted.knowledgePointIds,goals);
  assert.ok(adopted.stages.every(stage=>stage.knowledgePointIds.every(id=>goals.includes(id))));
  assert.deepEqual(validateTaskChain(adopted).knowledgePointIds,goals);
  assert.deepEqual(current.knowledgePointIds,goals);
});
