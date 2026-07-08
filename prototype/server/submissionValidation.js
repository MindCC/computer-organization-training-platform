import { gradeHardwareBuild, isHardwareGameCase } from "../src/hardwareGame.js";

const MAX_RESULT_BYTES = 64 * 1024;
const MAX_ELAPSED_MINUTES = 240;
const PASSING_SCORE = 80;

export function normalizeStudentAttemptPayload(payload = {}, learningItems = []) {
  const challengeId = String(payload.challengeId ?? "");
  if (!learningItems.some((challenge) => challenge.id === challengeId)) {
    return { ok: false, status: 400, error: "未知关卡" };
  }

  const result = normalizeResult(payload.result ?? {});
  const size = Buffer.byteLength(JSON.stringify(result), "utf8");
  if (size > MAX_RESULT_BYTES) {
    return { ok: false, status: 400, error: "result payload too large" };
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
