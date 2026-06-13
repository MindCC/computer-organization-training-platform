const STUDY_CARD_PRESETS = {
  "full-adder:1": {
    summary: "第一层异或门先把 A 和 B 合成临时和 X，为下一层求和做准备。",
    stages: [
      "读取输入 A 和 B。",
      "只要两个输入不同，就输出临时和 X。",
      "把 X 继续送给第二层异或门。",
    ],
    watchPoints: [
      "这里还不会直接输出最终和位。",
      "这一层的重点是先产生中间结果 X。",
    ],
  },
  "full-adder:2": {
    summary: "第二层异或门把临时和 X 与输入进位 Cin 合并，输出最终和位 S。",
    stages: [
      "接收上一层给出的临时和 X。",
      "把 X 与 Cin 再做一次异或。",
      "输出最终和位 S。",
    ],
    watchPoints: [
      "Cin 会直接影响这一层的输出。",
      "如果这一层没接 Cin，就不是真正的全加器。",
    ],
  },
  "full-adder:3": {
    summary: "进位逻辑负责判断当前三路输入是否需要向高位送出 Cout。",
    stages: [
      "同时观察 A、B 和 Cin。",
      "判断是否至少有两路输入为 1。",
      "若满足条件，就输出 Cout。",
    ],
    watchPoints: [
      "这一块决定的是输出进位，不是和位。",
      "观察 Cout 是否产生时，要同时看三路输入组合。",
    ],
  },
};

export function buildComponentStudyCard(challenge, selectedSlot, componentDetail) {
  if (!challenge || !componentDetail) {
    return {
      title: "",
      roleLabel: "",
      summary: "",
      stages: [],
      watchPoints: [],
    };
  }

  const presetKey = `${challenge.id}:${(selectedSlot?.sourceIndex ?? 0) + 1}`;
  const preset = STUDY_CARD_PRESETS[presetKey];

  if (preset) {
    return {
      title: selectedSlot?.displayLabel ?? componentDetail.name,
      roleLabel: selectedSlot?.role ?? "当前元件",
      ...preset,
    };
  }

  return {
    title: selectedSlot?.displayLabel ?? componentDetail.name,
    roleLabel: selectedSlot?.role ?? "当前元件",
    summary: componentDetail.description ?? "当前元件承担本关中的关键功能。",
    stages: [
      `观察 ${componentDetail.name} 的输入端和输出端。`,
      "确认它在当前关卡中接收了哪些信号。",
      "再结合动态演示理解它如何影响后续输出。",
    ],
    watchPoints: [
      "先看它在本关中的位置，再看它的功能说明。",
      "如果连接错误，通常会直接影响后续信号传播。",
    ],
  };
}
