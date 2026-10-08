import assert from 'node:assert/strict';
import { addStudentToClass, createClass, createUser, getUserByUsername } from './db.js';
import { hashPassword, verifyPassword } from './auth.js';

function normalizeRoster(roster) {
  assert(Array.isArray(roster?.classes) && roster.classes.length, 'roster.json 需要 classes 数组');
  const classes = new Set(), usernames = new Set();
  return roster.classes.map(group => {
    const className = typeof group.className === 'string' ? group.className.trim() : '';
    assert(className && className.length <= 120 && !/[\u0000-\u001f]/.test(className), '班级名称不正确');
    assert(!classes.has(className), `班级重复: ${className}`); classes.add(className);
    assert(Array.isArray(group.students) && group.students.length, `班级没有学生: ${className}`);
    const students = group.students.map(student => {
      assert(typeof student.username === 'string' && /^\d{1,64}$/.test(student.username), '学号须为不超过 64 位的数字字符串');
      const displayName = typeof student.displayName === 'string' ? student.displayName.trim() : '';
      assert(displayName && displayName.length <= 64 && !/[\u0000-\u001f]/.test(displayName) && !/^[=+\-@]/.test(displayName), `姓名非法: ${student.username}`);
      assert(!usernames.has(student.username), `学号重复: ${student.username}`); usernames.add(student.username);
      return { username: student.username, displayName };
    });
    return { className, students };
  });
}

function inspectExisting(db, teacherId, groups) {
  return groups.map(group => {
    const matches = db.prepare('SELECT * FROM classes WHERE teacher_id=? AND name=?').all(teacherId, group.className);
    assert(matches.length <= 1, `同名班级不唯一: ${group.className}`);
    const classroom = matches[0], existing = new Map();
    for (const student of group.students) {
      const account = getUserByUsername(db, student.username);
      if (!account) continue;
      const member = classroom && db.prepare('SELECT 1 FROM class_members WHERE class_id=? AND student_id=?').get(classroom.id, account.id);
      assert(account.role === 'student' && member, `学号 ${student.username} 已被非目标班账号占用，不能自动入班`);
      existing.set(student.username, account);
    }
    return { ...group, classroom, existing };
  });
}

/** Caller backs up the DB first. Repeated imports preserve self-service profile/password edits. */
export async function importRosterClasses(db, roster) {
  const groups = normalizeRoster(roster);
  const teacher = getUserByUsername(db, 'teacher');
  assert(teacher?.role === 'teacher', '未找到正式教师账号 teacher');
  const initial = inspectExisting(db, teacher.id, groups), prepared = new Map();
  for (const group of initial) for (const student of group.students) {
    if (group.existing.has(student.username)) continue;
    const passwordHash = await hashPassword(student.username);
    assert(await verifyPassword(student.username, passwordHash), '初始密码生成失败');
    prepared.set(student.username, passwordHash);
  }
  // Recheck after asynchronous hashing; hold the write lock through verification.
  return db.transaction(() => {
    assert.equal(getUserByUsername(db, 'teacher')?.id, teacher.id, '正式教师账号已变更');
    const plans = inspectExisting(db, teacher.id, groups);
    const report = { teacher: teacher.username, classes: [] };
    for (const group of plans) {
      const classroom = group.classroom ?? createClass(db, teacher.id, group.className);
      const entry = { classId: classroom.id, className: classroom.name, created: 0, existing: 0, total: 0 };
      const inserted = new Set();
      for (const student of group.students) {
        let account = group.existing.get(student.username);
        if (!account) {
          assert(prepared.has(student.username), `账号状态已变化，请重新运行: ${student.username}`);
          account = createUser(db, { ...student, role: 'student', passwordHash: prepared.get(student.username), profile: { mode: '适中提示模式', mustChangePassword: false } });
          inserted.add(student.username); entry.created++;
        } else entry.existing++;
        addStudentToClass(db, classroom.id, account.id);
      }
      for (const student of group.students) {
        const saved = getUserByUsername(db, student.username);
        assert(saved?.role === 'student', `账号验收失败: ${student.username}`);
        assert(db.prepare('SELECT 1 FROM class_members WHERE class_id=? AND student_id=?').get(classroom.id, saved.id), '入班验收失败');
        if (inserted.has(student.username)) {
          assert.equal(saved.display_name, student.displayName);
          assert.equal(saved.password_hash, prepared.get(student.username));
          assert.deepEqual(JSON.parse(saved.profile_json), { mode: '适中提示模式', mustChangePassword: false });
        } else {
          const original = group.existing.get(student.username);
          for (const key of ['id', 'display_name', 'password_hash', 'profile_json', 'status']) assert.equal(saved[key], original[key], `重复导入不得改动已有账号: ${student.username}`);
        }
      }
      entry.total = db.prepare('SELECT COUNT(*) AS n FROM class_members WHERE class_id=?').get(classroom.id).n;
      report.classes.push(entry);
    }
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [], '外键验收失败');
    return report;
  }).immediate();
}
