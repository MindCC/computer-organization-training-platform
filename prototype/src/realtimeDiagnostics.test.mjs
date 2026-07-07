import test from "node:test";
import assert from "node:assert/strict";
import { buildRealtimeDiagnostics } from "./realtimeDiagnostics.js";

test("realtime diagnostics reports needs-work state before connections", () => {
  const result = buildRealtimeDiagnostics({
    challengeId: "and-gate",
    connections: [],
    inputState: { a: 1, b: 1 },
    feedback: null,
  });

  assert.equal(result.status, "needs-work");
  assert.equal(result.testRows.length > 0, true);
  assert.ok(result.issues.length > 0);
});

test("realtime diagnostics exposes current output for a logic gate", () => {
  const result = buildRealtimeDiagnostics({
    challengeId: "and-gate",
    connections: ["输入A->与门", "输入B->与门", "与门->输出Y"],
    inputState: { a: 1, b: 1 },
    feedback: { passed: true, errors: [] },
  });

  assert.equal(result.status, "passed");
  assert.ok(result.testRows.some((row) => row.label.includes("当前输出")));
});

test("realtime diagnostics shows structural errors from gradeConnections", () => {
  const result = buildRealtimeDiagnostics({
    challengeId: "half-adder",
    connections: ["输入A->异或门"],
    inputState: { a: 1, b: 0 },
    feedback: null,
  });

  assert.equal(result.status, "needs-work");
  assert.equal(result.issues.length > 0, true);
});

test("realtime diagnostics handles overview challenge simulation steps", () => {
  const result = buildRealtimeDiagnostics({
    challengeId: "computer-components",
    connections: [],
    inputState: {},
    feedback: null,
  });

  assert.equal(result.testRows.length > 0, true);
  assert.ok(result.testRows.some((row) => row.label.includes("步骤")));
});
