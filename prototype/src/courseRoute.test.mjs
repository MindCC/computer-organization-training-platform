import test from "node:test";
import assert from "node:assert/strict";
import { CHALLENGES, buildInitialLearningProgress } from "./platformLogic.js";
import { buildCourseRouteGroups, findNextRecommendedChallenge } from "./courseRoute.js";

test("course route groups every challenge exactly once", () => {
  const progress = buildInitialLearningProgress();
  const groups = buildCourseRouteGroups(CHALLENGES, progress);
  const groupedIds = groups.flatMap((group) => group.items.map((item) => item.id));

  assert.deepEqual([...new Set(groupedIds)].sort(), CHALLENGES.map((item) => item.id).sort());
  assert.ok(groups.some((group) => group.id === "overview"));
  assert.ok(groups.some((group) => group.id === "logic"));
  assert.ok(groups.some((group) => group.id === "storage"));
});

test("course route recommends the first in-progress or unlocked challenge", () => {
  const progress = buildInitialLearningProgress();
  progress["computer-components"].status = "completed";
  progress["program-flow"].status = "in-progress";

  const next = findNextRecommendedChallenge(CHALLENGES, progress);

  assert.equal(next.id, "program-flow");
  assert.equal(next.title, "程序运行路线");
});
