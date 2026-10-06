import { questionOf } from '../src/assignmentQuestions.js';
import { knowledgePointOf, knowledgePointsByChapter } from '../src/knowledgePoints.js';
import { readDeepSeekConfig, requestChatCompletion } from './aiClient.js';
import { safeAssemblySnapshot, assemblyHelp } from '../src/assemblyHelp.js';
import { CHALLENGES } from '../src/platformLogic.js';
import { getCircuitChallenge } from '../src/circuit/challengeCircuitModel.js';
import { safeCircuitAction, circuitActionEvidence } from '../src/circuit/circuitActionEvidence.js';

// Only questions, public material and explicitly selected current task state.
// Never forward identity, answers, grades, history or teacher feedback.
export function safeCircuitSnapshot(raw) {
 if(!raw || !CHALLENGES.some(item=>item.id===raw.challengeId&&item.id!=='computer-components'))return null;
 const state={challengeId:raw.challengeId};
 for(const key of ['connectionCount','issueCount','unknownOutputCount']){
  if(!Number.isInteger(raw[key])||raw[key]<0||raw[key]>1000)return null;
  state[key]=raw[key];
 }
 if(Array.isArray(raw.inputs)&&raw.inputs.length<=16&&raw.inputs.every(value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e9))state.inputs=[...raw.inputs];
 const lastAction=safeCircuitAction(raw.lastAction,getCircuitChallenge(raw.challengeId));
 if(lastAction)state.lastAction=lastAction;
 return state;
}
export function publicStudyContext(context = {}) {
  const question = questionOf(context.questionId);
  const concept = knowledgePointOf(context.conceptId ?? question?.kpId);
  const concepts = concept ? [concept] : knowledgePointsByChapter(context.chapterId).slice(0, 4);
  return {
    ...(question ? { exercise: { title: question.stem, type: question.type } } : {}),
    concepts: concepts.map(item => ({ title: item.title, summary: item.summary })),
  };
}

export function studyAssistantMessages(question, context) {
  return [{ role: 'user', content: [
    '你是计算机组成原理课程助教小芯。用中文回答学生主动提出的问题，先解释概念，再给一个小例子和一个思考提示。',
    '只依据公开课程材料和当前问题；不推测学生成绩或之前的作答，不声称已查看学习记录。',
    '公开题目的讲解优先给解题思路。问题与课程无关时请引导回课程。',
    '输出 JSON：{"explanation":"不超过600字的讲解","steps":["不超过4条具体思考步骤"],"check":"一个简短自测问题"}。',
    `公开课程材料：${JSON.stringify(publicStudyContext(context))}`,
    ...(context.assembly ? [`学生明确选择提供的当前模拟装机状态（仅本次快照，不是实物检测或成绩）：${JSON.stringify(safeAssemblySnapshot(context.assembly))}`,`系统按装配规则核对的现场提示：${JSON.stringify(assemblyHelp(context.assembly))}`,'有最近操作时，先解释操作对象、是否完成、失败原因及对应修正步骤，再补充当前缺项。不得建议跳过必要接线或声称已代替学生操作。']:[]),
    ...(context.circuit?[`学生明确选择提供的当前电路输入数值与检查计数（输入按画布顺序；客户端快照，不是服务端成绩）：${JSON.stringify(safeCircuitSnapshot(context.circuit))}`,`最近操作规则解释：${JSON.stringify(circuitActionEvidence(context.circuit.lastAction,getCircuitChallenge(context.circuit.challengeId)))}`,'先解释最近一次操作失败原因及修正步骤。未知端口不得编造名称；没有完整接线证据，不能推测其他连线错误或声称已经掌握知识。']:[]),
    `学生本次主动输入的问题：${question}`,
  ].join('\n') }];
}

export function localStudyReference(context = {}, reason = 'AI_DISABLED') {
  if(context.assembly){const help=assemblyHelp(context.assembly),action=help.action;return {source:'local',reason,explanation:(action?`${action.description}。${action.reason}\n`:'')+help.summary,steps:action?[action.fix,...help.steps].slice(0,4):help.steps,check:'每接好一条线，确认接线计数增加，再进行开机自检。'};}
  if(context.circuit){const c=context.circuit,action=circuitActionEvidence(c.lastAction,getCircuitChallenge(c.challengeId));return {source:'local',reason,explanation:(action?`${action.description}。${action.reason}\n`:'')+`当前电路有 ${c.connectionCount} 条连接，${c.issueCount} 项结构问题，${c.unknownOutputCount} 个输出尚未确定。计数来自本次页面快照，不能替代完整检测。`,steps:[...(action?[action.fix]:[]),'对照工作台实时检测查看具体缺项。','先检查连线方向和未连接输入。','调整后提交完整检测，验证其他输入组合。'].slice(0,4),check:'换一组输入后，实际输出是否仍符合课程目标？'};}
  const material = publicStudyContext(context);
  return { source: 'local', reason, explanation: material.concepts.length ? material.concepts.map(item => `${item.title}：${item.summary}`).join('\n') : '可以先明确问题涉及的输入、处理过程和输出，再到课程知识图谱查找对应概念。', steps: ['写出已知条件与需要求出的量。', '对照课程公式或真值表，逐步验证中间结果。'], check: '换一组输入，能否用同样的方法解释结果？' };
}

export async function askStudyAssistant({ question, context = {}, consent, stateConsent }, options = {}) {
  if (consent !== 'deepseek-public-question') throw Object.assign(new Error('请确认将本次问题发送至 DeepSeek。'), { status: 400 });
  if (typeof question !== 'string' || !question.trim() || question.length > 1600) throw Object.assign(new Error('请输入 1–1600 字的课程问题。'), { status: 400 });
  context={questionId:context?.questionId,conceptId:context?.conceptId,chapterId:context?.chapterId,
    ...(stateConsent==='current-task-state'&&safeAssemblySnapshot(context?.assembly)?{assembly:safeAssemblySnapshot(context.assembly)}:{}),
    ...(stateConsent==='current-task-state'&&safeCircuitSnapshot(context?.circuit)?{circuit:safeCircuitSnapshot(context.circuit)}:{})};
  const config = readDeepSeekConfig(options.env ?? process.env);
  if (!config.enabled) return localStudyReference(context);
  try {
    const text = await (options.requester ?? requestChatCompletion)(config, studyAssistantMessages(question.trim(), context));
    const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    if (typeof parsed.explanation !== 'string' || !parsed.explanation.trim() || !Array.isArray(parsed.steps) || !parsed.steps.every(step => typeof step === 'string') || typeof parsed.check !== 'string') throw new Error('Invalid AI response');
    return { source: 'ai', explanation: parsed.explanation.slice(0, 2000), steps: parsed.steps.slice(0, 4).map(step => step.slice(0, 300)), check: parsed.check.slice(0, 400) };
  } catch (error) { return localStudyReference(context, error.code ?? 'AI_UNAVAILABLE'); }
}
