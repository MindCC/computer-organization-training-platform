import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInterventionGroups,
  buildTeacherQuestModel,
  buildTeacherSetupSteps,
} from "./teacherQuest.js";

const routes = [
  {
    id: "logic",
    items: [
      { id: "and-gate", title: "与门" },
      { id: "half-adder", title: "半加器" },
    ],
  },
];

const students = [
  {
    id: 1,
    displayName: "甲",
    progress: {
      "and-gate": { status: "completed", attempts: 1 },
      "half-adder": {
        status: "in-progress",
        attempts: 4,
        errors: ["carry", "carry"],
      },
    },
  },
  { id: 2, displayName: "乙", progress: {} },
];

test("teacher quest aggregates reached and completed students", () => {
  const model = buildTeacherQuestModel(routes, students);
  assert.equal(model.stages[0].id, "and-gate");
  assert.equal(model.stages[0].reached, 1);
  assert.equal(model.stages[0].completed, 1);
  assert.equal(model.stages[0].completionRate, 50);
});

test("setup checklist follows real class state", () => {
  const steps = buildTeacherSetupSteps({
    hasClass: true,
    studentCount: 2,
    hasMission: false,
    hasStartedSession: false,
  });
  assert.deepEqual(
    steps.map((step) => step.completed),
    [true, true, false, false],
  );
});

test("setup completed when all prereqs met", () => {
  const steps = buildTeacherSetupSteps({
    hasClass: true,
    studentCount: 30,
    hasMission: true,
    hasStartedSession: true,
  });
  assert.deepEqual(
    steps.map((step) => step.completed),
    [true, true, true, true],
  );
});

test("interventions group not-entered and repeated failures", () => {
  const groups = buildInterventionGroups(students);
  const notEntered = groups.find((g) => g.id === "not-entered");
  assert.ok(notEntered);
  assert.equal(notEntered.students[0].displayName, "乙");

  const repeated = groups.find((g) => g.id === "repeated-failure");
  assert.ok(repeated);
  assert.equal(repeated.students[0].displayName, "甲");
});

test("interventions omit empty groups", () => {
  const groups = buildInterventionGroups([
    { id: 1, displayName: "丙", progress: {} },
  ]);
  assert.ok(groups.find((g) => g.id === "not-entered"));
  assert.equal(groups.find((g) => g.id === "repeated-failure"), undefined);
  assert.equal(groups.find((g) => g.id === "completed-ready"), undefined);
});

test("teacher quest handles empty students", () => {
  const model = buildTeacherQuestModel(routes, []);
  assert.equal(model.totalStudents, 0);
  assert.equal(model.stages[0].reached, 0);
  assert.equal(model.stages[0].blocker, "暂无集中卡点");
});
