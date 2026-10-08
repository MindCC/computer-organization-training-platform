import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, migrate, createUser } from './db.js';
import { hashPassword } from './auth.js';
import * as repo from './photoMistakeRepository.js';
import { createKnowledgeRepository } from './knowledgeRepository.js';
import {
  readPhotoVisionConfig, photoCapabilities, normalizeDraftQuestion, matchKnowledgePoint,
  recognizePhotoMistakes, createPhotoImport, getImportDetail, updateImportQuestions, archivePhotoImport,
  explainPhotoMistake, generateSimilarRound, answerSimilarRound, setPhotoMastered, deletePhotoMistake,
  photoMistakeItems, listMistakeRounds,
} from './photoMistakes.js';

const PNG = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]).toString('base64')}`;
const ENV = { MISTAKE_VISION_API_KEY: 'vk', MISTAKE_VISION_BASE_URL: 'https://vision.example', MISTAKE_VISION_MODEL: 'vl-test', DEEPSEEK_API_KEY: 'dk' };

async function setup() {
  const db = openDatabase(':memory:');
  migrate(db);
  const passwordHash = await hashPassword('PhotoTest123!');
  const student = createUser(db, { username: 'photo-student', role: 'student', displayName: '学生', passwordHash });
  const other = createUser(db, { username: 'photo-other', role: 'student', displayName: '他人', passwordHash });
  return { db, student, other };
}

const recognitionBody = (questions) => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questions }) } }] });
const chatBody = (payload) => JSON.stringify({ choices: [{ message: { content: typeof payload === 'string' ? payload : JSON.stringify(payload) } }] });

const RECOGNIZED = [{
  imageIndex: 0, box: { x: 0.1, y: 0.2, w: 0.8, h: 0.3 },
  stem: '8 位补码 10010110 的真值是多少？', studentAnswer: '-106', referenceAnswer: '-106 的计算过程有误，真值为 -106？（示例）',
  qtype: 'fill', chapterId: 'ch2', knowledgeLabel: '补码表示与转换', explanation: '符号位理解错误',
}];

test('识别配置：专用配置优先，缺省时回落思维画板视觉配置，否则禁用', () => {
  assert.deepEqual(readPhotoVisionConfig({ MISTAKE_VISION_API_KEY: 'a', MISTAKE_VISION_BASE_URL: 'u', MISTAKE_VISION_MODEL: 'm' }),
    { enabled: true, apiKey: 'a', baseUrl: 'u', model: 'm', timeoutMs: 60000 });
  const fallback = readPhotoVisionConfig({ MINDMAP_VISION_API_KEY: 'b', MINDMAP_VISION_BASE_URL: 'u2', MINDMAP_VISION_MODEL: 'm2', MINDMAP_VISION_ENABLED: '1' });
  assert.equal(fallback.enabled, true); assert.equal(fallback.apiKey, 'b');
  assert.equal(readPhotoVisionConfig({ DEEPSEEK_API_KEY: 'only-text' }).enabled, false);
  assert.equal(photoCapabilities(ENV).vision, true);
  assert.equal(photoCapabilities({}).vision, false);
});

test('草稿题校验：题干必填、box 归一化、选择题选项约束、知识点自动匹配章节', () => {
  const ok = normalizeDraftQuestion({ stem: '题干', knowledgeLabel: '补码表示与转换', box: { x: -1, y: 0.5, w: 2, h: 0.6 } });
  assert.equal(ok.chapterId, 'ch2');
  assert.equal(ok.kpId, 'concept-twos-complement');
  assert.deepEqual(ok.box, { x: 0, y: 0.5, w: 1, h: 0.5 });
  assert.throws(() => normalizeDraftQuestion({ stem: '  ' }), /题干不能为空/);
  assert.throws(() => normalizeDraftQuestion({ stem: 'x', qtype: 'choice', options: ['只有一个'] }), /至少需要 2 个选项/);
  assert.equal(normalizeDraftQuestion({ stem: 'x', box: { x: 0, y: 0, w: 0.001, h: 0.001 } }).box, null);
  const choice = normalizeDraftQuestion({ stem: '选', qtype: 'choice', options: ['A', 'B'], chapterId: 'ch3' });
  assert.equal(choice.qtype, 'choice');
  assert.deepEqual(choice.options, ['A', 'B']);
});

test('知识点标签匹配：精确标题、别名、标签与互相包含，优先同章', () => {
  assert.equal(matchKnowledgePoint('补码表示与转换')?.id, 'concept-twos-complement');
  assert.equal(matchKnowledgePoint('IEEE 754 浮点编码')?.chapterId, 'ch2');
  assert.equal(matchKnowledgePoint('组相联')?.chapterId, 'ch4');
  assert.equal(matchKnowledgePoint('完全无关的标签xyz'), null);
});

test('识别：需要同意、校验图片与配置，解析并归一化识别结果', async () => {
  await assert.rejects(() => recognizePhotoMistakes({ images: [PNG], consent: false }, { env: ENV }), /确认/);
  await assert.rejects(() => recognizePhotoMistakes({ images: [PNG], consent: true }, { env: {} }), /视觉模型/);
  await assert.rejects(() => recognizePhotoMistakes({ images: [], consent: true }, { env: ENV }), /至少一张/);
  await assert.rejects(() => recognizePhotoMistakes({ images: [PNG, PNG, PNG, PNG, PNG], consent: true }, { env: ENV }), /最多导入 4 张/);

  let requested = null;
  const fetchImpl = async (url, init) => {
    requested = { url, init };
    return { ok: true, json: async () => JSON.parse(recognitionBody(RECOGNIZED)) };
  };
  const result = await recognizePhotoMistakes({ images: [PNG], consent: true }, { env: ENV, fetchImpl });
  assert.equal(result.provider, 'vl-test');
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].chapterId, 'ch2');
  assert.equal(result.questions[0].kpId, 'concept-twos-complement');
  const body = JSON.parse(requested.init.body);
  assert.equal(body.model, 'vl-test');
  assert.equal(body.messages[0].content.length, 2); // 文本提示 + 1 张图片
  assert.match(body.messages[0].content[0].text, /输出契约/);

  const emptyFetch = async () => ({ ok: true, json: async () => JSON.parse(recognitionBody([])) });
  await assert.rejects(() => recognizePhotoMistakes({ images: [PNG], consent: true }, { env: ENV, fetchImpl: emptyFetch }), /认出错题/);
  const badFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await assert.rejects(() => recognizePhotoMistakes({ images: [PNG], consent: true }, { env: ENV, fetchImpl: badFetch }), /请求失败/);
});

test('导入创建幂等：同一提交标识不重复识别、不重复建单', async () => {
  const { db, student } = await setup();
  try {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return { ok: true, json: async () => JSON.parse(recognitionBody(RECOGNIZED)) }; };
    const first = await createPhotoImport(db, student.id, { images: [PNG], consent: true, clientSubmissionId: 'import-key-0001' }, { env: ENV, fetchImpl });
    const second = await createPhotoImport(db, student.id, { images: [PNG], consent: true, clientSubmissionId: 'import-key-0001' }, { env: ENV, fetchImpl });
    assert.equal(first.duplicated, false);
    assert.equal(second.duplicated, true);
    assert.equal(second.importId, first.importId);
    assert.equal(calls, 1);
    const detail = getImportDetail(db, student.id, first.importId);
    assert.equal(detail.import.status, 'review');
    assert.equal(detail.questions.length, 1);
    assert.throws(() => getImportDetail(db, 999999, first.importId), /不存在/);
  } finally { db.close(); }
});

test('核对编辑整体替换草稿，归档需要选定章节，归档后禁止再改', async () => {
  const { db, student } = await setup();
  try {
    const fetchImpl = async () => ({ ok: true, json: async () => JSON.parse(recognitionBody(RECOGNIZED)) });
    const created = await createPhotoImport(db, student.id, { images: [PNG], consent: true, clientSubmissionId: 'import-key-0002' }, { env: ENV, fetchImpl });
    const edited = updateImportQuestions(db, student.id, created.importId, [
      { stem: '修改后的题干', chapterId: 'ch3', knowledgeLabel: '全加器', qtype: 'short_answer', studentAnswer: '错答', referenceAnswer: '正解' },
    ]);
    assert.equal(edited.questions.length, 1);
    assert.equal(edited.questions[0].chapterId, 'ch3');
    assert.equal(edited.questions[0].stem, '修改后的题干');
    assert.throws(() => updateImportQuestions(db, student.id, created.importId, []), /至少保留一道/);
    updateImportQuestions(db, student.id, created.importId, [{ stem: '未定章节', qtype: 'fill' }]);
    assert.throws(() => archivePhotoImport(db, student.id, created.importId), /还没有选择章节/);
    updateImportQuestions(db, student.id, created.importId, [{ stem: '已定', chapterId: 'ch2', qtype: 'fill' }]);
    const archived = await archivePhotoImport(db, student.id, created.importId);
    assert.equal(archived.import.status, 'archived');
    assert.throws(() => updateImportQuestions(db, student.id, created.importId, [{ stem: '再改', chapterId: 'ch2' }]), /已归档/);
    const again = await archivePhotoImport(db, student.id, created.importId);
    assert.equal(again.import.status, 'archived');
  } finally { db.close(); }
});

async function archivedMistake(db, student, key = 'import-key-0003') {
  const fetchImpl = async () => ({ ok: true, json: async () => JSON.parse(recognitionBody(RECOGNIZED)) });
  const created = await createPhotoImport(db, student.id, { images: [PNG], consent: true, clientSubmissionId: key }, { env: ENV, fetchImpl });
  await archivePhotoImport(db, student.id, created.importId);
  return getImportDetail(db, student.id, created.importId).questions[0];
}

test('归档后的拍照错题进入统一错题本，未归档不出现', async () => {
  const { db, student } = await setup();
  try {
    const fetchImpl = async () => ({ ok: true, json: async () => JSON.parse(recognitionBody(RECOGNIZED)) });
    const created = await createPhotoImport(db, student.id, { images: [PNG], consent: true, clientSubmissionId: 'import-key-0004' }, { env: ENV, fetchImpl });
    assert.equal(photoMistakeItems(db, student.id).length, 0);
    await archivePhotoImport(db, student.id, created.importId);
    const items = photoMistakeItems(db, student.id);
    assert.equal(items.length, 1);
    const item = items[0];
    assert.equal(item.source, 'photo');
    assert.equal(item.chapterId, 'ch2');
    assert.equal(item.knowledgeLabel, '补码表示与转换');
    assert.equal(item.resolved, false);
    assert.equal(item.count, 1);
    assert.equal(item.errorType, '拍照导入');
  } finally { db.close(); }
});

test('AI 讲错因：需要同意、生成四段讲解并缓存', async () => {
  const { db, student } = await setup();
  try {
    const mistake = await archivedMistake(db, student);
    const missing = await explainPhotoMistake(db, student.id, mistake.id, { consent: false }, { env: ENV, fetchImpl: () => assert.fail('本地检索不得调用模型') });
    assert.equal(missing.needsAi, true);
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return { ok: true, json: async () => JSON.parse(chatBody({ focus: '补码真值计算', pitfalls: '把符号位当成数值位', solution: '先确定符号位，再按位权求负值。', studyAdvice: '多练补码与真值互转。' })) }; };
    const first = await explainPhotoMistake(db, student.id, mistake.id, { consent: true }, { env: ENV, fetchImpl });
    assert.equal(first.cached, false);
    assert.equal(first.explanation.solution, '先确定符号位，再按位权求负值。');
    const second = await explainPhotoMistake(db, student.id, mistake.id, { consent: false }, { env: ENV, fetchImpl });
    assert.equal(second.cached, true);
    assert.equal(calls, 1);
  } finally { db.close(); }
});

const SIMILAR = {
  questions: [
    { qtype: 'fill', stem: '8 位补码 11110000 的真值？', answer: '-16', analysis: '符号位为 1，按位权计算。' },
    { qtype: 'choice', stem: '下列哪个是 -1 的 8 位补码？', options: ['11111111', '10000001'], answer: '11111111', analysis: '全 1 为 -1。' },
    { qtype: 'short_answer', stem: '说明补码减法为什么可以复用加法器。', answer: '补码统一了加减法', analysis: '模运算性质。' },
  ],
};

test('同类题：需要同意、结构校验、生成幂等', async () => {
  const { db, student } = await setup();
  try {
    const mistake = await archivedMistake(db, student);
    await assert.rejects(() => generateSimilarRound(db, student.id, mistake.id, { consent: false, clientSubmissionId: 'round-key-0001' }, { env: ENV }), /确认/);
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return { ok: true, json: async () => JSON.parse(chatBody(SIMILAR)) }; };
    const first = await generateSimilarRound(db, student.id, mistake.id, { consent: true, clientSubmissionId: 'round-key-0001' }, { env: ENV, fetchImpl });
    assert.equal(first.duplicated, false);
    assert.equal(first.round.questions.length, 3);
    const second = await generateSimilarRound(db, student.id, mistake.id, { consent: true, clientSubmissionId: 'round-key-0001' }, { env: ENV, fetchImpl });
    assert.equal(second.duplicated, true);
    assert.equal(second.round.id, first.round.id);
    assert.equal(calls, 1);
    const badFetch = async () => ({ ok: true, json: async () => JSON.parse(chatBody({ questions: [{ qtype: 'choice', stem: 'x', options: ['A', 'B'], answer: '不在选项里' }] })) });
    await assert.rejects(() => generateSimilarRound(db, student.id, mistake.id, { consent: true, clientSubmissionId: 'round-key-0002' }, { env: ENV, fetchImpl: badFetch }), /答案不在选项中/);
  } finally { db.close(); }
});

test('轮次判分：客观题本地判、简答自评或 AI 判，连续两轮全对自动掌握', async () => {
  const { db, student } = await setup();
  try {
    const mistake = await archivedMistake(db, student);
    const fetchImpl = async () => ({ ok: true, json: async () => JSON.parse(chatBody(SIMILAR)) });
    const round1 = (await generateSimilarRound(db, student.id, mistake.id, { consent: true, clientSubmissionId: 'round-key-0010' }, { env: ENV, fetchImpl })).round;
    // 简答既不自评也不给 AI 同意 → 拒绝
    await assert.rejects(() => answerSimilarRound(db, student.id, round1.id, { answers: { 0: '-16', 1: '11111111', 2: '因为模运算' } }, { env: ENV }), /自评|AI 判分/);
    const result1 = await answerSimilarRound(db, student.id, round1.id, {
      answers: { 0: '-16', 1: '11111111', 2: '因为模运算统一了正负数' },
      selfAssessments: { 2: 'correct' },
    }, { env: ENV });
    assert.equal(result1.allCorrect, true);
    assert.equal(result1.results[0].mode, 'local');
    assert.equal(result1.results[2].mode, 'self');
    // 幂等：相同答案重复提交返回原结果；不同答案 409
    const dup = await answerSimilarRound(db, student.id, round1.id, {
      answers: { 0: '-16', 1: '11111111', 2: '因为模运算统一了正负数' },
      selfAssessments: { 2: 'correct' },
    }, { env: ENV });
    assert.equal(dup.duplicated, true);
    await assert.rejects(() => answerSimilarRound(db, student.id, round1.id, {
      answers: { 0: '-15', 1: '11111111', 2: '因为模运算统一了正负数' },
      selfAssessments: { 2: 'correct' },
    }, { env: ENV }), /不能更改/);
    // 一轮全对后还未自动掌握
    assert.equal(photoMistakeItems(db, student.id)[0].resolved, false);
    // AI 判简答：第二轮
    const judgeFetch = async () => ({ ok: true, json: async () => JSON.parse(chatBody({ results: [{ index: 2, correct: true, note: '要点正确' }] })) });
    const round2 = (await generateSimilarRound(db, student.id, mistake.id, { consent: true, clientSubmissionId: 'round-key-0011' }, { env: ENV, fetchImpl })).round;
    const result2 = await answerSimilarRound(db, student.id, round2.id, {
      answers: { 0: '-16', 1: '11111111', 2: '模运算让减法变加法' },
      aiJudgeConsent: true,
    }, { env: ENV, fetchImpl: judgeFetch });
    assert.equal(result2.allCorrect, true);
    assert.equal(result2.results[2].mode, 'ai');
    assert.equal(result2.mastered, true);
    assert.equal(photoMistakeItems(db, student.id)[0].resolved, true);
    // 有全对轮次也有错轮时错题计数包含错误轮
    const rounds = listMistakeRounds(db, student.id, mistake.id).rounds;
    assert.equal(rounds.length, 2);
  } finally { db.close(); }
});

test('手动掌握切换与删除错题；掌握状态保留手动标记', async () => {
  const { db, student } = await setup();
  try {
    const mistake = await archivedMistake(db, student);
    const mastered = setPhotoMastered(db, student.id, mistake.id, true);
    assert.equal(mastered.mastered, true);
    assert.equal(mastered.masteredManual, true);
    const unmastered = setPhotoMastered(db, student.id, mistake.id, false);
    assert.equal(unmastered.mastered, false);
    assert.throws(() => setPhotoMastered(db, 999999, mistake.id, true), /不存在/);
    deletePhotoMistake(db, student.id, mistake.id);
    assert.equal(photoMistakeItems(db, student.id).length, 0);
    assert.throws(() => deletePhotoMistake(db, student.id, mistake.id), /不存在/);
  } finally { db.close(); }
});

test('错误轮次计入错题次数与快照', async () => {
  const { db, student } = await setup();
  try {
    const mistake = await archivedMistake(db, student);
    const fetchImpl = async () => ({ ok: true, json: async () => JSON.parse(chatBody(SIMILAR)) });
    const round = (await generateSimilarRound(db, student.id, mistake.id, { consent: true, clientSubmissionId: 'round-key-0020' }, { env: ENV, fetchImpl })).round;
    const result = await answerSimilarRound(db, student.id, round.id, {
      answers: { 0: '答错', 1: '10000001', 2: '随便写' },
      selfAssessments: { 2: 'wrong' },
    }, { env: ENV });
    assert.equal(result.allCorrect, false);
    const item = photoMistakeItems(db, student.id)[0];
    assert.equal(item.count, 2);
    assert.equal(item.snapshots.length, 1);
    assert.equal(item.resolved, false);
  } finally { db.close(); }
});

// Delay the provider response so requests overlap; a correct implementation calls it once.
function delayedProvider(payload) {
  let calls = 0;
  const requests = [];
  return {
    requests, count: () => calls,
    fetchImpl: async (_url, init) => {
      calls += 1;
      requests.push(JSON.parse(init.body));
      await new Promise(resolve => setTimeout(resolve, 25));
      return { ok: true, json: async () => JSON.parse(chatBody(payload)) };
    },
  };
}

test('并发识别同一提交只调用一次模型，所有请求返回同一份草稿', async () => {
  const { db, student } = await setup();
  try {
    const provider = delayedProvider({ questions: RECOGNIZED });
    const results = await Promise.all(Array.from({ length: 4 }, () => createPhotoImport(db, student.id,
      { images: [PNG], consent: true, clientSubmissionId: 'concurrent-import' }, { env: ENV, fetchImpl: provider.fetchImpl })));
    assert.equal(provider.count(), 1);
    assert.equal(new Set(results.map(result => result.importId)).size, 1);
    assert.equal(results.filter(result => !result.duplicated).length, 1);
    assert.equal(getImportDetail(db, student.id, results[0].importId).questions.length, 1);
  } finally { db.close(); }
});

test('并发讲解只生成一次，并发同类题只建一轮且不发送原作答', async () => {
  const { db, student } = await setup();
  try {
    const mistake = await archivedMistake(db, student);
    db.prepare('UPDATE photo_mistakes SET student_answer = ? WHERE id = ?').run('PRIVATE_ORIGINAL_ANSWER', mistake.id);
    const explanation = delayedProvider({ solution: '按位权计算', focus: '补码' });
    const explained = await Promise.all([1, 2, 3].map(() => explainPhotoMistake(db, student.id, mistake.id,
      { consent: true }, { env: ENV, fetchImpl: explanation.fetchImpl })));
    assert.equal(explanation.count(), 1);
    assert.equal(explained.filter(result => !result.cached).length, 1);
    assert.match(explanation.requests[0].messages[0].content, /PRIVATE_ORIGINAL_ANSWER/);
    const provider = delayedProvider(SIMILAR);
    const rounds = await Promise.all([1, 2, 3].map(() => generateSimilarRound(db, student.id, mistake.id,
      { consent: true, clientSubmissionId: 'concurrent-round' }, { env: ENV, fetchImpl: provider.fetchImpl })));
    assert.equal(provider.count(), 1);
    assert.equal(new Set(rounds.map(result => result.round.id)).size, 1);
    assert.equal(rounds.filter(result => !result.duplicated).length, 1);
    assert.doesNotMatch(provider.requests[0].messages[0].content, /PRIVATE_ORIGINAL_ANSWER|学生的错误作答/);
    assert.match(provider.requests[0].messages[0].content, /8 位补码|补码表示与转换/);
    const otherMistake = await archivedMistake(db, student, 'another-mistake');
    await assert.rejects(() => generateSimilarRound(db, student.id, otherMistake.id,
      { consent: true, clientSubmissionId: 'concurrent-round' }, { env: ENV, fetchImpl: provider.fetchImpl }), /其他错题/);
  } finally { db.close(); }
});

test('模型失败后同一提交可以重试，不会遗留挂起的请求', async () => {
  const { db, student } = await setup();
  try {
    const input = { images: [PNG], consent: true, clientSubmissionId: 'retry-import' };
    await assert.rejects(() => createPhotoImport(db, student.id, input, { env: ENV, fetchImpl: async () => { throw new Error('offline'); } }), /识别失败/);
    const provider = delayedProvider({ questions: RECOGNIZED });
    const result = await createPhotoImport(db, student.id, input, { env: ENV, fetchImpl: provider.fetchImpl });
    assert.equal(result.duplicated, false);
    assert.equal(provider.count(), 1);
  } finally { db.close(); }
});

test('讲解优先检索本地知识库，命中时无需同意或模型配置；仅未命中才调用 AI', async () => {
  const { db, student, other } = await setup();
  try {
    const mistake = await archivedMistake(db, student);
    const repository = createKnowledgeRepository(db);
    function add(ownerId) {
      return repository.createDocument({ studentId: ownerId, title: '我的补码讲义', originalName: '讲义.txt', fileType: 'txt', fileSize: 100,
        analysis: {}, analysisSource: 'local', chunks: [{ index: 0, pageNo: 5, content: `题目：${mistake.stem}\n答案：-106\n解析：按位权求和。` }] });
    }
    add(other.id);
    const noAi = { env: {}, fetchImpl: () => assert.fail('本地检索不得调用模型') };
    assert.equal((await explainPhotoMistake(db, student.id, mistake.id, { consent: false }, noAi)).needsAi, true);
    const doc = add(student.id);
    const hit = await explainPhotoMistake(db, student.id, mistake.id, { consent: false }, noAi);
    assert.equal(hit.source, 'knowledge');
    assert.equal(hit.needsAi, false);
    assert.match(hit.explanation.solution, /-106/);
    assert.equal(hit.references[0].documentId, doc.id);
    // Local matches also take priority when the user already consented to AI.
    assert.equal((await explainPhotoMistake(db, student.id, mistake.id, { consent: true }, noAi)).source, 'knowledge');
    repository.deleteDocument(student.id, doc.id);
    const provider = delayedProvider({ solution: 'AI 解题步骤' });
    assert.equal((await explainPhotoMistake(db, student.id, mistake.id, { consent: true }, { env: ENV, fetchImpl: provider.fetchImpl })).source, 'ai');
    assert.equal(provider.count(), 1);
    assert.equal((await explainPhotoMistake(db, student.id, mistake.id, { consent: false }, noAi)).cached, true);
  } finally { db.close(); }
});

test('简答题允许部分自评、其余交 AI，只发送待判题目及其作答', async () => {
  const { db, student } = await setup();
  try {
    const mistake = await archivedMistake(db, student);
    const round = repo.createRound(db, { studentId: student.id, photoMistakeId: mistake.id, clientSubmissionId: 'mixed-grading-round',
      questions: [
        { qtype: 'short_answer', stem: '自评题目', answer: '自评参考' },
        { qtype: 'short_answer', stem: '待判题目', answer: '待判参考' },
      ] });
    const provider = delayedProvider({ results: [{ index: 1, correct: true, note: '正确' }] });
    const result = await answerSimilarRound(db, student.id, round.id,
      { answers: { 0: 'PRIVATE_SELF_ANSWER', 1: 'AI_ANSWER' }, selfAssessments: { 0: 'correct' }, aiJudgeConsent: true },
      { env: ENV, fetchImpl: provider.fetchImpl });
    assert.equal(result.allCorrect, true);
    assert.equal(result.results[0].mode, 'self');
    assert.equal(result.results[1].mode, 'ai');
    assert.doesNotMatch(provider.requests[0].messages[0].content, /PRIVATE_SELF_ANSWER/);
    assert.match(provider.requests[0].messages[0].content, /AI_ANSWER/);
  } finally { db.close(); }
});

test('两轮全对不覆盖手动掌握来源；手动取消后仍允许新练习自动掌握', async () => {
  const { db, student } = await setup();
  try {
    const mistake = await archivedMistake(db, student);
    setPhotoMastered(db, student.id, mistake.id, true);
    async function correctRound(key) {
      const round = repo.createRound(db, { studentId: student.id, photoMistakeId: mistake.id, clientSubmissionId: key,
        questions: [{ qtype: 'fill', stem: '补码计算', answer: '1' }] });
      await answerSimilarRound(db, student.id, round.id, { answers: { 0: '1' } });
    }
    await correctRound('manual-correct-1');
    await correctRound('manual-correct-2');
    assert.equal(photoMistakeItems(db, student.id)[0].masteredManual, true);
    setPhotoMastered(db, student.id, mistake.id, false);
    await correctRound('manual-correct-3');
    const item = photoMistakeItems(db, student.id)[0];
    assert.equal(item.resolved, true);
    assert.equal(item.masteredManual, false);
  } finally { db.close(); }
});
