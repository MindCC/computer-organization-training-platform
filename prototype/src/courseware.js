/**
 * 计算机组成原理课程课件 — 基于教学大纲
 *
 * 教材：杨泽雪《计算机组成原理》，机械工业出版社，2021
 * 参考：唐朔飞《计算机组成原理 (第3版)》，高等教育出版社
 */

export const COURSEWARE = Object.freeze({
  title: "计算机组成原理",
  textbook: "杨泽雪《计算机组成原理》，机械工业出版社，2021",
  references: [
    "唐朔飞《计算机组成原理 (第3版)》，高等教育出版社，2021",
    "茱莉亚洛博《计算机组成与体系结构》，机械工业出版社，2020",
  ],
  chapters: [
    {
      id: "ch1",
      title: "计算机系统概论",
      objectives: [
        "掌握计算机的硬件组成及每一部分的功能",
        "理解计算机系统的层次结构",
        "了解计算机的发展历史和发展应用方向",
        "理解冯·诺依曼单机系统工作原理",
      ],
      discussionQuestions: [
        "指令和数据都以二进制代码存放在内存中，CPU如何区分它们是指令还是数据？",
        "常用的计算机性能指标有哪些？",
        "按照冯·诺依曼原理，现代计算机应具备那些功能？",
      ],
      linkedChallenges: ["computer-components", "data-flow"],
      teachingMethod: "多媒体课堂教学结合课堂讨论",
    },
    {
      id: "ch2",
      title: "计算机中数的表示",
      objectives: [
        "掌握进制转换和补码的转换方法",
        "了解ASCII码",
        "掌握IEEE754标准的浮点表示方法",
        "理解循环冗余码校验原理",
      ],
      discussionQuestions: [
        '"在计算机中，原码和反码不能表示-1。"这种说法是否正确，为什么？',
      ],
      linkedChallenges: ["machine-number"],
      teachingMethod: "多媒体课堂教学结合课堂讨论",
    },
    {
      id: "ch3",
      title: "运算单元设计",
      objectives: [
        "掌握基本逻辑运算和移位运算的工作原理和设计方法",
        "掌握溢出的检测方法",
        "能够构建串行、并行的算术逻辑单元",
      ],
      discussionQuestions: [
        "什么是溢出？试写出两种溢出判断的方法？",
        "什么情况下会出现浮点运算溢出，出现浮点运算溢出后如何处理？",
        "浮点加减运算时，为什么要进行对阶？说明对阶的方法和理由。",
      ],
      linkedChallenges: ["and-gate", "or-gate", "not-gate", "xor-gate", "half-adder", "full-adder", "multi-adder", "alu"],
      teachingMethod: "多媒体课堂教学结合课堂讨论及实验实践",
    },
    {
      id: "ch4",
      title: "存储器系统",
      objectives: [
        "掌握主存储器的分类、工作原理、组成方式以及与其他部件的联系",
        "熟悉高速缓冲存储器、虚拟存储器的基本组成和工作原理",
        "能够应用存储器系统的基本理论知识解决实际设计问题",
      ],
      discussionQuestions: [
        "Cache与主存之间的地址映像方法有哪几种？各有何特点？",
        "DRAM存储器为什么要刷新？有哪几种常用的刷新方法？",
        "计算机存储系统分那几个层次？每一层次主要采用什么存储介质？",
      ],
      linkedChallenges: ["memory-address"],
      teachingMethod: "多媒体课堂教学结合课堂讨论及实验实践",
    },
    {
      id: "ch5",
      title: "指令系统",
      objectives: [
        "熟练运用指令系统的基本知识：指令格式和寻址方式",
        "能够应用指令的基本设计方法，特别是RISC技术",
      ],
      discussionQuestions: [
        "试比较基址寻址和变址寻址的异同点。",
        "什么是RISC？请简述它的主要特点。",
        "什么是指令周期？什么是机器周期？什么是时钟周期？三者有什么关系？",
      ],
      linkedChallenges: ["instruction-data", "program-flow"],
      teachingMethod: "多媒体课堂教学结合课堂讨论",
    },
    {
      id: "ch6",
      title: "CPU的结构与设计",
      objectives: [
        "熟练掌握CPU各部件的功能和连接方式，特别是时序控制方式",
        "综合运用多发和并行技术分析、设计能力提高计算机的执行性能",
      ],
      discussionQuestions: [
        "CPU通常有哪几部分构成的？",
        "指令和数据都以二进制代码存放在内存中，CPU如何区分它们是指令还是数据？",
      ],
      linkedChallenges: [],
      teachingMethod: "多媒体课堂教学结合课堂讨论及实验实践",
    },
    {
      id: "ch7",
      title: "系统总线",
      objectives: [
        "掌握系统总线的概念、分类、特性和性能指标及其标准化",
        "熟悉总线的判优控制、总线的通信控制及信息传送方式",
      ],
      discussionQuestions: [
        "比较单总线、双总线和多总线结构的性能特点。",
        "为什么说半同步通信同时保留了同步通信和异步通信的特点？",
        "为什么要设置总线判优控制？常见的集中式总线控制有几种？",
      ],
      linkedChallenges: [],
      teachingMethod: "多媒体课堂教学结合课堂讨论",
    },
    {
      id: "ch8",
      title: "输入输出系统",
      objectives: [
        "熟悉各种常用的I/O设备、工作原理、接口的组成以及其与主机交换信息的方式",
        "掌握程序查询方式、程序中断方式和DMA方式",
      ],
      discussionQuestions: [
        "什么是中断？中断技术给计算机系统带来了什么作用？",
      ],
      linkedChallenges: [],
      teachingMethod: "多媒体课堂教学结合课堂讨论",
    },
  ],
});

export function getChapterById(id) {
  return COURSEWARE.chapters.find((c) => c.id === id) ?? null;
}

export function getChallengesByChapter(chapterId) {
  const chapter = getChapterById(chapterId);
  return chapter?.linkedChallenges ?? [];
}
