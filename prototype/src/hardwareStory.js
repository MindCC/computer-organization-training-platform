import { HARDWARE_GAME_CASES, HARDWARE_PARTS, gradeHardwareOrder } from './hardwareGame.js';

const CUSTOMERS = {
  'game-office-pc': {name:'小林',role:'行政专员',intro:'明天要给同事做汇报，想配一台打开表格和资料都利索的电脑。你能帮我看看吗？',thanks:'这下准备汇报有底气了。谢谢你帮我把预算花在真正需要的地方。'},
  'game-student-pc': {name:'阿宁',role:'新生',intro:'网课、作业和刚开始学的编程都得用电脑。我想买一台能陪我读完大学的机器。',thanks:'网课和作业都安排好了，我可以放心开始新学期了。'},
  'game-programming-pc': {name:'小周',role:'编程社团成员',intro:'我常常同时开 IDE、虚拟机和浏览器。能帮我配一台多任务不拖后腿的电脑吗？',thanks:'终于能同时打开开发工具和虚拟机了，接下来该把项目做出来了。'},
  'game-archive-storage': {name:'陈老师',role:'课程资料管理员',intro:'课程资料和备份视频越来越多，我需要一台能放下这些资料的电脑。',thanks:'课程资料有地方保存了，整理备份也可以继续了。'},
  'game-fast-boot': {name:'小许',role:'实验室助理',intro:'我每天要启动很多次软件，等待加载太耽误事情。想把电脑的响应速度提上来。',thanks:'这个配置符合我们的加载需求，实验准备会顺手不少。'},
  'game-video-storage': {name:'阿澄',role:'课程视频剪辑师',intro:'视频素材大，读写也频繁。我需要一套兼顾容量、速度和图形加速的方案。',thanks:'容量、速度和图形需求都考虑到了，可以开始整理素材了。'},
};
const QUESTION_IDS = ['usage','capacity','budget'];
const emptyStory = () => ({accepted:false,asked:[]});
export function storyProfile(caseId) {
  const order=HARDWARE_GAME_CASES.find(item=>item.id===caseId)??HARDWARE_GAME_CASES[0];
  const customer=CUSTOMERS[order.id];
  return {...customer,...(order.id==='game-student-pc'?{portrait:'/shop-story/aning.webp',portraitAlt:'阿宁，穿米白衬衫与蓝色T恤，背帆布书包、手持笔记本的新生'}:{}),questions:[
    {id:'usage',label:'主要用电脑做什么？',answer:`${order.customer} 处理器目标为 ${order.targets.cpu}，存储速度目标为 ${order.targets.storageSpeed}。`,note:'用途与响应速度'},
    {id:'capacity',label:'内存和资料容量需要多少？',answer:`这张工单需要至少 ${order.targets.memory}GB 内存和 ${order.targets.storageCapacity}GB 存储空间。请按资料与软件的实际需求来选。`,note:'内存与资料空间'},
    {id:'budget',label:'预算最多能到多少？',answer:`元件预算最多 ${order.targets.budget} 元。能满足需求的经济方案最好，也想听听预算内更均衡的选择。`,note:'预算上限'},
  ]};
}

export function buildStoryOffers(caseId) {
  const order=HARDWARE_GAME_CASES.find(item=>item.id===caseId);
  return buildOrderOffers(order);
}
export function buildOrderOffers(order) {
  if(!order)return [];
  const candidates=[];
  for(const cpu of HARDWARE_PARTS.cpu)for(const memory of HARDWARE_PARTS.memory)for(const storage of HARDWARE_PARTS.storage)for(const gpu of HARDWARE_PARTS.gpu){
    const selection={cpu:cpu.id,memory:memory.id,storage:storage.id,gpu:gpu.id};
    const result=gradeHardwareOrder(order,selection);
    candidates.push({selection,result,quality:cpu.performance+memory.capacity*1.5+storage.performance*.25+gpu.performance*.1});
  }
  const valid=candidates.filter(item=>item.result.passed);
  const pool=valid.length?valid:candidates.filter(item=>item.result.score===Math.max(...candidates.map(c=>c.result.score)));
  const economic=[...pool].sort((a,b)=>a.result.metrics.totalPrice-b.result.metrics.totalPrice)[0];
  const balanced=[...pool].sort((a,b)=>b.quality-a.quality||a.result.metrics.totalPrice-b.result.metrics.totalPrice)[0];
  return [['economy','经济方案',economic],['balanced','均衡方案',balanced]].map(([id,title,item])=>({
    id,title,selection:item.selection,price:item.result.metrics.totalPrice,passed:item.result.passed,
    summary:Object.values(item.result.selectedParts).map(part=>part.name).join(' · '),
    advice:item.result.passed?(id==='economy'?'优先控制成本，满足本单要求。':'在预算内为多任务留出更多余量。'):item.result.errors.map(error=>error.message).join(' '),
  }));
}

export function storyStorageKey(userId,caseId){return userId?`zcyl:hardware-story:v1:${encodeURIComponent(userId)}:${encodeURIComponent(caseId)}`:null;}
function normalizeStory(value){return {accepted:value?.accepted===true,asked:Array.isArray(value?.asked)?[...new Set(value.asked.filter(id=>QUESTION_IDS.includes(id)))]:[]};}
export function readStory(storage,key){try{return key?normalizeStory(JSON.parse(storage?.getItem(key)??'null')):emptyStory();}catch{return emptyStory();}}
export function saveStory(storage,key,value){try{if(!storage||!key)return false;storage.setItem(key,JSON.stringify({version:1,...normalizeStory(value)}));return true;}catch{return false;}}
export function storyStage({accepted,ready,receipt,caseId,selectionSignature}){
  if(!accepted)return 0;
  if(!ready)return 1;
  return receipt?.caseId===caseId && receipt?.signature===selectionSignature?3:2;
}
