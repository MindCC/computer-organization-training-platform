import { ASSEMBLY_PARTS } from './hardwareAssembly.js';
import { CABLES } from './completeAssembly.js';

const fixes = {
 'cover-closed':['侧板关闭，当前不能进行装配或接线。','先点击“打开侧板”，再重试刚才的操作。'],
 'motherboard-missing':['部件需要安装在已固定的主板上。','先打开侧板并点击“固定主板”，再安装部件。'],
 'socket-mismatch':['部件与目标插槽不匹配。',null],
 'no-discrete-part':['当前型号不需要安装独立部件。','核对配置，集成显卡不需要安装独立显卡。'],
 'interface-mismatch':['两个接口承担不同功能，不能互相连接。',null],
 'endpoints-missing':['线缆两端的部件尚未安装齐全。','先固定主板、电源并安装对应部件，再连接这条线。'],
 'cpu-required':['散热器需要固定在已安装的处理器上。','先固定主板、安装处理器，再固定CPU散热器。'],
 'remove-parts-first':['主板上还有部件，不能直接拆下主板。','先拆散热器及主板上的部件，再拆主板。'],
 'remove-cooler-first':['CPU散热器挡住了处理器的拆卸位置。','先拆下CPU散热器，再拆处理器。'],
 'removal-required':['原部件还在机箱内，不能直接更换型号。','先拆下原部件，再选择新型号并重新安装。'],
 'boot-blocked':['必要装配或接线尚未完成，自检没有开始。','按下方现场检查补齐缺项，再点击“开机自检”。'],
 'select-source-first':['尚未选择线缆插头，不能只点击目标接口进行接线。','先点击线缆插头，再点击对应的目标接口。'],
};
const kinds=['connect','disconnect','install','remove','structure','replace','boot'];
const structural={open:'侧板',motherboard:'主板',psu:'电源',cooler:'CPU散热器'};
export function safeAssemblyAction(raw) {
 if(!raw||!kinds.includes(raw.kind)||typeof raw.ok!=='boolean'||!Number.isSafeInteger(raw.sequence)||raw.sequence<1||raw.sequence>1e9)return null;
 if(raw.ok?raw.code!=='ok':!Object.hasOwn(fixes,raw.code))return null;
 const failureKinds={
  'cover-closed':['connect','install','remove','structure'], 'motherboard-missing':['install'],
  'socket-mismatch':['install'],'no-discrete-part':['install'],'interface-mismatch':['connect'],
  'endpoints-missing':['connect'],'cpu-required':['structure'],'remove-parts-first':['structure'],
  'remove-cooler-first':['remove'],'removal-required':['replace'],'boot-blocked':['boot'],'select-source-first':['connect'],
 };
 if(!raw.ok&&!failureKinds[raw.code].includes(raw.kind))return null;
 const ids=['connect','disconnect'].includes(raw.kind)?CABLES.flatMap(c=>[c.from,c.to]):raw.kind==='structure'?Object.keys(structural):ASSEMBLY_PARTS.map(p=>p.id);
 if((raw.source!=null&&!ids.includes(raw.source))||(raw.target!=null&&!ids.includes(raw.target)))return null;
 if(['connect','disconnect'].includes(raw.kind)&&((raw.source!=null&&!CABLES.some(c=>c.from===raw.source))||(raw.target!=null&&!CABLES.some(c=>c.to===raw.target))))return null;
 return {kind:raw.kind,ok:raw.ok,code:raw.code,sequence:raw.sequence,...(raw.source?{source:raw.source}:{}),...(raw.target?{target:raw.target}:{}),...(typeof raw.value==='boolean'?{value:raw.value}:{})};
}
export function assemblyActionEvidence(raw) {
 const action=safeAssemblyAction(raw);if(!action)return null;
 const part=ASSEMBLY_PARTS.find(p=>p.id===action.source),slot=ASSEMBLY_PARTS.find(p=>p.id===action.target);
 const cable=CABLES.find(c=>c.from===action.source);
 const source=cable?.fromLabel??part?.label??'部件',target=CABLES.find(c=>c.to===action.target)?.toLabel??slot?.socket??'接口';
 const description=action.kind==='connect'?(action.source?`尝试连接“${source}” → “${target}”`:`点击“${target}”，尚未选择线缆端`):action.kind==='disconnect'?`断开“${source}” → “${target}”`:
  action.kind==='install'?`尝试将${source}安装到${target}`:
  action.kind==='structure'?`${action.value?'打开或固定':'关闭或拆下'}${structural[action.target]??'结构部件'}`:
  action.kind==='boot'?'尝试开机自检':`${action.kind==='remove'?'拆下':'更换'}${source}`;
 const [reason,fix]=action.ok?['操作成功，当前状态已更新。','继续依据下方现场检查完成装配。']:fixes[action.code];
 return {ok:action.ok,description,reason,fix:fix??(action.kind==='connect'?`将“${source}”连接到“${cable?.toLabel??'与它匹配的接口'}”，不要接到“${target}”。`:`将${source}对准${part?.socket??'对应插槽'}，再重试安装。`)};
}
