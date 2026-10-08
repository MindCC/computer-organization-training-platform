import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG_AVATAR, JPEG_AVATAR, WEBP_AVATAR } from '../scripts/lib/avatarFixtures.mjs';
import {
  AVATAR_PRESETS,
  CUSTOM_AVATAR_MAX_LENGTH,
  presetAvatarSrc,
  resolveAvatarSrc,
  validateAvatarValue,
} from './avatarCatalog.js';

test('preset avatar values validate and resolve to public asset paths', () => {
  assert.ok(AVATAR_PRESETS.length >= 8);
  for (const preset of AVATAR_PRESETS) {
    const value = `preset:${preset.id}`;
    assert.deepEqual(validateAvatarValue(value), { ok: true, value });
    assert.equal(resolveAvatarSrc({ avatar: value }), `/avatars/${preset.id}.svg`);
  }
  assert.equal(presetAvatarSrc('chip-teal'), '/avatars/chip-teal.svg');
});

test('null and empty values reset to the default avatar', () => {
  assert.deepEqual(validateAvatarValue(null), { ok: true, value: null });
  assert.deepEqual(validateAvatarValue(''), { ok: true, value: null });
  assert.equal(resolveAvatarSrc({ avatar: null }), null);
  assert.equal(resolveAvatarSrc({}), null);
  assert.equal(resolveAvatarSrc(undefined), null);
});

test('custom data URLs accept png/jpeg/webp within the size cap', () => {
  for (const value of [PNG_AVATAR, JPEG_AVATAR, WEBP_AVATAR]) {
    assert.deepEqual(validateAvatarValue(value), { ok: true, value });
    assert.equal(resolveAvatarSrc({ avatar: value }), value);
  }
  const oversized = validateAvatarValue(`data:image/webp;base64,${'A'.repeat(CUSTOM_AVATAR_MAX_LENGTH + 1)}`);
  assert.equal(oversized.ok, false); assert.match(oversized.error, /90KB/);
});

test('plain text, disguised formats and invalid base64 never validate or resolve as avatars', () => {
  for (const bad of [
    'data:image/webp;base64,' + Buffer.from('not an image').toString('base64'),
    PNG_AVATAR.replace('image/png', 'image/webp'),
    'data:image/png;base64,====',
    'data:image/png;base64,AAA=A',
  ]) {
    assert.equal(validateAvatarValue(bad).ok, false);
    assert.equal(resolveAvatarSrc({ avatar: bad }), null);
  }
});

test('unknown presets, foreign URLs, svg payloads and junk are rejected and never resolved', () => {
  for (const bad of ['preset:nope', 'https://evil.example/x.png', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:image/gif;base64,R0lGODdh', 'javascript:alert(1)', 42, {}]) {
    assert.equal(validateAvatarValue(bad).ok, false, String(bad));
    assert.equal(resolveAvatarSrc({ avatar: bad }), null, String(bad));
  }
});
