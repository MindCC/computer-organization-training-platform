export const CHALLENGES = [
  {
    id: "data-flow",
    title: "认识数据流",
    shortTitle: "数据流",
    goal: "把输入、处理单元和输出端连成一条完整的数据路径。",
    objective: "理解数据从输入端进入运算部件，再输出到结果端的基本流向。",
    estimatedMinutes: 8,
    requiredConnections: ["输入A->数据通路", "数据通路->结果S"],
    components: [
      { name: "输入开关", pins: "A/B", description: "给电路提供 0 或 1 的输入信号。" },
      { name: "数据通路", pins: "in/out", description: "把输入信号送到目标输出端。" },
      { name: "结果灯", pins: "S", description: "显示当前数据路径的输出结果。" },
    ],
    hints: {
      "输入A->数据通路": { type: "输入端未连接", message: "输入A还没有进入数据通路，信号无法开始传播。" },
      "数据通路->结果S": { type: "输出端未连接", message: "结果S没有接收到数据通路的输出。" },
    },
    summary: "你已经完成一条最基本的数据路径，理解了输入、处理和输出的关系。",
    principle: "计算机中的每个运算部件都离不开清晰的数据流向：信号从输入端进入，经由部件处理后到达输出端。",
  },
  {
    id: "half-adder",
    title: "半加器",
    shortTitle: "半加器",
    goal: "连接异或门和与门，实现 1 位二进制加法。",
    objective: "观察和位与进位如何分别由异或逻辑和与逻辑产生。",
    estimatedMinutes: 12,
    requiredConnections: ["输入A->异或门", "输入B->异或门", "输入A->与门", "输入B->与门", "异或门->和位S", "与门->进位C"],
    components: [
      { name: "异或门", pins: "A/B/S", description: "当两个输入不同时输出 1，用来产生和位。" },
      { name: "与门", pins: "A/B/C", description: "当两个输入都为 1 时输出 1，用来产生进位。" },
      { name: "输出端", pins: "S/C", description: "显示半加器的和位与进位。" },
    ],
    hints: {
      "输入A->异或门": { type: "输入端未连接", message: "输入A没有进入异或门，和位无法判断。" },
      "输入B->异或门": { type: "输入端未连接", message: "输入B没有进入异或门，和位无法判断。" },
      "输入A->与门": { type: "进位路径缺失", message: "输入A没有进入与门，进位逻辑不完整。" },
      "输入B->与门": { type: "进位路径缺失", message: "输入B没有进入与门，进位逻辑不完整。" },
      "异或门->和位S": { type: "输出端未连接", message: "异或门的结果没有接到和位S。" },
      "与门->进位C": { type: "输出端未连接", message: "与门的结果没有接到进位C。" },
    },
    summary: "你已搭建一个半加器，可以完成两个 1 位二进制数的加法。",
    principle: "半加器没有输入进位。和位来自 A 异或 B，进位来自 A 与 B。",
  },
  {
    id: "full-adder",
    title: "全加器",
    shortTitle: "全加器",
    goal: "在半加器基础上加入输入进位，完成三输入加法。",
    objective: "理解输入进位如何影响和位与输出进位。",
    estimatedMinutes: 16,
    requiredConnections: ["输入A->异或门1", "输入B->异或门1", "进位输入Cin->异或门2", "异或门2->和位S", "进位逻辑->输出Cout"],
    components: [
      { name: "异或门1", pins: "A/B/X", description: "先计算 A 与 B 的临时和。" },
      { name: "异或门2", pins: "X/Cin/S", description: "把临时和与输入进位合并，得到最终和位。" },
      { name: "进位逻辑", pins: "A/B/Cin/Cout", description: "判断是否需要向高位产生进位。" },
    ],
    hints: {
      "输入A->异或门1": { type: "输入端未连接", message: "输入A没有进入第一层求和逻辑。" },
      "输入B->异或门1": { type: "输入端未连接", message: "输入B没有进入第一层求和逻辑。" },
      "进位输入Cin->异或门2": { type: "缺少进位输入", message: "Cin没有接入第二层异或门，因此这还不是完整全加器。" },
      "异或门2->和位S": { type: "输出端未连接", message: "最终和位S没有连接到输出端。" },
      "进位逻辑->输出Cout": { type: "输出端未连接", message: "输出进位Cout没有接到目标输出端。" },
    },
    summary: "你已搭建一个全加器，可以处理 A、B 和输入进位三个信号。",
    principle: "全加器的和位为 A 异或 B 再异或 Cin，输出进位由 A、B、Cin 中至少两个为 1 决定。",
  },
  {
    id: "multi-adder",
    title: "多位加法器",
    shortTitle: "多位加法器",
    goal: "把多个全加器串联起来，观察进位逐级传播。",
    objective: "理解低位进位如何影响高位计算。",
    estimatedMinutes: 18,
    requiredConnections: ["全加器0->全加器1", "全加器1->全加器2", "输入组A/B->各位全加器", "各位和位->结果寄存器"],
    components: [
      { name: "全加器0", pins: "低位", description: "处理最低位并产生第一段进位。" },
      { name: "全加器1", pins: "中位", description: "接收低位进位继续计算。" },
      { name: "全加器2", pins: "高位", description: "输出最终高位结果与总进位。" },
    ],
    hints: {
      "全加器0->全加器1": { type: "进位路径缺失", message: "低位进位没有传给中位全加器。" },
      "全加器1->全加器2": { type: "进位路径缺失", message: "中位进位没有传给高位全加器。" },
      "输入组A/B->各位全加器": { type: "输入端未连接", message: "每一位全加器都需要对应的 A/B 输入。" },
      "各位和位->结果寄存器": { type: "输出端未连接", message: "各位和位没有汇总到结果寄存器。" },
    },
    summary: "你已完成 3 位串行进位加法器，能看见进位逐级传递。",
    principle: "多位加法器通常由多个全加器组成，低位的 Cout 会成为高位的 Cin。",
  },
  {
    id: "mux",
    title: "多路选择器",
    shortTitle: "多路选择器",
    goal: "使用选择信号决定哪一路数据进入输出端。",
    objective: "理解控制信号如何选择数据路径。",
    estimatedMinutes: 14,
    requiredConnections: ["数据源0->选择器", "数据源1->选择器", "选择信号->选择器", "选择器->输出Y"],
    components: [
      { name: "数据源0", pins: "D0", description: "选择信号为 0 时被输出。" },
      { name: "数据源1", pins: "D1", description: "选择信号为 1 时被输出。" },
      { name: "选择端", pins: "选择信号", description: "决定输出来自哪一路输入。" },
    ],
    hints: {
      "数据源0->选择器": { type: "输入端未连接", message: "数据源0没有接入选择器。" },
      "数据源1->选择器": { type: "输入端未连接", message: "数据源1没有接入选择器。" },
      "选择信号->选择器": { type: "缺少控制信号", message: "没有选择信号，选择器无法判断输出哪一路数据。" },
      "选择器->输出Y": { type: "输出端未连接", message: "选择器输出没有接到结果端Y。" },
    },
    summary: "你已完成一个 2 选 1 多路选择器。",
    principle: "多路选择器体现了控制信号对数据路径的选择作用，是 ALU 和数据通路中的关键部件。",
  },
  {
    id: "alu",
    title: "简化 ALU",
    shortTitle: "简化 ALU",
    goal: "把加法、与、或和选择控制组合成一个简化运算器。",
    objective: "理解 ALU 如何根据控制位输出不同运算结果。",
    estimatedMinutes: 22,
    requiredConnections: ["输入A/B->加法单元", "输入A/B->逻辑单元", "控制位->选择器", "选择器->结果F", "标志位逻辑->零标志/进位标志"],
    components: [
      { name: "加法单元", pins: "A/B/S/C", description: "负责加法运算和进位输出。" },
      { name: "逻辑单元", pins: "AND/OR", description: "负责按位与、按位或等逻辑运算。" },
      { name: "结果选择器", pins: "控制位/F", description: "根据控制位选择最终输出。" },
    ],
    hints: {
      "输入A/B->加法单元": { type: "输入端未连接", message: "加法单元没有收到完整输入。" },
      "输入A/B->逻辑单元": { type: "输入端未连接", message: "逻辑单元没有收到完整输入。" },
      "控制位->选择器": { type: "缺少控制信号", message: "控制位没有接入选择器，ALU无法确定输出哪种运算。" },
      "选择器->结果F": { type: "输出端未连接", message: "结果选择器没有连接到最终结果F。" },
      "标志位逻辑->零标志/进位标志": { type: "标志位缺失", message: "零标志或进位标志没有连接，无法完整观察运算状态。" },
    },
    summary: "你已完成一个简化 ALU，能通过控制位选择不同运算。",
    principle: "ALU 的核心不是只会加法，而是能在控制信号驱动下选择多种运算路径并输出标志位。",
  },
];

