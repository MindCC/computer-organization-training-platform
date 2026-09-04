import { useCallback, useState } from "react";
import { Sparkle, Spinner } from "@phosphor-icons/react";
import { api } from "../apiClient.js";

/**
 * AI 实验助教面板：学生一键请求讲解，
 * 服务端结合关卡数据 + 当前连线/反馈调用 LLM（不可用时降级为本地建议）。
 */
export function LabAssistantPanel({ challenge, connections, inputState, feedback, realtimeDiagnostics }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const requestHint = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.labAssistantHint({
        challengeId: challenge.id,
        connections,
        inputState,
        feedback,
        realtimeDiagnostics,
      });
      setReport(result);
    } catch (err) {
      setError(err?.message ?? "AI 助教暂时无法响应，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }, [challenge.id, connections, inputState, feedback, realtimeDiagnostics]);

  const hint = report?.hint;

  return (
    <section className="lab-assistant-panel" aria-label="AI 实验助教">
      <div className="lab-assistant-head">
        <Sparkle size={18} weight="fill" />
        <strong>AI 实验助教</strong>
        <button className="lab-assistant-button" disabled={loading} onClick={requestHint} type="button">
          {loading ? <><Spinner size={14} className="spin" /> 分析中…</> : "请 AI 老师讲解一下"}
        </button>
      </div>

      {error ? <p className="lab-assistant-error">{error}</p> : null}

      {hint ? (
        <div className="lab-assistant-body">
          {report.source === "fallback" ? <p className="lab-assistant-note">（AI 服务未配置或超时，以下为本地规则建议）</p> : null}
          <p className="lab-assistant-concept">{hint.conceptReview}</p>
          {hint.errorAnalysis.length > 0 ? (
            <div className="lab-assistant-block">
              <span>错误分析</span>
              <ul>{hint.errorAnalysis.map((item, i) => <li key={i}>{item}</li>)}</ul>
            </div>
          ) : null}
          {hint.nextStepHints.length > 0 ? (
            <div className="lab-assistant-block">
              <span>下一步建议</span>
              <ol>{hint.nextStepHints.map((item, i) => <li key={i}>{item}</li>)}</ol>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="lab-assistant-idle">连线卡住了？点击按钮，AI 老师会结合你当前的电路和检测反馈给出针对性讲解。</p>
      )}
    </section>
  );
}
