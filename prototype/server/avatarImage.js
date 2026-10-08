import sharp from 'sharp';
import { customAvatarBytes, CUSTOM_AVATAR_SIZE } from '../src/avatarCatalog.js';

/** Validate raster content without altering the value the user just previewed. */
export async function validateAvatarImage(value) {
  if (value === undefined || value === null || value.startsWith('preset:')) return { ok: true };
  const data = customAvatarBytes(value);
  if (!data) return { ok: false, error: '头像图片格式或内容不正确' };
  try {
    const image = sharp(data.bytes, { failOn: 'warning', limitInputPixels: CUSTOM_AVATAR_SIZE ** 2 });
    const info = await image.metadata();
    if (info.format !== data.type || (info.pages ?? 1) !== 1) return { ok: false, error: '头像须为格式一致的静态 PNG、JPG 或 WebP 图片' };
    if (!info.width || !info.height || info.width > CUSTOM_AVATAR_SIZE || info.height > CUSTOM_AVATAR_SIZE) return { ok: false, error: `头像尺寸不能超过 ${CUSTOM_AVATAR_SIZE}×${CUSTOM_AVATAR_SIZE}，请通过上传图片重新选择` };
    // Metadata alone accepts truncated files. Force full decoding before any account writes.
    await image.raw().toBuffer();
    return { ok: true };
  } catch { return { ok: false, error: '头像图片已损坏或尺寸超限，请重新上传' }; }
}
