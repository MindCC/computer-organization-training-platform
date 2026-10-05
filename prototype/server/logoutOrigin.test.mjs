import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { createUser, openDatabase } from './db.js';
import { hashPassword } from './auth.js';
import { resolvePublicBaseUrl } from './runtimeConfig.js';

test('direct local preview logs out and revokes the session while rejecting cross-site logout', async () => {
  const db = openDatabase(':memory:');
  const app = createApp({ db, serveStatic: false, publicBaseUrl: resolvePublicBaseUrl({ NODE_ENV: 'development' }), logger: () => {} });
  createUser(db, { username: 'logout-test', displayName: '退出测试', role: 'student', passwordHash: await hashPassword('Test123!') });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { origin: baseUrl, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'logout-test', password: 'Test123!' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const rejected = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { cookie, origin: 'https://attacker.example' } });
    assert.equal(rejected.status, 403);
    assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie } })).status, 200);
    const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { cookie, origin: baseUrl } });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie } })).status, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
});
