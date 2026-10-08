import { useEffect, useId, useRef, useState } from 'react';
import { apiRequest } from '../../apiClient.js';
import { studyAnswerSourceLabel } from './studyAnswerSource.js';
import './lectureQuestionPanel.css';

export function LectureQuestionPanel({ chapter, lecture, lectureIndex, hidden }) {
  const id = useId(), alive = useRef(true), pending = useRef(false);
  const [question, setQuestion] = useState(''), [excerpt, setExcerpt] = useState('');
  const [includeExcerpt, setIncludeExcerpt] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [reply, setReply] = useState(null);
  const output = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (output.current) output.current.scrollTop = output.current.scrollHeight; }, [reply, busy, error]);

  async function ask(event) {
    event.preventDefault();
    if (pending.current || !question.trim() || (includeExcerpt && !excerpt.trim())) return;
    pending.current = true; setBusy(true); setError('');
    const submitted = question.trim();
    try {
      const answer = await apiRequest('/api/student/study-assistant', {
        method: 'POST', timeoutMs: 25000,
        body: JSON.stringify({ question: submitted, consent: 'deepseek-public-question', context: { chapterId: chapter.id, lectureIndex },
          ...(includeExcerpt ? { lectureExcerpt: excerpt.trim(), materialConsent: 'lecture-excerpt' } : {}),
        }),
      });
      if (alive.current) setReply({ question: submitted, answer });
    } catch (err) { if (alive.current) setError(`提问失败：${err.message}。问题仍保留，可以重试。`); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }

  return <aside id="lecture-question-panel" className="lecture-question-panel" aria-label="本课答疑" hidden={hidden}>
    <header className="lecture-question-heading">
      <img src="/ai/study-mascot.webp" alt="小芯助教" width="42" height="42" />
      <div><h2>本课答疑</h2><p>使用平台账号，无需另登 GKK</p></div>
    </header>
    <div className="lecture-question-context"><strong>{lecture.title}</strong><p>根据本章课程资料讲解。涉及讲演某一页时，可补充该页原文。</p></div>
    <div ref={output} className="lecture-question-output" aria-live="polite">
      {!reply && !busy && !error ? <p className="lecture-question-welcome">你好，我是小芯。把没听懂的概念、公式或例题写下来，我们一起理清思路。</p> : null}
      {reply ? <>
        <p className="lecture-question-user"><strong>你：</strong>{reply.question}</p>
        <section className="lecture-question-answer"><span className="study-mascot-source">{studyAnswerSourceLabel(reply.answer)}</span>
          <p>{reply.answer.explanation}</p>
          {reply.answer.steps?.length ? <ol>{reply.answer.steps.map((step, index) => <li key={index}>{step}</li>)}</ol> : null}
          {reply.answer.check ? <p><strong>想一想：</strong>{reply.answer.check}</p> : null}
          {reply.answer.references?.length ? <details className="lecture-question-sources"><summary>回答依据</summary><ul>{reply.answer.references.map((ref, index) => <li key={index}>{ref.title}<small>{ref.detail}</small></li>)}</ul></details> : null}
        </section>
      </> : null}
      {busy ? <p role="status">小芯正在整理讲解…</p> : null}
      {error ? <p role="alert" className="note-error">{error}</p> : null}
    </div>
    <form onSubmit={ask} className="lecture-question-form">
      <details><summary>补充课件原文（选填）</summary>
        <label htmlFor={`${id}-excerpt`}>粘贴需要讲解的课件文字</label>
        <textarea id={`${id}-excerpt`} value={excerpt} onChange={event => setExcerpt(event.target.value)} disabled={busy} maxLength={6000} rows={3} placeholder="例如：这一页的公式、定义或例题条件" />
        <label className="lecture-question-consent"><input type="checkbox" checked={includeExcerpt} onChange={event => setIncludeExcerpt(event.target.checked)} disabled={busy} />本次提问附带以上课件文字</label>
      </details>
      <label htmlFor={`${id}-question`}>你的本课问题</label>
      <textarea id={`${id}-question`} value={question} onChange={event => setQuestion(event.target.value)} disabled={busy} maxLength={1600} rows={2} placeholder="我不理解……" required />
      <button type="submit" className="primary-button" disabled={busy || !question.trim() || (includeExcerpt && !excerpt.trim())}>{busy ? '正在思考…' : '询问助教'}</button>
    </form>
  </aside>;
}
