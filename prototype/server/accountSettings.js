import { passwordStrength } from '../src/passwordStrength.js';

export const HINT_MODES = Object.freeze(['强引导模式', '适中提示模式', '挑战模式']);
export function validateAccountSettings(payload = {}, role = 'student') {
  const displayName = String(payload.displayName ?? '').trim();
  if (!displayName) return { ok: false, error: '姓名不能为空' };
  if (displayName.length > 64) return { ok: false, error: '姓名不能超过 64 个字符' };
  if (/[\r\n\t\u0000-\u001f]/.test(displayName) || /^[=+\-@]/.test(displayName)) return { ok: false, error: '姓名不能包含控制字符或以 = + - @ 开头' };
  if (role === 'student' && payload.mode !== undefined && !HINT_MODES.includes(payload.mode)) return { ok: false, error: '请选择有效的提示模式' };
  const currentPassword = String(payload.currentPassword ?? '');
  const nextPassword = String(payload.nextPassword ?? '');
  const changePassword = Boolean(currentPassword || nextPassword);
  if (changePassword && !currentPassword) return { ok: false, error: '修改密码时请填写当前密码' };
  if (changePassword && !nextPassword) return { ok: false, error: '修改密码时请填写新密码' };
  if (changePassword && passwordStrength(nextPassword).score === 'weak') return { ok: false, error: '新密码至少 8 位，并包含字母和数字或特殊字符' };
  if (nextPassword.length > 256) return { ok: false, error: '新密码不能超过 256 个字符' };
  return { ok: true, displayName, mode: role === 'student' ? payload.mode : undefined, changePassword, currentPassword, nextPassword };
}
