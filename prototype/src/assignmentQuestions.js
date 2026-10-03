/**
 * 课后作业「按章练习」题库 —— 8 章静态题库 + 代码判分。
 *
 * 每章至少 5 题，按知识点覆盖调整上限；choice / truefalse / fill 混合。
 * 每题都标注对应知识点 kpId（见 knowledgePoints.js），判分全部由代码计算：
 *   - choice / truefalse：与标准答案精确比对；
 *   - fill：关键词组匹配（组内同义词任一命中），多空题按命中组数比例给分；
 *     判分前会归一化（去空白、转小写），所以 "MAR"/"mar"/" mar " 都算命中。
 * 答案必须与题目逻辑一致：新增题目后请跑 src/assignmentQuestions.test.mjs。
 */

import { COURSE_CHAPTERS } from "./courseChapters.js";
import { KNOWLEDGE_POINTS, knowledgePointOf } from "./knowledgePoints.js";
import { CURRICULUM_QUESTIONS } from './circuit/curriculumQuestions.js';

export const QUESTION_TYPES = Object.freeze(["choice", "truefalse", "fill"]);

export const QUESTION_TYPE_LABELS = Object.freeze({
  choice: "单选",
  truefalse: "判断",
  fill: "填空",
});

export const ASSIGNMENT_QUESTIONS = Object.freeze([
  // ---- 第一章 绪论（kp-computer-components / kp-program-flow） ----
  {
    id: "ch1-q01", chapterId: "ch1", kpId: "kp-computer-components", type: "choice", score: 10,
    stem: "冯·诺依曼体系结构的核心思想是？",
    options: ["存储程序和程序控制", "以运算器为中心", "采用十进制运算", "硬件与软件完全分离"],
    answer: "存储程序和程序控制",
    analysis: "冯·诺依曼机把程序和数据以二进制形式存入存储器、按地址访问，由控制器自动逐条取出执行，即「存储程序、程序控制」。",
  },
  {
    id: "ch1-q02", chapterId: "ch1", kpId: "kp-computer-components", type: "choice", score: 10,
    stem: "下列哪一项不属于冯·诺依曼计算机的五大部件？",
    options: ["运算器", "控制器", "存储器", "总线"],
    answer: "总线",
    analysis: "五大部件是运算器、控制器、存储器、输入设备、输出设备；总线是连接各部件的公共通路，不在五大部件之列。",
  },
  {
    id: "ch1-q03", chapterId: "ch1", kpId: "kp-program-flow", type: "truefalse", score: 10,
    stem: "在冯·诺依曼结构中，指令和数据都以二进制形式存放在同一个存储器中。",
    answer: "true",
    analysis: "存储程序原理：指令与数据同等存放、按地址访问，CPU 靠取指/执行等不同阶段来区分它们。",
  },
  {
    id: "ch1-q04", chapterId: "ch1", kpId: "kp-computer-components", type: "truefalse", score: 10,
    stem: "在计算机五大部件中，负责从存储器中取出指令并进行译码的是运算器。",
    answer: "false",
    analysis: "取指与译码由控制器完成；运算器负责算术运算和逻辑运算。",
  },
  {
    id: "ch1-q05", chapterId: "ch1", kpId: "kp-computer-components", type: "fill", score: 15,
    stem: "计算机硬件系统由运算器、控制器、存储器、____设备和____设备五大部件组成。",
    keywords: [["输入"], ["输出"]],
    analysis: "五大部件：运算器、控制器、存储器、输入设备、输出设备。",
  },
  {
    id: "ch1-q06", chapterId: "ch1", kpId: "kp-program-flow", type: "choice", score: 10,
    stem: "一次「输入 1+1 并显示结果」的计算流程中，运算器的计算结果通常先写回哪里，再交给输出设备显示？",
    options: ["存储器", "键盘", "控制器", "输入设备"],
    answer: "存储器",
    analysis: "运算结果先写回存储器（或结果缓冲），输出设备再从存储器取出结果显示，保证中间结果可被后续指令复用。",
  },

  // ---- 第二章 计算机中数的表示（kp-machine-number） ----
  {
    id: "ch2-q01", chapterId: "ch2", kpId: "kp-machine-number", type: "choice", score: 10,
    stem: "二进制数 1011.01 转换为十进制数是？",
    options: ["11.25", "13.25", "11.5", "12.25"],
    answer: "11.25",
    analysis: "1011₂ = 8+2+1 = 11，0.01₂ = 0.25，合计 11.25。",
  },
  {
    id: "ch2-q02", chapterId: "ch2", kpId: "kp-machine-number", type: "choice", score: 10,
    stem: "8 位补码能表示的有符号整数范围是？",
    options: ["-128 ~ 127", "-127 ~ 128", "0 ~ 255", "-255 ~ 255"],
    answer: "-128 ~ 127",
    analysis: "n 位补码范围是 -2ⁿ⁻¹ ~ 2ⁿ⁻¹-1，8 位即 -128 ~ 127。",
  },
  {
    id: "ch2-q03", chapterId: "ch2", kpId: "kp-machine-number", type: "truefalse", score: 10,
    stem: "负数的补码等于其反码加 1。",
    answer: "true",
    analysis: "负数补码 = 原码符号位不变、数值位取反（反码）后再加 1。",
  },
  {
    id: "ch2-q04", chapterId: "ch2", kpId: "kp-machine-number", type: "choice", score: 10,
    stem: "8 位补码 11111111 表示的十进制数是？",
    options: ["-1", "-127", "255", "-0"],
    answer: "-1",
    analysis: "11111111 减 1 得 11111110，取反得 00000001 = 1，故原数为 -1。",
  },
  {
    id: "ch2-q05", chapterId: "ch2", kpId: "kp-machine-number", type: "truefalse", score: 10,
    stem: "IEEE 754 单精度浮点数由符号位、阶码和尾数三部分组成。",
    answer: "true",
    analysis: "IEEE 754 单精度：1 位符号位 + 8 位阶码 + 23 位尾数。",
  },
  {
    id: "ch2-q06", chapterId: "ch2", kpId: "kp-machine-number", type: "fill", score: 15,
    stem: "判断补码加减法是否溢出，常用双符号位法和____判断法。",
    keywords: [["进位"]],
    analysis: "两种常用溢出判断：双符号位法（两符号位不同即溢出）与进位判断法（符号位进位与最高数值位进位不同即溢出）。",
  },
  {
    id: "ch2-q07", chapterId: "ch2", kpId: "kp-machine-number", type: "choice", score: 10,
    stem: "十进制数 -5 的 8 位补码是？",
    options: ["11111011", "10000101", "11111010", "10000100"],
    answer: "11111011",
    analysis: "-5 原码 10000101 → 反码 11111010 → 补码加 1 得 11111011。",
  },

  // ---- 第三章 运算单元设计（数据流 + 门 + 加法器 + 选择器 + ALU） ----
  {
    id: "ch3-q01", chapterId: "ch3", kpId: "kp-and-gate", type: "choice", score: 10,
    stem: "与门输入 A=1、B=0 时，输出 Y=？",
    options: ["0", "1", "高阻态", "取决于时钟"],
    answer: "0",
    analysis: "与门只有全部输入都为 1 时输出才为 1；任一输入为 0 输出即为 0。",
  },
  {
    id: "ch3-q02", chapterId: "ch3", kpId: "kp-or-gate", type: "choice", score: 10,
    stem: "或门输入 A=0、B=1 时，输出 Y=？",
    options: ["1", "0", "高阻态", "保持上一拍的值"],
    answer: "1",
    analysis: "或门任一输入为 1 输出即为 1；全部输入为 0 时输出才为 0。",
  },
  {
    id: "ch3-q03", chapterId: "ch3", kpId: "kp-xor-gate", type: "truefalse", score: 10,
    stem: "异或门在两个输入相同时输出 1。",
    answer: "false",
    analysis: "异或门在两个输入不同（一个 0 一个 1）时输出 1，相同时输出 0——所以它正好可以当「半加和」用。",
  },
  {
    id: "ch3-q04", chapterId: "ch3", kpId: "kp-data-flow", type: "choice", score: 10,
    stem: "在运算单元的数据通路中，「数据流」指的是？",
    options: ["数据在各功能部件之间按控制信号有序传送的过程", "数据只在存储器内部移动", "网络中的数据包传输", "程序源代码的编写顺序"],
    answer: "数据在各功能部件之间按控制信号有序传送的过程",
    analysis: "数据流是运算器、寄存器、存储器、总线等部件之间按节拍传送数据的路径，理解它才能看懂加法器与 ALU 的搭建。",
  },
  {
    id: "ch3-q05", chapterId: "ch3", kpId: "kp-half-adder", type: "truefalse", score: 10,
    stem: "半加器中，和 S = A⊕B，进位 C = A·B。",
    answer: "true",
    analysis: "S 用异或门实现（不同为 1），C 用与门实现（都为 1 才进位）——这就是「半加器 = 异或门 + 与门」的来历。",
  },
  {
    id: "ch3-q06", chapterId: "ch3", kpId: "kp-full-adder", type: "choice", score: 10,
    stem: "全加器与半加器的主要区别在于全加器还考虑了？",
    options: ["低位来的进位输入", "更多的输出端", "时钟信号", "使能信号"],
    answer: "低位来的进位输入",
    analysis: "全加器有三个输入：加数 A、加数 B 和低位进位 Cin，输出和 S 与进位 Cout。",
  },
  {
    id: "ch3-q07", chapterId: "ch3", kpId: "kp-multi-adder", type: "choice", score: 10,
    stem: "用全加器级联构建一个 8 位行波进位加法器，需要多少个全加器？",
    options: ["8 个", "4 个", "16 个", "1 个"],
    answer: "8 个",
    analysis: "n 位加法器由 n 个全加器级联，低位进位 Cout 接高位 Cin，逐位传递。",
  },
  {
    id: "ch3-q08", chapterId: "ch3", kpId: "kp-mux", type: "choice", score: 10,
    stem: "一个 2 选 1 多路选择器需要几位选择控制信号？",
    options: ["1 位", "2 位", "4 位", "8 位"],
    answer: "1 位",
    analysis: "2ⁿ 选 1 需要 n 位选择信号，2 选 1 只需 1 位；多路选择器可由与门、或门、非门组合而成。",
  },
  {
    id: "ch3-q09", chapterId: "ch3", kpId: "kp-alu", type: "truefalse", score: 10,
    stem: "ALU（算术逻辑单元）既能执行加、减等算术运算，也能执行与、或、非等逻辑运算。",
    answer: "true",
    analysis: "ALU = 算术运算 + 逻辑运算，靠功能选择信号在多路选择器中挑选本次要输出的运算结果。",
  },
  {
    id: "ch3-q10", chapterId: "ch3", kpId: "kp-not-gate", type: "fill", score: 15,
    stem: "非门（反相器）只有____个输入端，输出始终与输入相反。",
    keywords: [["1", "一"]],
    analysis: "非门是单输入单输出器件：输入 0 输出 1，输入 1 输出 0。",
  },

  // ---- 第四章 存储器系统（kp-memory-address） ----
  {
    id: "ch4-q01", chapterId: "ch4", kpId: "kp-memory-address", type: "choice", score: 10,
    stem: "下列存储器层次从快到慢排列正确的是？",
    options: ["寄存器→Cache→主存→辅存", "Cache→寄存器→主存→辅存", "主存→Cache→寄存器→辅存", "寄存器→主存→Cache→辅存"],
    answer: "寄存器→Cache→主存→辅存",
    analysis: "越靠近 CPU 速度越快、容量越小、单位成本越高：寄存器→Cache→主存→磁盘等辅存。",
  },
  {
    id: "ch4-q02", chapterId: "ch4", kpId: "kp-memory-address", type: "choice", score: 10,
    stem: "Cache 能显著提高访存速度，主要利用了程序的什么原理？",
    options: ["局部性原理", "并行性原理", "冗余校验原理", "中断原理"],
    answer: "局部性原理",
    analysis: "时间局部性（刚用过的还会再用）与空间局部性（附近的也会被用）使小块 Cache 能命中大部分访问。",
  },
  {
    id: "ch4-q03", chapterId: "ch4", kpId: "kp-memory-address", type: "truefalse", score: 10,
    stem: "DRAM 靠电容存储电荷，会因漏电而丢失信息，因此需要定期刷新。",
    answer: "true",
    analysis: "DRAM 通常要求 2ms 内完成全部行刷新；SRAM 靠触发器保存信息，不需要刷新。",
  },
  {
    id: "ch4-q04", chapterId: "ch4", kpId: "kp-memory-address", type: "choice", score: 10,
    stem: "下列哪种不是 Cache 与主存之间的地址映像方式？",
    options: ["顺序映像", "直接映像", "全相联映像", "组相联映像"],
    answer: "顺序映像",
    analysis: "三种地址映像：直接映像（快但冲突多）、全相联映像（灵活但查找成本高）、组相联映像（折中）。",
  },
  {
    id: "ch4-q05", chapterId: "ch4", kpId: "kp-memory-address", type: "fill", score: 15,
    stem: "访问主存时，要访问的地址先送入寄存器____（填英文缩写），读出的数据则暂存于寄存器____（填英文缩写）。",
    keywords: [["mar"], ["mdr"]],
    analysis: "MAR 保存「访问哪里」（地址），MDR 暂存「读出/写入什么」（数据），两者分工不同。",
  },
  {
    id: "ch4-q06", chapterId: "ch4", kpId: "kp-memory-address", type: "choice", score: 10,
    stem: "页式虚拟存储器中，实现虚拟地址到物理地址转换的关键数据结构是？",
    options: ["页表", "段表", "中断向量表", "指令寄存器"],
    answer: "页表",
    analysis: "页表记录虚页号到物理页框号的映射，地址变换机构据此完成虚实地址转换。",
  },
  {
    id: "ch4-q07", chapterId: "ch4", kpId: "kp-memory-address", type: "truefalse", score: 10,
    stem: "全相联映像中，主存的任意一块可以放入 Cache 的任意行，方式灵活但查找成本高。",
    answer: "true",
    analysis: "全相联映像冲突最少、最灵活，但需要并行比较所有行的标记，硬件成本高、查找慢。",
  },

  // ---- 第五章 指令系统（kp-instruction-data） ----
  {
    id: "ch5-q01", chapterId: "ch5", kpId: "kp-instruction-data", type: "choice", score: 10,
    stem: "一条机器指令通常由哪两部分组成？",
    options: ["操作码和地址码", "源操作数和目的操作数", "指令和数据", "主存地址和寄存器号"],
    answer: "操作码和地址码",
    analysis: "操作码指明「做什么」（加、减、传送……），地址码指明「操作数在哪里」。",
  },
  {
    id: "ch5-q02", chapterId: "ch5", kpId: "kp-instruction-data", type: "choice", score: 10,
    stem: "采用立即寻址时，操作数位于？",
    options: ["指令的地址码字段中", "主存单元中", "通用寄存器中", "堆栈栈顶"],
    answer: "指令的地址码字段中",
    analysis: "立即寻址把操作数直接写在指令里，取指后即得操作数，速度最快。",
  },
  {
    id: "ch5-q03", chapterId: "ch5", kpId: "kp-instruction-data", type: "truefalse", score: 10,
    stem: "RISC 采用 Load/Store 架构，指令简单、定长，只有取数/存数指令访问主存。",
    answer: "true",
    analysis: "RISC 特点：指令简单定长、Load/Store 架构、多通用寄存器，便于流水实现。",
  },
  {
    id: "ch5-q04", chapterId: "ch5", kpId: "kp-instruction-data", type: "truefalse", score: 10,
    stem: "间接寻址中，指令地址码字段直接给出的就是操作数本身。",
    answer: "false",
    analysis: "间接寻址的地址码给出的是「操作数地址的地址」，需要两次（或多次）访存才能取到操作数。",
  },
  {
    id: "ch5-q05", chapterId: "ch5", kpId: "kp-instruction-data", type: "choice", score: 10,
    stem: "相对寻址中，有效地址 = 形式地址 + 哪个寄存器的内容？",
    options: ["程序计数器 PC", "基址寄存器", "变址寄存器", "堆栈指针 SP"],
    answer: "程序计数器 PC",
    analysis: "相对寻址以 PC 为基准加偏移量，常用于跳转指令，便于程序浮动装配。",
  },
  {
    id: "ch5-q06", chapterId: "ch5", kpId: "kp-instruction-data", type: "fill", score: 15,
    stem: "基址寻址中，有效地址等于基址寄存器的内容加上指令中的____地址（亦称偏移量/位移量）。",
    keywords: [["形式地址", "偏移量", "位移量"]],
    analysis: "EA = (基址寄存器) + 形式地址；基址寄存器内容由操作系统设定，面向程序的浮动定位。",
  },
  {
    id: "ch5-q07", chapterId: "ch5", kpId: "kp-instruction-data", type: "choice", score: 10,
    stem: "指令寻址（确定下一条指令地址）的两种基本方式是？",
    options: ["顺序寻址和跳跃寻址", "直接寻址和间接寻址", "立即寻址和寄存器寻址", "基址寻址和变址寻址"],
    answer: "顺序寻址和跳跃寻址",
    analysis: "指令寻址分顺序（PC+1 逐条执行）与跳跃（跳转/分支/调用）两种；其余选项都是数据寻址方式。",
  },

  // ---- 第六章 CPU的结构与设计（kp-cpu-datapath） ----
  {
    id: "ch6-q01", chapterId: "ch6", kpId: "kp-cpu-datapath", type: "choice", score: 10,
    stem: "CPU 执行一条指令的典型五个阶段，顺序正确的是？",
    options: ["取指→译码→执行→访存→写回", "译码→取指→执行→访存→写回", "取指→执行→译码→写回→访存", "取指→译码→访存→执行→写回"],
    answer: "取指→译码→执行→访存→写回",
    analysis: "五阶段：IF 取指 → ID 译码 → EX 执行 → MEM 访存 → WB 写回，这也是经典五级流水的划分。",
  },
  {
    id: "ch6-q02", chapterId: "ch6", kpId: "kp-cpu-datapath", type: "choice", score: 10,
    stem: "指令周期、机器周期、时钟周期三者的大小关系是？",
    options: ["指令周期 > 机器周期 > 时钟周期", "时钟周期 > 机器周期 > 指令周期", "机器周期 > 指令周期 > 时钟周期", "三者始终相等"],
    answer: "指令周期 > 机器周期 > 时钟周期",
    analysis: "一个指令周期含若干机器周期，一个机器周期含若干时钟周期（节拍）。",
  },
  {
    id: "ch6-q03", chapterId: "ch6", kpId: "kp-cpu-datapath", type: "truefalse", score: 10,
    stem: "组合逻辑控制器速度快，但控制逻辑固定，设计完成后不易修改。",
    answer: "true",
    analysis: "组合逻辑控制器用门电路直接产生控制信号，快但不灵活；微程序控制器用控存存放微指令，灵活但慢。",
  },
  {
    id: "ch6-q04", chapterId: "ch6", kpId: "kp-cpu-datapath", type: "truefalse", score: 10,
    stem: "程序计数器 PC 中保存的是当前正在执行的那条指令。",
    answer: "false",
    analysis: "PC 保存的是下一条待取指令的地址；当前正在执行的指令保存在指令寄存器 IR 中。",
  },
  {
    id: "ch6-q05", chapterId: "ch6", kpId: "kp-cpu-datapath", type: "choice", score: 10,
    stem: "取指阶段从主存读出的指令，最终放入哪个寄存器供控制器译码？",
    options: ["指令寄存器 IR", "地址寄存器 MAR", "程序计数器 PC", "状态寄存器 PSW"],
    answer: "指令寄存器 IR",
    analysis: "取指路径 M[PC]→MDR→IR：指令经数据寄存器 MDR 送入 IR，由 IR 保存当前指令供译码。",
  },
  {
    id: "ch6-q06", chapterId: "ch6", kpId: "kp-cpu-datapath", type: "fill", score: 15,
    stem: "控制器按实现方式可分为组合逻辑控制器和____控制器。",
    keywords: [["微程序"]],
    analysis: "微程序控制器把每条机器指令对应为一段微指令序列存放在控制存储器中，灵活、易扩展。",
  },
  {
    id: "ch6-q07", chapterId: "ch6", kpId: "kp-cpu-datapath", type: "choice", score: 10,
    stem: "在典型 CPU 数据通路中，ALU 的两个操作数通常来自？",
    options: ["寄存器堆（通用寄存器）", "输出设备", "地址总线", "中断系统"],
    answer: "寄存器堆（通用寄存器）",
    analysis: "ALU 从寄存器堆取操作数，运算结果经内部总线写回寄存器堆，这是数据通路的核心环路。",
  },

  // ---- 第七章 系统总线（kp-system-bus） ----
  {
    id: "ch7-q01", chapterId: "ch7", kpId: "kp-system-bus", type: "choice", score: 10,
    stem: "系统总线按传送信息的类型可分为哪三类？",
    options: ["数据总线、地址总线、控制总线", "片内总线、系统总线、通信总线", "单总线、双总线、多总线", "同步总线、异步总线、半同步总线"],
    answer: "数据总线、地址总线、控制总线",
    analysis: "按信息类型分：数据总线（双向）、地址总线（单向）、控制总线；按连接范围才是片内/系统/通信总线。",
  },
  {
    id: "ch7-q02", chapterId: "ch7", kpId: "kp-system-bus", type: "choice", score: 10,
    stem: "关于地址总线，下列说法正确的是？",
    options: ["单向传输，由 CPU 发出地址", "双向传输数据", "专门传送中断请求", "其位数决定数据字长"],
    answer: "单向传输，由 CPU 发出地址",
    analysis: "地址总线单向（CPU→存储器/设备），其位数决定可直接寻址的空间大小；数据总线才是双向的。",
  },
  {
    id: "ch7-q03", chapterId: "ch7", kpId: "kp-system-bus", type: "truefalse", score: 10,
    stem: "链式查询判优方式结构简单、易于扩充设备，但优先级固定且对电路故障敏感。",
    answer: "true",
    analysis: "链式查询只需很少几根线，但离总线控制器近的设备优先级永远最高，且查询链断一处全链失效。",
  },
  {
    id: "ch7-q04", chapterId: "ch7", kpId: "kp-system-bus", type: "choice", score: 10,
    stem: "下列哪种不属于集中式总线判优的三种常用方式？",
    options: ["随机分配", "链式查询", "计数器定时查询", "独立请求"],
    answer: "随机分配",
    analysis: "集中式判优三法：链式查询、计数器定时查询、独立请求方式。",
  },
  {
    id: "ch7-q05", chapterId: "ch7", kpId: "kp-system-bus", type: "truefalse", score: 10,
    stem: "异步通信采用请求—应答（握手）方式，适合速度差异较大的设备之间传送数据。",
    answer: "true",
    analysis: "异步握手不要求统一时钟，主设备发请求、从设备回应答，速度不匹配的设备也能可靠传送。",
  },
  {
    id: "ch7-q06", chapterId: "ch7", kpId: "kp-system-bus", type: "fill", score: 15,
    stem: "独立请求判优方式响应速度最快，但每个设备都需要独立的请求线和允许线，因此需要的____数量最多。",
    keywords: [["控制线", "信号线", "请求线", "连线"]],
    analysis: "独立请求方式每个设备一对请求/允许线，n 个设备约需 2n 条控制线，线数最多但判优最快。",
  },
  {
    id: "ch7-q07", chapterId: "ch7", kpId: "kp-system-bus", type: "choice", score: 10,
    stem: "单总线结构最主要的缺点是？",
    options: ["所有部件共享一条总线，同一时刻只能一对部件通信，易成带宽瓶颈", "成本太高", "无法连接 I/O 设备", "必须配合复杂的判优电路"],
    answer: "所有部件共享一条总线，同一时刻只能一对部件通信，易成带宽瓶颈",
    analysis: "单总线结构简单、成本低，但所有部件分时共享，高速部件会被低速部件拖累。",
  },

  // ---- 第八章 输入输出系统（kp-io-transfer） ----
  {
    id: "ch8-q01", chapterId: "ch8", kpId: "kp-io-transfer", type: "choice", score: 10,
    stem: "程序查询、中断、DMA 三种 I/O 数据传送方式中，CPU 效率最低的是？",
    options: ["程序查询", "中断", "DMA", "三者效率相同"],
    answer: "程序查询",
    analysis: "程序查询中 CPU 主动轮询设备状态，大量时间空转等待；中断由设备主动通知，DMA 几乎不占 CPU。",
  },
  {
    id: "ch8-q02", chapterId: "ch8", kpId: "kp-io-transfer", type: "choice", score: 10,
    stem: "DMA 方式最适合哪类设备的数据传送？",
    options: ["高速块设备（如磁盘）", "低速字符设备（如键盘）", "慢速传感器", "LED 指示灯"],
    answer: "高速块设备（如磁盘）",
    analysis: "DMA 适合高速成块传送；低速字符设备用中断更合适，避免频繁建立 DMA 的开销。",
  },
  {
    id: "ch8-q03", chapterId: "ch8", kpId: "kp-io-transfer", type: "truefalse", score: 10,
    stem: "中断方式下，I/O 设备准备好数据后主动向 CPU 发出中断请求，CPU 无需反复查询设备状态。",
    answer: "true",
    analysis: "中断方式让 CPU 与设备并行工作：设备就绪才打断 CPU，CPU 平时可执行其他程序。",
  },
  {
    id: "ch8-q04", chapterId: "ch8", kpId: "kp-io-transfer", type: "truefalse", score: 10,
    stem: "DMA 传送过程中，数据的搬运仍需要 CPU 逐条执行指令完成。",
    answer: "false",
    analysis: "DMA 由 DMA 控制器直接接管总线完成主存与设备间的数据搬运（周期挪用），CPU 不参与传送本身。",
  },
  {
    id: "ch8-q05", chapterId: "ch8", kpId: "kp-io-transfer", type: "fill", score: 15,
    stem: "CPU 响应中断后，中断处理过程的第一步通常是____中断（防止保存现场期间被新中断打断）。",
    keywords: [["关中断", "屏蔽中断", "禁止中断"]],
    analysis: "中断处理流程：关中断→保存断点/现场→识别中断源→执行服务程序→恢复现场→开中断→返回。",
  },
  {
    id: "ch8-q06", chapterId: "ch8", kpId: "kp-io-transfer", type: "choice", score: 10,
    stem: "DMA 传送过程的三个阶段，正确顺序是？",
    options: ["预处理→数据传送→后处理", "数据传送→预处理→后处理", "后处理→预处理→数据传送", "预处理→后处理→数据传送"],
    answer: "预处理→数据传送→后处理",
    analysis: "预处理（CPU 设定传送参数）→ DMA 控制器完成数据传送 → 后处理（DMA 结束中断，CPU 校验收尾）。",
  },
  {
    id: "ch8-q07", chapterId: "ch8", kpId: "kp-io-transfer", type: "choice", score: 10,
    stem: "下列哪项不是 I/O 接口的基本功能？",
    options: ["执行算术运算", "数据缓冲", "信号格式转换", "设备选择（地址译码）"],
    answer: "执行算术运算",
    analysis: "I/O 接口负责数据缓冲、信号转换、设备选择等；算术运算是运算器（ALU）的职责。",
  },
  ...CURRICULUM_QUESTIONS,
]);

