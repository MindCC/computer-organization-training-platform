import { dependenciesOf, reconcileDependencyLocks } from "./challengeDependencies.js";
import { COURSE_CHAPTERS, PARTICIPATION_SCORE_NOTE, isParticipationChallenge, scoreLabelOf } from "./courseChapters.js";
import { COURSE_ROUTE_GROUPS, findNextRecommendedChallenge } from "./courseRoute.js";
import { CHALLENGES, LEARNING_ITEMS, buildInitialLearningProgress, challengeOrderOf } from "./platformLogic.js";

export const ADVENTURE_MAP_SIZE = Object.freeze({ width: 1440, height: 900 });

export const ADVENTURE_REGION_THEMES = Object.freeze([
  { chapterId: "ch1", name: "初识营地", terrain: "营地", x: 215, y: 270 },
  { chapterId: "ch2", name: "数码遗迹", terrain: "遗迹", x: 550, y: 265 },
  { chapterId: "ch3", name: "逻辑工坊", terrain: "工坊", x: 885, y: 265 },
  { chapterId: "ch4", name: "存储森林", terrain: "森林", x: 1215, y: 275 },
  { chapterId: "ch5", name: "指令驿站", terrain: "驿站", x: 1215, y: 655 },
  { chapterId: "ch6", name: "处理器城", terrain: "城镇", x: 885, y: 650 },
  { chapterId: "ch7", name: "总线峡谷", terrain: "峡谷", x: 550, y: 660 },
  { chapterId: "ch8", name: "I/O 港", terrain: "港口", x: 215, y: 665 },
]);

export const ADVENTURE_REGION_STATES = Object.freeze({
  completed: "已点亮",
  exploring: "探索中",
  available: "可进入",
  locked: "未解锁",
});

const circuitIds = new Set(CHALLENGES.map((item) => item.id));
const itemById = new Map(LEARNING_ITEMS.map((item) => [item.id, item]));

/**
 * Read-only view of the real course records. Missing records use the platform's
 * defaults, and historical locks use the same reconciliation as getStudentProgress.
 * This map never decides whether a submission is allowed.
 */
export function buildAdventureMap(progress = {}) {
  const defaults = buildInitialLearningProgress();
  const records = reconcileDependencyLocks(Object.fromEntries(LEARNING_ITEMS.map((item) => [
    item.id,
    { ...defaults[item.id], ...(progress?.[item.id] ?? {}) },
  ])));
  const recommended = findNextRecommendedChallenge(LEARNING_ITEMS, records);
  const currentRegionId = itemById.get(recommended?.id)?.chapterId ?? null;

  const regions = COURSE_CHAPTERS.map((chapter) => {
    const theme = ADVENTURE_REGION_THEMES.find((entry) => entry.chapterId === chapter.id);
    const route = COURSE_ROUTE_GROUPS.find((entry) => entry.id === chapter.id);
    const items = LEARNING_ITEMS.filter((item) => item.chapterId === chapter.id).map((item) => {
      const record = records[item.id];
      const missingPrerequisites = dependenciesOf(item.id)
        .filter((id) => records[id]?.status !== "completed")
        .map((id) => ({ id, title: itemById.get(id)?.title ?? id }));
      const locked = record.status === "locked";
      return {
        ...item,
        kind: circuitIds.has(item.id) ? "circuit" : "hardware",
        order: circuitIds.has(item.id) ? challengeOrderOf(item.id) : null,
        record,
        status: record.status,
        statusLabel: record.status === "completed" ? "已完成"
          : locked ? "未解锁"
            : Number(record.attempts) > 0 ? "探索中" : "可进入",
        scoreLabel: scoreLabelOf(item, record),
        scoreNote: isParticipationChallenge(item) ? PARTICIPATION_SCORE_NOTE : "",
        missingPrerequisites,
        prerequisiteHint: locked && missingPrerequisites.length
          ? `提交前需完成：${missingPrerequisites.map((entry) => entry.title).join("、")}`
          : locked ? "可先进入预习，提交条件以实验台提示为准"
            : "",
        canOpen: true,
        actionLabel: locked ? "进入预习" : record.status === "completed" ? "再次探索" : "进入关卡",
        isRecommended: item.id === recommended?.id,
      };
    });
    const completed = items.filter((item) => item.status === "completed").length;
    const attempted = items.some((item) => Number(item.record.attempts) > 0);
    const state = items.length > 0 && completed === items.length ? "completed"
      : completed > 0 || attempted ? "exploring"
        : items.some((item) => item.status !== "locked") ? "available" : "locked";

    return {
      ...theme,
      chapter,
      description: route?.description ?? "",
      state,
      stateLabel: ADVENTURE_REGION_STATES[state],
      completed,
      total: items.length,
      items,
      isCurrent: chapter.id === currentRegionId,
    };
  });

  return {
    regions,
    currentRegionId,
    recommendedChallengeId: recommended?.id ?? null,
    completed: regions.reduce((sum, entry) => sum + entry.completed, 0),
    total: LEARNING_ITEMS.length,
    completedRegions: regions.filter((entry) => entry.state === "completed").length,
  };
}
