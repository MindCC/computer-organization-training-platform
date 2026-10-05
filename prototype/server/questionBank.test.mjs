import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { openDatabase, migrate, createUser, createClass } from './db.js';
import { hashPassword } from './auth.js';

const CHOICE = { chapterId: 'ch3', type: 'choice', stem: '半加器的进位输出是？', options: ['A·B', 'A⊕B', 'A+B', 'A̅'], answer: 'A·B', analysis: '进位是与运算。', score: 10 };
const TRUEFALSE = { chapterId: 'ch3', type: 'truefalse', stem: '全加器考虑了低位进位。', answer: 'true', analysis: '' };
const FILL = { chapterId: 'ch4', type: 'fill', stem: 'Cache 与主存之间的地址映射方式有直接映射、全相联映射和____映射。', answer: '组相联', keywords: [['组相联']], score: 15 };
const SHORT = { chapterId: 'ch6', type: 'short_answer', stem: '简述指令周期的主要阶段。', answer: '取指、译码、执行、写回', score: 20 };

async function setup({ fetchImpl, env } = {}) {
  const db = openDatabase(':memory:'); migrate(db);
  const passwordHash = await hashPassword('BankTest123!');
  const teacher = createUser(db, { username: 'bank-teacher', role: 'teacher', displayName: '教师', passwordHash });
  const other = createUser(db, { username: 'bank-other', role: 'teacher', displayName: '另一位教师', passwordHash });
  const student = createUser(db, { username: 'bank-student', role: 'student', displayName: '学生', passwordHash });
  const classId = createClass(db, teacher.id, '题库班').id;
  db.prepare('INSERT INTO class_members (class_id, student_id) VALUES (?, ?)').run(classId, student.id);
  const app = createApp({ db, serveStatic: false, logger: () => {}, questionBankOptions: { env: env ?? { DEEPSEEK_API_KEY: '' }, fetchImpl } });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { cookie, ...options } = {}) {
    const res = await fetch(url + path, { ...options, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...options.headers } });
    return { status: res.status, body: await res.json().catch(() => ({})), cookie: res.headers.get('set-cookie')?.split(';')[0] };
  }
  const cookies = {};
  for (const user of ['bank-teacher', 'bank-other', 'bank-student']) {
    cookies[user] = (await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: user, password: 'BankTest123!' }) })).cookie;
  }
  const teacherPost = (path, body, cookie = cookies['bank-teacher']) => request(path, { cookie, method: 'POST', body: JSON.stringify(body) });
  return {
    db, cookies, classId, teacherPost, request,
    close: async () => { await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); db.close(); },
  };
}

test('题库 CRUD 与逐题校验', async () => {
  const s = await setup();
  try {
    // 未登录 / 学生 / 其他教师隔离
    assert.equal((await s.request('/api/teacher/question-bank')).status, 401);
    assert.equal((await s.request('/api/teacher/question-bank', { cookie: s.cookies['bank-student'] })).status, 403);

    const created = await s.teacherPost('/api/teacher/question-bank', CHOICE);
    assert.equal(created.status, 201);
    assert.equal(created.body.question.answer, 'A·B');
    const id = created.body.question.id;

    // 非法题目被拒绝
    assert.equal((await s.teacherPost('/api/teacher/question-bank', { ...CHOICE, answer: '不存在的选项' })).status, 400);
    assert.equal((await s.teacherPost('/api/teacher/question-bank', { ...TRUEFALSE, answer: 'yes' })).status, 400);
    assert.equal((await s.teacherPost('/api/teacher/question-bank', { ...CHOICE, chapterId: 'ch99' })).status, 400);

    // 更新与权限
    const updated = await s.request(`/api/teacher/question-bank/${id}`, { cookie: s.cookies['bank-teacher'], method: 'PUT', body: JSON.stringify({ ...CHOICE, stem: '半加器进位输出（修订）' }) });
    assert.equal(updated.status, 200);
    assert.match(updated.body.question.stem, /修订/);
    assert.equal((await s.request(`/api/teacher/question-bank/${id}`, { cookie: s.cookies['bank-other'], method: 'PUT', body: JSON.stringify(CHOICE) })).status, 404);
    assert.equal((await s.request(`/api/teacher/question-bank/${id}`, { cookie: s.cookies['bank-other'], method: 'DELETE' })).status, 404);

    // 列表筛选
    await s.teacherPost('/api/teacher/question-bank', TRUEFALSE);
    const list = await s.request('/api/teacher/question-bank?chapterId=ch3&type=truefalse', { cookie: s.cookies['bank-teacher'] });
    assert.equal(list.body.questions.length, 1);
    assert.equal(list.body.questions[0].type, 'truefalse');
    assert.ok(list.body.counts.some((row) => row.chapterId === 'ch3'));

    assert.equal((await s.request(`/api/teacher/question-bank/${id}`, { cookie: s.cookies['bank-teacher'], method: 'DELETE' })).status, 200);
  } finally { await s.close(); }
});

