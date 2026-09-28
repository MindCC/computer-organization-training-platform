import Database from "better-sqlite3";

/** 教师账号是否已存在（供 deploy 脚本判断要不要 seed:teacher）。 */
const db = new Database(process.env.DATABASE_PATH, { readonly: true });
const row = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = ?").get("teacher");
process.exit(row.n > 0 ? 0 : 1);
