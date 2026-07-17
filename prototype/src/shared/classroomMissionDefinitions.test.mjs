import test from "node:test";
import assert from "node:assert/strict";
import { CHALLENGES } from "../platformLogic.js";
import {
  getClassroomMission,
  getLatestClassroomMission,
  validateClassroomSessionConfig,
} from "./classroomMissionDefinitions.js";

test("computer data-flow mission keeps four stable stages backed by real challenges", () => {
  const mission = getClassroomMission("computer-data-flow", 1);
  assert.deepEqual(
    mission.stages.map(({ id, challengeId }) => ({ id, challengeId })),
    [
      { id: "components", challengeId: "computer-components" },
      { id: "program-flow", challengeId: "program-flow" },
      { id: "instruction-data", challengeId: "instruction-data" },
      { id: "data-flow", challengeId: "data-flow" },
    ],
  );
  const challengeIds = new Set(CHALLENGES.map((item) => item.id));
  assert.equal(mission.stages.every((stage) => challengeIds.has(stage.challengeId)), true);
  assert.equal(Object.isFrozen(mission), true);
});

test("session configuration is normalized and bounded", () => {
  assert.deepEqual(validateClassroomSessionConfig({
    templateKey: "computer-data-flow",
    durationMinutes: 45,
    passScore: 80,
    allowMakeup: true,
  }), {
    templateKey: "computer-data-flow",
    templateVersion: 1,
    durationMinutes: 45,
    passScore: 80,
    allowMakeup: true,
  });
  assert.throws(() => validateClassroomSessionConfig({ templateKey: "missing", durationMinutes: 45, passScore: 80 }), /任务包/);
  assert.throws(() => validateClassroomSessionConfig({ templateKey: "computer-data-flow", durationMinutes: 9, passScore: 80 }), /10.*180/);
  assert.throws(() => validateClassroomSessionConfig({ templateKey: "computer-data-flow", durationMinutes: 45, passScore: 59 }), /60.*100/);
});

test("latest mission lookup resolves version one", () => {
  assert.equal(getLatestClassroomMission("computer-data-flow").version, 1);
});
