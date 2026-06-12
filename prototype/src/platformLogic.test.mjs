import test from "node:test";
import assert from "node:assert/strict";

import {
  CHALLENGES,
  buildInitialProgress,
  gradeConnections,
  recordAttempt,
  simulateChallenge,
  summarizeLearning,
} from "./platformLogic.js";

test("半加器仿真能根据输入得到和位与进位", () => {
  const result = simulateChallenge("half-adder", { a: 1, b: 1, cin: 0, select: 0 });

  assert.equal(result.outputs.sum, 0);
  assert.equal(result.outputs.carry, 1);
  assert.equal(result.steps.length >= 3, true);
});

test("缺少关键连线时判题会定位具体端口", () => {
  const result = gradeConnections("full-adder", ["输入A->异或门1", "输入B->异或门1"]);

  assert.equal(result.passed, false);
  assert.deepEqual(
    result.errors.map((error) => error.type),
    ["缺少进位输入", "输出端未连接"],
  );
});

test("出现非本关连线时判题会标记结构冲突", () => {
  const result = gradeConnections("half-adder", [
    "输入A->异或门",
    "输入B->异或门",
    "输入A->与门",
    "输入B->与门",
    "异或门->和位S",
    "与门->进位C",
    "输出端->输入A",
  ]);

  assert.equal(result.passed, false);
  assert.equal(result.errors.some((error) => error.type === "结构冲突"), true);
  assert.equal(result.score < 100, true);
});

test("提交正确结构会更新学习记录并解锁下一关", () => {
  const progress = buildInitialProgress(CHALLENGES);
  const passed = gradeConnections(
    "data-flow",
    CHALLENGES.find((challenge) => challenge.id === "data-flow").requiredConnections,
  );

  const nextProgress = recordAttempt(progress, "data-flow", passed);

  assert.equal(nextProgress["data-flow"].status, "completed");
  assert.equal(nextProgress["half-adder"].status, "in-progress");
  assert.equal(nextProgress["data-flow"].attempts, 1);
});

test("学习记录会累计每次实验耗时", () => {
  const progress = buildInitialProgress(CHALLENGES);
  const nextProgress = recordAttempt(progress, "data-flow", {
    passed: true,
    errors: [],
    score: 100,
    missing: [],
    elapsedMinutes: 9,
  });
  const summary = summarizeLearning(CHALLENGES, nextProgress);

  assert.equal(nextProgress["data-flow"].timeSpentMinutes, 9);
  assert.equal(summary.totalStudyMinutes, 9);
});

test("学习概览能统计完成率、尝试次数和高频错误", () => {
  let progress = buildInitialProgress(CHALLENGES);
  progress = recordAttempt(progress, "full-adder", {
    passed: false,
    errors: [{ type: "缺少进位输入", message: "Cin 未连接" }],
  });

  const summary = summarizeLearning(CHALLENGES, progress);

  assert.equal(summary.totalChallenges, 6);
  assert.equal(summary.totalAttempts, 1);
  assert.equal(summary.weakSpot, "缺少进位输入");
});