const VALID_CHAPTER_IDS = new Set(COURSE_CHAPTERS.map((chapter) => chapter.id));
const KP_IDS = new Set(KNOWLEDGE_POINTS.map((kp) => kp.id));

/** 某章的练习题（按题库声明顺序）。 */
export function questionsForChapter(chapterId) {
  return ASSIGNMENT_QUESTIONS.filter((question) => question.chapterId === chapterId);
}

export function chapterQuestionLimit(chapterId){return Math.max(10,KNOWLEDGE_POINTS.filter(kp=>kp.chapterId===chapterId).length+2);}

export function questionOf(questionId) {
  return ASSIGNMENT_QUESTIONS.find((question) => question.id === questionId) ?? null;
}

/** 某知识点下的练习题（星图详情面板用）。 */
export function questionsForKp(kpId) {
  return ASSIGNMENT_QUESTIONS.filter((question) => question.kpId === kpId);
}

/** 填空判分归一化：去所有空白并转小写，MAR/mar/带空格写法一视同仁。 */
export function normalizeAnswerText(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, "");
}

/**
 * 判分（纯函数）：
 * @returns {{ correct: boolean, earned: number, max: number, matchedGroups: number, totalGroups: number }}
 * choice/truefalse 全对全错；fill 按关键词组命中比例给分，全部命中才算 correct。
 */
