// Curriculum metadata stays independent of the simulator and the UI.
const lessons = [
  ["parity-check", "ch2", "三位偶校验", "连接两级异或门，生成校验位 P，使 A、B、C、P 中 1 的个数为偶数。", "第二章 · 校验编码基础（CRC 前置）", ["machine-number"]],
  ["nand-builder", "ch3", "与非门造与门", "只用两个与非门实现 Y=A·B；第二个门的两个输入可以接同一根信号。", "3.1 基本逻辑运算", ["and-gate", "not-gate"]],
  ["majority-vote", "ch3", "三输入多数表决", "至少两路输入为 1 时点亮输出灯，验证全加器的进位条件。", "3.2 加法与进位", ["full-adder"]],
  ["gate-mux", "ch3", "用门搭建选择器", "用与、或、非门实现 Sel=0 选择 D0，Sel=1 选择 D1。", "3.1 逻辑网络设计", ["mux"]],
  ["signed-overflow", "ch3", "补码溢出检测", "根据 A、B 和结果 S 的符号位检测溢出：同号相加却得到异号结果时 V=1。", "3.2 补码加法与溢出", ["machine-number", "multi-adder"]],
  ["address-decoder", "ch4", "二位地址译码", "用 A1、A0 选中四个存储单元中的一个，任意输入只允许一个选通信号为 1。", "4.2 地址译码", ["and-gate", "not-gate", "memory-address"]],
  ["register-enable", "ch4", "寄存器写使能", "构造下一拍输入：WE=0 保持旧值 Q，WE=1 写入 D。本关只搭建 Q_next 的组合逻辑。", "4.2 读写控制", ["mux", "memory-address"]],
  ["opcode-decoder", "ch5", "操作码译码器", "把两位操作码 00/01/10/11 分别译成 ADD/AND/OR/XOR，仅激活一条控制线。", "5.1 操作码与指令格式", ["address-decoder", "instruction-data"]],
  ["branch-control", "ch6", "条件分支控制", "Branch 与 Z 同时为 1 或 Jump=1 时选择目标地址，否则沿顺序路径。输出 Take 是地址选择控制位。", "6.3 组合逻辑控制器", ["alu", "cpu-datapath"]],
  ["bus-arbiter", "ch7", "总线优先级仲裁", "CPU 与 DMA 同时请求时优先授予 CPU，绝不同时授予两方；没有请求时均不授予。", "7.3 总线判优", ["system-bus", "and-gate", "not-gate"]],
  ["interrupt-mask", "ch8", "中断屏蔽控制", "设备请求 IRQ=1、允许中断 IE=1 且 Mask=0 时，才向 CPU 发出中断请求。", "8.5 中断方式", ["io-transfer", "and-gate", "not-gate"]],
  ["io-handshake", "ch8", "查询传送握手", "Ready 与 Read 同时为 1 时 Accept=1 并传送数据 D；其余情况 Accept=0，数据输出为 0。", "8.4 接口与程序查询", ["io-transfer"]],
];

export const WORKBENCH_CHALLENGES = lessons.map(([id, chapterId, title, goal, section, prerequisites]) => ({
  id, chapterId, title, shortTitle: title, goal, objective: goal, section, prerequisites,
  grading: "graded", estimatedMinutes: 12, requiredConnections: [], components: [], hints: {},
  summary: `你已完成${title}，并通过全部输入组合检测。`, principle: goal,
}));

export const WORKBENCH_LESSONS = Object.fromEntries(WORKBENCH_CHALLENGES.map(item => [item.id, item]));