export function buildInitialProgress(challenges) {
  return challenges.reduce((progress, challenge, index) => {
    progress[challenge.id] = {
      status: index === 0 ? "in-progress" : "locked",
      attempts: 0,
      errors: [],
      completedAt: null,
      bestScore: 0,
      timeSpentMinutes: 0,
    };
    return progress;
  }, {});
}

export function simulateChallenge(challengeId, inputs = {}) {
  const values = {
    a: Number(inputs.a ?? 1),
    b: Number(inputs.b ?? 0),
    cin: Number(inputs.cin ?? 0),
    select: Number(inputs.select ?? 0),
    op: Number(inputs.op ?? 0),
  };

  if (challengeId === "half-adder") {
    const sum = values.a ^ values.b;
    const carry = values.a & values.b;
    return buildSimulation({ sum, carry }, [
      `输入A=${values.a}、输入B=${values.b} 同时进入异或门和与门。`,
      `异或门产生和位 S=${sum}。`,
      `与门产生进位 C=${carry}。`,
    ]);
  }

  if (challengeId === "full-adder") {
    const first = values.a ^ values.b;
    const sum = first ^ values.cin;
    const carry = (values.a & values.b) | (values.cin & first);
    return buildSimulation({ sum, carry }, [
      `第一层异或先计算 A 异或 B=${first}。`,
      `第二层异或把临时和与 Cin=${values.cin} 合并，得到 S=${sum}。`,
      `进位逻辑判断至少两个输入为 1，得到 Cout=${carry}。`,
    ]);
  }

  if (challengeId === "multi-adder") {
    const a = Number(inputs.aNumber ?? 5);
    const b = Number(inputs.bNumber ?? 3);
    const total = a + b + values.cin;
    return buildSimulation({ sum: total & 7, carry: total > 7 ? 1 : 0 }, [
      `低位全加器先处理最低位，并把进位传给下一位。`,
      `中位全加器接收低位 Cout 作为自己的 Cin。`,
      `高位全加器输出三位结果 ${(total & 7).toString(2).padStart(3, "0")} 和总进位 ${total > 7 ? 1 : 0}。`,
    ]);
  }

  if (challengeId === "mux") {
    const output = values.select === 0 ? values.a : values.b;
    return buildSimulation({ output }, [
      `选择信号=${values.select} 进入多路选择器。`,
      values.select === 0 ? "选择器选择数据源0作为输出。" : "选择器选择数据源1作为输出。",
      `输出端Y得到 ${output}。`,
    ]);
  }

  if (challengeId === "alu") {
    const operation = values.op % 4;
    const add = values.a + values.b + values.cin;
    const resultMap = [add & 1, values.a & values.b, values.a | values.b, values.a ^ values.b];
    const result = resultMap[operation];
    return buildSimulation({ result, zero: result === 0 ? 1 : 0, carry: operation === 0 && add > 1 ? 1 : 0 }, [
      `控制位=${operation} 进入结果选择器。`,
      `加法单元和逻辑单元并行准备候选结果。`,
      `选择器输出 F=${result}，零标志=${result === 0 ? 1 : 0}，进位标志=${operation === 0 && add > 1 ? 1 : 0}。`,
    ]);
  }

  return buildSimulation({ output: values.a }, [
    `输入A=${values.a} 进入数据通路。`,
    "信号沿着连接线传递到结果端。",
    `结果端S显示 ${values.a}。`,
  ]);
}