export function gradeQuestion(question, value) {
  const max = Number(question?.score ?? 0);
  const emptyResult = { correct: false, earned: 0, max, matchedGroups: 0, totalGroups: 0 };
  if (!question) return emptyResult;
  const raw = String(value ?? "").trim();
  if (!raw) return { ...emptyResult, totalGroups: question.type === "fill" ? (question.keywords?.length ?? 0) : 0 };

  if (question.type === "choice" || question.type === "truefalse") {
    const correct = raw === question.answer;
    return { correct, earned: correct ? max : 0, max, matchedGroups: correct ? 1 : 0, totalGroups: 1 };
  }

  if (question.type === "fill") {
    const groups = Array.isArray(question.keywords) ? question.keywords : [];
    const totalGroups = groups.length;
    if (totalGroups === 0) return { ...emptyResult, totalGroups: 0 };
    const normalized = normalizeAnswerText(raw);
    const matchedGroups = groups.filter((group) =>
      (Array.isArray(group) ? group : [group]).some((synonym) => {
        const needle = normalizeAnswerText(synonym);
        return needle.length > 0 && normalized.includes(needle);
      }),
    ).length;
    const earned = Math.round((max * matchedGroups) / totalGroups);
    return { correct: matchedGroups === totalGroups, earned, max, matchedGroups, totalGroups };
  }

  return emptyResult;
}

