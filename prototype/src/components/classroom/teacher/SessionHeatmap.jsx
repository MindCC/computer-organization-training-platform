import { useState, useEffect } from "react";
import { WarningCircle, ClockCountdown, ChartBar } from "@phosphor-icons/react";
import { api } from "../../../apiClient.js";

export function SessionHeatmap({ sessionId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!sessionId) return;
    api.assignmentAnalytics; // just to verify api is available
    fetch(`/api/teacher/sessions/${sessionId}/analytics`).then(r => r.json()).then(setData).catch(() => {});
  }, [sessionId]);

  if (!data) return null;

  const { heatmap, bottleneck, repeatedErrors, inactive } = data;

  return (
    <div className="session-heatmap">
      <div className="heatmap-header"><ChartBar size={18} /><strong>阶段热力图</strong></div>
      <div className="heatmap-grid">
        {heatmap.map((h) => (
          <div className={`heatmap-bar ${h.stageId === bottleneck?.stageId ? "bottleneck" : ""}`} key={h.stageId}>
            <span className="heatmap-label">{h.stageTitle}</span>
            <div className="heatmap-track">
              <div className="heatmap-fill completed" style={{width:`${h.pctCompleted}%`}} />
              <div className="heatmap-fill in-progress" style={{width:`${h.pctInProgress}%`,left:`${h.pctCompleted}%`}} />
            </div>
            <span className="heatmap-count">{h.inProgress} 进行 / {h.completed} 完成</span>
          </div>
        ))}
      </div>

      {bottleneck && (
        <div className="heatmap-alert">
          <WarningCircle size={16} /> 瓶颈阶段：「{bottleneck.stageTitle}」— {bottleneck.inProgress} 人卡在此阶段
        </div>
      )}

      {repeatedErrors.length > 0 && (
        <div className="heatmap-errors">
          <strong>重复错误</strong>
          {repeatedErrors.map((e) => (
            <span key={e.stageId} className="error-chip">{e.stageTitle} ×{e.count}</span>
          ))}
        </div>
      )}

      {inactive.length > 0 && (
        <div className="heatmap-inactive">
          <ClockCountdown size={14} /> {inactive.length} 名学生超过 10 分钟无操作
        </div>
      )}
    </div>
  );
}
