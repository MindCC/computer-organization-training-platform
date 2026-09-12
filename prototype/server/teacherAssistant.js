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

export function buildTeacherAssistantMessages(payload) {
  return [
    {
      role: "user",
      content: [
        "你是《计算机组成原理》实验课的教师助教。",
        "只根据给定的班级学习数据生成教学建议，不编造不存在的学生行为。",
        "严格输出 JSON，不要 Markdown，不要额外解释。",
        "必须包含字段：lessonFocus、riskStudents、groupingPlan、commonMisconceptions、nextClassPlan、teacherScript。",
        "数据中的学生以代号表示（学生1、学生2…）：riskStudents 的 name 必须原样使用数据里的 label，不要编造或猜测姓名。",
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

  for (const key of ["commonMisconceptions", "nextClassPlan"]) {
    if (!reportSource[key].every((item) => typeof item === "string" && item.trim())) {
      throw new Error(`AI JSON 字段元素必须是非空字符串：${key}`);
    }
  }
  if (!reportSource.riskStudents.every((item) => (
    isPlainObject(item)
    && typeof item.name === "string" && item.name.trim()
    && typeof item.reason === "string" && item.reason.trim()
    && typeof item.suggestion === "string" && item.suggestion.trim()
  ))) {
    throw new Error("AI JSON 字段元素格式无效：riskStudents");
  }
  if (!reportSource.groupingPlan.every((item) => (
    isPlainObject(item)
    && typeof item.group === "string" && item.group.trim()
    && typeof item.activity === "string" && item.activity.trim()
    && (item.criteria == null || (typeof item.criteria === "string" && item.criteria.trim()))
  ))) {
    throw new Error("AI JSON 字段元素格式无效：groupingPlan");
  }

  return {
    lessonFocus: reportSource.lessonFocus.trim(),
    riskStudents: reportSource.riskStudents.map((item) => ({
      studentId: item.studentId ?? null,
      name: item.name.trim(),
      reason: item.reason.trim(),
      suggestion: item.suggestion.trim(),
    })),
    groupingPlan: reportSource.groupingPlan.map((item) => ({
      group: item.group.trim(),
      criteria: typeof item.criteria === "string" ? item.criteria.trim() : "",
      activity: item.activity.trim(),
    })),
    commonMisconceptions: reportSource.commonMisconceptions.map((item) => item.trim()),
    nextClassPlan: reportSource.nextClassPlan.map((item) => item.trim()),
    teacherScript: reportSource.teacherScript.trim(),
  };
}

/**
 * 构建教师助教数据，返回三份视图：
 *  - aiPayload：发往第三方接口的载荷。学生只用代号（学生1…），不含姓名与学号——
 *    姓名与学号属于学生个人信息，不应离开本机；
 *  - localPayload：本地规则回退使用，保留真实姓名（不离开本机，无隐私问题）；
 *  - roster：代号 → 学生身份的映射，用于把 AI 返回的代号换回真实姓名。
 */
export function buildTeacherAssistantData(db, classId) {
  const overview = getClassOverview(db, classId);
  const roster = [];
  const aiStudents = [];
  const localStudents = [];

  listClassStudents(db, classId).forEach((student, index) => {
    const progress = getStudentProgress(db, student.id);
    const summary = overview.students.find((item) => item.id === student.id)?.summary ?? {};
    const normalizedSummary = {
      completionRate: summary.completionRate ?? 0,
      averageScore: summary.averageScore ?? 0,
      totalAttempts: summary.totalAttempts ?? 0,
      totalStudyMinutes: summary.totalStudyMinutes ?? 0,
      weakSpot: normalizeWeakSpot(summary.weakSpot),
    };
    const progressRows = CHALLENGES.map((challenge) => {
      const record = progress[challenge.id] ?? {};
      return {
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        status: record.status ?? "locked",
        attempts: record.attempts ?? 0,
        bestScore: record.bestScore ?? 0,
        errors: Array.isArray(record.errors) ? record.errors : [],
      };
    });

    const label = `学生${index + 1}`;
    roster.push({ label, id: student.id, displayName: student.displayName, username: student.username });
    aiStudents.push({ label, summary: normalizedSummary, progress: progressRows });
    localStudents.push({
      id: student.id,
      username: student.username,
      displayName: student.displayName,
      summary: normalizedSummary,
      progress: progressRows,
    });
  });

  const base = {
    classId,
    className: getClassName(db, classId),
    summary: {
      studentCount: overview.summary?.studentCount ?? localStudents.length,
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
  };

  return {
    aiPayload: { ...base, students: aiStudents },
    localPayload: { ...base, students: localStudents },
    roster,
  };
}

/** 发往 AI 的载荷（学生以代号表示）。 */
export function buildTeacherAssistantPayload(db, classId) {
  return buildTeacherAssistantData(db, classId).aiPayload;
}

/** 把 AI 报告中的学生代号换回真实姓名与学号。无法匹配的文本原样保留。 */
export function restoreStudentNames(report, roster = []) {
  const byLabel = new Map(roster.map((entry) => [entry.label, entry]));
  return {
    ...report,
    riskStudents: (report.riskStudents ?? []).map((item) => {
      const entry = byLabel.get(String(item.name ?? "").trim());
      if (!entry) return { ...item, studentId: item.studentId ?? null };
      return { ...item, name: entry.displayName, studentId: entry.id };
    }),
  };
}

export async function generateTeacherAssistantReport(db, teacherId, classId, options = {}) {
  if (!teacherOwnsClass(db, teacherId, classId)) {
    const error = new Error("班级不存在");
    error.code = "CLASS_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }

  const { aiPayload, localPayload, roster } = buildTeacherAssistantData(db, classId);
  const config = readDeepSeekConfig(options.env ?? process.env);
  if (!config.enabled) {
    return buildFallbackAssistantReport(localPayload, "DEEPSEEK_API_KEY 未配置");
  }

  const aiRequester = options.aiRequester ?? requestChatCompletion;

  try {
    const text = await aiRequester(config, buildTeacherAssistantMessages(aiPayload), options);
    return {
      source: "ai",
      generatedAt: new Date().toISOString(),
      report: restoreStudentNames(parseAssistantJson(text), roster),
      fallbackReason: null,
    };
  } catch (error) {
    return buildFallbackAssistantReport(localPayload, error?.message ?? "AI 助教生成失败");
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


