/**
 * Progressive hint system — tiered feedback based on attempt count.
 *
 * Level 1 (attempts 1-2): describe which test case failed and what's wrong
 * Level 2 (attempts 3-4): identify likely broken modules/components
 * Level 3 (attempts 5+): suggest specific connections to check
 */

export const HINT_LEVELS = { PHENOMENON: 1, MODULE: 2, OPERATION: 3 };

export function getHintLevel(attemptCount) {
  if (attemptCount <= 2) return HINT_LEVELS.PHENOMENON;
  if (attemptCount <= 4) return HINT_LEVELS.MODULE;
  return HINT_LEVELS.OPERATION;
}

export function buildProgressiveHints({ challengeModel, studentEdges, testResults, attemptCount }) {
  const level = getHintLevel(attemptCount);
  const hints = [];

  // Level 1: Phenomenon — which test case failed
  const failedCases = (testResults?.allCases ?? testResults?.cases ?? []).filter((c) => !c.passed);
  if (failedCases.length === 0) return [];

  hints.push({
    level: HINT_LEVELS.PHENOMENON,
    title: "检测到问题",
    detail: `${failedCases.length} 个测试用例未通过，请检查电路连线。`,
    always: true,
  });

  if (level >= HINT_LEVELS.PHENOMENON) {
    const firstFail = failedCases[0];
    hints.push({
      level: HINT_LEVELS.PHENOMENON,
      title: `用例"${firstFail.name}"失败`,
      detail: firstFail.firstFailStep >= 0
        ? `信号在第 ${firstFail.firstFailStep} 步传播后偏离预期。预期 ${formatExpected(firstFail)}，实际 ${formatActual(firstFail)}。`
        : `预期输出 ${formatExpected(firstFail)}，实际 ${formatActual(firstFail)}。`,
    });
  }

  // Level 2: Module — identify components with missing connections
  if (level >= HINT_LEVELS.MODULE) {
    const requiredEdges = challengeModel?.requiredEdges ?? [];
    const studentEdgeKeys = new Set(studentEdges.map((e) => `${e.from.nodeId}:${e.from.portId}->${e.to.nodeId}:${e.to.portId}`));
    const missingEdges = requiredEdges.filter((e) => !studentEdgeKeys.has(`${e.from.nodeId}:${e.from.portId}->${e.to.nodeId}:${e.to.portId}`));
    if (missingEdges.length > 0) {
      const involvedNodes = new Set(missingEdges.flatMap((e) => {
        const fromLabel = challengeModel?.nodes?.find((n) => n.id === e.from.nodeId)?.label ?? e.from.nodeId;
        const toLabel = challengeModel?.nodes?.find((n) => n.id === e.to.nodeId)?.label ?? e.to.nodeId;
        return [fromLabel, toLabel];
      }));
      hints.push({
        level: HINT_LEVELS.MODULE,
        title: "可能涉及的模块",
        detail: `检查以下元件的连接：${[...involvedNodes].join("、")}。缺少 ${missingEdges.length} 条必要连线。`,
      });
    }
  }

  // Level 3: Operation — suggest specific edges
  if (level >= HINT_LEVELS.OPERATION && failedCases.length > 0) {
    const requiredEdges = challengeModel?.requiredEdges ?? [];
    const studentEdgeKeys = new Set(studentEdges.map((e) => `${e.from.nodeId}:${e.from.portId}->${e.to.nodeId}:${e.to.portId}`));
    const missingEdges = requiredEdges.filter((e) => !studentEdgeKeys.has(`${e.from.nodeId}:${e.from.portId}->${e.to.nodeId}:${e.to.portId}`));
    for (const edge of missingEdges.slice(0, 3)) {
      const fromLabel = challengeModel?.nodes?.find((n) => n.id === edge.from.nodeId)?.label ?? edge.from.nodeId;
      const toLabel = challengeModel?.nodes?.find((n) => n.id === edge.to.nodeId)?.label ?? edge.to.nodeId;
      hints.push({
        level: HINT_LEVELS.OPERATION,
        title: edge.hint?.type ?? "连线建议",
        detail: `尝试从"${fromLabel}"连接到"${toLabel}"。${edge.hint?.message ?? ""}`,
      });
    }
  }

  return hints;
}

function formatExpected(testCase) {
  return Object.entries(testCase.expected).map(([k, v]) => `${k}=${v}`).join(" · ");
}

function formatActual(testCase) {
  return Object.entries(testCase.actual).map(([k, v]) => `${k}=${v}`).join(" · ");
}
