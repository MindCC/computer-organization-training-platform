import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { openDatabase,createUser,createClass,addStudentToClass,createSession } from './db.js';
import { hashToken } from './auth.js';
import { createAssemblyPracticeRepository } from './assemblyPracticeRepository.js';
import { HARDWARE_GAME_CASES } from '../src/hardwareGame.js';
import { createPracticeSeed } from '../src/assemblyPractice.js';

test('teacher practice reports enforce class membership and aggregate retained records without grades or raw drafts',async()=>{
  const db=openDatabase(':memory:'),app=createApp({db,serveStatic:false,logger:()=>{}});
  const users=['teacher','teacher','student','student','student'].map((role,i)=>createUser(db,{username:'tp-'+i,displayName:'学生'+i,role,passwordHash:'x'}));
  users.forEach((u,i)=>createSession(db,u.id,hashToken('tp-token-'+i),new Date(Date.now()+60000)));
  const group=createClass(db,users[0].id,'本班'),other=createClass(db,users[1].id,'其他班');
  addStudentToClass(db,group.id,users[2].id);addStudentToClass(db,group.id,users[3].id);addStudentToClass(db,other.id,users[4].id);
  const parts={cpu:'cpu-i3',memory:'mem-8',storage:'ssd-512',gpu:'gpu-integrated'};
  const repo=createAssemblyPracticeRepository(db),record={id:'run-one',mode:'guided',fault:'power',completedAt:1000,seconds:30,errorCount:2,hints:1,score:999,errors:['请先打开侧板']};
  const active={id:'active-one',mode:'fault',fault:'power',parts,...createPracticeSeed(parts,'fault','power'),category:'cpu',elapsedMs:5000,events:[{type:'hint',at:100,message:'提示'}]};
  repo.save(users[2].id,HARDWARE_GAME_CASES[0].id,{operationId:'teacher-test',baseRevision:0,document:{version:1,active,history:[record]}});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`,url=`/api/teacher/classes/${group.id}/assembly-practice`;
  const get=async(index,path=url)=>{const r=await fetch(base+path,{headers:index===null?{}:{cookie:`zcyl_session=tp-token-${index}`}});return {status:r.status,body:await r.json()};};
  try{
    assert.equal((await get(null)).status,401);assert.equal((await get(2)).status,403);assert.equal((await get(1)).status,404);
    assert.equal((await get(0,url+'/'+users[4].id)).status,404);
    const report=await get(0);assert.equal(report.status,200);assert.deepEqual(report.body.summary,{students:2,practiced:1,completed:1,active:1});
    const row=report.body.students[0];assert.equal(row.averageScore,87);assert.equal(row.seconds,30);assert.equal(row.errors,2);assert.equal(row.hints,1);
    assert.equal(row.history,undefined);assert.equal(row.active,undefined);assert.equal(report.body.students[1].averageScore,null);
    const detail=(await get(0,url+'/'+users[2].id)).body;
    assert.equal(detail.history[0].score,87);assert.equal(detail.active[0].hints,1);assert.equal(detail.active[0].parts,undefined);
    assert.deepEqual(detail.commonErrors,[{message:'请先打开侧板',count:1}]);
    db.prepare('UPDATE assembly_practice_documents SET document_json=? WHERE student_id=?').run('{bad',users[2].id);
    assert.equal((await get(0)).body.students[0].invalidRecords,1);
    db.prepare('DELETE FROM class_members WHERE class_id=? AND student_id=?').run(group.id,users[2].id);
    assert.equal((await get(0,url+'/'+users[2].id)).status,404);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM challenge_attempts').get().n,0);
  }finally{await new Promise(r=>server.close(r));db.close();}
});
