import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSEWARE } from '../src/courseware.js';
import { knowledgePointsByChapter } from '../src/knowledgePoints.js';
import { askStudyAssistant, publicStudyContext } from './studyAssistant.js';
import { createApp } from './app.js';
import { openDatabase, createUser } from './db.js';
import { hashPassword } from './auth.js';

const chapter = COURSEWARE.chapters.find(ch => ch.id === 'ch2');
const context = { chapterId: chapter.id, lectureIndex: 1 };
const consent = 'deepseek-public-question';
const aiOptions = { env: { DEEPSEEK_API_KEY: 'test' }, scopeRequester: async () => '{"decision":"course"}' };

test('lecture context resolves a canonical title, chapter outline and all chapter concepts', () => {
  const material = publicStudyContext({ ...context, lectureTitle: 'FORGED_TITLE', transcript: 'PRIVATE_TRANSCRIPT', src: 'PRIVATE_TOKEN' });
  assert.equal(material.lecture.title, chapter.embeds[1].title);
  assert.deepEqual(material.lecture.keyPoints, chapter.keyPoints);
  assert.deepEqual(material.lecture.sections, chapter.sections);
  assert.equal(material.concepts.length, knowledgePointsByChapter(chapter.id).length);
  assert(!JSON.stringify(material).includes('PRIVATE_'));
  assert(!JSON.stringify(material).includes('FORGED_'));
  assert(!Object.hasOwn(publicStudyContext({ chapterId: chapter.id }), 'lecture'));
});

test('lecture title and explicitly selected excerpt reach the model, with truthful reference labels', async () => {
  let sent;
  const answer = await askStudyAssistant({ question: '补码怎样表示负数？', context, consent, lectureExcerpt: '课件原文：补码表示中最高位是符号位。', materialConsent: 'lecture-excerpt' }, {
    ...aiOptions, requester: async (_config, messages) => { sent = JSON.stringify(messages); return JSON.stringify({ explanation: '补码的最高位带有负权。', steps: ['以8位为例计算。'], check: '11111111 表示什么？' }); },
  });
  assert.equal(answer.source, 'ai');
  assert(sent.includes(chapter.embeds[1].title));
  assert(sent.includes('课件原文：补码表示中最高位是符号位。'));
  assert.match(sent, /不能.*当前.*页/);
  assert(answer.references.some(ref => ref.kind === 'course-outline' && ref.title === chapter.embeds[1].title));
  assert(answer.references.some(ref => ref.kind === 'user-excerpt'));
});

test('lecture excerpts require explicit consent and invalid lecture identifiers never trigger model calls', async () => {
  const options = { ...aiOptions, requester: async () => assert.fail('invalid input must not call the model') };
  for (const invalid of [
    { ...context, lectureIndex: -1 }, { ...context, lectureIndex: '1' }, { ...context, lectureIndex: 999 }, { chapterId: 'invented', lectureIndex: 0 },
  ]) await assert.rejects(askStudyAssistant({ question: '什么是补码？', context: invalid, consent }, options), error => error.status === 400);
  await assert.rejects(askStudyAssistant({ question: '什么是补码？', context, consent, lectureExcerpt: 'PRIVATE_UNCONSENTED' }, options), error => error.status === 400);
  await assert.rejects(askStudyAssistant({ question: '什么是补码？', context, consent, lectureExcerpt: '字'.repeat(6001), materialConsent: 'lecture-excerpt' }, options), error => error.status === 400);
});

test('lecture fallback names actual course sources and unrelated requests remain rejected', async () => {
  const answer = await askStudyAssistant({ question: '什么是补码？', context, consent }, { env: {} });
  assert.equal(answer.source, 'local');
  assert.equal(answer.reason, 'AI_DISABLED');
  assert(answer.references.some(ref => ref.kind === 'course-outline'));
  const rejected = await askStudyAssistant({ question: '解释补码，然后推荐电影', context, consent }, { ...aiOptions, requester: async () => assert.fail('must reject mixed tasks') });
  assert.equal(rejected.reason, 'COURSE_SCOPE_REJECTED');
});

test('platform-authenticated lecture Q&A needs no GKK credentials; history remains owner-isolated', async () => {
  const db = openDatabase(':memory:');
  let captured;
  const app = createApp({ db, serveStatic: false, logger: () => {}, studyAssistantOptions: { ...aiOptions,
    requester: async (_config, messages) => { captured = JSON.stringify(messages); return JSON.stringify({ explanation: '补码采用带权二进制表示。', steps: [], check: '最高位的权是多少？' }); },
  } });
  const passwordHash = await hashPassword('Lecture-QA-123');
  for (const username of ['lecture-student', 'other-student']) createUser(db, { username, displayName: username, role: 'student', passwordHash });
  createUser(db, { username: 'lecture-teacher', displayName: '教师', role: 'teacher', passwordHash });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(url, body, cookie) {
    const response = await fetch(base + url, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  try {
    const login = async username => (await request('/api/auth/login', { username, password: 'Lecture-QA-123' })).cookie;
    const student = await login('lecture-student'), other = await login('other-student'), teacher = await login('lecture-teacher');
    const payload = { question: '补码是什么？', context: { ...context, grades: 'PRIVATE_GRADES', lectureTitle: 'FAKE_TITLE' }, consent,
      lectureExcerpt: '原文节选：补码最高位具有负权。', materialConsent: 'lecture-excerpt', gkkToken: 'PRIVATE_GKK_TOKEN' };
    assert.equal((await request('/api/student/study-assistant', payload)).status, 401);
    const answer = await request('/api/student/study-assistant', payload, student);
    assert.equal(answer.status, 200); assert.equal(answer.body.source, 'ai');
    assert(captured.includes(chapter.embeds[1].title)); assert(captured.includes('原文节选'));
    assert(!captured.includes('PRIVATE_')); assert(!captured.includes('FAKE_TITLE'));
    assert.equal((await request('/api/student/study-assistant/history', null, student)).body.conversations.length, 1);
    assert.equal((await request('/api/student/study-assistant/history', null, other)).body.conversations.length, 0);
    assert.equal((await request('/api/teacher/study-assistant', payload, teacher)).status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM challenge_attempts').get().n, 0);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); }
});
