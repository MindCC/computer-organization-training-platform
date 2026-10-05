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
  "evidenceRefs",
];

const EMPTY_DATA_TEXT = "暂无数据";
const NO_COMMON_ERROR_TEXT = "暂无高频错误";
const DEFAULT_FOCUS = "数据流方向和进位逻辑";

export function buildTeacherAssistantMessages(payload, evidence = []) {
  return [
    {
      role: "user",
      content: [
        "你是《计算机组成原理》实验课的教师助教。",
        "只根据给定的班级学习数据生成教学建议，不编造不存在的学生行为。",
        "严格输出 JSON，不要 Markdown，不要额外解释。",
        "必须包含字段：lessonFocus、riskStudents、groupingPlan、commonMisconceptions、nextClassPlan、teacherScript、evidenceRefs。",
        "evidenceRefs 只能引用下面提供的证据编号；有证据时至少引用一条，不可编造编号、人数或关卡。",
        "数据中的学生以代号表示（学生1、学生2…）：riskStudents 的 name 必须原样使用数据里的 label，不要编造或猜测姓名。",
        "不要输出密码、令牌、Cookie、学生原始笔记等敏感内容。",
        "以下是班级数据：",
        JSON.stringify(payload),
        "可引用的证据：",
        JSON.stringify(evidence),
      ].join("\n"),
    },
  ];
}

export function buildFallbackAssistantReport(payload, reason) {
  const report = buildRuleBasedAssistantReport(payload);
  return {
    source: "fallback",
    generatedAt: new Date().toISOString(),
    report: { ...report, evidence: buildTeacherEvidence(payload, report) },
    fallbackReason: normalizeReason(reason),
  };
}


export function parseAssistantJson(text, allowedEvidence = []) {
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
  const evidenceById = new Map(allowedEvidence.map((item) => [item.id, item]));
  if (!Array.isArray(reportSource.evidenceRefs)
    || !reportSource.evidenceRefs.every((id) => typeof id === "string" && evidenceById.has(id))
    || new Set(reportSource.evidenceRefs).size !== reportSource.evidenceRefs.length
    || (allowedEvidence.length > 0 && reportSource.evidenceRefs.length === 0)) {
    throw new Error("AI JSON evidenceRefs 必须引用已有证据编号");
  }

  return {
    lessonFocus: reportSource.lessonFocus.trim(),
    riskStudents: reportSource.riskStudents.map((item) => ({
      studentId: null,
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
    evidence: reportSource.evidenceRefs.map((id) => evidenceById.get(id)),
  };
}

function buildTeacherEvidence(payload, report = buildRuleBasedAssistantReport(payload)) {
  const rows = [...(report.evidence ?? [])];
  const summary = payload.summary ?? {};
  if ((summary.studentCount ?? 0) > 0) {
    rows.unshift({
      type: "class_summary",
      label: `班级整体：${summary.studentCount} 人，完成率 ${summary.completionRate ?? 0}%，平均分 ${summary.averageScore ?? 0}`,
      count: summary.studentCount,
      studentIds: [],
      challengeIds: [],
    });
  }
  return rows.map((item, index) => ({ id: `E${index + 1}`, ...item }));
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
  const evidence = buildTeacherEvidence(localPayload);
  const labelById = new Map(roster.map((item) => [item.id, item.label]));
  const aiEvidence = evidence.map(({ id, type, label, count, studentIds, challengeIds }) => ({
    id, type, label, count,
    studentLabels: studentIds.map((studentId) => labelById.get(studentId)).filter(Boolean),
    challengeIds,
  }));
  const config = readDeepSeekConfig(options.env ?? process.env);
  if (!config.enabled) {
    return buildFallbackAssistantReport(localPayload, "DEEPSEEK_API_KEY 未配置");
  }

  const aiRequester = options.aiRequester ?? requestChatCompletion;

  try {
    const text = await aiRequester(config, buildTeacherAssistantMessages(aiPayload, aiEvidence), options);
    const parsed = parseAssistantJson(text, evidence);
    const knownLabels = new Set(roster.map((student) => student.label));
    if (parsed.riskStudents.some((student) => !knownLabels.has(student.name))) {
      throw new Error("AI 报告引用了班级以外的学生");
    }
    return {
      source: "ai",
      generatedAt: new Date().toISOString(),
      report: restoreStudentNames(parsed, roster),
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


