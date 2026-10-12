export function normalizeQuestionObservation(value) {
  if (value === undefined || value === null) return null;
  const fail=()=>{throw Object.assign(new Error('题目活动时间无效'),{status:400});};
  if (typeof value !== 'object' || Array.isArray(value)) fail();
  const {visibleActiveMs, firstAnswerMs=null, inputChanges=0}=value;
  if (!Number.isSafeInteger(visibleActiveMs) || visibleActiveMs < 0 || visibleActiveMs > 86400000 ||
    (firstAnswerMs !== null && (!Number.isSafeInteger(firstAnswerMs) || firstAnswerMs < 0 || firstAnswerMs > visibleActiveMs)) ||
    !Number.isSafeInteger(inputChanges) || inputChanges < 0 || inputChanges > 100000) fail();
  return {visibleActiveMs,firstAnswerMs,answerActiveMs:firstAnswerMs===null?null:visibleActiveMs-firstAnswerMs,inputChanges,source:'client-visible'};
}
