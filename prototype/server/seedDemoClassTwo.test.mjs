import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { getStudentProgress, getUserByUsername, migrate, openDatabase, createUser } from "./db.js";
import { seedDemoClassTwo } from "./seedDemoClassTwo.js";
import { ensureDemoAccounts } from "./demoAccounts.js";
import { verifyPassword } from "./auth.js";

/** 独立临时文件库：不碰开发库，也不与其它测试共享状态。 */
async function withTempDatabase(tag, run) {
  const file = `qa-artifacts/test-demo2-${tag}-${process.pid}.sqlite`;
  rmSync(file, { force: true });
  const bootstrap = openDatabase(file);
  migrate(bootstrap);
  bootstrap.close();
  try {
    await run(file);
  } finally {
    // better-sqlite3 在 Windows 上可能短暂持有句柄，清理失败不影响断言结果
    for (const suffix of ["", "-shm", "-wal"]) {
      try { rmSync(file + suffix, { force: true }); } catch { /* 忽略清理失败 */ }
    }
  }
}

test("演示2班：创建班级与学生，并写入非零学情", async () => {
  await withTempDatabase("create", async (file) => {
    // 正式教师先存在（真实部署顺序），种子建班后由启动自愈补上双向授权
    const bootstrap = openDatabase(file);
    const formal = createUser(bootstrap, { username: "teacher", displayName: "任课教师", role: "teacher", passwordHash: "x" });
    bootstrap.close();

    const result = await seedDemoClassTwo({ databasePath: file, demoAccounts: ensureDemoAccounts });
    assert.equal(result.className, "计算机组成原理2班");
    assert.equal(result.classCreated, true);
    assert.equal(result.students, 24);
    assert.equal(result.studentsCreated, 24);
    assert.ok(result.attemptsCreated > 0, "必须有真实提交记录");
    assert.ok(result.distinctChallenges > 1, "应覆盖多个关卡，而不是只有一条记录");

    const db = openDatabase(file);
    const classRow = db.prepare("SELECT * FROM classes WHERE name = ?").get("计算机组成原理2班");
    const owner = db.prepare("SELECT username FROM users WHERE id = ?").get(classRow.teacher_id);
    assert.equal(owner.username, "demo-teacher", "演示2班归演示教师所有");

    const rows = db.prepare(`SELECT a.score, a.passed FROM challenge_attempts a
      JOIN class_members m ON m.student_id = a.student_id WHERE m.class_id = ?`).all(classRow.id);
    assert.ok(rows.length > 0);
    assert.ok(rows.some((row) => row.passed), "应有通过记录");
    assert.ok(rows.some((row) => row.score > 0), "分数不能全是 0");
    assert.ok(rows.every((row) => (row.passed ? row.score >= 80 : row.score < 80)), "通过与分数必须自洽");

    const student = db.prepare("SELECT student_id FROM class_members WHERE class_id = ? LIMIT 1").get(classRow.id);
    const progress = getStudentProgress(db, student.student_id);
    assert.ok(Object.keys(progress).length > 0, "单个学生也应有进度");

    const granted = db.prepare("SELECT 1 FROM class_teacher_access WHERE class_id = ? AND teacher_id = ?").get(classRow.id, formal.id);
    assert.ok(granted, "正式教师应被授权看到演示2班");
    assert.ok(db.prepare("SELECT 1 FROM class_teacher_access WHERE class_id = ?").get(classRow.id), "只读演示账号也要能看到正式班级");

    // —— 学情扩展：演示练习 / 章节练习 / 小芯答疑 / 教师作业都不能是空的 ——
    const memberIds = db.prepare("SELECT student_id FROM class_members WHERE class_id = ?").all(classRow.id).map((row) => row.student_id);
    const marks = memberIds.map(() => "?").join(",");
    const demoAttempts = db.prepare(`SELECT score, total, correct, questions_json FROM demo_attempts WHERE student_id IN (${marks})`).all(...memberIds);
    assert.ok(demoAttempts.length > 0, "应有互动演示练习记录");
    assert.ok(demoAttempts.every((row) => row.questions_json.includes("demo2-seed")), "演示记录应带播种标记，便于幂等清理");
    assert.ok(demoAttempts.some((row) => row.score > 0), "演示练习分数不能全是 0");
    assert.ok(demoAttempts.every((row) => row.correct <= row.total), "答对数不能超过总分");

    const practice = db.prepare(`SELECT chapter_id, results_json FROM chapter_practice_attempts WHERE student_id IN (${marks})`).all(...memberIds);
    assert.ok(practice.length > 0, "应有章节练习记录");
    assert.ok(practice.every((row) => Object.keys(JSON.parse(row.results_json)).length > 0), "章节练习必须有逐题判分结果");

    const asks = db.prepare(`SELECT question, answer_source, chapter_id FROM ai_conversations WHERE student_id IN (${marks})`).all(...memberIds);
    assert.ok(asks.length > 0, "应有小芯答疑记录");
    assert.ok(asks.every((row) => row.chapter_id), "每条答疑都应归到章节");
    assert.ok(asks.some((row) => row.answer_source === "ai"), "应有 AI 来源的回答");

    const assignment = db.prepare("SELECT * FROM assignments WHERE class_id = ?").get(classRow.id);
    assert.ok(assignment, "应有一个演示作业");
    assert.equal(assignment.status, "published", "作业必须已发布");
    const submissions = db.prepare("SELECT id, status, total_score FROM student_submissions ss WHERE ss.assignment_id = ?").all(assignment.id);
    assert.ok(submissions.length > 0, "应有学生提交");
    assert.ok(submissions.some((row) => row.status === "graded"), "应有已判分的提交");
    assert.ok(submissions.some((row) => Number(row.total_score) > 0), "提交分数不能全是 0（答案字段名写错会全部落成空串）");
    const answerScores = db.prepare(`SELECT sa.score, q.score AS maxScore FROM submission_answers sa
      JOIN student_submissions ss ON ss.id = sa.submission_id
      JOIN assignment_questions q ON q.id = sa.question_id WHERE ss.assignment_id = ?`).all(assignment.id);
    assert.ok(answerScores.length > 0, "应有逐题作答记录");
    assert.ok(answerScores.some((row) => Number(row.score) > 0), "逐题得分不能全是 0");
    assert.ok(answerScores.every((row) => row.score >= 0 && row.score <= row.maxScore), "逐题得分不能超过题目满分");
    // 已判分提交的总分必须等于逐题得分之和
    for (const row of submissions.filter((item) => item.status === "graded")) {
      const sum = db.prepare("SELECT COALESCE(SUM(score),0) n FROM submission_answers WHERE submission_id = ?").get(row.id).n;
      assert.equal(row.total_score, sum, `提交 #${row.id} 的总分应等于逐题得分之和`);
    }
    // 演示学生必须是可写的（不能带触发只读闸门的 demoAccount 标记），否则交不了作业
    const studentProfile = db.prepare("SELECT profile_json FROM users WHERE username = 'demo2-001'").get();
    assert.equal(JSON.parse(studentProfile.profile_json).demoAccount, undefined, "演示学生不应带只读标记");
    // 演示教师仍是只读，且固定口令可用（全新库也必须写入口令）
    const teacherRow = getUserByUsername(db, "demo-teacher");
    assert.equal(JSON.parse(teacherRow.profile_json).readOnly, true, "演示教师必须保持只读");
    assert.equal(await verifyPassword("Demo123!", teacherRow.password_hash), true, "全新库也必须能写入演示固定口令");

    db.close();

    // 启动自愈：模拟“教师后来才建好”“又新增了一个演示班”时，重启服务即可补上授权
    const healed = openDatabase(file);
    healed.prepare("DELETE FROM class_teacher_access WHERE class_id = ? AND teacher_id = ?").run(classRow.id, formal.id);
    healed.close();
    const later = await seedDemoClassTwo({ databasePath: file, demoAccounts: ensureDemoAccounts });
    const verify = openDatabase(file);
    assert.equal(later.classCreated, false);
    assert.ok(
      verify.prepare("SELECT 1 FROM class_teacher_access WHERE class_id = ? AND teacher_id = ?").get(classRow.id, formal.id),
      "再次运行应重新补上授权（自愈）",
    );
    verify.close();
  });
});

