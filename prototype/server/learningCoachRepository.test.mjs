import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase,migrate,createUser,createClass,addStudentToClass } from './db.js';
import { migrateLearningCoach,createLearningCoachRepository } from './learningCoachRepository.js';

test('legacy single-experiment tasks migrate without losing rows and can coexist with new experiments',()=>{
  const db=openDatabase(':memory:');try{
    db.exec(`CREATE TABLE learning_coach_tasks(id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER NOT NULL REFERENCES users(id),class_id INTEGER NOT NULL REFERENCES classes(id),student_id INTEGER NOT NULL REFERENCES users(id),title TEXT NOT NULL,completed_run_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE UNIQUE INDEX idx_coach_active_task ON learning_coach_tasks(class_id,student_id) WHERE completed_run_id IS NULL;`);
    migrate(db);
    const teacher=createUser(db,{username:'teacher-migrate',displayName:'教师',role:'teacher',passwordHash:'test'}),student=createUser(db,{username:'student-migrate',displayName:'学生',role:'student',passwordHash:'test'});
    const classId=createClass(db,teacher.id,'迁移验证班').id;addStudentToClass(db,classId,student.id);
    db.prepare('INSERT INTO learning_coach_tasks(teacher_id,class_id,student_id,title) VALUES(?,?,?,?)').run(teacher.id,classId,student.id,'原有全加器补练');
    migrateLearningCoach(db);const repo=createLearningCoachRepository(db);
    assert.equal(repo.tasks(student.id)[0].challengeId,'full-adder');
    assert.equal(repo.publishTasks(teacher.id,classId,[student.id],'与门补练','and-gate').created,1);
    assert.equal(repo.publishTasks(teacher.id,classId,[student.id],'与门补练','and-gate').existing,1);
    assert.equal(repo.tasks(student.id).length,2);
  }finally{db.close();}
});
