import { LEARNING_ITEMS } from "./platformLogic.js";
import { HARDWARE_GAME_PROGRESS_ITEMS } from "./hardwareGame.js";

const ROUTE_GROUP_DEFINITIONS = [
  {
    id: "overview",
    title: "计算机概览",
    description: "先建立整机、程序、指令与数据流的整体图景。",
    challengeIds: ["computer-components", "program-flow", "instruction-data"],
  },
  {
    id: "logic",
    title: "基础逻辑门",
    description: "从数据流出发，理解基本逻辑门如何形成判断。",
    challengeIds: ["data-flow", "and-gate", "or-gate", "not-gate", "xor-gate"],
  },
  {
    id: "adder",
    title: "加法器与 ALU",
    description: "从半加器一路搭到多位加法器与算术逻辑单元。",
    challengeIds: ["half-adder", "full-adder", "machine-number", "multi-adder", "mux", "alu"],
  },
  {
    id: "storage",
    title: "存储系统",
    description: "观察地址、主存、MDR 和 CPU 总线之间的协作。",
    challengeIds: ["memory-address"],
  },
  {
    id: "hardware",
    title: "硬件配置挑战",
    description: "在预算、速度与容量之间做真实取舍。",
    challengeIds: HARDWARE_GAME_PROGRESS_ITEMS.map((item) => item.id),
  },
];

export const COURSE_ROUTE_GROUPS = ROUTE_GROUP_DEFINITIONS.map((group) => ({
  id: group.id,
  title: group.title,
  description: group.description,
  challengeIds: [...group.challengeIds],
}));

const LEARNING_ITEM_MAP = new Map(LEARNING_ITEMS.map((item) => [item.id, item]));

export function buildCourseRouteGroups(challenges = [], progress = {}) {
  const challengeMap = new Map((challenges ?? []).map((challenge) => [challenge.id, challenge]));

  return COURSE_ROUTE_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    description: group.description,
    items: group.challengeIds.map((id, sequence) => (
      buildRouteItem(id, challengeMap.get(id), progress[id], group.description, sequence)
    )),
  }));
}

export function formatEstimatedMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return "待评估";
  return `${Math.round(minutes)} 分钟`;
}
export function findNextRecommendedChallenge(challenges = [], progress = {}) {
  const challengeMap = new Map((challenges ?? []).map((challenge) => [challenge.id, challenge]));
  const orderedIds = COURSE_ROUTE_GROUPS.flatMap((group) => group.challengeIds);

  for (const id of orderedIds) {
    if ((progress[id]?.status ?? "not-started") === "in-progress") {
      return buildRecommendation(id, challengeMap.get(id) ?? LEARNING_ITEM_MAP.get(id));
    }
  }

  for (const id of orderedIds) {
    if ((progress[id]?.status ?? "not-started") !== "completed") {
      return buildRecommendation(id, challengeMap.get(id) ?? LEARNING_ITEM_MAP.get(id));
    }
  }

  return null;
}

function buildRouteItem(id, challenge, record = {}, fallbackDescription, sequence) {
  const fallback = LEARNING_ITEM_MAP.get(id) ?? {};
  const status = record.status ?? "not-started";
  const estimatedMinutes = challenge?.estimatedMinutes ?? fallback.estimatedMinutes ?? 8;

  return {
    id,
    title: challenge?.title ?? fallback.title ?? id,
    description: challenge?.objective ?? fallbackDescription ?? fallback.shortTitle ?? "",
    status,
    statusLabel: routeStatusLabel(status),
    bestScore: record.bestScore ?? 0,
    attempts: record.attempts ?? 0,
    estimatedMinutes,
    estimatedLabel: formatEstimatedMinutes(estimatedMinutes),
    sequence,
  };
}

function routeStatusLabel(status) {
  return {
    completed: "已完成",
    "in-progress": "进行中",
    locked: "未解锁",
    "not-started": "未开始",
    unlocked: "未开始",
  }[status] ?? "未开始";
}

function buildRecommendation(id, challenge = {}) {
  return {
    id,
    title: challenge.title ?? "未命名任务",
    description: challenge.objective ?? challenge.shortTitle ?? "",
    principle:
      challenge.principle
      ?? challenge.objective
      ?? "完成任务后查看原理复盘。",
    estimatedMinutes: Number(challenge.estimatedMinutes) > 0
      ? Number(challenge.estimatedMinutes)
      : null,
  };
}
