import { useEffect, useState } from 'react';
import { apiRequest } from '../apiClient.js';
import './learningCoach.css';

export function CoachNextStep({ onOpenChallenge }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false; setError('');
    apiRequest('/api/student/learning-coach').then(result => { if (!cancelled) setData(result); }).catch(failure => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, [version]);
  if (error) return <section className="coach-next-step"><h4>下一步学习</h4><p className="coach-error">{error}</p><button className="ghost-button" type="button" onClick={() => setVersion(v => v + 1)}>重新读取补练</button></section>;
  if (!data) return <p className="coach-note" role="status">正在读取补练建议…</p>;
  const task = data.tasks.find(t => !t.completedRunId), run = data.latest;
  if (!task && (!run || run.status === 'retest_passed')) return null;
  const challengeId=task?.challengeId??run?.challengeId??'full-adder',title=data.experiments?.find(e=>e.id===challengeId)?.title??run?.challengeTitle??'实验';
  return <section className="coach-next-step" aria-label="推荐补练" data-testid="coach-next-step"><h4>{task ? '教师安排的补练' : '继续上次诊断'}</h4><p>{task?.title ?? (run.repaired ? '电路已通过验证，请完成变式复测。' : `${title}还有待修正的问题，先查看检测证据。`)}</p><small>{task ? `${task.className} · 待完成 ${data.tasks.filter(t => !t.completedRunId).length} 项` : `依据账号保存的诊断 #${run.id}，不是掌握度预测。`}</small><button className="primary-button" type="button" onClick={() => onOpenChallenge(challengeId)}>前往{title}诊断与补练</button></section>;
}
