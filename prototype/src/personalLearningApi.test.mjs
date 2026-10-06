import test from 'node:test';
import assert from 'node:assert/strict';
import { personalLearningPath, setPersonalLearningRole } from './personalLearningApi.js';

test('teacher learning tools use their own APIs while student class submission stays role-restricted',()=>{
  try {
    setPersonalLearningRole('teacher');
    for(const resource of ['progress','activity','attempts','mistakes','chapter-practice','demo-attempts','assembly-practice','shop-service','custom-customers','knowledge','learning-coach','study-workspace','study-assistant']) assert.equal(personalLearningPath(`/api/student/${resource}/example?x=1`),`/api/teacher/${resource}/example?x=1`);
    assert.equal(personalLearningPath('/api/student/assignments'),'/api/student/assignments');
    assert.equal(personalLearningPath('/api/student/classroom/current'),'/api/student/classroom/current');
    assert.equal(personalLearningPath('/api/student/report.md'),'/api/teacher/report.md');
    assert.equal(personalLearningPath('/api/student/cpu-practice/events'),'/api/teacher/cpu-practice/events');
    assert.equal(personalLearningPath('/api/student/lab-assistant'),'/api/teacher/lab-assistant');
    setPersonalLearningRole('student');assert.equal(personalLearningPath('/api/student/custom-customers/status'),'/api/student/custom-customers/status');
  } finally {setPersonalLearningRole('student');}
});
