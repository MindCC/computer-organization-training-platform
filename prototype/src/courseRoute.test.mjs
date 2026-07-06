import test from "node:test";
import assert from "node:assert/strict";
import { CHALLENGES, buildInitialLearningProgress } from "./platformLogic.js";
import { buildCourseRouteGroups, findNextRecommendedChallenge } from "./courseRoute.js";

const HARDWARE_ROUTE_IDS = [
  "game-office-pc",
  "game-student-laptop",
  "game-lab-workstation",
  "game-storage-upgrade",
  "game-video-editing",
  "game-database-server",
];

test("course route groups every challenge and keeps hardware routes", () => {
  const progress = buildInitialLearningProgress();
  const groups = buildCourseRouteGroups(CHALLENGES, progress);
  const groupedIds = groups.flatMap((group) => group.items.map((item) => item.id));

  assert.deepEqual(
    [...new Set(groupedIds)].sort(),
    [...CHALLENGES.map((item) => item.id), ...HARDWARE_ROUTE_IDS].sort(),
  );
  assert.ok(groups.some((group) => group.id === "overview"));
  assert.ok(groups.some((group) => group.id === "logic"));
  assert.ok(groups.some((group) => group.id === "storage"));

  const hardwareGroup = groups.find((group) => group.id === "hardware");
  assert.deepEqual(hardwareGroup.items.map((item) => item.id), HARDWARE_ROUTE_IDS);
});

test("hardware route items fall back when the challenge record is missing", () => {
  const progress = buildInitialLearningProgress();
  const groups = buildCourseRouteGroups(CHALLENGES, progress);
  const hardwareGroup = groups.find((group) => group.id === "hardware");
  const item = hardwareGroup.items.find((route) => route.id === "game-office-pc");

  assert.equal(item.title, "办公电脑");
  assert.equal(item.description, hardwareGroup.description);
  assert.equal(item.estimatedMinutes, 6);
});

test("course route recommends the first in-progress or unlocked challenge", () => {
  const progress = buildInitialLearningProgress();
  progress["computer-components"].status = "completed";
  progress["program-flow"].status = "in-progress";

  const next = findNextRecommendedChallenge(CHALLENGES, progress);

  assert.equal(next.id, "program-flow");
  assert.equal(next.title, "\u7a0b\u5e8f\u8fd0\u884c\u8def\u7ebf");
});
