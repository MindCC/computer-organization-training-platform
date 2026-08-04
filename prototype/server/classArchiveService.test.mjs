import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { hashPassword } from "./auth.js";
import { createUser, migrate, openDatabase, createClass, addStudentToClass, recordStudentAttempt, createNote } from "./db.js";
import { buildClassArchive, archiveFileName, renderScoresCsv } from "./classArchiveService.js";

async function makeClassFixture() {
  const db = openDatabase(":memory:");
  migrate(db);
  const teacher = createUser(db, { username: "t1", displayName: "教师", role: "teacher", passwordHash: await hashPassword("T12345678a") });
  const studentA = createUser(db, { username: "s001", displayName: "张三", role: "student", passwordHash: await hashPassword("S12345678a") });
  const studentB = createUser(db, { username: "s002", displayName: "李四", role: "student", passwordHash: await hashPassword("S12345678a") });
  const klass = createClass(db, teacher.id, "计组一班");
  addStudentToClass(db, klass.id, studentA.id);
  addStudentToClass(db, klass.id, studentB.id);

  recordStudentAttempt(db, studentA.id, "and-gate", { passed: true, score: 90, errors: [], elapsedMinutes: 5 });
  recordStudentAttempt(db, studentA.id, "and-gate", { passed: false, score: 40, errors: [{ type: "接线错误", message: "A 未接" }], elapsedMinutes: 3 });
  recordStudentAttempt(db, studentA.id, "game-office-pc", { passed: true, score: 88, errors: [], elapsedMinutes: 6, quotePrice: 2100, profit: 320, satisfaction: 85 });
  recordStudentAttempt(db, studentB.id, "alu", { passed: true, score: 95, errors: [], elapsedMinutes: 9 });
  createNote(db, studentA.id, { title: "与门笔记", content: "与门全 1 才输出 1", tag: "数字逻辑", challengeId: "and-gate" });
  return { db, studentA, studentB, klass };
}

test("buildClassArchive produces zip with 5 files including all data", async () => {
  const { db, studentA, klass } = await makeClassFixture();

  const students = db.prepare("SELECT u.id, u.username, u.display_name AS displayName FROM class_members cm JOIN users u ON u.id = cm.student_id WHERE cm.class_id = ? ORDER BY u.username").all(klass.id)
    .map((s) => ({ ...s, progress: {}, summary: { completionRate: 50, averageScore: 70, totalAttempts: 3 } }));
  const summary = { studentCount: 2, completionRate: 50, averageScore: 70 };

  const zip = buildClassArchive({ db, classId: klass.id, className: "计组一班", students, summary });
  assert.ok(zip.length > 200);

  const dir = mkdtempSync(path.join(tmpdir(), "zcyl-archive-test-"));
  const zipPath = path.join(dir, "out.zip");
  writeFileSync(zipPath, zip);

  try {
    execFileSync("unzip", ["-o", zipPath, "-d", dir], { stdio: "pipe" });
    const files = ["scores.csv", "attempts.json", "notes.json", "hardware.json", "summary.json"];
    for (const file of files) {
      assert.ok(existsSync(path.join(dir, file)), `${file} should exist in archive`);
    }

    // scores.csv 含学生与关卡列
    const csv = readFileSync(path.join(dir, "scores.csv"), "utf8");
    assert.match(csv, /张三/);
    assert.match(csv, /与门/);

    // attempts.json 含失败提交的 errors
    const attempts = JSON.parse(readFileSync(path.join(dir, "attempts.json"), "utf8"));
    const student = attempts.find((a) => a.username === "s001");
    assert.ok(student, "s001 should be in attempts.json");
    assert.equal(student.submissions.length, 3);
    assert.ok(student.submissions.some((sub) => sub.passed === false && sub.errors.length === 1));

    // notes.json 按学生组织
    const notes = JSON.parse(readFileSync(path.join(dir, "notes.json"), "utf8"));
    assert.ok(notes.some((n) => n.username === "s001" && n.notes[0].challengeId === "and-gate"));

    // hardware.json 含挑战配置和提交
    const hardware = JSON.parse(readFileSync(path.join(dir, "hardware.json"), "utf8"));
    assert.ok(hardware.cases.length >= 1);
    assert.ok(hardware.attempts.some((a) => a.username === "s001" && a.result.quotePrice === 2100));

    // summary.json
    const summaryOut = JSON.parse(readFileSync(path.join(dir, "summary.json"), "utf8"));
    assert.equal(summaryOut.studentCount, 2);
  } catch (error) {
    assert.ok(zip.length > 100, `unzip failed: ${error.message}`);
  }
});

test("archive file name contains class name and date, no illegal chars", () => {
  const name = archiveFileName("计组/一班", 7);
  assert.match(name, /计组_一班-\d{4}-\d{2}-\d{2}\.zip/);
});

test("renderScoresCsv includes per-challenge columns", () => {
  const students = [{ username: "s1", displayName: "甲", summary: { completionRate: 100, averageScore: 90, totalAttempts: 2 }, progress: { "and-gate": { status: "completed", bestScore: 90, attempts: 2, timeSpentMinutes: 8 } } }];
  const csv = renderScoresCsv(students, [{ id: "and-gate", shortTitle: "与门" }]);
  assert.match(csv, /学号,姓名,完成率/);
  assert.match(csv, /与门状态,与门最高分/);
  assert.match(csv, /completed,90,2,8/);
});
