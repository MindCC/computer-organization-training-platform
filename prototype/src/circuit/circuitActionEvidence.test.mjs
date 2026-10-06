import test from 'node:test';
import assert from 'node:assert/strict';
import { getCircuitChallenge } from './challengeCircuitModel.js';
import { circuitActionEvidence, safeCircuitAction } from './circuitActionEvidence.js';
const model=getCircuitChallenge('full-adder'),edge=model.requiredEdges[0];
test('rejected connections preserve endpoint evidence and give reason plus repair',()=>{
 const action={kind:'connect',from:edge.from,to:edge.to,ok:false,code:'输入端重复驱动',sequence:1};
 const evidence=circuitActionEvidence(action,model);
 assert.match(evidence.description,/连接/);assert.match(evidence.reason,/已经/);assert.match(evidence.fix,/删除/);
 const safe=safeCircuitAction({...action,message:'PRIVATE',studentName:'SECRET'},model);
 assert.deepEqual(safe.from,edge.from);assert.ok(!JSON.stringify(safe).includes('PRIVATE'));assert.ok(!JSON.stringify(safe).includes('SECRET'));
});
test('unknown freeform identifiers do not cross the model boundary; repeats and success stay distinct',()=>{
 const action={kind:'connect',from:{nodeId:'SECRET',portId:'SECRET'},to:edge.to,ok:false,code:'端口方向错误',sequence:5};
 const safe=safeCircuitAction(action,model);assert.ok(!safe.from);assert.ok(!JSON.stringify(safe).includes('SECRET'));
 assert.match(circuitActionEvidence(safe,model).fix,/输出.*输入/);
 assert.equal(safeCircuitAction({...action,code:'PRIVATE'},model),null);
 assert.equal(circuitActionEvidence({kind:'connect',from:edge.from,to:edge.to,ok:true,code:'ok',sequence:6},model).ok,true);
});
