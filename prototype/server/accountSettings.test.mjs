import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { hashPassword } from './auth.js';
import { createUser, migrate, openDatabase } from './db.js';

test('one settings request saves profile and optional password atomically for student and teacher', async () => {
  const db = openDatabase(':memory:');
  migrate(db);
  for (const role of ['student', 'teacher']) {
    createUser(db, { username: role, displayName: `${role}原名`, role, passwordHash: await hashPassword('Original123!') });
  }
  const server = createApp({ db, serveStatic: false, logger: () => {} }).listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const send = async (path, method, body, cookie = '') => {
    const response = await fetch(`${baseUrl}${path}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], body: await response.json() };
  };
  try {
    for (const role of ['student', 'teacher']) {
      const login = await send('/api/auth/login', 'POST', { username: role, password: 'Original123!' });
      assert.equal(login.status, 200);
      const cookie = login.cookie;
      const mode = role === 'student' ? { mode: '挑战模式' } : {};
      const invalid = await send('/api/auth/settings', 'PUT', { displayName: `${role}新名`, ...mode, currentPassword: 'incorrect', nextPassword: 'Changed123!' }, cookie);
      assert.equal(invalid.status, 400);
      const unchanged = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie } }).then(response => response.json());
      assert.equal(unchanged.user.displayName, `${role}原名`);

      const saved = await send('/api/auth/settings', 'PUT', { displayName: `${role}新名`, ...mode, currentPassword: 'Original123!', nextPassword: 'Changed123!' }, cookie);
      assert.equal(saved.status, 200);
      assert.equal(saved.body.user.displayName, `${role}新名`);
      assert.equal(saved.body.passwordChanged, true);
      if (role === 'student') assert.equal(saved.body.user.profile.mode, '挑战模式');
      assert.equal((await send('/api/auth/login', 'POST', { username: role, password: 'Original123!' })).status, 401);
      assert.equal((await send('/api/auth/login', 'POST', { username: role, password: 'Changed123!' })).status, 200);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
});
