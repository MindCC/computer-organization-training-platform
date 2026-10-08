import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { hashPassword } from './auth.js';
import { DEMO_TEACHER_PASSWORD, DEMO_TEACHER_USERNAME, ensureDemoAccounts, isReadOnlyUser } from './demoAccounts.js';
import { createClass, createUser, grantClassAccess, listTeacherClasses, migrate, teacherOwnsClass, teacherOwnsClassDirectly } from './db.js';

/** 每个用例一个内存库，避免相互影响。 */
function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

test('只读判定只认 profile.readOnly，不误伤普通教师与学生', () => {
  assert.equal(isReadOnlyUser(null), false);
  assert.equal(isReadOnlyUser({ profile_json: '{}', role: 'teacher' }), false);
  assert.equal(isReadOnlyUser({ profile_json: '{"demoAccount":true}', role: 'teacher' }), false);
  assert.equal(isReadOnlyUser({ profile_json: '{"readOnly":true}', role: 'teacher' }), true);
  assert.equal(isReadOnlyUser({ profile_json: '{"readOnly":false}', role: 'teacher' }), false);
});

test('demo-teacher 变成只读账号，并拿到可用于登录的固定口令', async () => {
  const db = freshDb();
  const { teacher } = await ensureDemoAccounts(db);
  assert.equal(teacher.username, DEMO_TEACHER_USERNAME);
  assert.equal(isReadOnlyUser(teacher), true);
  const stored = db.prepare('SELECT profile_json, password_hash FROM users WHERE username = ?').get(DEMO_TEACHER_USERNAME);
  assert.equal(JSON.parse(stored.profile_json).readOnly, true);
  // 口令确实被设置过（不是一键登录时代的随机口令占位）
  assert.ok(stored.password_hash && stored.password_hash.length > 20);
  assert.equal(DEMO_TEACHER_PASSWORD.length >= 8, true);
  db.close();
});

test('再跑一次不会覆盖管理员改过的口令（幂等）', async () => {
  const db = freshDb();
  await ensureDemoAccounts(db);
  const changed = await hashPassword('ChangedByAdmin1!');
  db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(changed, DEMO_TEACHER_USERNAME);
  await ensureDemoAccounts(db);
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE username = ?').get(DEMO_TEACHER_USERNAME).password_hash, changed);
  db.close();
});

test('演示教师能看见正式教师的班级，但不是属主（因此不能写入）', async () => {
  const db = freshDb();
  const passwordHash = await hashPassword('Teacher123!');
  const formal = createUser(db, { username: 'teacher', displayName: '正式教师', role: 'teacher', passwordHash });
  const formalClass = createClass(db, formal.id, '计组一班');
  const { teacher: demo } = await ensureDemoAccounts(db);

  const visible = listTeacherClasses(db, demo.id).map((row) => row.id);
  assert.ok(visible.includes(formalClass.id), '只读账号应能看到正式教师的班级');
  assert.equal(teacherOwnsClass(db, demo.id, formalClass.id), true, '可访问性成立');
  assert.equal(teacherOwnsClassDirectly(db, demo.id, formalClass.id), false, '只读账号不是属主');
  const ownerRow = listTeacherClasses(db, demo.id).find((row) => row.id === formalClass.id);
  assert.equal(ownerRow.isOwner, 0, '列表里标记为非属主，界面据此隐藏写操作');
  db.close();
});

test('授权不复制数据：正式教师改班级名，只读账号看到的就是新名字', async () => {
  const db = freshDb();
  const passwordHash = await hashPassword('Teacher123!');
  const formal = createUser(db, { username: 'teacher', displayName: '正式教师', role: 'teacher', passwordHash });
  const formalClass = createClass(db, formal.id, '计组一班');
  await ensureDemoAccounts(db);
  db.prepare('UPDATE classes SET name = ? WHERE id = ?').run('计组一班（改）', formalClass.id);
  const demo = db.prepare('SELECT id FROM users WHERE username = ?').get(DEMO_TEACHER_USERNAME);
  assert.equal(listTeacherClasses(db, demo.id).find((row) => row.id === formalClass.id).name, '计组一班（改）');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM classes').get().n, 2, '只有演示班 + 正式班，没有复制出第三份');
  db.close();
});

test('演示教师自己的演示班仍然存在且可见', async () => {
  const db = freshDb();
  const { teacher, classroom } = await ensureDemoAccounts(db);
  assert.equal(classroom.teacher_id, teacher.id);
  assert.ok(listTeacherClasses(db, teacher.id).some((row) => row.id === classroom.id));
  db.close();
});

test('演示班同时授权给正式教师：正式账号看得到演示数据，属主仍是演示账号', async () => {
  const db = freshDb();
  const passwordHash = await hashPassword('Teacher123!');
  const formal = createUser(db, { username: 'teacher', displayName: '正式教师', role: 'teacher', passwordHash });
  const { classroom } = await ensureDemoAccounts(db);
  const visible = listTeacherClasses(db, formal.id).find((row) => row.id === classroom.id);
  assert.ok(visible, '正式教师应能看到演示班（含演示学生与成绩）');
  assert.equal(visible.isOwner, 0, '属主仍是演示账号，正式教师是授权查看');
  assert.equal(teacherOwnsClassDirectly(db, formal.id, classroom.id), false);
  assert.equal(teacherOwnsClass(db, formal.id, classroom.id), true, '正式账号可以打开该班学情');
  db.close();
});

test('重复授权同一个班不会报错（PRIMARY KEY 冲突被忽略）', async () => {
  const db = freshDb();
  const passwordHash = await hashPassword('Teacher123!');
  const formal = createUser(db, { username: 'teacher', displayName: '正式教师', role: 'teacher', passwordHash });
  const formalClass = createClass(db, formal.id, '计组一班');
  const demo = await ensureDemoAccounts(db).then(({ teacher }) => teacher);
  const demoClass = db.prepare('SELECT id FROM classes WHERE teacher_id = ?').get(demo.id);
  assert.doesNotThrow(() => { grantClassAccess(db, formalClass.id, demo.id); grantClassAccess(db, formalClass.id, demo.id); });
  // 双向授权各一条：正式班 → 只读演示账号；演示班 → 正式账号
  const grants = db.prepare('SELECT class_id, teacher_id FROM class_teacher_access ORDER BY class_id, teacher_id').all();
  assert.deepEqual(grants, [
    { class_id: formalClass.id, teacher_id: demo.id },
    { class_id: demoClass.id, teacher_id: formal.id },
  ]);
  db.close();
});
