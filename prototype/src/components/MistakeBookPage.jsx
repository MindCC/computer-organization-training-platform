import { ArrowRight, BookOpen, Flame, Repeat, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useState, useRef } from "react";
import { api } from "../apiClient.js";
import { StudyMascot } from './ai/StudyMascot.jsx';
import "./mistakeBook.css";

const SOURCES = {lab:"实验室",practice:"题库练习",assignment:"课后作业",service:"维修诊断"};

export function MistakeBookPage({ navigateToChallenge, changeView, openStudyTarget }) {
  const [book, setBook] = useState(null);
  const [error, setError] = useState("");
  const [source, setSource] = useState("all");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [version,setVersion]=useState(0);

  useEffect(() => {
    let cancelled = false;
    setError('');
    api.mistakes()
      .then((data) => { if (!cancelled) setBook(data); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [version]);

  if (error) {
    return (
      <div className="mistakes-layout">
        <section className="section-panel">
          <div className="section-heading"><h1>错题本</h1></div>
          <p className="note-error" role="alert">{error}</p><button className="primary-button" type="button" onClick={()=>setVersion(v=>v+1)}>重试加载错题</button>
        </section>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="mistakes-layout">
        <section className="section-panel">
          <div className="section-heading"><h1>错题本</h1></div>
          <p className="empty-state">正在加载错题...</p>
        </section>
      </div>
    );
  }

  const { overview, items } = book;

  return (
    <div className="mistakes-layout">
      <section className="section-panel">
        <div className="section-heading">
          <div>
            <h1>错题本</h1>
            <p>实验室、题库练习、课后作业和维修诊断的错误集中回顾。查看原因、重练订正，再回到课程继续学习。</p>
          </div>
          <StudyMascot compact context={{source:'mistakes'}} suggestion="先用自己的话解释错误原因，再重练一次。小芯可以帮你理清不懂的概念。"/>
        </div>

        {overview.totalMistakes === 0 ? (
          <div className="empty-state">
            <BookOpen size={40} weight="duotone" />
            <strong>暂无错题</strong>
            <p>实验检测、题库判分和作业批改后，答错的内容会自动汇总到这里。</p>
            <button className="primary-button" onClick={() => changeView("lab")} type="button">去实验工作台</button>
            <button className="ghost-button" onClick={() => changeView("assignments")} type="button">去题库与课后作业</button>
          </div>
        ) : (
          <>
            <div className="metric-grid">
              <div className="metric">
                <WarningCircle size={20} weight="duotone" />
                <span>待巩固</span>
                <strong>{overview.pendingCount ?? items.length}</strong>
              </div>
              <div className="metric">
                <Repeat size={20} weight="duotone" />
                <span>已订正</span>
                <strong>{overview.resolvedCount ?? 0}</strong>
              </div>
              <div className="metric">
                <Flame size={20} weight="duotone" />
                <span>累计错误记录</span>
                <strong>{overview.totalMistakes}</strong>
              </div>
            </div>

            <div className="mistake-filters" aria-label="错题筛选">
              {[['all','全部来源'],...Object.entries(SOURCES)].map(([id,label]) => <button key={id} type="button" aria-pressed={source === id} onClick={() => setSource(id)}>{label} · {id === "all" ? items.length : overview.sourceCounts?.[id] ?? 0}</button>)}
              <button type="button" aria-pressed={pendingOnly} onClick={() => setPendingOnly(value => !value)}>只看待巩固</button>
            </div>
            <div className="mistake-group-list">
              {items.filter(item => (source === "all" || item.source === source) && (!pendingOnly || !item.resolved)).map((item) => (
                <article className="mistake-group" key={item.id} data-source={item.source} data-question-id={item.questionId}>
                  <div className="mistake-group-header">
                    <div>
                      <span className="mistake-source">{SOURCES[item.source]}</span>
                      <strong>{item.title ?? item.challengeTitle}</strong>
                      {item.source !== "practice" ? <span className="mistake-type">{item.errorType}</span> : null}
                    </div>
                    <div className="mistake-group-meta">
                      <span className={item.resolved ? "mistake-resolved" : "mistake-pending"}>{item.resolved ? "已订正" : "待巩固"}</span>
                      <span>{item.count} 次</span>
                      <small>{formatDate(item.lastSeen)}</small>
                    </div>
                  </div>
                  {item.stem ? <><h3 className="mistake-stem">{item.stem}</h3><dl className="mistake-answers"><div><dt>原作答</dt><dd>{formatAnswer(item.studentAnswer,item.type)}</dd></div><div><dt>参考答案</dt><dd>{item.referenceAnswer || "结合教师反馈复习"}</dd></div></dl><details className="mistake-explanation"><summary>查看解析与反馈</summary>{item.explanation ? <p>{item.explanation}</p> : null}{item.feedback ? <p>教师反馈：{item.feedback}</p> : null}{!item.explanation && !item.feedback ? <p>对照参考答案，再尝试一次。</p> : null}</details></> : null}
                  {item.source==='service'&&<p>{item.explanation}</p>}
                  {item.snapshots.length > 0 ? (
                    <div className="mistake-snapshot-row">
                      {item.snapshots.map((snap, index) => (
                        <span className="mistake-snapshot" key={index}>
                          第 {item.count - index} 次 · {snap.score} 分
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mistake-actions"><StudyMascot compact context={{source:'mistakes',questionId:item.source==='practice'?item.questionId:undefined,chapterId:item.chapterId}}/><button
                    className="ghost-button mistake-retry"
                    onClick={() => item.source === "lab" ? navigateToChallenge(item.challengeId) : openStudyTarget(item.navigation)}
                    type="button"
                  >
                    <ArrowRight size={14} /> {item.source === "lab" ? "回到该关卡练习" : item.source === "practice" ? "重练这道题" : item.source==='service'?'重做维修工单':"回看原作业"}
                  </button></div>
                  {item.source === "assignment" && item.type !== "short_answer" ? <AssignmentReview item={item} onUpdated={async () => setBook(await api.mistakes())} /> : null}
                </article>
              ))}
            </div>
            {!items.some(item => (source === "all" || item.source === source) && (!pendingOnly || !item.resolved)) ? <p className="empty-state">当前筛选下暂无错题。</p> : null}
          </>
        )}
      </section>
    </div>
  );
}

function formatAnswer(value,type) { return type === "truefalse" ? String(value) === "true" ? "正确" : String(value) === "false" ? "错误" : String(value) : String(value ?? ""); }

function AssignmentReview({item,onUpdated}) {
  const [value,setValue] = useState("");
  const [open,setOpen] = useState(false);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const requestRef = useRef(null);
  async function submit(event) {
    event.preventDefault(); if (busy || !value.trim()) return;
    if (requestRef.current?.value !== value) requestRef.current = {value,id:crypto.randomUUID()};
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await api.reviewAssignmentMistake({questionId:item.questionId,value,clientSubmissionId:requestRef.current.id});
      setMessage(response.correct ? "订正正确，已记录本次复习。" : "还需要再想一想，可以查看解析后重新作答。");
      try { await onUpdated(); } catch { setError("订正已保存，列表同步失败，请重新打开错题本查看。"); }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const options = item.type === "truefalse" ? [{value:"true",label:"正确"},{value:"false",label:"错误"}] : item.options.map(value => ({value,label:value}));
  return <div className="mistake-review"><button type="button" className="ghost-button" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? "收起订正" : item.resolved ? "再练一次" : "就地订正这道题"}</button>{open ? <form onSubmit={submit}><p>订正记录用于复习，原作业成绩保持不变。</p><fieldset disabled={busy}><legend>重新作答</legend>{item.type === "fill" ? <input aria-label="订正答案" type="text" value={value} maxLength={2000} onChange={event => setValue(event.target.value)} /> : options.map(option => <label key={option.value}><input type="radio" name={`review-${item.id}`} value={option.value} checked={value === option.value} onChange={() => setValue(option.value)} />{option.label}</label>)}</fieldset><button className="primary-button" type="submit" disabled={busy || !value.trim()}>{busy ? "正在记录…" : "提交订正"}</button>{message ? <p className="mistake-review-message" role="status">{message}</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}</form> : null}</div>;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("zh-CN");
}
