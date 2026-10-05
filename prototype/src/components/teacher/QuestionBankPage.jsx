import { useCallback, useEffect, useMemo, useState } from 'react';
import { Exam, FileArrowUp, Sparkle, CardsThree, Trash, PencilSimple } from '@phosphor-icons/react';
import { api } from '../../apiClient.js';
import { COURSE_CHAPTERS } from '../../courseChapters.js';
import { ASSIGNMENT_QUESTIONS } from '../../assignmentQuestions.js';
import './questionBank.css';

const TYPE_LABELS = { choice: '单选', truefalse: '判断', fill: '填空', short_answer: '简答' };
const SOURCE_LABELS = { manual: '手工录入', import: '批量导入', ai: 'AI 出题', builtin: '内置题库' };
const TYPES = Object.keys(TYPE_LABELS);
const EMPTY_FORM = { chapterId: 'ch1', type: 'choice', stem: '', options: ['', '', '', ''], answer: '', analysis: '', score: 10 };

function chapterTitle(id) { return COURSE_CHAPTERS.find((chapter) => chapter.id === id)?.title ?? id; }

export function QuestionBankPage({ teacherClasses }) {
  const [tab, setTab] = useState('bank');
  const [bank, setBank] = useState({ questions: [], counts: [] });
  const [filters, setFilters] = useState({ chapterId: '', type: '', keyword: '', source: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editor, setEditor] = useState(null); // null | {id?, ...form}
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [ai, setAi] = useState({ chapterId: 'ch3', requirements: '', counts: { choice: 3, truefalse: 2, fill: 1, short_answer: 0 }, documentIds: [], consent: false });
  const [documents, setDocuments] = useState([]);
  const [candidates, setCandidates] = useState(null);
  const [aiSelected, setAiSelected] = useState(new Set());
  const [aiBusy, setAiBusy] = useState(false);
  const [paper, setPaper] = useState({ title: '', chapters: [], spec: { choice: { count: 2, score: '' }, truefalse: { count: 1, score: '' }, fill: { count: 0, score: '' }, short_answer: { count: 0, score: '' } }, classId: '', dueAt: '', publish: false, seed: '' });
  const [preview, setPreview] = useState(null);
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadBank = useCallback(async (next = filters) => {
    setLoading(true); setError('');
    try { setBank(await api.questionBank(next)); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { loadBank(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { api.teacherKnowledgeDocuments().then((data) => setDocuments(data.documents ?? [])).catch(() => {}); }, []);

  function notify(text) { setMessage(text); setTimeout(() => setMessage(''), 6000); }

  async function saveEditor() {
    setBusy(true);
    try {
      const payload = { ...editor, options: editor.type === 'choice' ? editor.options.filter((option) => option.trim()) : [], score: Number(editor.score) || 10 };
      if (editor.id) await api.updateBankQuestion(editor.id, payload);
      else await api.createBankQuestion(payload);
      setEditor(null); notify(editor.id ? '题目已更新' : '题目已录入题库'); await loadBank();
    } catch (failure) { notify(failure.message); }
    finally { setBusy(false); }
  }

  async function removeQuestion(question) {
    if (!window.confirm(`删除这道题？\n${question.stem.slice(0, 40)}`)) return;
    try { await api.deleteBankQuestion(question.id); notify('题目已删除'); await loadBank(); }
    catch (failure) { notify(failure.message); }
  }

  function parseImport(text) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('请先粘贴题目内容或选择文件');
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : parsed.questions;
      if (!Array.isArray(list)) throw new Error('JSON 必须是题目数组或 {questions:[...]}');
      return list;
    }
    // CSV：type,chapterId,stem,options(| 分隔),answer,analysis,score
    const rows = parseCsv(trimmed);
    const header = rows[0].map((cell) => cell.trim());
    const indexOf = (name) => header.indexOf(name);
    if (indexOf('type') < 0 || indexOf('stem') < 0) throw new Error('CSV 需要表头：type,chapterId,stem,options,answer,analysis,score');
    return rows.slice(1).filter((row) => row.some((cell) => cell.trim())).map((row) => ({
      type: row[indexOf('type')]?.trim(), chapterId: row[indexOf('chapterId')]?.trim() || 'ch1',
      stem: row[indexOf('stem')] ?? '', options: (row[indexOf('options')] ?? '').split('|').map((option) => option.trim()).filter(Boolean),
      answer: row[indexOf('answer')] ?? '', analysis: row[indexOf('analysis')] ?? '', score: Number(row[indexOf('score')]) || 10,
    }));
  }

  async function runImport(questions, source, batchId) {
    setBusy(true); setImportResult(null);
    try {
      const { result } = await api.importBankQuestions({ batchId, source, questions });
      setImportResult(result);
      notify(`导入完成：新增 ${result.imported}，跳过 ${result.skipped}，失败 ${result.errors.length}`);
      await loadBank();
    } catch (failure) { notify(failure.message); }
    finally { setBusy(false); }
  }

  async function importBuiltin() {
    const questions = ASSIGNMENT_QUESTIONS.map((question) => ({
      chapterId: question.chapterId, type: question.type, stem: question.stem,
      options: question.options ?? [],
      answer: question.type === 'fill' ? (question.keywords ?? []).map((group) => group[0]).join('；') : question.answer,
      keywords: question.keywords, analysis: question.analysis, score: question.score,
      clientKey: `builtin:${question.id}`,
    }));
    await runImport(questions, 'builtin', 'builtin-assignment-v1');
  }

  async function generateWithAi() {
    setAiBusy(true); setCandidates(null);
    try {
      const result = await api.aiGenerateBankQuestions({ ...ai, consent: ai.consent === true });
      setCandidates(result);
      setAiSelected(new Set(result.candidates.map((_, index) => index)));
    } catch (failure) { notify(failure.message); }
    finally { setAiBusy(false); }
  }

  async function adoptCandidates() {
    const chosen = candidates.candidates.filter((_, index) => aiSelected.has(index));
    if (!chosen.length) { notify('请先勾选要入库的题目'); return; }
    await runImport(chosen, 'ai', `ai:${Date.now()}`);
    setCandidates(null); setTab('bank');
  }

  function composeSpec() {
    return TYPES.map((type) => ({ type, count: Number(paper.spec[type].count) || 0, score: paper.spec[type].score === '' ? null : Number(paper.spec[type].score) }))
      .filter((entry) => entry.count > 0);
  }

  async function composePreview() {
    setBusy(true); setPreview(null); setCreated(null);
    try {
      const { preview: result } = await api.composeBankPaper({
        action: 'preview', title: paper.title, chapters: paper.chapters, spec: composeSpec(),
        seed: paper.seed === '' ? undefined : Number(paper.seed),
      });
      setPreview(result);
    } catch (failure) { notify(failure.message); }
    finally { setBusy(false); }
  }

  async function composeAssignment(publish) {
    if (!paper.classId) { notify('请选择要布置的班级'); return; }
    setBusy(true); setCreated(null);
    try {
      const result = await api.composeBankPaper({
        action: 'assignment', classId: Number(paper.classId), title: paper.title || preview?.title,
        chapters: paper.chapters, spec: composeSpec(), publish, dueAt: paper.dueAt || null,
        seed: paper.seed === '' ? undefined : Number(paper.seed),
      });
      setCreated(result); notify(publish ? '试卷已发布到班级，学生端立即可见' : '作业草稿已创建，可在教师看板继续编辑后发布');
    } catch (failure) { notify(failure.message); }
    finally { setBusy(false); }
  }

  const countSummary = useMemo(() => {
    const byChapter = new Map();
    for (const row of bank.counts) byChapter.set(row.chapterId, (byChapter.get(row.chapterId) ?? 0) + row.count);
    return [...byChapter.entries()];
  }, [bank.counts]);

  return <div className="question-bank" data-testid="question-bank">
    <header className="section-panel qb-heading">
      <div><span className="eyebrow">TEACHING / QUESTION BANK</span>
        <h1><Exam size={25}/>题库与自动出卷</h1>
        <p>手工录入、批量导入或从知识库 AI 出题，按章节与题型自动组卷，一键发布为班级作业。</p></div>
      <div className="qb-tabs" role="tablist" aria-label="题库功能">
        {[['bank', '题库'], ['import', '导入'], ['ai', 'AI 出题'], ['compose', '自动出卷']].map(([id, label]) =>
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
    </header>
    {message && <p className="section-panel qb-message" role="status">{message}</p>}

    {tab === 'bank' && <>
      <section className="section-panel qb-controls" aria-label="题库筛选">
        <label>章节<select value={filters.chapterId} onChange={(event) => setFilters({ ...filters, chapterId: event.target.value })}>
          <option value="">全部章节</option>{COURSE_CHAPTERS.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label>
        <label>题型<select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}>
          <option value="">全部题型</option>{TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}</select></label>
        <label>来源<select value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}>
          <option value="">全部来源</option>{Object.entries(SOURCE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>关键词<input value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} placeholder="题干包含…"/></label>
        <button type="button" className="primary-button" onClick={() => loadBank()}>查询</button>
        <button type="button" className="ghost-button" onClick={() => setEditor({ ...EMPTY_FORM })}><FileArrowUp size={16}/>录入新题</button>
      </section>
      <section className="section-panel" aria-label="题库统计">
        <div className="qb-counts">{countSummary.length ? countSummary.map(([chapterId, count]) =>
          <span key={chapterId} className="qb-count-chip">{chapterTitle(chapterId)} · {count} 题</span>) : <p>题库还是空的，可以先录入、导入或用 AI 出题。</p>}</div>
      </section>
      {editor && <section className="section-panel qb-editor" aria-label={editor.id ? '编辑题目' : '录入新题'}>
        <h2>{editor.id ? '编辑题目' : '录入新题'}</h2>
        <div className="qb-form-grid">
          <label>章节<select value={editor.chapterId} onChange={(event) => setEditor({ ...editor, chapterId: event.target.value })}>
            {COURSE_CHAPTERS.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label>
          <label>题型<select value={editor.type} onChange={(event) => setEditor({ ...editor, type: event.target.value, answer: '' })}>
            {TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}</select></label>
          <label>分值<input type="number" min="1" max="100" value={editor.score} onChange={(event) => setEditor({ ...editor, score: event.target.value })}/></label>
        </div>
        <label>题干<textarea rows={3} value={editor.stem} onChange={(event) => setEditor({ ...editor, stem: event.target.value })}/></label>
        {editor.type === 'choice' && <fieldset className="qb-options"><legend>选项（答案请从选项中选择）</legend>
          {editor.options.map((option, index) => <input key={index} value={option} placeholder={`选项 ${index + 1}`}
            onChange={(event) => setEditor({ ...editor, options: editor.options.map((item, i) => i === index ? event.target.value : item) })}/>)}
          <button type="button" className="ghost-button" onClick={() => setEditor({ ...editor, options: [...editor.options, ''] })}>添加选项</button>
        </fieldset>}
        {editor.type === 'choice' && <label>正确答案<select value={editor.answer} onChange={(event) => setEditor({ ...editor, answer: event.target.value })}>
          <option value="">选择正确选项</option>{editor.options.filter((option) => option.trim()).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>}
        {editor.type === 'truefalse' && <div className="qb-truefalse" role="radiogroup" aria-label="判断题答案">
          {[['true', '正确'], ['false', '错误']].map(([value, text]) => (
            <label key={value}>
              <input type="radio" name="qb-tf" checked={editor.answer === value} onChange={() => setEditor({ ...editor, answer: value })}/>
              {text}
            </label>
          ))}
        </div>}
        {editor.type === 'fill' && <label>标准答案（学生答案忽略首尾空格后需与其一致）<input value={editor.answer} onChange={(event) => setEditor({ ...editor, answer: event.target.value })}/></label>}
        {editor.type === 'short_answer' && <label>评分要点（简答题由教师人工批改）<textarea rows={2} value={editor.answer} onChange={(event) => setEditor({ ...editor, answer: event.target.value })}/></label>}
        <label>解析<textarea rows={2} value={editor.analysis} onChange={(event) => setEditor({ ...editor, analysis: event.target.value })}/></label>
        <div className="qb-editor-actions">
          <button type="button" className="primary-button" disabled={busy} onClick={saveEditor}>{editor.id ? '保存修改' : '录入题库'}</button>
          <button type="button" className="ghost-button" onClick={() => setEditor(null)}>取消</button>
        </div>
      </section>}
      <section className="section-panel" aria-label="题目列表">
        {loading ? <p role="status">正在加载题库…</p> : error ? <p role="alert">{error}</p> :
          <div className="qb-table-scroll"><table className="qb-table">
            <thead><tr><th>题干</th><th>章节</th><th>题型</th><th>分值</th><th>来源</th><th>操作</th></tr></thead>
            <tbody>{bank.questions.map((question) => <tr key={question.id}>
              <td><strong>{question.stem.slice(0, 60)}{question.stem.length > 60 ? '…' : ''}</strong>
                <small>{question.type === 'choice' ? question.options.join(' / ') : question.type === 'truefalse' ? (question.answer === 'true' ? '答案：正确' : '答案：错误') : `答案：${String(question.answer).slice(0, 40)}`}</small></td>
              <td>{chapterTitle(question.chapterId)}</td><td>{TYPE_LABELS[question.type]}</td><td>{question.score}</td>
              <td><span className={`qb-source qb-source-${question.source}`}>{SOURCE_LABELS[question.source]}</span></td>
              <td><button type="button" className="ghost-button" onClick={() => setEditor({ ...question, options: question.type === 'choice' ? [...question.options] : ['', '', '', ''] })}><PencilSimple size={14}/>编辑</button>
                <button type="button" className="ghost-button" onClick={() => removeQuestion(question)}><Trash size={14}/>删除</button></td>
            </tr>)}</tbody>
          </table>{bank.questions.length === 0 && <p>当前筛选下没有题目。</p>}</div>}
      </section>
    </>}

    {tab === 'import' && <section className="section-panel qb-import" aria-label="批量导入">
      <h2><FileArrowUp size={20}/>批量导入题库</h2>
      <p>支持 JSON 数组（或 {'{questions:[...]}'}）与 CSV（表头：type,chapterId,stem,options,answer,analysis,score，选项用 | 分隔）。同一批次重复导入会自动跳过，不会产生重复题目。</p>
      <div className="qb-import-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={importBuiltin}>一键导入内置章节题库（{ASSIGNMENT_QUESTIONS.length} 题）</button>
        <label className="ghost-button qb-file-label">选择 JSON / CSV 文件
          <input type="file" accept=".json,.csv,.txt" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setImportText(await file.text()); event.target.value = ''; }}/></label>
      </div>
      <textarea rows={10} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder='[{"chapterId":"ch3","type":"choice","stem":"题干","options":["A","B","C","D"],"answer":"A","analysis":"解析","score":10}]'/>
      <div className="qb-import-actions">
        <button type="button" className="primary-button" disabled={busy || !importText.trim()}
          onClick={() => { try { runImport(parseImport(importText), 'import', `paste:${Date.now()}`); } catch (failure) { notify(failure.message); } }}>校验并导入</button>
      </div>
      {importResult && <div className="qb-import-result" role="status">
        <strong>批次 {importResult.batchId}：新增 {importResult.imported}，跳过（重复）{importResult.skipped}，失败 {importResult.errors.length}</strong>
        {importResult.errors.length > 0 && <ul>{importResult.errors.slice(0, 10).map((entry) => <li key={entry.index}>第 {entry.index + 1} 题：{entry.message}</li>)}</ul>}
      </div>}
    </section>}

    {tab === 'ai' && <section className="section-panel qb-ai" aria-label="AI 出题">
      <h2><Sparkle size={20}/>从知识库 AI 出题</h2>
      <p>选择你自己的知识库文档和/或填写出题要求，AI 生成候选题，逐题核对勾选后入库。只发送所选材料摘录与出题要求，不附带任何学生数据。</p>
      <div className="qb-form-grid">
        <label>章节<select value={ai.chapterId} onChange={(event) => setAi({ ...ai, chapterId: event.target.value })}>
          {COURSE_CHAPTERS.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label>
        {TYPES.map((type) => <label key={type}>{TYPE_LABELS[type]}数量<input type="number" min="0" max="20" value={ai.counts[type]}
          onChange={(event) => setAi({ ...ai, counts: { ...ai.counts, [type]: Number(event.target.value) } })}/></label>)}
      </div>
      <label>出题要求（可选）<textarea rows={2} value={ai.requirements} onChange={(event) => setAi({ ...ai, requirements: event.target.value })} placeholder="例如：围绕 Cache 命中率出计算题，难度中等"/></label>
      <fieldset className="qb-docs"><legend>知识库材料（可选，最多取前 3 份）</legend>
        {documents.length === 0 && <p>知识库还没有文档，可到「知识库」页面上传课程资料。</p>}
        {documents.map((document) => <label key={document.id}>
          <input type="checkbox" checked={ai.documentIds.includes(document.id)}
            onChange={(event) => setAi({ ...ai, documentIds: event.target.checked ? [...ai.documentIds, document.id] : ai.documentIds.filter((id) => id !== document.id) })}/>
          {document.title}<small>{document.charCount} 字</small></label>)}
      </fieldset>
      <label className="qb-consent"><input type="checkbox" checked={ai.consent} onChange={(event) => setAi({ ...ai, consent: event.target.checked })}/>
        我确认生成时会发送所选材料摘录与出题要求给已配置的 AI 服务</label>
      <button type="button" className="primary-button" disabled={aiBusy || !ai.consent} onClick={generateWithAi}>{aiBusy ? '正在生成…' : '生成候选题'}</button>
      {candidates && <div className="qb-candidates">
        <h3><CardsThree size={18}/>候选题（已自动校验 {candidates.candidates.length} 道{candidates.rejected.length ? `，${candidates.rejected.length} 道未通过校验被丢弃` : ''}）</h3>
        <p role="note">{candidates.notice}</p>
        {candidates.candidates.map((question, index) => <article key={index} className="qb-candidate">
          <label><input type="checkbox" checked={aiSelected.has(index)}
            onChange={(event) => { const next = new Set(aiSelected); event.target.checked ? next.add(index) : next.delete(index); setAiSelected(next); }}/>
            <strong>{TYPE_LABELS[question.type]} · {question.score} 分</strong></label>
          <p>{question.stem}</p>
          {question.type === 'choice' && <small>{question.options.map((option) => `${option === question.answer ? '✓' : '·'} ${option}`).join('　')}</small>}
          {question.type !== 'choice' && <small>答案：{question.type === 'truefalse' ? (question.answer === 'true' ? '正确' : '错误') : question.answer}</small>}
          {question.analysis && <small>解析:{question.analysis}</small>}
        </article>)}
        <button type="button" className="primary-button" disabled={busy || aiSelected.size === 0} onClick={adoptCandidates}>勾选 {aiSelected.size} 道入库</button>
      </div>}
    </section>}

    {tab === 'compose' && <section className="section-panel qb-compose" aria-label="自动出卷">
      <h2><Exam size={20}/>自动出卷</h2>
      <p>从题库按章节范围和题型数量随机抽题；填相同的随机种子可复现同一份试卷。可先预览，再创建为班级作业。</p>
      <div className="qb-form-grid">
        <label>试卷标题<input value={paper.title} onChange={(event) => setPaper({ ...paper, title: event.target.value })} placeholder="例如：第三章小测"/></label>
        <label>布置班级<select value={paper.classId} onChange={(event) => setPaper({ ...paper, classId: event.target.value })}>
          <option value="">选择班级</option>{(teacherClasses ?? []).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
        <label>截止时间（可选）<input type="datetime-local" value={paper.dueAt} onChange={(event) => setPaper({ ...paper, dueAt: event.target.value })}/></label>
        <label>随机种子（可选）<input type="number" value={paper.seed} onChange={(event) => setPaper({ ...paper, seed: event.target.value })} placeholder="留空则每次不同"/></label>
      </div>
      <fieldset className="qb-chapters"><legend>抽题章节（不选 = 全部章节）</legend>
        {COURSE_CHAPTERS.map((chapter) => <label key={chapter.id}>
          <input type="checkbox" checked={paper.chapters.includes(chapter.id)}
            onChange={(event) => setPaper({ ...paper, chapters: event.target.checked ? [...paper.chapters, chapter.id] : paper.chapters.filter((id) => id !== chapter.id) })}/>
          {chapter.title}</label>)}
      </fieldset>
      <fieldset className="qb-spec"><legend>题型与数量（数量为 0 不出该题型；分值留空用题目原分值）</legend>
        {TYPES.map((type) => <div key={type} className="qb-spec-row">
          <span>{TYPE_LABELS[type]}</span>
          <label>数量<input type="number" min="0" max="50" value={paper.spec[type].count}
            onChange={(event) => setPaper({ ...paper, spec: { ...paper.spec, [type]: { ...paper.spec[type], count: event.target.value } } })}/></label>
          <label>每题分值<input type="number" min="1" max="100" value={paper.spec[type].score} placeholder="原分值"
            onChange={(event) => setPaper({ ...paper, spec: { ...paper.spec, [type]: { ...paper.spec[type], score: event.target.value } } })}/></label>
        </div>)}
      </fieldset>
      <div className="qb-import-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={composePreview}>预览抽题</button>
        {preview && <>
          <button type="button" className="ghost-button" disabled={busy} onClick={() => composeAssignment(false)}>存为作业草稿</button>
          <button type="button" className="primary-button" disabled={busy} onClick={() => composeAssignment(true)}>发布到班级</button>
        </>}
      </div>
      {preview && <div className="qb-preview" role="status">
        <h3>{preview.title} · 共 {preview.questions.length} 题 / {preview.totalScore} 分</h3>
        {preview.shortage.length > 0 && <p role="alert" className="qb-shortage">题库数量不足：{preview.shortage.map((entry) => `${TYPE_LABELS[entry.type]}要 ${entry.wanted} 道仅有 ${entry.available} 道`).join('；')}，已按实际数量抽取。</p>}
        <ol>{preview.questions.map((question) => <li key={question.id}>
          <span className="qb-preview-meta">[{chapterTitle(question.chapterId)} · {TYPE_LABELS[question.type]} · {question.score}分]</span> {question.stem}
        </li>)}</ol>
      </div>}
      {created && <p className="qb-created" role="status">作业「{created.assignment.title}」已{created.assignment.status === 'published' ? '发布' : '保存为草稿'}（总分 {created.totalScore} 分），可在教师看板的课后作业中查看与批改。</p>}
    </section>}
  </div>;
}

/** 轻量 CSV 解析：支持引号包裹与转义。 */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') inQuotes = false;
      else cell += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); if (row.some((value) => value.trim())) rows.push(row); }
  return rows;
}