test("演示2班：重复执行幂等，不重复建班也不叠加学情", async () => {
  await withTempDatabase("idempotent", async (file) => {
    const first = await seedDemoClassTwo({ databasePath: file, demoAccounts: ensureDemoAccounts });
    const second = await seedDemoClassTwo({ databasePath: file, demoAccounts: ensureDemoAccounts });
    assert.equal(second.classCreated, false, "第二次不应新建班级");
    assert.equal(second.classId, first.classId);
    assert.equal(second.studentsCreated, 0, "第二次不应新建学生");
    assert.equal(second.attemptsCreated, first.attemptsCreated, "学情应被重置后重播，而不是叠加");

    const db = openDatabase(file);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM classes WHERE name = ?").get("计算机组成原理2班").n, 1, "同名班级只能有一个");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE username LIKE 'demo2-%'").get().n, 24);
    const attempts = db.prepare(`SELECT COUNT(*) n FROM challenge_attempts a
      JOIN class_members m ON m.student_id = a.student_id WHERE m.class_id = ?`).get(first.classId).n;
    assert.equal(attempts, first.attemptsCreated);
    // 作业也不能累积：重跑后本班只能有一份作业
    assert.equal(db.prepare("SELECT COUNT(*) n FROM assignments WHERE class_id = ?").get(first.classId).n, 1, "重跑不应重复创建作业");
    db.close();
  });
});
