import { LEARNING_ITEMS } from "../src/platformLogic.js";
import { normalizeStudentAttemptPayload } from "./submissionValidation.js";

const MAX_RESULT_BYTES = 64 * 1024;
const MAX_EDGES = 256;

export function gradeClassroomEvidence({ mission, stageIndex, payload, progress }) {
  const stage = mission.stages[stageIndex];
  if (!stage) throw classroomError("STAGE_MISMATCH", "课堂阶段不匹配", 409, false);
  const serializedBytes = Buffer.byteLength(JSON.stringify(payload ?? {}), "utf8");
  if (serializedBytes > MAX_RESULT_BYTES) {
    throw classroomError("SUBMISSION_TOO_LARGE", "提交证据超过 64 KB", 413, false);
  }
  if (stage.grading === "participation") {
    if (payload?.result?.completed !== true) {
      throw classroomError("INVALID_STAGE_EVIDENCE", "探索阶段缺少完成动作", 400, false);
    }
    return {
      challengeId: stage.challengeId,
      result: { score: 100, passed: true, errors: [], elapsedMinutes: Number(payload.result.elapsedMinutes ?? 0), completed: true },
    };
  }
  const edges = payload?.result?.edges;
  if (!Array.isArray(edges) || edges.length > MAX_EDGES) {
    throw classroomError("INVALID_STAGE_EVIDENCE", "电路证据必须包含不超过 256 条规范连线", 400, false);
  }
  const normalized = normalizeStudentAttemptPayload(
    { challengeId: stage.challengeId, result: { ...payload.result, circuitEdges: payload.result.edges } },
    LEARNING_ITEMS,
    progress,
    false,
  );
  if (normalized.ok === false) {
    throw classroomError("INVALID_STAGE_EVIDENCE", normalized.error, normalized.status, false);
  }
  return normalized;
}

export function classroomError(code, message, status = 400, retryable = false) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.retryable = retryable;
  return error;
}
