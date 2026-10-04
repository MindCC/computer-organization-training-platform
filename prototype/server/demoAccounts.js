import crypto from 'node:crypto';
import { hashPassword } from './auth.js';
import { addStudentToClass, createClass, createUser, getUserByUsername, sanitizeUser } from './db.js';

/** Demonstration accounts own only their demonstration classroom. */
export async function ensureDemoAccounts(db) {
  async function dedicated(username, role, displayName) {
    const existing = getUserByUsername(db, username);
    if (existing) {
      if (existing.role !== role || existing.status !== 'active' || sanitizeUser(existing).profile?.demoAccount !== true) {
        throw Object.assign(new Error('演示账号名称已被其他账号使用，请联系维护人员'), { status: 409 });
      }
      return existing;
    }
    const passwordHash = await hashPassword(crypto.randomBytes(32).toString('base64url'));
    const raced = getUserByUsername(db, username);
    if (raced) return dedicated(username, role, displayName);
    return createUser(db, { username, role, displayName, passwordHash, profile: { demoAccount: true, mode: '适中提示模式' } });
  }
  const teacher = await dedicated('demo-teacher', 'teacher', '演示教师');
  const legacy = getUserByUsername(db, 'demo2026001');
  const isLegacyDemo = legacy?.role === 'student' && legacy.status === 'active' && legacy.display_name === '演示学生1' && sanitizeUser(legacy).profile?.seeded === true;
  const student = isLegacyDemo ? legacy : await dedicated('demo-student', 'student', '演示学生');
  let classroom = db.prepare('SELECT * FROM classes WHERE teacher_id = ? AND name = ?').get(teacher.id, '芯游记 · 演示教学班');
  if (!classroom) classroom = createClass(db, teacher.id, '芯游记 · 演示教学班');
  addStudentToClass(db, classroom.id, student.id);
  // Existing seeded records are reused without changing a grade or moving a student.
  for (let index = 2; index <= 40; index += 1) {
    const demo = getUserByUsername(db, `demo2026${String(index).padStart(3, '0')}`);
    if (demo?.role === 'student' && demo.status === 'active' && demo.display_name === `演示学生${index}` && sanitizeUser(demo).profile?.seeded === true) addStudentToClass(db, classroom.id, demo.id);
  }
  return { teacher, student, classroom };
}

export function isDemoLoginEnabled(options = {}, env = process.env) {
  if (typeof options.demoLoginEnabled === 'boolean') return options.demoLoginEnabled;
  if (env.ENABLE_DEMO_LOGIN !== undefined) return ['1', 'true'].includes(env.ENABLE_DEMO_LOGIN.toLowerCase());
  return env.NODE_ENV !== 'production';
}
