import test from 'node:test';
import assert from 'node:assert/strict';
import { isDemoLoginEnabled } from './demoAccounts.js';

test('demo login is explicit in production and accepts deployment flag values', () => {
  assert.equal(isDemoLoginEnabled({}, { NODE_ENV: 'production' }), false);
  assert.equal(isDemoLoginEnabled({}, { NODE_ENV: 'production', ENABLE_DEMO_LOGIN: '1' }), true);
  assert.equal(isDemoLoginEnabled({}, { NODE_ENV: 'production', ENABLE_DEMO_LOGIN: 'true' }), true);
  assert.equal(isDemoLoginEnabled({}, { NODE_ENV: 'production', ENABLE_DEMO_LOGIN: '0' }), false);
  assert.equal(isDemoLoginEnabled({ demoLoginEnabled: false }, { ENABLE_DEMO_LOGIN: '1' }), false);
});
