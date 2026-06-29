import { hashPassword } from "./auth.js";
import { createUser, getUserByUsername, migrate, openDatabase, resolveDatabasePath } from "./db.js";

const username = process.env.TEACHER_USERNAME ?? "teacher";
const password = process.env.TEACHER_PASSWORD ?? "ChangeMe123!";
const displayName = process.env.TEACHER_NAME ?? "任课教师";

const db = openDatabase(process.env.DATABASE_PATH);
migrate(db);
const existing = getUserByUsername(db, username);
if (existing) {
  console.log(`Teacher already exists: ${username}`);
} else {
  createUser(db, {
    username,
    displayName,
    role: "teacher",
    passwordHash: await hashPassword(password),
    profile: { seeded: true },
  });
  console.log(`Teacher created: ${username}`);
  console.log(`Initial password: ${password}`);
}
console.log(`Database: ${resolveDatabasePath(process.env.DATABASE_PATH)}`);
