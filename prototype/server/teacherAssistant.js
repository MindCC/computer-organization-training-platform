import { CHALLENGES } from "../src/platformLogic.js";
import { getClassOverview, getStudentProgress, listClassStudents, teacherOwnsClass } from "./db.js";
import { readDeepSeekConfig, requestChatCompletion } from "./aiClient.js";
import { buildRuleBasedAssistantReport } from "./teacherFallbackRules.js";

const REPORT_KEYS = [
  "lessonFocus",
  "riskStudents",
  "groupingPlan",
  "commonMisconceptions",
  "nextClassPlan",
  "teacherScript",
];

const EMPTY_DATA_TEXT = "暂无数据";
const NO_COMMON_ERROR_TEXT = "暂无高频错误";
const DEFAULT_FOCUS = "数据流方向和进位逻辑";

export function buildTeacherAssistantPayload(db, classId) {
  const overview = getClassOverview(db, classId);
  const students = listClassStudents(db, classId).map((student) => {
    const progress = getStudentProgress(db, student.id);
    const summary = overview.students.find((item) => item.id === student.id)?.summary ?? {};

    return {
      id: student.id,
      username: student.username,
      displayName: student.displayName,
      summary: {
        completionRate: summary.completionRate ?? 0,
        averageScore: summary.averageScore ?? 0,
        totalAttempts: summary.totalAttempts ?? 0,
        totalStudyMinutes: summary.totalStudyMinutes ?? 0,
        weakSpot: normalizeWeakSpot(summary.weakSpot),
      },
      progress: CHALLENGES.map((challenge) => {
        const record = progress[challenge.id] ?? {};
        return {
          challengeId: challenge.id,
          challengeTitle: challenge.title,
          status: record.status ?? "locked",
          attempts: record.attempts ?? 0,
          bestScore: record.bestScore ?? 0,
          errors: Array.isArray(record.errors) ? record.errors : [],
        };
      }),
    };
  });

  return {
    classId,
    className: getClassName(db, classId),
    summary: {
      studentCount: overview.summary?.studentCount ?? students.length,
      completionRate: overview.summary?.completionRate ?? 0,
      averageScore: overview.summary?.averageScore ?? 0,
      totalAttempts: overview.summary?.totalAttempts ?? 0,
      weakSpot: normalizeWeakSpot(overview.summary?.weakSpot),
    },
    challenges: CHALLENGES.map((challenge) => ({
      id: challenge.id,
      title: challenge.title,
      goal: challenge.goal,
    })),
    students,
  };
}

export function buildTeacherAssistantMessages(payload) {
  return [
    {
      role: "user",
      content: [
        "你是《计算机组成原理》实验课的教师助教。",
        "只根据给定的班级学习数据生成教学建议，不编造不存在的学生行为。",
        "严格输出 JSON，不要 Markdown，不要额外解释。",
        "必须包含字段：lessonFocus、riskStudents、groupingPlan、commonMisconceptions、nextClassPlan、teacherScript。",
        "不要输出密码、令牌、Cookie、学生原始笔记等敏感内容。",
        "以下是班级数据：",
        JSON.stringify(payload),
      ].join("\n"),
    },
  ];
}

export function buildFallbackAssistantReport(payload, reason) {
  return {
    source: "fallback",
    generatedAt: new Date().toISOString(),
    report: buildRuleBasedAssistantReport(payload),
    fallbackReason: normalizeReason(reason),
  };
}


export function parseAssistantJson(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("AI JSON 解析失败：返回内容为空");
  }

  const trimmed = text.trim();
  const normalizedText = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;

  let parsed;
  try {
    parsed = JSON.parse(normalizedText);
  } catch {
    throw new Error("AI JSON 解析失败：返回内容不是有效 JSON");
  }

  const reportSource = isPlainObject(parsed?.report) ? parsed.report : parsed;
  for (const key of REPORT_KEYS) {
    if (!(key in reportSource)) {
      throw new Error(`AI JSON 缺少字段：${key}`);
    }
  }
  if (typeof reportSource.lessonFocus !== "string" || !reportSource.lessonFocus.trim()) {
    throw new Error("AI JSON 字段不可为空：lessonFocus");
  }
  if (typeof reportSource.teacherScript !== "string" || !reportSource.teacherScript.trim()) {
    throw new Error("AI JSON 字段不可为空：teacherScript");
  }

  for (const key of ["riskStudents", "groupingPlan", "commonMisconceptions", "nextClassPlan"]) {
    if (!Array.isArray(reportSource[key])) {
      throw new Error(`AI JSON 字段必须是数组：${key}`);
    }
  }

  return REPORT_KEYS.reduce((result, key) => {
    result[key] = typeof reportSource[key] === "string" ? reportSource[key].trim() : reportSource[key];
    return result;
  }, {});
}

export async function generateTeacherAssistantReport(db, teacherId, classId, options = {}) {
  if (!teacherOwnsClass(db, teacherId, classId)) {
    const error = new Error("班级不存在");
    error.code = "CLASS_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }

  const payload = buildTeacherAssistantPayload(db, classId);
  const config = readDeepSeekConfig(options.env ?? process.env);
  if (!config.enabled) {
    return buildFallbackAssistantReport(payload, "DEEPSEEK_API_KEY 未配置");
  }

  const aiRequester = options.aiRequester ?? requestChatCompletion;

  try {
    const text = await aiRequester(config, buildTeacherAssistantMessages(payload), options);
    return {
      source: "ai",
      generatedAt: new Date().toISOString(),
      report: parseAssistantJson(text),
      fallbackReason: null,
    };
  } catch (error) {
    return buildFallbackAssistantReport(payload, error?.message ?? "AI 助教生成失败");
  }
}

function getClassName(db, classId) {
  return db.prepare("SELECT name FROM classes WHERE id = ?").get(classId)?.name ?? `班级 ${classId}`;
}

function normalizeWeakSpot(value) {
  if (typeof value !== "string" || !value.trim() || value === NO_COMMON_ERROR_TEXT) {
    return EMPTY_DATA_TEXT;
  }
  return value.trim();
}

function normalizeFocus(value) {
  if (typeof value !== "string" || !value.trim() || value === EMPTY_DATA_TEXT) {
    return DEFAULT_FOCUS;
  }
  return value.trim();
}

function normalizeReason(reason) {
  if (typeof reason !== "string" || !reason.trim()) {
    return "AI 助教暂不可用";
  }
  return reason.trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}


