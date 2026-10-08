import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { openDatabase, migrate, createUser } from './db.js';
import { hashPassword } from './auth.js';
import * as repo from './photoMistakeRepository.js';
import { normalizeDraftQuestion } from './photoMistakes.js';
import { createKnowledgeRepository } from './knowledgeRepository.js';

test('真实 HTTP：学生与教师能找回自己的草稿、保存 JSON 并归档，隔离他人及已归档导入', async () => {
  const db = openDatabase(':memory:'); migrate(db);
  const password = 'PhotoRoute123!';
  const passwordHash = await hashPassword(password);
  const owners = ['student', 'teacher'].map(role => createUser(db, { username: `photo-route-${role}`, role, displayName: role, passwordHash }));
  const imports = owners.map(owner => {
    const row = repo.createImport(db, { studentId: owner.id, clientSubmissionId: 'route-draft', images: [], provider: 'test' });
    repo.replaceImportMistakes(db, { studentId: owner.id, importId: row.id,
      questions: [normalizeDraftQuestion({ stem: '识别草稿', chapterId: 'ch2', qtype: 'fill' })] });
    return row;
  });
  const server = createApp({ db, serveStatic: false }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/student/photo-imports`)).status, 401);
    for (const [index, owner] of owners.entries()) {
      const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: owner.username, role: owner.role, password }) });
      assert.equal(login.status, 200);
      const headers = { cookie: login.headers.get('set-cookie').split(';')[0], 'content-type': 'application/json' };
      const path = `${base}/api/${owner.role}/photo-imports`;
      const listed = await fetch(path, { headers });
      assert.equal(listed.status, 200);
      assert.match(listed.headers.get('cache-control'), /no-store/);
      const drafts = (await listed.json()).imports;
      assert.deepEqual(drafts.map(row => row.id), [imports[index].id]);
      assert.equal(drafts[0].questionCount, 1);
      assert.equal(JSON.stringify(drafts).includes('images_json'), false);
      const foreign = imports[1 - index].id;
      assert.equal((await fetch(`${path}/${foreign}`, { headers })).status, 404);
      const id = imports[index].id;
      const saved = await fetch(`${path}/${id}/questions`, { method: 'PUT', headers,
        body: JSON.stringify({ questions: [{ stem: '核对后的题干', chapterId: 'ch2', qtype: 'fill' }] }) });
      assert.equal(saved.status, 200, JSON.stringify(await saved.clone().json()));
      assert.equal((await saved.json()).questions[0].stem, '核对后的题干');
      const malformed = await fetch(`${path}/${id}/questions`, { method: 'PUT', headers, body: '{' });
      assert.equal(malformed.status, 400);
      assert.equal((await fetch(`${path}/${id}/archive`, { method: 'POST', headers, body: '{}' })).status, 200);
      assert.deepEqual((await (await fetch(path, { headers })).json()).imports, []);
      const mistake = repo.listImportMistakes(db, id)[0];
      createKnowledgeRepository(db).createDocument({ studentId: owner.id, title: '核对后的题目讲义', originalName: '讲义.txt', fileType: 'txt', fileSize: 50,
        analysis: {}, analysisSource: 'local', chunks: [{ index: 0, content: '题目：核对后的题干\n答案：16\n解析：本地资料中的步骤。' }] });
      const explained = await fetch(`${base}/api/${owner.role}/photo-mistakes/${mistake.id}/explain`, { method: 'POST', headers, body: JSON.stringify({ consent: false }) });
      assert.equal(explained.status, 200);
      const answer = await explained.json();
      assert.equal(answer.source, 'knowledge');
      assert.equal(answer.needsAi, false);
      assert.match(answer.explanation.solution, /16/);
    }
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
});
