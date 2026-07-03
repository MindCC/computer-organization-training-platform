import assert from "node:assert/strict";
import test from "node:test";

import {
  DATA_JOURNEY_STEPS,
  JOURNEY_CHALLENGE_IDS,
  buildTeacherJourneyGuidance,
  getJourneyStepsForChallenge,
} from "./dataJourney.js";

test("数据旅程覆盖第一章概述关卡", () => {
  assert.deepEqual(JOURNEY_CHALLENGE_IDS, ["computer-components", "program-flow", "instruction-data"]);
  assert.equal(DATA_JOURNEY_STEPS.length >= 8, true);
});

test("指令和数据关卡包含取指译码执行检查点", () => {
  const steps = getJourneyStepsForChallenge("instruction-data");
  assert.equal(steps.length >= 6, true);
  assert.equal(steps.some((step) => step.transfer === "PC -> MAR"), true);
  assert.equal(steps.some((step) => step.transfer === "M(MAR) -> MDR"), true);
  assert.equal(steps.some((step) => step.transfer === "MDR -> IR"), true);
  assert.equal(steps.some((step) => step.activeUnit === "CU"), true);

  for (const step of steps) {
    assert.equal(typeof step.checkpoint.question, "string");
    assert.equal(typeof step.checkpoint.answer, "string");
    assert.equal(step.registers.length > 0, true);
  }
});

test("非概述关卡不显示数据旅程步骤", () => {
  assert.deepEqual(getJourneyStepsForChallenge("half-adder"), []);
});

test("教师数据旅程建议聚焦未完成的概述关卡", () => {
  const guidance = buildTeacherJourneyGuidance([
    { challengeId: "computer-components", incompleteCount: 0, averageScore: 100 },
    { challengeId: "program-flow", incompleteCount: 12, averageScore: 55 },
    { challengeId: "instruction-data", incompleteCount: 8, averageScore: 62 },
  ]);

  assert.equal(guidance.title, "取指-译码-执行流程需要回讲");
  assert.match(guidance.action, /程序运行路线/);
  assert.match(guidance.action, /PC/);
});
