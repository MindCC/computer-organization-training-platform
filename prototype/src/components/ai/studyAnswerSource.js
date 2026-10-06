export function studyAnswerSourceLabel(answer) {
 if(answer.source==='ai')return 'AI 讲解 · DeepSeek';
 if(['COURSE_SCOPE_REJECTED','COURSE_SCOPE_UNVERIFIED'].includes(answer.reason))return '课程范围提示';
 if(answer.reason==='COURSE_ANSWER_REJECTED')return '课程参考';
 return answer.reason==='AI_DISABLED'?'AI 尚未配置 · 课程参考':'AI 暂时不可用 · 课程参考';
}
