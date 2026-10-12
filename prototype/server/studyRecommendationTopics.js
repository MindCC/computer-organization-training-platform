import { KNOWLEDGE_POINTS, knowledgePointOf } from '../src/knowledgePoints.js';
import { questionOf } from '../src/assignmentQuestions.js';

const extraTerms = {
  'concept-twos-complement':['补码'],
  'concept-signed-range-overflow':['溢出判断','补码溢出','可表示范围'],
  'concept-complement-arithmetic':['补码加法','补码减法','补码加减'],
  'concept-cache-mapping':['Cache映射','Cache 映射','直接映射','组相联映射','全相联映射'],
  'concept-ieee754':['IEEE754'],
  'concept-full-adder':['全加器'],
  'concept-cpu-registers':['CPU寄存器','程序计数器','指令寄存器'],
};
const termsFor = point => [...point.tags,...(extraTerms[point.id]??[]),...point.title.split(/[与、]/).map(s=>s.trim()).filter(s=>s.length>=3)];
const termFrequency = new Map();
for(const point of KNOWLEDGE_POINTS)for(const term of new Set(termsFor(point)))termFrequency.set(term.toLowerCase(),(termFrequency.get(term.toLowerCase())??0)+1);

// Conservative catalogue matching: a chapter or a single Latin letter is not a concept.
function contains(text, term) {
  if (term.length < 2) return false;
  if (/^[\w .'’-]+$/.test(term)) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(text);
  }
  return text.includes(term);
}
export function matchStudyConcepts(text = '', context = {}) {
  const explicit = knowledgePointOf(context.conceptId ?? questionOf(context.questionId)?.kpId);
  const matches = KNOWLEDGE_POINTS.map(point => ({ point, score:contains(text, point.title) ? 100 :
    Math.max(0, ...termsFor(point).map(tag => termFrequency.get(tag.toLowerCase())===1 && contains(text, tag) ? tag.length : 0)) }))
    .filter(item => item.score > 0).sort((a,b) => b.score-a.score);
  // A selected question/concept is an explicit study target; text can add a more specific target.
  return [...new Set([...(explicit ? [explicit.id] : []), ...matches.slice(0,2).map(item => item.point.id)])];
}
