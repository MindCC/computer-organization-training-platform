/**
 * 错题本聚合逻辑（纯函数，P2-B）。
 * 错题判定：passed=false 且 errors 非空的提交。
 * 按 关卡 → 错误类型 聚合，输出总览 + 每条错题的最近 3 次提交摘要。
 */

/**
 * 聚合学生的提交记录为错题本模型。
 * @param {Array} attempts 提交记录，每项含 challengeId, passed, errors(数组), score, createdAt
 * @param {Object} challengeTitles challengeId -> 关卡标题
 * @returns {Object} { overview: { totalMistakes, challengeCount, topErrorType }, items: [...] }
 */
export function buildMistakeBook(attempts = [], challengeTitles = {}) {
  const mistakeAttempts = attempts.filter(
    (attempt) => attempt.passed === false && Array.isArray(attempt.errors) && attempt.errors.length > 0,
  );

  // 按 challengeId + errorType 分组
  const groups = new Map(); // key: challengeId::errorType
  for (const attempt of mistakeAttempts) {
    const errorTypes = attempt.errors.length > 0 ? attempt.errors : [String(attempt.errors)];
    for (const errorType of errorTypes) {
      const key = `${attempt.challengeId}::${errorType}`;
      if (!groups.has(key)) {
        groups.set(key, {
          challengeId: attempt.challengeId,
          challengeTitle: challengeTitles[attempt.challengeId] ?? attempt.challengeId,
          errorType,
          firstSeen: attempt.createdAt,
          lastSeen: attempt.createdAt,
          count: 0,
          snapshots: [],
        });
      }
      const group = groups.get(key);
      group.count += 1;
      if (attempt.createdAt < group.firstSeen) group.firstSeen = attempt.createdAt;
      if (attempt.createdAt > group.lastSeen) group.lastSeen = attempt.createdAt;
      group.snapshots.push({
        score: attempt.score,
        createdAt: attempt.createdAt,
        result: attempt.result ?? null,
      });
    }
  }

  // 每组的快照取最近 3 次（按时间倒序；遍历顺序已是 created_at ASC，逆序即最新在前）
  const items = [...groups.values()].map((group) => ({
    ...group,
    snapshots: [...group.snapshots].reverse().slice(0, 3),
  }));

  // 按最近时间倒序（遍历顺序已是 created_at ASC，逆序即最新在前）
  items.reverse();

  // 总览
  const errorCounts = new Map();
  for (const item of items) {
    errorCounts.set(item.errorType, (errorCounts.get(item.errorType) ?? 0) + item.count);
  }
  const topError = [...errorCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    overview: {
      totalMistakes: mistakeAttempts.length,
      challengeCount: new Set(items.map((item) => item.challengeId)).size,
      topErrorType: topError ? topError[0] : null,
    },
    items,
  };
}

/**
 * 生成错题本 CSV（教师导出/学生本地留存可选）。
 * @returns {string}
 */
export function renderMistakeCsv(items = []) {
  const header = ["关卡", "错误类型", "频次", "首次出现", "最近出现"];
  const rows = items.map((item) => [item.challengeTitle, item.errorType, item.count, item.firstSeen, item.lastSeen]);
  return [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
