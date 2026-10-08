import crypto from 'node:crypto';
import { hashPassword } from './auth.js';
import { addStudentToClass, createClass, createUser, getUserByUsername, sanitizeUser } from './db.js';

/** The two one-click demonstration identities share one classroom. */
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
  const className = '计算机组成原理1班';
  let classroom = db.prepare('SELECT * FROM classes WHERE teacher_id = ? AND name = ?').get(teacher.id, className);
  if (!classroom) {
    classroom = db.prepare('SELECT * FROM classes WHERE teacher_id = ? AND name = ?').get(teacher.id, '芯游记 · 演示教学班');
    if (classroom) {
      db.prepare('UPDATE classes SET name = ? WHERE id = ?').run(className, classroom.id);
      classroom = { ...classroom, name: className };
    } else {
      classroom = createClass(db, teacher.id, className);
    }
  }
  // Only remove classmates from the retired synthetic seed. Keep intentionally
  // provisioned student accounts in this shared teaching class across logins.
  const members = db.prepare(`SELECT u.id, u.username, u.display_name, u.profile_json
    FROM class_members cm JOIN users u ON u.id = cm.student_id
    WHERE cm.class_id = ? AND u.id <> ?`).all(classroom.id, student.id);
  for (const member of members) {
    const match = /^demo2026(\d{3})$/.exec(member.username);
    const index = match ? Number(match[1]) : 0;
    if (index >= 1 && index <= 40 && member.display_name === `演示学生${index}`
      && sanitizeUser(member).profile?.seeded === true) {
      db.prepare('DELETE FROM class_members WHERE class_id = ? AND student_id = ?').run(classroom.id, member.id);
    }
  }
  addStudentToClass(db, classroom.id, student.id);
  return { teacher, student, classroom };
}

export function isDemoLoginEnabled(options = {}, env = process.env) {
  if (typeof options.demoLoginEnabled === 'boolean') return options.demoLoginEnabled;
  if (env.ENABLE_DEMO_LOGIN !== undefined) return ['1', 'true'].includes(env.ENABLE_DEMO_LOGIN.toLowerCase());
  return env.NODE_ENV !== 'production';
}

/**
 * 演示账号（demo-teacher / demo-student）是只读身份。
 * 数据库行（profile_json 字符串）与 sanitizeUser 结果（profile 对象）都接受。
 */
export function isDemoAccount(user) {
  if (!user) return false;
  try {
    const profile = typeof user.profile_json === 'string'
      ? JSON.parse(user.profile_json || '{}')
      : (user.profile ?? {});
    return profile?.demoAccount === true;
  } catch {
    return false;
  }
}

// 只读守卫：登录、退出与一切读取放行；其余写操作统一 403 并写审计日志。
// 这样演示环境可以安全开放浏览，真实教学数据不会被演示操作改动。
const DEMO_WRITE_ALLOWLIST = new Set(['/api/auth/login', '/api/auth/logout', '/api/auth/demo-login']);
export function createDemoReadOnlyGuard({ audit } = {}) {
  return (req, res, next) => {
    if (!isDemoAccount(req.user)) return next();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (DEMO_WRITE_ALLOWLIST.has(req.path)) return next();
    audit?.(req, 'demo_readonly_blocked', {
      targetType: 'route',
      targetId: `${req.method} ${req.path}`,
      metadata: { method: req.method },
    });
    res.status(403).json({
      error: { code: 'DEMO_READ_ONLY', message: '演示账号为只读账号，数据仅供浏览，不能修改。' },
    });
  };
}
