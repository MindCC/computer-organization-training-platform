import { useState, useEffect } from "react";
import { Plus, CheckCircle, Users, ChartPieSlice, CaretDown, CaretRight } from "@phosphor-icons/react";
import { api } from "../apiClient.js";

const Q_TYPES = { choice: "选择题", truefalse: "判断题", fill: "填空题", short_answer: "简答题" };

export function TeacherAssignments({ classId }) {
  const [assignments, setAssignments] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (classId) loadAll(); }, [classId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [a, an] = await Promise.all([api.teacherAssignments(classId), api.assignmentAnalytics(classId)]);
      setAssignments(a.assignments ?? []);
      setAnalytics(an.analytics ?? []);
    } catch {} finally { setLoading(false); }
  }

  async function loadSelectedAssignment(id) {
    const [detail, result] = await Promise.all([api.assignmentDetail(id), api.assignmentSubmissions(id)]);
    setSelectedAssignment(detail);
    setSubmissions(result.submissions ?? []);
  }

  async function selectAssignment(id) {
    if (id === selected) {
      setSelected(null);
      setSelectedAssignment(null);
      setSubmissions([]);
      return;
    }
    setSelected(id);
    await loadSelectedAssignment(id);
  }

  return (
    <div className="assignment-panel">
      <div className="assignment-header">
        <strong>作业管理</strong>
        <button className="primary-button" onClick={() => setShowCreate(!showCreate)}><Plus size={16} /> 创建作业</button>
      </div>

      {showCreate && <AssignmentCreator classId={classId} onDone={() => { setShowCreate(false); loadAll(); }} />}

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
            <button className={`assignment-row ${selected === a.id ? "active" : ""}`} onClick={() => selectAssignment(a.id)}>
              <span>{selected === a.id ? <CaretDown size={14} /> : <CaretRight size={14} />}</span>
              <span className="assignment-title">{a.title}</span>
              <span className={`assignment-status ${a.status}`}>{a.status === "published" ? "已发布" : a.status === "closed" ? "已关闭" : "草稿"}</span>
              <span>{a.question_count} 题 · {a.total_score} 分</span>
            </button>
            {selected === a.id && (
              <div className="assignment-detail">
                {a.status === "draft" && <DraftActions assignmentId={a.id} questionCount={a.question_count} onRefresh={loadAll} />}
                {a.status !== "draft" && <SubmissionList submissions={submissions} assignment={a} questions={selectedAssignment?.questions ?? []} onRefresh={() => loadSelectedAssignment(a.id)} />}
              </div>
            )}
          </div>
        ))}
        {assignments.length === 0 && <p className="empty-state">暂无作业。点击"创建作业"开始。</p>}
      </div>
    </div>
  );
}

function DraftActions({ assignmentId, questionCount, onRefresh }) {
  return (
    <div className="draft-actions">
      <QuestionForm assignmentId={assignmentId} onDone={onRefresh} />
      {questionCount > 0 && (
        <button className="primary-button" onClick={async () => { await api.publishAssignment(assignmentId); onRefresh(); }}>发布作业</button>
      )}
    </div>
  );
}

function QuestionForm({ assignmentId, onDone }) {
  const [type, setType] = useState("choice");
  const [stem, setStem] = useState("");
  const [options, setOptions] = useState("");
  const [answer, setAnswer] = useState("");
  const [score, setScore] = useState(10);

  async function add() {
    if (!stem.trim()) return;
    await api.addQuestion(assignmentId, {
      type, stem: stem.trim(),
      options: type === "choice" ? options.split("\n").filter(Boolean) : [],
      answer: answer.trim(), score,
    });
    setStem(""); setOptions(""); setAnswer(""); setScore(10);
    onDone();
  }

  return (
    <div className="question-form">
      <select value={type} onChange={(e) => setType(e.target.value)}>
        {Object.entries(Q_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <input placeholder="题目内容" value={stem} onChange={(e) => setStem(e.target.value)} />
      {type === "choice" && <textarea placeholder="选项（每行一个）" value={options} onChange={(e) => setOptions(e.target.value)} rows={3} />}
      <input placeholder={type === "truefalse" ? "答案: true 或 false" : "正确答案"} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      <input type="number" placeholder="分值" value={score} onChange={(e) => setScore(Number(e.target.value))} min={1} max={100} style={{ width: 80 }} />
      <button className="primary-button" onClick={add}>添加题目</button>
    </div>
  );
}

function AssignmentCreator({ classId, onDone }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  async function create() {
    if (!title.trim()) return;
    await api.createAssignment(classId, { title: title.trim(), description: desc.trim() });
    setTitle(""); setDesc("");
    onDone();
  }
  return (
    <div className="assignment-creator">
      <input placeholder="作业标题" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input placeholder="说明（可选）" value={desc} onChange={(e) => setDesc(e.target.value)} />
      <button className="primary-button" onClick={create}>创建</button>
    </div>
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
  const pending = submission.status === "submitted";

  async function grade() {
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
    }
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
        <button className="ghost-button" onClick={grade} type="button">提交评分</button>
        {error ? <small className="form-error">{error}</small> : null}
      </div> : null}
    </div>
  );
}
