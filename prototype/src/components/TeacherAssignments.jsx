import { useState, useEffect, useRef } from "react";
import { Plus, CheckCircle, Users, ChartPieSlice, CaretDown, CaretRight } from "@phosphor-icons/react";
import { api } from "../apiClient.js";
import './teacherAssignments.css';

const Q_TYPES = { choice: "选择题", truefalse: "判断题", fill: "填空题", short_answer: "简答题" };

export function TeacherAssignments({ classId }) {
  const [assignments, setAssignments] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,setError]=useState(''),[detailError,setDetailError]=useState(''),[detailLoading,setDetailLoading]=useState(false);
  const alive=useRef(true),listVersion=useRef(0),selectedRef=useRef(null);

  useEffect(() => { alive.current=true;if (classId) loadAll();return()=>{alive.current=false;listVersion.current++;selectedRef.current=null;}; }, [classId]);

  async function loadAll() {
    const version=++listVersion.current;setLoading(true);setError('');
    try {
      const [a, an] = await Promise.all([api.teacherAssignments(classId), api.assignmentAnalytics(classId)]);
      if(!alive.current||version!==listVersion.current)return;
      setAssignments(a.assignments ?? []);
      setAnalytics(an.analytics ?? []);
    } catch(err) {if(alive.current&&version===listVersion.current)setError(`作业加载失败：${err.message}`);} finally {if(alive.current&&version===listVersion.current)setLoading(false);}
  }

  async function loadSelectedAssignment(id) {
    setDetailLoading(true);setDetailError('');
    try {
      const [detail, result] = await Promise.all([api.assignmentDetail(id), api.assignmentSubmissions(id)]);
      if(!alive.current||selectedRef.current!==id)return;
      setSelectedAssignment(detail);setSubmissions(result.submissions ?? []);
    } catch(err) {if(alive.current&&selectedRef.current===id)setDetailError(`作业详情加载失败：${err.message}`);}
    finally {if(alive.current&&selectedRef.current===id)setDetailLoading(false);}
  }

  async function selectAssignment(id) {
    if (id === selected) {
      setSelected(null);
      selectedRef.current=null;
      setSelectedAssignment(null);
      setSubmissions([]);
      return;
    }
    setSelected(id);
    selectedRef.current=id;setSelectedAssignment(null);setSubmissions([]);
    await loadSelectedAssignment(id);
  }

  return (
    <div className="assignment-panel">
      <div className="assignment-header">
        <strong>作业管理</strong>
        <button type="button" className="primary-button" aria-expanded={showCreate} onClick={() => setShowCreate(!showCreate)}><Plus size={16} /> {showCreate?'收起创建':'创建作业'}</button>
      </div>

      {showCreate && <AssignmentCreator classId={classId} onDone={() => { setShowCreate(false); loadAll(); }} />}
      {loading&&<p role="status">正在读取班级作业…</p>}
      {error&&<div className="form-error" role="alert"><p>{error}</p><button type="button" className="ghost-button" onClick={loadAll}>重试加载作业</button></div>}

      {analytics.length > 0 && (
        <div className="assignment-analytics-bar">
          {analytics.map((a) => (
            <div className="analytics-chip" key={a.assignmentId}>
              <span>{a.title}</span>
              <span>{a.submittedCount}/{a.studentCount} 提交</span>
              <span>{a.averageScore != null ? `均分 ${a.averageScore}` : "—"}</span>
            </div>
          ))}
        </div>
      )}

      <div className="assignment-list">
        {assignments.map((a) => (
          <div key={a.id}>
            <button type="button" aria-expanded={selected===a.id} className={`assignment-row ${selected === a.id ? "active" : ""}`} onClick={() => selectAssignment(a.id)}>
              <span>{selected === a.id ? <CaretDown size={14} /> : <CaretRight size={14} />}</span>
              <span className="assignment-title">{a.title}</span>
              <span className={`assignment-status ${a.status}`}>{a.status === "published" ? "已发布" : a.status === "closed" ? "已关闭" : "草稿"}</span>
              <span>{a.question_count} 题 · {a.total_score} 分</span>
            </button>
            {selected === a.id && (
              <div className="assignment-detail">
                {detailLoading&&<p role="status">正在加载题目与提交记录…</p>}
                {detailError&&<div role="alert" className="form-error"><p>{detailError}</p><button className="ghost-button" type="button" onClick={()=>loadSelectedAssignment(a.id)}>重试加载详情</button></div>}
                {a.status === "draft" && <DraftActions assignmentId={a.id} questionCount={a.question_count} onRefresh={loadAll} />}
                {a.status !== "draft" && !detailLoading && !detailError && selectedAssignment && <SubmissionList submissions={submissions} assignment={a} questions={selectedAssignment.questions ?? []} onRefresh={() => loadSelectedAssignment(a.id)} />}
              </div>
            )}
          </div>
        ))}
        {!loading&&!error&&assignments.length === 0 && <p className="empty-state">暂无作业。点击“创建作业”，添加题目后发布给当前班级。</p>}
      </div>
    </div>
  );
}

