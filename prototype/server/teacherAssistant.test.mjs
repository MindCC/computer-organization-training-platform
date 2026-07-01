import test from "node:test";
import assert from "node:assert/strict";

import { readDeepSeekConfig, requestChatCompletion } from "./aiClient.js";

test("readDeepSeekConfig disables AI when key is missing", () => {
  const config = readDeepSeekConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.baseUrl, "https://api.deepseek.com");
  assert.equal(config.model, "deepseek-v4-flash");
  assert.equal(config.timeoutMs, 15000);
});

test("readDeepSeekConfig treats whitespace-only API keys as disabled", () => {
  const config = readDeepSeekConfig({
    DEEPSEEK_API_KEY: "   ",
  });
  assert.equal(config.enabled, false);
  assert.equal(config.apiKey, "");
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

test("readDeepSeekConfig falls back to defaults for blank base and model overrides", () => {
  const config = readDeepSeekConfig({
    DEEPSEEK_API_KEY: "sk-test",
    DEEPSEEK_BASE_URL: "   ",
    DEEPSEEK_MODEL: "",
  });
  assert.equal(config.baseUrl, "https://api.deepseek.com");
  assert.equal(config.model, "deepseek-v4-flash");
});

test("requestChatCompletion sends the expected DeepSeek request shape and returns assistant content", async () => {
  const config = readDeepSeekConfig({
    DEEPSEEK_API_KEY: "  sk-test  ",
    DEEPSEEK_BASE_URL: "https://example.test/",
    DEEPSEEK_MODEL: "deepseek-v4-pro",
  });
  const messages = [
    { role: "user", content: "Summarize the submission." },
  ];

  let call = null;
  const content = await requestChatCompletion(config, messages, {
    fetchImpl: async (url, options) => {
      call = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        async json() {
          return {
            choices: [
              { message: { content: "{\"summary\":\"ok\"}" } },
            ],
          };
        },
      };
    },
  });

  assert.equal(content, "{\"summary\":\"ok\"}");
  assert.equal(call.url, "https://example.test/chat/completions");
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.headers["content-type"], "application/json");
  assert.equal(call.options.headers.authorization, "Bearer sk-test");
  assert.deepEqual(call.body, {
    model: "deepseek-v4-pro",
    messages,
    stream: false,
    response_format: { type: "json_object" },
  });
  assert.ok(call.options.signal instanceof AbortSignal);
});

test("requestChatCompletion rejects caller-supplied system messages", async () => {
  const config = readDeepSeekConfig({ DEEPSEEK_API_KEY: "sk-test" });
  let fetchCalls = 0;

  await assert.rejects(
    requestChatCompletion(config, [
      { role: "system", content: "Return JSON only." },
      { role: "user", content: "Hello" },
    ], {
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("should not fetch");
      },
    }),
    (error) => error?.code === "AI_RESPONSE" && /system/i.test(error.message),
  );

  assert.equal(fetchCalls, 0);
});

test("requestChatCompletion injects server-owned system prompt from options", async () => {
  const config = readDeepSeekConfig({ DEEPSEEK_API_KEY: "sk-test" });
  const messages = [
    { role: "user", content: "Hello" },
  ];

  let call = null;
  await requestChatCompletion(config, messages, {
    systemPrompt: "Return JSON only.",
    fetchImpl: async (_url, options) => {
      call = JSON.parse(options.body);
      return {
        ok: true,
        async json() {
          return {
            choices: [
              { message: { content: "{\"ok\":true}" } },
            ],
          };
        },
      };
    },
  });

  assert.deepEqual(call.messages, [
    { role: "system", content: "Return JSON only." },
    { role: "user", content: "Hello" },
  ]);
});

test("requestChatCompletion throws AI_DISABLED when config is disabled", async () => {
  await assert.rejects(
    requestChatCompletion(readDeepSeekConfig({}), [{ role: "user", content: "Hello" }]),
    (error) => error?.code === "AI_DISABLED",
  );
});

test("requestChatCompletion throws AI_HTTP when DeepSeek returns a non-ok response", async () => {
  const config = readDeepSeekConfig({ DEEPSEEK_API_KEY: "sk-test" });

  await assert.rejects(
    requestChatCompletion(config, [{ role: "user", content: "Hello" }], {
      fetchImpl: async () => ({
        ok: false,
        status: 502,
      }),
    }),
    (error) => error?.code === "AI_HTTP" && /502/.test(error.message),
  );
});

test("requestChatCompletion throws AI_TIMEOUT when the request is aborted", async () => {
  const config = readDeepSeekConfig({
    DEEPSEEK_API_KEY: "sk-test",
    AI_REQUEST_TIMEOUT_MS: "10",
  });

  await assert.rejects(
    requestChatCompletion(config, [{ role: "user", content: "Hello" }], {
      fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      }),
    }),
    (error) => error?.code === "AI_TIMEOUT",
  );
});

test("requestChatCompletion throws AI_RESPONSE when DeepSeek returns no assistant content", async () => {
  const config = readDeepSeekConfig({ DEEPSEEK_API_KEY: "sk-test" });

  await assert.rejects(
    requestChatCompletion(config, [{ role: "user", content: "Hello" }], {
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { choices: [{ message: { content: "" } }] };
        },
      }),
    }),
    (error) => error?.code === "AI_RESPONSE",
  );
});

test("requestChatCompletion rejects malformed message arrays before fetch", async () => {
  const config = readDeepSeekConfig({ DEEPSEEK_API_KEY: "sk-test" });
  let fetchCalls = 0;

  await assert.rejects(
    requestChatCompletion(config, [{ role: "user" }], {
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("should not fetch");
      },
    }),
    (error) => error?.code === "AI_RESPONSE" && /message/i.test(error.message),
  );

  assert.equal(fetchCalls, 0);
});

test("requestChatCompletion rejects forbidden sensitive payload content before fetch", async () => {
  const config = readDeepSeekConfig({ DEEPSEEK_API_KEY: "sk-test" });
  let fetchCalls = 0;

  await assert.rejects(
    requestChatCompletion(config, [
      { role: "user", content: "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzdHVkZW50MSJ9.signature123" },
    ], {
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("should not fetch");
      },
    }),
    (error) => error?.code === "AI_RESPONSE" && /forbidden/i.test(error.message),
  );

  assert.equal(fetchCalls, 0);
});

test("requestChatCompletion rejects oversized message content before fetch", async () => {
  const config = readDeepSeekConfig({ DEEPSEEK_API_KEY: "sk-test" });
  let fetchCalls = 0;

  await assert.rejects(
    requestChatCompletion(config, [
      { role: "user", content: "x".repeat(8001) },
    ], {
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("should not fetch");
      },
    }),
    (error) => error?.code === "AI_RESPONSE" && /too large/i.test(error.message),
  );

  assert.equal(fetchCalls, 0);
});
