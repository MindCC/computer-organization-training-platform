import { normalizeLabEventBatch } from "../src/shared/labRunState.js";
export function createCpuPracticeService({ repository }) {
  return {
    getRun: ({ studentId }) => repository.createOrGetRun(studentId),
    appendEvents: ({ studentId, payload }) => {
      const run = repository.createOrGetRun(studentId);
      return repository.appendEvents(run.id, normalizeLabEventBatch(payload));
    },
  };
}
