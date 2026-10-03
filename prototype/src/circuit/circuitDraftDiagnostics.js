import { simulateCircuit } from './circuitSimulation.js';
import { validateCircuitStructure } from './circuitValidation.js';
export function describeCircuitDraft(draft){
  if(!draft)return {status:'pending',summary:'连接端口后可观察实际信号。',testRows:[],issues:[]};
  const {model,edges,inputs}=draft;
  const validation=validateCircuitStructure(model,edges);
  const simulation=simulateCircuit(model,edges,inputs);
  const testRows=model.nodes.filter(n=>n.type==='output').map(n=>({label:n.label,actual:simulation.values[`${n.id}.in`]??'unknown',passed:Number.isFinite(simulation.values[`${n.id}.in`])}));
  return {status:validation.passed&&testRows.every(r=>r.passed)?'passed':'needs-work',summary:validation.passed?'当前输入的输出已计算；请提交完整检测验证其余组合。':validation.errors[0]?.message??'继续完成电路。',testRows,issues:validation.errors};
}
