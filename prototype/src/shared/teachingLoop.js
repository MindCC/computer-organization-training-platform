import { newTaskStage } from './classroomTaskChain.js';
import { COURSE_CHAPTERS } from '../courseChapters.js';
import { knowledgePointsByChapter, knowledgePointOf } from '../knowledgePoints.js';
import { CHALLENGES } from '../platformLogic.js';
import { HOSTED_DEMOS } from './demoNavigation.js';
import { questionsForChapter } from '../assignmentQuestions.js';

export const TEACHING_TEMPLATES = Object.freeze([
  {id:'diagnostic-lab',title:'诊断与实验课堂',description:'诊断 → 演示 → 实验 → 复测 → 反思'},
  {id:'remediation',title:'个性化补学',description:'针对知识目标：讲解 → 引导练习 → 变式复测'},
  {id:'transfer',title:'综合与迁移',description:'诊断 → 综合实验 → 迁移检验 → 解释反思'},
]);

export function buildTeachingTemplate(templateId,chapterIds,goalIds) {
  if(!TEACHING_TEMPLATES.some(t=>t.id===templateId))throw new Error('教学模板不存在');
  if(!Array.isArray(chapterIds)||chapterIds.length<1||chapterIds.length>2||chapterIds.some(id=>!COURSE_CHAPTERS.some(ch=>ch.id===id)))throw new Error('模板一次请选择1到2章；更多章节可手动添加节点');
  const goals=goalIds?.length?goalIds:chapterIds.flatMap(id=>knowledgePointsByChapter(id).map(p=>p.id));
  const stages=[];
  for(const chapterId of [...new Set(chapterIds)]){
    const chapter=COURSE_CHAPTERS.find(ch=>ch.id===chapterId);
    const selected=goals.filter(id=>knowledgePointOf(id)?.chapterId===chapterId);
    const all=questionsForChapter(chapterId),matched=all.filter(q=>selected.includes(knowledgePointOf(q.kpId)?.id));
    const questions=goalIds?.length?matched:all;
    const byGoal=new Map();for(const q of questions){const id=knowledgePointOf(q.kpId)?.id;if(!byGoal.has(id))byGoal.set(id,[]);byGoal.get(id).push(q);}
    const groups=[...byGoal.values()].sort((a,b)=>Number(b.length>1)-Number(a.length>1));
    const diagnosis=groups.map(qs=>qs[0].id).slice(0,6);
    const retest=questions.filter(q=>!diagnosis.includes(q.id)).slice(0,3).map(q=>q.id);
    const quiz=(purpose,ids)=>ids.length?({...newTaskStage('practice',`${chapterId}-${purpose}`),title:`${chapter.title} · ${purpose==='diagnosis'?'课前诊断':purpose==='retest'?'变式复测':'引导练习'}`,chapterId,questionIds:ids,completion:'submitted',purpose,instructions:'独立作答，用真实答题记录检验知识目标。提交即可继续；复测后由教师查看变化。',knowledgePointIds:selected}):({...newTaskStage('custom',`${chapterId}-${purpose}`),purpose,knowledgePointIds:selected,title:`${chapter.title} · ${purpose==='retest'?'解释与验证':'知识说明'}`,instructions:`围绕${selected.map(id=>knowledgePointOf(id).title).join('、')}解释你的理解与验证依据。本知识点暂无内置评价题，教师需补充作业或评价证据；文字提交仅记录参与。`,submissionMode:'text'});
    if(templateId!=='remediation')stages.push(quiz('diagnosis',diagnosis));
    const demo=HOSTED_DEMOS.find(d=>d.chapterId===chapterId);
    if(demo)stages.push({...newTaskStage('demo',`${chapterId}-learn`),demoId:demo.id,title:`观察：${demo.title}`,purpose:'learning',knowledgePointIds:selected,instructions:'先预测结果，再操作演示验证，用自己的话解释过程。'});
    const relevantLabs=selected.flatMap(id=>knowledgePointOf(id)?.challengeIds??[]);
    const labs=CHALLENGES.filter(c=>c.chapterId===chapterId&&(!goalIds?.length||relevantLabs.includes(c.id)));
    const lab=labs.find(c=>templateId!=='transfer'||c.grading!=='participation')??labs[0];
    if(templateId!=='remediation'&&lab)stages.push({...newTaskStage('lab',`${chapterId}-lab`),challengeId:lab.id,title:`动手：${lab.title}`,purpose:'practice',knowledgePointIds:selected,instructions:'在实验台完成实际操作并提交检测证据。'});
    if(templateId==='remediation')stages.push(quiz('practice',diagnosis));
    const retestStage=quiz('retest',retest.length?retest:diagnosis);
    if(!retest.length&&diagnosis.length)retestStage.instructions+=' 本目标暂时缺少不同题号，当前为重复题；教师需补充变式题或其他验证证据。';
    stages.push(retestStage);
    stages.push({...newTaskStage('reflection',`${chapterId}-reflect`),title:`解释与反思：${chapter.title}`,purpose:'reflection',knowledgePointIds:selected,instructions:'解释一个关键步骤，说明你的验证依据，以及仍然不确定的地方。'});
  }
  return {title:`${chapterIds.map(id=>COURSE_CHAPTERS.find(c=>c.id===id).title).join(' / ')} · ${TEACHING_TEMPLATES.find(t=>t.id===templateId).title}`,teachingTemplate:templateId,knowledgePointIds:goals,stages};
}

export function publicFollowUpPrompt(goalIds,kind='remediation') {
  return `请围绕课程知识目标：${goalIds.map(id=>knowledgePointOf(id)?.title??id).join('、')}，编排${kind==='transfer'?'综合迁移':'基础补学'}任务链。包括学习资源、引导练习、使用不同题号的复测以及解释反思。practice节点分别标记purpose为practice或retest，每个节点绑定对应knowledgePointIds，整条链保留知识目标。只使用公开课程资源。`;
}