/**
 * 整章判分。
 * @param {string} chapterId
 * @param {Record<string, string>} answers questionId → 学生答案
 * @returns {{ earned: number, total: number, correctCount: number, answeredCount: number, results: Record<string, object> }}
 */
export function gradeChapterQuestions(chapterId, answers = {}) {
  const questions = questionsForChapter(chapterId);
  const results = {};
  let earned = 0;
  let total = 0;
  let correctCount = 0;
  let answeredCount = 0;
  for (const question of questions) {
    const value = answers?.[question.id];
    if (String(value ?? "").trim()) answeredCount += 1;
    const result = gradeQuestion(question, value);
    results[question.id] = result;
    earned += result.earned;
    total += result.max;
    if (result.correct) correctCount += 1;
  }
  return { earned, total, correctCount, answeredCount, results };
}

/** 掌握度（0~100 的整数百分比）：整章得分 ÷ 整章总分。 */
export function chapterMasteryOf(chapterId, answers = {}) {
  const { earned, total } = gradeChapterQuestions(chapterId, answers);
  return total > 0 ? Math.round((earned / total) * 100) : 0;
}

/** 题库自检：章内知识点覆盖、适量题目、有效章节和合法答案。 */
export function validateQuestionBank() {
  const errors = [];
  const ids = new Set();
  for (const question of ASSIGNMENT_QUESTIONS) {
    if (ids.has(question.id)) errors.push(`${question.id} 重复`);
    ids.add(question.id);
    if (!VALID_CHAPTER_IDS.has(question.chapterId)) errors.push(`${question.id} 章节非法 ${question.chapterId}`);
    if (!KP_IDS.has(question.kpId)) errors.push(`${question.id} 知识点非法 ${question.kpId}`);
    const kp = knowledgePointOf(question.kpId);
    if (kp && kp.chapterId !== question.chapterId) errors.push(`${question.id} 知识点 ${question.kpId} 属于 ${kp.chapterId} 而非 ${question.chapterId}`);
    if (!QUESTION_TYPES.includes(question.type)) errors.push(`${question.id} 题型非法 ${question.type}`);
    if (question.type === "choice" && !(question.options ?? []).includes(question.answer)) {
      errors.push(`${question.id} 单选答案不在选项中`);
    }
    if (question.type === "truefalse" && !["true", "false"].includes(question.answer)) {
      errors.push(`${question.id} 判断答案必须是 true/false`);
    }
    if (question.type === "fill" && (!Array.isArray(question.keywords) || question.keywords.length === 0)) {
      errors.push(`${question.id} 填空缺少关键词`);
    }
  }
  for (const chapter of COURSE_CHAPTERS) {
    const count = questionsForChapter(chapter.id).length;
    const limit=chapterQuestionLimit(chapter.id);
    if (count < 5 || count > limit) errors.push(`${chapter.id} 题量 ${count} 不在 5~${limit}`);
  }
  for (const kp of KNOWLEDGE_POINTS) {
    if (questionsForKp(kp.id).length === 0) errors.push(`知识点 ${kp.id} 没有练习题`);
  }
  return errors;
}
