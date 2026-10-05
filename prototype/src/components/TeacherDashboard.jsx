import { useCallback, useState } from "react";
import { ArrowsClockwise, ChalkboardTeacher, ChartDonut, ChartLineUp, ClipboardText, DesktopTower, Export, Robot, Student } from "@phosphor-icons/react";
import { adaptHardwareGameSummary } from "../shared/api/teacherOverviewAdapter.js";
import { useVisibilityInterval } from "../hooks/useVisibilityInterval.js";
import { TeacherClassSidebar } from "./teacher/TeacherClassSidebar.jsx";
import { TeacherClassSummary } from "./teacher/TeacherClassSummary.jsx";
import { TeacherRiskStudents } from "./teacher/TeacherRiskStudents.jsx";
import { TeacherStudentTable } from "./teacher/TeacherStudentTable.jsx";
import { TeacherStudentDetail } from "./teacher/TeacherStudentDetail.jsx";
import { TeacherAssistantReport } from "./teacher/TeacherAssistantReport.jsx";
import { TeacherQuestSection } from "./teacher/TeacherQuestSection.jsx";
import { ClassroomCommandCenter } from "./teacher/ClassroomCommandCenter.jsx";
import { TeacherAssignments } from "./TeacherAssignments.jsx";
import { TeacherCourseWorkbench } from "./TeacherCourseWorkbench.jsx";
import { TeacherAssemblyPractice } from './teacher/TeacherAssemblyPractice.jsx';
import { TaskLibrary } from './classroom/teacher/TaskLibrary.jsx';

const OVERVIEW_REFRESH_MS = 45_000;
const STATISTIC_ITEMS = [
  { id: "overview", label: "学情洞察", icon: ChartLineUp },
  { id: "monitor", label: "学习监控", icon: ChartDonut },
  { id: "assistant", label: "学情分析助手", icon: Robot },
  { id: "students", label: "学情明细", icon: Student },
  { id: "practice", label: "装机练习", icon: DesktopTower },
];

/**
 * 教师看板组合根。
 *
 * 这里只负责取数、选择班级与版块编排；各版块分别位于 ./teacher/ 下：
 * 班级侧栏、学情指标、课程地图、作业、课程工作台、智能助教、风险学生、学生表与学生详情。
 */
