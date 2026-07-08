import { LEARNING_ITEMS } from "../src/platformLogic.js";

const itemTitleById = new Map(LEARNING_ITEMS.map((item) => [item.id, item.title ?? item.shortTitle ?? item.id]));
const statusText = {
  completed: "已完成",
  "in-progress": "进行中",
  unlocked: "未开始",
  locked: "未解锁",
};

export function buildStudentMarkdownReport({ user, summary, progress, notes = [], generatedAt = new Date() }) {
  const lines = [
    "# 计算机组成原理实验报告",
    "",
    `- 姓名：${safeText(user?.displayName)}`,
    `- 学号：${safeText(user?.username)}`,
    `- 导出时间：${formatDateTime(generatedAt)}`,
    "",
    "## 学习概览",
    "",
    `- 完成率：${Number(summary?.completionRate ?? 0)}%`,
    `- 平均分：${Number(summary?.averageScore ?? 0)}`,
    `- 尝试次数：${Number(summary?.totalAttempts ?? 0)}`,
    `- 高频问题：${safeText(summary?.weakSpot ?? "暂无数据")}`,
    "",
    "## 关卡记录",
    "",
    "| 关卡 | 状态 | 最高分 | 尝试次数 | 累计耗时 | 错误反馈 |",
    "| --- | --- | ---: | ---: | ---: | --- |",
  ];

  for (const [challengeId, record] of Object.entries(progress ?? {})) {
    const title = itemTitleById.get(challengeId) ?? challengeId;
    const errors = formatErrors(record.errors);
    lines.push(`| ${escapeTable(title)} | ${escapeTable(challengeId)} | ${statusText[record.status] ?? record.status ?? "未知"} | ${Number(record.bestScore ?? 0)} | ${Number(record.attempts ?? 0)} | ${Number(record.timeSpentMinutes ?? 0)} 分钟 | ${escapeTable(errors)} |`);
  }

  if (Object.keys(progress ?? {}).some((challengeId) => challengeId.startsWith("game-"))) {
    lines.push("", "## 硬件配置挑战", "");
    lines.push("硬件配置挑战用于复盘预算、性能、容量与客户目标之间的取舍。详细成绩见上方关卡记录。");
  }

  lines.push("", "## 学习笔记", "");
  if (!notes.length) {
    lines.push("暂无学习笔记。");
  } else {
    for (const note of notes) {
      const challenge = note.challengeId ? `（${itemTitleById.get(note.challengeId) ?? note.challengeId}）` : "";
      lines.push(`### ${safeText(note.title || "实验复盘")}${challenge}`);
      lines.push("");
      lines.push(`- 标签：${safeText(note.tag || "未分类")}`);
      lines.push(`- 时间：${safeText(note.createdAt || "未记录")}`);
      lines.push("");
      lines.push(safeText(note.content));
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

function formatErrors(errors = []) {
  if (!errors.length) return "无";
  return errors.map((error) => {
    if (typeof error === "string") return error;
    return error.message ?? error.type ?? JSON.stringify(error);
  }).join("；");
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function safeText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function escapeTable(value) {
  return safeText(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

