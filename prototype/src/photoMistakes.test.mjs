import test from 'node:test';
import assert from 'node:assert/strict';
import { boxClipPath, buildReviewPaperModel, canJoinReviewPaper, mergeDraftQuestions, PAPER_SOURCES } from './photoMistakes.js';

test('boxClipPath：归一化坐标转 inset 裁剪', () => {
  assert.equal(boxClipPath({ x: 0.1, y: 0.2, w: 0.5, h: 0.3 }), 'inset(20.0% 40.0% 50.0% 10.0%)');
  assert.equal(boxClipPath(null), null);
  assert.equal(boxClipPath({ x: Number.NaN, y: 0, w: 1, h: 1 }), null);
  assert.equal(boxClipPath({ x: -0.5, y: 0, w: 2, h: 1 }), 'inset(0.0% 0.0% 0.0% 0.0%)');
});

test('复习卷只收有题干与答案来源的错题', () => {
  assert.equal(canJoinReviewPaper({ source: 'photo', stem: '题干' }), true);
  assert.equal(canJoinReviewPaper({ source: 'lab', stem: '题干' }), false);
  assert.equal(canJoinReviewPaper({ source: 'practice', stem: '  ' }), false);
  assert.deepEqual(PAPER_SOURCES, ['photo', 'practice', 'assignment', 'demo']);
});

test('buildReviewPaperModel：编号、来源标签、答题留白与答案册', () => {
  const paper = buildReviewPaperModel([
    { source: 'photo', type: 'choice', stem: '补码 1111 的真值？', options: ['-1', '15'], referenceAnswer: '-1', studentAnswer: '15', title: '第二章', knowledgeLabel: '补码表示与转换', explanation: '符号位' },
    { source: 'assignment', type: 'short_answer', stem: '简述指令周期。', referenceAnswer: '取指译码执行写回', title: '作业一' },
  ], { studentName: '张同学' });
  assert.equal(paper.questionCount, 2);
  assert.equal(paper.studentName, '张同学');
  assert.equal(paper.questions[0].number, 1);
  assert.equal(paper.questions[0].answerLines, 1);
  assert.equal(paper.questions[1].answerLines, 4);
  assert.equal(paper.answers[0].wrongAnswer, '15');
  assert.equal(paper.answers[1].referenceAnswer, '取指译码执行写回');
});

test('mergeDraftQuestions：内容并入序号最小的题，其余删除', () => {
  const drafts = [
    { stem: 'A', studentAnswer: 'a1', referenceAnswer: '', explanation: '' },
    { stem: 'B', studentAnswer: 'b1', referenceAnswer: 'rb', explanation: '' },
    { stem: 'C', studentAnswer: '', referenceAnswer: '', explanation: 'ec' },
  ];
  const merged = mergeDraftQuestions(drafts, [0, 2]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].stem, 'A\nC');
  assert.equal(merged[0].studentAnswer, 'a1');
  assert.equal(merged[0].explanation, 'ec');
  assert.equal(merged[1].stem, 'B');
  assert.equal(mergeDraftQuestions(drafts, [1]), drafts);
  assert.equal(mergeDraftQuestions(drafts, [0, 9]), drafts);
});
