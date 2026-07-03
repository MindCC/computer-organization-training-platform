const signal = "bit";

function inputNode(id, label, x, y, portLabel = label) {
  return { id, type: "input", label, position: { x, y }, ports: [{ id: "out", label: portLabel, direction: "out", signal }] };
}

function outputNode(id, label, x, y, portLabel = label) {
  return { id, type: "output", label, position: { x, y }, ports: [{ id: "in", label: portLabel, direction: "in", signal }] };
}

function componentNode(id, type, label, x, y, ports) {
  return { id, type, label, position: { x, y }, ports };
}

function inPort(id, label = id) {
  return { id, label, direction: "in", signal };
}

function outPort(id, label = id) {
  return { id, label, direction: "out", signal };
}

function edge(id, fromNode, fromPort, toNode, toPort, type, message) {
  return {
    id,
    from: { nodeId: fromNode, portId: fromPort },
    to: { nodeId: toNode, portId: toPort },
    hint: { type, message },
  };
}

export const COMPUTER_COMPONENTS_CIRCUIT = {
  id: "computer-components",
  title: "认识计算机五大部件",
  goal: "把输入、存储、控制、运算和输出五类部件连成一次完整计算路径。",
  nodes: [
    inputNode("input-device", "输入设备", 70, 170, "输入"),
    componentNode("memory-1", "buffer", "存储器", 280, 170, [inPort("in", "输入"), outPort("out", "程序/数据")]),
    componentNode("controller", "buffer", "控制器", 500, 95, [inPort("in", "指令"), outPort("out", "控制")]),
    componentNode("alu", "buffer", "运算器", 500, 255, [inPort("in", "数据"), outPort("out", "结果")]),
    outputNode("output-device", "输出设备", 730, 170, "输出"),
  ],
  requiredEdges: [
    edge("input-to-memory", "input-device", "out", "memory-1", "in", "输入路径缺失", "输入设备还没有把外部信息送入存储器。"),
    edge("memory-to-controller", "memory-1", "out", "controller", "in", "取指路径缺失", "控制器需要从存储器取得指令，才能发出控制信号。"),
    edge("controller-to-alu", "controller", "out", "alu", "in", "控制路径缺失", "控制器没有驱动运算器，计算无法开始。"),
    edge("alu-to-output", "alu", "out", "output-device", "in", "输出路径缺失", "运算器结果还没有送到输出设备。"),
  ],
  testCases: [
    { name: "输入信号 0", inputs: { "input-device.out": 0 }, expected: { "output-device.in": 0 } },
    { name: "输入信号 1", inputs: { "input-device.out": 1 }, expected: { "output-device.in": 1 } },
  ],
};

export const PROGRAM_FLOW_CIRCUIT = {
  id: "program-flow",
  title: "程序运行路线",
  goal: "连接从键盘输入、主存、CPU取指、运算器执行到屏幕输出的程序运行路线。",
  nodes: [
    inputNode("keyboard-input", "键盘输入", 60, 180, "1+1"),
    componentNode("main-memory", "buffer", "主存", 260, 180, [inPort("in", "写入"), outPort("out", "程序")]),
    componentNode("cpu-fetch", "buffer", "CPU取指", 460, 180, [inPort("in", "指令"), outPort("out", "控制")]),
    componentNode("execute-unit", "buffer", "运算器执行", 660, 180, [inPort("in", "执行"), outPort("out", "结果")]),
    outputNode("screen-output", "屏幕输出", 860, 180, "2"),
  ],
  requiredEdges: [
    edge("keyboard-to-memory", "keyboard-input", "out", "main-memory", "in", "输入路径缺失", "键盘输入还没有写入主存。"),
    edge("memory-to-fetch", "main-memory", "out", "cpu-fetch", "in", "取指路径缺失", "CPU取指阶段需要从主存取得程序。"),
    edge("fetch-to-execute", "cpu-fetch", "out", "execute-unit", "in", "执行路径缺失", "取到的指令还没有交给运算器执行。"),
    edge("execute-to-screen", "execute-unit", "out", "screen-output", "in", "输出路径缺失", "执行结果还没有显示到屏幕。"),
  ],
  testCases: [
    { name: "表达式未触发", inputs: { "keyboard-input.out": 0 }, expected: { "screen-output.in": 0 } },
    { name: "表达式已输入", inputs: { "keyboard-input.out": 1 }, expected: { "screen-output.in": 1 } },
  ],
};

