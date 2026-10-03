import { WORKBENCH_CHALLENGES } from "../workbenchChallenges.js";

const ports = {
  input: [[], ["out"]], output: [["in"], []],
  and: [["a", "b"], ["c"]], or: [["a", "b"], ["out"]], xor: [["a", "b"], ["s"]],
  not: [["in"], ["out"]], nand: [["a", "b"], ["out"]], mux2: [["d0", "d1", "sel"], ["y"]],
};
const node = (id, type, label, x, y) => ({ id, type, label, position: { x, y }, ports: ports[type].flatMap((ids, index) => ids.map(id => ({ id, label: id.toUpperCase(), direction: index ? "out" : "in", signal: "bit", width: 1 }))) });
const wire = (from, to) => ({ id: `${from}->${to}`, from: { nodeId: from.split(".")[0], portId: from.split(".")[1] }, to: { nodeId: to.split(".")[0], portId: to.split(".")[1] }, hint: { type: "通路未完成", message: `检查 ${to} 的输入来源；先从真值表推导条件。` } });

export function booleanCases(inputIds, outputIds, evaluate) {
  return Array.from({ length: 2 ** inputIds.length }, (_, mask) => {
    const bits = inputIds.map((_, index) => (mask >> (inputIds.length - index - 1)) & 1);
    return { name: bits.join(" / "), inputs: Object.fromEntries(inputIds.map((id, index) => [`${id}.out`, bits[index]])), expected: Object.fromEntries(outputIds.map((id, index) => [`${id}.in`, evaluate(bits)[index]])) };
  });
}

const configs = {
  "parity-check": { inputs: ["A", "B", "C"], outputs: ["偶校验位 P"], gates: [["x1", "xor", 1, 0], ["x2", "xor", 2, 1]], wires: ["i0.out x1.a", "i1.out x1.b", "x1.s x2.a", "i2.out x2.b", "x2.s o0.in"], evaluate: ([a,b,c]) => [a^b^c], hints: ["校验位为 1 时会使 1 的数量增加一个。", "两个输入的异或统计奇偶；再与第三个异或。", "P=(A⊕B)⊕C。"] },
  "nand-builder": { inputs: ["A", "B"], outputs: ["与逻辑 Y"], gates: [["n1", "nand", 1, 0], ["n2", "nand", 2, 0]], wires: ["i0.out n1.a", "i1.out n1.b", "n1.out n2.a", "n1.out n2.b", "n2.out o0.in"], evaluate: ([a,b]) => [a&b], allowedGateTypes: ["nand"], hints: ["与非门输出的是与结果的反相。", "将同一信号接入与非门两个输入，相当于取反。", "Y=NAND(NAND(A,B),NAND(A,B))。"] },
  "majority-vote": { inputs: ["A", "B", "C"], outputs: ["多数结果 Y"], gates: [["ab", "and", 1, 0], ["ac", "and", 1, 1], ["bc", "and", 1, 2], ["r1", "or", 2, 0], ["r2", "or", 3, 1]], wires: ["i0.out ab.a", "i1.out ab.b", "i0.out ac.a", "i2.out ac.b", "i1.out bc.a", "i2.out bc.b", "ab.c r1.a", "ac.c r1.b", "r1.out r2.a", "bc.c r2.b", "r2.out o0.in"], evaluate: ([a,b,c]) => [Number(a+b+c>=2)], hints: ["列出任意两个输入同时为 1 的情况。", "三个与门分别检测 AB、AC、BC，再合并。", "Y=AB+AC+BC。"] },
  "gate-mux": { inputs: ["D0", "D1", "Sel"], outputs: ["选择结果 Y"], gates: [["n", "not", 1, 2], ["a0", "and", 2, 0], ["a1", "and", 2, 1], ["r", "or", 3, 0]], wires: ["i2.out n.in", "i0.out a0.a", "n.out a0.b", "i1.out a1.a", "i2.out a1.b", "a0.c r.a", "a1.c r.b", "r.out o0.in"], evaluate: ([a,b,s]) => [s?b:a], hints: ["两条数据通路需要互斥使能。", "D0 使用 ¬Sel；D1 使用 Sel。", "Y=(D0·¬Sel)+(D1·Sel)。"] },
  "signed-overflow": { inputs: ["A 符号", "B 符号", "S 符号"], outputs: ["溢出 V"], gates: [["ab", "xor", 1, 0], ["as", "xor", 1, 1], ["n", "not", 2, 0], ["a", "and", 3, 0]], wires: ["i0.out ab.a", "i1.out ab.b", "i0.out as.a", "i2.out as.b", "ab.s n.in", "n.out a.a", "as.s a.b", "a.c o0.in"], evaluate: ([a,b,s]) => [Number(a===b&&a!==s)], hints: ["异号相加不会发生有符号溢出。", "检测输入同号、结果符号改变两个条件。", "V=¬(A_sign⊕B_sign)·(A_sign⊕S_sign)，不是普通进位。"] },
  "register-enable": { inputs: ["旧值 Q", "写入 D", "写使能 WE"], outputs: ["下一拍 Q_next"], gates: [["m", "mux2", 1, 0]], wires: ["i0.out m.d0", "i1.out m.d1", "i2.out m.sel", "m.y o0.in"], evaluate: ([q,d,we]) => [we?d:q], hints: ["未写入时输出必须等于原来的 Q。", "把保持和写入看成两路数据选择。", "Q_next=WE?D:Q。本关无时钟储存状态，由输入 Q 提供旧值。"] },
  "branch-control": { inputs: ["Branch", "零标志 Z", "Jump"], outputs: ["跳转选择 Take"], gates: [["a", "and", 1, 0], ["r", "or", 2, 0]], wires: ["i0.out a.a", "i1.out a.b", "a.c r.a", "i2.out r.b", "r.out o0.in"], evaluate: ([branch,z,jump]) => [(branch&z)|jump], hints: ["条件分支需要同时满足指令和条件。", "无条件 Jump 应优先覆盖条件分支。", "Take=(Branch·Z)+Jump；Take=0 时选择 PC+1。"] },
  "bus-arbiter": { inputs: ["CPU 请求", "DMA 请求"], outputs: ["CPU 授权", "DMA 授权"], gates: [["n", "not", 1, 0], ["a", "and", 2, 1]], wires: ["i0.out o0.in", "i0.out n.in", "n.out a.a", "i1.out a.b", "a.c o1.in"], evaluate: ([cpu,dma]) => [cpu,dma&!cpu], hints: ["CPU 的优先级高于 DMA。", "DMA 只有在 CPU 没有请求时才能获得总线。", "G_CPU=R_CPU，G_DMA=R_DMA·¬R_CPU；不能同时为 1。"] },
  "interrupt-mask": { inputs: ["设备 IRQ", "允许 IE", "屏蔽 Mask"], outputs: ["CPU 中断请求"], gates: [["n", "not", 1, 2], ["a1", "and", 1, 0], ["a2", "and", 2, 1]], wires: ["i2.out n.in", "i0.out a1.a", "i1.out a1.b", "a1.c a2.a", "n.out a2.b", "a2.c o0.in"], evaluate: ([irq,ie,mask]) => [irq&ie&!mask], hints: ["有设备请求并不代表 CPU 一定接受。", "允许开关和屏蔽位都是必要的控制条件。", "INT=IRQ·IE·¬Mask。"] },
  "io-handshake": { inputs: ["设备 Ready", "CPU Read", "数据 D"], outputs: ["接受 Accept", "有效数据"], gates: [["a1", "and", 1, 0], ["a2", "and", 2, 1]], wires: ["i0.out a1.a", "i1.out a1.b", "a1.c o0.in", "a1.c a2.a", "i2.out a2.b", "a2.c o1.in"], evaluate: ([ready,read,d]) => [ready&read,ready&read&d], hints: ["数据为 0 也可能是一次成功的传送，需要单独观察 Accept。", "只有 Ready 和 Read 同时为 1 才接受。", "Accept=Ready·Read，Data_out=D·Accept；这是单次传送的组合条件。"] },
};

