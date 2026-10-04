import { HARDWARE_PARTS } from './hardwareGame.js';
import { assemblyCheck } from './hardwareAssembly.js';
import { CABLES, structureCheck } from './completeAssembly.js';

export const SERVICE_TESTS = [
  {id:'workload',label:'重现客户任务',description:'运行客户常用的软件组合，记录总耗时。'},
  {id:'compute',label:'处理器运算',description:'固定计算任务，对照处理器占用与耗时。'},
  {id:'loading',label:'资料加载',description:'固定资料加载，对照磁盘忙碌与响应。'},
];
export const SERVICE_ORDERS = [
  {id:'service-memory',name:'小周',role:'软件专业学生',portrait:'xiaozhou',title:'一开虚拟机，电脑就卡了',symptom:'写代码、开浏览器都还行，一开虚拟机就频繁卡顿。能不能保留我的电脑，只升级有用的地方？',clue:'通常同时开 IDE、浏览器和虚拟机；资料保存在 SSD，先备份了项目。',bottleneck:'memory',upgrade:'mem-16',budget:420,maxSeconds:40,memoryNeed:14,computeWork:1800,loadWork:650,minCapacity:1024,baseline:{cpu:'cpu-i5',memory:'mem-8',storage:'ssd-1tb',gpu:'gpu-integrated'},lesson:'多任务的工作集超过物理内存时，会发生换页等待。独立显卡不会增加可用内存。',thanks:'这次虚拟机打开后也能继续写代码了，原来的电脑还能用！'},
  {id:'service-storage',name:'小许',role:'社团宣传负责人',portrait:'xiaoxu',title:'素材加载总让人等',symptom:'剪辑预览还好，打开素材库却要等很久。我存了将近 800GB 素材，不想为了快一点把容量缩小。',clue:'旧硬盘是 1TB 机械硬盘；素材已经备份，升级后再恢复。重点是加载，不是渲染。',bottleneck:'storage',upgrade:'ssd-1tb',budget:700,maxSeconds:35,memoryNeed:10,computeWork:1200,loadWork:2200,minCapacity:1024,baseline:{cpu:'cpu-i5',memory:'mem-16',storage:'hdd-1tb',gpu:'gpu-entry'},lesson:'磁盘忙碌而处理器有余量，说明等待集中在存储 I/O。SSD 提高响应时仍应保留所需容量。',thanks:'素材库终于不用每次等半天了，容量也够用。'},
  {id:'service-cpu',name:'阿澄',role:'视频创作者',portrait:'acheng',title:'导出时处理器一直满载',symptom:'素材打开得快，内存也还有空余，但做一批 CPU 编码导出时很慢。已经有独立显卡了，这次别重复花钱。',clue:'这次软件任务使用 CPU 编码路径，保持相同素材和参数复测；素材已备份。',bottleneck:'cpu',upgrade:'cpu-i5',budget:1300,maxSeconds:52,memoryNeed:18,computeWork:3400,loadWork:650,minCapacity:1024,baseline:{cpu:'cpu-i3',memory:'mem-32',storage:'ssd-1tb',gpu:'gpu-pro'},lesson:'当固定 CPU 编码负载占满处理器，而内存和磁盘没有饱和时，应提升处理器计算能力。',thanks:'同样参数导出明显快了，终于能赶上发布时间了。'},
];
export const serviceOrder = id => SERVICE_ORDERS.find(order=>order.id===id);
export function serviceFail(message,code='SERVICE_RULE',status=409){const error=new Error(message);error.code=code;error.status=status;throw error;}
export function serviceSelection(selection){
  if(!selection||Array.isArray(selection)||Object.keys(selection).length!==4||Object.entries(HARDWARE_PARTS).some(([key,parts])=>!parts.some(p=>p.id===selection[key])))serviceFail('元件型号无效','INVALID_PARTS',400);
  return Object.fromEntries(Object.keys(HARDWARE_PARTS).map(key=>[key,selection[key]]));
}
const part=(selection,key)=>HARDWARE_PARTS[key].find(p=>p.id===selection[key]);
export function serviceMeasure(order,selection,testId){
  selection=serviceSelection(selection);if(!SERVICE_TESTS.some(t=>t.id===testId))serviceFail('检测项目无效','INVALID_TEST',400);
  const cpu=part(selection,'cpu').performance, memory=part(selection,'memory').capacity, disk=part(selection,'storage').performance;
  const compute=testId==='compute'?1600:testId==='loading'?100:order.computeWork;
  const load=testId==='loading'?2200:testId==='compute'?80:order.loadWork*0.8;
  const needed=testId==='workload'?order.memoryNeed:4;
  const swap=Math.max(0,needed-memory)*8;
  const cpuTime=compute/cpu,diskTime=load/disk+swap;
  const seconds=Math.round((cpuTime+diskTime)*10)/10;
  return {seconds,cpu:Math.round(cpuTime/(cpuTime+diskTime)*100),memory:Math.min(100,Math.round(needed/memory*100)),disk:Math.round(diskTime/(cpuTime+diskTime)*100),swapGb:Math.max(0,needed-memory)};
}
export function serviceSeed(id){if(!serviceOrder(id))serviceFail('工单不存在','ORDER_NOT_FOUND',404);return {before:{},after:{},diagnosis:null,mistakes:[],result:null};}
export function serviceAssemblySeed(selection){return {installed:Object.fromEntries(Object.entries(selection).filter(([,v])=>v!=='gpu-integrated')),structure:{open:false,motherboard:true,psu:true,cooler:selection.cpu,cables:Object.fromEntries(CABLES.map(c=>[c.id,true]))}};}
export function serviceEvidence(raw){
  const selection=serviceSelection(raw?.selection);
  if(!raw?.installed||typeof raw.installed!=='object'||Array.isArray(raw.installed)||!raw?.structure||typeof raw.structure!=='object'||Array.isArray(raw.structure))serviceFail('安装或接线证据缺失','ASSEMBLY_INCOMPLETE');
  if(!assemblyCheck(raw?.installed,selection).ready||!structureCheck(raw?.structure,raw?.installed,selection).ready)serviceFail('请完成真实工作台中的安装、接线和开机自检','ASSEMBLY_INCOMPLETE');
  return selection;
}
export function serviceCost(order,selection){return Object.keys(order.baseline).filter(key=>order.baseline[key]!==selection[key]).reduce((cost,key)=>cost+part(selection,key).price,0);}
export function serviceApply(order,current,action){
  const state=structuredClone(current);if(state.result?.passed)serviceFail('工单已完成，请开始下一单','ORDER_COMPLETED');
  if(action?.type==='diagnose'){
    if(SERVICE_TESTS.some(t=>!state.before[t.id]))serviceFail('先完成三项基线检测，再判断瓶颈');
    if(!['cpu','memory','storage','gpu'].includes(action.category))serviceFail('诊断选项无效','INVALID_DIAGNOSIS',400);
    if(action.category!==order.bottleneck){state.diagnosis=null;state.mistakes.push({category:action.category,message:'诊断与检测证据不符，比较任务耗时、换页量与资源等待。'});state.mistakes=state.mistakes.slice(-30);}else state.diagnosis=action.category;
    return state;
  }
  if(action?.type!=='test'||!['before','after'].includes(action.phase))serviceFail('操作无效','INVALID_ACTION',400);
  if(action.phase==='before'){state.before[action.testId]=serviceMeasure(order,order.baseline,action.testId);return state;}
  if(!state.diagnosis)serviceFail('请先根据基线检测确定瓶颈');
  const selection=serviceEvidence(action.evidence),signature=JSON.stringify(selection);
  if(JSON.stringify(state.after.selection)!==signature)state.after={selection};
  state.after[action.testId]=serviceMeasure(order,selection,action.testId);state.result=null;return state;
}
export function serviceGrade(order,state,evidence){
  const selection=serviceEvidence(evidence);
  if(!state.diagnosis||SERVICE_TESTS.some(t=>!state.after[t.id])||JSON.stringify(selection)!==JSON.stringify(state.after.selection))serviceFail('请对当前开机配置完成三项复测，旧配置的结果不能交付','RETEST_REQUIRED');
  const cost=serviceCost(order,selection),before=state.before.workload.seconds,after=serviceMeasure(order,selection,'workload').seconds;
  const errors=[cost>order.budget&&'升级费用超出客户预算',part(selection,'storage').capacity<order.minCapacity&&'存储容量低于客户资料需求',after>order.maxSeconds&&'客户任务仍未达到验收耗时',selection[order.bottleneck]===order.baseline[order.bottleneck]&&'瓶颈元件尚未升级'].filter(Boolean);
  const unnecessary=Object.keys(order.baseline).filter(key=>key!==order.bottleneck&&selection[key]!==order.baseline[key]);
  const passed=errors.length===0,score=passed?Math.max(60,100-state.mistakes.length*5-unnecessary.length*10):0;
  return {passed,score,cost,budget:order.budget,before,after,improvement:Math.round((before-after)/before*100),errors,selection,explanation:passed?order.lesson:errors.join('；'),unnecessary};
}