export const INSTRUCTION_DATA_CIRCUIT = {
  id: "instruction-data",
  title: "指令和数据",
  goal: "把同一片存储器中的内容分别送到指令通路和数据通路，理解 CPU 通过阶段解释二进制。",
  nodes: [
    inputNode("program-counter", "程序计数器PC", 60, 110, "地址100"),
    inputNode("data-address", "数据地址", 60, 270, "地址101/102"),
    componentNode("instruction-memory", "buffer", "存储器:地址100", 290, 110, [inPort("in", "地址"), outPort("out", "内容")]),
    componentNode("data-memory", "buffer", "存储器:地址101/102", 290, 270, [inPort("in", "地址"), outPort("out", "内容")]),
    componentNode("instruction-register", "buffer", "指令寄存器IR", 540, 110, [inPort("in", "指令"), outPort("out", "控制")]),
    componentNode("operand-register", "buffer", "操作数寄存器", 540, 270, [inPort("in", "数据"), outPort("out", "操作数")]),
    outputNode("instruction-view", "取指观察", 780, 110, "指令"),
    outputNode("data-view", "取数观察", 780, 270, "数据"),
  ],
  requiredEdges: [
    edge("pc-to-instruction-memory", "program-counter", "out", "instruction-memory", "in", "取指地址缺失", "PC 没有把指令地址送到存储器。"),
    edge("instruction-memory-to-ir", "instruction-memory", "out", "instruction-register", "in", "指令通路缺失", "地址100取出的内容需要进入指令寄存器。"),
    edge("ir-to-view", "instruction-register", "out", "instruction-view", "in", "取指观察缺失", "指令寄存器的内容还没有接到取指观察端。"),
    edge("data-to-data-memory", "data-address", "out", "data-memory", "in", "取数地址缺失", "执行阶段还需要把数据地址送到存储器。"),
    edge("data-memory-to-operand", "data-memory", "out", "operand-register", "in", "数据通路缺失", "地址101/102取出的内容需要进入操作数寄存器。"),
    edge("operand-to-view", "operand-register", "out", "data-view", "in", "取数观察缺失", "操作数还没有接到取数观察端。"),
  ],
  testCases: [
    { name: "取指阶段", inputs: { "program-counter.out": 1, "data-address.out": 0 }, expected: { "instruction-view.in": 1, "data-view.in": 0 } },
    { name: "取数阶段", inputs: { "program-counter.out": 0, "data-address.out": 1 }, expected: { "instruction-view.in": 0, "data-view.in": 1 } },
  ],
};

export const DATA_FLOW_CIRCUIT = {
  id: "data-flow",
  title: "认识数据流",
  goal: "把输入、处理单元和输出端连成一条完整的数据路径。",
  nodes: [
    inputNode("input-a", "输入A", 80, 170, "A"),
    componentNode("data-path", "buffer", "数据通路", 330, 170, [inPort("in", "in"), outPort("out", "out")]),
    outputNode("result-s", "结果S", 610, 170, "S"),
  ],
  requiredEdges: [
    edge("input-a-to-path", "input-a", "out", "data-path", "in", "输入端未连接", "输入A还没有进入数据通路，信号无法开始传播。"),
    edge("path-to-result", "data-path", "out", "result-s", "in", "输出端未连接", "结果S没有接收到数据通路的输出。"),
  ],
  testCases: [
    { name: "A=0", inputs: { "input-a.out": 0 }, expected: { "result-s.in": 0 } },
    { name: "A=1", inputs: { "input-a.out": 1 }, expected: { "result-s.in": 1 } },
  ],
};

