import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES } from '../platformLogic.js';
import { CIRCUIT_CHALLENGES, getCircuitChallenge } from './challengeCircuitModel.js';
import { runAllCircuitTests, runCircuitTestCases, simulateCircuit } from './circuitSimulation.js';
import { validateCircuitStructure } from './circuitValidation.js';
import { gradeFreeform, freeformSpecOf } from './freeformGrading.js';
import { normalizeStudentAttemptPayload } from '../../server/submissionValidation.js';
import { circuitCost } from './circuitCost.js';
import { CHIP_DEFINITIONS, getUnlockedChips } from './chipDefinitions.js';

test('30 curriculum challenges have real models and every reference circuit passes all cases',()=>{
  assert.equal(CHALLENGES.length,30);
  for(const lesson of CHALLENGES){
    const model=getCircuitChallenge(lesson.id);
    assert.ok(model,lesson.id);
    assert.equal(runAllCircuitTests(model,model.requiredEdges).passed,true,lesson.id);
  }
});
test('not-ready IO blocks data, ready zero is a valid transfer',()=>{
  const m=getCircuitChallenge('io-transfer');
  assert.equal(simulateCircuit(m,m.requiredEdges,{'input-device.out':1,'io-status.out':0}).values['memory-buffer.in'],0);
  assert.equal(simulateCircuit(m,m.requiredEdges,{'input-device.out':0,'io-status.out':1}).values['poll-observe.in'],1);
});
test('real encoding and memory access use numeric values instead of pass-through bits',()=>{
  const m=getCircuitChallenge('machine-number');
  const v=simulateCircuit(m,m.requiredEdges,{'decimal-input.out':-5}).values;
  assert.equal(v['sign-output.in'],1);assert.equal(v['machine-output.in'],11);
  const mem=getCircuitChallenge('memory-address');
  assert.equal(simulateCircuit(mem,mem.requiredEdges,{'address-input.out':100,'read-signal.out':1}).values['cpu-data-bus.in'],5);
  assert.equal(simulateCircuit(mem,mem.requiredEdges,{'address-input.out':100,'read-signal.out':0}).values['cpu-data-bus.in'],0);
});
test('ALU exposes 4 operations; exhaustive mux/adder/ALU cases cover all combinations',()=>{
  const alu=getCircuitChallenge('alu');
  assert.equal(alu.nodes.find(n=>n.id==='op').inputControl.max,3);
  for(const [id,count] of [['full-adder',8],['mux',8],['multi-adder',128],['alu',32]]){
    const m=getCircuitChallenge(id);assert.equal(new Set([...m.testCases,...(m.hiddenTestCases??[])].map(t=>JSON.stringify(Object.entries(t.inputs).sort()))).size,count,id);
  }
});
test('commutative gates accept swapped inputs but server rejects incorrect functions',()=>{
  const m=getCircuitChallenge('and-gate');
  const swapped=m.requiredEdges.map(e=>({...e,to:{...e.to,portId:e.to.portId==='a'?'b':e.to.portId==='b'?'a':e.to.portId}}));
  assert.equal(validateCircuitStructure(m,swapped).passed,true);
  assert.equal(normalizeStudentAttemptPayload({challengeId:m.id,result:{score:100,passed:true,circuitEdges:swapped}},CHALLENGES).result.passed,true);
});
test('freeform NAND implementation of AND is accepted and server grades its actual evidence',()=>{
  const m=getCircuitChallenge('nand-builder');
  const model=structuredClone(m);model.nodes.filter(n=>n.type==='input'||n.type==='output').forEach((n,i)=>n.ioIndex=n.type==='input'?i:0);
  assert.equal(gradeFreeform(model,m.requiredEdges,freeformSpecOf('and-gate')).passed,true);
  const evidence={score:100,passed:true,mode:'freeform',circuitNodes:model.nodes,circuitEdges:m.requiredEdges};
  const accepted=normalizeStudentAttemptPayload({challengeId:'and-gate',result:evidence},CHALLENGES);
  assert.equal(accepted.ok,true);assert.equal(accepted.result.passed,true);assert.equal(accepted.result.mode,'freeform');
  const bad=normalizeStudentAttemptPayload({challengeId:'and-gate',result:{...evidence,circuitEdges:m.requiredEdges.slice(1)}},CHALLENGES);
  assert.equal(bad.result.passed,false);
  const extra=structuredClone(model);extra.nodes.push({...model.nodes[0],id:'extra',ioIndex:2});
  assert.equal(gradeFreeform(extra,m.requiredEdges,freeformSpecOf('and-gate')).passed,false);
});
test('all circuits have non-overlapping component boxes and removal of any reference wire fails',()=>{
  for(const m of CIRCUIT_CHALLENGES){
    for(let i=0;i<m.nodes.length;i++)for(let j=i+1;j<m.nodes.length;j++){
      const a=m.nodes[i],b=m.nodes[j];assert.ok(Math.abs(a.position.x-b.position.x)>=210||Math.abs(a.position.y-b.position.y)>=160,`${m.id}: ${a.id}/${b.id}`);
    }
    for(let i=0;i<m.requiredEdges.length;i++)assert.equal(validateCircuitStructure(m,m.requiredEdges.filter((_,j)=>i!==j)).passed,false,`${m.id} missing ${i}`);
  }
});
test('completed curricula unlock reusable chips with matching truth tables and real logic depth',()=>{
  for(const m of CIRCUIT_CHALLENGES.filter(m=>m.id==='parity-check'||m.id==='bus-arbiter'||m.id==='register-enable')){
    const chip=CHIP_DEFINITIONS[m.id];assert.ok(getUnlockedChips({[m.id]:{status:'completed'}}).some(c=>c.id===m.id));
    for(const t of [...m.testCases,...m.hiddenTestCases]){
      const inputs=Object.fromEntries(chip.ports.filter(p=>p.direction==='in').map(p=>[p.id,t.inputs[`${p.id}.out`]]));
      assert.deepEqual(chip.simulation(inputs),Object.fromEntries(Object.entries(t.expected).map(([key,v])=>[key.split('.')[0],v])));
    }
  }
  const m=getCircuitChallenge('nand-builder');assert.deepEqual(circuitCost(m,m.requiredEdges),{components:2,wires:5,depth:2});
});
test('server rejects incorrect circuits that pass every public example and rejects forged gates',()=>{
  const allCompleted=Object.fromEntries(CHALLENGES.map(c=>[c.id,{status:'completed'}]));
  const m=getCircuitChallenge('signed-overflow');
  const bad=m.requiredEdges.map(e=>({...e,to:{...e.to}}));bad.find(e=>e.to.nodeId==='a'&&e.to.portId==='a').from={nodeId:'as',portId:'s'};
  assert.equal(runCircuitTestCases(m,bad).passed,true,'公开样例全部通过仍不足以证明正确');
  const result=normalizeStudentAttemptPayload({challengeId:m.id,result:{score:100,passed:true,circuitEdges:bad}},CHALLENGES,allCompleted);
  assert.equal(result.result.passed,false);assert.ok(result.result.score<80);assert.equal(result.result.errors[0].type,'输出不符');
  const unknown=normalizeStudentAttemptPayload({challengeId:'nand-builder',result:{score:100,passed:true,mode:'freeform',circuitNodes:[{id:'evil',type:'alu1'}],circuitEdges:[]}},CHALLENGES);
  assert.equal(unknown.ok,false);
});