export function gradeConnections(challengeId, connections) {
  const challenge = CHALLENGES.find((item) => item.id === challengeId);
  if (!challenge) {
    return { passed: false, errors: [{ type: "未知关卡", message: "没有找到当前关卡配置。" }], score: 0 };
  }

  const selected = new Set(connections);
  const missing = challenge.requiredConnections.filter((connection) => !selected.has(connection));
  const extraConnections = [...selected].filter((connection) => !challenge.requiredConnections.includes(connection));
  const errors = dedupeByType(
    [
      ...missing.map((connection) => challenge.hints[connection] ?? {
        type: "结构不完整",
        message: `${connection} 尚未连接。`,
      }),
      ...extraConnections.map((connection) => ({
        type: "结构冲突",
        message: `${connection} 不是本关需要的连接，请检查端口方向或移除多余连线。`,
      })),
    ],
  );
  const baseScore = Math.round(((challenge.requiredConnections.length - missing.length) / challenge.requiredConnections.length) * 100);
  const score = Math.max(0, baseScore - extraConnections.length * 10);

  return {
    passed: missing.length === 0 && extraConnections.length === 0,
    errors,
    missing,
    extraConnections,
    score,
  };
}

export function recordAttempt(progress, challengeId, result) {
  const next = structuredClone(progress);
  const current = next[challengeId];
  if (!current) return next;

  current.attempts += 1;
  current.bestScore = Math.max(current.bestScore, result.score ?? (result.passed ? 100 : 0));
  current.timeSpentMinutes = (current.timeSpentMinutes ?? 0) + Math.max(0, Number(result.elapsedMinutes ?? 0));
  current.errors.push(...(result.errors ?? []).map((error) => error.type));

  if (result.passed) {
    current.status = "completed";
    current.completedAt = "刚刚";
    const index = CHALLENGES.findIndex((challenge) => challenge.id === challengeId);
    const nextChallenge = CHALLENGES[index + 1];
    if (nextChallenge && next[nextChallenge.id].status === "locked") {
      next[nextChallenge.id].status = "in-progress";
    }
  } else if (current.status === "locked") {
    current.status = "in-progress";
  }

  return next;
}