export const AND_GATE_CIRCUIT = {
  id: "and-gate",
  title: "与门",
  goal: "连接两个输入到与门，观察只有 A 和 B 都为 1 时输出才为 1。",
  nodes: [
    inputNode("input-a", "输入A", 80, 120, "A"),
    inputNode("input-b", "输入B", 80, 250, "B"),
    componentNode("and-1", "and", "与门", 330, 180, [inPort("a", "A"), inPort("b", "B"), outPort("c", "Y")]),
    outputNode("output-y", "输出Y", 610, 190, "Y"),
  ],
  requiredEdges: [
    edge("input-a-to-and-a", "input-a", "out", "and-1", "a", "输入端未连接", "输入A没有进入与门，无法判断是否同时为1。"),
    edge("input-b-to-and-b", "input-b", "out", "and-1", "b", "输入端未连接", "输入B没有进入与门，无法判断是否同时为1。"),
    edge("and-to-output", "and-1", "c", "output-y", "in", "输出端未连接", "与门结果没有接到输出Y。"),
  ],
  testCases: [
    { name: "0 与 0", inputs: { "input-a.out": 0, "input-b.out": 0 }, expected: { "output-y.in": 0 } },
    { name: "0 与 1", inputs: { "input-a.out": 0, "input-b.out": 1 }, expected: { "output-y.in": 0 } },
    { name: "1 与 0", inputs: { "input-a.out": 1, "input-b.out": 0 }, expected: { "output-y.in": 0 } },
    { name: "1 与 1", inputs: { "input-a.out": 1, "input-b.out": 1 }, expected: { "output-y.in": 1 } },
  ],
};

export const OR_GATE_CIRCUIT = {
  id: "or-gate",
  title: "或门",
  goal: "连接两个输入到或门，观察只要 A 或 B 有一个为 1 输出就为 1。",
  nodes: [
    inputNode("input-a", "输入A", 80, 120, "A"),
    inputNode("input-b", "输入B", 80, 250, "B"),
    componentNode("or-1", "or", "或门", 330, 180, [inPort("a", "A"), inPort("b", "B"), outPort("out", "Y")]),
    outputNode("output-y", "输出Y", 610, 190, "Y"),
  ],
  requiredEdges: [
    edge("input-a-to-or-a", "input-a", "out", "or-1", "a", "输入端未连接", "输入A没有进入或门，无法判断是否至少一个为1。"),
    edge("input-b-to-or-b", "input-b", "out", "or-1", "b", "输入端未连接", "输入B没有进入或门，无法判断是否至少一个为1。"),
    edge("or-to-output", "or-1", "out", "output-y", "in", "输出端未连接", "或门结果没有接到输出Y。"),
  ],
  testCases: [
    { name: "0 或 0", inputs: { "input-a.out": 0, "input-b.out": 0 }, expected: { "output-y.in": 0 } },
    { name: "0 或 1", inputs: { "input-a.out": 0, "input-b.out": 1 }, expected: { "output-y.in": 1 } },
    { name: "1 或 0", inputs: { "input-a.out": 1, "input-b.out": 0 }, expected: { "output-y.in": 1 } },
    { name: "1 或 1", inputs: { "input-a.out": 1, "input-b.out": 1 }, expected: { "output-y.in": 1 } },
  ],
};

export const NOT_GATE_CIRCUIT = {
  id: "not-gate",
  title: "非门",
  goal: "连接一个输入到非门，观察 0 变 1、1 变 0 的取反关系。",
  nodes: [
    inputNode("input-a", "输入A", 80, 180, "A"),
    componentNode("not-1", "not", "非门", 330, 180, [inPort("in", "A"), outPort("out", "Y")]),
    outputNode("output-y", "输出Y", 610, 190, "Y"),
  ],
  requiredEdges: [
    edge("input-a-to-not", "input-a", "out", "not-1", "in", "输入端未连接", "输入A没有进入非门，无法完成取反。"),
    edge("not-to-output", "not-1", "out", "output-y", "in", "输出端未连接", "非门结果没有接到输出Y。"),
  ],
  testCases: [
    { name: "非 0", inputs: { "input-a.out": 0 }, expected: { "output-y.in": 1 } },
    { name: "非 1", inputs: { "input-a.out": 1 }, expected: { "output-y.in": 0 } },
  ],
};

