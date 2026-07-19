import { CheckCircle, Sparkle, Target, TrendUp, WarningCircle } from "@phosphor-icons/react";
import { CHALLENGES, LEARNING_ITEMS } from "../platformLogic.js";
import { HARDWARE_GAME_CASES, hardwareCaseTitle, formatHardwareBuildParts } from "../hardwareGame.js";
import { adaptHardwareGameSummary } from "../shared/api/teacherOverviewAdapter.js";
import { useEffect, useRef, useState } from "react";
import { SessionSetupPanel } from "./classroom/teacher/SessionSetupPanel.jsx";
import { LiveSessionDashboard, EndConfirmation } from "./classroom/teacher/LiveSessionDashboard.jsx";
import { SessionStudentGrid } from "./classroom/teacher/SessionStudentGrid.jsx";
import { SessionReportPanel } from "./classroom/teacher/SessionReportPanel.jsx";
import { SessionHeatmap } from "./classroom/teacher/SessionHeatmap.jsx";
import { TeacherAssignments } from "./TeacherAssignments.jsx";
import { TeacherQuestOverview } from "./teacher/TeacherQuestOverview.jsx";
import { TeacherSetupChecklist } from "./teacher/TeacherSetupChecklist.jsx";
import { InterventionGroups } from "./teacher/InterventionGroups.jsx";
import { buildTeacherQuestModel, buildTeacherSetupSteps, buildInterventionGroups } from "../teacherQuest.js";
import { buildCourseRouteGroups } from "../courseRoute.js";

function statusText(status) {
  return { completed: "已完成", "in-progress": "进行中", unlocked: "未开始", locked: "未解锁" }[status] ?? status;
}

function Metric({ icon: Icon, label, value }) {
  return <article className="metric-card"><Icon size={24} weight="fill" /><span>{label}</span><strong>{value}</strong></article>;
}

export function TeacherAssistantReport({ assistant, selectedTeacherClassId, assistantLoading, assistantError, generateAssistantReport }) {
  const report = assistant?.report ?? {};
  const riskStudents = report.riskStudents ?? [];
  const groupingPlan = report.groupingPlan ?? [];
  const misconceptions = report.commonMisconceptions ?? [];
  const nextClassPlan = report.nextClassPlan ?? [];

  return (
    <section className="teacher-studio-panel teacher-assistant-panel">
      <div className="teacher-assistant-header">
        <div>
          <span className="eyebrow">智能助教</span>
          <h2>课堂行动建议</h2>
          <p>根据当前班级学情生成下节课重点、分层辅导和讲解提示。</p>
        </div>
      </div>
      <div className="teacher-assistant-toolbar">
        <button className="primary-button" disabled={!selectedTeacherClassId || assistantLoading} onClick={generateAssistantReport} type="button">
          <Sparkle size={16} />{assistantLoading ? "生成中..." : "生成 AI 助教建议"}
        </button>
      </div>
      {assistantError ? <p className="teacher-ai-warning">{assistantError}</p> : null}
      {assistant ? (
        <div className="teacher-assistant-report">
        <div className="teacher-assistant-report-header">
          <span>{assistant.source === "ai" ? "DeepSeek 生成" : "本地降级建议"}</span>
          {assistant.generatedAt ? <small>{new Date(assistant.generatedAt).toLocaleString()}</small> : null}
        </div>
        {assistant.fallbackReason ? <p className="teacher-ai-warning">{assistant.fallbackReason}</p> : null}
        <section><strong>下节课重点</strong><p>{report.lessonFocus}</p></section>
        <section><strong>重点关注学生</strong>
          {riskStudents.length > 0 ? riskStudents.map((s, i) => <p key={s.studentId ?? i}>{s.name ?? "学生"}：{s.reason ?? "需要关注"}{s.suggestion ? `。${s.suggestion}` : ""}</p>) : <p>暂无重点风险学生。</p>}
        </section>
        <section><strong>分层辅导</strong>
          {groupingPlan.length > 0 ? groupingPlan.map((g, i) => <p key={g.group ?? i}>{g.group ?? "分组"}：{g.activity ?? g.criteria ?? "按当前学情安排练习"}</p>) : <p>暂无分组建议。</p>}
        </section>
        <section><strong>共性错误</strong>
          {misconceptions.length > 0 ? misconceptions.map((m) => <p key={m}>{m}</p>) : <p>暂无明显共性错误。</p>}
        </section>
        <section><strong>课堂安排</strong>
          {nextClassPlan.length > 0 ? nextClassPlan.map((n) => <p key={n}>{n}</p>) : <p>暂无课堂安排建议。</p>}
        </section>
        <section><strong>教师讲解提示</strong><p>{report.teacherScript}</p></section>
        </div>
      ) : (
        <p className="empty-state">选择班级后生成建议；AI 不可用时会自动使用本地规则。</p>
      )}
    </section>
  );
}

