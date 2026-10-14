import { Router } from 'express';
import { engagementSummary, recordStudyVisit, classEngagement, saveEngagementPolicy, confirmEngagementBonus } from './studyEngagement.js';

export function createStudyEngagementRouter({db,requireRole}) {
  const router=Router();
  const handle=fn=>(req,res,next)=>{res.set('Cache-Control','no-store');try{res.json(fn(req));}catch(error){next(error);}};
  for(const role of ['student','teacher']) {
    router.get(`/${role}/study-engagement`,requireRole(role),handle(req=>engagementSummary(db,req.user.id)));
    router.post(`/${role}/study-engagement/visit`,requireRole(role),handle(req=>recordStudyVisit(db,req.user.id)));
  }
  const base='/teacher/classes/:classId/study-engagement';
  router.get(base,requireRole('teacher'),handle(req=>classEngagement(db,req.user.id,Number(req.params.classId))));
  router.post(base+'/policy',requireRole('teacher'),handle(req=>saveEngagementPolicy(db,req.user.id,Number(req.params.classId),req.body)));
  router.post(base+'/confirm',requireRole('teacher'),handle(req=>confirmEngagementBonus(db,req.user.id,Number(req.params.classId),req.body)));
  router.get(base+'/export.csv',requireRole('teacher'),(req,res,next)=>{
    try {
      const data=classEngagement(db,req.user.id,Number(req.params.classId));
      // Spreadsheet formula injection protection, including student-edited names and reasons.
      const cell=v=>{const value=String(v??'');return '"'+(/^[\s]*[=+@\-]|^[\t\r\n]/.test(value)?"'"+value:value).replaceAll('"','""')+'"';};
      const rows=[['学号','姓名','起始日期','结束日期','规则版本','默契值','加分上限','建议加分','已确认加分','审核时间','审核理由'],
        ...data.students.map(s=>[s.username,res.locals.presentStudentName?.(s.displayName)??s.displayName,data.policy.startDate,data.policy.endDate,data.policy.version,s.score,data.policy.bonusCap,s.suggestedBonus,s.confirmation?.bonus,s.confirmation?.createdAt,s.confirmation?.reason])];
      res.set('Cache-Control','no-store');res.set('Content-Disposition','attachment; filename="companion-bonus.csv"');res.type('text/csv').send('\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n'));
    }catch(error){next(error);}
  });
  return router;
}
