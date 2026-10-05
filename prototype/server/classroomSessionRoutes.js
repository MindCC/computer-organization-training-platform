import { Router } from "express";
import { buildClassroomHeatmap } from "./classroomAnalytics.js";
import { missionForSession } from "../src/shared/classroomMissionDefinitions.js";
import { generateTaskChain } from './taskChainGenerator.js';

export function createClassroomSessionRouter({ service, requireRole, generatorOptions }) {
  const router = Router();
  const pending=new Set(),requests=new Map();
  router.post('/teacher/classes/:classId/task-chain/generate',requireRole('teacher'),async(req,res,next)=>{
    res.set('Cache-Control','no-store');
    const teacherId=req.user.id;
    try {
      service.getCurrentForClass({teacherId,classId:Number(req.params.classId)});
      const now=Date.now();for(const [id,times] of requests)if(times.every(time=>now-time>=60000))requests.delete(id);
      const times=(requests.get(teacherId)??[]).filter(time=>now-time<60000);
      if(pending.has(teacherId)||times.length>=5)return res.status(429).json({error:{code:'AI_BUSY',message:'任务链正在生成，请稍后重试；每分钟最多生成五次。'}});
      // Allowlist only the explicitly entered teaching request. Ignore all injected records.
      const body=req.body??{},payload={prompt:body.prompt,consent:body.consent};
      pending.add(teacherId);requests.set(teacherId,[...times,now]);
      try {res.json(await generateTaskChain(payload,generatorOptions));}finally{pending.delete(teacherId);}
    }catch(error){next(error);}
  });
  router.put('/teacher/sessions/:id',requireRole('teacher'),(req,res,next)=>{
    try{res.json({session:service.updateDraft({teacherId:req.user.id,sessionId:Number(req.params.id),config:req.body})});}catch(error){next(error);}
  });
  router.post('/student/classroom/:sessionId/complete-stage',requireRole('student'),(req,res,next)=>{
    try{res.json(service.completeStage({studentId:req.user.id,sessionId:Number(req.params.sessionId),payload:req.body}));}catch(error){next(error);}
  });

  router.post("/teacher/classes/:classId/sessions", requireRole("teacher"), (req, res, next) => {
    try {
      const session = service.createDraft({
        teacherId: req.user.id,
        classId: Number(req.params.classId),
        config: req.body,
      });
      res.status(201).json({ session });
    } catch (error) {
      next(error);
    }
  });

  router.get("/teacher/classes/:classId/sessions/current", requireRole("teacher"), (req, res, next) => {
    try {
      res.json(service.getCurrentForClass({
        teacherId: req.user.id,
        classId: Number(req.params.classId),
      }));
    } catch (error) {
      next(error);
    }
  });

  for (const action of ["start", "pause", "resume", "end"]) {
    router.post(`/teacher/sessions/:id/${action}`, requireRole("teacher"), (req, res, next) => {
      try {
        const result = service[action]({ teacherId: req.user.id, sessionId: Number(req.params.id) });
        res.json(action === "end" ? result : { session: result });
      } catch (error) {
        next(error);
      }
    });
  }

  router.get("/teacher/sessions/:id/overview", requireRole("teacher"), (req, res, next) => {
    try {
      res.json(service.getTeacherOverview({ teacherId: req.user.id, sessionId: Number(req.params.id) }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/teacher/sessions/:id/report", requireRole("teacher"), (req, res, next) => {
    try {
      res.json({ report: service.getReport({ teacherId: req.user.id, sessionId: Number(req.params.id) }) });
    } catch (error) { next(error); }
  });

  router.get("/teacher/sessions/:id/analytics", requireRole("teacher"), (req, res, next) => {
    try {
      const overview = service.getTeacherOverview({ teacherId: req.user.id, sessionId: Number(req.params.id) });
      const s = overview.session;
      const m = missionForSession(s);
      res.json(buildClassroomHeatmap({ session: s, students: overview.students.map(student=>({...student,current_stage_index:student.currentStageIndex,result_json:JSON.stringify(student.result),last_activity_at:student.lastActivityAt})), mission: m }));
    } catch (error) { next(error); }
  });

  router.get("/teacher/sessions/:sessionId/students/:studentId/replay", requireRole("teacher"), (req, res, next) => {
    try {
      res.json(service.getStudentReplay({
        teacherId: req.user.id,
        sessionId: Number(req.params.sessionId),
        studentId: Number(req.params.studentId),
      }));
    } catch (error) { next(error); }
  });

  router.get("/student/classroom/current", requireRole("student"), (req, res, next) => {
    try {
      res.json(service.getStudentCurrent({ studentId: req.user.id }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/student/classroom/:sessionId/enter", requireRole("student"), (req, res, next) => {
    try {
      res.json(service.enterStudent({ studentId: req.user.id, sessionId: Number(req.params.sessionId) }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