export function TeacherStudioDashboard({
  teacherClasses, selectedTeacherClassId, setSelectedTeacherClassId,
  selectedTeacherClassIdRef, classOverview, assistantReport, assistantLoading,
  assistantError, resetAssistantState, refreshClassOverview, generateAssistantReport,
  classNameDraft, setClassNameDraft, teacherMessage, createTeacherClass,
  openTeacherStudentDetail, resetStudentPassword, selectedTeacherStudent,
  setSelectedTeacherStudent, buildTeacherAssistantInsights,
  teacherSession, onOpenLab,
}) {
  const selectedClass = teacherClasses.find((item) => item.id === selectedTeacherClassId);
  const assistant = buildTeacherAssistantInsights(classOverview, selectedClass);
  const students = classOverview?.students ?? [];
  const hardwareSummary = adaptHardwareGameSummary(classOverview?.hardwareGameSummary);
  const [lastRefreshAt, setLastRefreshAt] = useState(() => Date.now());
  const [workspace, setWorkspace] = useState('tasks');
  const [statistic, setStatistic] = useState('overview');
  const [adoptedPlan, setAdoptedPlan] = useState(null);

  const refreshSelectedClass = useCallback(() => {
    if (!selectedTeacherClassId) return;
    setLastRefreshAt(Date.now());
    refreshClassOverview(selectedTeacherClassId);
  }, [selectedTeacherClassId, refreshClassOverview]);

  // 45 秒自动刷新：回调通过 ref 调用，父组件每次渲染产生的新函数不会再重置计时器，
  // 并且只在标签页可见时刷新。
  useVisibilityInterval(refreshSelectedClass, OVERVIEW_REFRESH_MS, Boolean(selectedTeacherClassId));

  const selectClass = useCallback((classId) => {
    selectedTeacherClassIdRef.current = classId;
    setSelectedTeacherClassId(classId);
    resetAssistantState();
    setAdoptedPlan(null);
    refreshClassOverview(classId);
  }, [selectedTeacherClassIdRef, setSelectedTeacherClassId, resetAssistantState, refreshClassOverview]);

  return (
    <div className="teacher-studio teacher-studio-flat">
      <div className="teacher-studio-layout">
        <aside className="teacher-workspace-nav" aria-label="教师工作区">
          <span className="teacher-nav-label">教学工作台</span>
          <button type="button" aria-pressed={workspace === 'tasks'} onClick={() => setWorkspace('tasks')}><ClipboardText size={18} />任务库</button>
          <button type="button" aria-pressed={workspace === 'classroom'} onClick={() => setWorkspace('classroom')}><ChalkboardTeacher size={18} />课堂执行</button>
          <button type="button" aria-pressed={workspace === 'teaching'} onClick={() => setWorkspace('teaching')}><ChalkboardTeacher size={18} />教学活动</button>
          <button type="button" aria-pressed={workspace === 'statistics'} onClick={() => setWorkspace('statistics')}><ChartDonut size={18} />学情统计</button>
          {workspace === 'statistics' && (
            <nav className="statistics-nav" aria-label="统计分类">
              {STATISTIC_ITEMS.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" aria-pressed={statistic === id} onClick={() => setStatistic(id)}><Icon size={16} />{label}</button>
              ))}
            </nav>
          )}
        </aside>
        <div className="teacher-dashboard-shell">
          <header className="teacher-dashboard-toolbar">
            <div className="teacher-class-selector">
              <TeacherClassSidebar
                teacherClasses={teacherClasses}
                selectedTeacherClassId={selectedTeacherClassId}
                classNameDraft={classNameDraft}
                setClassNameDraft={setClassNameDraft}
                teacherMessage={teacherMessage}
                createTeacherClass={createTeacherClass}
                onSelectClass={selectClass}
              />
            </div>
            <div className="teacher-toolbar-actions">
              <div className="teacher-refresh-note">
                <span>更新于 {new Date(lastRefreshAt).toLocaleTimeString()}</span>
                <small>每 45 秒自动同步</small>
              </div>
              {selectedTeacherClassId ? (
                <button className="teacher-toolbar-button" onClick={refreshSelectedClass} type="button"><ArrowsClockwise size={18} />刷新</button>
              ) : null}
              {selectedTeacherClassId ? (
                <a className="teacher-toolbar-button" href={`/api/teacher/classes/${selectedTeacherClassId}/archive.zip`}><Export size={18} />一键导出</a>
              ) : null}
            </div>
          </header>

          <section className="teacher-studio-main">
          {workspace === 'teaching' && <header className="statistics-heading"><span className="eyebrow">教学活动</span><h2>作业与课程组织</h2><p>管理班级作业、协作项目与课程资源。</p></header>}
          {workspace === 'classroom' && <header className="statistics-heading"><span className="eyebrow">课堂执行</span><h2>课堂任务与学生反馈</h2><p>演示已发布的课堂任务，查看学生进度和提交反馈。</p></header>}
          {workspace === 'tasks' && <TaskLibrary classes={teacherClasses} classId={selectedTeacherClassId} activeSession={teacherSession?.viewModel} initialPlan={adoptedPlan} onPlanCreated={()=>setAdoptedPlan(null)} onOpenLab={onOpenLab} onOpenClassroom={()=>setWorkspace('classroom')} onOpenStatistics={({classId,status})=>{if(classId&&classId!==selectedTeacherClassId)selectClass(classId);setWorkspace('statistics');setStatistic(['draft','live','paused'].includes(status)?'monitor':'overview');}} onPublished={session=>{if(session.class_id!==selectedTeacherClassId)selectClass(session.class_id);else teacherSession.loadOverview(session.id);setWorkspace('classroom');}}/>}
          {workspace === 'statistics' && <header className="statistics-heading"><span className="eyebrow">学情统计</span><h2>{({ overview: '章节完成度与班级概览', monitor: '课堂完成度与报告', assistant: 'AI 学情分析', students: '学生学习明细', practice: '装机练习与操作复盘' })[statistic]}</h2><p>基于当前班级的真实学习记录，查看完成情况与教学反馈。</p></header>}

          {(workspace === 'classroom' || (workspace==='statistics'&&statistic === 'monitor')) && (
            <ClassroomCommandCenter key={selectedTeacherClassId} teacherSession={teacherSession} statistics={workspace==='classroom'||(workspace === 'statistics' && statistic === 'monitor')} showSetup={false} onOpenLab={onOpenLab}/>
          )}
          {workspace==='classroom'&&!teacherSession?.viewModel?.active&&<section className="task-library-empty"><h3>暂无课堂任务</h3><p>到任务库选择一个任务发布到当前班级，即可开始课堂。</p><button type="button" className="primary-button" onClick={()=>setWorkspace('tasks')}>打开任务库</button></section>}
          {workspace==='statistics'&&statistic==='practice'&&(selectedTeacherClassId?<TeacherAssemblyPractice key={selectedTeacherClassId} classId={selectedTeacherClassId}/>:<p>请先选择班级以查看装机练习。</p>)}

          <div hidden={workspace !== 'statistics' || statistic !== 'overview'}>

          {selectedTeacherClassId ? (
            <TeacherQuestSection
              selectedClass={selectedClass}
              students={students}
              classSummary={classOverview?.summary}
              teacherSession={teacherSession}
              sections={["coverage"]}
              key={`coverage:${selectedTeacherClassId}`} onOpenStudent={openTeacherStudentDetail}
            />
          ) : null}
          <TeacherClassSummary classOverview={classOverview} students={students} hardwareSummary={hardwareSummary} />
          </div>

          <div hidden={workspace !== 'teaching'}>
          {selectedTeacherClassId ? (
            <TeacherQuestSection
              selectedClass={selectedClass}
              students={students}
              classSummary={classOverview?.summary}
              teacherSession={teacherSession}
              sections={["checklist"]}
              key={`checklist:${selectedTeacherClassId}`}
            />
          ) : null}
          {selectedTeacherClassId ? (
            <details className="teacher-section-disclosure">
              <summary><span><ClipboardText size={18} />课后作业管理</span><small>布置、批改与查看完成情况</small></summary>
              <div className="teacher-section-disclosure-body"><TeacherAssignments key={selectedTeacherClassId} classId={selectedTeacherClassId} /></div>
            </details>
          ) : null}
          {selectedTeacherClassId ? (
            <details className="teacher-section-disclosure">
              <summary><span><ChalkboardTeacher size={18} />课程建设与项目评价</span><small>课程草稿、小组项目与成果评价</small></summary>
              <div className="teacher-section-disclosure-body"><TeacherCourseWorkbench key={selectedTeacherClassId} classId={selectedTeacherClassId} students={students} /></div>
            </details>
          ) : null}
          </div>

          <div hidden={workspace !== 'statistics' || statistic !== 'assistant'}>
          <TeacherAssistantReport
            assistant={assistantReport}
            selectedTeacherClassId={selectedTeacherClassId}
            assistantLoading={assistantLoading}
            assistantError={assistantError}
            generateAssistantReport={generateAssistantReport}
            students={students}
            onOpenStudent={(studentId) => { setStatistic('students'); openTeacherStudentDetail(studentId); }}
            canAdoptPlan={!teacherSession?.viewModel?.active || teacherSession?.viewModel?.ended}
            onAdoptPlan={(plan) => { setAdoptedPlan(plan); setWorkspace('tasks'); }}
          />
          </div>

          <div hidden={workspace !== 'statistics' || statistic !== 'monitor'}>
          {selectedTeacherClassId ? (
            <TeacherQuestSection
              selectedClass={selectedClass}
              students={students}
              classSummary={classOverview?.summary}
              teacherSession={teacherSession}
              sections={["groups"]}
              key={`groups:${selectedTeacherClassId}`} onOpenStudent={openTeacherStudentDetail}
            />
          ) : null}
          </div>

          <div hidden={workspace !== 'statistics' || statistic !== 'students'}>
          <TeacherRiskStudents
            atRiskStudents={assistant.atRiskStudents}
            onOpenStudent={openTeacherStudentDetail}
          />

          <TeacherStudentTable
            students={students}
            selectedClass={selectedClass}
            selectedTeacherClassId={selectedTeacherClassId}
            onOpenStudent={openTeacherStudentDetail}
            onResetPassword={resetStudentPassword}
          />

          {selectedTeacherStudent ? (
            <TeacherStudentDetail
              student={selectedTeacherStudent}
              onClose={() => setSelectedTeacherStudent(null)}
            />
          ) : null}
          </div>
          </section>
        </div>
      </div>
    </div>
  );
}
