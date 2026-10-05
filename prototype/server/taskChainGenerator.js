import { readDeepSeekConfig, requestChatCompletion } from './aiClient.js';
import { taskChainTemplate, validateTaskChain, TASK_TYPES } from '../src/shared/classroomTaskChain.js';
import { CHALLENGES } from '../src/platformLogic.js';
import { COURSEWARE } from '../src/courseware.js';
import { HOSTED_DEMOS } from '../src/shared/demoNavigation.js';
import { questionsForChapter } from '../src/assignmentQuestions.js';

// Construct this catalogue from public course definitions, never from class/student records.
export function taskChainMessages(prompt) {
  const messages=[{role:'user',content:[
    '你是计算机组成原理课程教学设计助手。把教师的教学要求组织成有主线的课堂任务链。只使用随后提供的公开课程资源，不杜撰题号或链接。',
    '输出JSON对象 {"title":"课堂名称","stages":[{"id":"step-1","type":"demo","title":"环节名称","instructions":"具体学习要求","minutes":5,"demoId":"目录id"}]}。',
    '1到16个环节，id唯一，minutes为1到90的整数。demo需demoId；lab需challengeId；practice需chapterId、questionIds（同章节1到30题）、completion（submitted或passed）；ai/courseware需chapterId；reflection只需公共字段。courseware只能选已配置的章节。不要生成assignment节点，教师采用草稿后自行关联班级作业。',
    '按照课时安排环节时间。目标和操作要具体，用实验、题目或学生说明形成可查看的学习证据。不要编造学生学情。',
    `可用功能：${JSON.stringify(Object.entries(TASK_TYPES).filter(([type])=>type!=='assignment').map(([type,meta])=>({type,label:meta.label,hint:meta.hint})))}`,
  ].join('\n')}];
  messages.push({role:'user',content:`公开互动演示：${JSON.stringify(HOSTED_DEMOS.map(({id,title,chapterId})=>({id,title,chapterId})))}`});
  messages.push({role:'user',content:`公开实验：${JSON.stringify(CHALLENGES.map(({id,title,chapterId})=>({id,title,chapterId})))}`});
  for(const chapter of COURSEWARE.chapters)messages.push({role:'user',content:`公开课程章节：${JSON.stringify({id:chapter.id,title:chapter.title,courseware:Boolean(chapter.embeds?.length),questions:questionsForChapter(chapter.id).map(({id,stem,type})=>({id,stem,type}))})}`});
  messages.push({role:'user',content:`教师本次主动输入的教学要求：${prompt}`});
  return messages;
}

export async function generateTaskChain({prompt,consent}={},options={}) {
  if(consent!=='deepseek-task-chain')throw Object.assign(new Error('请确认生成本次教学任务链。'),{status:400});
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>2000)throw Object.assign(new Error('请输入1～2000字的教学要求。'),{status:400});
  const config=readDeepSeekConfig(options.env??process.env);
  const fallback=reason=>({source:'local',reason,taskChain:validateTaskChain(taskChainTemplate(/五大|数据流|冯/.test(prompt)?'data-flow':'twos'))});
  if(!config.enabled)return fallback('AI_DISABLED');
  try {
    const content=await (options.requester??requestChatCompletion)(config,taskChainMessages(prompt.trim()),{contentScope:'public-teaching-requirements'});
    if(typeof content!=='string'||content.length>64000)throw new Error('任务链草稿长度无效');
    const parsed=JSON.parse(content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
    const taskChain=validateTaskChain(parsed.taskChain??parsed);
    if(taskChain.stages.some(stage=>stage.type==='assignment'))throw new Error('需要教师关联班级作业');
    return {source:'deepseek',taskChain};
  } catch(error) {return fallback(error.code??'AI_INVALID_DRAFT');}
}
