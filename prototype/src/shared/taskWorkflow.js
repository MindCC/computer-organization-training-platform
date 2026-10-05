export const positionOf=(stage,index)=>stage.position??{x:40+index*280,y:90};
export const arrangeStages=stages=>stages.map((stage,index)=>({...stage,position:{x:40+index*280,y:90}}));
export function dragTaskStage(stages,id,position){
  return stages.map((stage,index)=>({...stage,position:stage.id===id?position:positionOf(stage,index)})).sort((a,b)=>a.position.x-b.position.x);
}
export function connectTaskStages(stages,source,target){
  if(source===target||!stages.some(s=>s.id===source)||!stages.some(s=>s.id===target))return stages;
  const moved=stages.find(s=>s.id===target),rest=stages.filter(s=>s.id!==target);
  rest.splice(rest.findIndex(s=>s.id===source)+1,0,moved);
  return arrangeStages(rest);
}
