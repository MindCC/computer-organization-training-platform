import { useState, useEffect } from "react";
import { SessionSetupPanel } from "../classroom/teacher/SessionSetupPanel.jsx";
import { LiveSessionDashboard, EndConfirmation } from "../classroom/teacher/LiveSessionDashboard.jsx";
import { SessionStudentGrid } from "../classroom/teacher/SessionStudentGrid.jsx";
import { SessionReportPanel } from "../classroom/teacher/SessionReportPanel.jsx";
import { SessionHeatmap } from "../classroom/teacher/SessionHeatmap.jsx";

/** 课堂指挥中心：创建课堂任务并驱动"草稿 → 开课 → 暂停/恢复 → 结束"四阶段循环。 */
export function ClassroomCommandCenter({ teacherSession, statistics = false, showSetup = true }) {
  const { viewModel, createSession, control, loadOverview, loadReport, lastUpdatedAt } = teacherSession ?? {};
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [report, setReport] = useState(null);

  const hasSession = viewModel?.active;
  const sessionId = viewModel?.sessionId;
  useEffect(() => { setReport(null); }, [sessionId]);

  return (
    <div className="classroom-command-center">
      {!hasSession ? (
        showSetup && <SessionSetupPanel
          onCreateSession={async (config) => {
            const session = await createSession(config);
            teacherSession?.setViewModel?.({ active: true, sessionId: session.id, status: "draft", title: session.title });
          }}
        />
      ) : (
        <>
          <LiveSessionDashboard
            viewModel={viewModel}
            onControl={async (action) => {
              if (action === "end") {
                setShowEndConfirm(true);
                return;
              }
              const result = await control(sessionId, action);
              if (action === "start") {
                loadOverview(sessionId);
              }
              return result;
            }}
            onRefresh={() => loadOverview(sessionId)}
            lastUpdatedAt={lastUpdatedAt}
          />

          {statistics && viewModel?.status !== "draft" && !viewModel?.ended && (
            <section>
              <SessionStudentGrid viewModel={viewModel} />
              <details className="statistics-details"><summary>课堂阶段热力图</summary><SessionHeatmap sessionId={sessionId} /></details>
            </section>
          )}

          {statistics && viewModel?.ended && (
            <details className="statistics-details" key={sessionId}>
              <summary>课堂报告 · 点击展开完成情况</summary>
              {report ? (
                <SessionReportPanel report={report} />
              ) : (
                <button
                  className="primary-button"
                  onClick={async () => {
                    const result = await loadReport(sessionId);
                    setReport(result.report ?? result);
                  }}
                  type="button"
                >
                  查看课堂报告
                </button>
              )}
            </details>
          )}

          <EndConfirmation
            visible={showEndConfirm}
            title={viewModel?.title}
            onConfirm={async () => {
              setShowEndConfirm(false);
              await control(sessionId, "end");
              const result = await loadReport(sessionId);
              setReport(result.report ?? result);
            }}
            onCancel={() => setShowEndConfirm(false)}
          />
        </>
      )}
    </div>
  );
}
