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
  // 路线分组与教材八章一一对应，顺序稳定。
  assert.deepEqual(groups.map((group) => group.id), ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7", "ch8"]);
  assert.deepEqual(groups.map((group) => group.number), [1, 2, 3, 4, 5, 6, 7, 8]);

  // 硬件配置挑战按自身 chapterId 归入第一章与第四章，不再有独立的 hardware 组。
  assert.equal(groups.some((group) => group.id === "hardware"), false);
  const ch1Items = groups.find((group) => group.id === "ch1").items.map((item) => item.id);
  const ch4Items = groups.find((group) => group.id === "ch4").items.map((item) => item.id);
  assert.deepEqual([...ch1Items, ...ch4Items].filter((id) => HARDWARE_ROUTE_IDS.includes(id)).sort(), [...HARDWARE_ROUTE_IDS].sort());
});

test("hardware route items fall back when the challenge record is missing", () => {
  const progress = buildInitialLearningProgress();
  const groups = buildCourseRouteGroups(CHALLENGES, progress);
  const ch1Group = groups.find((group) => group.id === "ch1");
  const item = ch1Group.items.find((route) => route.id === "game-office-pc");

  assert.equal(item.title, "办公电脑");
  assert.equal(item.description, ch1Group.description);
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
  const ch1 = groups.find((group) => group.id === "ch1");
  const ch4 = groups.find((group) => group.id === "ch4");
  const hardware = [...ch1.items, ...ch4.items].filter((item) => HARDWARE_ROUTE_IDS.includes(item.id));

  assert.deepEqual(hardware.map((item) => item.id).sort(), [...HARDWARE_ROUTE_IDS].sort());
  assert.ok(hardware.every((item) => item.title && item.title !== item.id));
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
  progress["data-flow"].status = "completed";
  progress["and-gate"].status = "in-progress";
  const groups = buildCourseRouteGroups(CHALLENGES, progress);
  const ch3 = groups.find((group) => group.id === "ch3");
  const ch3Length = ch3.items.length;

  assert.deepEqual(ch3.items.map((item) => item.sequence), Array.from({ length: ch3Length }, (_, index) => index));
  assert.equal(ch3.items[0].id, "data-flow");
  assert.equal(ch3.items[0].status, "completed");
  assert.equal(ch3.items[0].statusLabel, "已完成");
  assert.equal(ch3.items[0].estimatedLabel, "8 分钟");
  assert.equal(ch3.items[1].id, "and-gate");
  assert.equal(ch3.items[1].status, "in-progress");
  assert.equal(ch3.items[1].statusLabel, "进行中");
  assert.equal(ch3.items[2].status, "locked");
  assert.equal(ch3.items[2].statusLabel, "未解锁");
});

test("course route items normalize missing progress to not-started", () => {
  const groups = buildCourseRouteGroups(CHALLENGES, {});
  const first = groups[0].items[0];

  assert.equal(first.status, "not-started");
  assert.equal(first.statusLabel, "未开始");
  assert.equal(first.sequence, 0);
  assert.equal(first.estimatedLabel, "8 分钟");
});

test("第六、七、八章在学习路线中各有实验", () => {
  const groups = buildCourseRouteGroups(CHALLENGES, buildInitialLearningProgress());
  const byId = new Map(groups.map((group) => [group.id, group.items.map((item) => item.id)]));

  assert.ok(byId.get("ch6").includes("cpu-datapath"), "ch6 应包含 CPU 数据通路实验");
  assert.ok(byId.get("ch7").includes("system-bus"), "ch7 应包含三总线实验");
  assert.ok(byId.get("ch8").includes("io-transfer"), "ch8 应包含 I/O 传送实验");
  assert.equal(groups.every((group) => group.items.length > 0), true, "八章每章至少一个路线项目");
});