export function summarizeLearning(challenges, progress) {
  const records = challenges.map((challenge) => progress[challenge.id]).filter(Boolean);
  const completed = records.filter((record) => record.status === "completed").length;
  const totalAttempts = records.reduce((sum, record) => sum + record.attempts, 0);
  const totalStudyMinutes = records.reduce((sum, record) => sum + (record.timeSpentMinutes ?? 0), 0);
  const errorCounts = records.flatMap((record) => record.errors).reduce((counts, type) => {
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
  const weakSpot = Object.entries(errorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "暂无高频错误";

  return {
    totalChallenges: challenges.length,
    completed,
    completionRate: Math.round((completed / challenges.length) * 100),
    totalAttempts,
    totalStudyMinutes,
    weakSpot,
    averageScore: Math.round(records.reduce((sum, record) => sum + record.bestScore, 0) / records.length),
  };
}

function buildSimulation(outputs, steps) {
  return {
    outputs,
    steps: steps.map((text, index) => ({
      id: index + 1,
      text,
      node: ["输入端", "运算部件", "输出端"][Math.min(index, 2)],
    })),
  };
}

function dedupeByType(errors) {
  const seen = new Set();
  return errors.filter((error) => {
    if (seen.has(error.type)) return false;
    seen.add(error.type);
    return true;
  });
}
