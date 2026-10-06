const repairs={
 '端口不存在':['连接的起点或终点端口不存在。','重新选择画布上存在的端口，再连接。'],
 '端口方向错误':['连接方向不符合信号传递规则。','从输出端口连接到输入端口，不要连接两个输出或两个输入。'],
 '信号位宽不匹配':['两个端口的信号位宽不同。','检查端口标注的位数，连接相同位宽的信号；必要时使用对应的拆分或组合元件。'],
 '组合电路环路':['这次连接会形成组合反馈环路。','移除形成环路的连接；时序反馈应通过明确的寄存器状态端口。'],
 '输入端重复驱动':['目标输入端已经有一条导线驱动。','先选择并删除该输入端原有导线，再接入新的输出。'],
};
const kinds=['connect','remove','input','reset','reference','undo','redo'];
function endpoint(raw,model){
 const node=model?.nodes?.find(n=>n.id===raw?.nodeId),port=node?.ports.find(p=>p.id===raw?.portId);
 return node&&port?{nodeId:node.id,portId:port.id}:null;
}
export function safeCircuitAction(raw,model){
 if(!raw||!kinds.includes(raw.kind)||typeof raw.ok!=='boolean'||!Number.isSafeInteger(raw.sequence)||raw.sequence<1||raw.sequence>1e9)return null;
 if(raw.ok?raw.code!=='ok':!Object.hasOwn(repairs,raw.code))return null;
 if(!raw.ok&&raw.kind!=='connect')return null;
 const from=endpoint(raw.from,model),to=endpoint(raw.to,model);
 return {kind:raw.kind,ok:raw.ok,code:raw.code,sequence:raw.sequence,...(from?{from}:{}),...(to?{to}:{})};
}
export function circuitActionEvidence(raw,model){
 const action=safeCircuitAction(raw,model);if(!action)return null;
 const label=point=>{const node=model?.nodes.find(n=>n.id===point?.nodeId),port=node?.ports.find(p=>p.id===point?.portId);return node&&port?`${node.label} · ${port.label??port.id}`:'未确定的端口';};
 const description=action.kind==='connect'?`尝试连接“${label(action.from)}” → “${label(action.to)}”`:action.kind==='remove'?`删除“${label(action.from)}” → “${label(action.to)}”的导线`:action.kind==='input'?`改变“${label(action.from)}”的输入`:({reset:'重置电路',reference:'填入参考结构',undo:'撤销上一步',redo:'重做上一步'}[action.kind]);
 const [reason,fix]=action.ok?['操作成功，当前电路状态已更新。','观察实时输出，并提交完整检测验证其他输入组合。']:repairs[action.code];
 return {ok:action.ok,description,reason,fix};
}
