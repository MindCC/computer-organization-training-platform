import { useState, useEffect, useMemo } from "react";
import {
  ArrowCounterClockwise,
  ChalkboardTeacher,
  CheckCircle,
  ClockCountdown,
  Lightbulb,
  ListChecks,
  MapTrifold,
  Notebook,
  Star,
  XCircle,
} from "@phosphor-icons/react";

import { api } from "../apiClient.js";
import { COURSE_CHAPTERS } from "../courseChapters.js";
import {
  gradeChapterQuestions,
  questionsForChapter,
  QUESTION_TYPE_LABELS,
} from "../assignmentQuestions.js";
import { CHAPTER_CORE_POINTS, knowledgePointOf } from "../knowledgePoints.js";
import { writeViewSession } from "../viewSession.js";
import { KnowledgeGraph } from "./KnowledgeGraph.jsx";
import "./assignmentsPractice.css";

/**
 * 课后作业 = 按章练习（自动题库 + 知识点标注 + 知识星图） + 教师作业（原有流程）。
 * 按章练习的作答与判分结果只存本机 localStorage，不写服务端。
 */
export function StudentAssignments() {
  const [mode, setMode] = useState("practice");
  const [progress, setProgress] = useState({});

  useEffect(() => {
    let cancelled = false;
    api.studentProgress()
      .then((data) => { if (!cancelled) setProgress(data?.progress ?? {}); })
      .catch(() => { /* 学情拉取失败时星图退化为全「可学习/未解锁」静态展示 */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="student-assignments">
      <h2><Notebook size={20} /> 课后作业</h2>
      <div className="assignment-mode-switch" role="tablist" aria-label="作业模式">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "practice"}
          className={`mode-tab${mode === "practice" ? " active" : ""}`}
          onClick={() => setMode("practice")}
        >
          <ListChecks size={16} /> 按章练习
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "teacher"}
          className={`mode-tab${mode === "teacher" ? " active" : ""}`}
          onClick={() => setMode("teacher")}
        >
          <ChalkboardTeacher size={16} /> 教师作业
        </button>
      </div>
      {mode === "practice" ? <ChapterPractice progress={progress} /> : <TeacherAssignments />}
    </div>
  );
}

/* ==================== 按章练习 ==================== */

const PRACTICE_STORAGE_KEY = "zcyl:chapter-practice-v1";

function loadPracticeStore() {
  try {
    const raw = localStorage.getItem(PRACTICE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      answers: parsed?.answers && typeof parsed.answers === "object" ? parsed.answers : {},
      graded: parsed?.graded && typeof parsed.graded === "object" ? parsed.graded : {},
    };
  } catch {
    return { answers: {}, graded: {} };
  }
}

function savePracticeStore(store) {
  try {
    localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 隐私模式写不进去就只保留本次会话内的状态
  }
}

function shortChapterTitle(title) {
  return title.replace(/^第.+章\s*/, "");
}

function ChapterPractice({ progress }) {
  const [chapterId, setChapterId] = useState(COURSE_CHAPTERS[0].id);
  const [store, setStore] = useState(loadPracticeStore);
  const [graphOpen, setGraphOpen] = useState(false);
  const [focusKpId, setFocusKpId] = useState(null);

  const questions = useMemo(() => questionsForChapter(chapterId), [chapterId]);

  // 本章判分汇总：只看已经提交判过分的题目
  const summary = useMemo(() => {
    let earned = 0;
    let total = 0;
    let gradedCount = 0;
    for (const question of questions) {
      const result = store.graded[question.id];
      if (!result) continue;
      gradedCount += 1;
      earned += result.earned;
      total += result.max;
    }
    return {
      earned,
      total,
      gradedCount,
      questionCount: questions.length,
      mastery: total > 0 ? Math.round((earned / total) * 100) : 0,
    };
  }, [questions, store.graded]);

  function patchStore(next) {
    setStore(next);
    savePracticeStore(next);
  }

  function setAnswer(questionId, value) {
    patchStore({ ...store, answers: { ...store.answers, [questionId]: value } });
  }

  function submitChapter() {
    const { results } = gradeChapterQuestions(chapterId, store.answers);
    patchStore({ ...store, graded: { ...store.graded, ...results } });
  }

  function resetChapter() {
    const answers = { ...store.answers };
    const graded = { ...store.graded };
    for (const question of questions) {
      delete answers[question.id];
      delete graded[question.id];
    }
    patchStore({ answers, graded });
  }

  function focusKnowledgePoint(kpId) {
    setFocusKpId(kpId);
    setGraphOpen(true);
  }

  function enterChallenge(challengeId) {
    // 复用平台的「刷新恢复」机制深链进实验台：写入目标关卡后整页刷新，
    // App 启动时会按 viewSession 直接落进该关（不改 App.jsx 路由结构）。
    writeViewSession({ view: "lab", challengeId });
    window.location.reload();
  }

  function pickQuestion(question) {
    if (question?.chapterId && question.chapterId !== chapterId) setChapterId(question.chapterId);
  }

  const corePoints = CHAPTER_CORE_POINTS[chapterId];

  return (
    <div className="chapter-practice">
      <div className="chapter-tabs" role="tablist" aria-label="章节">
        {COURSE_CHAPTERS.map((chapter) => (
          <ChapterTab
            key={chapter.id}
            chapter={chapter}
            active={chapter.id === chapterId}
            graded={store.graded}
            onSelect={() => setChapterId(chapter.id)}
          />
        ))}
      </div>

      {corePoints?.keyPoints?.length > 0 ? (
        <div className="chapter-core-points">
          <strong>核心知识点</strong>
          <ul>
            {corePoints.keyPoints.map((point) => <li key={point}>{point}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="practice-summary">
        <span className="summary-score">得分 {summary.earned} / {summary.total}</span>
        <span className="summary-mastery">
          掌握度 <b>{summary.mastery}%</b>（已判分 {summary.gradedCount}/{summary.questionCount} 题）
        </span>
        <span className="mastery-bar" aria-hidden><i style={{ width: `${summary.mastery}%` }} /></span>
        <div className="summary-actions">
          <button type="button" className="ghost-button" onClick={() => setGraphOpen((open) => !open)} aria-expanded={graphOpen}>
            <MapTrifold size={16} /> {graphOpen ? "收起知识星图" : "知识星图"}
          </button>
          <button type="button" className="ghost-button" onClick={resetChapter}>
            <ArrowCounterClockwise size={15} /> 重做本章
          </button>
          <button type="button" className="primary-button practice-submit" onClick={submitChapter}>
            提交并判分
          </button>
        </div>
      </div>

      {graphOpen ? (
        <div className="kg-panel">
          <div className="kg-panel-head">
            <MapTrifold size={18} />
            <div>
              <strong>知识星图 · 18 个知识点的依赖关系</strong>
              <p>你造出的元件是后续知识点的积木——完成下层基础，上层进阶才会点亮。</p>
            </div>
          </div>
          <KnowledgeGraph
            progress={progress}
            focusId={focusKpId}
            onSelectKp={setFocusKpId}
            onEnterChallenge={enterChallenge}
            onPickQuestion={pickQuestion}
          />
        </div>
      ) : null}

      <div className="practice-question-list">
        {questions.map((question, index) => (
          <PracticeQuestion
            key={question.id}
            question={question}
            index={index}
            value={store.answers[question.id] ?? ""}
            result={store.graded[question.id] ?? null}
            focusKpId={focusKpId}
            onAnswer={setAnswer}
            onFocusKp={focusKnowledgePoint}
          />
        ))}
      </div>
    </div>
  );
}

function ChapterTab({ chapter, active, graded, onSelect }) {
  const questions = questionsForChapter(chapter.id);
  const gradedCount = questions.filter((question) => graded[question.id]).length;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`chapter-tab${active ? " active" : ""}`}
      onClick={onSelect}
    >
      <strong>第{chapter.number}章</strong>
      <span>{shortChapterTitle(chapter.title)}</span>
      <span className={gradedCount > 0 ? "chapter-tab-score" : ""}>
        {gradedCount > 0 ? `已判分 ${gradedCount}/${questions.length}` : `${questions.length} 题`}
      </span>
    </button>
  );
}

function PracticeQuestion({ question, index, value, result, focusKpId, onAnswer, onFocusKp }) {
  const kp = knowledgePointOf(question.kpId);
  const graded = Boolean(result);
  const stateClass = graded ? (result.correct ? " is-correct" : " is-wrong") : "";

  return (
    <div className={`question-card practice-question${stateClass}`} data-qid={question.id}>
      <div className="question-stem">
        <span className="question-num">{index + 1}.</span>
        <span>{question.stem}</span>
        <span className="question-type">
          {QUESTION_TYPE_LABELS[question.type] ?? question.type} · {question.score} 分
        </span>
        {kp ? (
          <button
            type="button"
            className={`kp-chip${focusKpId === kp.id ? " active" : ""}`}
            data-kp={kp.id}
            title={`在知识星图中定位「${kp.title}」`}
            onClick={() => onFocusKp(kp.id)}
          >
            <Star size={11} weight="fill" /> {kp.shortTitle}
          </button>
        ) : null}
        {graded ? (
          <span className={`q-result ${result.correct ? "correct" : "wrong"}`}>
            {result.correct ? <CheckCircle size={15} weight="fill" /> : <XCircle size={15} weight="fill" />}
            {result.correct ? `+${result.earned} 分` : `${result.earned} 分`}
          </span>
        ) : null}
      </div>

      {question.type === "choice" ? question.options.map((option) => (
        <label className="practice-option" key={option} data-option={option}>
          <input
            type="radio"
            name={`pq-${question.id}`}
            checked={value === option}
            onChange={() => onAnswer(question.id, option)}
          />
          {option}
        </label>
      )) : null}

      {question.type === "truefalse" ? (
        <div className="tf-options">
          {[{ v: "true", label: "正确" }, { v: "false", label: "错误" }].map((option) => (
            <label key={option.v} data-option={option.v} className="practice-option">
              <input
                type="radio"
                name={`pq-${question.id}`}
                checked={value === option.v}
                onChange={() => onAnswer(question.id, option.v)}
              />
              {option.label}
            </label>
          ))}
        </div>
      ) : null}

      {question.type === "fill" ? (
        <input
          className="practice-fill-input"
          placeholder="输入你的答案"
          value={value}
          onChange={(event) => onAnswer(question.id, event.target.value)}
        />
      ) : null}

      {graded ? (
        <div className="q-analysis">
          <Lightbulb size={15} />
          <div>
            {!result.correct ? (
              <span className="q-reference">参考答案：{referenceAnswerOf(question)}</span>
            ) : null}
            {question.analysis}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function referenceAnswerOf(question) {
  if (question.type === "choice") return question.answer;
  if (question.type === "truefalse") return question.answer === "true" ? "正确" : "错误";
  if (question.type === "fill") {
    return (question.keywords ?? []).map((group) => (Array.isArray(group) ? group[0] : group)).join("、");
  }
  return "";
}

/* ==================== 教师作业（原有功能，保持不变） ==================== */

function TeacherAssignments() {
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
    active && detail ? (
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
    )
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