export const XOR_GATE_CIRCUIT = {
  id: "xor-gate",
  title: "异或门",
  goal: "连接两个输入到异或门，观察 A 和 B 不同时输出为 1、相同时输出为 0。",
  nodes: [
    inputNode("input-a", "输入A", 80, 120, "A"),
    inputNode("input-b", "输入B", 80, 250, "B"),
    componentNode("xor-1", "xor", "异或门", 330, 180, [inPort("a", "A"), inPort("b", "B"), outPort("s", "Y")]),
    outputNode("output-y", "输出Y", 610, 190, "Y"),
  ],
  requiredEdges: [
    edge("input-a-to-xor-a", "input-a", "out", "xor-1", "a", "输入端未连接", "输入A没有进入异或门，无法比较两个输入是否不同。"),
    edge("input-b-to-xor-b", "input-b", "out", "xor-1", "b", "输入端未连接", "输入B没有进入异或门，无法比较两个输入是否不同。"),
    edge("xor-to-output", "xor-1", "s", "output-y", "in", "输出端未连接", "异或门结果没有接到输出Y。"),
  ],
  testCases: [
    { name: "0 异或 0", inputs: { "input-a.out": 0, "input-b.out": 0 }, expected: { "output-y.in": 0 } },
    { name: "0 异或 1", inputs: { "input-a.out": 0, "input-b.out": 1 }, expected: { "output-y.in": 1 } },
    { name: "1 异或 0", inputs: { "input-a.out": 1, "input-b.out": 0 }, expected: { "output-y.in": 1 } },
    { name: "1 异或 1", inputs: { "input-a.out": 1, "input-b.out": 1 }, expected: { "output-y.in": 0 } },
  ],
};

export const HALF_ADDER_CIRCUIT = {
  id: "half-adder",
  title: "半加器",
  goal: "连接异或门和与门，实现 1 位二进制加法。",
  nodes: [
    inputNode("input-a", "输入A", 80, 110, "A"),
    inputNode("input-b", "输入B", 80, 230, "B"),
    componentNode("xor-1", "xor", "异或门", 330, 90, [inPort("a", "A"), inPort("b", "B"), outPort("s", "S")]),
    componentNode("and-1", "and", "与门", 330, 260, [inPort("a", "A"), inPort("b", "B"), outPort("c", "C")]),
    outputNode("sum-output", "和位S", 610, 110, "S"),
    outputNode("carry-output", "进位C", 610, 280, "C"),
  ],
  requiredEdges: [
    edge("input-a-to-xor-a", "input-a", "out", "xor-1", "a", "输入端未连接", "输入A没有进入异或门，和位无法判断。"),
    edge("input-b-to-xor-b", "input-b", "out", "xor-1", "b", "输入端未连接", "输入B没有进入异或门，和位无法判断。"),
    edge("input-a-to-and-a", "input-a", "out", "and-1", "a", "进位路径缺失", "输入A没有进入与门，进位逻辑不完整。"),
    edge("input-b-to-and-b", "input-b", "out", "and-1", "b", "进位路径缺失", "输入B没有进入与门，进位逻辑不完整。"),
    edge("xor-s-to-sum", "xor-1", "s", "sum-output", "in", "输出端未连接", "异或门的结果没有接到和位S。"),
    edge("and-c-to-carry", "and-1", "c", "carry-output", "in", "输出端未连接", "与门的结果没有接到进位C。"),
  ],
  testCases: [
    { name: "0 + 0", inputs: { "input-a.out": 0, "input-b.out": 0 }, expected: { "sum-output.in": 0, "carry-output.in": 0 } },
    { name: "0 + 1", inputs: { "input-a.out": 0, "input-b.out": 1 }, expected: { "sum-output.in": 1, "carry-output.in": 0 } },
    { name: "1 + 0", inputs: { "input-a.out": 1, "input-b.out": 0 }, expected: { "sum-output.in": 1, "carry-output.in": 0 } },
    { name: "1 + 1", inputs: { "input-a.out": 1, "input-b.out": 1 }, expected: { "sum-output.in": 0, "carry-output.in": 1 } },
  ],
};

