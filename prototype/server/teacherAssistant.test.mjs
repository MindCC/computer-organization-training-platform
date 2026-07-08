import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

import { hashPassword } from "./auth.js";
import { readDeepSeekConfig, requestChatCompletion } from "./aiClient.js";
import { addStudentToClass, createClass, createUser, migrate } from "./db.js";
import {
  buildFallbackAssistantReport,
  buildTeacherAssistantMessages,
  buildTeacherAssistantPayload,
  generateTeacherAssistantReport,
  parseAssistantJson,
} from "./teacherAssistant.js";

function makeMemoryDb() {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

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

test("requestChatCompletion rejects student note shaped content before fetch", async () => {
  const config = readDeepSeekConfig({ DEEPSEEK_API_KEY: "sk-test" });
  let fetchCalls = 0;

  await assert.rejects(
    requestChatCompletion(config, [
      { role: "user", content: "学生笔记：今天我把完整实验过程都写在这里。" },
    ], {
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("should not fetch");
      },
    }),
    (error) => error?.code === "AI_RESPONSE" && /note|笔记|forbidden/i.test(error.message),
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

test("buildTeacherAssistantPayload includes teaching data and excludes secrets", async () => {
  const db = makeMemoryDb();
  const teacher = createUser(db, {
    username: "teacher-a",
    displayName: "张老师",
    role: "teacher",
    passwordHash: await hashPassword("Teacher123!"),
  });
  const classRow = createClass(db, teacher.id, "计组一班");
  const student = createUser(db, {
    username: "2026001",
    displayName: "李同学",
    role: "student",
    passwordHash: await hashPassword("Student123!"),
    profile: { initialPassword: "Student123!" },
  });
  addStudentToClass(db, classRow.id, student.id);

  const payload = buildTeacherAssistantPayload(db, classRow.id);
  const serialized = JSON.stringify(payload);

  assert.equal(payload.className, "计组一班");
  assert.equal(payload.students[0].displayName, "李同学");
  assert.equal(payload.students[0].username, "2026001");
  assert.doesNotMatch(serialized, /password_hash/i);
  assert.doesNotMatch(serialized, /Student123!/);
  assert.doesNotMatch(serialized, /session/i);
  assert.doesNotMatch(serialized, /cookie/i);
});

test("buildFallbackAssistantReport returns usable report shape", async () => {
  const db = makeMemoryDb();
  const teacher = createUser(db, {
    username: "teacher-b",
    displayName: "王老师",
    role: "teacher",
    passwordHash: await hashPassword("Teacher123!"),
  });
  const classRow = createClass(db, teacher.id, "空班");

  const payload = buildTeacherAssistantPayload(db, classRow.id);
  const response = buildFallbackAssistantReport(payload, "DEEPSEEK_API_KEY 未配置");

  assert.equal(response.source, "fallback");
  assert.equal(response.fallbackReason, "DEEPSEEK_API_KEY 未配置");
  assert.equal(Array.isArray(response.report.nextClassPlan), true);
  assert.equal(typeof response.report.teacherScript, "string");
  assert.equal(Array.isArray(response.report.evidence), true);
});

test("parseAssistantJson rejects invalid AI output instead of returning an empty report", () => {
  assert.throws(
    () => parseAssistantJson("not json"),
    /AI JSON 解析失败/,
  );
});

test("parseAssistantJson rejects incomplete AI output instead of returning empty fields", () => {
  assert.throws(
    () => parseAssistantJson("{}"),
    /缺少字段/,
  );
});

test("parseAssistantJson rejects empty required prose fields", () => {
  assert.throws(
    () => parseAssistantJson(JSON.stringify({
      lessonFocus: "",
      riskStudents: [],
      groupingPlan: [],
      commonMisconceptions: [],
      nextClassPlan: [],
      teacherScript: "   ",
    })),
    /不可为空/,
  );
});

test("parseAssistantJson accepts markdown-wrapped JSON", () => {
  const report = parseAssistantJson(`\`\`\`json
{"lessonFocus":"全加器和 Cout","riskStudents":[],"groupingPlan":[],"commonMisconceptions":[],"nextClassPlan":["复盘 Cout"],"teacherScript":"先讲 Cout 的含义。"}
\`\`\``);

  assert.equal(report.lessonFocus, "全加器和 Cout");
  assert.deepEqual(report.nextClassPlan, ["复盘 Cout"]);
});

test("buildTeacherAssistantMessages uses only backend-owned user messages", async () => {
  const db = makeMemoryDb();
  const teacher = createUser(db, {
    username: "teacher-msg",
    displayName: "陈老师",
    role: "teacher",
    passwordHash: await hashPassword("Teacher123!"),
  });
  const classRow = createClass(db, teacher.id, "计组消息班");
  const payload = buildTeacherAssistantPayload(db, classRow.id);

  const messages = buildTeacherAssistantMessages(payload);

  assert.equal(Array.isArray(messages), true);
  assert.equal(messages.length, 1);
  assert.deepEqual(messages.map((message) => message.role), ["user"]);
  assert.match(messages[0].content, /严格输出 JSON/i);
  assert.match(messages[0].content, /lessonFocus/);
  assert.match(messages[0].content, /计组消息班/);
});

test("generateTeacherAssistantReport uses AI path instead of legacy fallbackReason bypass", async () => {
  const db = makeMemoryDb();
  const teacher = createUser(db, {
    username: "teacher-c",
    displayName: "赵老师",
    role: "teacher",
    passwordHash: await hashPassword("Teacher123!"),
  });
  const classRow = createClass(db, teacher.id, "计组三班");

  const response = await generateTeacherAssistantReport(db, teacher.id, classRow.id, {
    env: { DEEPSEEK_API_KEY: "sk-test" },
    fallbackReason: "旧的强制回退参数",
    aiRequester: async () => JSON.stringify({
      lessonFocus: "全加器 Cout",
      riskStudents: [],
      groupingPlan: [],
      commonMisconceptions: ["Sum 和 Cout 混淆"],
      nextClassPlan: ["复盘端口", "重连全加器"],
      teacherScript: "先看 Cout 的来源。",
    }),
  });

  assert.equal(response.source, "ai");
  assert.equal(response.report.lessonFocus, "全加器 Cout");
  assert.equal(response.fallbackReason, null);
});

test("generateTeacherAssistantReport returns ai source when client returns valid JSON", async () => {
  const db = makeMemoryDb();
  const teacher = createUser(db, {
    username: "teacher-ai",
    displayName: "孙老师",
    role: "teacher",
    passwordHash: await hashPassword("Teacher123!"),
  });
  const classRow = createClass(db, teacher.id, "计组五班");

  const response = await generateTeacherAssistantReport(db, teacher.id, classRow.id, {
    env: { DEEPSEEK_API_KEY: "sk-test" },
    aiRequester: async (_config, messages) => {
      assert.deepEqual(messages.map((message) => message.role), ["user"]);
      return `\`\`\`json
{"lessonFocus":"全加器与 Cout","riskStudents":[],"groupingPlan":[],"commonMisconceptions":["把 Sum 和 Cout 混淆"],"nextClassPlan":["复盘口线连接","重练全加器"],"teacherScript":"先看 Cout 的来源。"}
\`\`\``;
    },
  });

  assert.equal(response.source, "ai");
  assert.equal(response.report.lessonFocus, "全加器与 Cout");
  assert.equal(response.fallbackReason, null);
});

test("generateTeacherAssistantReport falls back when AI returns invalid JSON", async () => {
  const db = makeMemoryDb();
  const teacher = createUser(db, {
    username: "teacher-d",
    displayName: "钱老师",
    role: "teacher",
    passwordHash: await hashPassword("Teacher123!"),
  });
  const classRow = createClass(db, teacher.id, "计组六班");

  const response = await generateTeacherAssistantReport(db, teacher.id, classRow.id, {
    env: { DEEPSEEK_API_KEY: "sk-test" },
    aiRequester: async () => "not json",
  });

  assert.equal(response.source, "fallback");
  assert.match(response.fallbackReason, /JSON/);
});

test("generateTeacherAssistantReport marks missing or unauthorized class as 404", async () => {
  const db = makeMemoryDb();
  const owner = createUser(db, {
    username: "teacher-owner",
    displayName: "任课教师",
    role: "teacher",
    passwordHash: await hashPassword("Teacher123!"),
  });
  const otherTeacher = createUser(db, {
    username: "teacher-other",
    displayName: "其他教师",
    role: "teacher",
    passwordHash: await hashPassword("Teacher123!"),
  });
  const classRow = createClass(db, owner.id, "计组七班");

  await assert.rejects(
    generateTeacherAssistantReport(db, otherTeacher.id, classRow.id, {
      env: { DEEPSEEK_API_KEY: "sk-test" },
    }),
    (error) => error?.code === "CLASS_NOT_FOUND" && error?.statusCode === 404,
  );
});

