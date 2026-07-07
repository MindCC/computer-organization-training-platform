import test from "node:test";
import assert from "node:assert/strict";

import {
  HARDWARE_GAME_CASES,
  gradeHardwareBuild,
  summarizeHardwareGameAttempts,
  formatHardwareBuildParts,
  hardwareCaseTitle,
} from "./hardwareGame.js";

test("hardware game ships six classroom cases split by overview and storage chapters", () => {
  assert.equal(HARDWARE_GAME_CASES.length, 6);
  assert.deepEqual(
    [...new Set(HARDWARE_GAME_CASES.map((item) => item.chapter))],
    ["overview", "storage"],
  );
});

test("hardware game scores a build by target completion", () => {
  const result = gradeHardwareBuild("game-office-pc", {
    cpu: "cpu-i3",
    memory: "mem-8",
    storage: "ssd-512",
    gpu: "gpu-integrated",
  });

  assert.equal(result.passed, true);
  assert.equal(result.score, 100);
  assert.equal(result.errors.length, 0);
  assert.equal(result.metrics.totalPrice <= result.targets.budget, true);
});

test("hardware game reports concrete bottlenecks when targets are missed", () => {
  const result = gradeHardwareBuild("game-video-storage", {
    cpu: "cpu-i3",
    memory: "mem-8",
    storage: "hdd-1tb",
    gpu: "gpu-integrated",
  });

  assert.equal(result.passed, false);
  assert.equal(result.errors.some((error) => error.type === "存储速度不足"), true);
  assert.equal(result.errors.some((error) => error.type === "容量不足"), true);
  assert.equal(result.errors.some((error) => error.type === "图形性能不足"), true);
  assert.equal(result.score < 100, true);
});

test("hardware game teacher summary exposes frequent bottlenecks and typical high-score builds", () => {
  const attempts = [
    {
      challengeId: "game-office-pc",
      score: 100,
      result: gradeHardwareBuild("game-office-pc", { cpu: "cpu-i3", memory: "mem-8", storage: "ssd-512", gpu: "gpu-integrated" }),
    },
    {
      challengeId: "game-video-storage",
      score: 40,
      result: gradeHardwareBuild("game-video-storage", { cpu: "cpu-i3", memory: "mem-8", storage: "hdd-1tb", gpu: "gpu-integrated" }),
    },
  ];

  const summary = summarizeHardwareGameAttempts(attempts);

  assert.equal(summary.completedCases, 1);
  assert.equal(summary.averageScore, 70);
  assert.equal(summary.frequentBottlenecks[0].type, "存储速度不足");
  assert.equal(summary.typicalBuilds[0].caseId, "game-office-pc");
});

test("hardware game formats teacher-facing case titles and build parts", () => {
  assert.equal(hardwareCaseTitle("game-office-pc"), "\u529e\u516c\u7535\u8111");
  const result = gradeHardwareBuild("game-office-pc", { cpu: "cpu-i3", memory: "mem-8", storage: "ssd-512", gpu: "gpu-integrated" });
  assert.equal(formatHardwareBuildParts(result.selectedParts), "\u5165\u95e8\u7ea7 CPU / 8GB \u5185\u5b58 / 512GB \u56fa\u6001\u786c\u76d8 / \u96c6\u6210\u663e\u5361");
});


test("hardware game reports business metrics and customer recommendation", () => {
  const result = gradeHardwareBuild("game-office-pc", {
    cpu: "cpu-i5",
    memory: "mem-16",
    storage: "ssd-512",
    gpu: "gpu-integrated",
  });

  assert.equal(typeof result.quotePrice, "number");
  assert.equal(typeof result.profit, "number");
  assert.equal(typeof result.satisfaction, "number");
  assert.equal(result.satisfaction >= 0 && result.satisfaction <= 100, true);
  assert.equal(Array.isArray(result.marketTags), true);
  assert.equal(result.marketTags.length > 0, true);
  assert.equal(typeof result.recommendation, "string");
});
