export const challengeRouteMeta = {
  "computer-components": { eyebrow: "整机地图", summary: "先画一张计算机五大部件的归属图。", detail: "这一关的目标不是连线而是分类：输入、存储、控制、运算和输出各有自己的职责位置。", preview: "components", focus: "五大部件" },
  "program-flow": { eyebrow: "程序流", summary: "把 1+1 的计算路径拆成输入→运算→存储→输出的顺序。", detail: "这是学生第一次看到完整的程序执行流动路径，控制器会在中间调度每一步操作。", preview: "flow", focus: "取指 / 执行" },
  "instruction-data": { eyebrow: "指令 vs 数据", summary: "同一条内存里的二进制既可能是指令，也可能是数据。", detail: "让学生通过地址切换观察取指阶段和取数阶段引用的不同内存位置。", preview: "stepper", focus: "取指 / 译码" },
  "memory-address": { eyebrow: "地址路径", summary: "地址进 MAR，主存返回的数据进 MDR。", detail: "这一关把一个完整的主存读取流程拆成地址阶段和数据阶段，方便学生理解存储层次。", preview: "memory", focus: "MAR / MDR" },
  "data-flow": { eyebrow: "信号通道", summary: "最基本的输入输出连线，先习惯端口和信号流向。", detail: "让学生理解信号从输入端经过器件流向输出端的基本路径。", preview: "single", focus: "输入 / 输出" },
  "and-gate": { eyebrow: "与门", summary: "A 和 B 同时为 1，输出才是 1。", detail: "用一个真值表检验学生对与门逻辑的直觉。", preview: "full", focus: "与逻辑" },
  "or-gate": { eyebrow: "或门", summary: "A 或 B 只要有 1，输出就是 1。", detail: "与门之后自然而然地引出或门，让学生对比两者的输出规律。", preview: "full", focus: "或逻辑" },
  "not-gate": { eyebrow: "非门", summary: "输入取反，0 变 1，1 变 0。", detail: "单输入器件，让学生聚焦于一进一出这条最短路径。", preview: "full", focus: "取反" },
  "xor-gate": { eyebrow: "异或门", summary: "两路不同输出 1，相同输出 0。", detail: "和与门、或门放在一起对比，能帮学生快速记住三种复合逻辑的差异。", preview: "full", focus: "异或" },
  "half-adder": { eyebrow: "半加器", summary: "拆出 Sum 和 Carry 两条支路。", detail: "关键突破点：让学生看到同一个运算会同时产生两个结果。", preview: "chain", focus: "Sum / Carry" },
  "full-adder": { eyebrow: "全加器", summary: "把输入进位接进来，电路开始真正变复杂。", detail: "这是整条路线里最关键的一关，后面的串联都靠它。", preview: "full", focus: "Cin / Cout" },
  "machine-number": { eyebrow: "有符号数", summary: "把正负号、数值位、反码和补码连成进入运算器前的编码路径。", detail: "这一关用 4 位小整数讲清楚原码、反码、补码，不要求学生背大范围换算，重点是理解负数补码为什么要反码加一。", preview: "chain", focus: "原码 / 反码 / 补码" },
  "multi-adder": { eyebrow: "级联传播", summary: "低位进位会一路推着高位往前算。", detail: "你会第一次看到多个模块串起来后的计算节奏。", preview: "chain", focus: "逐级传递" },
  mux: { eyebrow: "路径切换", summary: "同一条线，什么时候走哪一路由控制信号决定。", detail: "选择器会把'连线'变成'有条件地连线'。", preview: "mux", focus: "选择信号" },
  alu: { eyebrow: "终点核心", summary: "把加法、逻辑和选择控制拼成最小 ALU。", detail: "这一关会把前面的模块全部收束成一个运算核心。", preview: "alu", focus: "结果选择" },
};

