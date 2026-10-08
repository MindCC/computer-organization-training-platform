/**
 * 账号头像目录与校验（前后端共享）。
 * profile.avatar 的取值：
 *   - undefined / null：默认头像（前端回退到内置默认图）
 *   - "preset:<id>"：内置预设头像（public/avatars/<id>.svg）
 *   - "data:image/(png|jpeg|webp);base64,..."：用户上传并压缩后的自定义头像
 */

export const AVATAR_PRESETS = Object.freeze([
  { id: 'chip-teal', label: '小芯·青' },
  { id: 'chip-blue', label: '小芯·蓝' },
  { id: 'chip-violet', label: '小芯·紫' },
  { id: 'chip-amber', label: '小芯·橙黄' },
  { id: 'chip-rose', label: '小芯·玫红' },
  { id: 'chip-green', label: '小芯·青绿' },
  { id: 'chip-slate', label: '小芯·岩灰' },
  { id: 'chip-orange', label: '小芯·亮橙' },
]);

const PRESET_IDS = new Set(AVATAR_PRESETS.map((preset) => preset.id));

/** 自定义头像 data URL 长度上限（约 90KB 的 base64 载荷）。 */
export const CUSTOM_AVATAR_MAX_LENGTH = 120_000;
/** 上传原图大小上限（客户端会先压缩到 128×128 WebP）。 */
export const CUSTOM_AVATAR_SOURCE_MAX_BYTES = 2_000_000;
/** 客户端压缩后的头像边长。 */
export const CUSTOM_AVATAR_SIZE = 128;

const DATA_URL_PATTERN = /^data:image\/(png|jpeg|webp);base64,((?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?)$/i;

// Lightweight shared format check; the server additionally decodes every pixel.
export function customAvatarBytes(value) {
  if (typeof value !== 'string' || value.length > CUSTOM_AVATAR_MAX_LENGTH) return null;
  const match = DATA_URL_PATTERN.exec(value);
  if (!match || !match[2]) return null;
  let bytes;
  try { bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0)); } catch { return null; }
  const starts = signature => signature.every((b, i) => bytes[i] === b);
  const type = match[1].toLowerCase();
  const valid = type === 'png'
    ? bytes.length >= 33 && starts([137, 80, 78, 71, 13, 10, 26, 10])
    : type === 'jpeg'
      ? bytes.length >= 4 && starts([255, 216, 255]) && bytes.at(-2) === 255 && bytes.at(-1) === 217
      : bytes.length >= 20 && starts([82, 73, 70, 70]) && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80;
  return valid ? { type, bytes } : null;
}

export function presetAvatarSrc(id) {
  return `/avatars/${id}.svg`;
}

/**
 * 校验一个待保存的头像值。null / 空字符串表示恢复默认头像。
 * @returns {{ok:true, value:(string|null)}|{ok:false, error:string}}
 */
export function validateAvatarValue(input) {
  if (input === null || input === '') return { ok: true, value: null };
  if (typeof input !== 'string') return { ok: false, error: '头像格式不正确' };
  if (input.startsWith('preset:')) {
    return PRESET_IDS.has(input.slice('preset:'.length))
      ? { ok: true, value: input }
      : { ok: false, error: '请选择有效的预设头像' };
  }
  if (input.startsWith('data:')) {
    if (input.length > CUSTOM_AVATAR_MAX_LENGTH) return { ok: false, error: '自定义头像不能超过 90KB，请换一张更小的图片' };
    if (!customAvatarBytes(input)) return { ok: false, error: '自定义头像须为有效的 PNG、JPG 或 WebP 图片' };
    return { ok: true, value: input };
  }
  return { ok: false, error: '头像格式不正确' };
}

/** 把 profile.avatar 解析成 <img> 可用的地址；无效或默认值返回 null（调用方回退默认图）。 */
export function resolveAvatarSrc(profile) {
  const value = profile?.avatar;
  if (typeof value !== 'string' || !value) return null;
  if (value.startsWith('preset:')) {
    const id = value.slice('preset:'.length);
    return PRESET_IDS.has(id) ? presetAvatarSrc(id) : null;
  }
  return validateAvatarValue(value).ok ? value : null;
}
