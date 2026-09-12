import { LEARNING_ITEMS } from "../../platformLogic.js";
import { buildCourseRouteGroups } from "../../courseRoute.js";
import { buildTeacherQuestModel, buildTeacherSetupSteps, buildInterventionGroups } from "../../teacherQuest.js";
import { TeacherQuestOverview } from "./TeacherQuestOverview.jsx";
import { TeacherSetupChecklist } from "./TeacherSetupChecklist.jsx";
import { InterventionGroups } from "./InterventionGroups.jsx";

/** 课程地图进度、开课准备清单与分层干预分组。 */
export function TeacherQuestSection({ selectedClass, students, classSummary, teacherSession }) {
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
      <TeacherSetupChecklist steps={setupSteps} />
      <TeacherQuestOverview model={questModel} onSelectStage={() => {}} />
      <InterventionGroups groups={interventionGroups} onAction={() => {}} />
    </>
  );
}
