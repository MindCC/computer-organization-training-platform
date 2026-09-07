import { normalizeLabEventBatch } from "../src/shared/labRunState.js";

export function createLabRunService({ db, repository }) {
  return { createRun, getRun, appendEvents };

  function notFound() { return Object.assign(new Error("实验记录不存在"), { status: 404 }); }
  function createRun({ studentId, courseVersionId, stepId }) {
    const version = findStudentVersion(studentId, courseVersionId);
    const step = version.courseSpec?.steps?.find((item) => item.id === String(stepId));
    if (!step) throw Object.assign(new Error("课程步骤不存在"), { status: 400 });
    return repository.createOrGetRun({ studentId, courseVersionId: version.id, stepId: step.id });
  }
  function getRun({ studentId, runId }) {
    const run = repository.getRun(runId);
    if (!run || run.studentId !== studentId) throw notFound();
    return run;
  }
  function appendEvents({ studentId, runId, payload }) {
    getRun({ studentId, runId });
    const saved = repository.appendEvents(runId, normalizeLabEventBatch(payload));
    if (!saved) throw notFound();
    return saved;
  }
  function findStudentVersion(studentId, courseVersionId) {
    const row = db.prepare(`SELECT cv.* FROM course_versions cv
      JOIN course_drafts cd ON cd.id=cv.course_draft_id
      JOIN class_members cm ON cm.class_id=cd.class_id
      WHERE cv.id=? AND cm.student_id=?`).get(courseVersionId, studentId);
    if (!row) throw notFound();
    try { return { ...row, courseSpec: JSON.parse(row.course_spec_json) }; } catch { throw notFound(); }
  }
}