export const FULL_ADDER_CIRCUIT = {
  id: "full-adder",
  title: "全加器",
  goal: "在半加器基础上加入输入进位，完成三输入加法。",
  nodes: [
    inputNode("input-a", "输入A", 60, 90, "A"),
    inputNode("input-b", "输入B", 60, 190, "B"),
    inputNode("input-cin", "进位输入Cin", 60, 310, "Cin"),
    componentNode("xor-1", "xor", "异或门1", 280, 130, [inPort("a", "A"), inPort("b", "B"), outPort("s", "X")]),
    componentNode("xor-2", "xor", "异或门2", 500, 130, [inPort("a", "X"), inPort("b", "Cin"), outPort("s", "S")]),
    componentNode("carry-logic", "fullAdder", "进位逻辑", 360, 320, [inPort("a", "A"), inPort("b", "B"), inPort("cin", "Cin"), outPort("sum", "S"), outPort("cout", "Cout")]),
    outputNode("sum-output", "和位S", 760, 130, "S"),
    outputNode("cout-output", "输出Cout", 760, 330, "Cout"),
  ],
  requiredEdges: [
    edge("a-to-xor1", "input-a", "out", "xor-1", "a", "输入端未连接", "输入A没有进入第一层求和逻辑。"),
    edge("b-to-xor1", "input-b", "out", "xor-1", "b", "输入端未连接", "输入B没有进入第一层求和逻辑。"),
    edge("xor1-to-xor2", "xor-1", "s", "xor-2", "a", "中间和缺失", "第一层异或结果没有进入第二层求和。"),
    edge("cin-to-xor2", "input-cin", "out", "xor-2", "b", "缺少进位输入", "Cin没有接入第二层异或门，因此这还不是完整全加器。"),
    edge("xor2-to-sum", "xor-2", "s", "sum-output", "in", "输出端未连接", "最终和位S没有连接到输出端。"),
    edge("a-to-carry", "input-a", "out", "carry-logic", "a", "进位路径缺失", "进位逻辑需要接收输入A。"),
    edge("b-to-carry", "input-b", "out", "carry-logic", "b", "进位路径缺失", "进位逻辑需要接收输入B。"),
    edge("cin-to-carry", "input-cin", "out", "carry-logic", "cin", "缺少进位输入", "进位逻辑需要接收Cin。"),
    edge("carry-to-cout", "carry-logic", "cout", "cout-output", "in", "输出端未连接", "输出进位Cout没有接到目标输出端。"),
  ],
  testCases: [
    { name: "0+0+0", inputs: { "input-a.out": 0, "input-b.out": 0, "input-cin.out": 0 }, expected: { "sum-output.in": 0, "cout-output.in": 0 } },
    { name: "1+0+0", inputs: { "input-a.out": 1, "input-b.out": 0, "input-cin.out": 0 }, expected: { "sum-output.in": 1, "cout-output.in": 0 } },
    { name: "1+1+0", inputs: { "input-a.out": 1, "input-b.out": 1, "input-cin.out": 0 }, expected: { "sum-output.in": 0, "cout-output.in": 1 } },
    { name: "1+1+1", inputs: { "input-a.out": 1, "input-b.out": 1, "input-cin.out": 1 }, expected: { "sum-output.in": 1, "cout-output.in": 1 } },
  ],
};

