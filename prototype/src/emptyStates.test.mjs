import test from "node:test";
import assert from "node:assert/strict";
import { buildStudentHomeEmptyState, buildTeacherEmptyState } from "./emptyStates.js";

const groups = [{
  id: "chapter-1",
  title: "第一章 计算机系统",
  items: [{ id: "computer-5-parts", title: "认识计算机五大部件", estimatedMinutes: 12 }],
}];

test("student home empty state appears only with zero attempts", () => {
  const state = buildStudentHomeEmptyState({ totalAttempts: 0 }, groups);
  assert.ok(state, "fresh student should get a guided empty state");
  assert.match(state.title, /五大部件/);
  assert.equal(state.targetId, "computer-5-parts");
  assert.ok(state.ctaLabel);
});

test("student home empty state is null once any attempt exists", () => {
  const state = buildStudentHomeEmptyState({ totalAttempts: 3, completionRate: 20 }, groups);
  assert.equal(state, null);
});

test("teacher empty state appears when class has students but no submissions", () => {
  const students = [
    { id: 1, summary: { totalAttempts: 0, completionRate: 0 } },
    { id: 2, summary: { totalAttempts: 0, completionRate: 0 } },
  ];
  const state = buildTeacherEmptyState(students);
  assert.ok(state, "students with no submissions need guidance");
  assert.match(state.description, /完成第一关/);
  assert.ok(state.actionHref, "empty state must include an actionable link");
});

test("teacher empty state is null when no students are imported yet", () => {
  assert.equal(buildTeacherEmptyState([]), null, "existing no-student empty state covers this");
});

test("teacher empty state is null once any student has attempted", () => {
  const students = [
    { id: 1, summary: { totalAttempts: 2 } },
    { id: 2, summary: { totalAttempts: 0 } },
  ];
  assert.equal(buildTeacherEmptyState(students), null);
});
