import { useState, useEffect, useMemo, useRef } from "react";
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
  questionsForChapter,
  QUESTION_TYPE_LABELS,
} from "../assignmentQuestions.js";
import { CHAPTER_CORE_POINTS, knowledgePointOf } from "../knowledgePoints.js";
import { KnowledgeGraph } from "./KnowledgeGraph.jsx";
import "./assignmentsPractice.css";
import "./mistakeBook.css";

/**
 * 课后作业 = 按章练习（自动题库 + 知识点标注 + 知识星图） + 教师作业（原有流程）。
 * 正式判分与错题同步到账户，本机仅保存按账号隔离的未提交草稿。
 */
export function StudentAssignments({ userId, destination, navigateToChallenge, onOpenMistakes }) {
  const [mode, setMode] = useState(destination?.source === "assignment" ? "teacher" : "practice");
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
      <div className="study-page-heading"><h2><Notebook size={20} /> 课后作业</h2><button className="ghost-button" onClick={onOpenMistakes} type="button">打开错题本</button></div>
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
      {mode === "practice" ? <ChapterPractice key={userId} userId={userId} destination={destination} progress={progress} navigateToChallenge={navigateToChallenge} onOpenMistakes={onOpenMistakes} /> : <TeacherAssignments userId={userId} destination={destination} onOpenMistakes={onOpenMistakes} />}
    </div>
  );
}

/* ==================== 按章练习 ==================== */

function loadPracticeStore(userId) {
  try {
    const raw = localStorage.getItem(`zcyl:chapter-practice-v2:${userId}`);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      answers: parsed?.answers && typeof parsed.answers === "object" ? parsed.answers : {},
      graded: parsed?.graded && typeof parsed.graded === "object" ? parsed.graded : {},
      dirty: parsed?.dirty && typeof parsed.dirty === "object" ? parsed.dirty : {},
    };
  } catch {
    return { answers: {}, graded: {}, dirty: {} };
  }
}

function savePracticeStore(userId, store) {
  try {
    localStorage.setItem(`zcyl:chapter-practice-v2:${userId}`, JSON.stringify(store));
  } catch {
    // 隐私模式写不进去就只保留本次会话内的状态
  }
}

function shortChapterTitle(title) {
  return title.replace(/^第.+章\s*/, "");
}

