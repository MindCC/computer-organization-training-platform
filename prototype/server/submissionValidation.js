import { gradeHardwareBuild, isHardwareGameCase } from "../src/hardwareGame.js";
import { getCircuitChallenge } from "../src/circuit/challengeCircuitModel.js";
import { validateCircuitStructure } from "../src/circuit/circuitValidation.js";
import { runCircuitTestCases, runAllCircuitTests } from "../src/circuit/circuitSimulation.js";

const MAX_RESULT_BYTES = 64 * 1024;
const MAX_ELAPSED_MINUTES = 240;
const PASSING_SCORE = 80;

export function normalizeStudentAttemptPayload(payload = {}, learningItems = [], progress = null, skipPrerequisiteCheck = false) {
  const challengeId = String(payload.challengeId ?? "");
  if (!learningItems.some((challenge) => challenge.id === challengeId)) {
    return { ok: false, status: 400, error: "未知关卡" };
  }

  // Prerequisite check: reject submissions for locked challenges
  if (!skipPrerequisiteCheck && progress) {
    const record = progress[challengeId];
    if (record && record.status === "locked") {
      return { ok: false, status: 403, error: "请先完成前置关卡" };
    }
  }

  const result = normalizeResult(payload.result ?? {});
  const size = Buffer.byteLength(JSON.stringify(result), "utf8");
  if (size > MAX_RESULT_BYTES) {
    return { ok: false, status: 400, error: "result payload too large" };
  }

  // The overview is a guided exploration, not a score-bearing exercise. Its
  // completion signal comes from the completed step sequence, so never accept
  // a score supplied by the browser for it.
  if (challengeId === "computer-components") {
    const elapsedMinutes = Number(result.elapsedMinutes ?? 0);
    if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < 0 || elapsedMinutes > MAX_ELAPSED_MINUTES) {
      return { ok: false, status: 400, error: "elapsedMinutes must be between 0 and 240" };
    }
    if (result.overviewCompletion !== "guided-assembly") {
      return { ok: false, status: 400, error: "该探索关卡需要完成分步装配流程" };
    }
    return {
      ok: true,
      challengeId,
      result: { passed: true, score: 0, errors: [], elapsedMinutes, overviewCompletion: "guided-assembly" },
    };
  }

  const score = Number(result.score ?? 0);
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    return { ok: false, status: 400, error: "score must be an integer from 0 to 100" };
  }

  const passed = Boolean(result.passed);
  if (passed && score < PASSING_SCORE) {
    return { ok: false, status: 400, error: "passed cannot be true when score is below 80" };
  }

  const elapsedMinutes = Number(result.elapsedMinutes ?? 0);
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < 0 || elapsedMinutes > MAX_ELAPSED_MINUTES) {
    return { ok: false, status: 400, error: "elapsedMinutes must be between 0 and 240" };
  }

  if (!isValidErrors(result.errors)) {
    return { ok: false, status: 400, error: "errors must be an array of strings or objects" };
  }

  if (isHardwareGameCase(challengeId)) {
    const selection = extractHardwareSelection(result);
    const regraded = gradeHardwareBuild(challengeId, selection);
    return {
      ok: true,
      challengeId,
      result: { ...regraded, elapsedMinutes },
    };
  }

  const circuitModel = getCircuitChallenge(challengeId);
  if (circuitModel) {
    const circuitEdges = normalizeCircuitEdges(result.circuitEdges);
    if (!circuitEdges) {
      return { ok: false, status: 400, error: "circuit edge evidence is required" };
    }
    const structure = validateCircuitStructure(circuitModel, circuitEdges);
    const tests = runAllCircuitTests(circuitModel, circuitEdges);
    const serverPassed = structure.passed && tests.passed;
    return {
      ok: true,
      challengeId,
      result: {
        passed: serverPassed,
        score: serverPassed ? 100 : structure.score,
        errors: structure.errors,
        missing: structure.missingEdges,
        extraConnections: structure.extraEdges,
        circuitEdges,
        elapsedMinutes,
      },
    };
  }

  return {
    ok: true,
    challengeId,
    result: {
      ...result,
      score,
      passed,
      errors: result.errors ?? [],
      elapsedMinutes,
    },
  };
}

function normalizeCircuitEdges(edges) {
  if (!Array.isArray(edges) || edges.length > 256) return null;
  const normalized = [];
  for (const edge of edges) {
    const fromNodeId = edge?.from?.nodeId;
    const fromPortId = edge?.from?.portId;
    const toNodeId = edge?.to?.nodeId;
    const toPortId = edge?.to?.portId;
    if (![fromNodeId, fromPortId, toNodeId, toPortId].every((value) => typeof value === "string" && value.length > 0 && value.length <= 100)) {
      return null;
    }
    normalized.push({
      from: { nodeId: fromNodeId, portId: fromPortId },
      to: { nodeId: toNodeId, portId: toPortId },
    });
  }
  return normalized;
}

function normalizeResult(result) {
  return result && typeof result === "object" && !Array.isArray(result) ? result : {};
}

function isValidErrors(errors) {
  if (errors == null) return true;
  if (!Array.isArray(errors)) return false;
  return errors.every((error) => typeof error === "string" || (error && typeof error === "object" && !Array.isArray(error)));
}

function extractHardwareSelection(result) {
  if (result.selection && typeof result.selection === "object") {
    return result.selection;
  }
  const selectedParts = result.selectedParts && typeof result.selectedParts === "object" ? result.selectedParts : {};
  return {
    cpu: selectedParts.cpu?.id,
    memory: selectedParts.memory?.id,
    storage: selectedParts.storage?.id,
    gpu: selectedParts.gpu?.id,
  };
}
