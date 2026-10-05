import { Router } from 'express';
import { createTaskLibrary } from './taskLibrary.js';
export function createTaskLibraryRouter({db,sessionService,requireRole}) {
  const library=createTaskLibrary({db,sessionService}),router=Router();
  router.use('/teacher/task-library',requireRole('teacher'));
  const handle=fn=>(req,res,next)=>{try{fn(req,res);}catch(error){next(error);}};
  router.get('/teacher/task-library',handle((req,res)=>res.json({tasks:library.list(req.user.id)})));
  router.post('/teacher/task-library',handle((req,res)=>res.status(201).json({task:library.create(req.user.id,req.body)})));
  router.get('/teacher/task-library/:id',handle((req,res)=>res.json({task:library.get(req.user.id,Number(req.params.id))})));
  router.get('/teacher/task-library/:id/learning',handle((req,res)=>res.json({learning:library.learning(req.user.id,Number(req.params.id),req.query.sessionId===undefined?null:Number(req.query.sessionId))})));
  router.put('/teacher/task-library/:id',handle((req,res)=>res.json({task:library.update(req.user.id,Number(req.params.id),req.body)})));
  router.delete('/teacher/task-library/:id',handle((req,res)=>res.json(library.remove(req.user.id,Number(req.params.id),req.body?.revision))));
  router.post('/teacher/task-library/:id/publish',handle((req,res)=>res.status(201).json(library.publish(req.user.id,Number(req.params.id),req.body))));
  return router;
}
