import test from 'node:test';
import assert from 'node:assert/strict';
import { filterHelpGuides } from './helpGuides.js';

test('guides distinguish student actions from teacher management and keep common account help', () => {
  const student = filterHelpGuides({ role: 'student' }), teacher = filterHelpGuides({ role: 'teacher' });
  assert.ok(student.some(item => item.id === 'student-atlas'));
  assert.ok(!student.some(item => item.id === 'teacher-grade'));
  assert.ok(teacher.some(item => item.id === 'teacher-grade'));
  assert.ok(!teacher.some(item => item.id === 'student-practice'));
  assert.ok([student, teacher].every(guides => guides.some(item => item.id === 'common-settings')));
});
test('search finds instructions within steps, respects groups and returns an empty result honestly', () => {
  assert.ok(filterHelpGuides({ role: 'student', query: 'MAR不存在词' }).length === 0);
  assert.ok(filterHelpGuides({ role: 'teacher', query: '提交评分' }).some(item => item.id === 'teacher-grade'));
  assert.ok(filterHelpGuides({ role: 'student', group: '资料与账户', query: '全文检索' }).some(item => item.id === 'student-knowledge'));
  assert.equal(filterHelpGuides({ role: 'student', group: '实验与装机', query: '全文检索' }).length, 0);
});
