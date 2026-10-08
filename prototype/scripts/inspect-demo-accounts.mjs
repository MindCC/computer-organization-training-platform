import Database from 'better-sqlite3';
const db = new Database(process.env.DATABASE_PATH ?? 'data/classroom.sqlite', { readonly: true });
const users = db.prepare('SELECT id,username,display_name,role,status,profile_json FROM users ORDER BY id').all();
console.log(`USERS (${users.length}):`);
for (const u of users) console.log(` #${u.id} ${u.username} (${u.display_name}) role=${u.role} status=${u.status} profile=${u.profile_json}`);
console.log('CLASSES:');
for (const c of db.prepare('SELECT id,name,teacher_id FROM classes ORDER BY id').all()) {
  const members = db.prepare('SELECT count(*) n FROM class_members WHERE class_id=?').get(c.id).n;
  console.log(` #${c.id} ${c.name} teacher=${c.teacher_id} members=${members}`);
}
db.close();
