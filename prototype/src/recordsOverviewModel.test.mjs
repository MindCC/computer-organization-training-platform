import test from "node:test";
import assert from "node:assert/strict";
import { LEARNING_ITEMS, buildInitialLearningProgress } from "./platformLogic.js";
import { buildRecentActivityModel } from "./recordsOverviewModel.js";

test("empty and initial progress never create learning activity", () => {
  for (const progress of [{}, buildInitialLearningProgress(), null]) {
    const model = buildRecentActivityModel([], progress);
    assert.deepEqual(model.items, []);
    assert.deepEqual(model.fullItems, []);
    assert.equal(model.total, 0);
    assert.equal(model.source, "empty");
    assert.equal(model.hasKnownTimestamps, false);
  }
});

test("real session strings preserve order and explicitly label missing event times", () => {
  const logs = [
    "与门 React Flow 工作台提交未通过，得分 45。",
    "认识计算机五大部件探索完成。",
    "办公电脑 配置提交通过，得分 100。",
  ];
  const model = buildRecentActivityModel(logs, {
    "and-gate": { status: "completed", attempts: 3, bestScore: 100 },
  });
  assert.equal(model.source, "activity-log");
  assert.equal(model.total, 3);
  assert.deepEqual(model.items.map(({ challengeId }) => challengeId), ["and-gate", "computer-components", "game-office-pc"]);
  assert.deepEqual(model.items.map(({ status }) => status), ["in-progress", "completed", "completed"]);
  assert.deepEqual(model.items.map(({ scoreLabel }) => scoreLabel), ["45 分", "参与型", "100 分"]);
  assert.equal(model.items[0].title, "与门");
  assert.match(model.items[0].detail, /未通过/);
  assert.doesNotMatch(model.items[0].detail, /100/);
  for (const item of model.items) {
    assert.equal(item.dateLabel, "最近记录");
    assert.equal(item.timestamp, null);
    assert.equal(item.kind, "event");
    assert.equal(item.source, "activity-log");
  }
});

test("actual object timestamps are normalized and sorted, keeping full history", () => {
  const logs = [
    { id: "old", challenge_id: "and-gate", created_at: "2026-10-01 08:03:00", passed: 0, score: 0 },
    { id: "new", challengeId: "or-gate", timestamp: "2026-10-04T06:05:00Z", result: { passed: true, score: 88 } },
    { id: "middle", challengeId: "xor-gate", createdAt: "2026-10-03T10:00:00+08:00", passed: true, score: 97 },
    { id: "undated", title: "查看课件", detail: "继续阅读第二章", timestamp: "bad-date" },
  ];
  const model = buildRecentActivityModel(logs, {}, { limit: 2 });
  assert.deepEqual(model.fullItems.map(({ id }) => id), ["new", "middle", "old", "undated"]);
  assert.deepEqual(model.items.map(({ id }) => id), ["new", "middle"]);
  assert.equal(model.total, 4);
  assert.equal(model.hasKnownTimestamps, true);
  assert.equal(model.fullItems[2].timestamp, "2026-10-01T08:03:00.000Z");
  assert.equal(model.items[0].dateLabel, "2026.10.04 14:05");
  assert.equal(model.fullItems[2].scoreLabel, "0 分");
  assert.equal(model.fullItems[3].dateLabel, "最近记录");
});

test("sparse and mixed logs skip unusable entries without creating scores or links", () => {
  const model = buildRecentActivityModel([
    null, undefined, {}, false, 14, " ",
    "查阅课件中的存储器原理。",
    { id: "note", message: "已阅读第三章", createdAt: "昨天" },
    { id: "attempt", challengeId: "and-gate", passed: true },
    { id: "unknown", challengeId: "deleted-experiment", title: "旧实验", score: null },
  ]);
  assert.equal(model.total, 4);
  assert.equal(model.items[0].title, "查阅课件中的存储器原理。");
  assert.equal(model.items[0].challengeId, null);
  assert.equal(model.items[1].dateLabel, "昨天");
  assert.equal(model.items[1].timestamp, null);
  assert.equal(model.items[2].title, "与门");
  assert.equal(model.items[2].scoreLabel, "—");
  assert.doesNotMatch(model.items[2].detail, /100|0 分/);
  assert.equal(model.items[3].challengeId, null);
  assert.equal(model.items[3].scoreLabel, "—");
  assert.equal(new Set(model.items.map(({ id }) => id)).size, model.total);
});

test("progress fallback summarizes each attempted learning item once including hardware", () => {
  const progress = buildInitialLearningProgress();
  progress["and-gate"] = { status: "completed", attempts: 5, bestScore: 96, completedAt: "2026-10-04T09:00:00Z" };
  progress["game-office-pc"] = { status: "in-progress", attempts: 2, bestScore: 40, completedAt: null };
  progress["machine-number"] = { status: "completed", attempts: 1, bestScore: 0, completedAt: "刚刚" };
  progress["or-gate"] = { status: "completed", attempts: 0, bestScore: 0, completedAt: "2026-10-04T10:00:00Z" };
  progress["non-course-entry"] = { status: "completed", attempts: 10, bestScore: 100 };
  const before = structuredClone(progress);
  const model = buildRecentActivityModel([], progress);
  assert.equal(model.source, "progress");
  assert.equal(model.total, 3);
  assert.equal(model.items[0].challengeId, "and-gate");
  assert.equal(model.items[0].timestamp, "2026-10-04T09:00:00.000Z");
  assert.equal(model.items[0].timestampKind, "completion");
  assert.match(model.items[0].detail, /累计 5 次尝试/);
  assert.match(model.items[0].detail, /最佳 96 分/);
  assert.equal(model.items.filter(({ challengeId }) => challengeId === "and-gate").length, 1);
  const hardware = model.items.find(({ challengeId }) => challengeId === "game-office-pc");
  assert.equal(hardware.title, "办公电脑");
  assert.match(hardware.detail, /累计 2 次尝试/);
  for (const item of model.items) assert.equal(item.kind, "summary");
  assert.equal(model.items.find(({ challengeId }) => challengeId === "machine-number").dateLabel, "刚刚");
  assert.deepEqual(progress, before);
});

