import { useCallback, useState } from "react";
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

const OVERVIEW_REFRESH_MS = 45_000;

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
  teacherSession,
}) {
  const selectedClass = teacherClasses.find((item) => item.id === selectedTeacherClassId);
  const assistant = buildTeacherAssistantInsights(classOverview, selectedClass);
  const students = classOverview?.students ?? [];
  const hardwareSummary = adaptHardwareGameSummary(classOverview?.hardwareGameSummary);
  const [lastRefreshAt, setLastRefreshAt] = useState(() => Date.now());

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
    refreshClassOverview(classId);
  }, [selectedTeacherClassIdRef, setSelectedTeacherClassId, resetAssistantState, refreshClassOverview]);

  return (
    <div className="teacher-studio">
      <header className="teacher-studio-header">
        <div>
          <span className="eyebrow">教师数据页</span>
          <h1>{selectedClass ? `${selectedClass.name} 学情概览` : "选择班级"}</h1>
          <p>查看每名学生的完成率、平均分、尝试次数和薄弱点，导出 CSV 成绩。</p>
          <small className="refresh-indicator">
            最后更新：{new Date(lastRefreshAt).toLocaleTimeString()} · 每 45 秒自动刷新
            {selectedTeacherClassId ? (
              <button className="ghost-button" style={{ marginLeft: 8 }} onClick={refreshSelectedClass} type="button">立即刷新</button>
            ) : null}
          </small>
        </div>
      </header>

      <div className="teacher-studio-layout">
        <TeacherClassSidebar
          teacherClasses={teacherClasses}
          selectedTeacherClassId={selectedTeacherClassId}
          classNameDraft={classNameDraft}
          setClassNameDraft={setClassNameDraft}
          teacherMessage={teacherMessage}
          createTeacherClass={createTeacherClass}
          onSelectClass={selectClass}
        />

        <section className="teacher-studio-main">
          <ClassroomCommandCenter teacherSession={teacherSession} />

          {selectedTeacherClassId ? (
            <TeacherQuestSection
              selectedClass={selectedClass}
              students={students}
              classSummary={classOverview?.summary}
              teacherSession={teacherSession}
            />
          ) : null}

          {selectedTeacherClassId ? <TeacherAssignments classId={selectedTeacherClassId} /> : null}
          {selectedTeacherClassId ? <TeacherCourseWorkbench classId={selectedTeacherClassId} students={students} /> : null}

          <TeacherClassSummary classOverview={classOverview} students={students} hardwareSummary={hardwareSummary} />

          <TeacherAssistantReport
            assistant={assistantReport}
            selectedTeacherClassId={selectedTeacherClassId}
            assistantLoading={assistantLoading}
            assistantError={assistantError}
            generateAssistantReport={generateAssistantReport}
          />

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
        </section>
      </div>
    </div>
  );
}