export const challengeControlMeta = {
  "data-flow": [{ key: "a", label: "输入A", type: "bit" }],
  "computer-components": [{ key: "a", label: "输入信号", type: "bit" }],
  "program-flow": [{ key: "a", label: "输入值1", type: "bit" }, { key: "b", label: "输入值2", type: "bit" }],
  "instruction-data": [{ key: "address", label: "观察地址", type: "stepper", max: 102 }],
  "memory-address": [{ key: "address", label: "访问地址", type: "stepper", min: 100, max: 103 }],
  "and-gate": [{ key: "a", label: "输入A", type: "bit" }, { key: "b", label: "输入B", type: "bit" }],
  "or-gate": [{ key: "a", label: "输入A", type: "bit" }, { key: "b", label: "输入B", type: "bit" }],
  "not-gate": [{ key: "a", label: "输入A", type: "bit" }],
  "xor-gate": [{ key: "a", label: "输入A", type: "bit" }, { key: "b", label: "输入B", type: "bit" }],
  "half-adder": [{ key: "a", label: "输入A", type: "bit" }, { key: "b", label: "输入B", type: "bit" }],
  "full-adder": [{ key: "a", label: "输入A", type: "bit" }, { key: "b", label: "输入B", type: "bit" }, { key: "cin", label: "进位Cin", type: "bit" }],
  "machine-number": [{ key: "signedValue", label: "整数", type: "stepper", min: -7, max: 7 }],
  "multi-adder": [{ key: "aNumber", label: "输入组A", type: "stepper", max: 7 }, { key: "bNumber", label: "输入组B", type: "stepper", max: 7 }, { key: "cin", label: "初始进位", type: "bit" }],
  mux: [{ key: "a", label: "数据源0", type: "bit" }, { key: "b", label: "数据源1", type: "bit" }, { key: "select", label: "选择信号", type: "stepper", max: 1 }],
  alu: [{ key: "a", label: "输入A", type: "bit" }, { key: "b", label: "输入B", type: "bit" }, { key: "cin", label: "进位Cin", type: "bit" }, { key: "op", label: "ALU控制位", type: "stepper", max: 3 }],
};

export function labDescription(challengeId) {
  const d = {
    "computer-components": "这一关先建立整机地图：输入、存储、控制、运算和输出五类部件各司其职。",
    "program-flow": "这一关把 1+1 的运行过程串起来，重点看程序如何从输入变成输出。",
    "instruction-data": "这一关解释为什么内存里的二进制既可能是指令，也可能是数据。",
    "memory-address": "这一关把一次主存读取拆成地址路径和数据路径：地址进 MAR，主存读出的数据进 MDR，再回到 CPU 数据总线。",
    "data-flow": "这一关的画布是一条最基础的信号通道，先理解输入如何走到输出。",
    "and-gate": "这一关只看与门：A 和 B 必须同时为 1，输出Y才会变成 1。",
    "or-gate": "这一关只看或门：A 和 B 只要有一路为 1，输出Y就会变成 1。",
    "not-gate": "这一关只看非门：输入A会被取反，0变1，1变0。",
    "xor-gate": "这一关只看异或门：两个输入不同输出为1，相同输出为0。",
    "half-adder": "这一关会把和位和进位拆成两条并行支路，你能直观看到两种结果是如何分工产生的。",
    "full-adder": "这一关会出现真正的进位分叉：一条线继续算和位，另一条线专门负责判断是否向高位进位。",
    "machine-number": "这一关把有符号整数进入运算器前的编码过程拆开：先判断符号位，再看原码、反码，最后得到补码。",
    "multi-adder": "这一关不再是一个模块，而是多个全加器首尾相接，重点观察进位逐级传播。",
    mux: "这一关的重点是路径选择，同一时刻两路数据都在，但只有被选择的一路会真正通过。",
    alu: "这一关会把加法、逻辑和选择控制汇总到同一块运算核心里，画布结构也会比前几关更复杂。",
  };
  return d[challengeId] ?? "观察这一关独有的电路骨架，再运行信号演示。";
}
