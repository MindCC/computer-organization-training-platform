import { Printer, X } from "@phosphor-icons/react";
import { useMemo } from "react";
import { createPortal } from "react-dom";
import { buildReviewPaperModel } from "../../photoMistakes.js";

/**
 * 组复习卷：把勾选的错题整理成打印友好的卷子（答题留白 + 末尾参考答案）。
 * 打印时通过 portal 把卷子渲染到 body 直属节点，@media print 隐藏应用其余部分。
 */
export function ReviewPaperDialog({ items, studentName = "", onClose }) {
  const paper = useMemo(() => buildReviewPaperModel(items, { studentName }), [items, studentName]);
  return (
    <>
      <div className="photo-dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <div className="photo-dialog review-paper-dialog" role="dialog" aria-modal="true" aria-label="错题复习卷预览">
          <header className="photo-dialog-header">
            <h2><Printer size={20} weight="duotone" /> 错题复习卷（{paper.questionCount} 题）</h2>
            <div className="photo-dialog-header-actions">
              <button type="button" className="primary-button" onClick={() => window.print()}><Printer size={16} /> 打印 / 另存 PDF</button>
              <button type="button" className="ghost-button" onClick={onClose} aria-label="关闭"><X size={16} /></button>
            </div>
          </header>
          <div className="review-paper-preview">
            <PaperBody paper={paper} />
          </div>
        </div>
      </div>
      {createPortal(<div className="review-paper-print" aria-hidden="true"><PaperBody paper={paper} /></div>, document.body)}
    </>
  );
}

function PaperBody({ paper }) {
  return (
    <div className="review-paper">
      <header className="review-paper-head">
        <h1>{paper.title}</h1>
        <p className="review-paper-meta">
          <span>姓名：{paper.studentName || "＿＿＿＿＿＿"}</span>
          <span>日期：＿＿＿＿年＿＿月＿＿日</span>
          <span>共 {paper.questionCount} 题</span>
        </p>
      </header>
      <ol className="review-paper-questions">
        {paper.questions.map((question) => (
          <li key={question.number} className="review-paper-question">
            <p className="review-paper-stem">
              <strong>{question.number}.</strong> <span className="review-paper-tag">[{question.chapterTitle}{question.knowledgeLabel ? ` · ${question.knowledgeLabel}` : ""} · {question.typeLabel}]</span> {question.stem}
            </p>
            {question.options.length ? (
              <ul className="review-paper-options">
                {question.options.map((option, index) => <li key={index}>{String.fromCharCode(65 + index)}. {option}</li>)}
              </ul>
            ) : null}
            <div className="review-paper-space" style={{ "--lines": question.answerLines }}>
              {Array.from({ length: question.answerLines }, (_, index) => <span key={index} className="review-paper-line" />)}
            </div>
          </li>
        ))}
      </ol>
      <section className="review-paper-answers">
        <h2>参考答案与解析</h2>
        <ol>
          {paper.answers.map((answer) => (
            <li key={answer.number}>
              <strong>{answer.number}.</strong> {answer.referenceAnswer}
              {answer.wrongAnswer ? <p className="review-paper-wrong">当时的错误作答：{answer.wrongAnswer}</p> : null}
              {answer.explanation ? <p className="review-paper-explain">解析：{answer.explanation}</p> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
