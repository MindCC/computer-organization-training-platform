import { fileURLToPath } from 'node:url';
import { ensureDemoAccounts } from './demoAccounts.js';
import { getUserByUsername, migrate, openDatabase, resolveDatabasePath, sanitizeUser } from './db.js';

function hasOtherClassRecords(db, classId) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  for (const { name } of tables) {
    if (name === 'classes' || name === 'class_members') continue;
    const quotedTable = `"${name.replaceAll('"', '""')}"`;
    for (const key of db.pragma(`foreign_key_list(${quotedTable})`)) {
      if (key.table !== 'classes') continue;
      const quotedColumn = `"${key.from.replaceAll('"', '""')}"`;
      if (db.prepare(`SELECT 1 FROM ${quotedTable} WHERE ${quotedColumn} = ? LIMIT 1`).get(classId)) return true;
    }
  }
  return false;
}

/** Remove only the 40 accounts and two classes created by the retired synthetic seed. */
export async function removeLegacyDemoSeed(db) {
  const students = [];
  for (let index = 1; index <= 40; index += 1) {
    const user = getUserByUsername(db, `demo2026${String(index).padStart(3, '0')}`);
    if (user?.role === 'student' && user.display_name === `演示学生${index}`
      && sanitizeUser(user).profile?.seeded === true) students.push(user);
  }
  const studentIds = students.map((student) => student.id);
  const teacher = getUserByUsername(db, 'teacher');
  const seededClasses = teacher && studentIds.length ? db.prepare(`
    SELECT c.id FROM classes c
    WHERE c.teacher_id = ? AND c.name IN ('计组一班', '计组二班')
      AND EXISTS (SELECT 1 FROM class_members cm WHERE cm.class_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM class_members cm WHERE cm.class_id = c.id
        AND cm.student_id NOT IN (${studentIds.map(() => '?').join(', ')}))
      AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.class_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM classroom_sessions s WHERE s.class_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM course_drafts d WHERE d.class_id = c.id)
  `).all(teacher.id, ...studentIds).map((row) => row.id).filter((id) => !hasOtherClassRecords(db, id)) : [];

  db.transaction(() => {
    for (const student of students) db.prepare('DELETE FROM users WHERE id = ?').run(student.id);
    for (const classId of seededClasses) db.prepare('DELETE FROM classes WHERE id = ?').run(classId);
  })();
  const demo = await ensureDemoAccounts(db);
  return { removedStudents: students.length, removedSeededClasses: seededClasses.length,
    demoTeacher: demo.teacher.username, demoStudent: demo.student.username, demoClass: demo.classroom.name };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolveDatabasePath(process.argv[1])) {
  const db = openDatabase(process.env.DATABASE_PATH);
  try {
    migrate(db);
    console.log(JSON.stringify(await removeLegacyDemoSeed(db)));
    console.log(`Database: ${resolveDatabasePath(process.env.DATABASE_PATH)}`);
  } finally { db.close(); }
}
