import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionActivityClock } from './questionActivityClock.js';
test('visible clock excludes hidden/offscreen and five-minute idle time, and records first interaction separately',()=>{
  let now=0;const clock=createQuestionActivityClock(()=>now);
  clock.visibility(true);now=2000;clock.answer();now=3000;clock.visibility(false);
  now=100000;clock.visibility(true);now=101000;
  assert.deepEqual(clock.snapshot(),{visibleActiveMs:4000,firstAnswerMs:2000,inputChanges:1});
  now=500000;assert.equal(clock.snapshot().visibleActiveMs,205000);
  clock.activity();now+=1000;assert.equal(clock.snapshot().visibleActiveMs,206000);
  clock.reset();assert.equal(clock.snapshot().firstAnswerMs,null);
});
