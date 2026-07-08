import test from "node:test";
import assert from "node:assert/strict";

import { buildRuleBasedAssistantReport } from "./teacherFallbackRules.js";

test("detects machine number weakness from low score and errors", () => {
  const report = buildRuleBasedAssistantReport({
    students: [
      student("1", "李同学", [
        progress("machine-number", 55, 3, ["补码转换错误"]),
      ]),
    ],
    summary: { weakSpot: "暂无数据" },
  });

  assert.match(report.lessonFocus, /补码|机器数/);
  assert.ok(report.commonMisconceptions.some((item) => /补码/.test(item)));
  assert.ok(report.evidence.some((item) => item.type === "machine_number"));
});

test("detects carry path weakness from adder errors", () => {
  const report = buildRuleBasedAssistantReport({
    students: [
      student("1", "李同学", [progress("full-adder", 62, 4, ["Cout 缺失"])]),
      student("2", "王同学", [progress("half-adder", 60, 3, ["进位输出错误"])]),
    ],
    summary: { weakSpot: "暂无数据" },
  });

  assert.match(report.lessonFocus, /进位|Cout/);
  assert.ok(report.evidence.some((item) => item.type === "carry_path"));
});

test("detects storage system weakness", () => {
  const report = buildRuleBasedAssistantReport({
    students: [
      student("1", "李同学", [progress("memory-address", 58, 3, ["MAR 与 MDR 混淆"])]),
    ],
    summary: { weakSpot: "暂无数据" },
  });

  assert.match(report.lessonFocus, /MAR|MDR|存储/);
  assert.ok(report.evidence.some((item) => item.type === "storage_system"));
});

test("detects hardware budget tradeoff weakness", () => {
  const report = buildRuleBasedAssistantReport({
    students: [
      student("1", "李同学", [progress("game-office-pc", 68, 2, ["预算超限"])]),
    ],
    summary: { weakSpot: "暂无数据" },
  });

  assert.match(report.lessonFocus, /预算|配置|取舍/);
  assert.ok(report.evidence.some((item) => item.type === "hardware_tradeoff"));
});

test("separates progress risk from ability risk", () => {
  const report = buildRuleBasedAssistantReport({
    students: [
      {
        id: 1,
        displayName: "慢进度学生",
        username: "2026001",
        summary: { completionRate: 20, averageScore: 92, totalAttempts: 2 },
        progress: [],
      },
    ],
    summary: { weakSpot: "暂无数据" },
  });

  assert.ok(report.riskStudents.some((item) => /进度/.test(item.reason)));
  assert.ok(report.evidence.some((item) => item.type === "progress_risk"));
});

function student(id, displayName, progressItems) {
  return {
    id,
    displayName,
    username: `2026${id}`,
    summary: { completionRate: 50, averageScore: 65, totalAttempts: 4 },
    progress: progressItems,
  };
}

function progress(challengeId, bestScore, attempts, errors) {
  return { challengeId, bestScore, attempts, errors, status: bestScore >= 80 ? "completed" : "in-progress" };
}
