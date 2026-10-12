import { getUserByUsername, createUser, addStudentToClass } from './db.js';
import { hashPassword, verifyPassword } from './auth.js';

export async function provisionDemoStudents(db, students) {
  const fail = message => { throw new Error(message); };
  if (!Array.isArray(students) || !students.length || students.length > 100) fail('学生名单无效');
  const usernames = new Set();
  for (const student of students) {
    if (!/^\d{8,20}$/.test(student.username) || typeof student.displayName !== 'string' || !student.displayName.trim() || student.displayName.length > 50 || usernames.has(student.username)) fail('名单有无效或重复的学号/姓名');
    usernames.add(student.username);
  }
  function preflight() {
    const teacher = getUserByUsername(db, 'demo-teacher'), demo = getUserByUsername(db, 'demo-student');
    if (teacher?.role !== 'teacher' || demo?.role !== 'student') fail('演示账号不存在');
    const rows = db.prepare(`SELECT c.id,c.name FROM classes c JOIN class_members cm ON cm.class_id=c.id
      WHERE c.teacher_id=? AND cm.student_id=? AND c.status='active'
      AND c.name IN ('计算机组成原理1班','芯游记 · 演示教学班')`).all(teacher.id, demo.id);
    if (rows.length !== 1) fail('无法唯一确定现有演示班级');
    for (const student of students) {
      const existing = getUserByUsername(db, student.username);
      if (existing && (existing.role !== 'student' || existing.display_name !== student.displayName || JSON.parse(existing.profile_json).demoAccount || JSON.parse(existing.profile_json).readOnly || !db.prepare('SELECT 1 FROM class_members WHERE class_id=? AND student_id=?').get(rows[0].id, existing.id))) fail(`学号已被其他身份占用：${student.username}`);
    }
    return rows[0];
  }
  preflight();
  const prepared = [];
  for (const student of students) {
    const passwordHash = await hashPassword(student.username);
    if (!await verifyPassword(student.username, passwordHash)) fail('密码核验失败');
    prepared.push({...student, passwordHash});
  }
  return db.transaction(() => {
    const classroom = preflight(); let created = 0;
    for (const student of prepared) {
      let user = getUserByUsername(db, student.username);
      if (!user) {
        user = createUser(db, {...student, role:'student', profile:{mode:'适中提示模式', mustChangePassword:false}});
        addStudentToClass(db, classroom.id, user.id); created++;
      }
      if (!db.prepare('SELECT 1 FROM class_members WHERE class_id=? AND student_id=?').get(classroom.id,user.id)) fail('班级写入核验失败');
    }
    return {classId:classroom.id,className:classroom.name,created,reused:students.length-created,students:students.map(({username,displayName})=>({username,displayName}))};
  }).immediate();
}
