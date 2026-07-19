import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFirstUseSteps,
  buildQuestSettlement,
  buildRoleEntryCopy,
  buildStudentQuestModel,
} from "./questExperience.js";

const groups = [{
  id: "logic",
  title: "基础逻辑门",
  description: "从信号开始",
  items: [
    { id: "and-gate", title: "与门", status: "completed", bestScore: 100, attempts: 1, estimatedMinutes: 8 },
    { id: "half-adder", title: "半加器", status: "in-progress", bestScore: 70, attempts: 2, estimatedMinutes: 12 },
    { id: "full-adder", title: "全加器", status: "locked", bestScore: 0, attempts: 0, estimatedMinutes: 15 },
  ],
}];

test("role copy guides each account type without changing credentials", () => {
  assert.equal(buildRoleEntryCopy("student").usernameLabel, "学号");
  assert.equal(buildRoleEntryCopy("teacher").usernameLabel, "教师账号");
  assert.equal(buildRoleEntryCopy("student").submitLabel, "登录并继续学习");
});

test("student quest marks one current stage and a real lock requirement", () => {
  const model = buildStudentQuestModel(groups, { id: "half-adder", title: "半加器" }, {});
  assert.equal(model.current.id, "half-adder");
  assert.equal(model.stages.filter((stage) => stage.isCurrent).length, 1);
  assert.equal(model.stages.find((stage) => stage.id === "full-adder").unlockRequirement, "完成「半加器」后解锁");
});

test("first-use steps derive completion from real progress", () => {
  const steps = buildFirstUseSteps({ "and-gate": { attempts: 1, status: "completed" } });
  assert.equal(steps[0].completed, true);
  assert.equal(steps[2].completed, true);
});

test("settlement names the verified stage and next unlock", () => {
  const settlement = buildQuestSettlement("half-adder", { passed: true, score: 92 }, groups);
  assert.equal(settlement.title, "半加器已通过");
  assert.equal(settlement.nextTitle, "全加器");
  assert.equal(settlement.score, 92);
});