export function TeacherStudioDashboard({
  teacherClasses, selectedTeacherClassId, setSelectedTeacherClassId,
  selectedTeacherClassIdRef, classOverview, assistantReport, assistantLoading,
  assistantError, resetAssistantState, refreshClassOverview, generateAssistantReport,
  classNameDraft, setClassNameDraft, teacherMessage, createTeacherClass,
  openTeacherStudentDetail, resetStudentPassword, selectedTeacherStudent,
  setSelectedTeacherStudent, buildTeacherAssistantInsights,
  teacherSession,
}) {
  const selectedClass = teacherClasses.find((item) => item.id === selectedTeacherClassId);
  const assistant = buildTeacherAssistantInsights(classOverview, selectedClass);
  const students = classOverview?.students ?? [];
  const hardwareSummary = adaptHardwareGameSummary(
    classOverview?.hardwareGameSummary,
  );
  const lastRefreshRef = useRef(Date.now());

  // Auto-refresh: poll class overview every 45s when a class is selected
  useEffect(() => {
    if (!selectedTeacherClassId) return;
    const id = setInterval(() => {
      lastRefreshRef.current = Date.now();
      refreshClassOverview(selectedTeacherClassId);
    }, 45_000);
    return () => clearInterval(id);
  }, [selectedTeacherClassId, refreshClassOverview]);

  const lastRefreshText = new Date(lastRefreshRef.current).toLocaleTimeString();

  return (
    <div className="teacher-studio">
      <header className="teacher-studio-header">
        <div>
          <span className="eyebrow">教师数据页</span>
          <h1>{selectedClass ? `${selectedClass.name} 学情概览` : "选择班级"}</h1>
          <p>查看每名学生的完成率、平均分、尝试次数和薄弱点，导出CSV成绩。</p>
        <small className="refresh-indicator">最后更新：{lastRefreshText} · 每 45 秒自动刷新</small>
        </div>
      </header>

      <div className="teacher-studio-layout">
        <aside className="teacher-studio-sidebar">
          <div className="teacher-studio-card">
            <div className="teacher-studio-card-heading"><strong>选择班级</strong></div>
            <div className="teacher-class-list">
              {teacherClasses.map((item) => (
                <button className={item.id === selectedTeacherClassId ? "teacher-class active" : "teacher-class"} key={item.id}
                  onClick={() => { selectedTeacherClassIdRef.current = item.id; setSelectedTeacherClassId(item.id); resetAssistantState(); refreshClassOverview(item.id); }} type="button">
                  <strong>{item.name}</strong><span>{item.studentCount} 名学生</span>
                </button>
              ))}
            </div>
          </div>

          <div className="teacher-studio-card">
            <div className="teacher-studio-card-heading"><strong>创建班级</strong></div>
            <div className="teacher-create-box">
              <label className="form-row"><span>新班级名称</span><input value={classNameDraft} onChange={(e) => setClassNameDraft(e.target.value)} /></label>
              <button className="primary-button" onClick={createTeacherClass} type="button">创建班级</button>
            </div>
            {teacherMessage ? <p className="teacher-message">{teacherMessage}</p> : null}
          </div>
        </aside>

        <section className="teacher-studio-main">
          {/* Classroom Command Center */}
          <ClassroomCommandCenter teacherSession={teacherSession} />

          {/* Teacher Quest Overview */}
          {(() => {
            if (!selectedTeacherClassId) return null;
            const routeGroups = buildCourseRouteGroups(LEARNING_ITEMS, classOverview?.summary ?? {});
            const questModel = buildTeacherQuestModel(routeGroups, students);
            const setupSteps = buildTeacherSetupSteps({
              hasClass: Boolean(selectedClass),
              studentCount: students.length,
              hasMission: Boolean(teacherSession?.viewModel?.active),
              hasStartedSession: teacherSession?.viewModel?.status === "live",
            });
            const interventionGroups = buildInterventionGroups(students);
            return (
              <>
                <TeacherSetupChecklist steps={setupSteps} />
                <TeacherQuestOverview model={questModel} onSelectStage={(stageId) => {}} />
                <InterventionGroups groups={interventionGroups} onAction={(groupId, students) => {}} />
              </>
            );
          })()}

          {selectedTeacherClassId && <TeacherAssignments classId={selectedTeacherClassId} />}

          <div className="teacher-studio-summary">
            <Metric icon={CheckCircle} label="学生数" value={classOverview?.summary.studentCount ?? students.length} />
            <Metric icon={Target} label="平均完成率" value={(classOverview?.summary.completionRate ?? 0) + "%"} />
            <Metric icon={TrendUp} label="平均分" value={classOverview?.summary.averageScore ?? 0} />
            <Metric icon={WarningCircle} label="高频问题" value={classOverview?.summary.weakSpot ?? "暂无数据"} />
          </div>

          <div className="hardware-teacher-summary">
            <div className="hardware-teacher-block">
              <strong>硬件挑战：完成</strong>
              <span>{hardwareSummary.completedCases ?? 0} 个案例 · 均分 {hardwareSummary.averageScore ?? 0}</span>
            </div>
            <div className="hardware-teacher-list">
              <strong>常见瓶颈</strong>
              {hardwareSummary.frequentBottlenecks.length
                ? hardwareSummary.frequentBottlenecks.map((bottleneck) => (
                    <span key={bottleneck.key}>{bottleneck.label}</span>
                  ))
                : <p className="empty-state">暂无游戏提交数据</p>}
            </div>
            <div className="hardware-teacher-list">
              <strong>典型高分配置</strong>
              {hardwareSummary.typicalBuilds.length ? hardwareSummary.typicalBuilds.slice(0, 3).map((t) => <span key={t.caseId}>{hardwareCaseTitle(t.caseId)} · {t.score}<small>{formatHardwareBuildParts(t.parts)}</small></span>) : <p className="empty-state">暂无高分配置</p>}
            </div>
          </div>

          <TeacherAssistantReport assistant={assistantReport} selectedTeacherClassId={selectedTeacherClassId} assistantLoading={assistantLoading} assistantError={assistantError} generateAssistantReport={generateAssistantReport} />

          <div className="teacher-studio-content">
            <section className="teacher-studio-panel teacher-assistant-panel">
              <div className="teacher-risk-list">
                <strong>重点关注学生</strong>
                {assistant.atRiskStudents.length > 0 ? assistant.atRiskStudents.map((s) => (
                  <button className="teacher-risk-row" key={s.id} onClick={() => openTeacherStudentDetail(s.id)} type="button">
                    <span>{s.displayName}</span><small>{s.summary.completionRate}% · {s.summary.averageScore} 分 · {s.summary.totalAttempts} 次</small>
                  </button>
                )) : <p className="empty-state">暂无高风险学生。</p>}
              </div>
            </section>
          </div>

          <section className="teacher-studio-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">学生数据</span>
                <h2>{selectedClass ? `${selectedClass.name} 学生表现` : "请选择班级"}</h2>
                <p>展示每名学生的完成率、平均分、尝试次数和最近薄弱点。</p>
              </div>
              <div className="teacher-action-row">
                {selectedTeacherClassId ? <a className="ghost-button" href={"/api/teacher/classes/" + selectedTeacherClassId + "/export.csv"}>导出 CSV</a> : null}
              </div>
            </div>
            <div className="record-table teacher-student-table">
              {students.map((s) => (
                <div className="record-row" key={s.id}>
                  <strong>{s.displayName}</strong><span>{s.username}</span>
                  <span>{s.summary.completionRate}%</span><span>{s.summary.averageScore} 分</span>
                  <span>{s.summary.totalAttempts} 次</span><small>{s.summary.weakSpot}</small>
                  <div className="teacher-row-actions">
                    <button className="ghost-button" onClick={() => openTeacherStudentDetail(s.id)} type="button">查看详情</button>
                    <button className="ghost-button" onClick={() => resetStudentPassword(s.id)} type="button">重置密码</button>
                  </div>
                </div>
              ))}
              {students.length === 0 ? (
                <div className="empty-state">
                  <strong>暂无学生数据</strong>
                  <p>请先在左侧边栏"创建班级"后导入学生 CSV。"</p>
                  <small>模板格式：学号,姓名,初始密码</small>
                </div>
              ) : null}
            </div>
          </section>

          {selectedTeacherStudent ? <TeacherStudentDetail student={selectedTeacherStudent} LEARNING_ITEMS={LEARNING_ITEMS} setSelectedTeacherStudent={setSelectedTeacherStudent} /> : null}
        </section>
      </div>
    </div>
  );
}

