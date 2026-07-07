import { hashPassword } from "./auth.js";
import {
  addStudentToClass,
  createClass,
  createUser,
  getUserByUsername,
  migrate,
  openDatabase,
  recordStudentAttempt,
  resolveDatabasePath,
} from "./db.js";

const DEFAULT_TEACHER_USERNAME = "teacher";
const DEMO_STUDENT_COUNT = 40;
const DEFAULT_STUDENT_PASSWORD = "Student123!";
const CHALLENGE_ATTEMPT_POOL = [
  "and-gate",
  "or-gate",
  "not-gate",
  "xor-gate",
  "half-adder",
  "full-adder",
  "memory-address",
  "game-office-pc",
  "game-storage-upgrade",
];

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
        profile: { seeded: true, initialPassword: DEFAULT_STUDENT_PASSWORD },
      });
      studentsCreated++;
    }
    studentIds.push(user.id);

    const classIndex = i <= 20 ? 0 : 1;
    addStudentToClass(db, classes[classIndex].id, user.id);
  }

  const rand = seededRandom(42);
  let attemptsCreated = 0;

  const profiles = [
    { weight: 0.35, challenges: 5, passRate: 0.9, scoreMin: 85, scoreMax: 100 },
    { weight: 0.25, challenges: 4, passRate: 0.6, scoreMin: 60, scoreMax: 85 },
    { weight: 0.20, challenges: 3, passRate: 0.3, scoreMin: 30, scoreMax: 60 },
    { weight: 0.10, challenges: 1, passRate: 0.1, scoreMin: 10, scoreMax: 40 },
    { weight: 0.10, challenges: 0, passRate: 0, scoreMin: 0, scoreMax: 0 },
  ];

  const tx = db.transaction(() => {
    for (const studentId of studentIds) {
      const profile = pickWeighted(profiles, rand);
      const challengePool = [...CHALLENGE_ATTEMPT_POOL].sort(() => rand() - 0.5).slice(0, profile.challenges);

      for (const challengeId of challengePool) {
        const passed = rand() < profile.passRate;
        const score = Math.round(profile.scoreMin + rand() * (profile.scoreMax - profile.scoreMin));
        const errors = passed
          ? []
          : [{ type: "连接错误", message: "部分端口方向不正确或缺少关键连接" }];

        recordStudentAttempt(db, studentId, challengeId, {
          passed,
          score: Math.min(score, 100),
          errors,
          elapsedMinutes: Math.round(3 + rand() * 20),
        });
        attemptsCreated++;
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
