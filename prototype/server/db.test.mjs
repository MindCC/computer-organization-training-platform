import test from "node:test";
import assert from "node:assert/strict";

import {
  buildErrorProfile,
  buildLearningOverview,
  buildNoteLinks,
  createNote,
  createUser,
  migrate,
  openDatabase,
  recordStudentAttempt,
} from "./db.js";
import { LEARNING_ITEMS } from "../src/platformLogic.js";

function makeDb() {
  const db = openDatabase(":memory:");
  migrate(db);
  return db;
}

function makeStudent(db) {
  return createUser(db, {
    username: "2026001",
    displayName: "李同学",
    role: "student",
    passwordHash: "hash",
  });
}

test("errorProfile aggregates error types and flags consecutive repeated errors", () => {
  const db = makeDb();
  const student = makeStudent(db);
  // 插入顺序即 id 顺序,查询按 id DESC,最新提交在前。
  recordStudentAttempt(db, student.id, "half-adder", { passed: false, score: 50, errors: ["进位错误 B"], elapsedMinutes: 4 });
  recordStudentAttempt(db, student.id, "half-adder", { passed: false, score: 50, errors: ["进位错误 A"], elapsedMinutes: 4 });
  recordStudentAttempt(db, student.id, "full-adder", { passed: false, score: 50, errors: ["进位错误 A"], elapsedMinutes: 6 });

  const profile = buildErrorProfile(db, student.id);
  assert.equal(profile.length, 2);
  const a = profile.find((p) => p.errorType === "进位错误 A");
  const b = profile.find((p) => p.errorType === "进位错误 B");
  assert.equal(a.count, 2);
  assert.equal(a.repeated, true); // 最近两次连续提交都出现 A
  assert.deepEqual([...a.relatedChallengeIds].sort(), ["full-adder", "half-adder"]);
  assert.ok(a.lastSeen);
  assert.equal(b.count, 1);
  assert.equal(b.repeated, false);
  assert.equal(profile[0].errorType, "进位错误 A"); // 按频次降序
});

test("errorProfile does not flag non-consecutive repeated errors", () => {
  const db = makeDb();
  const student = makeStudent(db);
  recordStudentAttempt(db, student.id, "half-adder", { passed: false, score: 50, errors: ["进位错误"], elapsedMinutes: 4 });
  recordStudentAttempt(db, student.id, "half-adder", { passed: true, score: 100, errors: [], elapsedMinutes: 3 });
  recordStudentAttempt(db, student.id, "full-adder", { passed: false, score: 50, errors: ["进位错误"], elapsedMinutes: 6 });

  const profile = buildErrorProfile(db, student.id);
  const a = profile.find((p) => p.errorType === "进位错误");
  assert.equal(a.count, 2);
  assert.equal(a.repeated, false); // 两次之间隔着一次无错误提交,不算连续重复
});

test("errorProfile returns empty array when no attempts exist", () => {
  const db = makeDb();
  const student = makeStudent(db);
  assert.deepEqual(buildErrorProfile(db, student.id), []);
});

test("noteLinks groups notes by challenge with known titles and unlinked bucket", () => {
  const links = buildNoteLinks([
    { id: 1, title: "进位", content: "全加器要连进位", tag: "运算器", challengeId: "full-adder", createdAt: "t", updatedAt: "t" },
    { id: 2, title: "随手记", content: "备忘", tag: "课堂", challengeId: null, createdAt: "t", updatedAt: "t" },
    { id: 3, title: "数据流", content: "总线方向", tag: "数据流", challengeId: "data-flow", createdAt: "t", updatedAt: "t" },
    { id: 4, title: "老数据", content: "旧格式", tag: "课堂", challengeId: "ghost-challenge", createdAt: "t", updatedAt: "t" },
  ]);

  assert.equal(links.length, 4);
  const fullAdder = links.find((l) => l.challengeId === "full-adder");
  assert.equal(fullAdder.challengeTitle, "全加器");
  assert.equal(fullAdder.notes.length, 1);
  assert.equal(fullAdder.notes[0].title, "进位");

  const unlinked = links.find((l) => l.challengeId === null);
  assert.equal(unlinked.challengeTitle, "未关联关卡");
  assert.equal(unlinked.notes[0].content, "备忘");

  const ghost = links.find((l) => l.challengeId === "ghost-challenge");
  assert.equal(ghost.challengeTitle, "未知关卡");

  // 未关联关卡排最后
  assert.equal(links[links.length - 1].challengeId, null);
});

test("learningOverview aggregates completion, score, time and attempts", () => {
  const overview = buildLearningOverview({
    "half-adder": { status: "completed", attempts: 2, errors: [], bestScore: 100, timeSpentMinutes: 8 },
    "full-adder": { status: "completed", attempts: 3, errors: ["进位错误"], bestScore: 80, timeSpentMinutes: 12 },
    "data-flow": { status: "in-progress", attempts: 1, errors: [], bestScore: 60, timeSpentMinutes: 5 },
  });

  assert.equal(overview.completedCount, 2);
  assert.equal(overview.totalCount, LEARNING_ITEMS.length);
  assert.equal(overview.completionRate, Math.round((2 / LEARNING_ITEMS.length) * 100));
  assert.equal(overview.averageScore, Math.round((100 + 80 + 60) / 3));
  assert.equal(overview.totalAttempts, 6);
  assert.equal(overview.totalTimeMinutes, 25);
});

test("learningOverview returns zeros for empty progress", () => {
  const overview = buildLearningOverview({});
  assert.equal(overview.completedCount, 0);
  assert.equal(overview.totalCount, LEARNING_ITEMS.length);
  assert.equal(overview.completionRate, 0);
  assert.equal(overview.averageScore, 0);
  assert.equal(overview.totalAttempts, 0);
  assert.equal(overview.totalTimeMinutes, 0);
});
