import { hashPassword } from "./auth.js";
import {
  addStudentToClass,
  createClass,
  createUser,
  getUserByUsername,
  migrate,
  openDatabase,
  recordStudentAttempt,
  resetStudentProgress,
  resolveDatabasePath,
} from "./db.js";
import { CHALLENGES } from "../src/platformLogic.js";
import { HARDWARE_GAME_CASES } from "../src/hardwareGame.js";

const DEFAULT_TEACHER_USERNAME = "teacher";
const DEMO_STUDENT_COUNT = 40;
const DEFAULT_STUDENT_PASSWORD = "Student123!";

/**
 * 电路关卡爬梯：严格按教材章节顺序（platformLogic 的 CHALLENGES 已按章节排序）。
 * 演示学情必须像"顺着课程一关关做下来"：做对就解锁下一关，做错就卡在这一关，
 * 后面的关卡保持未解锁——否则学情看板和实验台解锁状态看起来是乱的。
 */
const CIRCUIT_LADDER = CHALLENGES.map((challenge) => challenge.id);
/**
 * 装机配置挑战单独播种：它们不受电路解锁链影响，但装机练习看板需要有数据。
 * （此前池子里写的 game-storage-upgrade 是个不存在的关卡 id，会往 student_progress
 * 里写进孤儿记录，现在改用 hardwareGame 里真实登记的案例。）
 */
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

export async function seedDemoClassroom({
  databasePath,
  teacherUsername = DEFAULT_TEACHER_USERNAME,
} = {}) {
  const resolved = resolveDatabasePath(databasePath);
  const db = openDatabase(databasePath);
  migrate(db);

  const teacher = getUserByUsername(db, teacherUsername);
  if (!teacher) {
    throw new Error(`Teacher not found: ${teacherUsername}. Run seed:teacher first.`);
  }

  const classNames = ["计组一班", "计组二班"];
  const classes = [];
  for (const name of classNames) {
    let classRow = db.prepare("SELECT id FROM classes WHERE name = ? AND teacher_id = ?").get(name.trim(), teacher.id);
    if (!classRow) {
      classRow = createClass(db, teacher.id, name.trim());
    }
    classes.push(classRow);
  }

  let studentsCreated = 0;
  const studentIds = [];
  const passwordHash = await hashPassword(DEFAULT_STUDENT_PASSWORD);

  for (let i = 1; i <= DEMO_STUDENT_COUNT; i++) {
    const username = `demo2026${String(i).padStart(3, "0")}`;
    const studentName = `演示学生${i}`;
    let user = getUserByUsername(db, username);
    if (!user) {
      user = createUser(db, {
        username,
        displayName: studentName,
        role: "student",
        passwordHash,
        profile: { seeded: true, mustChangePassword: true },
      });
      studentsCreated++;
    }
    studentIds.push(user.id);

    const classIndex = i <= 20 ? 0 : 1;
    addStudentToClass(db, classes[classIndex].id, user.id);
  }

  const rand = seededRandom(42);
  let attemptsCreated = 0;

  // 五种学生画像：沿着章节顺序一关关做，做错就卡住（后续关卡保持未解锁）。
  // passed 的分数按平台规则不低于 80 分，failed 的分数落在 80 分线以下，避免出现
  // "已通过却只有 30 分"这种和判分规则自相矛盾的数据。
  const profiles = [
    { weight: 0.30, maxChallenges: 8, passRate: 0.92, hardware: 3 },
    { weight: 0.25, maxChallenges: 6, passRate: 0.75, hardware: 2 },
    { weight: 0.20, maxChallenges: 4, passRate: 0.5, hardware: 1 },
    { weight: 0.15, maxChallenges: 2, passRate: 0.3, hardware: 0 },
    { weight: 0.10, maxChallenges: 0, passRate: 0, hardware: 0 },
  ];

  function attempt(studentId, challengeId, passed) {
    const score = passed ? Math.round(80 + rand() * 20) : Math.round(rand() * 79);
    recordStudentAttempt(db, studentId, challengeId, {
      passed,
      score,
      errors: passed ? [] : [{ type: "连接错误", message: "部分端口方向不正确或缺少关键连接" }],
      elapsedMinutes: Math.round(3 + rand() * 20),
    }, { inTransaction: true });
    attemptsCreated += 1;
  }

  const tx = db.transaction(() => {
    for (const studentId of studentIds) {
      const profile = pickWeighted(profiles, rand);
      // 先清干净再播种：重复执行 seed:demo 得到的是同一份整洁学情，而不是叠加。
      resetStudentProgress(db, studentId);

      let done = 0;
      for (const challengeId of CIRCUIT_LADDER) {
        if (done >= profile.maxChallenges) break;
        const passed = rand() < profile.passRate;
        attempt(studentId, challengeId, passed);
        done += 1;
        // 卡在这一关：后面的关卡保持未解锁，学情看起来才是"顺着课程做到这里"。
        if (!passed) break;
      }

      for (const caseId of HARDWARE_LADDER.slice(0, profile.hardware)) {
        attempt(studentId, caseId, rand() < Math.min(1, profile.passRate + 0.2));
      }
    }
  });
  tx();

  db.close();

  return {
    classesCreated: classes.length,
    studentsCreated,
    attemptsCreated,
  };
}

if (process.argv[1] && import.meta.url.replace(/\/+$/, "").endsWith(process.argv[1].replace(/\\/g, "/").replace(/\/+$/, ""))) {
  const databasePath = process.env.DATABASE_PATH ?? "data/classroom.sqlite";
  const teacherUsername = process.env.TEACHER_USERNAME ?? DEFAULT_TEACHER_USERNAME;
  const result = await seedDemoClassroom({ databasePath, teacherUsername });
  console.log(`Demo classroom ready: ${JSON.stringify(result)}`);
}
