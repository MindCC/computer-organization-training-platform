import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase,migrate,createUser,createClass,addStudentToClass } from '../server/db.js';
import { verifyPassword } from '../server/auth.js';
import { provisionDemoStudents } from '../server/demoStudentProvisioning.js';
test('real demo-class provisioning preserves existing credentials and rejects all conflicts before writes',async()=>{
  const db=openDatabase(':memory:');migrate(db);
  try {
    const teacher=createUser(db,{username:'demo-teacher',displayName:'Demo',role:'teacher',passwordHash:'unused',profile:{demoAccount:true}});
    const demo=createUser(db,{username:'demo-student',displayName:'Demo',role:'student',passwordHash:'unused',profile:{demoAccount:true}});
    const classroom=createClass(db,teacher.id,'计算机组成原理1班');addStudentToClass(db,classroom.id,demo.id);
    const roster=[{username:'99910812173',displayName:'测试甲'},{username:'99910812054',displayName:'测试乙'}];
    const result=await provisionDemoStudents(db,roster);assert.equal(result.created,2);assert.equal(result.classId,classroom.id);
    const user=db.prepare('SELECT * FROM users WHERE username=?').get(roster[0].username);
    assert(await verifyPassword(roster[0].username,user.password_hash));assert.equal(JSON.parse(user.profile_json).demoAccount,undefined);
    db.prepare("UPDATE users SET password_hash='edited' WHERE id=?").run(user.id);
    assert.equal((await provisionDemoStudents(db,roster)).reused,2);
    assert.equal(db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id).password_hash,'edited');
    await assert.rejects(provisionDemoStudents(db,[{username:'99910813068',displayName:'测试丙'},{...roster[0],displayName:'另一身份'}]),/占用/);
    assert.equal(db.prepare("SELECT 1 FROM users WHERE username='99910813068'").get(),undefined);
    assert.equal(db.prepare('SELECT teacher_id FROM classes WHERE id=?').get(classroom.id).teacher_id,teacher.id);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{db.close();}
});
