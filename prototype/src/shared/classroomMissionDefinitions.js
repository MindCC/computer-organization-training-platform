const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

export const CLASSROOM_MISSIONS = deepFreeze({
  "computer-data-flow": {
    1: {
      key: "computer-data-flow",
      version: 1,
      title: "计算机五大部件与数据流",
      stages: [
        { id: "components", challengeId: "computer-components", title: "认识五大部件", grading: "participation" },
        { id: "program-flow", challengeId: "program-flow", title: "观察程序执行", grading: "circuit" },
        { id: "instruction-data", challengeId: "instruction-data", title: "区分指令与数据", grading: "circuit" },
        { id: "data-flow", challengeId: "data-flow", title: "完成综合数据流实训", grading: "circuit" },
      ],
    },
  },
});

export function getClassroomMission(templateKey, templateVersion) {
  const mission = CLASSROOM_MISSIONS[templateKey]?.[templateVersion];
  if (!mission) throw new Error("课堂任务包不存在");
  return mission;
}

export function getLatestClassroomMission(templateKey) {
  const versions = Object.keys(CLASSROOM_MISSIONS[templateKey] ?? {}).map(Number);
  if (versions.length === 0) throw new Error("课堂任务包不存在");
  return getClassroomMission(templateKey, Math.max(...versions));
}

export function validateClassroomSessionConfig(input = {}) {
  const mission = getLatestClassroomMission(String(input.templateKey ?? ""));
  const durationMinutes = Number(input.durationMinutes);
  const passScore = Number(input.passScore);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 10 || durationMinutes > 180) {
    throw new Error("课堂限时必须是 10 到 180 分钟的整数");
  }
  if (!Number.isInteger(passScore) || passScore < 60 || passScore > 100) {
    throw new Error("及格分必须是 60 到 100 的整数");
  }
  return {
    templateKey: mission.key,
    templateVersion: mission.version,
    durationMinutes,
    passScore,
    allowMakeup: input.allowMakeup === true,
  };
}