const decode = (inputs, outputs) => ({ inputs, outputs, gates: [["n1", "not", 1, 0], ["n0", "not", 1, 1], ...[0,1,2,3].map(k => [`a${k}`, "and", 2, k])], wires: ["i0.out n1.in", "i1.out n0.in", ...[0,1,2,3].flatMap(k => [`${k&2?"i0.out":"n1.out"} a${k}.a`, `${k&1?"i1.out":"n0.out"} a${k}.b`, `a${k}.c o${k}.in`])], evaluate: ([a,b]) => [0,1,2,3].map(k=>Number(k===a*2+b)), hints: ["两个输入形成四种互斥组合。", "先产生两个输入的反相信号，再分别组合。", "00:¬A1¬A0，01:¬A1A0，10:A1¬A0，11:A1A0。"] });
configs["address-decoder"] = decode(["地址 A1", "地址 A0"], ["单元 0", "单元 1", "单元 2", "单元 3"]);
configs["opcode-decoder"] = decode(["操作码 Op1", "操作码 Op0"], ["ADD 00", "AND 01", "OR 10", "XOR 11"]);

export const NEW_BOOLEAN_SPECS = Object.fromEntries(Object.entries(configs).map(([id, c]) => [id, { inputLabels: c.inputs, outputLabels: c.outputs, requiredGateTypes: [], allowedGateTypes: c.allowedGateTypes, evaluate: c.evaluate, summary: WORKBENCH_CHALLENGES.find(item=>item.id===id).goal }]));

export const CURRICULUM_CIRCUITS = WORKBENCH_CHALLENGES.map(lesson => {
  const c = configs[lesson.id], outputColumn = Math.max(...c.gates.map(g=>g[2]))+1;
  const inputs = c.inputs.map((label,k)=>node(`i${k}`, "input", label, 40, 40+k*180));
  const outputs = c.outputs.map((label,k)=>node(`o${k}`, "output", label, 40+outputColumn*240, 40+k*180));
  const cases = booleanCases(inputs.map(n=>n.id), outputs.map(n=>n.id), c.evaluate);
  const indices=cases.length<=4?cases.map((_,i)=>i):lesson.id==='signed-overflow'?[0,1,6,7]:lesson.id==='interrupt-mask'?[4,5,6,7]:lesson.id==='io-handshake'?[3,4,6,7]:[0,cases.length/2-1,cases.length/2,cases.length-1];
  return { id: lesson.id, title: lesson.title, goal: lesson.goal, section: lesson.section, hints: c.hints, gradingMode: "functional", nodes: [...inputs, ...c.gates.map(([id,type,col,row])=>node(id,type,type.toUpperCase(),40+col*240,40+row*180)), ...outputs], requiredEdges: c.wires.map(item=>wire(...item.split(" "))), testCases: indices.map(i=>cases[i]), hiddenTestCases: cases.filter((_,i)=>!indices.includes(i)) };
});