function DraftActions({ assignmentId, questionCount, onRefresh }) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function publish(){if(busy)return;setBusy(true);setError('');try{await api.publishAssignment(assignmentId);await onRefresh();}catch(err){setError(`发布失败：${err.message}`);}finally{setBusy(false);}}
  return (
    <div className="draft-actions">
      <QuestionForm assignmentId={assignmentId} onDone={onRefresh} />
      {questionCount > 0 && (
        <button type="button" className="primary-button" disabled={busy} onClick={publish}>{busy?'正在发布…':'发布作业'}</button>
      )}
      {error&&<p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

function QuestionForm({ assignmentId, onDone }) {
  const [type, setType] = useState("choice");
  const [stem, setStem] = useState("");
  const [options, setOptions] = useState("");
  const [answer, setAnswer] = useState("");
  const [score, setScore] = useState(10);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');

  async function add() {
    if(busy)return;
    if(!stem.trim()||!Number.isFinite(score)||score<1||score>100){setError('请填写题目，并设置 1～100 的分值。');return;}
    setBusy(true);setError('');
    try {await api.addQuestion(assignmentId, {
      type, stem: stem.trim(),
      options: type === "choice" ? options.split("\n").filter(Boolean) : [],
      answer: answer.trim(), score,
    });
    setStem(""); setOptions(""); setAnswer(""); setScore(10);
    await onDone();}catch(err){setError(`添加题目失败：${err.message}`);}finally{setBusy(false);}
  }

  return (
    <fieldset className="question-form" disabled={busy}><legend>添加题目</legend>
      <select aria-label="题目类型" value={type} onChange={(e) => setType(e.target.value)}>
        {Object.entries(Q_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <input aria-label="题目内容" placeholder="题目内容" value={stem} onChange={(e) => setStem(e.target.value)} />
      {type === "choice" && <textarea aria-label="选项（每行一个）" placeholder="选项（每行一个）" value={options} onChange={(e) => setOptions(e.target.value)} rows={3} />}
      <input aria-label="正确答案" placeholder={type === "truefalse" ? "答案: true 或 false" : "正确答案"} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      <input aria-label="题目分值" type="number" placeholder="分值" value={score} onChange={(e) => setScore(Number(e.target.value))} min={1} max={100} style={{ width: 80 }} />
      <button type="button" className="primary-button" disabled={busy} onClick={add}>{busy?'正在添加…':'添加题目'}</button>{error&&<p className="form-error" role="alert">{error}</p>}
    </fieldset>
  );
}

function AssignmentCreator({ classId, onDone }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function create() {
    if (busy||!title.trim()) return;setBusy(true);setError('');
    try {await api.createAssignment(classId, { title: title.trim(), description: desc.trim() });
    setTitle(""); setDesc("");
    await onDone();}catch(err){setError(`创建失败：${err.message}`);}finally{setBusy(false);}
  }
  return (
    <fieldset className="assignment-creator" disabled={busy}><legend>新作业</legend>
      <input aria-label="作业标题" placeholder="作业标题" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input aria-label="作业说明" placeholder="说明（可选）" value={desc} onChange={(e) => setDesc(e.target.value)} />
      <button type="button" className="primary-button" disabled={busy||!title.trim()} onClick={create}>{busy?'正在创建…':'创建'}</button>{error&&<p className="form-error" role="alert">{error}</p>}
    </fieldset>
  );
}

function SubmissionList({ submissions, assignment, questions, onRefresh }) {
  if (submissions.length === 0) return <p className="empty-state">暂无提交。</p>;
  return (
    <div className="submission-list">
      {submissions.map((submission) => <SubmissionRow key={submission.id} submission={submission} assignment={assignment} questions={questions} onRefresh={onRefresh} />)}
    </div>
  );
}

function SubmissionRow({ submission, assignment, questions, onRefresh }) {
  const [scores, setScores] = useState(() => Object.fromEntries(questions.map((question) => {
    const answer = submission.answers?.find((item) => item.questionId === question.id);
    return [question.id, answer?.score ?? 0];
  })));
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [busy,setBusy]=useState(false);
  const pending = submission.status === "submitted";

  async function grade() {
    if(busy)return;setBusy(true);setError('');
    try {
      const questionScores = questions.map((question) => ({
        questionId: question.id,
        score: Number(scores[question.id] ?? 0),
        isCorrect: submission.answers?.find((answer) => answer.questionId === question.id)?.isCorrect,
      }));
      await api.gradeSubmission(submission.id, { questionScores, feedback });
      onRefresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {setBusy(false);}
  }

  return (
    <div className="submission-row">
      <span>{submission.display_name}</span>
      <span>{submission.status === "graded" ? `${submission.total_score} / ${assignment.total_score}` : "待批改"}</span>
      {pending ? <div className="submission-grading">
        {questions.map((question) => {
          const answer = submission.answers?.find((item) => item.questionId === question.id);
          return <label key={question.id}>{question.stem}：<code>{String(answer?.value ?? "未作答")}</code>
            <input aria-label={`${submission.display_name}-${question.stem} 得分`} type="number" min="0" max={question.score} value={scores[question.id] ?? 0} onChange={(event) => setScores((current) => ({ ...current, [question.id]: event.target.value }))} /> / {question.score}
          </label>;
        })}
        <input aria-label={`${submission.display_name} 评语`} placeholder="评语（可选）" value={feedback} onChange={(event) => setFeedback(event.target.value)} />
        <button className="ghost-button" disabled={busy} onClick={grade} type="button">{busy?'正在保存…':'提交评分'}</button>
        {error ? <small className="form-error">{error}</small> : null}
      </div> : null}
    </div>
  );
}