function ChapterPractice({ progress, userId, destination, navigateToChallenge, onOpenMistakes }) {
  const [chapterId, setChapterId] = useState(destination?.chapterId ?? COURSE_CHAPTERS[0].id);
  const [focusedQuestion, setFocusedQuestion] = useState(destination?.source === "practice" ? destination.questionId : null);
  const [store, setStore] = useState(() => loadPracticeStore(userId));
  const storeRef = useRef(store);
  const submissionRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [syncVersion, setSyncVersion] = useState(0);
  const [graphOpen, setGraphOpen] = useState(false);
  const [focusKpId, setFocusKpId] = useState(null);

  const questions = useMemo(() => questionsForChapter(chapterId), [chapterId]);
  const visibleQuestions = focusedQuestion ? questions.filter(question => question.id === focusedQuestion) : questions;

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    api.chapterPractice().then(remote => {
      if (cancelled) return;
      const local = storeRef.current, answers = {...remote.answers}, graded = {...remote.graded};
      for (const id of Object.keys(local.dirty)) {
        answers[id] = local.answers[id] ?? "";
        if (answers[id] !== remote.answers[id]) delete graded[id];
      }
      patchStore({answers,graded,dirty:local.dirty});
      setReady(true); setError("");
    }).catch(err => { if (!cancelled) setError(`同步失败：${err.message}。草稿已保留，请重试同步后提交。`); });
    return () => { cancelled = true; };
  }, [userId, syncVersion]);

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
    storeRef.current = next;
    setStore(next);
    savePracticeStore(userId, next);
  }

  function setAnswer(questionId, value) {
    const graded = {...store.graded}; delete graded[questionId];
    patchStore({ ...store, answers: { ...store.answers, [questionId]: value }, graded, dirty:{...store.dirty,[questionId]:true} });
  }

  async function submitChapter() {
    if (!ready || submitting) return;
    const answers = Object.fromEntries(visibleQuestions.map(q => [q.id,store.answers[q.id] ?? ""]));
    const signature = JSON.stringify({chapterId,answers});
    if (submissionRef.current?.signature !== signature) submissionRef.current = {signature,id:crypto.randomUUID()};
    setSubmitting(true); setError("");
    try {
      const response = await api.submitChapterPractice({chapterId,answers,clientSubmissionId:submissionRef.current.id});
      const current = storeRef.current, dirty = {...current.dirty}, graded = {...current.graded};
      for (const [id,result] of Object.entries(response.results)) {
        if (current.answers[id] === answers[id] || (!current.answers[id] && !answers[id])) { graded[id] = result; delete dirty[id]; }
      }
      patchStore({...current,graded,dirty});
    } catch (err) { setError(`提交失败：${err.message}。答案已保留，可以重试。`); }
    finally { setSubmitting(false); }
  }

  function resetChapter() {
    submissionRef.current = null;
    const answers = { ...store.answers };
    const graded = { ...store.graded };
    const dirty = {...store.dirty};
    for (const question of visibleQuestions) {
      delete answers[question.id];
      delete graded[question.id];
      dirty[question.id] = true;
    }
    patchStore({ answers, graded, dirty });
  }

  function focusKnowledgePoint(kpId) {
    setFocusKpId(kpId);
    setGraphOpen(true);
  }

  function enterChallenge(challengeId) {
    navigateToChallenge(challengeId);
  }

  function pickQuestion(question) {
    if (question?.chapterId && question.chapterId !== chapterId) setChapterId(question.chapterId);
    setFocusedQuestion(question?.id ?? null);
    setGraphOpen(false);
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
            onSelect={() => { setChapterId(chapter.id); setFocusedQuestion(null); }}
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
          <button type="button" className="ghost-button" onClick={resetChapter} disabled={submitting}>
            <ArrowCounterClockwise size={15} /> {focusedQuestion ? "重做此题" : "重做本章"}
          </button>
          <button type="button" className="primary-button practice-submit" onClick={submitChapter} disabled={!ready || submitting}>
            {submitting ? "正在同步判分…" : focusedQuestion ? "提交此题订正" : "提交并判分"}
          </button>
        </div>
      </div>

      {error ? <div className="study-sync-error" role="alert">{error}{!ready ? <button className="ghost-button" type="button" onClick={() => setSyncVersion(v => v+1)}>重试同步</button> : null}</div> : <p className="study-sync-status" role="status">{ready ? "判分结果已同步到账户，答错的题目自动进入错题本。" : "正在同步账户练习记录…"}</p>}
      {focusedQuestion ? <div className="study-focus-strip"><strong>当前定位：{destination?.questionId === focusedQuestion ? "错题重练" : "知识点练习"}</strong><div><button type="button" className="ghost-button" onClick={() => setFocusedQuestion(null)}>查看本章全部题目</button><button type="button" className="ghost-button" onClick={onOpenMistakes}>返回错题本</button></div></div> : null}

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
        {visibleQuestions.map((question) => (
          <PracticeQuestion
            key={question.id}
            question={question}
            index={questions.indexOf(question)}
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

function TeacherAssignments({ userId,destination, onOpenMistakes }) {
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [active, setActive] = useState(null);
  const [detail, setDetail] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [focusedQuestion, setFocusedQuestion] = useState(destination?.source === "assignment" ? destination.questionId : null);
  const [loading,setLoading]=useState(true),[opening,setOpening]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
  const alive=useRef(true),openVersion=useRef(0),pending=useRef(false);
  const draftKey=id=>`zcyl:assignment-draft:${userId}:${id}`;
  function storeDraft(id,value){try{if(value)localStorage.setItem(draftKey(id),JSON.stringify(value));else localStorage.removeItem(draftKey(id));}catch{setMessage('浏览器无法保留草稿，请使用“保存草稿”同步到服务器。');}}

  useEffect(() => {
    alive.current=true;load();
    if (destination?.source === "assignment") openAssignment(destination.assignmentId);
    return()=>{alive.current=false;openVersion.current++;};
  }, []);

  async function load() {
    setLoading(true);setError('');
    try{const [a, s] = await Promise.all([api.studentAssignments(), api.studentSubmissions()]);
    if(!alive.current)return;setAssignments(a.assignments ?? []);setSubmissions(s.submissions ?? []);
    }catch(err){if(alive.current)setError(`作业列表加载失败：${err.message}`);}finally{if(alive.current)setLoading(false);}
  }

  async function openAssignment(id) {
    const version=++openVersion.current;setOpening(true);setError('');setMessage('');
    try{const r = await api.studentAssignmentDetail(id);
    if(!alive.current||version!==openVersion.current)return;
    setDetail(r);
    setActive(id);
    const existing = Object.fromEntries((r.submission?.answers ?? []).map((answer) => [answer.questionId, answer.value]));
    let local=null;try{local=JSON.parse(localStorage.getItem(draftKey(id))??'null');}catch{}
    const editable=!['submitted','graded'].includes(r.submission?.status);
    setAnswers(editable&&local&&typeof local==='object'&&!Array.isArray(local)?{...existing,...local}:existing);
    setError("");
    }catch(err){if(alive.current&&version===openVersion.current)setError(`作业详情加载失败：${err.message}`);}finally{if(alive.current&&version===openVersion.current)setOpening(false);}
  }

  function setAnswer(qId, val) { const next={...answers,[qId]:val};setAnswers(next);storeDraft(active,next);setMessage('输入已保留在本机，保存草稿可同步到服务器。'); }

  async function saveDraft() {
    if(pending.current)return;pending.current=true;setSaving(true);setError('');
    const ans = Object.entries(answers).map(([qId, value]) => ({ questionId: Number(qId), value }));
    try {
      await api.saveAssignmentDraft(active, ans);
      setError("");
      storeDraft(active,null);setMessage('草稿已保存到服务器。');
    } catch (requestError) {
      setError("保存草稿失败：" + requestError.message);
    }finally{pending.current=false;setSaving(false);}
  }

  async function submit() {
    if(pending.current)return;pending.current=true;
    setSubmitting(true);
    const ans = Object.entries(answers).map(([qId, value]) => ({ questionId: Number(qId), value }));
    try {
      await api.submitAssignment(active, ans);
      storeDraft(active,null);
      setActive(null); setDetail(null);
      await load();
    } catch (requestError) {
      setError("提交失败：" + requestError.message);
    } finally {
      setSubmitting(false);
      pending.current=false;
    }
  }

  const subMap = new Map(submissions.map((s) => [s.assignment_id, s]));

  return (
    active && detail ? (
      <AssignmentView detail={detail} answers={answers} setAnswer={setAnswer} error={error} message={message} saving={saving} onSave={saveDraft} onSubmit={submit} submitting={submitting} focusedQuestion={focusedQuestion} onShowAll={() => setFocusedQuestion(null)} onOpenMistakes={onOpenMistakes} onBack={() => { openVersion.current++;setActive(null); setDetail(null); setFocusedQuestion(null); }} />
    ) : (
      <div className="assignment-cards">
        {error ? <div className="form-error" role="alert"><p>{error}</p><button className="ghost-button" type="button" onClick={load}>重试加载教师作业</button></div> : null}
        {(loading||opening)&&<p role="status">{opening?'正在打开作业…':'正在读取作业列表…'}</p>}
        {assignments.map((a) => {
          const sub = subMap.get(a.id);
          return (
            <button type="button" className="assignment-card" key={a.id} onClick={() => openAssignment(a.id)}>
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
        {!loading&&!error&&assignments.length === 0 && <p className="empty-state">暂无教师作业，可以先完成按章练习。</p>}
      </div>
    )
  );
}

function AssignmentView({ detail, answers, setAnswer, error, message, saving, onSave, onSubmit, submitting, onBack, focusedQuestion, onShowAll, onOpenMistakes }) {
  const { questions, submission } = detail;
  const isSubmitted = submission?.status === "submitted" || submission?.status === "graded";

  return (
    <div className="assignment-view">
      <div className="assignment-view-header">
        <button type="button" className="ghost-button" disabled={saving||submitting} onClick={onBack}>← 返回</button>
        <strong>{detail.title}</strong>
        <button className="ghost-button" type="button" onClick={onOpenMistakes}>返回错题本</button>
        {submission?.status === "graded" && <span className="score-badge">{submission.total_score} / {detail.total_score}</span>}
      </div>
      {focusedQuestion ? <div className="study-focus-strip"><strong>正在回看错题原作业</strong><button type="button" className="ghost-button" onClick={onShowAll}>查看完整作业</button></div> : null}
      {submission?.feedback ? <p className="study-teacher-feedback">教师反馈：{submission.feedback}</p> : null}
      {isSubmitted ? <div className="study-focus-strip"><span>作业已提交，客观题订正请进入错题本；简答题结合教师反馈复习。</span><button type="button" className="ghost-button" onClick={onOpenMistakes}>查看作业错题</button></div> : null}
      <div className="question-list">
        {questions.filter(q => !focusedQuestion || q.id === focusedQuestion).map((q) => (
          <div className="question-card" key={q.id} data-qid={q.id}>
            <div className="question-stem">
              <span className="question-num">{questions.indexOf(q) + 1}.</span>
              <span>{q.stem}</span>
              <span className="question-type">{q.type === "choice" ? "单选" : q.type === "truefalse" ? "判断" : q.type === "fill" ? "填空" : "简答"} · {q.score} 分</span>
            </div>
            {isSubmitted && submission.answers?.find(answer => answer.questionId === q.id)?.score != null ? <p className="study-question-grade">本题得分：{submission.answers.find(answer => answer.questionId === q.id).score} / {q.score}</p> : null}
            {q.type === "choice" && q.options?.map((opt, j) => (
              <label className="choice-option" key={j}>
                <input aria-label={`选择题选项：${opt}`} type="radio" name={`q${q.id}`} checked={answers[q.id] === opt} onChange={() => setAnswer(q.id, opt)} disabled={isSubmitted||submitting||saving} />
                {opt}
              </label>
            ))}
            {q.type === "truefalse" && (
              <div className="tf-options">
                {["true", "false"].map((v) => (
                  <label key={v}><input type="radio" name={`q${q.id}`} checked={answers[q.id] === v} onChange={() => setAnswer(q.id, v)} disabled={isSubmitted||submitting||saving} />{v === "true" ? "正确" : "错误"}</label>
                ))}
              </div>
            )}
            {(q.type === "fill" || q.type === "short_answer") && (
              <input placeholder="输入你的答案" value={answers[q.id] ?? ""} onChange={(e) => setAnswer(q.id, e.target.value)} disabled={isSubmitted||submitting||saving} />
            )}
          </div>
        ))}
      </div>
      {!isSubmitted && (
        <div className="assignment-actions">
          <button type="button" className="ghost-button" disabled={saving||submitting} onClick={onSave}>{saving?'正在保存…':'保存草稿'}</button>
          <button type="button" className="primary-button" onClick={onSubmit} disabled={submitting||saving}>{submitting ? "提交中..." : "提交作业"}</button>
        </div>
      )}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message&&!isSubmitted&&<p className="study-focus-strip" role="status">{message}</p>}
    </div>
  );
}
