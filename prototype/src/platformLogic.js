import { encodeSignedInteger } from "./numberEncoding.js";
import { HARDWARE_GAME_PROGRESS_ITEMS } from "./hardwareGame.js";

export const CHALLENGES = [
  {
    id: "computer-components",
    title: "认识计算机五大部件",
    shortTitle: "五大部件",
    goal: "把输入、存储、运算、控制和输出五类部件放到正确位置。",
    objective: "建立计算机整机概念，知道每类部件在一次计算中的基本职责。",
    estimatedMinutes: 8,
    requiredConnections: ["输入设备->存储器", "存储器->控制器", "控制器->运算器", "运算器->存储器", "存储器->输出设备"],
    components: [
      { name: "输入设备", pins: "out", description: "把键盘、鼠标等外部信息送入计算机。" },
      { name: "存储器", pins: "in/out", description: "保存程序、数据和中间结果。" },
      { name: "控制器", pins: "in/out", description: "按指令节奏指挥各部件协同工作。" },
      { name: "运算器", pins: "in/out", description: "执行算术运算和逻辑运算。" },
      { name: "输出设备", pins: "in", description: "把计算结果呈现给用户。" },
    ],
    hints: {
      "输入设备->存储器": { type: "输入路径缺失", message: "外部输入需要先进入存储器或缓冲区，后续部件才能使用。" },
      "存储器->控制器": { type: "取指路径缺失", message: "控制器需要从存储器取得指令，才能发出控制信号。" },
      "控制器->运算器": { type: "控制路径缺失", message: "运算器需要控制器指挥，才能按指令执行运算。" },
      "运算器->存储器": { type: "结果回写缺失", message: "运算结果通常要写回存储器，供后续步骤使用。" },
      "存储器->输出设备": { type: "输出路径缺失", message: "输出设备需要从存储器或结果缓冲区取得最终结果。" },
    },
    summary: "你已经把五大部件串成一次基本计算流程。",
    principle: "冯·诺依曼计算机把程序和数据放在存储器中，由控制器取指挥发，运算器处理数据，再把结果送回存储或输出。",
  },
  {
    id: "program-flow",
    title: "程序运行路线",
    shortTitle: "运行路线",
    goal: "按顺序连接一次 1+1 计算从输入到输出的流程。",
    objective: "理解程序运行不是单个部件完成，而是输入、存储、CPU、运算器和输出协同完成。",
    estimatedMinutes: 8,
    requiredConnections: ["键盘输入->主存", "主存->CPU取指", "CPU取指->运算器执行", "运算器执行->主存回写", "主存回写->屏幕输出"],
    components: [
      { name: "键盘输入", pins: "out", description: "用户输入表达式或数据。" },
      { name: "主存", pins: "in/out", description: "保存输入、程序和中间结果。" },
      { name: "CPU取指", pins: "in/out", description: "CPU从主存取出下一条要执行的指令。" },
      { name: "运算器执行", pins: "in/out", description: "运算器完成 1+1 这类具体计算。" },
      { name: "屏幕输出", pins: "in", description: "把最终结果显示出来。" },
    ],
    hints: {
      "键盘输入->主存": { type: "输入未进入系统", message: "输入内容需要先进入主存或输入缓冲区。" },
      "主存->CPU取指": { type: "取指路径缺失", message: "CPU需要从主存取得指令，不能凭空执行。" },
      "CPU取指->运算器执行": { type: "执行路径缺失", message: "取到指令后，需要交给执行部件完成运算。" },
      "运算器执行->主存回写": { type: "回写路径缺失", message: "运算完成后，结果需要回写到主存或寄存器。" },
      "主存回写->屏幕输出": { type: "输出路径缺失", message: "屏幕显示来自最终结果，而不是直接来自键盘输入。" },
    },
    summary: "你已经完成一次程序从输入到输出的运行路线。",
    principle: "程序运行的关键是取指、译码、执行、访存和回写这些阶段按顺序协同发生。",
  },
  {
    id: "instruction-data",
    title: "指令和数据",
    shortTitle: "指令/数据",
    goal: "区分同一片内存内容在 CPU 不同阶段中为什么会被当作指令或数据。",
    objective: "理解指令和数据都以二进制存储，CPU靠访问阶段和使用方式区分它们。",
    estimatedMinutes: 8,
    requiredConnections: ["程序计数器PC->地址100", "地址100->指令寄存器IR", "地址101->操作数R1", "地址102->操作数R2", "运算结果->结果寄存器"],
    components: [
      { name: "程序计数器PC", pins: "out", description: "指出下一条要取的指令地址。" },
      { name: "地址100", pins: "in/out", description: "这里存放 ADD R1,R2，被取指阶段解释为指令。" },
      { name: "指令寄存器IR", pins: "in/out", description: "保存当前正在执行的指令。" },
      { name: "地址101", pins: "out", description: "这里存放操作数 5，被执行阶段当作数据。" },
      { name: "地址102", pins: "out", description: "这里存放操作数 7，被执行阶段当作数据。" },
      { name: "操作数R1", pins: "in/out", description: "保存第一个参与运算的数据。" },
      { name: "操作数R2", pins: "in/out", description: "保存第二个参与运算的数据。" },
      { name: "结果寄存器", pins: "in", description: "保存运算后的结果。" },
    ],
    hints: {
      "程序计数器PC->地址100": { type: "取指地址缺失", message: "PC需要先指向下一条指令所在的内存地址。" },
      "地址100->指令寄存器IR": { type: "取指路径缺失", message: "地址100中的内容要进入IR，CPU才把它当作指令解释。" },
      "地址101->操作数R1": { type: "数据读取缺失", message: "地址101在执行阶段被读取为第一个操作数。" },
      "地址102->操作数R2": { type: "数据读取缺失", message: "地址102在执行阶段被读取为第二个操作数。" },
      "运算结果->结果寄存器": { type: "结果保存缺失", message: "执行完成后需要保存运算结果。" },
    },
    summary: "你已经区分了取指阶段和取数阶段中内存内容的不同角色。",
    principle: "内存本身只保存二进制位。CPU把某段内容当作指令还是数据，取决于当前阶段和控制信号。",
  },
  {
    id: "memory-address",
    title: "\u5b58\u50a8\u5668\u4e0e\u5730\u5740\u8bbf\u95ee",
    shortTitle: "\u8bbf\u5b58\u8def\u5f84",
    goal: "\u628a\u8bbf\u95ee\u5730\u5740\u9001\u5165 MAR\uff0c\u518d\u7ecf\u4e3b\u5b58\u3001MDR \u548c CPU \u6570\u636e\u603b\u7ebf\u5b8c\u6210\u4e00\u6b21\u8bfb\u6570\u8def\u5f84\u3002",
    objective: "\u7406\u89e3 MAR \u4fdd\u5b58\u5730\u5740\u3001MDR \u6682\u5b58\u6570\u636e\uff0c\u5730\u5740\u603b\u7ebf\u548c\u6570\u636e\u603b\u7ebf\u627f\u62c5\u4e0d\u540c\u65b9\u5411\u7684\u4f20\u9012\u4efb\u52a1\u3002",
    estimatedMinutes: 10,
    requiredConnections: ["\u8bbf\u95ee\u5730\u5740->\u5730\u5740\u5bc4\u5b58\u5668MAR", "\u5730\u5740\u5bc4\u5b58\u5668MAR->\u4e3b\u5b58\u5355\u5143", "\u4e3b\u5b58\u5355\u5143->\u6570\u636e\u5bc4\u5b58\u5668MDR", "\u6570\u636e\u5bc4\u5b58\u5668MDR->CPU\u6570\u636e\u603b\u7ebf", "\u8bfb\u63a7\u5236->\u8bfb\u4f7f\u80fd\u89c2\u5bdf"],
    components: [
      { name: "\u8bbf\u95ee\u5730\u5740", pins: "out", description: "CPU \u7ed9\u51fa\u672c\u6b21\u8981\u8bfb\u53d6\u7684\u4e3b\u5b58\u5730\u5740\u3002" },
      { name: "\u5730\u5740\u5bc4\u5b58\u5668MAR", pins: "in/out", description: "\u6682\u5b58\u8bbf\u95ee\u5730\u5740\uff0c\u5e76\u901a\u8fc7\u5730\u5740\u603b\u7ebf\u9009\u62e9\u4e3b\u5b58\u5355\u5143\u3002" },
      { name: "\u4e3b\u5b58\u5355\u5143", pins: "in/out", description: "\u6839\u636e\u5730\u5740\u8f93\u51fa\u8be5\u5355\u5143\u4e2d\u4fdd\u5b58\u7684\u6570\u636e\u3002" },
      { name: "\u6570\u636e\u5bc4\u5b58\u5668MDR", pins: "in/out", description: "\u6682\u5b58\u4e3b\u5b58\u8bfb\u51fa\u7684\u6570\u636e\uff0c\u518d\u9001\u5165 CPU \u6570\u636e\u603b\u7ebf\u3002" },
      { name: "CPU\u6570\u636e\u603b\u7ebf", pins: "in", description: "\u628a\u8bfb\u51fa\u7684\u6570\u636e\u9001\u56de CPU \u5185\u90e8\u3002" },
    ],
    hints: {
      "\u8bbf\u95ee\u5730\u5740->\u5730\u5740\u5bc4\u5b58\u5668MAR": { type: "MAR \u5730\u5740\u7f3a\u5931", message: "\u8bbf\u95ee\u4e3b\u5b58\u524d\uff0c\u5730\u5740\u9700\u8981\u5148\u8fdb\u5165 MAR\u3002" },
      "\u5730\u5740\u5bc4\u5b58\u5668MAR->\u4e3b\u5b58\u5355\u5143": { type: "\u5730\u5740\u603b\u7ebf\u7f3a\u5931", message: "MAR \u8981\u901a\u8fc7\u5730\u5740\u603b\u7ebf\u9009\u62e9\u4e3b\u5b58\u5355\u5143\u3002" },
      "\u4e3b\u5b58\u5355\u5143->\u6570\u636e\u5bc4\u5b58\u5668MDR": { type: "MDR \u6570\u636e\u7f3a\u5931", message: "\u4e3b\u5b58\u8bfb\u51fa\u7684\u6570\u636e\u9700\u8981\u5148\u8fdb\u5165 MDR\u3002" },
      "\u6570\u636e\u5bc4\u5b58\u5668MDR->CPU\u6570\u636e\u603b\u7ebf": { type: "\u6570\u636e\u603b\u7ebf\u7f3a\u5931", message: "MDR \u9700\u8981\u628a\u6570\u636e\u9001\u5230 CPU \u6570\u636e\u603b\u7ebf\u3002" },
      "\u8bfb\u63a7\u5236->\u8bfb\u4f7f\u80fd\u89c2\u5bdf": { type: "\u8bfb\u63a7\u5236\u7f3a\u5931", message: "\u8bfb\u63a7\u5236\u4fe1\u53f7\u9700\u8981\u63a5\u5230\u89c2\u5bdf\u7aef\uff0c\u786e\u8ba4\u672c\u6b21\u8bbf\u95ee\u662f\u8bfb\u64cd\u4f5c\u3002" },
    },
    summary: "\u4f60\u5df2\u7ecf\u8fde\u901a\u4e00\u6b21\u4e3b\u5b58\u8bfb\u6570\u8def\u5f84\uff0c\u80fd\u533a\u5206\u5730\u5740\u8fdb\u5165 MAR \u548c\u6570\u636e\u8fdb\u5165 MDR\u3002",
    principle: "\u8bbf\u5b58\u65f6\u5730\u5740\u548c\u6570\u636e\u4e0d\u662f\u540c\u4e00\u56de\u4e8b\uff1aMAR \u4fdd\u5b58\u8981\u8bbf\u95ee\u54ea\u91cc\uff0cMDR \u4fdd\u5b58\u4ece\u90a3\u91cc\u8bfb\u51fa\u4ec0\u4e48\u3002",
  },
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
    id: "and-gate",
    title: "与门",
    shortTitle: "与门",
    goal: "连接两个输入到与门，观察 A 和 B 都为 1 时输出 Y 才为 1。",
    objective: "理解与运算的基本规则：两个条件同时成立，结果才成立。",
    estimatedMinutes: 8,
    requiredConnections: ["输入A->与门", "输入B->与门", "与门->输出Y"],
    components: [
      { name: "输入A", pins: "A", description: "提供第一个 0/1 输入信号。" },
      { name: "输入B", pins: "B", description: "提供第二个 0/1 输入信号。" },
      { name: "与门", pins: "A/B/Y", description: "只有两个输入都为 1 时输出 1。" },
    ],
    hints: {
      "输入A->与门": { type: "输入端未连接", message: "输入A没有进入与门，无法完成与运算。" },
      "输入B->与门": { type: "输入端未连接", message: "输入B没有进入与门，无法完成与运算。" },
      "与门->输出Y": { type: "输出端未连接", message: "与门结果没有接到输出Y。" },
    },
    summary: "你已完成与门实验，能观察两个输入同时为 1 时输出才为 1。",
    principle: "与门对应逻辑乘法，常用于判断多个条件是否同时满足。",
  },
  {
    id: "or-gate",
    title: "或门",
    shortTitle: "或门",
    goal: "连接两个输入到或门，观察 A 或 B 至少一个为 1 时输出 Y 为 1。",
    objective: "理解或运算的基本规则：任意一个条件成立，结果就成立。",
    estimatedMinutes: 8,
    requiredConnections: ["输入A->或门", "输入B->或门", "或门->输出Y"],
    components: [
      { name: "输入A", pins: "A", description: "提供第一个 0/1 输入信号。" },
      { name: "输入B", pins: "B", description: "提供第二个 0/1 输入信号。" },
      { name: "或门", pins: "A/B/Y", description: "只要有一个输入为 1 就输出 1。" },
    ],
    hints: {
      "输入A->或门": { type: "输入端未连接", message: "输入A没有进入或门，无法完成或运算。" },
      "输入B->或门": { type: "输入端未连接", message: "输入B没有进入或门，无法完成或运算。" },
      "或门->输出Y": { type: "输出端未连接", message: "或门结果没有接到输出Y。" },
    },
    summary: "你已完成或门实验，能观察任意输入为 1 时输出为 1。",
    principle: "或门对应逻辑加法，常用于把多条可能路径合并成一个判断结果。",
  },
  {
    id: "not-gate",
    title: "非门",
    shortTitle: "非门",
    goal: "连接输入到非门，观察 0 变 1、1 变 0 的取反关系。",
    objective: "理解非运算的基本规则：输出总是输入的相反值。",
    estimatedMinutes: 6,
    requiredConnections: ["输入A->非门", "非门->输出Y"],
    components: [
      { name: "输入A", pins: "A", description: "提供需要取反的 0/1 输入信号。" },
      { name: "非门", pins: "A/Y", description: "把输入信号反转后输出。" },
      { name: "输出Y", pins: "Y", description: "显示取反后的结果。" },
    ],
    hints: {
      "输入A->非门": { type: "输入端未连接", message: "输入A没有进入非门，无法完成取反。" },
      "非门->输出Y": { type: "输出端未连接", message: "非门结果没有接到输出Y。" },
    },
    summary: "你已完成非门实验，能观察单个信号的取反过程。",
    principle: "非门是最基础的反相器，常用于生成相反条件或控制信号。",
  },
  {
    id: "xor-gate",
    title: "异或门",
    shortTitle: "异或门",
    goal: "连接两个输入到异或门，观察 A 和 B 不同时输出 Y 为 1。",
    objective: "理解异或运算的基本规则：两个输入不同则输出 1，相同则输出 0。",
    estimatedMinutes: 10,
    requiredConnections: ["输入A->异或门", "输入B->异或门", "异或门->输出Y"],
    components: [
      { name: "输入A", pins: "A", description: "提供第一个 0/1 输入信号。" },
      { name: "输入B", pins: "B", description: "提供第二个 0/1 输入信号。" },
      { name: "异或门", pins: "A/B/Y", description: "两个输入不同时输出 1。" },
    ],
    hints: {
      "输入A->异或门": { type: "输入端未连接", message: "输入A没有进入异或门，无法比较两个输入。" },
      "输入B->异或门": { type: "输入端未连接", message: "输入B没有进入异或门，无法比较两个输入。" },
      "异或门->输出Y": { type: "输出端未连接", message: "异或门结果没有接到输出Y。" },
    },
    summary: "你已完成异或门实验，理解了半加器和位为什么来自异或逻辑。",
    principle: "异或门常用于判断两个信号是否不同，也是半加器和位 S 的核心来源。",
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
    id: "machine-number",
    title: "机器数编码",
    shortTitle: "机器数",
    goal: "把十进制整数拆成符号位和数值位，再观察原码、反码、补码的转换关系。",
    objective: "理解计算机内部为什么常用补码表示有符号整数，并知道负数补码来自反码加一。",
    estimatedMinutes: 12,
    requiredConnections: ["十进制数->符号位判断", "十进制数->数值位拆分", "符号位判断->符号位观察", "数值位拆分->反码生成器", "反码生成器->补码生成器", "补码生成器->结果寄存器"],
    components: [
      { name: "十进制数", pins: "out", description: "课堂先使用 -7 到 7 的小整数，降低表示范围难度。" },
      { name: "符号位判断", pins: "in/out", description: "正数符号位为 0，负数符号位为 1。" },
      { name: "数值位拆分", pins: "in/out", description: "把绝对值写成固定宽度二进制数值位。" },
      { name: "反码生成器", pins: "in/out", description: "正数反码不变，负数反码对数值位逐位取反。" },
      { name: "补码生成器", pins: "in/out", description: "正数补码不变，负数补码等于反码加 1。" },
      { name: "结果寄存器", pins: "in", description: "保存最终进入运算器的数据表示。" },
    ],
    hints: {
      "十进制数->符号位判断": { type: "符号位路径缺失", message: "机器数编码第一步要判断正负，得到符号位。" },
      "十进制数->数值位拆分": { type: "数值位路径缺失", message: "没有数值位就无法得到原码、反码和补码。" },
      "符号位判断->符号位观察": { type: "符号位观察缺失", message: "请把符号位接到观察端，确认正数为 0、负数为 1。" },
      "数值位拆分->反码生成器": { type: "反码数值位缺失", message: "反码生成器需要先拿到数值位。" },
      "反码生成器->补码生成器": { type: "补码输入缺失", message: "补码应当基于反码继续生成。" },
      "补码生成器->结果寄存器": { type: "结果寄存器缺失", message: "最终补码还没有写入结果寄存器。" },
    },
    summary: "你已经连通了机器数编码路径，知道负数补码需要经过符号位、反码和加一。",
    principle: "补码让减法可以转化为加法，便于复用加法器硬件；这是机器数表示和运算器结构之间的关键连接。",
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

export const LEARNING_ITEMS = [...CHALLENGES, ...HARDWARE_GAME_PROGRESS_ITEMS];

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

export function buildInitialLearningProgress() {
  return {
    ...buildInitialProgress(CHALLENGES),
    ...HARDWARE_GAME_PROGRESS_ITEMS.reduce((progress, item) => {
      progress[item.id] = {
        status: "in-progress",
        attempts: 0,
        errors: [],
        completedAt: null,
        bestScore: 0,
        timeSpentMinutes: 0,
      };
      return progress;
    }, {}),
  };
}

export function mergeProgressWithChallenges(challenges, savedProgress = {}) {
  const defaults = buildInitialProgress(challenges);
  return challenges.reduce((progress, challenge) => {
    progress[challenge.id] = {
      ...defaults[challenge.id],
      ...(savedProgress?.[challenge.id] ?? {}),
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
    address: Number(inputs.address ?? 100),
  };

  if (challengeId === "computer-components") {
    return buildSimulation({ flow: "输入-存储-控制-运算-输出" }, [
      "输入设备把外部信息送入计算机。",
      "存储器保存程序、数据和中间结果。",
      "控制器从存储器取指令并指挥运算器工作。",
      "运算器完成计算后把结果送回存储器。",
      "输出设备把最终结果呈现给用户。",
    ]);
  }

  if (challengeId === "program-flow") {
    return buildSimulation({ result: 2 }, [
      "键盘输入表达式 1+1，输入内容先进入主存或输入缓冲区。",
      "CPU从主存取出加法相关指令。",
      "控制器发出控制信号，运算器执行 1+1。",
      "结果 2 写回主存或寄存器。",
      "屏幕从结果缓冲区取得 2 并显示出来。",
    ]);
  }

  if (challengeId === "instruction-data") {
    const memory = {
      100: { stage: "取指令", text: "地址100保存 ADD R1,R2；取指阶段进入IR，所以被解释为指令。" },
      101: { stage: "取数据", text: "地址101保存 5；执行阶段读取它，所以被解释为数据。" },
      102: { stage: "取数据", text: "地址102保存 7；执行阶段读取它，所以被解释为数据。" },
    };
    const selected = memory[values.address] ?? { stage: "空地址", text: "这个地址不在示例程序片段中。" };
    return buildSimulation({ stage: selected.stage, address: values.address }, [
      "取指阶段：PC 指向地址100，CPU把其中内容送入指令寄存器IR。",
      "译码阶段：控制器把 ADD R1,R2 解释为一次加法操作。",
      "执行阶段：CPU再读取地址101和地址102，此时这些内容作为操作数数据使用。",
      selected.text,
    ]);
  }

  if (challengeId === "memory-address") {
    const memory = { 100: 42, 101: 5, 102: 7, 103: 13 };
    const data = memory[values.address] ?? 0;
    return buildSimulation({ address: values.address, data, read: 1 }, [
      `\u8bbf\u95ee\u5730\u5740 ${values.address} \u5148\u5199\u5165\u5730\u5740\u5bc4\u5b58\u5668MAR\uff0cCPU \u6682\u65f6\u53ea\u5173\u5fc3\u201c\u53bb\u54ea\u91cc\u8bfb\u201d\u3002`,
      `MAR \u901a\u8fc7\u5730\u5740\u603b\u7ebf\u9009\u62e9\u4e3b\u5b58\u5355\u5143 M(${values.address})\u3002`,
      `\u4e3b\u5b58\u628a\u6570\u636e ${data} \u9001\u5165\u6570\u636e\u5bc4\u5b58\u5668MDR\uff0c\u518d\u7531 MDR \u9001\u4e0a CPU \u6570\u636e\u603b\u7ebf\u3002`,
    ]);
  }

  if (challengeId === "and-gate") {
    const output = values.a & values.b;
    return buildSimulation({ output }, [
      `输入A=${values.a}、输入B=${values.b} 同时进入与门。`,
      `与门判断两个输入是否都为 1，得到 Y=${output}。`,
      `输出端Y显示 ${output}。`,
    ]);
  }

  if (challengeId === "or-gate") {
    const output = values.a | values.b;
    return buildSimulation({ output }, [
      `输入A=${values.a}、输入B=${values.b} 同时进入或门。`,
      `或门判断是否至少一个输入为 1，得到 Y=${output}。`,
      `输出端Y显示 ${output}。`,
    ]);
  }

  if (challengeId === "not-gate") {
    const output = values.a ^ 1;
    return buildSimulation({ output }, [
      `输入A=${values.a} 进入非门。`,
      `非门把输入取反，得到 Y=${output}。`,
      `输出端Y显示 ${output}。`,
    ]);
  }

  if (challengeId === "xor-gate") {
    const output = values.a ^ values.b;
    return buildSimulation({ output }, [
      `输入A=${values.a}、输入B=${values.b} 同时进入异或门。`,
      `异或门判断两个输入是否不同，得到 Y=${output}。`,
      `输出端Y显示 ${output}。`,
    ]);
  }

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

  if (challengeId === "machine-number") {
    const value = Number(inputs.signedValue ?? -5);
    const encoded = encodeSignedInteger(value, 4);
    return buildSimulation({ value, ...encoded }, [
      `${value} 先判断符号：非负数符号位为 0，负数符号位为 1。`,
      `把绝对值写成 3 位数值位，再得到原码 ${encoded.signMagnitude ?? "溢出"}。`,
      `正数反码不变；负数反码逐位取反，得到 ${encoded.onesComplement ?? "溢出"}。`,
      `负数补码在反码基础上加 1，最终补码为 ${encoded.twosComplement ?? "溢出"}。`,
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
    const nextChallenge = index >= 0 ? CHALLENGES[index + 1] : null;
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