test("unusable logs fall back to progress, while genuine logs take precedence", () => {
  const progress = { "and-gate": { status: "completed", attempts: 2, bestScore: 80, completedAt: "今天" } };
  assert.equal(buildRecentActivityModel([null, ""], progress).source, "progress");
  const model = buildRecentActivityModel(["阅读课程说明。"], progress);
  assert.equal(model.source, "activity-log");
  assert.equal(model.total, 1);
  assert.equal(model.items[0].title, "阅读课程说明。");
});

test("participation activity never exposes a numerical grade in strings, objects or progress", () => {
  const logs = [
    "认识计算机五大部件 React Flow 工作台提交通过，得分 0。",
    { challengeId: "program-flow", passed: true, score: 0 },
    { title: "机器数编码", detail: "提交通过，得分 100 / 100。", result: { passed: true, score: 100 } },
  ];
  for (const item of buildRecentActivityModel(logs).items) {
    assert.equal(item.scoreLabel, "参与型");
    assert.doesNotMatch(item.title + item.detail, /得分\s*(0|100)|\d+\s*分|100\s*\/\s*100/);
    assert.match(item.detail, /参与型/);
  }
  const fallback = buildRecentActivityModel([], {
    "computer-components": { status: "completed", attempts: 2, bestScore: 0, completedAt: "昨天" },
  }).items[0];
  assert.equal(fallback.scoreLabel, "参与型");
  assert.doesNotMatch(fallback.detail, /0\s*分/);
});

test("a missing aggregate score does not become zero and missing dates remain unknown", () => {
  const model = buildRecentActivityModel([], {
    "and-gate": { status: "in-progress", attempts: "3", bestScore: null },
    "or-gate": { status: "completed", attempts: 2 },
    "not-gate": { status: "in-progress", attempts: 1, bestScore: 0, completedAt: "not-a-date" },
  });
  assert.equal(model.total, 3);
  assert.deepEqual(model.items.map(({ scoreLabel }) => scoreLabel), ["—", "—", "0 分"]);
  assert.ok(model.items.every(({ timestamp, dateLabel }) => timestamp === null && dateLabel === "最近记录"));
  assert.ok(model.items.every(({ detail }) => !detail.includes("最佳 —")));
});

test("card uses at most six items and repeated log events keep distinct ids", () => {
  const logs = Array.from({ length: 9 }, () => "与门提交通过，得分 100。");
  const model = buildRecentActivityModel(logs, {}, { limit: 100 });
  assert.equal(model.items.length, 6);
  assert.equal(model.fullItems.length, 9);
  assert.equal(new Set(model.fullItems.map(({ id }) => id)).size, 9);
  assert.equal(buildRecentActivityModel(logs, {}, { limit: 0 }).items.length, 0);
});

test("Unix seconds, epoch milliseconds and offset timestamps resolve the same genuine instant", () => {
  const instant = Date.parse("2026-10-04T06:05:00Z");
  const model = buildRecentActivityModel([
    { id: "seconds", title: "秒时间", timestamp: instant / 1000 },
    { id: "millis", title: "毫秒时间", timestamp: instant },
    { id: "offset", title: "偏移时间", timestamp: "2026-10-04T14:05:00+08:00" },
  ]);
  assert.ok(model.items.every(({ timestamp }) => timestamp === "2026-10-04T06:05:00.000Z"));
  assert.deepEqual(model.items.map(({ id }) => id), ["seconds", "millis", "offset"]);
});

test("catalog matching selects the longest actual challenge title and preserves inputs", () => {
  const logs = ["与非门造与门提交通过，得分 100。", "三输入多数表决提交未通过，得分 0。"];
  const before = structuredClone(logs);
  const model = buildRecentActivityModel(logs);
  assert.deepEqual(model.items.map(({ challengeId }) => challengeId), ["nand-builder", "majority-vote"]);
  assert.deepEqual(logs, before);
  assert.ok(model.items.every(({ challengeId }) => LEARNING_ITEMS.some(({ id }) => id === challengeId)));
});

test("invalid calendar values and malformed scores never become believable records", () => {
  const model = buildRecentActivityModel([
    { id: "bad-day", challengeId: "and-gate", timestamp: "2026-02-31T08:00:00Z", score: " " },
    { id: "bad-month", challengeId: "or-gate", timestamp: "2026-13-01 00:00:00", score: [] },
    { id: "bad-hour", challengeId: "not-gate", timestamp: "2026-10-04T24:00:00Z", score: {} },
  ]);
  assert.ok(model.items.every(({ timestamp, dateLabel }) => timestamp === null && dateLabel === "最近记录"));
  assert.ok(model.items.every(({ scoreLabel }) => scoreLabel === "—"));
  assert.ok(model.items.every(({ detail }) => !detail.includes("0 分")));
});
