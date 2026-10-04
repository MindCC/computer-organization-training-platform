import { Router, json } from 'express';
import { createMindMapRepository } from './mindMapRepository.js';
import { generateMindMap, mindMapCapabilities } from './mindMapGeneration.js';
import { normalizeMindMap } from '../src/mindMap.js';

export function createMindMapRouter({db,requireRole,options={}}) {
  const router=Router(), repository=createMindMapRepository(db), pending=new Set(), requests=new Map();
  router.use('/mind-maps',requireRole(['student','teacher']),(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/mind-maps/capabilities',(_req,res)=>res.json(mindMapCapabilities(options.env)));
  router.get('/mind-maps', (req,res)=>res.json({maps:repository.list(req.user.id)}));
  router.post('/mind-maps/generate', json({limit:'8mb'}),async(req,res)=>{
    const id=req.user.id,now=Date.now();
    for(const [key,times] of requests)if(times.every(t=>now-t>=60000))requests.delete(key);
    const times=(requests.get(id)??[]).filter(t=>now-t<60000);
    if(pending.has(id)||times.length>=6)return res.status(429).json({error:'正在生成或请求过于频繁，请稍后重试（每分钟最多 6 次）'});
    pending.add(id);requests.set(id,[...times,now]);
    try {const b=req.body??{};res.json(await generateMindMap({text:b.text,image:b.image,graph:b.graph,consent:b.consent},options));}
    catch(e){res.status(e.status??500).json({error:e.status?e.message:'画板生成失败，请重试'});}
    finally{pending.delete(id);}
  });
  router.param('id',(req,res,next,id)=>{if(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<1)return res.status(400).json({error:'画板标识无效'});next();});
  router.get('/mind-maps/:id',(req,res)=>{const map=repository.get(req.user.id,Number(req.params.id));return map?res.json({map}):res.status(404).json({error:'画板不存在'});});
  router.post('/mind-maps',(req,res)=>{try{res.status(201).json({map:repository.create(req.user.id,normalizeMindMap(req.body?.graph))});}catch(e){res.status(400).json({error:e.message});}});
  router.put('/mind-maps/:id',(req,res)=>{
    const id=Number(req.params.id);
    if(!repository.get(req.user.id,id))return res.status(404).json({error:'画板不存在'});
    if(!Number.isSafeInteger(req.body?.version)||req.body.version<1)return res.status(400).json({error:'请提供已保存画板的版本'});
    try{const graph=normalizeMindMap(req.body?.graph),map=repository.update(req.user.id,id,req.body.version,graph);return map?res.json({map}):res.status(409).json({error:'此画板已在另一窗口更新，请另存为新画板以保留当前修改'});}catch(e){res.status(400).json({error:e.message});}
  });
  router.delete('/mind-maps/:id',(req,res)=>repository.delete(req.user.id,Number(req.params.id))?res.json({ok:true}):res.status(404).json({error:'画板不存在'}));
  return router;
}
