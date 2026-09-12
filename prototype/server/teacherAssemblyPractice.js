import { Router } from 'express';
import { teacherOwnsClass } from './db.js';
import { normalizePracticeDocument } from '../src/assemblyPracticeStorage.js';
import { HARDWARE_GAME_CASES } from '../src/hardwareGame.js';

export function practiceStudentReport(db,classId,studentId){
  const student=db.prepare(`SELECT u.id,u.username,u.display_name FROM users u JOIN class_members m ON m.student_id=u.id
    WHERE m.class_id=? AND u.id=?`).get(classId,studentId);
  if(!student)return null;
  const history=[],active=[];let invalidRecords=0,lastSyncedAt=null;
  for(const row of db.prepare('SELECT case_id,document_json,updated_at FROM assembly_practice_documents WHERE student_id=?').all(studentId)){
    const order=HARDWARE_GAME_CASES.find(item=>item.id===row.case_id);if(!order)continue;
    let document;try{document=normalizePracticeDocument(JSON.parse(row.document_json));}catch{invalidRecords++;continue;}
    const meta={caseId:row.case_id,caseTitle:order.title};
    if(!lastSyncedAt||row.updated_at>lastSyncedAt)lastSyncedAt=row.updated_at;
    history.push(...document.history.map(record=>({...record,...meta})));
    if(document.active){const run=document.active;active.push({...meta,id:run.id,mode:run.mode,fault:run.fault,seconds:Math.round(run.elapsedMs/1000),
      errors:run.events.filter(e=>e.type==='action'&&!e.ok).length,hints:run.events.filter(e=>e.type==='hint').length});}
  }
  history.sort((a,b)=>b.completedAt-a.completedAt);
  const completed=history.length,totalErrors=history.reduce((n,r)=>n+r.errorCount,0),hints=history.reduce((n,r)=>n+r.hints,0);
  const errorCounts=new Map();for(const record of history)for(const message of record.errors)errorCounts.set(message,(errorCounts.get(message)??0)+1);
  return {studentId:student.id,username:student.username,displayName:student.display_name,completed,activeCount:active.length,
    averageScore:completed?Math.round(history.reduce((n,r)=>n+r.score,0)/completed):null,
    seconds:history.reduce((n,r)=>n+r.seconds,0),errors:totalErrors,hints,lastSyncedAt,invalidRecords,
    commonErrors:[...errorCounts].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([message,count])=>({message,count})),history,active};
}

export function createTeacherAssemblyPracticeRouter({db,requireRole}){
  const router=Router(),path='/teacher/classes/:classId/assembly-practice';
  function access(req,res,next){
    const classId=Number(req.params.classId);
    if(!Number.isSafeInteger(classId)||classId<1||!teacherOwnsClass(db,req.user.id,classId))return res.status(404).json({error:'班级不存在'});
    res.set('Cache-Control','no-store');next();
  }
  router.get(path,requireRole('teacher'),access,(req,res)=>{
    const students=db.prepare('SELECT student_id FROM class_members WHERE class_id=? ORDER BY student_id').all(Number(req.params.classId))
      .map(row=>practiceStudentReport(db,Number(req.params.classId),row.student_id))
      .map(({history,active,...summary})=>summary);
    res.json({students,summary:{students:students.length,practiced:students.filter(s=>s.completed||s.activeCount).length,
      completed:students.reduce((n,s)=>n+s.completed,0),active:students.reduce((n,s)=>n+s.activeCount,0)}});
  });
  router.get(path+'/:studentId',requireRole('teacher'),access,(req,res)=>{
    const studentId=Number(req.params.studentId);
    const report=Number.isSafeInteger(studentId)&&studentId>0?practiceStudentReport(db,Number(req.params.classId),studentId):null;
    if(!report)return res.status(404).json({error:'学生不在当前班级'});
    res.json(report);
  });
  return router;
}
