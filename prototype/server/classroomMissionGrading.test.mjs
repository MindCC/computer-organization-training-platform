import test from "node:test";
import assert from "node:assert/strict";
import { gradeClassroomEvidence, classroomError } from "./classroomMissionGrading.js";
import { getClassroomMission } from "../src/shared/classroomMissionDefinitions.js";

test("classroomError creates structured error objects", () => {
  const err = classroomError("SESSION_PAUSED", "课堂已暂停", 409, true);
  assert.equal(err.code, "SESSION_PAUSED");
  assert.equal(err.message, "课堂已暂停");
  assert.equal(err.status, 409);
  assert.equal(err.retryable, true);
});

test("participation stage accepts completed evidence and rejects missing completion", () => {
  const mission = getClassroomMission("computer-data-flow", 1);
  const result = gradeClassroomEvidence({
    mission,
    stageIndex: 0,
    payload: { result: { completed: true, elapsedMinutes: 5 } },
    progress: {},
  });
  assert.equal(result.challengeId, "computer-components");
  assert.equal(result.result.score, 100);
  assert.equal(result.result.passed, true);

  assert.throws(
    () => gradeClassroomEvidence({ mission, stageIndex: 0, payload: { result: {} }, progress: {} }),
    /探索阶段/,
  );

  assert.throws(
    () => gradeClassroomEvidence({ mission, stageIndex: 0, payload: { result: { completed: false } }, progress: {} }),
    /探索阶段/,
  );
});

test("circuit stage rejects more than 256 edges", () => {
  const mission = getClassroomMission("computer-data-flow", 1);
  const oversized = { result: { edges: Array.from({ length: 257 }, (_, i) => ({ from: { nodeId: "a", portId: "out" }, to: { nodeId: "b", portId: "in" } })) } };
  assert.throws(
    () => gradeClassroomEvidence({ mission, stageIndex: 1, payload: oversized, progress: {} }),
    /256/,
  );
});

test("circuit stage rejects malformed edges", () => {
  const mission = getClassroomMission("computer-data-flow", 1);
  const badEdges = { result: { edges: [{ from: null, to: null }] } };
  assert.throws(
    () => gradeClassroomEvidence({ mission, stageIndex: 1, payload: badEdges, progress: {} }),
    /circuit edge evidence/,
  );
});

test("submission larger than 64 KB is rejected", () => {
  const mission = getClassroomMission("computer-data-flow", 1);
  const huge = { result: { edges: [], junk: "x".repeat(64 * 1024) } };
  assert.throws(
    () => gradeClassroomEvidence({ mission, stageIndex: 1, payload: huge, progress: {} }),
    /64 KB/,
  );
});

test("stage index out of bounds throws STAGE_MISMATCH", () => {
  const mission = getClassroomMission("computer-data-flow", 1);
  assert.throws(
    () => gradeClassroomEvidence({ mission, stageIndex: 99, payload: { result: { completed: true } }, progress: {} }),
    /课堂阶段不匹配/,
  );
});
