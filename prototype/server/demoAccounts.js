import crypto from 'node:crypto';
import { hashPassword } from './auth.js';
import { addStudentToClass, createClass, createUser, getUserByUsername, grantClassAccess, sanitizeUser, updateUserPassword, updateUserProfile } from './db.js';

/**
 * 只读演示教师的固定密码。
 *
 * 2026-10-07 用户要求：教师取消一键登录、改用账号密码登录；演示教师改成只读。
 * 一键登录时代的演示账号是随机密码（无口令可用），教师入口取消后必须有一个
 * 可用于演示的已知口令，因此这里固定下来。这不是保密凭据（它只能看、不能改），
 * 但仍应保持可预期，便于课堂投屏与验收脚本使用。
 */
export const DEMO_TEACHER_USERNAME = 'demo-teacher';
export const DEMO_TEACHER_PASSWORD = 'Demo123!';

/** 只读账号：服务端对非 GET 请求一律拒绝（见 app.js 的全局只读闸门）。 */
export function isReadOnlyUser(user) {
  if (!user) return false;
  return sanitizeUser(user).profile?.readOnly === true;
}

/** The two one-click demonstration identities share one classroom. */
export async function ensureDemoAccounts(db) {
  async function dedicated(username, role, displayName, profile = {}) {
    const existing = getUserByUsername(db, username);
    if (existing) {
      if (existing.role !== role || existing.status !== 'active') {
        throw Object.assign(new Error('演示账号名称已被其他账号使用，请联系维护人员'), { status: 409 });
      }
      return existing;
    }
    const passwordHash = await hashPassword(crypto.randomBytes(32).toString('base64url'));
    const raced = getUserByUsername(db, username);
    if (raced) return dedicated(username, role, displayName, profile);
    return createUser(db, { username, role, displayName, passwordHash, profile: { demoAccount: true, mode: '适中提示模式', ...profile } });
  }
  // 演示教师 = 只能看的账号：看正式教师名下的同一份班级数据，但服务端拒绝它的一切写入。
  const teacher = await dedicated(DEMO_TEACHER_USERNAME, 'teacher', '演示教师', { readOnly: true });
  if (!isReadOnlyUser(teacher) || process.env.FORCE_REFRESH_DEMO === '1') {
    // 老库里已有 demo-teacher（随机密码、可写）：升级为只读并给出已知口令。
    // 口令只在这次升级时写入；之后管理员改过的密码不会再被启动流程覆盖
    // （需要一次性重设时用 FORCE_REFRESH_DEMO=1 跑一次）。
    updateUserProfile(db, teacher.id, { displayName: teacher.display_name, profile: { ...sanitizeUser(teacher).profile, demoAccount: true, readOnly: true } });
    updateUserPassword(db, teacher.id, await hashPassword(DEMO_TEACHER_PASSWORD));
  }
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
  // 只读演示教师看到的不是自己复制的一份数据，而是正式教师名下的真实班级：
  // 把每个正式教师拥有的班级登记为可访问（属主不变，写入仍被只读闸门拦住）。
  const formalTeachers = db.prepare("SELECT id FROM users WHERE role = 'teacher' AND id <> ? AND status = 'active'").all(teacher.id);
  const allClasses = db.prepare('SELECT id, teacher_id FROM classes').all();
  for (const owner of formalTeachers) {
    for (const row of allClasses) {
      if (row.teacher_id === owner.id) grantClassAccess(db, row.id, teacher.id);
    }
  }
  // 反向也要通：演示教师名下的**每一个**演示班（含演示学生与既往成绩）同样授权给正式教师，
  // 这样正式账号里也能看到这份演示数据，且不改变属主、不复制数据。
  // 必须遍历全部演示班而不是只处理 classroom：新增的演示班（如「计算机组成原理2班」）
  // 也要在服务启动时自动获得同一组授权。
  const demoClasses = db.prepare('SELECT id FROM classes WHERE teacher_id = ?').all(teacher.id);
  for (const owner of formalTeachers) {
    for (const row of demoClasses) grantClassAccess(db, row.id, owner.id);
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
