import { LEARNING_ITEMS } from "./platformLogic.js";
import { isParticipationChallenge, scoreLabelOf } from "./courseChapters.js";

const STATUS_LABELS = {
  completed: "已完成",
  "in-progress": "进行中",
  unlocked: "未开始",
  locked: "未解锁",
  recorded: "已记录",
};

function textOf(value) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOf(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateInfo(value, options) {
  const label = textOf(value);
  if (/^(?:刚刚|今天|昨天|前天|最近记录)$/.test(label)) {
    return { timestamp: null, dateLabel: label };
  }
  let milliseconds = NaN;
  if (value instanceof Date) {
    milliseconds = value.getTime();
  } else if (typeof value === "number" && Number.isFinite(value)) {
    // Support Unix seconds and JavaScript milliseconds without interpreting scores as dates.
    if (Math.abs(value) >= 1e9) milliseconds = Math.abs(value) < 1e12 ? value * 1000 : value;
  } else if (/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(label)) {
    const [year, month, day] = label.slice(0, 10).split("-").map(Number);
    const clock = label.match(/[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    const validCalendar = month >= 1 && month <= 12 && day >= 1
      && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
    const validClock = !clock || Number(clock[1]) <= 23 && Number(clock[2]) <= 59 && Number(clock[3] ?? 0) <= 59;
    if (!validCalendar || !validClock) return { timestamp: null, dateLabel: "最近记录" };
    // SQLite CURRENT_TIMESTAMP is UTC. Give a zone to otherwise zone-less API dates.
    const normalized = label.replace(" ", "T");
    milliseconds = Date.parse(normalized.length === 10 || /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized)
      ? normalized
      : `${normalized}Z`);
  }
  if (!Number.isFinite(milliseconds)) return { timestamp: null, dateLabel: "最近记录" };
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) return { timestamp: null, dateLabel: "最近记录" };
  const timestamp = date.toISOString();
  try {
    const parts = new Intl.DateTimeFormat(options.locale ?? "zh-CN", {
      timeZone: options.timeZone ?? "Asia/Shanghai",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
    return { timestamp, dateLabel: `${values.year}.${values.month}.${values.day} ${values.hour}:${values.minute}` };
  } catch {
    return { timestamp, dateLabel: timestamp.replace("T", " ").slice(0, 16) + " UTC" };
  }
}

function participationText(text) {
  const sanitized = text
    .replace(/(?:得分|评分|成绩|最佳(?:得分)?)\s*[:：]?\s*[-+]?\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?(?:\s*分)?/g, "参与型")
    .replace(/[-+]?\d+(?:\.\d+)?\s*分(?!钟)/g, "参与型");
  return sanitized.includes("参与型") ? sanitized : [sanitized, "参与型"].filter(Boolean).join(" · ");
}

function eventStatus(entry, content) {
  const passed = entry.passed ?? entry.result?.passed;
  if (passed === true || passed === 1) return "completed";
  if (passed === false || passed === 0) return "in-progress";
  const status = textOf(entry.status);
  if (STATUS_LABELS[status]) return status;
  if (["passed", "success"].includes(status)) return "completed";
  if (["failed", "retry"].includes(status)) return "in-progress";
  if (/未通过/.test(content)) return "in-progress";
  if (/(?:提交|检测|配置).*通过|探索完成|已完成/.test(content)) return "completed";
  return "recorded";
}

function eventOf(raw, index, catalog, options) {
  if (typeof raw !== "string" && (!raw || typeof raw !== "object" || Array.isArray(raw))) return null;
  const entry = typeof raw === "string" ? { message: raw } : raw;
  const explicitTitle = textOf(entry.title) || textOf(entry.challengeTitle) || textOf(entry.challenge_title);
  const content = textOf(entry.detail) || textOf(entry.message) || textOf(entry.text);
  const givenId = textOf(entry.challengeId) || textOf(entry.challenge_id);
  const challenge = catalog.find(({ id }) => id === givenId)
    ?? [...catalog].sort((a, b) => b.title.length - a.title.length)
      .find(({ title }) => explicitTitle === title || content.startsWith(title));
  const title = challenge?.title || explicitTitle || content;
  if (!title) return null;
  const status = eventStatus(entry, content);
  const parsedScore = content.match(/(?:得分|评分|成绩)\s*[:：]?\s*(-?\d+(?:\.\d+)?)/)?.[1];
  const score = numberOf(entry.score) ?? numberOf(entry.result?.score) ?? numberOf(parsedScore);
  const scoringItem = challenge ?? { grading: entry.grading };
  const scoreLabel = scoreLabelOf(scoringItem, { attempts: 1, bestScore: score ?? undefined });
  const eventLabel = status === "completed" ? "提交通过" : status === "in-progress" ? "提交未通过" : STATUS_LABELS[status];
  let detail = content.startsWith(title) ? content.slice(title.length).trim().replace(/^[·：:，,\s]+/, "") : content;
  if (!detail) detail = [eventLabel, scoreLabel !== "—" ? scoreLabel : ""].filter(Boolean).join(" · ");
  if (isParticipationChallenge(scoringItem)) detail = participationText(detail);
  const time = dateInfo(entry.timestamp ?? entry.createdAt ?? entry.created_at ?? entry.at ?? entry.completedAt, options);
  return {
    id: entry.id !== null && entry.id !== undefined ? String(entry.id) : `activity:${index}:${challenge?.id ?? "record"}`,
    title, detail, ...time,
    timestampKind: time.timestamp ? "event" : null,
    challengeId: challenge?.id ?? null,
    chapterId: challenge?.chapterId ?? null,
    status, statusLabel: STATUS_LABELS[status], scoreLabel,
    source: "activity-log", kind: "event",
  };
}

function progressItems(progress, catalog, options) {
  return catalog.flatMap((challenge) => {
    const record = progress?.[challenge.id];
    const attempts = Math.floor(numberOf(record?.attempts) ?? 0);
    if (attempts <= 0) return [];
    const status = STATUS_LABELS[record?.status] ? record.status : "recorded";
    const bestScore = numberOf(record.bestScore);
    const scoreLabel = scoreLabelOf(challenge, { attempts, bestScore: bestScore ?? undefined });
    const time = dateInfo(record.completedAt, options);
    return [{
      id: `progress:${challenge.id}`,
      title: challenge.title,
      detail: [
        STATUS_LABELS[status], `累计 ${attempts} 次尝试`,
        scoreLabel === "—" ? "" : isParticipationChallenge(challenge) ? scoreLabel : `最佳 ${scoreLabel}`,
      ].filter(Boolean).join(" · "),
      ...time,
      timestampKind: time.timestamp || time.dateLabel !== "最近记录" ? "completion" : null,
      challengeId: challenge.id,
      chapterId: challenge.chapterId ?? null,
      status, statusLabel: STATUS_LABELS[status], scoreLabel, attempts,
      source: "progress", kind: "summary",
    }];
  });
}

/**
 * Read-only recent records. Session strings have no event time; progress is one
 * aggregate per actually attempted learning item, never a reconstructed attempt log.
 * Known absolute times sort newest first; undated records retain their source order.
 * options: limit (0–6), timeZone, locale, and items (defaults to all LEARNING_ITEMS).
 */
export function buildRecentActivityModel(activityLog = [], progress = {}, options = {}) {
  options = options ?? {};
  const catalog = Array.isArray(options.items) ? options.items : LEARNING_ITEMS;
  const logItems = (Array.isArray(activityLog) ? activityLog : [])
    .map((entry, index) => eventOf(entry, index, catalog, options)).filter(Boolean);
  const fullItems = logItems.length ? logItems : progressItems(progress, catalog, options);
  fullItems.sort((a, b) => {
    if (a.timestamp && b.timestamp) return Date.parse(b.timestamp) - Date.parse(a.timestamp);
    if (a.timestamp) return -1;
    if (b.timestamp) return 1;
    return 0;
  });
  const ids = new Set();
  for (const item of fullItems) {
    const baseId = item.id;
    let suffix = 2;
    while (ids.has(item.id)) item.id = `${baseId}:${suffix++}`;
    ids.add(item.id);
  }
  const requestedLimit = numberOf(options.limit);
  const limit = requestedLimit === null ? 6 : Math.max(0, Math.min(6, Math.floor(requestedLimit)));
  return {
    items: fullItems.slice(0, limit), fullItems, total: fullItems.length,
    source: fullItems.length ? logItems.length ? "activity-log" : "progress" : "empty",
    hasKnownTimestamps: fullItems.some(({ timestamp }) => timestamp !== null),
  };
}
