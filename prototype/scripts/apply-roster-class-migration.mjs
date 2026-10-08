// 一次性应用：对指定数据库执行 migrate()（含真实班级归属迁移），并打印核对结果。
// 用法：node scripts/apply-roster-class-migration.mjs [数据库路径]
import { openDatabase, migrate } from '../server/db.js';

const databasePath = process.argv[2] ?? process.env.DATABASE_PATH ?? 'data/classroom.sqlite';
const db = openDatabase(databasePath);
migrate(db);
const rows = db.prepare(`
  SELECT c.id, c.name, c.teacher_id, u.username AS teacher,
    (SELECT count(*) FROM class_members cm WHERE cm.class_id = c.id) AS members
  FROM classes c JOIN users u ON u.id = c.teacher_id
  WHERE u.username IN ('demo-teacher', 'teacher')
    AND (c.name LIKE '26计算机%' OR c.name LIKE '%演示%' OR c.name = '计算机组成原理1班')
  ORDER BY c.id
`).all();
for (const row of rows) console.log(`#${row.id} ${row.name} -> ${row.teacher} (members=${row.members})`);
db.close();
