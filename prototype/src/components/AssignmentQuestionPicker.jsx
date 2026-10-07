import { useEffect, useRef, useState } from 'react';
import { api } from '../apiClient.js';
import { ASSIGNMENT_QUESTIONS } from '../assignmentQuestions.js';
import { COURSE_CHAPTERS } from '../courseChapters.js';

const DEFAULT_QUESTIONS = ASSIGNMENT_QUESTIONS.map(question => ({ ...question, source: 'builtin', answer: question.type === 'fill' ? question.keywords.map(group => group[0]).join('；') : question.answer }));
const questionKey = question => `${question.source}:${question.id}`;
const contentKey = question => `${question.type}:${question.stem}`;
const answerLabel = question => question.type === 'truefalse' ? (question.answer === 'true' ? '正确' : '错误') : question.answer;

export function AssignmentQuestionPicker({ assignmentId, questions, onDone, typeLabels }) {
  const [source, setSource] = useState('builtin');
  const [bank, setBank] = useState([]);
  const [chapter, setChapter] = useState('');
  const [type, setType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState({});
  const [score, setScore] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bankError, setBankError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const alive = useRef(true);
  async function loadBank() {
    setLoading(true); setBankError('');
    try {
      const result = await api.questionBank();
      if (alive.current) setBank((result.questions ?? []).map(question => ({ ...question, source: 'bank' })));
    } catch (failure) { if (alive.current) setBankError(`我的题库加载失败：${failure.message}`); }
    finally { if (alive.current) setLoading(false); }
  }
  useEffect(() => { alive.current = true; loadBank(); return () => { alive.current = false; }; }, []);
  const existing = new Set(questions.map(contentKey));
  const choices = (source === 'builtin' ? DEFAULT_QUESTIONS : bank).filter(question => (!chapter || question.chapterId === chapter) && (!type || question.type === type) && question.stem.includes(keyword.trim()));
  const selectable = choices.filter(question => !existing.has(contentKey(question)));
  const allSelected = selectable.length > 0 && selectable.every(question => selected[questionKey(question)]);
  const picked = Object.values(selected).filter(question => !existing.has(contentKey(question)));
  const totalScore = picked.reduce((sum, question) => sum + (score === '' ? question.score : Number(score)), 0);
  function toggle(question, checked) {
    setError(''); setMessage('');
    setSelected(current => { const next = { ...current }; if (checked) next[questionKey(question)] = question; else delete next[questionKey(question)]; return next; });
  }
  function toggleAll() {
    setError(''); setMessage('');
    setSelected(current => {
      const next = { ...current };
      const clear = selectable.every(question => current[questionKey(question)]);
      for (const question of selectable) {
        if (clear) delete next[questionKey(question)];
        else next[questionKey(question)] = question;
      }
      return next;
    });
  }
  async function add() {
    if (busy || !picked.length) return;
    if (picked.length > 1000) { setError('一次最多加入 1000 道题目，请减少勾选数量。'); return; }
    if (score !== '' && (!Number.isInteger(Number(score)) || Number(score) < 1 || Number(score) > 100)) { setError('每题分值须为 1～100 的整数，也可以留空使用原分值。'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api.addAssignmentBankQuestions(assignmentId, picked.map(question => ({ source: question.source, id: question.id, ...(score !== '' ? { score: Number(score) } : {}) })));
      await onDone();
      if (alive.current) { setSelected({}); setMessage(`已加入 ${result.addedCount} 道题目${result.skippedCount ? `，跳过 ${result.skippedCount} 道重复题` : ''}。`); }
    } catch (failure) { if (alive.current) setError(`加入作业失败：${failure.message}。已保留勾选，可重试。`); }
    finally { if (alive.current) setBusy(false); }
  }
  return <section className="homework-question-picker" aria-label="作业题库选题">
    <p>默认题库可直接使用；“我的题库”包含你录入、导入和确认入库的 AI 题目。</p>
    <fieldset className="homework-picker-controls" disabled={busy}>
      <legend>筛选题目</legend>
      <label>题库来源<select aria-label="题库来源" value={source} onChange={event => setSource(event.target.value)}><option value="builtin">默认题库</option><option value="bank">我的题库</option></select></label>
      <label>选题章节<select aria-label="选题章节" value={chapter} onChange={event => setChapter(event.target.value)}><option value="">全部章节</option>{COURSE_CHAPTERS.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>选题类型<select aria-label="选题类型" value={type} onChange={event => setType(event.target.value)}><option value="">全部题型</option>{Object.entries(typeLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>搜索题目<input aria-label="搜索题目" value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="题干关键词" /></label>
    </fieldset>
    {source === 'bank' && loading && <p role="status">正在读取我的题库…</p>}
    {source === 'bank' && bankError && <div className="form-error" role="alert"><p>{bankError}</p><button className="ghost-button" type="button" onClick={loadBank}>重试加载题库</button></div>}
    <div className="homework-picker-bulk"><button type="button" className="ghost-button" disabled={busy || !selectable.length || (source === 'bank' && (loading || Boolean(bankError)))} onClick={toggleAll}>{allSelected ? '取消全选' : '全选当前筛选结果'}</button><span>当前结果可选 {selectable.length} 题，已加入的题目自动跳过</span></div>
    <div className="homework-picker-list">
      {choices.map(question => <article className="homework-bank-question" key={questionKey(question)} data-bank-question={questionKey(question)}>
        <label><input type="checkbox" aria-label={`选择题目：${question.stem}`} disabled={busy || existing.has(contentKey(question))} checked={Boolean(selected[questionKey(question)]) && !existing.has(contentKey(question))} onChange={event => toggle(question, event.target.checked)} /><span>{question.stem}<small>{COURSE_CHAPTERS.find(item => item.id === question.chapterId)?.title} · {typeLabels[question.type]} · {question.score} 分{existing.has(contentKey(question)) ? ' · 已加入' : ''}</small></span></label>
        <details><summary>查看选项、答案与解析</summary>{question.options?.length > 0 && <ul>{question.options.map(option => <li key={option}>{option}</li>)}</ul>}<p>标准答案：{answerLabel(question)}</p>{question.type === 'fill' && <p>多个空的标准答案用“；”分隔。</p>}<p>{question.analysis}</p></details>
      </article>)}
      {!choices.length && !(source === 'bank' && (loading || bankError)) && <p className="empty-state">没有符合筛选条件的题目。可调整筛选，或到“题库出卷”录入题目。</p>}
    </div>
    <div className="homework-picker-summary">
      <span>已选 {picked.length} 题 · 合计 {Number.isFinite(totalScore) ? totalScore : '—'} 分<span>（跨章节选择会保留）</span></span>
      <label>每题分值<input aria-label="选题每题分值" type="number" min="1" max="100" step="1" value={score} disabled={busy} onChange={event => setScore(event.target.value)} placeholder="沿用原分值" /></label>
      <button type="button" className="primary-button" disabled={busy || !picked.length} onClick={add}>{busy ? '正在加入…' : `加入作业（${picked.length}）`}</button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
