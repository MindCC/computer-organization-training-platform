import { ArrowsClockwise, Lightbulb, SpinnerGap, Trash } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../apiClient.js";
import { boxClipPath } from "../../photoMistakes.js";
import { personalLearningPath } from "../../personalLearningApi.js";

/** 拍照错题的专属工具：原题照片、AI 讲错因、同类题轮次练习、已掌握切换、删除。 */
export function PhotoMistakeTools({ item, readOnly = false, onChanged }) {
  const clip = boxClipPath(item.box);
  const imageUrl = personalLearningPath(`/api/student/photo-imports/${item.importId}/image/${item.imageIndex}`);
  return (
    <div className="photo-tools" data-testid="photo-tools">
      <figure className="photo-tools-figure">
        <img className="photo-tools-image" src={imageUrl} alt="原题拍照" style={clip ? { clipPath: clip } : undefined} />
        <figcaption>{item.knowledgeLabel ? `知识点：${item.knowledgeLabel}` : "原题拍照"}</figcaption>
      </figure>
      {readOnly ? null : (
        <div className="photo-tools-actions">
          <ExplainPanel item={item} onChanged={onChanged} />
          <SimilarPanel item={item} onChanged={onChanged} />
          <MasteredToggle item={item} onChanged={onChanged} />
          <DeleteMistake item={item} onChanged={onChanged} />
        </div>
      )}
    </div>
  );
}