function TeacherStudentDetail({ student, setSelectedTeacherStudent }) {
  if (!student) return null;
  return (
    <section className="teacher-studio-panel teacher-detail-panel">
      <div className="section-heading">
        <div><span className="eyebrow">学生详情</span><h2>{student.displayName}</h2><p>{student.username} · {student.className}</p></div>
        <button className="ghost-button" onClick={() => setSelectedTeacherStudent(null)} type="button">关闭</button>
      </div>
      <div className="teacher-detail-grid">
        <div>
          <h3>逐关最佳成绩</h3>
          <div className="teacher-progress-list">
            {LEARNING_ITEMS.map((c) => {
              const r = student.progress?.[c.id];
              return <div className="teacher-progress-row" key={c.id}><strong>{c.title}</strong><span>{statusText(r?.status)} · {r?.bestScore ?? 0} 分 · {r?.attempts ?? 0} 次</span></div>;
            })}
          </div>
        </div>
        <div>
          <h3>最近提交</h3>
          <div className="teacher-attempt-list">
            {(student.attempts ?? []).slice(0, 8).map((a) => (
              <div className={a.passed ? "teacher-attempt passed" : "teacher-attempt failed"} key={a.id}>
                <strong>{LEARNING_ITEMS.find((c) => c.id === a.challengeId)?.title ?? a.challengeId}</strong>
                <span>{a.score} 分 · {a.passed ? "通过" : "未通过"}</span>
                <small>{a.errors?.length ? a.errors.join(" / ") : "暂无错误"}</small>
              </div>
            ))}
            {student.attempts?.length ? null : <p className="empty-state">暂无提交记录</p>}
          </div>
        </div>
        <div>
          <h3>学生笔记</h3>
          <div className="teacher-note-list">
            {(student.notes ?? []).slice(0, 5).map((n) => (
              <article className="teacher-note" key={n.id}><strong>{n.title}</strong><p>{n.content}</p></article>
            ))}
            {student.notes?.length ? null : <p className="empty-state">暂无笔记</p>}
          </div>
        </div>
        {student.timeDistribution?.length > 0 ? <TimeDistPanel data={student.timeDistribution} /> : null}
        {student.scoreTrends?.length > 0 ? <ScoreTrendsPanel data={student.scoreTrends} /> : null}
        {student.hardwareSummary ? <HardwarePanel data={student.hardwareSummary} /> : null}
      </div>
    </section>
  );
}

