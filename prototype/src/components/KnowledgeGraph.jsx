import { useEffect, useId, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, MagnifyingGlass, Path } from '@phosphor-icons/react';
import { KNOWLEDGE_POINTS, knowledgePointOf, knowledgePointsByChapter, searchKnowledgePoints, knowledgeEvidenceOf, layoutKnowledgeGraph, prerequisitesOf, dependentsOf } from '../knowledgePoints.js';
import { questionsForKp, QUESTION_TYPE_LABELS } from '../assignmentQuestions.js';
import { COURSE_CHAPTERS, getChapterById } from '../courseChapters.js';
import { KnowledgeCanvas } from './KnowledgeCanvas.jsx';
import './knowledgeGraph.css';

function labelLines(title) {
  const lines = []; let line = '', width = 0;
  for (const token of title.match(/[A-Za-z0-9/·-]+|./gu) ?? []) {
    const size = /^[A-Za-z0-9/·-]+$/.test(token) ? token.length * .58 : 1;
    if (width + size > 8 && line) { lines.push(line); line = ''; width = 0; }
    line += token; width += size;
  }
  if (line) lines.push(line);
  return lines;
}

export function KnowledgeGraph({ progress = {}, focusId = null, initialChapterId = 'ch1', onSelectKp, onEnterChallenge, onPickQuestion }) {
  const initial = knowledgePointOf(focusId) ?? knowledgePointsByChapter(initialChapterId)[0] ?? KNOWLEDGE_POINTS[0];
  const [chapterId, setChapterId] = useState(initial.chapterId);
  const [selectedId, setSelectedId] = useState(initial.id);
  const [query, setQuery] = useState('');
  const markerId = 'concept-arrow-' + useId().replace(/:/g, '');
  const focused = knowledgePointOf(selectedId) ?? initial;
  const chapter = getChapterById(chapterId);
  const points = useMemo(() => knowledgePointsByChapter(chapterId), [chapterId]);
  const model = useMemo(() => layoutKnowledgeGraph({ chapterId, width: 920, height: 620 }), [chapterId]);
  const matches = useMemo(() => query.trim() ? searchKnowledgePoints(query) : [], [query]);
  const relations = new Set([...prerequisitesOf(focused.id), ...dependentsOf(focused.id)].map(point => point.id));
  useEffect(() => {
    const external = knowledgePointOf(focusId);
    if (external && external.id !== selectedId) {
      setSelectedId(external.id); setChapterId(external.chapterId); setQuery('');
    }
  }, [focusId]);
  function selectPoint(id) {
    const point = knowledgePointOf(id);
    if (!point) return;
    setSelectedId(point.id); setChapterId(point.chapterId); onSelectKp?.(point.id);
  }
  function selectChapter(id) { setQuery(''); selectPoint(knowledgePointsByChapter(id)[0]?.id); }
  const detail = <ConceptDetail kp={focused} progress={progress} onSelect={id => { setQuery(''); selectPoint(id); }} onEnterChallenge={onEnterChallenge} onPickQuestion={onPickQuestion} />;
  return (
    <div className="course-knowledge" data-testid="course-knowledge-graph">
      <aside className="concept-explorer" aria-label="课程知识章节">
        <div className="concept-explorer-title"><BookOpen size={18} /><strong>课程知识</strong><span>{KNOWLEDGE_POINTS.length}</span></div>
        <label className="concept-search"><MagnifyingGlass size={17} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索知识点，如 Cache" aria-label="搜索课程知识点" /></label>
        <p className="concept-explorer-caption">八章知识目录</p>
        <nav className="concept-chapters" aria-label="知识图谱章节">
          {COURSE_CHAPTERS.map(entry => <button type="button" key={entry.id} data-knowledge-chapter={entry.id} aria-current={chapterId === entry.id ? 'true' : undefined} onClick={() => selectChapter(entry.id)}><span className="concept-chapter-number">{String(entry.number).padStart(2, '0')}</span><span>{entry.title.replace(/^第.章\s*/, '')}</span><small>{knowledgePointsByChapter(entry.id).length}</small></button>)}
        </nav>
        <p className="concept-explorer-note">知识联系帮助理解课程；实验完成记录展示在对应知识点下。</p>
      </aside>
      <div className="concept-main">
        <header className="concept-main-head"><div><small>CONCEPT CONNECTIONS</small><h3>{query.trim() ? '全课程搜索' : chapter?.title}</h3></div><span>{query.trim() ? matches.length + ' 个结果' : points.length + ' 个知识点'}</span></header>
        {query.trim() ? <div className="concept-search-results" aria-label="知识点搜索结果">
          {matches.length ? matches.map(point => <div key={point.id}><button type="button" className={point.id === focused.id ? 'is-selected' : ''} data-search-concept={point.id} onClick={() => selectPoint(point.id)}><small>{getChapterById(point.chapterId)?.title}</small><strong>{point.title}<ArrowRight size={16} /></strong><span>{point.summary}</span></button>{point.id === focused.id ? <div className="concept-search-mobile-detail">{detail}</div> : null}</div>) : <p className="concept-empty">未找到相关知识点，试试“存储器”“浮点”或“中断”。</p>}
        </div> : <>
          <div className="concept-graph-caption"><Path size={16} /><span>箭头表示理解顺序 · 点击知识点查看联系和学习入口</span></div>
          <KnowledgeCanvas model={model} selectedId={selectedId} title={chapter?.title}>
              <defs><marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker></defs>
              {model.edges.map(edge => {
                const vertical = Math.abs(edge.y2 - edge.y1) > Math.abs(edge.x2 - edge.x1);
                const direction = vertical ? Math.sign(edge.y2 - edge.y1) : Math.sign(edge.x2 - edge.x1);
                const x1 = edge.x1 + (vertical ? 0 : direction * 88), y1 = edge.y1 + (vertical ? direction * 38 : 0);
                const x2 = edge.x2 - (vertical ? 0 : direction * 92), y2 = edge.y2 - (vertical ? direction * 42 : 0);
                const curve = vertical ? 'M'+x1+','+y1+' C'+x1+','+(y1+y2)/2+' '+x2+','+(y1+y2)/2+' '+x2+','+y2 : 'M'+x1+','+y1+' C'+(x1+x2)/2+','+y1+' '+(x1+x2)/2+','+y2+' '+x2+','+y2;
                return <path key={edge.from + ':' + edge.to} d={curve} markerEnd={'url(#' + markerId + ')'} className={'kg-edge' + (edge.from === focused.id || edge.to === focused.id ? ' hot' : '')} />;
              })}
              {model.nodes.map(node => {
                const point = knowledgePointOf(node.id);
                const evidence = knowledgeEvidenceOf(point, progress);
                return <g key={point.id} className={'kg-node' + (point.id === focused.id ? ' highlighted' : relations.has(point.id) ? ' related' : '')} data-kp-id={point.id} data-status={evidence.status} transform={'translate(' + node.x + ' ' + node.y + ')'} role="button" tabIndex={0} aria-pressed={point.id === focused.id} aria-label={'知识点：' + point.title} onClick={() => selectPoint(point.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectPoint(point.id); } }}>
                  <rect x="-88" y="-38" width="176" height="76" rx="12" /><circle cx="-70" cy="-26" r="3" className={'concept-evidence-dot ' + evidence.status} /><text textAnchor="middle">{labelLines(point.shortTitle).map((line, index, lines) => <tspan x="0" y={6 + (index - (lines.length - 1) / 2) * 23} key={index}>{line}</tspan>)}</text>
                </g>;
              })}
          </KnowledgeCanvas>
          <div className="concept-mobile-list">
            {points.map(point => <div key={point.id}><button type="button" className={point.id === focused.id ? 'is-selected' : ''} data-mobile-concept={point.id} aria-expanded={point.id === focused.id} onClick={() => selectPoint(point.id)}>{point.title}<ArrowRight size={16} /></button>{point.id === focused.id ? detail : null}</div>)}
          </div>
          <footer className="concept-graph-legend"><span><i className="concept-evidence-dot evidence" />有完成实验记录</span><span><i className="concept-evidence-dot practicing" />有尝试记录</span><span><i className="concept-evidence-dot unseen" />暂无实验记录</span></footer>
        </>}
      </div>
      <aside className={'concept-inspector' + (query.trim() ? ' with-search' : '')} aria-label="知识点详情">{detail}</aside>
    </div>
  );
}

