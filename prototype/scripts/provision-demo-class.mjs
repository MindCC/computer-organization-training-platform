import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase, getUserByUsername, createUser, addStudentToClass } from '../server/db.js';
import { hashPassword, verifyPassword } from '../server/auth.js';
import { ensureDemoAccounts } from '../server/demoAccounts.js';

const databasePath = path.resolve(process.env.DATABASE_PATH ?? 'data/classroom.sqlite');
const db = openDatabase(databasePath);

try {
  const teacher = getUserByUsername(db, 'demo-teacher');
  const demoStudent = getUserByUsername(db, 'demo-student');
  assert(teacher?.role === 'teacher' && JSON.parse(teacher.profile_json).demoAccount === true);
  assert(demoStudent?.role === 'student');

  const sharedClasses = db.prepare(`SELECT c.id, c.name FROM classes c
    JOIN class_members cm ON cm.class_id = c.id
    WHERE c.teacher_id = ? AND cm.student_id = ?
      AND c.name IN ('芯游记 · 演示教学班', '计算机组成原理1班')`).all(teacher.id, demoStudent.id);
  assert.equal(sharedClasses.length, 1, 'expected one shared demonstration class');

  const students = Array.from({ length: 30 }, (_, index) => ({
    username: String(2026001 + index),
    displayName: `学生${String(index + 1).padStart(2, '0')}`,
  }));
  for (const student of students) {
    assert.equal(getUserByUsername(db, student.username), undefined, `username occupied: ${student.username}`);
  }

  const backupDirectory = path.resolve('data/backups');
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backupPath = path.join(backupDirectory, `classroom-before-students-${new Date().toISOString().replaceAll(':', '-')}.sqlite`);
  await db.backup(backupPath);

  const prepared = [];
  for (const student of students) prepared.push({ ...student, passwordHash: await hashPassword(student.username) });

  const { classroom } = await ensureDemoAccounts(db);
  assert.equal(classroom.id, sharedClasses[0].id);
  assert.equal(classroom.name, '计算机组成原理1班');

  db.transaction(() => {
    for (const student of prepared) {
      const account = createUser(db, {
        username: student.username,
        displayName: student.displayName,
        role: 'student',
        passwordHash: student.passwordHash,
        profile: { mode: '适中提示模式', mustChangePassword: false },
      });
      addStudentToClass(db, classroom.id, account.id);
    }
  })();

  const roster = db.prepare(`SELECT u.username, u.display_name, u.role, u.password_hash FROM users u
    JOIN class_members cm ON cm.student_id = u.id WHERE cm.class_id = ? ORDER BY u.username`).all(classroom.id);
  assert.equal(roster.length, 31);
  assert(roster.some(account => account.username === demoStudent.username));
  for (const student of students) {
    const account = roster.find(item => item.username === student.username);
    assert(account && account.display_name === student.displayName && account.role === 'student');
    assert.equal(await verifyPassword(student.username, account.password_hash), true);
  }
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);

  console.log(JSON.stringify({ databasePath, backupPath, teacher: teacher.display_name,
    classId: classroom.id, className: classroom.name, created: students.length,
    totalClassStudents: roster.length, first: students[0], last: students.at(-1),
    passwordsVerified: students.length }));
} finally {
  db.close();
}
