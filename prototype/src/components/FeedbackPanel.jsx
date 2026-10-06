import { useEffect, useRef, useState } from 'react';
import { CheckCircle, ChatCircleText, X } from '@phosphor-icons/react';
import { api } from '../apiClient.js';
import './feedback.css';

const categories = { suggestion: '功能建议', bug: '遇到问题', other: '其他反馈' };

export function FeedbackPanel({ user, page, onClose }) {
  const admin = user?.role === 'admin';
  const [mode, setMode] = useState(admin ? 'inbox' : 'submit');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [category, setCategory] = useState('suggestion');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [inbox, setInbox] = useState(null);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const root = useRef(null);
  const pending = useRef(false);

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.querySelector('button')?.focus();
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);

  useEffect(() => {
    if (!admin || mode !== 'inbox') return;
    let cancelled = false;
    setInbox(null); setError('');
    api.feedbackInbox(offset).then(data => { if (!cancelled) setInbox(data); })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [admin, mode, offset, refresh]);

  async function submit(event) {
    event.preventDefault();
    if (pending.current || !content.trim()) return;
    pending.current = true; setBusy(true); setError('');
    try { await api.submitFeedback({ content, contact, category, page }); setSubmitted(true); }
    catch (err) { setError(err.message); }
    finally { pending.current = false; setBusy(false); }
  }

  function keyboard(event) {
    if (event.key === 'Escape') { event.stopPropagation(); if (!pending.current) onClose(); return; }
    if (event.key !== 'Tab') return;
    const nodes = [...root.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')].filter(node => node.getClientRects().length);
    const first = nodes[0], last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return <div className="feedback-shade" onClick={() => { if (!pending.current) onClose(); }}>
    <section className={`feedback-panel ${mode === 'inbox' ? 'feedback-panel-inbox' : ''}`} role="dialog" aria-modal="true" aria-labelledby="feedback-title" ref={root} onKeyDown={keyboard} onClick={event => event.stopPropagation()}>
      <header className="feedback-heading"><div><ChatCircleText size={22}/><h2 id="feedback-title">{mode === 'inbox' ? '试用反馈' : '意见反馈'}</h2></div><button className="icon-button" aria-label="关闭反馈" onClick={onClose} disabled={busy} type="button"><X size={20}/></button></header>
      {admin && <div className="feedback-tabs" aria-label="反馈功能"><button type="button" aria-pressed={mode === 'inbox'} onClick={() => { setMode('inbox'); setError(''); }}>查看反馈</button><button type="button" aria-pressed={mode === 'submit'} onClick={() => { setMode('submit'); setError(''); }}>提交反馈</button></div>}
      {error && <p className="feedback-error" role="alert">{error}</p>}
      {mode === 'inbox' && admin ? <>
        <div className="feedback-inbox-summary"><span>{inbox ? `共 ${inbox.total} 条反馈` : '正在读取反馈…'}</span><button className="ghost-button" type="button" onClick={() => setRefresh(value => value + 1)}>刷新列表</button></div>
        {!inbox && !error && <p role="status">正在加载…</p>}
        {inbox?.total === 0 && <p className="feedback-empty">还没有反馈，收到建议后会显示在这里。</p>}
        {inbox?.items.map(item => <article className="feedback-item" key={item.id}>
          <div className="feedback-item-meta"><strong>{categories[item.category]}</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('zh-CN')}</time></div>
          <p className="feedback-content">{item.content}</p>
          <dl><div><dt>提交者</dt><dd>{item.display_name ? `${item.display_name}（${item.username}）` : '游客'}</dd></div><div><dt>所在页面</dt><dd>{item.page || '未提供'}</dd></div>{item.contact && <div><dt>联系方式</dt><dd>{item.contact}</dd></div>}</dl>
        </article>)}
        {inbox && inbox.total > 20 && <div className="feedback-pagination"><button type="button" className="ghost-button" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 20))}>上一页</button><span>第 {Math.floor(offset / 20) + 1} 页</span><button type="button" className="ghost-button" disabled={offset + inbox.items.length >= inbox.total} onClick={() => setOffset(value => value + 20)}>下一页</button></div>}
      </> : submitted ? <div className="feedback-success" role="status"><CheckCircle size={44} weight="duotone"/><h3>反馈已提交</h3><p>感谢你的建议，管理员会查看这条反馈。</p><button className="primary-button" type="button" onClick={onClose}>完成</button></div> : <form onSubmit={submit} aria-busy={busy}>
        <p className="feedback-intro">试用过程中遇到的问题，或希望增加的功能，都可以告诉我们。</p>
        <label>反馈类型<select value={category} onChange={event => setCategory(event.target.value)} disabled={busy}>{Object.entries(categories).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>反馈内容<textarea value={content} onChange={event => setContent(event.target.value)} maxLength={5000} rows={6} required disabled={busy} placeholder="请描述你的建议；如果遇到问题，可以写下操作步骤和发生的情况。"/></label>
        <small className="feedback-count">{content.length} / 5000</small>
        <label>联系方式（选填）<input value={contact} onChange={event => setContact(event.target.value)} maxLength={120} disabled={busy} placeholder="邮箱、微信或其他便于联系的方式"/></label>
        <div className="feedback-footer"><small>反馈仅管理员可查看</small><button className="primary-button" type="submit" disabled={busy || !content.trim()}>{busy ? '正在提交…' : '提交反馈'}</button></div>
      </form>}
    </section>
  </div>;
}
