import test from 'node:test';
import assert from 'node:assert/strict';
import * as templates from './classroomTaskChain.js';
const {taskChainTemplate,adoptTaskChainTemplate,validateTaskChain}=templates;
import { taskDemoPath } from './demoNavigation.js';
import { buildTeachingTemplate } from './teachingLoop.js';
import { knowledgePointOf, knowledgePointsForChallenge } from '../knowledgePoints.js';

test('validation identifies the failing node and reason when another practice node already has selections',()=>{
  const original=taskChainTemplate('twos');
  assert.ok(original.stages[0].questionIds.length>0);
  for(const [questionIds,reason] of [[[],/至少选择/],[['ch1-q01'],/不属于/],[['ch2-q11','ch2-q11'],/重复/]]){
    const chain={...original,stages:original.stages.map(s=>s.id==='step-check'?{...s,questionIds}:s)};
    assert.throws(()=>validateTaskChain(chain),error=>{
      assert.equal(error.stageId,'step-check');assert.equal(error.stageIndex,6);
      assert.match(error.message,/第7个环节.*检验：补码加法、减法与溢出/);
      assert.match(error.message,reason);return true;
    });
  }
});

test('complement arithmetic proceeds through hands-on addition, subtraction and overflow with explanation evidence',()=>{
  const chain=validateTaskChain(taskChainTemplate('twos'));
  assert.equal(chain.stages[0].purpose,'diagnosis');
  const demonstration=chain.stages[1];
  assert.equal(demonstration.type,'demo');
  assert.equal(demonstration.purpose,'learning');
  assert.equal(demonstration.submissionMode,'confirm');
  assert.match(demonstration.title,/教师演示/);
  const activities=chain.stages.filter(stage=>stage.type==='demo'&&stage.purpose==='practice');
  assert.deepEqual(activities.map(stage=>stage.demoActivity),['add','sub','overflow']);
  assert.ok(activities.every(stage=>stage.demoId==='twos-complement'&&stage.submissionMode==='text'));
  assert.deepEqual(activities[0].knowledgePointIds,['concept-twos-complement']);
  assert.deepEqual(activities[2].knowledgePointIds,['concept-signed-range-overflow']);
  assert.ok(!chain.stages.some(stage=>stage.challengeId==='machine-number'));
  assert.equal(chain.stages.reduce((sum,stage)=>sum+stage.minutes,0),45);
  const quiz=chain.stages.find(stage=>stage.purpose==='retest');
  assert.ok(quiz.questionIds.includes('ch2-q11'),'comprehensive quiz must assess actual addition');
  for(const stage of activities)assert.equal(new URL(taskDemoPath(stage),'http://local').searchParams.get('activity'),stage.demoActivity);
  assert.throws(()=>validateTaskChain({...chain,stages:[{...activities[0],demoId:'intro'}]}),/活动/);
  assert.throws(()=>validateTaskChain({...chain,stages:[{...activities[0],demoActivity:'evil'}]}),/活动/);
});

test('arithmetic-focused generic templates use arithmetic activities instead of the negative encoding lab',()=>{
  for(const template of ['diagnostic-lab','remediation','transfer']){
    const chain=validateTaskChain(buildTeachingTemplate(template,['ch2'],['concept-twos-complement','concept-signed-range-overflow']));
    const demonstration=chain.stages.find(s=>s.type==='demo'&&s.purpose==='learning');
    assert.match(demonstration?.title??'',/教师演示/);
    assert.ok(chain.stages.indexOf(demonstration)<chain.stages.findIndex(s=>s.purpose==='practice'));
    assert.deepEqual(chain.stages.filter(s=>s.demoActivity&&s.purpose==='practice').map(s=>s.demoActivity),['add','sub','overflow']);
    assert.ok(!chain.stages.some(s=>s.challengeId==='machine-number'));
  }
});

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