test('批量导入幂等：同一批次重复导入自动跳过', async () => {
  const s = await setup();
  try {
    const payload = { batchId: 'import-1', source: 'import', questions: [CHOICE, TRUEFALSE, { ...CHOICE, stem: '坏题', answer: '不在选项里' }] };
    const first = await s.teacherPost('/api/teacher/question-bank/import', payload);
    assert.equal(first.status, 200);
    assert.deepEqual({ imported: first.body.result.imported, skipped: first.body.result.skipped }, { imported: 2, skipped: 0 });
    assert.equal(first.body.result.errors.length, 1);

    const again = await s.teacherPost('/api/teacher/question-bank/import', payload);
    assert.equal(again.body.result.imported, 0);
    assert.equal(again.body.result.skipped, 2);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM question_bank').get().n, 2);
  } finally { await s.close(); }
});

test('自动出卷：预览抽题、生成作业并发布，学生可作答且自动判分', async () => {
  const s = await setup();
  try {
    await s.teacherPost('/api/teacher/question-bank/import', { batchId: 'seed', questions: [CHOICE, TRUEFALSE, FILL, SHORT] });

    // 预览：同一种子抽题可复现
    const spec = [{ type: 'choice', count: 1, score: 10 }, { type: 'truefalse', count: 1, score: 10 }, { type: 'fill', count: 1, score: 15 }];
    const p1 = (await s.teacherPost('/api/teacher/question-bank/compose', { action: 'preview', chapters: ['ch3', 'ch4'], spec, seed: 42 })).body.preview;
    const p2 = (await s.teacherPost('/api/teacher/question-bank/compose', { action: 'preview', chapters: ['ch3', 'ch4'], spec, seed: 42 })).body.preview;
    assert.equal(p1.questions.length, 3);
    assert.equal(p1.totalScore, 35);
    assert.deepEqual(p1.questions.map((q) => q.stem), p2.questions.map((q) => q.stem));

    // 数量不足时给出缺口提示
    const lack = (await s.teacherPost('/api/teacher/question-bank/compose', { action: 'preview', spec: [{ type: 'choice', count: 5 }] })).body.preview;
    assert.deepEqual(lack.shortage, [{ type: 'choice', wanted: 5, available: 1 }]);

    // 生成作业并发布
    const composed = await s.teacherPost('/api/teacher/question-bank/compose', {
      action: 'assignment', classId: s.classId, title: '第三章小测', publish: true,
      chapters: ['ch3'], spec: [{ type: 'choice', count: 1, score: 30 }, { type: 'truefalse', count: 1, score: 20 }], seed: 7,
    });
    assert.equal(composed.status, 200);
    assert.equal(composed.body.assignment.status, 'published');
    assert.equal(composed.body.totalScore, 50);

    // 其他教师不能往这个班出卷（先给他自己的题库备题，排除题库为空的干扰）
    await s.teacherPost('/api/teacher/question-bank/import', { batchId: 'other-seed', questions: [CHOICE] }, s.cookies['bank-other']);
    assert.equal((await s.teacherPost('/api/teacher/question-bank/compose', { action: 'assignment', classId: s.classId, spec: [{ type: 'choice', count: 1 }] }, s.cookies['bank-other'])).status, 404);

    // 学生看到已发布作业并作答，客观题自动判分
    const list = await s.request('/api/student/assignments', { cookie: s.cookies['bank-student'] });
    const assignment = list.body.assignments.find((item) => item.title === '第三章小测');
    assert.ok(assignment);
    const detail = await s.request(`/api/student/assignments/${assignment.id}`, { cookie: s.cookies['bank-student'] });
    const answers = detail.body.questions.map((q) => ({
      questionId: q.id,
      value: q.type === 'choice' ? 'A·B' : q.type === 'truefalse' ? 'true' : '',
    }));
    const submit = await s.request(`/api/student/assignments/${assignment.id}/submit`, { cookie: s.cookies['bank-student'], method: 'POST', body: JSON.stringify({ answers }) });
    assert.equal(submit.status, 200);
    assert.equal(submit.body.autoScore, 50);
  } finally { await s.close(); }
});

