import { Router } from 'express';
import { recommendations, sparkSummary, feedbackRecommendation, startRemediation, remediationSession, submitRemediation } from './studyRecommendations.js';

export function createStudyRecommendationRouter({db,requireRole}) {
  const router=Router();
  for(const role of ['student','teacher']) {
    const prefix=`/${role}/study-recommendations`;
    const handle=fn=>(req,res,next)=>{res.set('Cache-Control','no-store');try{res.json(fn(req));}catch(error){next(error);}};
    router.get(prefix,requireRole(role),handle(req=>recommendations(db,req.user.id)));
    router.get(`${prefix}/spark`,requireRole(role),handle(req=>sparkSummary(db,req.user.id)));
    router.post(`${prefix}/feedback`,requireRole(role),handle(req=>feedbackRecommendation(db,req.user.id,req.body?.conceptId,req.body?.choice)));
    router.post(`${prefix}/sessions`,requireRole(role),handle(req=>startRemediation(db,req.user.id,req.body?.conceptId)));
    router.get(`${prefix}/sessions/:id`,requireRole(role),handle(req=>remediationSession(db,req.user.id,req.params.id)));
    router.post(`${prefix}/sessions/:id`,requireRole(role),handle(req=>submitRemediation(db,req.user.id,req.params.id,req.body)));
  }
  return router;
}
