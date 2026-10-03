import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { HARDWARE_PARTS, gradeHardwareOrder } from '../src/hardwareGame.js';
import { generateCustomerStory, normalizeCustomerInput } from './customCustomer.js';
import { readDeepSeekConfig } from './aiClient.js';

export function createCustomCustomerRouter({db,requireRole,options={}}){
  db.exec(`CREATE TABLE IF NOT EXISTS custom_customer_orders(id TEXT PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,story_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS custom_customer_student ON custom_customer_orders(student_id);
    CREATE TABLE IF NOT EXISTS custom_customer_receipts(order_id TEXT NOT NULL REFERENCES custom_customer_orders(id) ON DELETE CASCADE,operation_id TEXT NOT NULL,selection_json TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(order_id,operation_id));`);
  const router=Router(),pending=new Set(),recent=new Map();
  router.use('/student/custom-customers',requireRole('student'),(req,res,next)=>{if(req.get('x-custom-student')&&req.get('x-custom-student')!==String(req.user.id))return res.status(403).json({error:{code:'IDENTITY_CHANGED',message:'登录身份已变更，请重新进入客户工坊'}});res.set('Cache-Control','no-store');next();});
  const fail=(res,status,code,message)=>res.status(status).json({error:{code,message}});
  router.get('/student/custom-customers/status',(_req,res)=>res.json({enabled:readDeepSeekConfig(options.env??process.env).enabled}));
  router.post('/student/custom-customers',async(req,res)=>{
    let input;try{input=normalizeCustomerInput(req.body);}catch(e){return fail(res,400,e.code,e.message);}
    const id=req.user.id,now=Date.now(),times=(recent.get(id)??[]).filter(t=>now-t<60000);
    if(pending.has(id)||times.length>=3)return fail(res,429,'AI_BUSY','请稍后再生成，每分钟最多生成三次');
    // Expired entries cannot accumulate as more students use the feature.
    for(const [key,list] of recent)if(list.every(t=>now-t>=60000))recent.delete(key);
    pending.add(id);recent.set(id,[...times,now]);
    try{
      const story=await generateCustomerStory(input,options),orderId=randomUUID();
      db.prepare('INSERT INTO custom_customer_orders(id,student_id,story_json) VALUES(?,?,?)').run(orderId,id,JSON.stringify(story));
      res.status(201).json({order:{id:orderId,...story}});
    }catch(e){if(!e.code?.startsWith('AI_'))return fail(res,500,'ORDER_SAVE_FAILED','工单保存失败，请稍后重试，输入仍保留');const code=e.code;const message=code==='AI_DISABLED'?'服务器尚未配置 DeepSeek，需求已保留，请配置后重试':code==='AI_TIMEOUT'?'AI 分析超时，请保留需求并重试':code==='AI_HTTP'?'AI 服务暂时无法响应，请稍后重试':'AI 返回内容未通过校验，请重试生成';fail(res,code==='AI_DISABLED'?503:502,code,message);}finally{pending.delete(id);}
  });
  function owned(req,res){const row=db.prepare('SELECT story_json FROM custom_customer_orders WHERE id=? AND student_id=?').get(req.params.id,req.user.id);if(!row){fail(res,404,'ORDER_NOT_FOUND','自定义工单不存在');return null;}return JSON.parse(row.story_json);}
  router.get('/student/custom-customers/:id',(req,res)=>{const story=owned(req,res);if(story)res.json({order:{id:req.params.id,...story}});});
  router.post('/student/custom-customers/:id/receipts',(req,res)=>{
    const story=owned(req,res);if(!story)return;
    if(!story.targets)return fail(res,409,'REQUIREMENTS_INCOMPLETE','请补充需求并重新生成工单');
    const {selection,operationId}=req.body??{};
    if(typeof operationId!=='string'||!/^[-a-zA-Z0-9]{8,100}$/.test(operationId)||!selection||Object.keys(selection).length!==4||Object.entries(HARDWARE_PARTS).some(([key,parts])=>!parts.some(p=>p.id===selection[key])))return fail(res,400,'INVALID_SELECTION','配置或提交标识无效');
    const canonical=JSON.stringify(Object.fromEntries(Object.keys(HARDWARE_PARTS).map(key=>[key,selection[key]])));
    const existing=db.prepare('SELECT selection_json,result_json FROM custom_customer_receipts WHERE order_id=? AND operation_id=?').get(req.params.id,operationId);
    if(existing){if(existing.selection_json!==canonical)return fail(res,409,'SUBMISSION_CONFLICT','提交标识已用于其他配置');return res.json({result:JSON.parse(existing.result_json),synced:true});}
    const result=gradeHardwareOrder(story,selection);
    db.prepare('INSERT INTO custom_customer_receipts(order_id,operation_id,selection_json,result_json) VALUES(?,?,?,?)').run(req.params.id,operationId,canonical,JSON.stringify(result));
    res.status(201).json({result,synced:true});
  });
  return router;
}