function TimeDistPanel({ data }) {
  return (
    <div><h3>耗时分布</h3>
      <div className="teacher-progress-list">
        {data.slice(0, 6).map((d) => {
          const c = LEARNING_ITEMS.find((x) => x.id === d.challengeId);
          return <div className="teacher-progress-row" key={d.challengeId}><strong>{c?.title ?? d.challengeId}</strong><span>{d.timeSpentMinutes} 分钟 · {d.attempts} 次</span></div>;
        })}
      </div>
    </div>
  );
}
function ScoreTrendsPanel({ data }) {
  return (
    <div><h3>得分趋势</h3>
      <div className="teacher-attempt-list">
        {data.slice(0, 4).map((d) => {
          const c = LEARNING_ITEMS.find((x) => x.id === d.challengeId);
          return <div className="teacher-attempt" key={d.challengeId}><strong>{c?.title ?? d.challengeId}</strong><span>最高 {d.best} 分 · {d.attempts} 次</span><small>{d.scores.map((s) => s.score).join(" → ")}</small></div>;
        })}
      </div>
    </div>
  );
}
function HardwarePanel({ data }) {
  return (
    <div><h3>硬件挑战经营</h3>
      <div className="metric-grid mini">
        <div className="metric"><strong>经营利润</strong><span>{data.totalProfit} 元</span></div>
        <div className="metric"><strong>客户满意度</strong><span>{data.avgSatisfaction} / 100</span></div>
        <div className="metric"><strong>最佳方案</strong><span>{LEARNING_ITEMS.find((c) => c.id === data.bestCaseId)?.title ?? "-"}</span></div>
      </div>
    </div>
  );
}

function ClassroomCommandCenter({ teacherSession }) {
  const { viewModel, createSession, control, loadOverview, loadReport, lastUpdatedAt } = teacherSession ?? {};
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [report, setReport] = useState(null);

  const hasSession = viewModel?.active;
  const sessionId = viewModel?.sessionId;

  return (
    <div className="classroom-command-center">
      {!hasSession ? (
        <SessionSetupPanel
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
            }}
            onRefresh={() => loadOverview(sessionId)}
            lastUpdatedAt={lastUpdatedAt}
          />

          {viewModel?.status !== "draft" && !viewModel?.ended && (
            <>
              <SessionHeatmap sessionId={sessionId} />
              <SessionStudentGrid viewModel={viewModel} />
            </>
          )}

          {viewModel?.ended && (
            <div>
              {report ? (
                <SessionReportPanel report={report} />
              ) : (
                <button
                  className="primary-button"
                  onClick={async () => {
                    const r = await loadReport(sessionId);
                    setReport(r.report ?? r);
                  }}
                  type="button"
                >
                  查看课堂报告
                </button>
              )}
            </div>
          )}

          <EndConfirmation
            visible={showEndConfirm}
            title={viewModel?.title}
            onConfirm={async () => {
              setShowEndConfirm(false);
              await control(sessionId, "end");
              const r = await loadReport(sessionId);
              setReport(r.report ?? r);
            }}
            onCancel={() => setShowEndConfirm(false)}
          />
        </>
      )}
    </div>
  );
}
