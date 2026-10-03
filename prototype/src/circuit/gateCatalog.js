const schemas={input:[[],['out']],output:[['in'],[]],and:[['a','b'],['c']],or:[['a','b'],['out']],xor:[['a','b'],['s']],not:[['in'],['out']],nand:[['a','b'],['out']],buffer:[['in'],['out']]};
export const BASIC_GATE_TYPES=Object.keys(schemas).filter(type=>!['input','output'].includes(type));
// Never execute a component type or port schema supplied by the browser.
export function normalizeFreeformNodes(nodes){
  if(!Array.isArray(nodes)||nodes.length>64||nodes.length===0)return null;
  const ids=new Set(),indices={input:new Set(),output:new Set()};
  const result=[];
  for(const raw of nodes){
    if(typeof raw?.id!=='string'||!/^[\w-]{1,100}$/.test(raw.id)||ids.has(raw.id)||!schemas[raw.type])return null;
    ids.add(raw.id);
    const position={x:Number(raw.position?.x),y:Number(raw.position?.y)};
    if(!Number.isFinite(position.x)||!Number.isFinite(position.y)||Math.abs(position.x)>100000||Math.abs(position.y)>100000)return null;
    let ioIndex;
    if(indices[raw.type]){
      ioIndex=raw.ioIndex;
      if(!Number.isInteger(ioIndex)||ioIndex<0||ioIndex>7||indices[raw.type].has(ioIndex))return null;
      indices[raw.type].add(ioIndex);
    }
    result.push({id:raw.id,type:raw.type,label:String(raw.label??raw.type).slice(0,100),position,ioIndex,ports:schemas[raw.type].flatMap((ports,index)=>ports.map(id=>({id,label:id.toUpperCase(),direction:index?'out':'in',signal:'bit',width:1})))});
  }
  for(const indicesOfType of Object.values(indices))if([...indicesOfType].some(i=>i>=indicesOfType.size))return null;
  return result;
}
