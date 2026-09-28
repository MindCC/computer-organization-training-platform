import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { hashPassword } from "./auth.js";
import { createUser, getStudentProgress, migrate } from "./db.js";
import { seedDemoClassroom } from "./seedDemoClassroom.js";
import { CHALLENGES } from "../src/platformLogic.js";

function makeTempDb() {
  const dir = mkdtempSync(join(tmpdir(), "demo-classroom-"));
  const databasePath = join(dir, "classroom.sqlite");
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return { databasePath, db, dir };
}

test("demo classroom seed creates classes, students, and attempts", async () => {
  const { databasePath, dir, db: initDb } = makeTempDb();
  initDb.close();
  try {
    // Create teacher first
    const db = new Database(databasePath);
    createUser(db, {
      username: "teacher",
      displayName: "测试老师",
      role: "teacher",
      passwordHash: await hashPassword("Teacher123!"),
    });
    db.close();

    const result = await seedDemoClassroom({ databasePath, teacherUsername: "teacher" });

    assert.equal(result.classesCreated, 2);
    assert.ok(result.studentsCreated >= 30);
    assert.ok(result.attemptsCreated > 0);

    const verifyDb = new Database(databasePath);
    const profiles = verifyDb.prepare("SELECT profile_json FROM users WHERE role = 'student'").all();
    verifyDb.close();
    assert.ok(profiles.length >= 30);
    assert.equal(profiles.some((row) => row.profile_json.includes("initialPassword")), false);
    assert.equal(profiles.every((row) => JSON.parse(row.profile_json).mustChangePassword === true), true);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("demo classroom seed 沿章节顺序推进，且重复播种得到同一份学情", async () => {
  const { databasePath, dir, db: initDb } = makeTempDb();
  initDb.close();
  try {
    const db = new Database(databasePath);
    createUser(db, {
      username: "teacher",
      displayName: "测试老师",
      role: "teacher",
      passwordHash: await hashPassword("Teacher123!"),
    });
    db.close();

    await seedDemoClassroom({ databasePath, teacherUsername: "teacher" });
    const firstDb = new Database(databasePath);
    const student = firstDb.prepare("SELECT id FROM users WHERE username = ?").get("demo2026001");
    const firstProgress = getStudentProgress(firstDb, student.id);
    firstDb.close();

    // 完成情况必须是章节顺序的前缀：做对就往下走，做错就卡在那一关，后面保持未解锁。
    // 否则学情看板/实验台会出现"后面的关卡已完成、前面的还没解锁"这种乱序。
    let unfinishedSeen = false;
    for (const challenge of CHALLENGES) {
      const record = firstProgress[challenge.id];
      if (record.status === "completed") {
        assert.equal(unfinishedSeen, false, `${challenge.id} 之前已有未完成关卡，解锁状态不连贯`);
      } else {
        unfinishedSeen = true;
      }
    }

    // 重复播种（不删库）必须得到同一份学情，而不是在旧数据上叠加
    await seedDemoClassroom({ databasePath, teacherUsername: "teacher" });
    const secondDb = new Database(databasePath);
    const secondProgress = getStudentProgress(secondDb, student.id);
    secondDb.close();
    assert.deepEqual(secondProgress, firstProgress, "重复播种必须得到同一份学情");
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("demo classroom seed is idempotent", async () => {  const { databasePath, dir, db: initDb } = makeTempDb();
  initDb.close();
  try {
    const db = new Database(databasePath);
    createUser(db, {
      username: "teacher",
      displayName: "测试老师",
      role: "teacher",
      passwordHash: await hashPassword("Teacher123!"),
    });
    db.close();

    const first = await seedDemoClassroom({ databasePath, teacherUsername: "teacher" });
    const second = await seedDemoClassroom({ databasePath, teacherUsername: "teacher" });

    assert.equal(second.classesCreated, 2);
    assert.equal(second.studentsCreated, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});


test("demo classroom seed CLI runs from npm script entrypoint", async () => {
  const { databasePath, dir, db: initDb } = makeTempDb();
  initDb.close();
  try {
    const db = new Database(databasePath);
    createUser(db, {
      username: "teacher",
      displayName: "任课教师",
      role: "teacher",
      passwordHash: await hashPassword("Teacher123!"),
    });
    db.close();

    const result = spawnSync(process.execPath, ["server/seedDemoClassroom.js"], {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        DATABASE_PATH: databasePath,
        TEACHER_USERNAME: "teacher",
      },
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Demo classroom ready/);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});
