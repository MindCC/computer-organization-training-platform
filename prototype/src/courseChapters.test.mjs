import test from "node:test";
import assert from "node:assert/strict";

import {
  COURSE_CHAPTERS,
  buildChapterChallengeIds,
  chapterIdOf,
  findUnassignedChallenges,
  getChallengesByChapterId,
  gradingKindOf,
  isGradedChallenge,
  isParticipationChallenge,
  isValidChapterId,
  summarizeGradingKinds,
} from "./courseChapters.js";
import { COURSEWARE, getChallengesByChapter } from "./courseware.js";
import { CHALLENGES, LEARNING_ITEMS } from "./platformLogic.js";
import { HARDWARE_GAME_CASES } from "./hardwareGame.js";

test("教材章节清单固定为八章且顺序稳定", () => {
  assert.deepEqual(COURSE_CHAPTERS.map((chapter) => chapter.id), [
    "ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7", "ch8",
  ]);
  assert.deepEqual(COURSE_CHAPTERS.map((chapter) => chapter.number), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("每个实验都归入一个教材章节", () => {
  assert.deepEqual(findUnassignedChallenges(), [], "存在没有 chapterId 或章节号非法的实验");
  for (const item of LEARNING_ITEMS) {
    assert.equal(isValidChapterId(chapterIdOf(item)), true, `${item.id} 的 chapterId 非法`);
  }
});

test("章节聚合不重不漏地覆盖全部实验", () => {
  const grouped = buildChapterChallengeIds();
  const collected = [...grouped.values()].flat();
  assert.equal(collected.length, LEARNING_ITEMS.length, "章节聚合的实验总数应与学习条目一致");
  assert.equal(new Set(collected).size, collected.length, "同一实验不应出现在多个章节");
  assert.deepEqual([...collected].sort(), LEARNING_ITEMS.map((item) => item.id).sort());
});

test("课件章节与实验自身的 chapterId 保持一致", () => {
  for (const chapter of COURSEWARE.chapters) {
    assert.deepEqual(
      chapter.linkedChallenges,
      getChallengesByChapterId(chapter.id),
      `${chapter.id} 的 linkedChallenges 应由实验的 chapterId 派生`,
    );
  }
  // 全部八章都已有实验：六、七、八章的缺口（docs/chapter-labs-review-2026-09-12.md 阶段 2）
  // 已由 cpu-datapath、system-bus、io-transfer 补齐，本断言收紧为八章全覆盖。
  for (const chapterId of ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7", "ch8"]) {
    assert.equal(getChallengesByChapterId(chapterId).length > 0, true, `${chapterId} 应至少有一个实验`);
  }
  assert.deepEqual(
    COURSEWARE.chapters.filter((chapter) => chapter.linkedChallenges.length === 0).map((chapter) => chapter.id),
    [],
    "空章节清单发生变化时，请同步更新 docs/chapter-labs-review-2026-09-12.md",
  );
});

test("每个电路关卡都能从章节视图反查到自己所属章节", () => {
  for (const challenge of CHALLENGES) {
    assert.equal(
      getChallengesByChapter(challenge.chapterId).includes(challenge.id),
      true,
      `${challenge.id} 没有出现在 ${challenge.chapterId} 的章节实验列表里`,
    );
  }
});

test("硬件配置挑战按真实场景归类，不再使用 overview/storage 旧标签", () => {
  for (const gameCase of HARDWARE_GAME_CASES) {
    assert.equal(isValidChapterId(gameCase.chapterId), true, `${gameCase.id} 缺少合法 chapterId`);
    assert.equal(gameCase.chapter, undefined, `${gameCase.id} 不应再保留旧的 chapter 字段`);
  }
  assert.equal(getChallengesByChapter("ch4").includes("game-archive-storage"), true);
  assert.equal(getChallengesByChapter("ch1").includes("game-office-pc"), true);
});

test("参与型活动与评分型实验被明确区分", () => {
  const summary = summarizeGradingKinds();
  assert.equal(summary.total, LEARNING_ITEMS.length);

  // 只有完成/参与信号、服务端无法复算的关卡必须是参与型。
  for (const id of ["computer-components", "program-flow", "instruction-data", "memory-address", "machine-number", "data-flow"]) {
    const item = LEARNING_ITEMS.find((entry) => entry.id === id);
    assert.equal(isParticipationChallenge(item), true, `${id} 应为参与型活动`);
    assert.equal(isGradedChallenge(item), false, `${id} 不应被当作评分型实验`);
  }

  // 有结构化判定证据的关卡与全部硬件配置挑战必须是评分型。
  for (const id of ["and-gate", "or-gate", "not-gate", "xor-gate", "half-adder", "full-adder", "multi-adder", "mux", "alu", "cpu-datapath", "system-bus", "io-transfer"]) {
    const item = LEARNING_ITEMS.find((entry) => entry.id === id);
    assert.equal(isGradedChallenge(item), true, `${id} 应为评分型实验`);
  }
  for (const gameCase of HARDWARE_GAME_CASES) {
    assert.equal(isGradedChallenge(gameCase), true, `${gameCase.id} 为可复算的评分型挑战`);
  }
});

test("未标注判分类型的条目按评分型处理，不会静默变成参与型", () => {
  assert.equal(gradingKindOf({ id: "unknown" }), "graded");
  assert.equal(gradingKindOf(null), "graded");
});
