import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTeachingTemplate } from './teachingLoop.js';
import { validateTaskChain } from './classroomTaskChain.js';
import { COURSE_CHAPTERS } from '../courseChapters.js';
import { knowledgePointsByChapter } from '../knowledgePoints.js';
import { questionsForChapter } from '../assignmentQuestions.js';

test('generic templates bind chapter resources and retain goals/roles in all eight chapters',()=>{
  for(const chapter of COURSE_CHAPTERS){
    const chain=validateTaskChain(buildTeachingTemplate('diagnostic-lab',[chapter.id]));
    assert.ok(chain.knowledgePointIds.length);
    assert.ok(chain.stages.some(s=>s.purpose==='diagnosis'));
    assert.ok(chain.stages.some(s=>s.purpose==='retest'));
    assert.ok(chain.stages.filter(s=>s.chapterId).every(s=>s.chapterId===chapter.id));
  }
  assert.ok(validateTaskChain(buildTeachingTemplate('remediation',['ch4','ch6'])).knowledgePointIds.length>1);
});
test('metadata rejects invented goals and unknown node roles rather than silently dropping them',()=>{
  const chain=buildTeachingTemplate('diagnostic-lab',['ch4']);
  assert.throws(()=>validateTaskChain({...chain,knowledgePointIds:['imaginary']}),/知识/);
  assert.throws(()=>validateTaskChain({...chain,stages:chain.stages.map(s=>({...s,purpose:'imaginary'}))}),/作用/);
});
test('a goal without questions never gets unrelated graded questions disguised as evidence',()=>{
  const goal=knowledgePointsByChapter('ch4').find(p=>!questionsForChapter('ch4').some(q=>q.kpId===p.id));
  assert.ok(goal);
  const chain=validateTaskChain(buildTeachingTemplate('remediation',['ch4'],[goal.id]));
  assert.equal(chain.stages.some(s=>s.type==='practice'),false);
  assert.ok(chain.stages.some(s=>s.purpose==='retest'&&s.type==='custom'));
});