test('AI 出题：候选校验、确认授权与未配置降级', async () => {
  const aiPayload = JSON.stringify({
    questions: [
      { type: 'choice', stem: 'AI 生成的单选：ALU 的核心功能是？', options: ['算术逻辑运算', '存储程序', '输入数据', '显示结果'], answer: '算术逻辑运算', analysis: 'ALU 负责运算。', score: 10 },
      { type: 'truefalse', stem: 'AI 生成的坏题（答案非法）', answer: 'maybe' },
    ],
  });
  let calls = 0; let sentBody = '';
  const fetchImpl = async (_url, init) => {
    calls += 1; sentBody = String(init.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: aiPayload } }] }) };
  };
  const s = await setup({ fetchImpl, env: { DEEPSEEK_API_KEY: 'test-key', DEEPSEEK_BASE_URL: 'https://example.test', DEEPSEEK_MODEL: 'test-model' } });
  try {
    // 未确认授权直接拒绝
    assert.equal((await s.teacherPost('/api/teacher/question-bank/ai-generate', { chapterId: 'ch3', requirements: '出两道题', counts: { choice: 1 } })).status, 400);
    // 学生不可用
    assert.equal((await s.teacherPost('/api/teacher/question-bank/ai-generate', { chapterId: 'ch3', requirements: '出题', counts: { choice: 1 }, consent: true }, s.cookies['bank-student'])).status, 403);

    const generated = await s.teacherPost('/api/teacher/question-bank/ai-generate', {
      chapterId: 'ch3', requirements: '围绕全加器出题，PRIVATE_STUDENT_NAMES 不应外发', counts: { choice: 1, truefalse: 1 }, consent: true,
    });
    assert.equal(generated.status, 200);
    assert.equal(calls, 1);
    assert.ok(sentBody.includes('围绕全加器出题')); // 教师主动填写的出题要求会发送
    assert.equal(generated.body.candidates.length, 1); // 坏题被校验拒绝
    assert.equal(generated.body.rejected.length, 1);
    assert.equal(generated.body.candidates[0].chapterId, 'ch3'); // 章节以教师选择为准
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM question_bank').get().n, 0); // 候选不落库

    // 勾选入库走 import（source=ai）
    const adopt = await s.teacherPost('/api/teacher/question-bank/import', { batchId: 'ai-1', source: 'ai', questions: generated.body.candidates });
    assert.equal(adopt.body.result.imported, 1);
  } finally { await s.close(); }

  // 未配置 API Key：明确的降级错误
  const noKey = await setup({ env: { DEEPSEEK_API_KEY: '' } });
  try {
    const result = await noKey.teacherPost('/api/teacher/question-bank/ai-generate', { chapterId: 'ch3', requirements: '出题', counts: { choice: 1 }, consent: true });
    assert.equal(result.status, 503);
    assert.match(result.body.error?.message ?? result.body.error, /DEEPSEEK_API_KEY|批量导入|手工录入/);
  } finally { await noKey.close(); }
});
