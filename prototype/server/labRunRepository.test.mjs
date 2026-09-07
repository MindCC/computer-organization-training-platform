import test from "node:test";
import assert from "node:assert/strict";
import { createClass, createUser, migrate, openDatabase } from "./db.js";
import { createCourseWorkbenchRepository } from "./courseWorkbenchRepository.js";
import { createLabRunRepository } from "./labRunRepository.js";
import { normalizeLabEventBatch } from "../src/shared/labRunState.js";

test("persists a student run and makes the same event batch idempotent", () => {
  const db = openDatabase(":memory:"); migrate(db);
  const teacher = createUser(db, { username: "run-teacher", displayName: "教师", role: "teacher", passwordHash: "x" });
  const student = createUser(db, { username: "run-student", displayName: "学生", role: "student", passwordHash: "x" });
  const classroom = createClass(db, teacher.id, "实验班");
  const courses = createCourseWorkbenchRepository(db);
  const draft = courses.createDraft({ teacherId: teacher.id, classId: classroom.id, payload: { title: "课程", summary: "", learningObjectives: ["目标"], guideChallengeId: "computer-components", guideScript: [{ id: "cpu", title: "CPU", instruction: "观察", action: { type: "highlightPart", partId: "cpu" }, completion: "acknowledge" }], assignmentOutline: {}, projectOutline: { title: "项目", description: "说明", milestones: [{ id: "m1", title: "里程碑", description: "说明" }] } } });
  const project = courses.publishDraft(draft.id);
  const runs = createLabRunRepository(db);
  const run = runs.createOrGetRun({ studentId: student.id, courseVersionId: project.courseVersion.id, stepId: "guide-cpu" });
  const batch = normalizeLabEventBatch({ baseRevision: 0, batchId: "batch-1", events: [{ eventId: "event-1", type: "cpu.executeInstruction", payload: { program: "addition-demo@1" } }] });
  const first = runs.appendEvents(run.id, batch);
  const retry = runs.appendEvents(run.id, batch);
  assert.equal(first.state.revision, 1);
  assert.equal(retry.duplicate, true);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM lab_run_events WHERE lab_run_id=?").get(run.id).count, 1);
  db.close();
});
