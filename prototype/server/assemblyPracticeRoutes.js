import { Router } from 'express';
import { HARDWARE_GAME_CASES } from '../src/hardwareGame.js';
import { normalizePracticeDocument } from '../src/assemblyPracticeStorage.js';

export function createAssemblyPracticeRouter({repository,requireRole}){
  const router=Router(),path='/student/assembly-practice/:caseId';
  router.use('/student/assembly-practice',requireRole('student'));
  function validate(req,res,next){
    if(req.get('x-practice-student')&&String(req.user.id)!==req.get('x-practice-student'))return res.status(403).json({error:'登录身份已变更，请重新进入练习'});
    if(!HARDWARE_GAME_CASES.some(item=>item.id===req.params.caseId))return res.status(404).json({error:'练习订单不存在'});
    res.set('Cache-Control','no-store');next();
  }
  router.get(path,validate,(req,res)=>res.json(repository.get(req.user.id,req.params.caseId)));
  router.put(path,validate,(req,res,next)=>{
    const {operationId,baseRevision,document}=req.body??{};
    if(typeof operationId!=='string'||!/^[-a-zA-Z0-9]{8,100}$/.test(operationId)||!Number.isSafeInteger(baseRevision)||baseRevision<0)
      return res.status(400).json({error:'同步请求标识或版本无效'});
    if(Buffer.byteLength(JSON.stringify(document)??'')>900000)return res.status(413).json({error:'练习记录过大，无法同步'});
    let clean;
    try{clean=normalizePracticeDocument(document);}catch(error){return res.status(400).json({error:error.message});}
    try{res.json(repository.save(req.user.id,req.params.caseId,{operationId,baseRevision,document:clean}));}
    catch(error){if(error.status===409)return res.status(409).json({error:error.message,current:error.current});next(error);}
  });
  return router;
}
