const readingNodes=new Set(['opening','mentor','hint','arrival','redirect','questions','usage','capacity','budget','offers','quote']);
export const CHAPTER_LINES={
  opening:{speaker:'旁白',line:'青禾街的早晨，阳光落在旧工作台上。今天起，这家装机店由你来经营。',caption:'第一章 · 第一声门铃'},
  mentor:{speaker:'老赵',line:'参数写在盒子上，需求在客人嘴里。先问清楚，再拿螺丝刀。',caption:'老店师傅 · 交给你的第一张工单'},
  hint:{speaker:'老赵',line:'问他做什么、开多少东西、钱准备多少。“快”得有个用处。',caption:'先听清楚，再给方案'},
  arrival:{speaker:'小林',line:'明天要做汇报，旧电脑打开资料总卡。你能帮我看看吗？',caption:'客户来访 · 社区行政专员'},
  redirect:{speaker:'小林',line:'我也怕花了钱，解决的却不是我的问题。能先听听我的情况吗？',caption:'先了解用途，再推荐元件'},
  questions:{speaker:'小林',line:'明天要做汇报，旧电脑打开资料总卡。你能帮我看看吗？',caption:'客户来访 · 社区行政专员'},
  usage:{speaker:'小林',line:'表格、浏览器、演示文稿，有时候一起开。不剪视频，也不玩大型游戏。',caption:'工单已记下 · 办公多任务，不需要独立显卡'},
  capacity:{speaker:'小林',line:'常用资料两百多 GB。我更希望打开文件快一点，容量够放就行。',caption:'工单已记下 · 至少 256GB，读写速度优先'},
  budget:{speaker:'小林',line:'元件这部分最多 2200 元。装机服务要多少钱，也请一起说清楚。',caption:'工单已记下 · 元件预算 ¥2200，服务另报'},
  offers:{speaker:'你',line:'用途是办公多任务，容量够用，同时提高读写速度。这两条方案都可以比较。',caption:'给出方案 · 让客户知道取舍'},
  quote:{speaker:'小林',line:'请把元件和装机服务一起列清楚。确认以后，我们就按这张工单做。',caption:'确认工单与交付报价'},
  workshop:{speaker:'小林',line:'我在柜台等你。装好以后，我们一起看验机结果。',caption:'已接单 · 去工作台亲手装机'},
  thanks:{speaker:'小林',line:'谢谢你先问我的用途。这下准备汇报有底气了，预算也花在真正需要的地方。',caption:'验收通过 · 这张工单完成了'},
  reflection:{speaker:'老赵',line:'第一单做完，别忘了记账。今天你最先考虑的是什么？',caption:'傍晚 · 想想这台电脑为什么这样配'},
  closing:{speaker:'老赵',line:'第一声门铃已经有了好回音。收好工具，明天还有一位第一次买电脑的新生。',caption:'第一天结束 · 阿宁的消息已经到了'},
};
export function initialChapter(accepted=false){return {node:accepted?'workshop':'opening',opened:false,courtesy:null,reflection:null};}
export function advanceChapter(state,event,context={}){
  const next={...state};
  switch(event.type){
    case 'OPEN':next.node='mentor';next.opened=true;break;
    case 'HINT':next.node='hint';break;
    case 'WELCOME':next.node='arrival';break;
    case 'PITCH':next.node='redirect';break;
    case 'INQUIRE':next.node='questions';break;
    case 'ASK':if(['usage','capacity','budget'].includes(event.id))next.node=event.id;break;
    case 'OFFERS':if(['usage','capacity','budget'].every(id=>context.asked?.includes(id)))next.node='offers';break;
    case 'QUOTE':next.node='quote';break;
    case 'ACCEPT':next.node='workshop';break;
    case 'DELIVERED':if(context.delivered)next.node='thanks';break;
    case 'AFTERCARE':if(state.node==='thanks'&&context.delivered){next.courtesy??=['support','explanation'].includes(event.choice)?event.choice:null;next.node='reflection';}break;
    case 'END':if(state.node==='reflection'&&context.delivered){next.reflection=event.choice;next.node='closing';}break;
    case 'BOOT_INVALIDATED':if(['thanks','reflection','closing'].includes(state.node))next.node='workshop';break;
  }
  return next;
}
// Reading recovery is deliberately independent of boot and delivery authority.
export function readChapter(storage,key,accepted){
  const base=initialChapter(accepted);
  try{const saved=JSON.parse(storage?.getItem(key)??'null');if(!saved)return initialChapter(false);
    return {...base,node:accepted?'workshop':saved.node==='quote'?'offers':readingNodes.has(saved.node)?saved.node:'opening',opened:saved.opened===true,courtesy:['support','explanation'].includes(saved.courtesy)?saved.courtesy:null};
  }catch{return base;}
}
export function saveChapter(storage,key,state){
  try{if(!storage||!key)return false;storage.setItem(key,JSON.stringify({version:1,node:readingNodes.has(state.node)?state.node:'questions',opened:state.opened===true,courtesy:state.courtesy}));return true;}catch{return false;}
}
