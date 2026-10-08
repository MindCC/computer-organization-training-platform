import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, migrate, createUser } from './db.js';
import { createKnowledgeRepository } from './knowledgeRepository.js';
import { createQuestionBankService } from './questionBankService.js';
import { ASSIGNMENT_QUESTIONS } from '../src/assignmentQuestions.js';
import { findPhotoKnowledgeAnswer } from './photoMistakeKnowledge.js';

function fixture() {
  const db = openDatabase(':memory:'); migrate(db);
  const owner = createUser(db, { username: 'kb-owner', role: 'teacher', displayName: '拥有者', passwordHash: 'test-only' });
  const other = createUser(db, { username: 'kb-other', role: 'teacher', displayName: '其他人', passwordHash: 'test-only' });
  const repository = createKnowledgeRepository(db);
  const mistake = { stem: '8 位补码 10010110 的真值是多少？', qtype: 'fill', chapterId: 'ch2', options: [] };
  const document = (studentId, content) => repository.createDocument({ studentId, title: '补码练习讲义', originalName: '补码.txt',
    fileType: 'txt', fileSize: content.length, analysis: {}, analysisSource: 'local', chunks: [{ index: 0, pageNo: 3, content }] });
  return { db, owner, other, mistake, document };
}

test('知识库同题答案本地检索，保留文档来源与页码，不采用仅主题相关的文字', () => {
  const f = fixture();
  try {
    f.document(f.owner.id, '补码概念讲义：负数补码可以取反加一。');
    assert.equal(findPhotoKnowledgeAnswer(f.db, f.owner.id, f.mistake), null);
    const document = f.document(f.owner.id, `题目：${f.mistake.stem}\n参考答案：-106\n解析：最高位权重为 -128，其余位之和为 22。`);
    const hit = findPhotoKnowledgeAnswer(f.db, f.owner.id, f.mistake);
    assert.equal(hit.answer, '-106');
    assert.match(hit.analysis, /-128/);
    assert.equal(hit.references[0].documentId, document.id);
    assert.equal(hit.references[0].pageNo, 3);
    assert.equal(hit.references[0].title, '补码练习讲义');
  } finally { f.db.close(); }
});

test('不读取其他账号文档；数字、负号、小数点、运算符不同不能视为同题', () => {
  const f = fixture();
  try {
    f.document(f.other.id, `题目：${f.mistake.stem}\n答案：PRIVATE_OTHER_ANSWER`);
    assert.equal(findPhotoKnowledgeAnswer(f.db, f.owner.id, f.mistake), null);
    for (const stem of ['8 位补码 10010111 的真值是多少？', '计算 -16+1', '计算 1.5+2', '计算 16-1', '计算 5!', '求符号 A 的位宽']) {
      f.document(f.owner.id, `题目：${stem}\n答案：不同题的答案`);
    }
    for (const stem of [f.mistake.stem, '计算 16+1', '计算 15+2', '计算 5', '求符号 a 的位宽']) {
      assert.equal(findPhotoKnowledgeAnswer(f.db, f.owner.id, { ...f.mistake, stem }), null);
    }
  } finally { f.db.close(); }
});

test('题目与答案跨块时可检索；下一块属于另一题时不能误用', () => {
  const f = fixture();
  try {
    const repository = createKnowledgeRepository(f.db);
    const input = { studentId: f.owner.id, title: '跨块讲义', originalName: '讲义.txt', fileType: 'txt', fileSize: 100, analysis: {}, analysisSource: 'local' };
    repository.createDocument({ ...input, chunks: [
      { index: 0, pageNo: 1, content: `题目：${f.mistake.stem}` },
      { index: 1, pageNo: 2, content: '题目：另一道补码题\n答案：其他题答案' },
    ] });
    assert.equal(findPhotoKnowledgeAnswer(f.db, f.owner.id, f.mistake), null);
    repository.createDocument({ ...input, chunks: [
      { index: 0, pageNo: 1, content: `题目：${f.mistake.stem}` },
      { index: 1, pageNo: 2, content: '答案：-106\n解析：按位权求和。' },
    ] });
    assert.equal(findPhotoKnowledgeAnswer(f.db, f.owner.id, f.mistake).answer, '-106');
  } finally { f.db.close(); }
});

test('课程题库复用参考答案与解析；选择题必须匹配选项；填空关键词可组成答案', () => {
  const f = fixture();
  try {
    const choice = ASSIGNMENT_QUESTIONS.find(question => question.id === 'ch2-q01');
    const question = { stem: choice.stem, qtype: choice.type, chapterId: choice.chapterId, options: choice.options };
    const hit = findPhotoKnowledgeAnswer(f.db, f.owner.id, question);
    assert.equal(hit.answer, choice.answer);
    assert.equal(hit.references[0].questionId, choice.id);
    assert.equal(findPhotoKnowledgeAnswer(f.db, f.owner.id, { ...question, options: ['错误选项1', '错误选项2'] }), null);
    const fill = ASSIGNMENT_QUESTIONS.find(question => question.id === 'ch1-q05');
    assert.match(findPhotoKnowledgeAnswer(f.db, f.owner.id, { stem: fill.stem, qtype: fill.type, chapterId: fill.chapterId, options: [] }).answer, /输入.*输出/);
  } finally { f.db.close(); }
});

test('教师仅能复用自己的教师题库，不暴露其他教师未发布的答案', () => {
  const f = fixture();
  try {
    const bank = createQuestionBankService({ db: f.db });
    const input = { stem: f.mistake.stem, chapterId: 'ch2', type: 'fill', answer: '-106', analysis: '按位权求和。', score: 10 };
    bank.create({ teacherId: f.other.id, input });
    assert.equal(findPhotoKnowledgeAnswer(f.db, f.owner.id, f.mistake), null);
    const question = bank.create({ teacherId: f.owner.id, input });
    const hit = findPhotoKnowledgeAnswer(f.db, f.owner.id, f.mistake);
    assert.equal(hit.answer, '-106');
    assert.equal(hit.references[0].questionId, question.id);
  } finally { f.db.close(); }
});

test('文档中的选择题核对选项顺序并将字母答案还原为选项文本', () => {
  const f = fixture();
  try {
    f.document(f.owner.id, '题目：计算机补码运算应选哪项？\nA. 取反加一\nB. 取反\n答案：A\n解析：注意加一。\n题目：下一题\n答案：不要混入');
    const mistake = { ...f.mistake, stem: '计算机补码运算应选哪项？', qtype: 'choice', options: ['取反加一', '取反'] };
    const hit = findPhotoKnowledgeAnswer(f.db, f.owner.id, mistake);
    assert.equal(hit.answer, '取反加一');
    assert.doesNotMatch(hit.analysis, /下一题|不要混入/);
    assert.equal(findPhotoKnowledgeAnswer(f.db, f.owner.id, { ...mistake, options: ['取反', '取反加一'] }), null);
  } finally { f.db.close(); }
});
