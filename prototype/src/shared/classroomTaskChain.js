import { CHALLENGES } from '../platformLogic.js';
import { COURSEWARE } from '../courseware.js';
import { questionsForChapter } from '../assignmentQuestions.js';
import { HOSTED_DEMOS, TWOS_ACTIVITIES } from './demoNavigation.js';
import { knowledgePointOf, knowledgePointsForChallenge } from '../knowledgePoints.js';

export const NODE_PURPOSES = Object.freeze({diagnosis:'诊断',learning:'学习',practice:'练习',retest:'复测',reflection:'反思'});
export function normalizeKnowledgeIds(ids=[]) {
  if(!Array.isArray(ids)||ids.length>128||ids.some(id=>typeof id!=='string'||!knowledgePointOf(id)))throw new Error('请选择有效的课程知识点');
  return [...new Set(ids.map(id=>knowledgePointOf(id).id))];
}

export const TASK_TYPES = Object.freeze({
  demo: {label:'互动演示',hint:'切换参数、观察运算过程',completion:'按任务要求确认完成或提交说明'},
  practice: {label:'随堂练习',hint:'精选题库，自动判分与错题同步',completion:'提交或达到及格分'},
  lab: {label:'实验任务',hint:'进入现有实验台，提交操作证据',completion:'实验检测通过'},
  assignment: {label:'教师作业',hint:'关联当前班级已发布的作业',completion:'作业已提交'},
  ai: {label:'AI 答疑',hint:'向小芯主动提问，等待讲解后继续',completion:'等待小芯回答，学习说明可跳过'},
  reflection: {label:'学习反思',hint:'记录发现、证据与仍有的疑问',completion:'可填写反思或跳过说明'},
  courseware: {label:'AI讲演',hint:'观看本章 AI 讲演',completion:'本人确认完成'},
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
  if(key==='empty')return {title:'我的课堂任务链',knowledgePointIds:[],stages:[]};
  if(key==='data-flow'){
    const stages=[
    {...newTaskStage('lab','components'),title:'认识五大部件',challengeId:'computer-components'},
    {...newTaskStage('lab','program'),title:'观察程序执行',challengeId:'program-flow'},
    {...newTaskStage('lab','instruction'),title:'区分指令与数据',challengeId:'instruction-data'},
    {...newTaskStage('lab','flow'),title:'完成综合数据流实训',challengeId:'data-flow'},
    ].map(stage=>({...stage,knowledgePointIds:knowledgePointsForChallenge(stage.challengeId).map(point=>point.id)}));
    return {title:'计算机五大部件与数据流',knowledgePointIds:normalizeKnowledgeIds(stages.flatMap(stage=>stage.knowledgePointIds)),stages};
  }
  const knowledgePointIds=['concept-twos-complement','concept-signed-range-overflow'];
  const stages=[
    {...newTaskStage('practice','predict'),purpose:'diagnosis',title:'课前诊断：我会表示负数吗？',minutes:4,instructions:'独立作答，检查8位补码的表示范围与负数编码。提交即可继续；教师根据结果为有困难的学生安排前置补学，再进入加减运算。'},
    twosTeacherDemonstration(),
    ...twosArithmeticStages(),
    {...newTaskStage('ai','explain'),purpose:'learning',title:'问小芯：解释我的运算疑惑',minutes:4,instructions:'把刚才的操作数、位宽、位串结果和疑问主动告诉小芯，例如“为什么5加负3有进位却没有溢出？”等待小芯回答后继续，可选填自己的理解或跳过说明。'},
    {...newTaskStage('practice','check'),purpose:'retest',title:'检验：补码加法、减法与溢出',minutes:8,questionIds:['ch2-q11','ch2-q08','ch2-q09','ch2-q10'],completion:'passed',instructions:'独立完成四道题，分别检验补码加法、减法和溢出判断。达到课堂及格分后继续；未通过可以订正。教师依据答题证据确认补学建议并发布个性化后续任务。'},
    {...newTaskStage('reflection','review'),purpose:'reflection',title:'总结：我用什么证据判断溢出？',minutes:2,instructions:'各用一个例子说明补码加法、减法和溢出判断。记录仍不会的步骤，教师结合测验结果调整后续任务；后续复测检验相同知识目标。'},
  ].map(stage=>{
    const related=stage.type==='practice'?questionsForChapter(stage.chapterId).filter(question=>stage.questionIds.includes(question.id)).map(question=>knowledgePointOf(question.kpId)?.id)
      :stage.type==='lab'?knowledgePointsForChallenge(stage.challengeId).map(point=>point.id):stage.knowledgePointIds??knowledgePointIds;
    return {...stage,knowledgePointIds:knowledgePointIds.filter(id=>related.includes(id))};
  });
  return {title:'补码运算：加法、减法与溢出',knowledgePointIds,stages};
}

export function twosTeacherDemonstration(prefix='twos') {
  return {...newTaskStage('demo',`${prefix}-demonstrate`),demoId:'twos-complement',demoActivity:'add',submissionMode:'confirm',purpose:'learning',title:'教师演示：补码加减运算怎么做？',minutes:6,knowledgePointIds:['concept-twos-complement','concept-signed-range-overflow'],instructions:'教师投屏，学生先预测再观察：从8位补码5 + (−3)逐列相加开始，讲解符号位参与运算和保留低8位；切到减法5 − 3，示范减法转加法；再用100 + 100展示溢出，说明进位与溢出的区别。学生跟随演示确认完成，然后进入独立动手环节。'};
}

export function twosArithmeticStages(prefix='twos') {
  return [
    {activity:'add',instructions:'统一使用8位补码。先手算5 + (−3)，再逐位操作验证，保留低8位；改为(−5) + (−3)再验证。可选填两组输入、补码位串、结果及进位的说明，也可跳过。教师先示范一列，再由学生独立完成。'},
    {activity:'sub',instructions:'统一使用8位补码。先手算5 − 3，把减数3取反加1得到−3的补码，再与5相加；改为3 − 5验证负数结果。可记录减法转加法的位串、结果及为什么丢弃第9位进位，说明可跳过。'},
    {activity:'overflow',instructions:'先预测再操作：8位补码100 + 100、(−100) + (−50)、5 + (−3)，再切到减法验证100 − (−50)。记录真实结果与保留位串，按范围和符号判断溢出，对比进位与溢出的区别；教师根据学生解释集中讲评。'},
  ].map(({activity,instructions})=>({...newTaskStage('demo',`${prefix}-${activity}`),demoId:'twos-complement',demoActivity:activity,submissionMode:'text',purpose:'practice',title:`动手：${TWOS_ACTIVITIES[activity]}`,minutes:7,instructions,knowledgePointIds:activity==='overflow'?['concept-signed-range-overflow']:['concept-twos-complement']}));
}

export function adoptTaskChainTemplate(current,next) {
  if(!current.followUp)return {...next};
  // A linked remedial task keeps the teacher's selected targets and recipients.
  const goals=current.knowledgePointIds??[];
  return {...next,followUp:current.followUp,knowledgePointIds:[...goals],stages:next.stages.map(stage=>({...stage,knowledgePointIds:(stage.knowledgePointIds??goals).filter(id=>goals.includes(id))}))};
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
  const stages=raw.stages.map((stage,stageIndex)=>{
    try {
    if(!stage||!TASK_TYPES[stage.type])throw new Error('任务环节类型无效');
    if(typeof stage.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(stage.id))throw new Error('环节标识无效');
    if(ids.has(stage.id))throw new Error('环节标识重复');ids.add(stage.id);
    const minutes=Number(stage.minutes??5);
    if(!Number.isInteger(minutes)||minutes<1||minutes>90)throw new Error('环节预计时间须为1到90分钟');
    const next={id:stage.id,type:stage.type,title:boundedText(stage.title,100,'环节名称',true),instructions:boundedText(stage.instructions??'',1000,'环节目标'),minutes};
    if(stage.purpose!==undefined){if(!NODE_PURPOSES[stage.purpose])throw new Error('节点作用无效');next.purpose=stage.purpose;}
    if(stage.knowledgePointIds!==undefined)next.knowledgePointIds=normalizeKnowledgeIds(stage.knowledgePointIds);
    if(stage.position!==undefined){
      if(!stage.position||!Number.isFinite(stage.position.x)||!Number.isFinite(stage.position.y)||Math.abs(stage.position.x)>100000||Math.abs(stage.position.y)>100000)throw new Error('节点位置无效');
      next.position={x:stage.position.x,y:stage.position.y};
    }
    if(['custom','demo'].includes(stage.type)){
      if(!['confirm','text'].includes(stage.submissionMode??(stage.type==='custom'?'text':'confirm')))throw new Error('任务完成条件无效');
      if(stage.type==='custom'||stage.submissionMode!==undefined)next.submissionMode=stage.submissionMode??'text';
    }
    if(stage.type==='demo') {
      if(!HOSTED_DEMOS.some(demo=>demo.id===stage.demoId))throw new Error('互动演示不存在');
      next.demoId=stage.demoId;
      if(stage.demoActivity!==undefined){
        if(stage.demoId!=='twos-complement'||!Object.hasOwn(TWOS_ACTIVITIES,stage.demoActivity))throw new Error('互动演示活动无效');
        next.demoActivity=stage.demoActivity;
      }
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
      if(!Array.isArray(stage.questionIds)||stage.questionIds.length<1)throw new Error('请至少选择1道题目');
      if(stage.questionIds.length>30)throw new Error('每个练习环节最多选择30道题目');
      if(new Set(stage.questionIds).size!==stage.questionIds.length)throw new Error('已选题目重复，请去掉重复题目');
      if(!stage.questionIds.every(id=>questions.some(q=>q.id===id)))throw new Error('部分已选题目不属于当前章节或当前题库，请重新选择这些题目');
      next.questionIds=[...stage.questionIds];
      if(!['submitted','passed'].includes(stage.completion??'submitted'))throw new Error('练习完成条件无效');
      next.completion=stage.completion??'submitted';
    }
    if(stage.type==='assignment') {
      if(!Number.isInteger(stage.assignmentId)||stage.assignmentId<1)throw new Error('请选择已发布的班级作业');
      next.assignmentId=stage.assignmentId;
    }
    return next;
    } catch(cause) {
      const name=typeof stage?.title==='string'?stage.title.trim().slice(0,100):'';
      throw Object.assign(new Error(`第${stageIndex+1}个环节${name?`「${name}」`:''}：${cause.message}`),{stageId:stage?.id,stageIndex});
    }
  });
  const next={title,stages};
  if(raw.knowledgePointIds!==undefined)next.knowledgePointIds=normalizeKnowledgeIds(raw.knowledgePointIds);
  if(raw.teachingTemplate!==undefined){if(!['diagnostic-lab','remediation','transfer'].includes(raw.teachingTemplate))throw new Error('教学模板无效');next.teachingTemplate=raw.teachingTemplate;}
  if(raw.followUp!==undefined){
    const source=raw.followUp;
    if(!source||!Number.isInteger(source.sourceTaskId)||source.sourceTaskId<1||!Number.isInteger(source.sourceSessionId)||source.sourceSessionId<1)throw new Error('后续任务来源无效');
    next.followUp={sourceTaskId:source.sourceTaskId,sourceSessionId:source.sourceSessionId};
    if(source.studentIds!==undefined){if(!Array.isArray(source.studentIds)||!source.studentIds.length||source.studentIds.length>500||source.studentIds.some(id=>!Number.isInteger(id)||id<1)||new Set(source.studentIds).size!==source.studentIds.length)throw new Error('请选择后续任务的目标学生');next.followUp.studentIds=[...source.studentIds].sort((a,b)=>a-b);}
  }
  return next;
}

export function chainOfSession(session) {
  try{return JSON.parse(session?.config_json??'{}').taskChain??null;}catch{return null;}
}
