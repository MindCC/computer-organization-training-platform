import { useState, useEffect, useRef } from "react";
import { SessionSetupPanel } from "../classroom/teacher/SessionSetupPanel.jsx";
import { LiveSessionDashboard, EndConfirmation } from "../classroom/teacher/LiveSessionDashboard.jsx";
import { SessionStudentGrid, SessionStudentFeedback } from "../classroom/teacher/SessionStudentGrid.jsx";
import { SessionReportPanel } from "../classroom/teacher/SessionReportPanel.jsx";
import { SessionHeatmap } from "../classroom/teacher/SessionHeatmap.jsx";
import { TaskChainPresenter } from '../classroom/teacher/TaskChainPresenter.jsx';

/** 课堂指挥中心：创建课堂任务并驱动"草稿 → 开课 → 暂停/恢复 → 结束"四阶段循环。 */
export function ClassroomCommandCenter({ teacherSession, statistics = false, showSetup = true, lessonPlan = null, onPlanCreated, onOpenLab }) {
  const { viewModel, createSession, control, loadOverview, loadReport, lastUpdatedAt } = teacherSession ?? {};
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [editing,setEditing] = useState(false);
  const [selectedStudent,setSelectedStudent] = useState(null);
  const [presentationIndex,setPresentationIndex]=useState(null);
  const pending = useRef(false);
  async function runAction(action) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setOperationError('');
    try { return await action(); }
    catch (error) { setOperationError(`课堂操作失败：${error.message}。请重试。`); }
    finally { pending.current = false; setBusy(false); }
  }

  const hasSession = viewModel?.active && (!viewModel?.ended || !showSetup);
  const sessionId = viewModel?.sessionId;
  useEffect(() => { setReport(null); setShowEndConfirm(false); setOperationError(''); }, [sessionId]);

  return (
    <div className="classroom-command-center">
      {(operationError || teacherSession?.error) && <p className="form-error" role="alert">{operationError || `课堂同步失败：${teacherSession.error.message}。请点击刷新重试。`}</p>}
      {!hasSession || editing ? (
        showSetup && <SessionSetupPanel
          key={editing ? sessionId : 'new'}
          classId={teacherSession?.classId}
          onOpenLab={onOpenLab}
          initialSession={editing ? viewModel.session : null}
          onCancel={editing ? ()=>setEditing(false) : null}
          initialPlan={lessonPlan}
          onCreateSession={async (config) => {
            const session = editing ? await teacherSession.updateDraft(sessionId,config) : await createSession(config);
            teacherSession?.setViewModel?.({ active: true, sessionId: session.id, session, mission: config.taskChain, status: "draft", title: session.title, lessonPlan: config.lessonPlan ?? null });
            setEditing(false);
            onPlanCreated?.();
          }}
        />
      ) : (
        <>
          <LiveSessionDashboard
            onPresent={index=>setPresentationIndex(index)}
            onEdit={showSetup?()=>setEditing(true):undefined}
            viewModel={viewModel}
            busy={busy}
            onControl={(action) => runAction(async () => {
              if (action === "end") {
                setShowEndConfirm(true);
                return;
              }
              const result = await control(sessionId, action);
              if (action === "start") {
                loadOverview(sessionId);
              }
              return result;
            })}
            onRefresh={() => loadOverview(sessionId)}
            lastUpdatedAt={lastUpdatedAt}
          />
          {presentationIndex!==null&&viewModel.mission&&<TaskChainPresenter mission={viewModel.mission} initialIndex={presentationIndex} onClose={()=>setPresentationIndex(null)} onOpenLab={onOpenLab}/>}

          {viewModel?.status !== "draft" && !viewModel?.ended && (
            <section>
              <SessionStudentGrid viewModel={viewModel} onSelectStudent={student=>setSelectedStudent(student.studentId)} />
              <SessionStudentFeedback student={viewModel.students?.find(student=>student.studentId===selectedStudent)} mission={viewModel.mission} onClose={()=>setSelectedStudent(null)}/>
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
                  disabled={busy}
                  onClick={() => runAction(async () => {
                    const result = await loadReport(sessionId);
                    setReport(result.report ?? result);
                  })}
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
            onConfirm={() => runAction(async () => {
              setShowEndConfirm(false);
              await control(sessionId, "end");
              const result = await loadReport(sessionId);
              setReport(result.report ?? result);
            })}
            onCancel={() => setShowEndConfirm(false)}
          />
        </>
      )}
    </div>
  );
}
