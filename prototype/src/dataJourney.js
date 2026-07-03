export const JOURNEY_CHALLENGE_IDS = ["computer-components", "program-flow", "instruction-data"];

export const DATA_JOURNEY_STEPS = [
  {
    id: "birth-input",
    challengeIds: ["computer-components", "program-flow"],
    title: "数据进入计算机",
    transfer: "Input -> Memory",
    activeUnit: "输入设备",
    signalType: "数据",
    description: "外部输入先进入系统，再被写入主存，等待 CPU 按程序处理。",
    registers: ["输入缓冲 = 1", "主存写入准备"],
    checkpoint: {
      question: "为什么输入设备不能直接替代存储器？",
      answer: "输入设备只负责把外部信息送入系统，程序和数据需要放入存储器才能被 CPU 按地址访问。",
    },
  },
  {
    id: "pc-to-mar",
    challengeIds: ["program-flow", "instruction-data"],
    title: "取指令地址",
    transfer: "PC -> MAR",
    activeUnit: "PC / MAR",
    signalType: "地址",
    description: "程序计数器 PC 给出下一条指令的地址，地址先送入 MAR。",
    registers: ["PC = 0", "MAR = 0"],
    checkpoint: {
      question: "PC 保存的是指令本身，还是指令地址？",
      answer: "PC 保存下一条要执行指令的地址，不直接保存指令内容。",
    },
  },
  {
    id: "memory-to-mdr",
    challengeIds: ["program-flow", "instruction-data"],
    title: "读取主存内容",
    transfer: "M(MAR) -> MDR",
    activeUnit: "主存 / MDR",
    signalType: "数据",
    description: "主存按 MAR 中的地址读出内容，先放到 MDR 中暂存。",
    registers: ["MAR = 0", "MDR = 指令字"],
    checkpoint: {
      question: "MDR 为什么既可能放指令，也可能放数据？",
      answer: "MDR 只是主存读写缓冲，读出的二进制由当前阶段决定如何解释。",
    },
  },
  {
    id: "mdr-to-ir",
    challengeIds: ["instruction-data"],
    title: "指令送入 IR",
    transfer: "MDR -> IR",
    activeUnit: "IR",
    signalType: "指令",
    description: "取指阶段读出的内容会进入指令寄存器 IR，准备被控制器译码。",
    registers: ["IR = 当前指令", "MDR = 指令字"],
    checkpoint: {
      question: "为什么数据不能直接送入 IR 当作操作数？",
      answer: "IR 面向控制器译码，操作数应进入数据通路或通用寄存器，而不是指令寄存器。",
    },
  },
  {
    id: "cu-decode",
    challengeIds: ["instruction-data"],
    title: "控制器译码",
    transfer: "OP(IR) -> CU",
    activeUnit: "CU",
    signalType: "控制",
    description: "控制器读取 IR 中的操作码，发出取数、运算或存储等控制信号。",
    registers: ["OP = 取数/运算", "控制信号 = 有效"],
    checkpoint: {
      question: "同样是二进制，CPU 如何知道它是指令？",
      answer: "取指阶段进入 IR 的内容会被控制器按操作码解释，因此被当作指令。",
    },
  },
  {
    id: "operand-fetch",
    challengeIds: ["instruction-data"],
    title: "取得操作数",
    transfer: "Ad(IR) -> MAR",
    activeUnit: "MAR / 主存",
    signalType: "地址",
    description: "执行阶段把指令中的地址码送入 MAR，再从主存读取操作数。",
    registers: ["MAR = 操作数地址", "MDR = 操作数"],
    checkpoint: {
      question: "取指地址和取数地址有什么区别？",
      answer: "取指地址来自 PC，取数地址来自指令地址码或寻址方式计算结果。",
    },
  },
  {
    id: "alu-execute",
    challengeIds: ["program-flow", "instruction-data"],
    title: "ALU 执行运算",
    transfer: "ACC + MDR -> ALU",
    activeUnit: "ALU",
    signalType: "数据",
    description: "操作数进入运算器，ALU 根据控制信号执行加法、逻辑或其他运算。",
    registers: ["ACC = 6", "MDR = 1", "ALU输出 = 7"],
    checkpoint: {
      question: "ALU 自己决定做加法还是逻辑运算吗？",
      answer: "不是。ALU 按控制器发出的控制信号选择具体运算。",
    },
  },
  {
    id: "write-back",
    challengeIds: ["computer-components", "program-flow", "instruction-data"],
    title: "结果回写与输出",
    transfer: "ALU -> ACC -> Memory",
    activeUnit: "ACC / 主存",
    signalType: "数据",
    description: "运算结果先进入寄存器，再按需要写回主存或送到输出设备。",
    registers: ["ACC = 7", "M(结果地址) = 7"],
    checkpoint: {
      question: "为什么计算结果通常要先进入寄存器？",
      answer: "寄存器速度快，适合暂存 ALU 结果，再由后续指令决定是否写回主存或输出。",
    },
  },
];

export function getJourneyStepsForChallenge(challengeId) {
  if (!JOURNEY_CHALLENGE_IDS.includes(challengeId)) return [];
  return DATA_JOURNEY_STEPS.filter((step) => step.challengeIds.includes(challengeId));
}

export function buildTeacherJourneyGuidance(challengeStats = []) {
  const journeyStats = challengeStats
    .filter((item) => JOURNEY_CHALLENGE_IDS.includes(item.challengeId))
    .sort((left, right) => right.incompleteCount - left.incompleteCount || left.averageScore - right.averageScore);
  const focus = journeyStats[0];

  if (!focus || focus.incompleteCount === 0) {
    return {
      title: "数据旅程理解稳定",
      action: "概述关卡完成情况较好，可把课堂时间转向门电路和加法器结构搭建。",
    };
  }

  const titleMap = {
    "computer-components": "认识计算机五大部件",
    "program-flow": "程序运行路线",
    "instruction-data": "指令和数据",
  };

  return {
    title: "取指-译码-执行流程需要回讲",
    action: `建议围绕「${titleMap[focus.challengeId] ?? focus.challengeId}」回讲 PC -> MAR、M(MAR) -> MDR、MDR -> IR 和 CU 译码，再让学生复述指令与数据的区别。`,
  };
}
