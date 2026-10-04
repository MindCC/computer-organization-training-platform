import { CIRCUIT_CHALLENGES } from './circuit/challengeCircuitModel.js';
import { HARDWARE_GAME_CASES } from './hardwareGame.js';

// Miniatures come from the same node/wire models and order targets used by the labs.
const experimentRegistry = new Map([
  ...CIRCUIT_CHALLENGES.map(circuit => [circuit.id, {
    id: circuit.id, kind: 'circuit', title: circuit.title,
    description: circuit.goal, nodes: circuit.nodes, edges: circuit.requiredEdges,
    sample: circuit.testCases.at(-1),
  }]),
  ...HARDWARE_GAME_CASES.map(order => [order.id, {
    id: order.id, kind: 'hardware', title: order.title,
    description: order.customer, targets: order.targets,
  }]),
]);

const block = (id, label, x, y, type = 'buffer') => ({ id, label, type, position: { x, y } });
const wire = (from, to) => ({ id: from + '-' + to, from: { nodeId: from }, to: { nodeId: to } });
const diagram = (id, chapterId, description, nodes, pairs, sampleLabel = '') => ({
  id, chapterId, kind: 'diagram', title: description, description, nodes,
  edges: pairs.map(([from, to]) => wire(from, to)), sampleLabel,
});
const negativeFive = ((1 << 4) - 5).toString(2).padStart(4, '0');
const fullSum = 1 ^ 1 ^ 1;
const fullCarry = (1 & 1) | ((1 ^ 1) & 1);
const demoRegistry = new Map([
  ['intro', diagram('intro', 'ch1', '五大部件与存储程序的取指、执行路径', [
    block('input','输入',0,65,'input'), block('memory','存储器',125,65),
    block('control','控制器',250,5), block('alu','运算器',250,125), block('output','输出',375,125,'output'),
  ], [['input','memory'],['memory','control'],['memory','alu'],['control','alu'],['alu','output']])],
  ['arithmetic-basics', diagram('arithmetic-basics','ch2','补码表示与移位运算：从数值到二进制编码', [
    block('value','−5',0,65,'input'), block('ones','反码 1010',135,65), block('add','加 1',270,65,'increment'), block('twos','补码 '+negativeFive,405,65,'output'),
  ], [['value','ones'],['ones','add'],['add','twos']], '−5 的 4 位补码：'+negativeFive)],
  ['alu', diagram('alu','ch2','定点乘除与浮点运算的加法、移位和对阶步骤', [
    block('operand','M / Q',0,65,'input'), block('add','加 / 减',135,10,'aluWord'), block('shift','移位',135,120), block('result','积 / 商',270,65,'output'),
  ], [['operand','add'],['add','shift'],['shift','add'],['shift','result']], '加法与移位逐步构成乘除运算')],
  ['adder-alu', diagram('adder-alu','ch3','半加器、全加器与运算器的和位、进位信号', [
    block('a','A',0,10,'input'), block('b','B',0,120,'input'), block('xor','异或',135,10,'xor'), block('and','与',135,120,'and'), block('s','和 S',270,10,'output'), block('c','进位 C',270,120,'output'),
  ], [['a','xor'],['b','xor'],['a','and'],['b','and'],['xor','s'],['and','c']], '1 + 1 + 1 = '+fullCarry+fullSum+'₂')],
  ['memory-system', diagram('memory-system','ch4','寄存器、Cache、主存与辅存的存储层次', [
    block('cpu','CPU',0,65), block('cache','Cache',130,65), block('ram','主存 RAM',260,65,'teachingMemory'), block('disk','辅存',390,65),
  ], [['cpu','cache'],['cache','ram'],['ram','disk']], '速度、容量与局部性')],
  ['addressing', diagram('addressing','ch5','指令的操作码、地址码与有效地址计算', [
    block('ir','OP / 地址码',0,65,'instructionRom'), block('base','基址 100',135,10), block('offset','位移 12',135,120), block('ea','EA '+(100+12),270,65,'output'),
  ], [['ir','offset'],['base','ea'],['offset','ea']], '基址 + 位移 = 有效地址')],
  ['cpu', diagram('cpu','ch6','CPU 取指、译码、寄存器、执行与写回数据通路', [
    block('pc','PC',0,65), block('ir','IR',115,65,'instructionRom'), block('reg','寄存器',230,65), block('alu','ALU',345,65,'aluWord'), block('wb','写回',460,65,'output'),
  ], [['pc','ir'],['ir','reg'],['reg','alu'],['alu','wb']], '取指 → 译码 → 执行 → 写回')],
  ['bus', diagram('bus','ch7','CPU 与主存之间的地址、数据、控制三总线', [
    block('cpu','CPU',0,65), block('address','地址',135,0), block('data','数据',135,65), block('control','控制',135,130), block('memory','主存',270,65,'teachingMemory'),
  ], [['cpu','address'],['cpu','data'],['cpu','control'],['address','memory'],['data','memory'],['control','memory']], '地址 · 数据 · 控制')],
  ['io', diagram('io','ch8','程序查询、中断和 DMA 的 CPU、设备与主存传送路径', [
    block('device','I/O 设备',0,65,'input'), block('interface','接口 / IRQ',140,10), block('dma','DMA',140,120), block('cpu','CPU',280,10), block('memory','主存',280,120,'teachingMemory'),
  ], [['device','interface'],['interface','cpu'],['device','dma'],['dma','memory']], '查询 / 中断 / DMA')],
]);
demoRegistry.set('twos-complement', {...demoRegistry.get('arithmetic-basics'), id:'twos-complement'});

export function thumbnailForExperiment(id) { return experimentRegistry.get(id) ?? null; }
export function thumbnailForDemo(idOrHref) {
  const id = String(idOrHref ?? '').replace(/^.*\//, '').replace(/\.html(?:\?.*)?$/, '');
  return demoRegistry.get(id) ?? null;
}
