import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword } from "./auth.js";
import { addStudentToClass, createClass, createUser, migrate, openDatabase } from "./db.js";
import { createClassroomSessionRepository } from "./classroomSessionRepository.js";

test("migration creates classroom tables and idempotency index", () => {
  const db = openDatabase(":memory:");
  migrate(db);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
  assert.ok(tables.includes("classroom_sessions"));
  assert.ok(tables.includes("student_session_states"));
  const attemptColumns = db.prepare("PRAGMA table_info(challenge_attempts)").all().map((row) => row.name);
  assert.ok(attemptColumns.includes("session_id"));
  assert.ok(attemptColumns.includes("client_submission_id"));
  const indexes = db.prepare("PRAGMA index_list(challenge_attempts)").all().map((row) => row.name);
  assert.ok(indexes.includes("idx_attempts_student_submission"));
  db.close();
});

test("draft creation snapshots every current class member", async () => {
  const db = openDatabase(":memory:");
  migrate(db);
  const teacher = createUser(db, {
    username: "teacher-repo",
    displayName: "任课教师",
    role: "teacher",
    passwordHash: await hashPassword("Teacher123!"),
  });
  const student = createUser(db, {
    username: "student-repo",
    displayName: "测试学生",
    role: "student",
    passwordHash: await hashPassword("Student123!"),
  });
  const classRow = createClass(db, teacher.id, "计组仓储测试班");
  addStudentToClass(db, classRow.id, student.id);
  const repository = createClassroomSessionRepository(db);
  const session = repository.createDraft({
    classId: classRow.id,
    teacherId: teacher.id,
    templateKey: "computer-data-flow",
    templateVersion: 1,
    title: "计算机五大部件与数据流",
    durationMinutes: 45,
    passScore: 80,
    allowMakeup: false,
    configJson: JSON.stringify({ durationMinutes: 45, passScore: 80, allowMakeup: false }),
  });
  assert.equal(session.status, "draft");
  assert.equal(repository.getStudentState(session.id, student.id).status, "not_started");
  // Late-joining student gets backfilled on enter
  const lateStudent = createUser(db, {
    username: "late-student",
    displayName: "迟到学生",
    role: "student",
    passwordHash: await hashPassword("Student123!"),
  });
  addStudentToClass(db, classRow.id, lateStudent.id);
  const entered = repository.enterStudent(session.id, lateStudent.id);
  assert.equal(entered.status, "in_progress");
  db.close();
});
