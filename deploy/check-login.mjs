import Database from "better-sqlite3";
import crypto from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

async function verifyPassword(password, storedHash) {
  const [scheme, salt, hash] = String(storedHash ?? "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = await scryptAsync(String(password), salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

const db = new Database("/var/lib/zcyl/classroom.sqlite", { readonly: true });
const students = db.prepare("SELECT id, username, password_hash, profile_json FROM users WHERE role='student' ORDER BY username LIMIT 3").all();
console.log("学生样例数:", students.length);
for (const s of students) {
  const ok = await verifyPassword("Student123!", s.password_hash);
  console.log(s.username, "verify(Student123!) =", ok, "| profile:", (s.profile_json ?? "").slice(0, 80));
}
const teacher = db.prepare("SELECT username, password_hash FROM users WHERE role='teacher'").get();
console.log(teacher.username, "verify(ChangeMe123!) =", await verifyPassword("ChangeMe123!", teacher.password_hash));
