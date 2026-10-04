import test from 'node:test';
import assert from 'node:assert/strict';
import { SERVICE_ORDERS, SERVICE_TESTS, serviceMeasure, serviceSeed, serviceApply, serviceGrade } from './shopServiceGame.js';
import { CABLES } from './completeAssembly.js';

const evidence = selection => ({ selection, installed:Object.fromEntries(Object.entries(selection).filter(([k,v])=>v!=='gpu-integrated')), structure:{open:true,motherboard:true,psu:true,cooler:selection.cpu,cables:Object.fromEntries(CABLES.map(c=>[c.id,true]))} });
function diagnosed(order){let state=serviceSeed(order.id);for(const t of SERVICE_TESTS)state=serviceApply(order,state,{type:'test',testId:t.id,phase:'before'});return serviceApply(order,state,{type:'diagnose',category:order.bottleneck});}
test('three workloads expose different bottlenecks and only the appropriate upgrade solves them',()=>{
  for(const order of SERVICE_ORDERS){const before=serviceMeasure(order,order.baseline,'workload');assert.ok(before.seconds>order.maxSeconds);const upgraded={...order.baseline,[order.bottleneck]:order.upgrade};assert.ok(serviceMeasure(order,upgraded,'workload').seconds<=order.maxSeconds);const gpu={...order.baseline,gpu:'gpu-pro'};assert.equal(serviceMeasure(order,gpu,'workload').seconds,before.seconds);}
});
test('diagnosis requires baseline evidence, wrong guesses are recorded and can be corrected',()=>{
  const order=SERVICE_ORDERS[0];assert.throws(()=>serviceApply(order,serviceSeed(order.id),{type:'diagnose',category:'memory'}));let state=diagnosed(order);state=serviceApply(order,state,{type:'diagnose',category:'cpu'});assert.equal(state.diagnosis,null);assert.equal(state.mistakes.length,1);state=serviceApply(order,state,{type:'diagnose',category:'memory'});assert.equal(state.diagnosis,'memory');
});
test('retest and delivery require complete structure and fresh matching post-upgrade evidence',()=>{
  const order=SERVICE_ORDERS[0],selection={...order.baseline,memory:order.upgrade};let state=diagnosed(order);assert.throws(()=>serviceApply(order,state,{type:'test',phase:'after',testId:'workload',evidence:{...evidence(selection),installed:{}}}));assert.throws(()=>serviceGrade(order,state,evidence(selection)));for(const t of SERVICE_TESTS)state=serviceApply(order,state,{type:'test',testId:t.id,phase:'after',evidence:evidence(selection)});assert.equal(serviceGrade(order,state,evidence(selection)).passed,true);assert.throws(()=>serviceGrade(order,state,evidence({...selection,memory:'mem-32'})));
});
test('cost only counts purchased replacements; over-budget, capacity loss and unsolved configurations fail acceptance',()=>{
  for(const order of SERVICE_ORDERS){let state=diagnosed(order);const selection={...order.baseline,[order.bottleneck]:order.upgrade};for(const t of SERVICE_TESTS)state=serviceApply(order,state,{type:'test',testId:t.id,phase:'after',evidence:evidence(selection)});const result=serviceGrade(order,state,evidence(selection));assert.ok(result.cost<=order.budget);assert.equal(result.score,100);}
  const order=SERVICE_ORDERS[1],selection={...order.baseline,storage:'ssd-512'};let state=diagnosed(order);for(const t of SERVICE_TESTS)state=serviceApply(order,state,{type:'test',testId:t.id,phase:'after',evidence:evidence(selection)});assert.equal(serviceGrade(order,state,evidence(selection)).passed,false);
});
test('expensive upgrade and unchanged machine fail; malformed evidence is rejected as a rule error',()=>{
  const order=SERVICE_ORDERS[0];
  for(const selection of [{...order.baseline,memory:'mem-32'},{...order.baseline,gpu:'gpu-pro'},order.baseline]){
    let state=diagnosed(order);for(const t of SERVICE_TESTS)state=serviceApply(order,state,{type:'test',testId:t.id,phase:'after',evidence:evidence(selection)});
    const result=serviceGrade(order,state,evidence(selection));assert.equal(result.passed,false);assert.ok(result.errors.length>0);
  }
  assert.throws(()=>serviceApply(order,diagnosed(order),{type:'test',testId:'workload',phase:'after',evidence:{selection:order.baseline}}),e=>e.code==='ASSEMBLY_INCOMPLETE');
});
