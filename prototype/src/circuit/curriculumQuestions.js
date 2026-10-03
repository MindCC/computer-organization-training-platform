import { NEW_BOOLEAN_SPECS } from './curriculumCircuits.js';
import { WORKBENCH_CHALLENGES } from '../workbenchChallenges.js';
const inputs={
  'parity-check':[1,0,1],'nand-builder':[1,1],'majority-vote':[1,0,1],'gate-mux':[0,1,1],
  'signed-overflow':[0,0,1],'address-decoder':[1,0],'register-enable':[1,0,0],
  'opcode-decoder':[1,1],'branch-control':[1,0,0],'bus-arbiter':[1,1],'interrupt-mask':[1,1,1],'io-handshake':[1,1,0],
};
export const CURRICULUM_QUESTIONS=WORKBENCH_CHALLENGES.map(lesson=>{
  const spec=NEW_BOOLEAN_SPECS[lesson.id],bits=inputs[lesson.id];
  const answer=spec.evaluate(bits).join(' / ');
  const alternatives=Array.from({length:2**spec.outputLabels.length},(_,mask)=>spec.outputLabels.map((_,i)=>(mask>>(spec.outputLabels.length-i-1))&1).join(' / '));
  const options=[...new Set([answer,...alternatives])].slice(0,4).sort();
  return {id:`${lesson.chapterId}-${lesson.id}`,chapterId:lesson.chapterId,kpId:`kp-${lesson.id}`,type:'choice',score:10,stem:`${spec.inputLabels.map((label,i)=>`${label}=${bits[i]}`).join('，')} 时，${spec.outputLabels.join(' / ')} 的输出依次为？`,options,answer,analysis:`${lesson.goal} 代入当前输入得到 ${answer}。`};
});
