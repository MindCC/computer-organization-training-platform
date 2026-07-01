import test from "node:test";
import assert from "node:assert/strict";

import { readDeepSeekConfig } from "./aiClient.js";

test("readDeepSeekConfig disables AI when key is missing", () => {
  const config = readDeepSeekConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.baseUrl, "https://api.deepseek.com");
  assert.equal(config.model, "deepseek-v4-flash");
  assert.equal(config.timeoutMs, 15000);
});

test("readDeepSeekConfig reads DeepSeek env overrides", () => {
  const config = readDeepSeekConfig({
    DEEPSEEK_API_KEY: "sk-test",
    DEEPSEEK_BASE_URL: "https://example.test",
    DEEPSEEK_MODEL: "deepseek-v4-pro",
    AI_REQUEST_TIMEOUT_MS: "3000",
  });
  assert.equal(config.enabled, true);
  assert.equal(config.apiKey, "sk-test");
  assert.equal(config.baseUrl, "https://example.test");
  assert.equal(config.model, "deepseek-v4-pro");
  assert.equal(config.timeoutMs, 3000);
});
