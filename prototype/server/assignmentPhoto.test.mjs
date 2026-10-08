import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, migrate, createUser, createClass } from './db.js';
import { createAssignmentRepository } from './assignmentRepository.js';
import { createAssignmentService } from './assignmentService.js';
import { createQuestionBankService } from './questionBankService.js';
import { recognizeAssignmentPhotos, createAssignmentPhotoService } from './assignmentPhoto.js';
import { createApp } from './app.js';
import { hashPassword } from './auth.js';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const env = { MINDMAP_VISION_API_KEY: 'test-key', MINDMAP_VISION_BASE_URL: 'https://vision.invalid/v1', MINDMAP_VISION_MODEL: 'qwen3-vl-plus', MINDMAP_VISION_ENABLED: '1' };
const question = { chapterId: 'ch3', type: 'choice', stem: '半加器的进位输出为？', options: ['A·B', 'A⊕B'], answer: 'A·B', analysis: '进位是与运算。', score: 10 };
const response = data => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(data) } }] }) });

test('photo recognition sends only selected images and chapter, returns editable candidates without saving', async () => {
  let sent;
  const result = await recognizeAssignmentPhotos({ images: [image], chapterId: 'ch3', consent: true, studentName: 'PRIVATE_STUDENT', grades: [90] }, { env, fetchImpl: async (url, options) => { sent = { url, ...JSON.parse(options.body) }; return response({ title: '半加器练习', questions: [question, { ...question, stem: '未提供答案的题', answer: '' }] }); } });
  assert.equal(result.questions.length, 2);
  assert.equal(result.questions[1].answer, '');
  assert.match(sent.messages[0].content[0].text, /没有参考答案.*解答/);
  assert.match(result.questions[1].warning, /答案/);
  assert.equal(sent.model, 'qwen3-vl-plus');
  assert.equal(sent.messages[0].content[1].image_url.url, image);
  assert.ok(!JSON.stringify(sent).includes('PRIVATE_STUDENT'));
  assert.ok(!JSON.stringify(sent).includes('grades'));
});

test('photo recognition rejects consent, invalid images, oversized batches and unavailable vision before calling provider', async () => {
  let calls = 0;
  const options = { env, fetchImpl: async () => { calls++; return response({ questions: [question] }); } };
  const valid = { images: [image], chapterId: 'ch3', consent: true };
  for (const input of [{ ...valid, consent: false }, { ...valid, images: ['https://private.invalid/image'] }, { ...valid, images: [] }, { ...valid, images: Array(4).fill(image) }, { ...valid, chapterId: 'ch99' }]) await assert.rejects(recognizeAssignmentPhotos(input, options), e => e.status === 400);
  await assert.rejects(recognizeAssignmentPhotos(valid, { ...options, env: {} }), e => e.status === 503);
  assert.equal(calls, 0);
});

test('provider errors and malformed recognition are explicit failures, never fabricated questions', async () => {
  const input = { images: [image], chapterId: 'ch3', consent: true };
  for (const fetchImpl of [async () => { throw new Error('secret-provider-message'); }, async () => ({ ok: false, status: 401 }), async () => response({ questions: [] }), async () => response({ questions: [{ ...question, stem: '' }] }), async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'broken json' } }] }) })]) {
    await assert.rejects(recognizeAssignmentPhotos(input, { env, fetchImpl }), e => e.status === 502 && !e.message.includes('secret-provider'));
  }
});

function setup() {
  const db = openDatabase(':memory:'); migrate(db);
  const teacher = createUser(db, { username: 'photo-teacher', role: 'teacher', displayName: '教师', passwordHash: 'unused' });
  const other = createUser(db, { username: 'photo-other', role: 'teacher', displayName: '其他教师', passwordHash: 'unused' });
  const classId = createClass(db, teacher.id, '拍照作业班').id;
  const foreignClass = createClass(db, other.id, '其他班').id;
  const assignments = createAssignmentService({ db, repository: createAssignmentRepository(db) });
  const bank = createQuestionBankService({ db, assignmentService: assignments, env: {} });
  const service = createAssignmentPhotoService({ db, assignments, bank });
  return { db, teacherId: teacher.id, otherId: other.id, classId, foreignClass, assignments, bank, service };
}

test('save supports bank only, homework only and both; homework stays draft and retries are idempotent', () => {
  const s = setup();
  try {
    for (const destination of ['bank', 'assignment', 'both']) {
      const input = { batchId: 'photo-' + destination, destination, classId: s.classId, title: '照片作业', questions: [question] };
      const result = s.service.save(s.teacherId, input);
      assert.equal(result.bankCount, destination === 'assignment' ? 0 : 1);
      if (destination !== 'bank') {
        const detail = s.assignments.getTeacherAssignmentDetail({ teacherId: s.teacherId, assignmentId: result.assignmentId });
        assert.equal(detail.status, 'draft');
        assert.equal(detail.questions.length, 1);
        assert.equal(JSON.parse(detail.questions[0].answer_json), question.answer);
        assert.equal(detail.questions[0].explanation, question.analysis);
      } else assert.equal(result.assignmentId, null);
      assert.deepEqual(s.service.save(s.teacherId, input), result);
      assert.throws(() => s.service.save(s.teacherId, { ...input, questions: [{ ...question, stem: '修改后的题目' }] }), e => e.status === 409);
    }
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM assignments').get().n, 2);
    assert.equal(s.bank.list({ teacherId: s.teacherId }).questions.length, 2);
  } finally { s.db.close(); }
});

