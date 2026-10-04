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
const CUSTOMER_ART = {
  'game-office-pc': ['xiaolin-neutral', '小林，米白衬衫搭配绿色针织马甲的行政专员'],
  'game-student-pc': ['aning', '阿宁，背帆布书包、手持笔记本的新生'],
  'game-programming-pc': ['xiaozhou', '小周，戴眼镜、穿深蓝连帽外套、手持电脑的编程社团成员'],
  'game-archive-storage': ['chen', '陈老师，戴眼镜、穿浅绿色开衫、手持资料夹的课程资料管理员'],
  'game-fast-boot': ['xiaoxu', '小许，穿青绿色衬衫、拿着固态硬盘和笔记本的实验室助理'],
  'game-video-storage': ['acheng', '阿澄，短发、穿橘棕色衬衫、颈挂耳机的视频剪辑师'],
};
const CUSTOMER_DIALOGUE = {
  'game-programming-pc': { usageLabel:'开发时通常开哪些工具？', usage:'IDE、浏览器和虚拟机经常同时开。我想先把处理器和内存配均衡，不为用不上的独显挤占预算。', capacityLabel:'虚拟机和项目需要多少空间？', capacity:'虚拟机镜像、依赖库和项目都要放得下，内存也不能成为多任务的瓶颈。', quote:'这个方案能让开发工具和虚拟机一起顺畅运行吗？请把配置取舍说清楚。', offers:'我更关心多任务和项目响应。省下来的预算，能优先用在处理器和内存上吗？' },
  'game-archive-storage': { usageLabel:'主要保存什么资料？', usage:'课程文档和视频备份越积越多。这次容量优先，读写速度够用就好，不必把预算都花在高性能处理器上。', capacityLabel:'资料归档需要多大容量？', capacity:'希望给现有资料和后续课程留出空间。重要资料还要另做备份，不能把容量大当成数据安全。', quote:'请再确认一下资料容量。我也会另做备份，不能只把文件存在这一台机器里。', offers:'如果资料能放下，我愿意用够用的速度换更低的成本。你会怎么安排？' },
  'game-fast-boot': { usageLabel:'最想改善哪种等待？', usage:'实验前经常开机、打开大型软件。希望先解决存储响应的瓶颈，再考虑其他元件，别只看处理器档次。', capacityLabel:'实验软件需要多少空间？', capacity:'软件、实验文件和更新包都需要空间，但这次最重要的是存储速度达到工单要求。', quote:'这份配置的存储速度够了吗？我更看重实验前打开软件时的响应。', offers:'经济方案和均衡方案，在存储速度上都满足要求吗？我想先解决最明显的等待。' },
  'game-video-storage': { usageLabel:'剪辑时有哪些负载？', usage:'课程素材比较大，剪辑时要频繁读写，也需要基本图形加速。处理器、内存、容量和存储速度要一起考虑。', capacityLabel:'素材盘需要多大、够不够快？', capacity:'我需要至少 2TB 的素材空间，还要兼顾读写速度。只换显卡，不能解决素材盘放不下的问题。', quote:'容量、存储速度和图形加速都达标了吗？我想确认这是一套适合剪辑的完整方案。', offers:'别只挑一块好显卡。我们一起比较容量、读写速度、内存和总成本。' },
};
const emptyStory = () => ({accepted:false,asked:[]});
export function storyProfile(caseId) {
  const order=HARDWARE_GAME_CASES.find(item=>item.id===caseId)??HARDWARE_GAME_CASES[0];
  const customer=CUSTOMERS[order.id];
  const dialogue=CUSTOMER_DIALOGUE[order.id]??{},art=CUSTOMER_ART[order.id];
  return {...customer,portrait:`/shop-story/${art[0]}.webp`,portraitAlt:art[1],quoteLine:dialogue.quote??'这份报价我看到了。能再确认一下是否满足我的学习需求吗？',offersLine:dialogue.offers??'原来不同方案的取舍不一样。你会怎样安排这笔预算？',questions:[
    {id:'usage',label:dialogue.usageLabel??'主要用电脑做什么？',answer:`${dialogue.usage??order.customer} 处理器目标为 ${order.targets.cpu}，存储速度目标为 ${order.targets.storageSpeed}，图形性能目标为 ${order.targets.gpu}。`,note:'用途与响应速度'},
    {id:'capacity',label:dialogue.capacityLabel??'内存和资料容量需要多少？',answer:`${dialogue.capacity??'请按资料与软件的实际需求来选。'} 这张工单需要至少 ${order.targets.memory}GB 内存和 ${order.targets.storageCapacity}GB 存储空间。`,note:'内存与资料空间'},
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
