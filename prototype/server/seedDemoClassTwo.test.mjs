import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { getStudentProgress, migrate, openDatabase, createUser } from "./db.js";
import { seedDemoClassTwo } from "./seedDemoClassTwo.js";
import { ensureDemoAccounts } from "./demoAccounts.js";

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
    db.close();
  });
});