function ExplainPanel({ item, onChanged }) {
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [explanation, setExplanation] = useState(null);
  async function load() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const data = await api.explainPhotoMistake(item.photoMistakeId, { consent });
      setExplanation(data.explanation);
      if (!data.cached) onChanged?.({ silent: true });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return (
    <section className="photo-tool-block">
      <button type="button" className="ghost-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Lightbulb size={15} /> {open ? "收起错因讲解" : item.hasAiExplanation ? "查看 AI 错因讲解" : "讲错因"}
      </button>
      {open ? (
        <div className="photo-tool-body">
          {explanation ? (
            <dl className="photo-explain">
              {explanation.focus ? <div><dt>这题考什么</dt><dd>{explanation.focus}</dd></div> : null}
              {explanation.pitfalls ? <div><dt>容易错在哪</dt><dd>{explanation.pitfalls}</dd></div> : null}
              <div><dt>正确思路</dt><dd>{explanation.solution}</dd></div>
              {explanation.studyAdvice ? <div><dt>复习建议</dt><dd>{explanation.studyAdvice}</dd></div> : null}
            </dl>
          ) : (
            <>
              <label className="photo-consent">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={busy} />
                我了解：生成讲解时会把这道题的题干与我的作答发送给课程 AI。
              </label>
              <button type="button" className="primary-button" onClick={load} disabled={busy || !consent}>
                {busy ? "正在生成…" : "生成错因讲解"}
              </button>
            </>
          )}
          {busy && !explanation ? <p className="photo-tool-status" role="status"><SpinnerGap size={15} className="spin" /> AI 正在分析错因…</p> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function SimilarPanel({ item, onChanged }) {
  const [open, setOpen] = useState(false);
  const [rounds, setRounds] = useState(null);
  const [activeRound, setActiveRound] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submissionRef = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    api.photoMistakeRounds(item.photoMistakeId)
      .then((data) => {
        if (cancelled) return;
        setRounds(data.rounds);
        setActiveRound((current) => current ?? [...data.rounds].reverse().find((round) => !round.answers) ?? null);
      })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [open, item.photoMistakeId]);

  async function generate(consent) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const data = await api.generatePhotoSimilar(item.photoMistakeId, { consent, clientSubmissionId: submissionRef.current });
      const updated = await api.photoMistakeRounds(item.photoMistakeId);
      setRounds(updated.rounds);
      setActiveRound(data.round);
      submissionRef.current = crypto.randomUUID();
    } catch (err) {
      setError(err.message);
      submissionRef.current = crypto.randomUUID();
    } finally { setBusy(false); }
  }

  async function refresh() {
    const updated = await api.photoMistakeRounds(item.photoMistakeId);
    setRounds(updated.rounds);
  }

  const answeredCount = (rounds ?? []).filter((round) => round.allCorrect === true).length;
  return (
    <section className="photo-tool-block">
      <button type="button" className="ghost-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <ArrowsClockwise size={15} /> {open ? "收起同类题" : "出同类题"}
      </button>
      {open ? (
        <div className="photo-tool-body">
          <p className="photo-tool-hint">AI 按同一知识点出 3 道变式题。连续两轮全部答对，这道题会自动标记为「已掌握」。</p>
          {rounds?.length ? (
            <ol className="photo-round-list">
              {rounds.map((round, index) => (
                <li key={round.id}>
                  <button type="button" className="ghost-button" aria-pressed={activeRound?.id === round.id} onClick={() => setActiveRound(round)}>
                    第 {index + 1} 轮 · {round.allCorrect === null ? "未作答" : round.allCorrect ? "全对 ✓" : "有错误"}
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
          {activeRound && !activeRound.answers ? (
            <RoundAnswerForm round={activeRound} onDone={async (result) => {
              await refresh();
              setActiveRound((current) => current ? { ...current, answers: true, results: result.results, allCorrect: result.allCorrect } : current);
              onChanged?.();
            }} />
          ) : null}
          {activeRound?.answers ? <RoundResult round={activeRound} /> : null}
          {answeredCount > 0 ? <p className="photo-tool-status">已累计 {answeredCount} 轮全对。</p> : null}
          <GenerateButton busy={busy} onGenerate={generate} hasRounds={Boolean(rounds?.length)} />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function GenerateButton({ busy, onGenerate, hasRounds }) {
  const [consent, setConsent] = useState(false);
  return (
    <div className="photo-generate">
      <label className="photo-consent">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={busy} />
        我了解：出题时会把这道题的题干与知识点发送给课程 AI。
      </label>
      <button type="button" className="primary-button" onClick={() => onGenerate(consent)} disabled={busy || !consent}>
        {busy ? "正在出题…" : hasRounds ? "再出新一轮" : "生成同类题"}
      </button>
    </div>
  );
}

function RoundAnswerForm({ round, onDone }) {
  const [answers, setAnswers] = useState({});
  const [selfAssessments, setSelfAssessments] = useState({});
  const [aiJudge, setAiJudge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasShort = round.questions.some((question) => question.qtype === "short_answer");
  const complete = round.questions.every((_, index) => String(answers[index] ?? "").trim());
  async function submit(event) {
    event.preventDefault();
    if (busy || !complete) return;
    setBusy(true); setError("");
    try {
      const result = await api.answerPhotoRound(round.id, { answers, selfAssessments, aiJudgeConsent: hasShort && !Object.keys(selfAssessments).length ? aiJudge : undefined });
      await onDone(result);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return (
    <form className="photo-round-form" onSubmit={submit} data-testid="photo-round-form">
      {round.questions.map((question, index) => (
        <fieldset key={index} className="photo-round-question">
          <legend>第 {index + 1} 题（{{ choice: "选择题", truefalse: "判断题", fill: "填空题", short_answer: "简答题" }[question.qtype]}）</legend>
          <p className="photo-round-stem">{question.stem}</p>
          {question.qtype === "choice" ? question.options.map((option) => (
            <label key={option} className="photo-round-option">
              <input type="radio" name={`round-${round.id}-${index}`} checked={answers[index] === option} onChange={() => setAnswers((value) => ({ ...value, [index]: option }))} /> {option}
            </label>
          )) : null}
          {question.qtype === "truefalse" ? [["true", "正确"], ["false", "错误"]].map(([value, label]) => (
            <label key={value} className="photo-round-option">
              <input type="radio" name={`round-${round.id}-${index}`} checked={answers[index] === value} onChange={() => setAnswers((current) => ({ ...current, [index]: value }))} /> {label}
            </label>
          )) : null}
          {question.qtype === "fill" ? <input type="text" maxLength={2000} value={answers[index] ?? ""} onChange={(event) => setAnswers((value) => ({ ...value, [index]: event.target.value }))} aria-label={`第 ${index + 1} 题答案`} /> : null}
          {question.qtype === "short_answer" ? (
            <>
              <textarea rows={3} maxLength={2000} value={answers[index] ?? ""} onChange={(event) => setAnswers((value) => ({ ...value, [index]: event.target.value }))} aria-label={`第 ${index + 1} 题作答`} />
              <div className="photo-round-self">
                <span>简答题判分：</span>
                {[["correct", "我答对了"], ["wrong", "我答错了"]].map(([value, label]) => (
                  <label key={value}><input type="radio" name={`self-${round.id}-${index}`} checked={selfAssessments[index] === value} onChange={() => setSelfAssessments((current) => ({ ...current, [index]: value }))} /> {label}</label>
                ))}
              </div>
            </>
          ) : null}
        </fieldset>
      ))}
      {hasShort && !Object.keys(selfAssessments).length ? (
        <label className="photo-consent">
          <input type="checkbox" checked={aiJudge} onChange={(event) => setAiJudge(event.target.checked)} disabled={busy} />
          简答题交给 AI 判分（会把题目与我的作答发送给课程 AI）；不自评时必须勾选。
        </label>
      ) : null}
      <button type="submit" className="primary-button" disabled={busy || !complete}>{busy ? "正在判分…" : "提交并判分"}</button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </form>
  );
}

function RoundResult({ round }) {
  const results = round.results ?? {};
  return (
    <div className="photo-round-result" data-testid="photo-round-result">
      <p className={round.allCorrect ? "photo-round-pass" : "photo-round-fail"} role="status">
        {round.allCorrect ? "本轮全部答对！" : "本轮还有错误，对照解析再练一轮。"}
      </p>
      {round.questions.map((question, index) => (
        <div key={index} className="photo-round-result-item">
          <strong>第 {index + 1} 题：{results[index]?.correct ? "✓ 答对" : "✗ 答错"}</strong>
          <span>参考答案：{question.answer || "见解析"}</span>
          {results[index]?.note ? <span>评语:{results[index].note}</span> : null}
          {question.analysis ? <span>解析：{question.analysis}</span> : null}
        </div>
      ))}
    </div>
  );
}

function MasteredToggle({ item, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function toggle() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api.setPhotoMastered(item.photoMistakeId, !item.resolved);
      await onChanged?.();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return (
    <section className="photo-tool-block photo-mastered">
      <button type="button" className="ghost-button" onClick={toggle} disabled={busy} aria-pressed={item.resolved}>
        {item.resolved ? "取消「已掌握」" : "手动标为「已掌握」"}
      </button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}

function DeleteMistake({ item, onChanged }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api.deletePhotoMistake(item.photoMistakeId);
      await onChanged?.();
    } catch (err) { setError(err.message); setBusy(false); }
  }
  return (
    <section className="photo-tool-block photo-delete">
      {confirming ? (
        <span className="photo-delete-confirm">
          确认删除这道拍照错题？
          <button type="button" className="ghost-button" onClick={remove} disabled={busy}>{busy ? "正在删除…" : "确认删除"}</button>
          <button type="button" className="ghost-button" onClick={() => setConfirming(false)} disabled={busy}>取消</button>
        </span>
      ) : (
        <button type="button" className="ghost-button" onClick={() => setConfirming(true)}><Trash size={14} /> 删除</button>
      )}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}