function ConceptDetail({ kp, progress, onSelect, onEnterChallenge, onPickQuestion }) {
  const evidence = knowledgeEvidenceOf(kp, progress);
  const prerequisites = prerequisitesOf(kp.id), dependents = dependentsOf(kp.id);
  const questions = questionsForKp(kp.id);
  return <section className="kp-detail" data-kp-detail={kp.id}>
    <small className="concept-detail-eyebrow">{getChapterById(kp.chapterId)?.title}</small><h4>{kp.title}</h4><p className="concept-summary">{kp.summary}</p>
    <div className={'concept-evidence ' + evidence.status}><strong>{evidence.label}</strong><p>{evidence.description}</p></div>
    <div className="concept-relations">
      {[{ title: '先理解', points: prerequisites, className: 'prereq', empty: '可以从这个概念开始。' }, { title: '接着探索', points: dependents, className: 'dependent', empty: '把它与本章其他概念一起理解。' }].map(group => <div key={group.className}><h5>{group.title}</h5><div>{group.points.length ? group.points.map(point => <button key={point.id} type="button" className={'kp-chip ' + group.className} data-kp={point.id} onClick={() => onSelect(point.id)}>{point.shortTitle}</button>) : <p>{group.empty}</p>}</div></div>)}
    </div>
    <div className="concept-detail-section"><h5>关联实验 <span>{evidence.experiments.length}</span></h5>{evidence.experiments.length ? evidence.experiments.map(experiment => <div key={experiment.id} className="concept-experiment"><div><strong>{experiment.title}</strong><small>{experiment.statusLabel} · {experiment.scoreLabel}</small></div>{onEnterChallenge ? <button type="button" className="kp-enter-btn" data-concept-challenge={experiment.id} onClick={() => onEnterChallenge(experiment.id)} aria-label={'进入' + experiment.title + '实验'}><ArrowRight size={17} /></button> : null}</div>) : <p>暂无对应实验，可先结合课程课件与课堂演示理解。</p>}</div>
    <div className="concept-detail-section"><h5>相关题目 <span>{questions.length}</span></h5>{questions.length ? questions.map(question => <button key={question.id} type="button" className="kp-question-link" data-concept-question={question.id} onClick={() => onPickQuestion?.(question)} disabled={!onPickQuestion}><small>{QUESTION_TYPE_LABELS[question.type]} · {question.score} 分</small><span>{question.stem}</span></button>) : <p>题库暂未收录该知识点的题目。</p>}</div>
  </section>;
}
