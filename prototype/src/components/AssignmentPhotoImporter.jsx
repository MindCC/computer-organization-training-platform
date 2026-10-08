import { useEffect, useRef, useState } from 'react';
import { Camera, ImageSquare } from '@phosphor-icons/react';
import { api } from '../apiClient.js';
import { COURSE_CHAPTERS } from '../courseChapters.js';
import { createRandomId } from '../shared/randomId.js';

const types = { choice: '选择题', truefalse: '判断题', fill: '填空题', short_answer: '简答题' };
const readFile = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, image: reader.result });
  reader.onerror = () => reject(new Error('图片读取失败，请重新选择'));
  reader.readAsDataURL(file);
});

export function AssignmentPhotoImporter({ classId, assignmentId, onSaved }) {
  const [files, setFiles] = useState([]), [chapterId, setChapterId] = useState('ch1');
  const [consent, setConsent] = useState(false), [capabilities, setCapabilities] = useState(null);
  const [questions, setQuestions] = useState([]), [title, setTitle] = useState('');
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(false);
  const camera = useRef(null), picker = useRef(null), alive = useRef(true), batchId = useRef(''), lock = useRef(false);
  useEffect(() => {
    alive.current = true;
    api.assignmentPhotoCapabilities().then(result => { if (alive.current) setCapabilities(result); }).catch(err => { if (alive.current) setError(`识别服务检查失败：${err.message}`); });
    return () => { alive.current = false; };
  }, []);
  async function choose(event) {
    const selected = [...(event.target.files ?? [])]; event.target.value = '';
    if (!selected.length || lock.current) return;
    if (files.length + selected.length > 3) { setError('每次最多上传 3 张图片，请先移除多余图片。'); return; }
    if (selected.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) { setError('请上传 PNG、JPEG 或 WebP 图片，每张不超过 5MB。'); return; }
    if (selected.reduce((sum, file) => sum + file.size, 0) + files.reduce((sum, file) => sum + file.size, 0) > 10 * 1024 * 1024) { setError('图片合计不能超过 10MB。'); return; }
    lock.current = true; setBusy('reading'); setError('');
    try {
      const added = await Promise.all(selected.map(readFile));
      if (!alive.current) return;
      setFiles(current => [...current, ...added.map((file, index) => ({ ...file, size: selected[index].size }))]);
      setQuestions([]); setSaved(false); setNotice(''); setConsent(false);
    } catch (err) { if (alive.current) setError(err.message); }
    finally { lock.current = false; if (alive.current) setBusy(''); }
  }
  async function recognize() {
    if (lock.current) return;
    lock.current = true; setBusy('recognizing'); setError(''); setNotice('');
    try {
      const result = await api.recognizeAssignmentPhotos({ images: files.map(file => file.image), chapterId, consent });
      if (!alive.current) return;
      setTitle(result.title); setQuestions(result.questions.map(q => ({ ...q, selected: true })));
      batchId.current = createRandomId('photo'); setSaved(false);
    } catch (err) { if (alive.current) setError(`识别失败：${err.message}。图片已保留，可重试。`); }
    finally { lock.current = false; if (alive.current) setBusy(''); }
  }
  function change(index, field, value) { setQuestions(current => current.map((q, i) => i === index ? { ...q, [field]: value } : q)); }
  const selected = questions.filter(q => q.selected);
  async function save(destination) {
    if (lock.current || saved) return;
    lock.current = true; setBusy('saving'); setError(''); setNotice('');
    try {
      const result = await api.saveAssignmentPhotos({ batchId: batchId.current, destination, classId, ...(assignmentId ? { assignmentId } : {}), title, questions: selected.map(({ selected: _selected, warning: _warning, ...q }) => q) });
      if (!alive.current) return;
      setSaved(true);
      setNotice([result.bankCount ? `已加入题库 ${result.bankCount} 题` : '', result.assignmentCount ? `已加入作业库草稿 ${result.assignmentCount} 题，可在作业列表核对后发布` : ''].filter(Boolean).join('；'));
      try { await onSaved?.(result); } catch { if (alive.current) setError('已保存成功，列表刷新失败，请刷新页面查看。'); }
    } catch (err) { if (alive.current) setError(`保存失败：${err.message}。已保留核对内容和勾选，可重试。`); }
    finally { lock.current = false; if (alive.current) setBusy(''); }
  }
  return <section className="assignment-photo-importer" aria-label="拍照上传作业" aria-busy={Boolean(busy)}>
    <h3><Camera size={20} />拍照上传作业</h3>
    <p>拍摄纸质作业或上传图片，AI 识别题目并解答没有参考答案的习题，再选择加入题库或作业库。最多 3 张，每张 5MB，合计 10MB。</p>
    {capabilities === null && !error && <p role="status">正在检查识别服务…</p>}
    {capabilities?.imageAi === false && <p role="status">作业图片识别尚未配置视觉大模型，请联系管理员配置后使用。</p>}
    <fieldset disabled={Boolean(busy)} className="assignment-photo-upload"><legend>上传与识别</legend>
      <input hidden ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="拍照上传图片" onChange={choose} />
      <input hidden ref={picker} type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="选择作业图片" onChange={choose} />
      <div className="assignment-photo-actions"><button type="button" className="ghost-button" onClick={() => camera.current.click()}><Camera size={18} />拍照</button><button type="button" className="ghost-button" onClick={() => picker.current.click()}><ImageSquare size={18} />选择图片</button></div>
      {files.length > 0 && <div className="assignment-photo-previews">{files.map((file, index) => <figure key={index}><img src={file.image} alt={`作业图片 ${index + 1}：${file.name}`} /><figcaption>{index + 1}. {file.name}</figcaption><button type="button" className="ghost-button" aria-label={`移除图片 ${index + 1}`} onClick={() => { setFiles(current => current.filter((_, i) => i !== index)); setQuestions([]); setSaved(false); setNotice(''); setConsent(false); }}>移除</button></figure>)}</div>}
      <label className="assignment-photo-field">默认章节<select value={chapterId} onChange={e => setChapterId(e.target.value)}>{COURSE_CHAPTERS.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label>
      <label className="assignment-photo-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />我确认将以上图片发送给大模型识别，已遮挡姓名、学号等个人信息。</label>
      <button type="button" className="primary-button" disabled={!files.length || !consent || !capabilities?.imageAi} onClick={recognize}>{busy === 'recognizing' ? '正在识别，请稍候…' : questions.length ? '重新识别图片' : '开始识别作业'}</button>
    </fieldset>
    {questions.length > 0 && <fieldset disabled={Boolean(busy) || saved} className="assignment-photo-review"><legend>核对识别结果 · {questions.length} 题</legend>
      <p>没有参考答案的题目由 AI 解答。教师可以修改或确认答案；人工确认可选，未勾选也可入库。无法解答的题目请补全答案或取消勾选。</p>
      {!assignmentId && <label className="assignment-photo-field">作业标题<input maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label>}
      <div className="assignment-photo-actions"><button type="button" className="ghost-button" onClick={() => setQuestions(current => current.map(q => ({ ...q, selected: true })))}>全选题目</button><button type="button" className="ghost-button" onClick={() => setQuestions(current => current.map(q => ({ ...q, selected: false })))}>取消全选</button><span>已选 {selected.length} 题</span></div>
      {questions.map((q, index) => <fieldset className="assignment-photo-question" key={index}><legend>第 {index + 1} 题</legend>
        <label className="assignment-photo-check"><input type="checkbox" checked={q.selected} onChange={e => change(index, 'selected', e.target.checked)} />加入此题</label>
        {q.warning && <p className="assignment-photo-warning">识别提示：{q.warning}</p>}
        <p className={q.answerSource === 'ai' && !q.teacherConfirmed ? 'assignment-photo-warning' : ''}>答案来源：{q.answerSource === 'provided' ? '图片中的参考答案' : q.answerSource === 'ai' ? 'AI 生成答案' : '待补全答案'}{q.answerSource === 'ai' ? (q.teacherConfirmed ? ' · 已由教师确认' : ' · 未人工确认') : ''}</p>
        <div className="assignment-photo-meta"><label className="assignment-photo-field">章节<select value={q.chapterId} onChange={e => change(index, 'chapterId', e.target.value)}>{COURSE_CHAPTERS.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label><label className="assignment-photo-field">题型<select value={q.type} onChange={e => change(index, 'type', e.target.value)}>{Object.entries(types).map(([type, name]) => <option key={type} value={type}>{name}</option>)}</select></label><label className="assignment-photo-field">分值<input type="number" min={1} max={100} value={q.score} onChange={e => change(index, 'score', Number(e.target.value))} /></label></div>
        <label className="assignment-photo-field">题干<textarea rows={3} maxLength={2000} value={q.stem} onChange={e => change(index, 'stem', e.target.value)} /></label>
        {q.type === 'choice' && <label className="assignment-photo-field">选项（每行一个）<textarea rows={3} value={q.options.join('\n')} onChange={e => change(index, 'options', e.target.value.split('\n'))} /></label>}
        <label className="assignment-photo-field">标准答案或评分要点{q.type === 'truefalse' ? <select value={q.answer} onChange={e => change(index, 'answer', e.target.value)}><option value="">请选择答案</option><option value="true">正确</option><option value="false">错误</option></select> : <textarea rows={2} maxLength={2000} placeholder={q.type === 'choice' ? '填写正确选项的完整文本' : '补全标准答案或简答评分要点'} value={q.answer} onChange={e => change(index, 'answer', e.target.value)} />}</label>
        <label className="assignment-photo-field">解析（可选）<textarea rows={2} maxLength={2000} value={q.analysis} onChange={e => change(index, 'analysis', e.target.value)} /></label>
        <label className="assignment-photo-check"><input type="checkbox" checked={q.teacherConfirmed === true} onChange={e => change(index, 'teacherConfirmed', e.target.checked)} />我已人工确认此题答案（可选）</label>
      </fieldset>)}
      <div className="assignment-photo-save"><strong>将已勾选的 {selected.length} 道题目加入：</strong><div className="assignment-photo-actions"><button type="button" className="ghost-button" disabled={!selected.length} onClick={() => save('bank')}>仅加入题库</button><button type="button" className="ghost-button" disabled={!selected.length || (!assignmentId && (!classId || !title.trim()))} onClick={() => save('assignment')}>仅加入作业库</button><button type="button" className="primary-button" disabled={!selected.length || (!assignmentId && (!classId || !title.trim()))} onClick={() => save('both')}>同时加入题库和作业库</button></div><small>作业保存为草稿，在作业管理中发布后学生才可见。</small></div>
    </fieldset>}
    {busy === 'saving' && <p role="status">正在保存核对后的题目…</p>}
    {notice && <p role="status" className="assignment-photo-success">{notice}</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </section>;
}
