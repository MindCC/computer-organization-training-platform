import { getLatestClassroomMission } from './classroomMissionRuntime.js';
import { validateTaskChain } from './classroomTaskChain.js';
export { CLASSROOM_MISSIONS, getClassroomMission, getLatestClassroomMission, missionForSession } from './classroomMissionRuntime.js';

export function validateClassroomSessionConfig(input = {}) {
  const taskChain = input.templateKey === 'task-chain' ? validateTaskChain(input.taskChain) : null;
  const mission = taskChain ? {key:'task-chain',version:1} : getLatestClassroomMission(String(input.templateKey ?? ""));
  const durationMinutes = Number(input.durationMinutes);
  const passScore = Number(input.passScore);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 10 || durationMinutes > 180) {
    throw new Error("课堂限时必须是 10 到 180 分钟的整数");
  }
  if (!Number.isInteger(passScore) || passScore < 60 || passScore > 100) {
    throw new Error("及格分必须是 60 到 100 的整数");
  }
  let lessonPlan = null;
  if (input.lessonPlan != null) {
    const raw = input.lessonPlan;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("教学安排格式无效");
    if (typeof raw.focus !== "string" || (raw.teacherScript != null && typeof raw.teacherScript !== "string")) {
      throw new Error("教学安排文字格式无效");
    }
    const focus = String(raw.focus ?? "").trim();
    const teacherScript = String(raw.teacherScript ?? "").trim();
    const steps = raw.steps;
    if (!focus || focus.length > 500) throw new Error("教学重点须为 1 到 500 字");
    if (!Array.isArray(steps) || steps.length < 1 || steps.length > 8
      || !steps.every((step) => typeof step === "string" && step.trim() && step.trim().length <= 300)) {
      throw new Error("课堂步骤须为 1 到 8 条，每条不超过 300 字");
    }
    if (teacherScript.length > 1000) throw new Error("讲解提示不能超过 1000 字");
    lessonPlan = { focus, steps: steps.map((step) => step.trim()), teacherScript };
  }
  return {
    templateKey: mission.key,
    templateVersion: mission.version,
    durationMinutes,
    passScore,
    allowMakeup: input.allowMakeup === true,
    ...(taskChain ? {taskChain} : {}),
    ...(lessonPlan ? { lessonPlan } : {}),
  };
}