test('save validates all selected questions and ownership atomically, supports an existing own draft only', () => {
  const s = setup();
  try {
    const input = { batchId: 'photo-atomic', destination: 'both', classId: s.classId, title: '核对作业', questions: [question, { ...question, answer: '' }] };
    assert.throws(() => s.service.save(s.teacherId, input), e => e.status === 400);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM assignments').get().n, 0);
    assert.equal(s.bank.list({ teacherId: s.teacherId }).questions.length, 0);
    assert.throws(() => s.service.save(s.teacherId, { ...input, classId: s.foreignClass, questions: [question] }), e => e.status === 404);
    const draft = s.assignments.createAssignment({ teacherId: s.teacherId, classId: s.classId, title: '已有草稿' });
    const valid = { ...input, questions: [question], assignmentId: draft.id };
    assert.throws(() => s.service.save(s.otherId, valid), e => e.status === 404);
    s.service.save(s.teacherId, valid);
    assert.equal(s.assignments.getTeacherAssignmentDetail({ teacherId: s.teacherId, assignmentId: draft.id }).questions.length, 1);
    s.assignments.publishAssignment({ teacherId: s.teacherId, assignmentId: draft.id });
    assert.throws(() => s.service.save(s.teacherId, { ...valid, batchId: 'published-photo' }), e => e.status === 400);
    assert.equal(s.bank.list({ teacherId: s.teacherId }).questions.length, 1);
  } finally { s.db.close(); }
});

test('AI answers can be saved without teacher confirmation and keep their source in both libraries', () => {
  const s = setup();
  try {
    const input = { batchId: 'photo-ai-optional', destination: 'both', classId: s.classId, title: '书本习题', questions: [{ ...question, answerSource: 'ai', teacherConfirmed: false }] };
    const result = s.service.save(s.teacherId, input);
    const detail = s.assignments.getTeacherAssignmentDetail({ teacherId: s.teacherId, assignmentId: result.assignmentId });
    assert.match(detail.questions[0].explanation, /AI 生成.*未人工确认/);
    assert.match(s.bank.list({ teacherId: s.teacherId }).questions[0].analysis, /AI 生成.*未人工确认/);
    s.service.save(s.teacherId, { ...input, batchId: 'photo-ai-confirmed', questions: [{ ...question, answerSource: 'ai', teacherConfirmed: true }] });
    assert.match(s.bank.list({ teacherId: s.teacherId }).questions[0].analysis, /已由教师确认/);
  } finally { s.db.close(); }
});

test('photo routes enforce roles, accept image bodies above 1MB and keep recognition separate from saving', async () => {
  const s = setup();
  const passwordHash = await hashPassword('PhotoTest123!');
  s.db.prepare('UPDATE users SET password_hash=?').run(passwordHash);
  createUser(s.db, { username: 'photo-student', role: 'student', displayName: '学生', passwordHash });
  let calls = 0;
  const app = createApp({ db: s.db, serveStatic: false, logger: () => {}, assignmentPhotoOptions: { env, fetchImpl: async () => { calls++; return response({ questions: [{ ...question, answerSource: 'ai' }] }); } } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, body, cookie) {
    const res = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
  }
  try {
    const teacher = (await request('/api/auth/login', { username: 'photo-teacher', password: 'PhotoTest123!' })).cookie;
    const student = (await request('/api/auth/login', { username: 'photo-student', password: 'PhotoTest123!' })).cookie;
    const endpoint = '/api/teacher/assignment-photos';
    assert.equal((await request(endpoint + '/capabilities')).status, 401);
    assert.equal((await request(endpoint + '/capabilities', null, student)).status, 403);
    assert.equal((await request(endpoint + '/capabilities', null, teacher)).data.imageAi, true);
    const bytes = Buffer.alloc(900000); Buffer.from(image.split(',')[1], 'base64').copy(bytes);
    const input = { chapterId: 'ch3', consent: true, images: ['data:image/png;base64,' + bytes.toString('base64')] };
    assert.equal((await request(endpoint + '/recognize', input, student)).status, 403);
    const recognized = await request(endpoint + '/recognize', input, teacher);
    assert.equal(recognized.status, 200);
    assert.equal(calls, 1);
    assert.equal(recognized.data.questions[0].teacherConfirmed, false);
    assert.equal(s.bank.list({ teacherId: s.teacherId }).questions.length, 0);
    const saved = await request(endpoint + '/save', { batchId: 'photo-routes-test', destination: 'both', classId: s.classId, title: 'AI 解答作业', questions: recognized.data.questions }, teacher);
    assert.equal(saved.status, 200);
    assert.equal(saved.data.bankCount, 1);
    assert.equal(s.assignments.getTeacherAssignmentDetail({ teacherId: s.teacherId, assignmentId: saved.data.assignmentId }).status, 'draft');
    // Fifty long Chinese multiple-choice questions may legitimately exceed the global 1MB parser.
    const longOptions = Array.from({ length: 8 }, (_, i) => String(i) + '选'.repeat(499));
    const longQuestion = { ...question, stem: '题'.repeat(2000), options: longOptions, answer: longOptions[0], analysis: '解'.repeat(2000) };
    const large = { batchId: 'photo-long-questions', destination: 'bank', questions: Array(50).fill(longQuestion) };
    assert.ok(Buffer.byteLength(JSON.stringify(large)) > 1024 * 1024);
    const largeSaved = await request(endpoint + '/save', large, teacher);
    assert.equal(largeSaved.status, 200);
    assert.equal(largeSaved.data.bankCount, 50);
  } finally { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); s.db.close(); }
});
