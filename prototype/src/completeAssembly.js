export const CABLES = [
 { id:'atx',fromLabel:'电源 24-pin 插头',toLabel:'主板 24-pin 接口',label:'主板 24-pin 供电',from:'psu-atx',to:'board-atx',requires:['motherboard','psu'] },
 { id:'eps',fromLabel:'电源 CPU 8-pin 插头',toLabel:'CPU 8-pin 供电接口',label:'CPU 8-pin 供电',from:'psu-cpu',to:'cpu-power',requires:['motherboard','psu','cpu'] },
 { id:'fan',fromLabel:'散热器风扇插头',toLabel:'主板 CPU_FAN 接口',label:'CPU 风扇',from:'cooler-fan',to:'cpu-fan',requires:['motherboard','cooler'] },
 { id:'sata',fromLabel:'SSD SATA 数据插头',toLabel:'主板 SATA 数据接口',label:'SATA 数据',from:'ssd-data',to:'board-sata',requires:['motherboard','storage'] },
 { id:'sata-power',fromLabel:'电源 SATA 供电插头',toLabel:'SSD SATA 供电接口',label:'硬盘供电',from:'psu-sata',to:'ssd-power',requires:['psu','storage'] },
];
export function reconcileStructure(raw={},installed={},parts={}) {
 const state={open:raw?.open===true,motherboard:raw?.motherboard===true,psu:raw?.psu===true,
 cooler:raw?.motherboard===true && installed.cpu===parts.cpu && typeof parts.cpu==='string' && raw?.cooler===parts.cpu ? parts.cpu:false,cables:{}};
 for(const c of CABLES) if(raw?.cables?.[c.id]===true && c.requires.every(id=>Boolean(state[id] || installed[id] && installed[id]===parts[id]))) state.cables[c.id]=true;
 return state;
}
export function structureAction(raw,id,value,installed,parts) {
 const state=reconcileStructure(raw,installed,parts);
 const fail=message=>({ok:false,state,message});
 if(!['open','motherboard','psu','cooler'].includes(id)) return fail('未知装配步骤。');
 if(id!=='open' && !state.open) return fail('请先打开侧板。');
 if(id==='cooler' && value && (!state.motherboard || !installed.cpu)) return fail('请先安装主板和处理器。');
 if(id==='motherboard' && !value && (Object.keys(installed).length || state.cooler)) return fail('请先拆下主板上的部件。');
 state[id]=id==='cooler' && value ? parts.cpu:Boolean(value);
 if(!value && id==='psu') state.cables={};
 return {ok:true,state:reconcileStructure(state,installed,parts),message:id==='open' ? (value?'侧板已打开。':'侧板已合上。') : value?'部件已固定，请继续装配。':'部件已拆下，相关连接已清除。'};
}
export function connectCable(raw,from,to,installed,parts) {
 const state=reconcileStructure(raw,installed,parts);
 const cable=CABLES.find(c=>c.from===from && c.to===to);
 if(!state.open) return {ok:false,state,message:'请先打开侧板。'};
 if(!cable) return {ok:false,state,message:'接口不匹配，请检查接口名称和防呆方向。'};
 if(!cable.requires.every(id=>Boolean(state[id] || installed[id] && installed[id]===parts[id]))) return {ok:false,state,message:'请先安装这条线缆两端的部件。'};
 return {ok:true,state:{...state,cables:{...state.cables,[cable.id]:true}},message:cable.label+'已连接。'};
}
export function structureCheck(raw,installed,parts) {
 const state=reconcileStructure(raw,installed,parts);
 const missing=[!state.motherboard && '主板',!state.psu && '电源',!state.cooler && 'CPU 散热器',
 ...CABLES.filter(c=>!state.cables[c.id]).map(c=>c.label)].filter(Boolean);
 return {ready:!missing.length,missing};
}
export function readStructure(storage,key,installed,parts) {
 try {const data=key && JSON.parse(storage?.getItem(key+':structure')??'null');return reconcileStructure(data?.version===1?data.state:{},installed,parts);} catch {return reconcileStructure({},installed,parts);}
}
export function saveStructure(storage,key,state) {
 try {if(!key || !storage?.setItem)return false;storage.setItem(key+':structure',JSON.stringify({version:1,state}));return true;}catch{return false;}
}
