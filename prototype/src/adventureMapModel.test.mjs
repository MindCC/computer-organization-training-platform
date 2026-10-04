import test from "node:test";
import assert from "node:assert/strict";
import { buildAdventureMap } from "./adventureMapModel.js";
import { CHALLENGES, LEARNING_ITEMS, buildInitialLearningProgress, recordAttempt } from "./platformLogic.js";
import { COURSE_CHAPTERS, scoreLabelOf } from "./courseChapters.js";
import { dependenciesOf } from "./challengeDependencies.js";

const pass = { passed: true, score: 100, errors: [], elapsedMinutes: 3 };
const region = (map, id) => map.regions.find((entry) => entry.chapterId === id);

test("eight regions cover every real circuit and hardware order in its textbook chapter", () => {
  const map = buildAdventureMap();
  assert.deepEqual(map.regions.map((entry) => entry.chapterId), COURSE_CHAPTERS.map((chapter) => chapter.id));
  const items = map.regions.flatMap((entry) => entry.items);
  assert.equal(CHALLENGES.length, 30);
  assert.equal(items.filter((item) => item.kind === "hardware").length, 6);
  assert.deepEqual(items.map((item) => item.id).sort(), LEARNING_ITEMS.map((item) => item.id).sort());
  assert.equal(new Set(items.map((item) => item.id)).size, LEARNING_ITEMS.length);
  for (const entry of map.regions) {
    assert.deepEqual(entry.items.map((item) => item.id), LEARNING_ITEMS.filter((item) => item.chapterId === entry.chapterId).map((item) => item.id));
  }
});

test("missing records use the existing initial progress without inventing an unlock chain", () => {
  const initial = buildInitialLearningProgress();
  const map = buildAdventureMap();
  for (const item of map.regions.flatMap((entry) => entry.items)) assert.deepEqual(item.record, initial[item.id]);
  assert.equal(map.currentRegionId, "ch1");
  assert.equal(region(map, "ch1").state, "available");
  assert.equal(region(map, "ch4").state, "available", "the original storage orders are already open in platform defaults");
  for (const id of ["ch2", "ch3", "ch5", "ch6", "ch7", "ch8"]) assert.equal(region(map, id).state, "locked");
  assert.equal(map.completed, 0);
  assert.equal(map.completedRegions, 0);
});

test("partial completion and real attempts explore a region; every registered item must complete to light it", () => {
  let progress = buildInitialLearningProgress();
  for (const item of CHALLENGES.filter((item) => item.chapterId === "ch1")) progress = recordAttempt(progress, item.id, pass);
  let map = buildAdventureMap(progress);
  assert.equal(region(map, "ch1").state, "exploring", "unfinished hardware orders keep the camp in progress");
  assert.equal(region(map, "ch1").completed, 2);
  for (const item of LEARNING_ITEMS.filter((item) => item.chapterId === "ch1")) progress[item.id] = { ...progress[item.id], status: "completed", attempts: 1 };
  map = buildAdventureMap(progress);
  assert.equal(region(map, "ch1").state, "completed");
  assert.equal(map.completedRegions, 1);
  progress["parity-check"] = { ...progress["parity-check"], status: "in-progress", attempts: 2, bestScore: 50 };
  assert.equal(region(buildAdventureMap(progress), "ch2").state, "exploring");
});

test("a locked chapter remains browsable and carries actual dependency guidance for preview", () => {
  const map = buildAdventureMap();
  const entry = region(map, "ch6");
  assert.equal(entry.state, "locked");
  const cpu = entry.items.find((item) => item.id === "cpu-datapath");
  assert.equal(cpu.actionLabel, "进入预习");
  assert.equal(cpu.canOpen, true);
  assert.deepEqual(cpu.missingPrerequisites.map((item) => item.id), dependenciesOf(cpu.id));
  assert.match(cpu.prerequisiteHint, /简化 ALU/);
  assert.match(cpu.prerequisiteHint, /指令和数据/);
});

test("map availability uses the platform's historical-lock repair and preserves classroom overrides", () => {
  const progress = buildInitialLearningProgress();
  progress["machine-number"] = { ...progress["machine-number"], status: "completed", attempts: 1 };
  const map = buildAdventureMap(progress);
  assert.equal(region(map, "ch3").state, "available", "the shared lock repair opens data-flow when machine-number is complete");
  assert.equal(region(map, "ch2").state, "exploring");
  assert.equal(progress["data-flow"].status, "locked");
  const override = buildAdventureMap({ "cpu-datapath": { status: "in-progress", attempts: 0 } });
  assert.equal(region(override, "ch6").state, "available", "a classroom or allow-skip override is not re-locked by missing dependencies");
});

test("participation is labelled by the shared score helper and genuine scored zero remains zero", () => {
  const progress = {
    "computer-components": { status: "completed", attempts: 1, bestScore: 0 },
    "and-gate": { status: "in-progress", attempts: 1, bestScore: 0 },
  };
  const map = buildAdventureMap(progress);
  const items = map.regions.flatMap((entry) => entry.items);
  const participation = items.find((item) => item.id === "computer-components");
  const graded = items.find((item) => item.id === "and-gate");
  const untouched = items.find((item) => item.id === "parity-check");
  assert.equal(participation.scoreLabel, "参与型");
  assert.equal(graded.scoreLabel, "0 分");
  assert.equal(untouched.scoreLabel, "—");
  for (const item of items) assert.equal(item.scoreLabel, scoreLabelOf(item, item.record));
});

test("the recommendation follows the shared chapter route, including hardware; complete courses have no marker", () => {
  let progress = buildInitialLearningProgress();
  progress = recordAttempt(progress, "computer-components", pass);
  progress = recordAttempt(progress, "program-flow", pass);
  assert.equal(buildAdventureMap(progress).currentRegionId, "ch1", "unfinished first-chapter hardware remains the shared next recommendation");
  for (const item of LEARNING_ITEMS.filter((item) => item.chapterId === "ch1")) progress[item.id] = { ...progress[item.id], status: "completed", attempts: 1 };
  assert.equal(buildAdventureMap(progress).currentRegionId, "ch2");
  for (const item of LEARNING_ITEMS) progress[item.id] = { ...progress[item.id], status: "completed", attempts: 1 };
  const map = buildAdventureMap(progress);
  assert.equal(map.currentRegionId, null);
  assert.equal(map.completed, LEARNING_ITEMS.length);
  assert.equal(map.completedRegions, 8);
});
