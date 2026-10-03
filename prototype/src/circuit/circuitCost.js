// Logic depth is a combinational graph measure, not a simulated clock count.
export function circuitCost(model,edges){
  const nodes=new Map(model.nodes.map(n=>[n.id,n]));
  const memo=new Map();
  function depth(id,seen=new Set()){
    if(memo.has(id))return memo.get(id);
    if(seen.has(id))return 0;
    const branch=new Set(seen);branch.add(id);
    const parents=edges.filter(e=>e.to.nodeId===id).map(e=>e.from.nodeId);
    const value=(nodes.get(id)?.type==='input'||nodes.get(id)?.type==='output'?0:1)+Math.max(0,...parents.map(parent=>depth(parent,branch)));
    memo.set(id,value);return value;
  }
  return {components:model.nodes.filter(n=>!['input','output'].includes(n.type)).length,wires:edges.length,depth:Math.max(0,...model.nodes.filter(n=>n.type==='output').map(n=>depth(n.id)))};
}
