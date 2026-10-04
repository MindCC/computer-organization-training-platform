import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { serviceOrder, serviceSeed, serviceApply, serviceGrade, serviceFail } from '../src/shopServiceGame.js';

export function ensureShopServiceTables(db){
  db.exec(`CREATE TABLE IF NOT EXISTS shop_service_runs(id TEXT PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,order_id TEXT NOT NULL,state_json TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS shop_service_student ON shop_service_runs(student_id,updated_at);
    CREATE TABLE IF NOT EXISTS shop_service_operations(run_id TEXT NOT NULL REFERENCES shop_service_runs(id) ON DELETE CASCADE,operation_id TEXT NOT NULL,request_json TEXT NOT NULL,response_json TEXT NOT NULL,PRIMARY KEY(run_id,operation_id));`);
}
export function serviceRecords(db,studentId){
  return db.prepare('SELECT * FROM shop_service_runs WHERE student_id=? ORDER BY updated_at DESC LIMIT 300').all(studentId).map(row=>({...row,title:serviceOrder(row.order_id)?.title,customer:serviceOrder(row.order_id)?.name,state:JSON.parse(row.state_json),state_json:undefined,student_id:undefined}));
}
export function serviceMistakes(db,studentId){
  const groups=new Map();
  for(const run of serviceRecords(db,studentId).reverse()){
    const order=serviceOrder(run.order_id);if(!order)continue;
    let item=groups.get(order.id);
    if(run.state.mistakes.length){
      item??={id:`service:${order.id}`,source:'service',title:`${order.name} · ${order.title}`,errorType:'瓶颈诊断',count:0,firstSeen:run.created_at,snapshots:[],navigation:{source:'service',orderId:order.id},explanation:order.lesson};
      item.count+=run.state.mistakes.length;item.lastSeen=run.updated_at;groups.set(order.id,item);
    }
    if(item){item.resolved=Boolean(run.state.result?.passed);item.updatedAt=run.updated_at;}
  }
  return [...groups.values()];
}
export function createShopServiceRouter({db,requireRole}){
  ensureShopServiceTables(db);const router=Router();
  router.use('/student/shop-service',requireRole('student'),(req,res,next)=>{res.set('Cache-Control','no-store');if(req.get('x-service-student')&&req.get('x-service-student')!==String(req.user.id))return res.status(403).json({error:{code:'IDENTITY_CHANGED',message:'登录身份已变更，请重新进入工单'}});next();});
  const format=row=>({id:row.id,orderId:row.order_id,version:row.version,state:JSON.parse(row.state_json)});
  router.get('/student/shop-service', (req,res)=>res.json({records:serviceRecords(db,req.user.id)}));
  router.post('/student/shop-service', (req,res)=>{
    try{
      const order=serviceOrder(req.body?.orderId);if(!order)serviceFail('工单不存在','ORDER_NOT_FOUND',404);
      const active=db.prepare('SELECT * FROM shop_service_runs WHERE student_id=? AND order_id=? ORDER BY created_at DESC').all(req.user.id,order.id).find(row=>!JSON.parse(row.state_json).result?.passed);
      if(active)return res.json({run:format(active)});
      if(db.prepare('SELECT COUNT(*) AS n FROM shop_service_runs WHERE student_id=?').get(req.user.id).n>=300)serviceFail('工单数量已达上限，请回看已完成记录','RUN_LIMIT',429);
      const id=randomUUID(),now=new Date().toISOString();db.prepare('INSERT INTO shop_service_runs(id,student_id,order_id,state_json,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,req.user.id,order.id,JSON.stringify(serviceSeed(order.id)),now,now);
      res.status(201).json({run:format(db.prepare('SELECT * FROM shop_service_runs WHERE id=?').get(id))});
    }catch(error){res.status(error.status??500).json({error:{code:error.code??'SERVICE_SAVE',message:error.status?error.message:'工单保存失败，请重试'}});}
  });
  router.post('/student/shop-service/:id/actions',(req,res)=>{
    try{
      const row=db.prepare('SELECT * FROM shop_service_runs WHERE id=? AND student_id=?').get(req.params.id,req.user.id);if(!row)serviceFail('工单不存在','ORDER_NOT_FOUND',404);
      const {operationId,version,action}=req.body??{};
      if(typeof operationId!=='string'||!/^[-a-zA-Z0-9]{8,100}$/.test(operationId)||!Number.isSafeInteger(version)||!action)serviceFail('提交标识或版本无效','INVALID_REQUEST',400);
      const requestJson=JSON.stringify({version,action});
      const existing=db.prepare('SELECT * FROM shop_service_operations WHERE run_id=? AND operation_id=?').get(row.id,operationId);
      if(existing){if(existing.request_json!==requestJson)serviceFail('同一次操作内容不能更改','OPERATION_CONFLICT');return res.json(JSON.parse(existing.response_json));}
      if(row.version!==version)serviceFail('工单已在另一窗口更新，请重新载入','VERSION_CONFLICT');
      if(row.version>=300)serviceFail('本单操作次数已达上限，请联系教师查看记录','ACTION_LIMIT',429);
      const order=serviceOrder(row.order_id),state=JSON.parse(row.state_json);
      if(state.result?.passed)serviceFail('工单已完成','ORDER_COMPLETED');
      const next=action.type==='deliver'?{...state,result:serviceGrade(order,state,action.evidence)}:serviceApply(order,state,action);
      const response={run:{id:row.id,orderId:row.order_id,version:version+1,state:next}};
      db.exec('BEGIN IMMEDIATE');try{
        db.prepare('UPDATE shop_service_runs SET state_json=?,version=?,updated_at=? WHERE id=? AND student_id=?').run(JSON.stringify(next),version+1,new Date().toISOString(),row.id,req.user.id);
        db.prepare('INSERT INTO shop_service_operations(run_id,operation_id,request_json,response_json) VALUES(?,?,?,?)').run(row.id,operationId,requestJson,JSON.stringify(response));db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      res.status(201).json(response);
    }catch(error){res.status(error.status??500).json({error:{code:error.code??'SERVICE_SAVE',message:error.status?error.message:'操作保存失败，请重试'}});}
  });return router;
}
