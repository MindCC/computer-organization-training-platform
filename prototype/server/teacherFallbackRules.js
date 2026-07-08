const EMPTY_DATA_TEXT = "暂无数据";

const RULES = [
  {
    type: "machine_number",
    label: "机器数与补码转换",
    pattern: /machine-number|补码|原码|反码|机器数|溢出/i,
    focus: "机器数表示、补码转换和溢出判断",
    misconception: "把原码、反码、补码的转换步骤混在一起，尤其容易漏掉负数反码加 1。",
    activity: "用 -5、-1、7 三个数做原码、反码、补码对照练习。",
  },
  {
    type: "carry_path",
    label: "加法器进位路径",
    pattern: /half-adder|full-adder|multi-adder|Cout|进位|carry/i,
    focus: "半加器、全加器中的进位路径和 Cout 输出",
    misconception: "把 Sum 与 Cout 当成同一路输出，或没有理解进位由多个输入共同决定。",
    activity: "先复盘半加器真值表，再让学生标出全加器两级 XOR 与进位 OR 路径。",
  },
  {
    type: "storage_system",
    label: "存储系统访问流程",
    pattern: /memory-address|MAR|MDR|存储|主存|地址译码|数据总线/i,
    focus: "MAR、地址译码、主存、MDR 和数据总线的访问流程",
    misconception: "把地址总线和数据总线混淆，或把 MAR 与 MDR 的职责混在一起。",
    activity: "用一个 4 位地址演示从 MAR 到主存矩阵再到 MDR 的读写流程。",
  },
  {
    type: "hardware_tradeoff",
    label: "硬件配置取舍",
    pattern: /game-|预算|报价|利润|容量|速度|配置|瓶颈/i,
    focus: "硬件配置中性能、容量、价格和利润之间的取舍",
    misconception: "只追求性能分数，忽略预算约束、客户满意度和经营利润。",
    activity: "选一个预算超限案例，让学生解释为什么换 SSD 或内存会改变客户满意度。",
  },
];

export function buildRuleBasedAssistantReport(payload = {}) {
  const students = Array.isArray(payload.students) ? payload.students : [];
  if (students.length === 0) {
    return emptyReport();
  }

  const evidence = [];
  for (const rule of RULES) {
    const matches = collectRuleMatches(students, rule);
    if (matches.count > 0) {
      evidence.push({
        type: rule.type,
        label: rule.label,
        count: matches.count,
        studentIds: [...matches.studentIds],
        challengeIds: [...matches.challengeIds],
      });
    }
  }

  const progressRiskStudents = students.filter((student) =>
    (student.summary?.completionRate ?? 0) < 50 && (student.summary?.averageScore ?? 0) >= 80
  );
  if (progressRiskStudents.length > 0) {
    evidence.push({
      type: "progress_risk",
      label: "进度风险",
      count: progressRiskStudents.length,
      studentIds: progressRiskStudents.map((student) => student.id),
      challengeIds: [],
    });
  }

  const primaryEvidence = evidence[0];
  const primaryRule = RULES.find((rule) => rule.type === primaryEvidence?.type);
  const focus = primaryRule?.focus ?? normalizeWeakSpot(payload.summary?.weakSpot);

  return {
    lessonFocus: `建议下一节课重点复盘${focus}。`,
    riskStudents: buildRiskStudents(students),
    groupingPlan: buildGroupingPlan(primaryRule),
    commonMisconceptions: primaryRule ? [primaryRule.misconception] : buildCommonMisconceptions(payload),
    nextClassPlan: buildNextClassPlan(primaryRule),
    teacherScript: `今天先围绕${focus}做一次集中纠错，再让学生独立完成一轮提交并观察是否减少重复错误。`,
    evidence,
  };
}

function collectRuleMatches(students, rule) {
  const studentIds = new Set();
  const challengeIds = new Set();
  let count = 0;
  for (const student of students) {
    for (const record of student.progress ?? []) {
      const text = [
        record.challengeId,
        record.challengeTitle,
        ...(Array.isArray(record.errors) ? record.errors : []),
      ].join(" ");
      const weakScore = (record.bestScore ?? 0) < 70 && (record.attempts ?? 0) > 0;
      if (weakScore && rule.pattern.test(text)) {
        count += 1;
        studentIds.add(student.id);
        challengeIds.add(record.challengeId);
      }
    }
  }
  return { count, studentIds, challengeIds };
}

function buildRiskStudents(students) {
  return students
    .filter((student) => {
      const completion = student.summary?.completionRate ?? 0;
      const score = student.summary?.averageScore ?? 0;
      return completion < 60 || score < 70;
    })
    .slice(0, 6)
    .map((student) => {
      const completion = student.summary?.completionRate ?? 0;
      const score = student.summary?.averageScore ?? 0;
      const isProgressRisk = completion < 50 && score >= 80;
      return {
        studentId: student.id,
        name: student.displayName,
        reason: isProgressRisk ? `进度风险：完成率 ${completion}% ，但已完成部分平均分 ${score}` : `完成率 ${completion}% ，平均分 ${score}`,
        suggestion: isProgressRisk ? "优先安排补做路线，不要重复讲已经掌握的知识点。" : "先完成一轮教师引导复盘，再独立重做对应关卡并提交。",
      };
    });
}

function buildGroupingPlan(primaryRule) {
  if (!primaryRule) {
    return [
      { group: "基础巩固组", criteria: "完成率低于 60% 或平均分低于 70 分", activity: "复盘数据流方向、端口连接和关键路径。" },
      { group: "提升挑战组", criteria: "完成率不低于 80% 且平均分不低于 85 分", activity: "尝试限时完成多位加法器或简化 ALU 挑战。" },
    ];
  }
  return [
    { group: "定向复盘组", criteria: `在${primaryRule.label}上低于 70 分或重复提交`, activity: primaryRule.activity },
    { group: "同伴讲解组", criteria: "对应关卡已通过且错误较少", activity: `让学生用自己的话解释${primaryRule.focus}。` },
  ];
}

function buildCommonMisconceptions(payload) {
  const weakSpot = normalizeWeakSpot(payload?.summary?.weakSpot);
  return weakSpot === EMPTY_DATA_TEXT ? [] : [weakSpot];
}

function buildNextClassPlan(primaryRule) {
  if (!primaryRule) {
    return ["5 分钟复盘输入端、输出端和连线方向。", "8 分钟集中讲解班级高频错误。", "10 分钟让学生重做对应关卡并再次提交。"];
  }
  return [
    `5 分钟展示${primaryRule.label}的典型错误。`,
    `10 分钟完成${primaryRule.activity}`,
    "10 分钟让学生重做对应关卡并提交，教师观察错误是否下降。",
  ];
}

function normalizeWeakSpot(value) {
  return value && value !== EMPTY_DATA_TEXT ? value : "数据流方向和进位逻辑";
}

function emptyReport() {
  return {
    lessonFocus: "请先导入学生并等待至少一次闯关提交后，再生成课堂建议。",
    riskStudents: [],
    groupingPlan: [],
    commonMisconceptions: [],
    nextClassPlan: [],
    teacherScript: "请先导入学生并收集至少一轮学习数据，助教报告会给出更具体的课堂建议。",
    evidence: [],
  };
}
