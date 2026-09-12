/**
 * 记住本标签页当前停留的页面，刷新后回到原处。
 *
 * 用 sessionStorage 而不是 localStorage：机房电脑常被多人共用，
 * sessionStorage 随标签页关闭即失效，不会把上一位学生的页面带给下一位。
 */
const STORAGE_KEY = "zcyl:view-session";

const STUDENT_VIEWS = new Set([
  "home", "lab", "hardware-game", "records", "mistakes", "notes", "assignments", "projects", "courseware",
]);
// 教师的首页就是「教师看板」：不把 home 当作可恢复视图，
// 否则登录态切换过程中的中间值会把教师带到学生首页。
const TEACHER_VIEWS = new Set(["teacher", "courseware"]);
const GUEST_VIEWS = new Set(["home", "courseware"]);

const CHALLENGE_ID_PATTERN = /^[a-z0-9-]{1,64}$/;

export function readViewSession(storage = globalThis.sessionStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.view !== "string") return null;
    const challengeId = typeof parsed.challengeId === "string" && CHALLENGE_ID_PATTERN.test(parsed.challengeId)
      ? parsed.challengeId
      : null;
    return { view: parsed.view, challengeId };
  } catch {
    return null;
  }
}

export function writeViewSession(session, storage = globalThis.sessionStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ view: session?.view ?? "home", challengeId: session?.challengeId ?? null }));
  } catch {
    // 隐私模式或配额不足时静默降级为“不记忆”
  }
}

export function clearViewSession(storage = globalThis.sessionStorage) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // 忽略：清理失败不影响主流程
  }
}

/** 只恢复该角色允许停留的页面，避免用上一个身份的记录把用户带到无权限视图。 */
export function resolveRestorableView(session, role) {
  if (!session?.view) return null;
  const allowed = role === "teacher" ? TEACHER_VIEWS : role === "student" ? STUDENT_VIEWS : GUEST_VIEWS;
  return allowed.has(session.view) ? session : null;
}
