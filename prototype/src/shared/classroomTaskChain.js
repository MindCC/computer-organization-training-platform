import { CHALLENGES } from '../platformLogic.js';
import { COURSEWARE } from '../courseware.js';
import { questionsForChapter } from '../assignmentQuestions.js';
import { HOSTED_DEMOS } from './demoNavigation.js';

export const TASK_TYPES = Object.freeze({
  demo: {label:'互动演示',hint:'切换参数、观察运算过程',completion:'本人确认完成'},
  practice: {label:'随堂练习',hint:'精选题库，自动判分与错题同步',completion:'提交或达到及格分'},
  lab: {label:'实验任务',hint:'进入现有实验台，提交操作证据',completion:'实验检测通过'},
  assignment: {label:'教师作业',hint:'关联当前班级已发布的作业',completion:'作业已提交'},
  ai: {label:'AI 答疑',hint:'向小芯主动提问，再解释自己的理解',completion:'提交学习说明'},
  reflection: {label:'学习反思',hint:'记录发现、证据与仍有的疑问',completion:'提交学习反思'},
  courseware: {label:'课程课件',hint:'学习已配置的 AI 互动课件',completion:'本人确认完成'},
  custom: {label:'自定义任务',hint:'设置课堂讨论、观察或其他学习任务',completion:'确认完成或提交说明'},
});

export function newTaskStage(type, suffix = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`) {
  return {id:`step-${suffix}`,type,title:TASK_TYPES[type]?.label ?? '',instructions:'',minutes:5,
    ...(type==='demo'?{demoId:'arithmetic-basics'}:{}),
    ...(type==='lab'?{challengeId:'machine-number'}:{}),
    ...(type==='practice'?{chapterId:'ch2',questionIds:['ch2-q02','ch2-q04','ch2-q07'],completion:'submitted'}:{}),
    ...(['ai','courseware'].includes(type)?{chapterId:'ch2'}:{}),
    ...(type==='custom'?{submissionMode:'text'}:{})};
}

export function taskChainTemplate(key) {
  if(key==='empty')return {title:'我的课堂任务链',stages:[]};
  if(key==='data-flow')return {title:'计算机五大部件与数据流',stages:[
    {...newTaskStage('lab','components'),title:'认识五大部件',challengeId:'computer-components'},
    {...newTaskStage('lab','program'),title:'观察程序执行',challengeId:'program-flow'},
    {...newTaskStage('lab','instruction'),title:'区分指令与数据',challengeId:'instruction-data'},
    {...newTaskStage('lab','flow'),title:'完成综合数据流实训',challengeId:'data-flow'},
  ]};
  return {title:'补码运算：让减法变成加法',stages:[
    {...newTaskStage('practice','predict'),title:'课前诊断：我会表示负数吗？',minutes:5,instructions:'独立作答，检查补码范围与负数编码。此环节提交即可继续。'},
    {...newTaskStage('demo','observe'),title:'观察：5 − 3 为什么可以相加？',minutes:12,instructions:'切到“减法 A − B”，观察 5 − 3 的逐位运算；再观察 100 + 100，区分进位与溢出。'},
    {...newTaskStage('lab','encode'),title:'动手：验证负数的机器编码',minutes:8,instructions:'改变整数输入，对比原码、反码与补码，然后完成编码路径的实验检测。'},
    {...newTaskStage('ai','explain'),title:'问小芯：解释我的疑惑',minutes:5,instructions:'把不理解的问题主动告诉小芯，例如“为什么丢弃第九位进位不等于溢出？”阅读提示后，用自己的话写下理解。'},
    {...newTaskStage('practice','check'),title:'检验：补码加减与溢出',minutes:10,questionIds:['ch2-q08','ch2-q09','ch2-q10'],completion:'passed',instructions:'完成三道补码运算题，达到课堂及格分后继续；未通过可以订正再提交。'},
    {...newTaskStage('reflection','review'),title:'总结：我用什么证据判断溢出？',minutes:5,instructions:'用一个例子说明补码减法的步骤，以及为什么最高位进位不能直接当成溢出。'},
  ]};
}

const boundedText=(value,max,label,required=false)=>{
  if(typeof value!=='string' || value.trim().length>max || (required&&!value.trim()))throw new Error(`${label}须为${required?'1':'0'}到${max}字`);
  return value.trim();
};
export function validateTaskChain(raw) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('任务链格式无效');
  const title=boundedText(raw.title,100,'任务链名称',true);
  if(!Array.isArray(raw.stages)||raw.stages.length<1||raw.stages.length>16)throw new Error('任务链须包含1到16个环节');
  const ids=new Set();
  const stages=raw.stages.map(stage=>{
    if(!stage||!TASK_TYPES[stage.type])throw new Error('任务环节类型无效');
    if(typeof stage.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(stage.id))throw new Error('环节标识无效');
    if(ids.has(stage.id))throw new Error('环节标识重复');ids.add(stage.id);
    const minutes=Number(stage.minutes??5);
    if(!Number.isInteger(minutes)||minutes<1||minutes>90)throw new Error('环节预计时间须为1到90分钟');
    const next={id:stage.id,type:stage.type,title:boundedText(stage.title,100,'环节名称',true),instructions:boundedText(stage.instructions??'',1000,'环节目标'),minutes};
    if(stage.position!==undefined){
      if(!stage.position||!Number.isFinite(stage.position.x)||!Number.isFinite(stage.position.y)||Math.abs(stage.position.x)>100000||Math.abs(stage.position.y)>100000)throw new Error('节点位置无效');
      next.position={x:stage.position.x,y:stage.position.y};
    }
    if(stage.type==='custom'){
      if(!['confirm','text'].includes(stage.submissionMode??'text'))throw new Error('自定义任务完成条件无效');
      next.submissionMode=stage.submissionMode??'text';
    }
    if(stage.type==='demo') {
      if(!HOSTED_DEMOS.some(demo=>demo.id===stage.demoId))throw new Error('互动演示不存在');
      next.demoId=stage.demoId;
    }
    if(stage.type==='lab') {
      const item=CHALLENGES.find(item=>item.id===stage.challengeId);
      if(!item)throw new Error('实验任务不存在');
      next.challengeId=item.id;next.grading=item.id==='computer-components'?'participation':'circuit';
    }
    if(['practice','ai','courseware'].includes(stage.type)) {
      const chapter=COURSEWARE.chapters.find(ch=>ch.id===stage.chapterId);
      if(!chapter)throw new Error('课程章节不存在');
      if(stage.type==='courseware'&&!chapter.embeds?.length)throw new Error('该章节尚未配置课件');
      next.chapterId=chapter.id;
    }
    if(stage.type==='practice') {
      const questions=questionsForChapter(stage.chapterId);
      if(!Array.isArray(stage.questionIds)||stage.questionIds.length<1||stage.questionIds.length>30||new Set(stage.questionIds).size!==stage.questionIds.length
        ||!stage.questionIds.every(id=>questions.some(q=>q.id===id)))throw new Error('请选择当前章节的有效题目');
      next.questionIds=[...stage.questionIds];
      if(!['submitted','passed'].includes(stage.completion??'submitted'))throw new Error('练习完成条件无效');
      next.completion=stage.completion??'submitted';
    }
    if(stage.type==='assignment') {
      if(!Number.isInteger(stage.assignmentId)||stage.assignmentId<1)throw new Error('请选择已发布的班级作业');
      next.assignmentId=stage.assignmentId;
    }
    return next;
  });
  return {title,stages};
}

export function chainOfSession(session) {
  try{return JSON.parse(session?.config_json??'{}').taskChain??null;}catch{return null;}
}
