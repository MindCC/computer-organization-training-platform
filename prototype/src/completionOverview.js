/**
 * 课程总体完成概览辅助函数（P2-D）。
 * 基于真实学习数据推算剩余课时：平均每关耗时 × 剩余关卡数 ÷ 单课时分钟数，向上取整。
 * 无有效数据时返回 null，前端显示「暂无估算」。
 */

const LESSON_MINUTES = 45; // 单课时标准时长

/**
 * @param {Object} summary summarizeLearning 的结果（含 completed/totalChallenges/totalStudyMinutes）
 * @returns {{ completedLabel: string, remainingLessons: number|null, remainingLabel: string }|null}
 */
export function buildCompletionOverview(summary = {}) {
  const completed = Number(summary.completed ?? 0);
  const total = Number(summary.totalChallenges ?? 0);
  const totalStudyMinutes = Number(summary.totalStudyMinutes ?? 0);

  // 已有关卡计数（总览卡用）
  const completedLabel = `${completed} / ${total} 关`;

  // 剩余课时推算：需要至少完成 1 关且有关卡耗时，才有平均耗时可参考
  let remainingLessons = null;
  if (completed > 0 && total > completed && totalStudyMinutes > 0) {
    const avgMinutesPerChallenge = totalStudyMinutes / completed;
    const remainingMinutes = avgMinutesPerChallenge * (total - completed);
    remainingLessons = Math.max(1, Math.ceil(remainingMinutes / LESSON_MINUTES));
  }

  return {
    completedLabel,
    remainingLessons,
    remainingLabel: remainingLessons === null ? "暂无估算" : `约 ${remainingLessons} 课时`,
  };
}
