import test from "node:test";
import assert from "node:assert/strict";
import { CHALLENGES, LEARNING_ITEMS, buildInitialLearningProgress } from "./platformLogic.js";
import { buildCourseRouteGroups, findNextRecommendedChallenge, formatEstimatedMinutes } from "./courseRoute.js";
import { HARDWARE_GAME_PROGRESS_ITEMS } from "./hardwareGame.js";

const HARDWARE_ROUTE_IDS = HARDWARE_GAME_PROGRESS_ITEMS.map((item) => item.id);

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
test("course route tolerates missing challenge input without exposing internal ids", () => {
  const groups = buildCourseRouteGroups(null, {});
  const hardware = groups.find((group) => group.id === "hardware");

  assert.deepEqual(hardware.items.map((item) => item.id), HARDWARE_ROUTE_IDS);
  assert.ok(hardware.items.every((item) => item.title && item.title !== item.id));
});

test("recommended challenge contains all fields required by the home screen", () => {
  const progress = buildInitialLearningProgress();
  const next = findNextRecommendedChallenge(LEARNING_ITEMS, progress);

  assert.equal(next.id, "computer-components");
  assert.equal(next.title, "认识计算机五大部件");
  assert.equal(typeof next.principle, "string");
  assert.ok(next.principle.length > 0);
  assert.equal(next.estimatedMinutes, 8);
});

test("estimated time never renders a negative or placeholder minute count", () => {
  assert.equal(formatEstimatedMinutes(undefined), "待评估");
  assert.equal(formatEstimatedMinutes(-1), "待评估");
  assert.equal(formatEstimatedMinutes(0), "待评估");
  assert.equal(formatEstimatedMinutes(8), "8 分钟");
});

test("course route items expose normalized status labels and stable display metadata", () => {
  const progress = buildInitialLearningProgress();
  progress["computer-components"].status = "completed";
  progress["program-flow"].status = "in-progress";
  const groups = buildCourseRouteGroups(CHALLENGES, progress);
  const overview = groups.find((group) => group.id === "overview");

  assert.deepEqual(overview.items.map((item) => item.sequence), [0, 1, 2]);
  assert.equal(overview.items[0].status, "completed");
  assert.equal(overview.items[0].statusLabel, "已完成");
  assert.equal(overview.items[0].estimatedLabel, "8 分钟");
  assert.equal(overview.items[1].status, "in-progress");
  assert.equal(overview.items[1].statusLabel, "进行中");
  assert.equal(overview.items[2].status, "locked");
  assert.equal(overview.items[2].statusLabel, "未解锁");
});

test("course route items normalize missing progress to not-started", () => {
  const groups = buildCourseRouteGroups(CHALLENGES, {});
  const first = groups[0].items[0];

  assert.equal(first.status, "not-started");
  assert.equal(first.statusLabel, "未开始");
  assert.equal(first.sequence, 0);
  assert.equal(first.estimatedLabel, "8 分钟");
});
