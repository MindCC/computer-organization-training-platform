import { hashPassword } from "./auth.js";
import {
  addStudentToClass,
  createClass,
  createUser,
  getUserByUsername,
  grantClassAccess,
  migrate,
  openDatabase,
  recordDemoAttempt,
  recordStudentAttempt,
  resetStudentProgress,
  resolveDatabasePath,
  sanitizeUser,
  updateUserProfile,
} from "./db.js";
import { CHALLENGES } from "../src/platformLogic.js";
import { HARDWARE_GAME_CASES } from "../src/hardwareGame.js";
import {
  clearSeededExtras,
  seedAiConversations,
  seedAssignments,
  seedChapterPractice,
  seedDemoAttempts,
} from "./seedDemoClassTwoExtras.js";

const DEMO_TEACHER_USERNAME = "demo-teacher";
const DEMO_TEACHER_PASSWORD = "Demo123!";
const DEMO2_CLASS_NAME = "计算机组成原理2班";
const DEMO2_STUDENT_PASSWORD = "Student123!";
const DEMO2_STUDENT_COUNT = 24;
/** 演示2班的学生账号前缀：与真实学号、以及演示1班的 demo2xxx 前缀都不冲突。 */
const DEMO2_USERNAME_PREFIX = "demo2-";

/**
 * 电路关卡爬梯：严格按教材章节顺序（platformLogic 的 CHALLENGES 已按章节排序）。
 * 必须像“顺着课程一关关做下来”：做对才解锁下一关，做错就卡住。
 */
const CIRCUIT_LADDER = CHALLENGES.map((challenge) => challenge.id);
const HARDWARE_LADDER = HARDWARE_GAME_CASES.map((gameCase) => gameCase.id);

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function pickWeighted(items, rand) {
  const r = rand();
  let cumulative = 0;
  for (const item of items) {
    cumulative += item.weight;
    if (r < cumulative) return item;
  }
  return items[items.length - 1];
}

/**
 * 播种「计算机组成原理2班」演示班：一批合成演示学生 + 一份像样的学情。
 *
 * 用户要求（2026-10-12）：新建一个演示2班并补演示数据，**不要都是 0**——
 * 也就是学情看板、平均分、完成率、错题这些位置要有真实分布，而不是空表和 0 分。
 *
 * 设计约束：
 * - 幂等：重复执行得到同一份整洁学情（先 reset 再播种），不会叠加。
 * - 只创建合成演示账号，不碰真实学生；账号前缀 demo2- 与真实学号不冲突。
 * - 学生**不带** `profile.demoAccount` 标记：那个标记会触发服务端只读闸门，
 *   学生就无法提交作业与练习了。演示班的演示数据由本脚本直接播种。
 * - passed 的分数不低于 80、failed 的分数低于 80，避免出现“已通过却 30 分”的自相矛盾数据。
 * - 演示班与演示1班一样归 demo-teacher 所有，这样一键演示仍然看到演示数据。
 */
