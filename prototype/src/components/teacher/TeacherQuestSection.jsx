import { LEARNING_ITEMS } from "../../platformLogic.js";
import { buildCourseRouteGroups } from "../../courseRoute.js";
import { buildTeacherQuestModel, buildTeacherSetupSteps, buildInterventionGroups } from "../../teacherQuest.js";
import { TeacherQuestOverview } from "./TeacherQuestOverview.jsx";
import { TeacherSetupChecklist } from "./TeacherSetupChecklist.jsx";
import { InterventionGroups } from "./InterventionGroups.jsx";
import { useState } from 'react';

const ALL_SECTIONS = ["checklist", "coverage", "groups"];

/** 课程地图进度、开课准备清单与分层干预分组；sections 控制渲染哪些版块，便于拆分到不同工作区。 */
export function TeacherQuestSection({ selectedClass, students, classSummary, teacherSession, onOpenStudent, sections = ALL_SECTIONS }) {
  const routeGroups = buildCourseRouteGroups(LEARNING_ITEMS, classSummary ?? {});
  const questModel = buildTeacherQuestModel(routeGroups, students);
  const setupSteps = buildTeacherSetupSteps({
    hasClass: Boolean(selectedClass),
    studentCount: students.length,
    hasMission: Boolean(teacherSession?.viewModel?.active),
    hasStartedSession: teacherSession?.viewModel?.status === "live",
  });
  const interventionGroups = buildInterventionGroups(students);
  const [stageId,setStageId]=useState(null),[groupId,setGroupId]=useState(null);
  const stage=questModel.stages.find(item=>item.id===stageId),group=interventionGroups.find(item=>item.id===groupId);
  const selectedStudents=stage?students:group?students.filter(student=>group.students.some(member=>member.id===student.id)):[];

  return (
    <>
      {sections.includes("checklist") && <TeacherSetupChecklist steps={setupSteps} />}
      {sections.includes("coverage") && <TeacherQuestOverview model={questModel} onSelectStage={id=>{setStageId(id);setGroupId(null);}} />}
      {sections.includes("groups") && <InterventionGroups groups={interventionGroups} onAction={id=>{setGroupId(id);setStageId(null);}} />}
      {(stage||group)&&<section className="teacher-evidence-panel" aria-label="学生学习证据"><header><div><h3>{stage?.title??group.label}</h3><p>{stage?`${stage.completed}/${questModel.totalStudents} 人完成 · ${stage.blocker}`:'对照实际记录，确定需要跟进的学生。'}</p></div><button className="ghost-button" type="button" onClick={()=>{setStageId(null);setGroupId(null);}}>收起学习证据</button></header><div className="teacher-evidence-list">{selectedStudents.map(student=><div key={student.id}><strong>{student.displayName}</strong><span>{stage?({completed:'已完成','in-progress':'进行中',locked:'未解锁',unlocked:'未开始'})[student.progress?.[stage.id]?.status]??'未开始':`${student.summary?.totalAttempts??0} 次尝试`}</span>{onOpenStudent&&<button type="button" className="ghost-button" onClick={()=>onOpenStudent(student.id)}>查看学生详情</button>}</div>)}</div>{selectedStudents.length===0&&<p>当前班级暂无学生。</p>}</section>}
    </>
  );
}