export const MACHINE_NUMBER_CIRCUIT = {
  id: "machine-number",
  title: "机器数编码",
  goal: "连接符号位、数值位和补码生成器，理解负数进入运算器前如何变成补码。",
  nodes: [
    inputNode("decimal-input", "十进制数", 60, 150, "-5"),
    componentNode("sign-split", "buffer", "符号位判断", 280, 90, [inPort("in", "数值"), outPort("out", "符号位")]),
    componentNode("magnitude-split", "buffer", "数值位拆分", 280, 245, [inPort("in", "|数值|"), outPort("out", "数值位")]),
    componentNode("ones-encoder", "buffer", "反码生成器", 520, 245, [inPort("in", "数值位"), outPort("out", "反码")]),
    componentNode("twos-encoder", "buffer", "补码生成器", 750, 245, [inPort("in", "反码+1"), outPort("out", "补码")]),
    outputNode("sign-output", "符号位观察", 760, 90, "S"),
    outputNode("machine-output", "结果寄存器", 1000, 245, "补码"),
  ],
  requiredEdges: [
    edge("decimal-to-sign", "decimal-input", "out", "sign-split", "in", "符号位路径缺失", "十进制数需要先判断正负，得到符号位。"),
    edge("decimal-to-magnitude", "decimal-input", "out", "magnitude-split", "in", "数值位路径缺失", "编码前需要把绝对值拆成数值位。"),
    edge("sign-to-output", "sign-split", "out", "sign-output", "in", "符号位观察缺失", "符号位没有接到观察端，学生看不到正负信息。"),
    edge("magnitude-to-ones", "magnitude-split", "out", "ones-encoder", "in", "反码数值位缺失", "数值位没有进入反码生成器，无法逐位取反。"),
    edge("ones-to-twos", "ones-encoder", "out", "twos-encoder", "in", "补码输入缺失", "补码需要在反码基础上继续处理。"),
    edge("twos-to-output", "twos-encoder", "out", "machine-output", "in", "结果寄存器缺失", "补码结果还没有写入结果寄存器。"),
  ],
  testCases: [
    { name: "-5 编码路径", inputs: { "decimal-input.out": 1 }, expected: { "machine-output.in": 1, "sign-output.in": 1 } },
    { name: "+5 编码路径", inputs: { "decimal-input.out": 0 }, expected: { "machine-output.in": 0, "sign-output.in": 0 } },
  ],
};

export const MUX_CIRCUIT = {
  id: "mux",
  title: "多路选择器",
  goal: "使用选择信号决定哪一路数据进入输出端。",
  nodes: [
    inputNode("data-0", "数据源0", 70, 100, "D0"),
    inputNode("data-1", "数据源1", 70, 230, "D1"),
    inputNode("select", "选择信号", 70, 360, "Sel"),
    componentNode("mux-1", "mux2", "选择器", 360, 210, [inPort("d0", "D0"), inPort("d1", "D1"), inPort("sel", "Sel"), outPort("y", "Y")]),
    outputNode("output-y", "输出Y", 650, 220, "Y"),
  ],
  requiredEdges: [
    edge("d0-to-mux", "data-0", "out", "mux-1", "d0", "输入端未连接", "数据源0没有接入选择器。"),
    edge("d1-to-mux", "data-1", "out", "mux-1", "d1", "输入端未连接", "数据源1没有接入选择器。"),
    edge("sel-to-mux", "select", "out", "mux-1", "sel", "缺少控制信号", "没有选择信号，选择器无法判断输出哪一路数据。"),
    edge("mux-to-output", "mux-1", "y", "output-y", "in", "输出端未连接", "选择器输出没有接到结果端Y。"),
  ],
  testCases: [
    { name: "选择D0", inputs: { "data-0.out": 0, "data-1.out": 1, "select.out": 0 }, expected: { "output-y.in": 0 } },
    { name: "选择D1", inputs: { "data-0.out": 0, "data-1.out": 1, "select.out": 1 }, expected: { "output-y.in": 1 } },
  ],
};