export async function seedDemoClassTwo({ databasePath, students = DEMO2_STUDENT_COUNT, demoAccounts = null, seedHomework = true } = {}) {
  const resolved = resolveDatabasePath(databasePath);
  const db = openDatabase(resolved);
  migrate(db);

  // 1) 演示教师：存在就复用（ensureDemoAccounts 可能已经建过）
  let demoTeacher = getUserByUsername(db, DEMO_TEACHER_USERNAME);
  if (!demoTeacher) {
    demoTeacher = createUser(db, {
      username: DEMO_TEACHER_USERNAME,
      displayName: "演示教师",
      role: "teacher",
      passwordHash: await hashPassword(DEMO_TEACHER_PASSWORD),
      profile: { demoAccount: true, readOnly: true, seeded: true, mode: "适中提示模式" },
    });
  }

  // 2) 演示2班：按 (名称, 属主) 查找，已存在则复用，不重复创建
  let classRow = db
    .prepare("SELECT * FROM classes WHERE name = ? AND teacher_id = ?")
    .get(DEMO2_CLASS_NAME, demoTeacher.id);
  const classCreated = !classRow;
  if (!classRow) {
    classRow = createClass(db, demoTeacher.id, DEMO2_CLASS_NAME);
  }

  // 3) 合成演示学生
  const passwordHash = await hashPassword(DEMO2_STUDENT_PASSWORD);
  const studentRows = [];
  let studentsCreated = 0;
  for (let i = 1; i <= students; i++) {
    const username = `${DEMO2_USERNAME_PREFIX}${String(i).padStart(3, "0")}`;
    let user = getUserByUsername(db, username);
    if (!user) {
      user = createUser(db, {
        username,
        displayName: `演示2班学生${String(i).padStart(2, "0")}`,
        role: "student",
        passwordHash,
        profile: { seeded: true, mustChangePassword: false, mode: "适中提示模式" },
      });
      studentsCreated += 1;
    } else if (sanitizeUser(user).profile?.demoAccount === true) {
      // 早期版本给演示学生也打上了只读标记，会导致他们无法提交作业/练习；这里自愈修正。
      updateUserProfile(db, user.id, {
        displayName: user.display_name,
        profile: { ...sanitizeUser(user).profile, demoAccount: undefined },
      });
    }
    addStudentToClass(db, classRow.id, user.id);
    studentRows.push(user);
  }

  // 4) 学情：五档画像，沿章节顺序推进，做错就卡住
  const rand = seededRandom(20261012);
  const profiles = [
    { weight: 0.22, maxChallenges: 12, passRate: 0.95, hardware: 4 },
    { weight: 0.26, maxChallenges: 9, passRate: 0.85, hardware: 3 },
    { weight: 0.24, maxChallenges: 6, passRate: 0.7, hardware: 2 },
    { weight: 0.18, maxChallenges: 3, passRate: 0.55, hardware: 1 },
    { weight: 0.10, maxChallenges: 1, passRate: 0.35, hardware: 0 },
  ];

  let attemptsCreated = 0;
  const tx = db.transaction(() => {
    for (const student of studentRows) {
      const profile = pickWeighted(profiles, rand);
      // 先清干净再播种：重复执行得到的是同一份整洁学情，而不是叠加
      resetStudentProgress(db, student.id);

      const attempt = (challengeId, passed) => {
        const score = passed ? Math.round(80 + rand() * 20) : Math.round(rand() * 79);
        recordStudentAttempt(db, student.id, challengeId, {
          passed,
          score,
          errors: passed ? [] : [{ type: "连接错误", message: "部分端口方向不正确或缺少关键连接" }],
          elapsedMinutes: Math.round(3 + rand() * 20),
        }, { inTransaction: true });
        attemptsCreated += 1;
      };

      let done = 0;
      for (const challengeId of CIRCUIT_LADDER) {
        if (done >= profile.maxChallenges) break;
        const passed = rand() < profile.passRate;
        attempt(challengeId, passed);
        done += 1;
        // 卡在这一关：后面的关卡保持未解锁，学情看起来才是“顺着课程做到这里”
        if (!passed) break;
      }
      for (const caseId of HARDWARE_LADDER.slice(0, profile.hardware)) {
        attempt(caseId, rand() < Math.min(1, profile.passRate + 0.2));
      }
    }
  });
  tx();

  // 5) 双向可见：正式教师也能看到这个演示班（与演示1班同一套授权机制）。
  //    ensureDemoAccounts 由调用方注入，避免 server 模块之间形成循环导入。
  for (const formal of db.prepare("SELECT id FROM users WHERE role = 'teacher' AND id <> ? AND status = 'active'").all(demoTeacher.id)) {
    grantClassAccess(db, classRow.id, formal.id);
  }
  if (demoAccounts) await demoAccounts(db);

  // 6) 学情扩展：互动演示练习、章节练习、小芯答疑、知识库实验进度、教师作业。
  //    先清掉上次播种的扩展数据（幂等），真实记录不动。
  const studentIds = studentRows.map((student) => student.id);
  const cleared = clearSeededExtras(db, studentIds);
  const extrasRand = seededRandom(20261013);
  const demoAttempts = seedDemoAttempts(db, studentRows, extrasRand);
  const practiceAttempts = seedChapterPractice(db, studentRows, extrasRand);
  const conversations = seedAiConversations(db, studentRows, extrasRand);
  // 作业必须走真实接口，而接口受“演示账号只读闸门”保护（闸门依据 profile.demoAccount）。
  // 播种期间临时摘掉演示标记 + 只读标记，结束后**立即原样恢复**，
  // 使演示账号在整个生命周期内始终是只读身份。
  let assignment = { assignmentId: null, published: false, submitted: 0, graded: 0, skipped: 0, disabled: !seedHomework };
  if (seedHomework) {
    const before = sanitizeUser(demoTeacher).profile ?? {};
    // 注意：updateUserProfile 会与数据库中的现有 profile 合并，
    // 因此必须显式把这两个键覆盖为 undefined（JSON.stringify 会丢弃），否则会被原值带回来。
    updateUserProfile(db, demoTeacher.id, {
      displayName: demoTeacher.display_name,
      profile: { ...before, demoAccount: undefined, readOnly: undefined },
    });
    try {
      assignment = await seedAssignments({ db, classId: classRow.id, studentRows });
    } finally {
      updateUserProfile(db, demoTeacher.id, { displayName: demoTeacher.display_name, profile: before });
    }
  }

  const summary = db.prepare(`
    SELECT COUNT(DISTINCT cm.student_id) AS students,
           (SELECT COUNT(*) FROM challenge_attempts a JOIN class_members m ON m.student_id = a.student_id WHERE m.class_id = ?) AS attempts,
           (SELECT COUNT(DISTINCT a.challenge_id) FROM challenge_attempts a JOIN class_members m ON m.student_id = a.student_id WHERE m.class_id = ?) AS challenges
    FROM class_members cm WHERE cm.class_id = ?
  `).get(classRow.id, classRow.id, classRow.id);

  db.close();

  return {
    classId: classRow.id,
    className: classRow.name,
    classCreated,
    students: summary.students,
    studentsCreated,
    attemptsCreated,
    distinctChallenges: summary.challenges,
    extras: {
      cleared,
      demoAttempts,
      practiceAttempts,
      conversations,
      assignment,
    },
  };
}

if (process.argv[1] && import.meta.url.replace(/\/+$/, "").endsWith(process.argv[1].replace(/\\/g, "/").replace(/\/+$/, ""))) {
  const databasePath = process.env.DATABASE_PATH ?? "data/classroom.sqlite";
  const { ensureDemoAccounts } = await import("./demoAccounts.js");
  const result = await seedDemoClassTwo({ databasePath, demoAccounts: ensureDemoAccounts });
  console.log(`Demo class 2 ready: ${JSON.stringify(result, null, 1)}`);
}
