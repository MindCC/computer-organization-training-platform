import { getCircuitChallenge } from "./circuit/challengeCircuitModel.js";
import { gradeConnections, simulateChallenge } from "./platformLogic.js";

export function buildRealtimeDiagnostics({ challengeId, connections = [], inputState = {}, feedback = null }) {
  const circuitModel = getCircuitChallenge(challengeId);
  const structural = gradeConnections(challengeId, connections);
  const simulation = simulateChallenge(challengeId, inputState);

  const errors = structural.errors?.length ? structural.errors : (feedback?.errors?.length ? feedback.errors : []);
  const status = structural.passed || feedback?.passed ? "passed" : "needs-work";

  return {
    status,
    summary: status === "passed"
      ? "当前结构满足本关目标。"
      : "当前结构仍需调整，请先检查缺失连接和端口方向。",
    testRows: buildTestRows(simulation, challengeId),
    issues: errors.length
      ? errors.map((error) => ({
          type: error.type ?? "结构缺失",
          message: error.message ?? String(error),
        }))
      : status === "passed"
        ? []
        : [{ type: "结构缺失", message: "请先完成本关必要连接。" }],
  };
}

function buildTestRows(simulation, challengeId) {
  if (!simulation) {
    return [{ label: "当前输出", expected: "等待输入", actual: "未知", passed: false }];
  }

  const hasSteps = Array.isArray(simulation.steps) && simulation.steps.length > 0;
  const outputs = simulation.outputs ?? {};
  const outputKeys = typeof outputs === "object" && !Array.isArray(outputs) ? Object.keys(outputs) : [];
  const hasSignalOutputs = outputKeys.some((k) => !["flow", "result"].includes(k));

  if (hasSteps && !hasSignalOutputs) {
    return simulation.steps.map((step) => ({
      label: `步骤 ${step.id ?? step.index ?? ""}`,
      expected: "电路完成",
      actual: typeof step.text === "string" ? step.text : JSON.stringify(step),
      passed: true,
    }));
  }

  if (outputKeys.length > 0) {
    return outputKeys.map((key) => ({
      label: `当前输出 ${key}`,
      expected: "随输入变化",
      actual: String(outputs[key]),
      passed: outputs[key] !== "unknown",
    }));
  }

  return [{ label: "当前输出", expected: "等待输入", actual: "未知", passed: false }];
}
