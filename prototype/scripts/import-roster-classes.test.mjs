import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, migrate, createUser, createClass, addStudentToClass, getUserByUsername } from '../server/db.js';
import { hashPassword, verifyPassword } from '../server/auth.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const roster = { classes: [{ className: '名单测试班', students: [{ username: '91001', displayName: '名单学生甲' }, { username: '91002', displayName: '名单学生乙' }] }] };
async function fixture(run) {
  const prefix = path.join(tmpdir(), 'zcyl-roster-import-test-');
  const dir = mkdtempSync(prefix), dbPath = path.join(dir, 'test.sqlite'), input = path.join(dir, 'roster.json');
  const db = openDatabase(dbPath); migrate(db);
  const teacher = createUser(db, { username: 'teacher', displayName: '测试教师', role: 'teacher', passwordHash: await hashPassword('Teacher-Test-123') });
  writeFileSync(input, JSON.stringify(roster));
  const execute = () => spawnSync(process.execPath, ['scripts/import-roster-classes.mjs', input, dbPath], { cwd: root, encoding: 'utf8', windowsHide: true });
  try { await run({ db, teacher, dir, execute }); }
  finally { db.close(); assert(path.resolve(dir).startsWith(path.resolve(prefix))); rmSync(dir, { recursive: true, force: true }); }
}

test('roster CLI creates initial accounts and repeat import preserves edited names/passwords/profiles', async () => fixture(async ({ db, teacher, dir, execute }) => {
  const first = execute(); assert.equal(first.status, 0, first.stderr);
  const classId = db.prepare('SELECT id FROM classes WHERE teacher_id=? AND name=?').get(teacher.id, roster.classes[0].className).id;
  for (const item of roster.classes[0].students) {
    const account = getUserByUsername(db, item.username);
    assert.equal(account.display_name, item.displayName);
    assert(await verifyPassword(item.username, account.password_hash));
    assert.equal(JSON.parse(account.profile_json).mustChangePassword, false);
  }
  assert(readdirSync(path.join(dir, 'backups')).some(name => name.endsWith('.sqlite')));
  const editedPassword = await hashPassword('Changed-Password-123');
  const editedProfile = JSON.stringify({ mode: '挑战模式', mustChangePassword: false, avatar: 'preset:chip-blue' });
  db.prepare("UPDATE users SET display_name='学生自己修改的姓名',password_hash=?,profile_json=? WHERE username='91001'").run(editedPassword, editedProfile);
  const second = execute(); assert.equal(second.status, 0, second.stderr);
  const current = getUserByUsername(db, '91001');
  assert.equal(current.password_hash, editedPassword); assert.equal(current.profile_json, editedProfile);
  assert.equal(current.display_name, '学生自己修改的姓名');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM classes WHERE name=?').get(roster.classes[0].className).n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM class_members WHERE class_id=?').get(classId).n, 2);
}));

test('roster rejects an account from another teacher/class before creating any accounts or memberships', async () => fixture(async ({ db, execute }) => {
  const hash = await hashPassword('91001');
  const other = createUser(db, { username: 'other-teacher', displayName: '其他教师', role: 'teacher', passwordHash: hash });
  const student = createUser(db, { username: '91001', displayName: '名单学生甲', role: 'student', passwordHash: hash, profile: { mustChangePassword: false } });
  const c = createClass(db, other.id, '原班'); addStudentToClass(db, c.id, student.id);
  const result = execute(); assert.notEqual(result.status, 0);
  assert.equal(getUserByUsername(db, '91002'), undefined);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM class_members WHERE student_id=?').get(student.id).n, 1);
  assert.equal(db.prepare('SELECT id FROM classes WHERE name=?').get(roster.classes[0].className), undefined);
}));

test('an unbound existing student with a different identity is rejected without partial writes', async () => fixture(async ({ db, execute }) => {
  createUser(db, { username: '91001', displayName: '另一个人', role: 'student', passwordHash: await hashPassword('91001') });
  const result = execute(); assert.notEqual(result.status, 0);
  assert.equal(getUserByUsername(db, '91002'), undefined);
  assert.equal(db.prepare('SELECT id FROM classes WHERE name=?').get(roster.classes[0].className), undefined);
}));

test('post-write verification failure rolls back newly created classes, students and memberships', async () => fixture(async ({ db, execute }) => {
  db.exec(`CREATE TRIGGER corrupt_import AFTER INSERT ON class_members
    WHEN (SELECT username FROM users WHERE id=NEW.student_id)='91002'
    BEGIN UPDATE users SET display_name='写入异常' WHERE id=NEW.student_id; END;`);
  const result = execute(); assert.notEqual(result.status, 0);
  assert.equal(getUserByUsername(db, '91001'), undefined);
  assert.equal(getUserByUsername(db, '91002'), undefined);
  assert.equal(db.prepare('SELECT id FROM classes WHERE name=?').get(roster.classes[0].className), undefined);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
}));
