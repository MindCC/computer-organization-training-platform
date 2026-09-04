import { useState, useEffect } from "react";
import { CheckCircle, ClockCountdown, Notebook } from "@phosphor-icons/react";
import { api } from "../apiClient.js";

export function StudentAssignments() {
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [active, setActive] = useState(null);
  const [detail, setDetail] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    const [a, s] = await Promise.all([api.studentAssignments(), api.studentSubmissions()]);
    setAssignments(a.assignments ?? []);
    setSubmissions(s.submissions ?? []);
  }

  async function openAssignment(id) {
    const r = await api.studentAssignmentDetail(id);
    setDetail(r);
    setActive(id);
    const existing = Object.fromEntries((r.submission?.answers ?? []).map((answer) => [answer.questionId, answer.value]));
    setAnswers(existing);
    setError("");
  }

  function setAnswer(qId, val) { setAnswers((a) => ({ ...a, [qId]: val })); }

  async function saveDraft() {
    const ans = Object.entries(answers).map(([qId, value]) => ({ questionId: Number(qId), value }));
    try {
      await api.saveAssignmentDraft(active, ans);
      setError("");
    } catch (requestError) {
      setError("保存草稿失败：" + requestError.message);
    }
  }

  async function submit() {
    setSubmitting(true);
    const ans = Object.entries(answers).map(([qId, value]) => ({ questionId: Number(qId), value }));
    try {
      await api.submitAssignment(active, ans);
      setActive(null); setDetail(null);
      await load();
    } catch (requestError) {
      setError("提交失败：" + requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  const subMap = new Map(submissions.map((s) => [s.assignment_id, s]));

  return (
    <div className="student-assignments">
      <h2><Notebook size={20} /> 课后作业</h2>
      {active && detail ? (
        <AssignmentView detail={detail} answers={answers} setAnswer={setAnswer} error={error} onSave={saveDraft} onSubmit={submit} submitting={submitting} onBack={() => { setActive(null); setDetail(null); }} />
      ) : (
        <div className="assignment-cards">
          {assignments.map((a) => {
            const sub = subMap.get(a.id);
            return (
              <button className="assignment-card" key={a.id} onClick={() => openAssignment(a.id)}>
                <div>
                  <strong>{a.title}</strong>
                  <span>{a.question_count} 题 · {a.total_score} 分</span>
                </div>
                <div className="assignment-card-status">
                  {sub?.status === "graded" ? (
                    <span className="score-badge"><CheckCircle size={16} /> {sub.total_score}/{a.total_score}</span>
                  ) : sub?.status === "submitted" ? (
                    <span className="pending-badge"><ClockCountdown size={16} /> 待批改</span>
                  ) : (
                    <span className="action-badge">开始答题</span>
                  )}
                </div>
              </button>
            );
          })}
          {assignments.length === 0 && <p className="empty-state">暂无作业。</p>}
        </div>
      )}
    </div>
  );
}

function AssignmentView({ detail, answers, setAnswer, error, onSave, onSubmit, submitting, onBack }) {
  const { questions, submission } = detail;
  const isSubmitted = submission?.status === "submitted" || submission?.status === "graded";

  return (
    <div className="assignment-view">
      <div className="assignment-view-header">
        <button className="ghost-button" onClick={onBack}>← 返回</button>
        <strong>{detail.title}</strong>
        {submission?.status === "graded" && <span className="score-badge">{submission.total_score} / {detail.total_score}</span>}
      </div>
      <div className="question-list">
        {questions.map((q, i) => (
          <div className="question-card" key={q.id}>
            <div className="question-stem">
              <span className="question-num">{i + 1}.</span>
              <span>{q.stem}</span>
              <span className="question-type">{q.type === "choice" ? "单选" : q.type === "truefalse" ? "判断" : q.type === "fill" ? "填空" : "简答"} · {q.score} 分</span>
            </div>
            {q.type === "choice" && q.options?.map((opt, j) => (
              <label className="choice-option" key={j}>
                <input aria-label={`选择题选项：${opt}`} type="radio" name={`q${q.id}`} checked={answers[q.id] === opt} onChange={() => setAnswer(q.id, opt)} disabled={isSubmitted} />
                {opt}
              </label>
            ))}
            {q.type === "truefalse" && (
              <div className="tf-options">
                {["true", "false"].map((v) => (
                  <label key={v}><input type="radio" name={`q${q.id}`} checked={answers[q.id] === v} onChange={() => setAnswer(q.id, v)} disabled={isSubmitted} />{v === "true" ? "正确" : "错误"}</label>
                ))}
              </div>
            )}
            {(q.type === "fill" || q.type === "short_answer") && (
              <input placeholder="输入你的答案" value={answers[q.id] ?? ""} onChange={(e) => setAnswer(q.id, e.target.value)} disabled={isSubmitted} />
            )}
          </div>
        ))}
      </div>
      {!isSubmitted && (
        <div className="assignment-actions">
          <button className="ghost-button" onClick={onSave}>保存草稿</button>
          <button className="primary-button" onClick={onSubmit} disabled={submitting}>{submitting ? "提交中..." : "提交作业"}</button>
        </div>
      )}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div>
  );
}