export const MULTI_ADDER_CIRCUIT = {
  id: "multi-adder",
  title: "多位加法器",
  goal: "把多个全加器串联起来，观察进位逐级传播。",
  nodes: [
    inputNode("a0", "A0", 40, 80, "A0"), inputNode("b0", "B0", 40, 150, "B0"), inputNode("cin", "Cin", 40, 220, "Cin"),
    inputNode("a1", "A1", 40, 330, "A1"), inputNode("b1", "B1", 40, 400, "B1"),
    inputNode("a2", "A2", 40, 510, "A2"), inputNode("b2", "B2", 40, 580, "B2"),
    componentNode("fa0", "fullAdder", "全加器0", 260, 130, [inPort("a", "A"), inPort("b", "B"), inPort("cin", "Cin"), outPort("sum", "S0"), outPort("cout", "C0")]),
    componentNode("fa1", "fullAdder", "全加器1", 500, 330, [inPort("a", "A"), inPort("b", "B"), inPort("cin", "C0"), outPort("sum", "S1"), outPort("cout", "C1")]),
    componentNode("fa2", "fullAdder", "全加器2", 740, 530, [inPort("a", "A"), inPort("b", "B"), inPort("cin", "C1"), outPort("sum", "S2"), outPort("cout", "Cout")]),
    outputNode("s0", "结果S0", 1020, 120, "S0"), outputNode("s1", "结果S1", 1020, 320, "S1"), outputNode("s2", "结果S2", 1020, 520, "S2"), outputNode("cout", "总进位", 1020, 650, "Cout"),
  ],
  requiredEdges: [
    edge("a0-fa0", "a0", "out", "fa0", "a", "输入端未连接", "最低位全加器需要A0。"), edge("b0-fa0", "b0", "out", "fa0", "b", "输入端未连接", "最低位全加器需要B0。"), edge("cin-fa0", "cin", "out", "fa0", "cin", "缺少进位输入", "最低位需要初始Cin。"),
    edge("fa0-fa1", "fa0", "cout", "fa1", "cin", "进位路径缺失", "低位进位没有传给中位全加器。"), edge("a1-fa1", "a1", "out", "fa1", "a", "输入端未连接", "中位全加器需要A1。"), edge("b1-fa1", "b1", "out", "fa1", "b", "输入端未连接", "中位全加器需要B1。"),
    edge("fa1-fa2", "fa1", "cout", "fa2", "cin", "进位路径缺失", "中位进位没有传给高位全加器。"), edge("a2-fa2", "a2", "out", "fa2", "a", "输入端未连接", "高位全加器需要A2。"), edge("b2-fa2", "b2", "out", "fa2", "b", "输入端未连接", "高位全加器需要B2。"),
    edge("fa0-s0", "fa0", "sum", "s0", "in", "输出端未连接", "最低位和位没有接到结果端。"), edge("fa1-s1", "fa1", "sum", "s1", "in", "输出端未连接", "中位和位没有接到结果端。"), edge("fa2-s2", "fa2", "sum", "s2", "in", "输出端未连接", "高位和位没有接到结果端。"), edge("fa2-cout", "fa2", "cout", "cout", "in", "输出端未连接", "总进位没有接到输出端。"),
  ],
  testCases: [
    { name: "3+1", inputs: { "a0.out": 1, "a1.out": 1, "a2.out": 0, "b0.out": 1, "b1.out": 0, "b2.out": 0, "cin.out": 0 }, expected: { "s0.in": 0, "s1.in": 0, "s2.in": 1, "cout.in": 0 } },
    { name: "7+1", inputs: { "a0.out": 1, "a1.out": 1, "a2.out": 1, "b0.out": 1, "b1.out": 0, "b2.out": 0, "cin.out": 0 }, expected: { "s0.in": 0, "s1.in": 0, "s2.in": 0, "cout.in": 1 } },
  ],
};

