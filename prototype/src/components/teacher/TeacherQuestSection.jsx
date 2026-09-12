import { LEARNING_ITEMS } from "../../platformLogic.js";
import { buildCourseRouteGroups } from "../../courseRoute.js";
import { buildTeacherQuestModel, buildTeacherSetupSteps, buildInterventionGroups } from "../../teacherQuest.js";
import { TeacherQuestOverview } from "./TeacherQuestOverview.jsx";
import { TeacherSetupChecklist } from "./TeacherSetupChecklist.jsx";
import { InterventionGroups } from "./InterventionGroups.jsx";

const ALL_SECTIONS = ["checklist", "coverage", "groups"];

/** 课程地图进度、开课准备清单与分层干预分组；sections 控制渲染哪些版块，便于拆分到不同工作区。 */
export function TeacherQuestSection({ selectedClass, students, classSummary, teacherSession, sections = ALL_SECTIONS }) {
  const routeGroups = buildCourseRouteGroups(LEARNING_ITEMS, classSummary ?? {});
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
      {sections.includes("checklist") && <TeacherSetupChecklist steps={setupSteps} />}
      {sections.includes("coverage") && <TeacherQuestOverview model={questModel} onSelectStage={() => {}} />}
      {sections.includes("groups") && <InterventionGroups groups={interventionGroups} onAction={() => {}} />}
    </>
  );
}
