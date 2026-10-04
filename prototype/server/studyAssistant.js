import { questionOf } from '../src/assignmentQuestions.js';
import { knowledgePointOf, knowledgePointsByChapter } from '../src/knowledgePoints.js';
import { readDeepSeekConfig, requestChatCompletion } from './aiClient.js';

// This boundary accepts an explicitly entered question and IDs of PUBLIC course material.
// It never receives student answers, grades, records, teacher feedback or account details.
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
    `学生本次主动输入的问题：${question}`,
  ].join('\n') }];
}

export function localStudyReference(context = {}, reason = 'AI_DISABLED') {
  const material = publicStudyContext(context);
  return { source: 'local', reason, explanation: material.concepts.length ? material.concepts.map(item => `${item.title}：${item.summary}`).join('\n') : '可以先明确问题涉及的输入、处理过程和输出，再到课程知识图谱查找对应概念。', steps: ['写出已知条件与需要求出的量。', '对照课程公式或真值表，逐步验证中间结果。'], check: '换一组输入，能否用同样的方法解释结果？' };
}

export async function askStudyAssistant({ question, context = {}, consent }, options = {}) {
  if (consent !== 'deepseek-public-question') throw Object.assign(new Error('请确认将本次问题发送至 DeepSeek。'), { status: 400 });
  if (typeof question !== 'string' || !question.trim() || question.length > 1600) throw Object.assign(new Error('请输入 1–1600 字的课程问题。'), { status: 400 });
  const config = readDeepSeekConfig(options.env ?? process.env);
  if (!config.enabled) return localStudyReference(context);
  try {
    const text = await (options.requester ?? requestChatCompletion)(config, studyAssistantMessages(question.trim(), context));
    const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    if (typeof parsed.explanation !== 'string' || !parsed.explanation.trim() || !Array.isArray(parsed.steps) || !parsed.steps.every(step => typeof step === 'string') || typeof parsed.check !== 'string') throw new Error('Invalid AI response');
    return { source: 'ai', explanation: parsed.explanation.slice(0, 2000), steps: parsed.steps.slice(0, 4).map(step => step.slice(0, 300)), check: parsed.check.slice(0, 400) };
  } catch (error) { return localStudyReference(context, error.code ?? 'AI_UNAVAILABLE'); }
}