export const ALU_CIRCUIT = {
  id: "alu",
  title: "简化 ALU",
  goal: "把加法、与、或和选择控制组合成一个简化运算器。",
  nodes: [
    inputNode("input-a", "输入A", 70, 110, "A"), inputNode("input-b", "输入B", 70, 210, "B"), inputNode("input-cin", "进位Cin", 70, 310, "Cin"), inputNode("op", "控制位", 70, 430, "Op"),
    componentNode("alu-core", "alu1", "ALU核心", 380, 250, [inPort("a", "A"), inPort("b", "B"), inPort("cin", "Cin"), inPort("op", "Op"), outPort("f", "F"), outPort("zero", "Z"), outPort("carry", "C")]),
    outputNode("result-f", "结果F", 720, 190, "F"), outputNode("zero-flag", "零标志", 720, 320, "Z"), outputNode("carry-flag", "进位标志", 720, 450, "C"),
  ],
  requiredEdges: [
    edge("a-alu", "input-a", "out", "alu-core", "a", "输入端未连接", "ALU核心需要输入A。"), edge("b-alu", "input-b", "out", "alu-core", "b", "输入端未连接", "ALU核心需要输入B。"), edge("cin-alu", "input-cin", "out", "alu-core", "cin", "进位路径缺失", "加法路径需要Cin。"), edge("op-alu", "op", "out", "alu-core", "op", "缺少控制信号", "控制位没有接入ALU核心，无法选择运算。"),
    edge("alu-f", "alu-core", "f", "result-f", "in", "输出端未连接", "ALU结果F没有接到输出端。"), edge("alu-zero", "alu-core", "zero", "zero-flag", "in", "标志位缺失", "零标志没有连接。"), edge("alu-carry", "alu-core", "carry", "carry-flag", "in", "标志位缺失", "进位标志没有连接。"),
  ],
  testCases: [
    { name: "加法", inputs: { "input-a.out": 1, "input-b.out": 1, "input-cin.out": 0, "op.out": 0 }, expected: { "result-f.in": 0, "zero-flag.in": 1, "carry-flag.in": 1 } },
    { name: "与", inputs: { "input-a.out": 1, "input-b.out": 0, "input-cin.out": 0, "op.out": 1 }, expected: { "result-f.in": 0, "zero-flag.in": 1, "carry-flag.in": 0 } },
    { name: "或", inputs: { "input-a.out": 1, "input-b.out": 0, "input-cin.out": 0, "op.out": 2 }, expected: { "result-f.in": 1, "zero-flag.in": 0, "carry-flag.in": 0 } },
    { name: "异或", inputs: { "input-a.out": 1, "input-b.out": 1, "input-cin.out": 0, "op.out": 3 }, expected: { "result-f.in": 0, "zero-flag.in": 1, "carry-flag.in": 0 } },
  ],
};

export const CIRCUIT_CHALLENGES = [
  COMPUTER_COMPONENTS_CIRCUIT,
  PROGRAM_FLOW_CIRCUIT,
  INSTRUCTION_DATA_CIRCUIT,
  DATA_FLOW_CIRCUIT,
  AND_GATE_CIRCUIT,
  OR_GATE_CIRCUIT,
  NOT_GATE_CIRCUIT,
  XOR_GATE_CIRCUIT,
  HALF_ADDER_CIRCUIT,
  FULL_ADDER_CIRCUIT,
  MACHINE_NUMBER_CIRCUIT,
  MULTI_ADDER_CIRCUIT,
  MUX_CIRCUIT,
  ALU_CIRCUIT,
];

export function getCircuitChallenge(id) {
  return CIRCUIT_CHALLENGES.find((challenge) => challenge.id === id) ?? null;
}

export function buildCircuitModelIndex(model) {
  const nodes = new Map((model?.nodes ?? []).map((node) => [node.id, node]));
  const ports = new Map();

  for (const node of model?.nodes ?? []) {
    for (const port of node.ports ?? []) {
      ports.set(portKey(node.id, port.id), { node, port });
    }
  }

  return { nodes, ports };
}

export function portKey(nodeId, portId) {
  return `${nodeId}.${portId}`;
}

export function edgeKey(edge) {
  return `${edge?.from?.nodeId}:${edge?.from?.portId}->${edge?.to?.nodeId}:${edge?.to?.portId}`;
}
