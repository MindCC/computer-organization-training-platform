import { simulateCircuit } from "./circuitSimulation.js";
import { NEW_BOOLEAN_SPECS } from './curriculumCircuits.js';
import { BASIC_GATE_TYPES } from './gateCatalog.js';
import { canConnectPorts } from './circuitValidation.js';
import { circuitCost } from './circuitCost.js';

/**
 * 自由拼装闯关的判分规格（仅纯逻辑门关适用）。
 *
 * 判分思路（不看固定节点 id，只看结构与功能）：
 * 1. 结构：合法组合元件、准确的 I/O 数量、位宽、方向、单一驱动和无环路；
 * 2. 功能：枚举全部输入组合，把学生电路当黑盒仿真，比较输出与真值表。
 *
 * 关卡 I/O 用稳定 ioIndex 映射，拖动位置不会改变逻辑角色；旧沙盒兼容按 y 排序。
 */
export const FREEFORM_SPECS = {
  ...NEW_BOOLEAN_SPECS,
  "and-gate": {
    inputLabels: ["A", "B"],
    outputLabels: ["输出"],
    requiredGateTypes: ["and"],
    evaluate: ([a, b]) => [a & b],
    summary: "与门：输出 = A · B",
  },
  "or-gate": {
    inputLabels: ["A", "B"],
    outputLabels: ["输出"],
    requiredGateTypes: ["or"],
    evaluate: ([a, b]) => [a | b],
    summary: "或门：输出 = A + B",
  },
  "not-gate": {
    inputLabels: ["A"],
    outputLabels: ["输出"],
    requiredGateTypes: ["not"],
    evaluate: ([a]) => [a ^ 1],
    summary: "非门：输出 = ¬A",
  },
  "xor-gate": {
    inputLabels: ["A", "B"],
    outputLabels: ["输出"],
    requiredGateTypes: ["xor"],
    evaluate: ([a, b]) => [a ^ b],
    summary: "异或门：输出 = A ⊕ B",
  },
  "half-adder": {
    inputLabels: ["A", "B"],
    outputLabels: ["和位 S", "进位 C"],
    requiredGateTypes: ["xor", "and"],
    evaluate: ([a, b]) => [a ^ b, a & b],
    summary: "半加器：S = A ⊕ B，C = A · B",
  },
  "full-adder": {
    inputLabels: ["A", "B", "Cin"],
    outputLabels: ["和位 S", "进位 Cout"],
    requiredGateTypes: ["xor", "and", "or"],
    evaluate: ([a, b, cin]) => {
      const total = (a & 1) + (b & 1) + (cin & 1);
      return [total & 1, total > 1 ? 1 : 0];
    },
    summary: "全加器：S = A ⊕ B ⊕ Cin，Cout = 多数表决",
  },
};

// Functional puzzles accept De Morgan / NAND and other equivalent solutions.
for(const spec of Object.values(FREEFORM_SPECS))spec.requiredGateTypes=[];

export function freeformSpecOf(challengeId) {
  return FREEFORM_SPECS[challengeId] ?? null;
}

function gateTypesOf(model) {
  return new Set((model?.nodes ?? []).map((node) => node.type));
}

function nodesOfType(model, type) {
  return (model?.nodes ?? [])
    .filter((node) => node.type === type)
    .slice()
    .sort((left, right) => (left.ioIndex??left.position.y) - (right.ioIndex??right.position.y) || left.position.x - right.position.x);
}

/** 结构检查：门类型齐全 + 输入/输出数量与规格一致。 */
export function checkFreeformStructure(model, spec) {
  const errors = [];
  const types = gateTypesOf(model);

  for (const gateType of spec.requiredGateTypes) {
    if (!types.has(gateType)) errors.push({ type: "缺少门", message: `还没有放入「${gateType}」门。` });
  }

  const inputs = nodesOfType(model, "input");
  const outputs = nodesOfType(model, "output");
  if (inputs.length !== spec.inputLabels.length) {
    errors.push({ type: "输入不足", message: `需要 ${spec.inputLabels.length} 个输入开关（当前 ${inputs.length} 个）。` });
  }
  if (outputs.length !== spec.outputLabels.length) {
    errors.push({ type: "输出不足", message: `需要 ${spec.outputLabels.length} 个输出灯（当前 ${outputs.length} 个）。` });
  }

  const allowed=spec.allowedGateTypes??BASIC_GATE_TYPES;
  if((model?.nodes??[]).some(n=>!['input','output',...allowed].includes(n.type)))errors.push({type:'元件限制',message:`本关允许的门：${allowed.join(' / ')}。`});

  return { ok: errors.length === 0, errors, inputs, outputs };
}

/**
 * 功能判分：把学生电路当黑盒，枚举输入组合比对真值表。
 * 返回 { passed, structuralErrors, cases, message }
 */
export function gradeFreeform(model, circuitEdges, spec) {
  if(!spec)return {passed:false,structuralErrors:[{type:'未知任务',message:'本关没有自由拼装任务。'}],cases:[],message:'未知任务'};
  const accepted=[];
  for(const edge of circuitEdges??[]){
    const check=canConnectPorts(model,edge,accepted);
    if(!check.ok)return {passed:false,structuralErrors:[{type:check.type,message:check.message}],cases:[],message:check.message};
    accepted.push(edge);
  }
  const structure = checkFreeformStructure(model, spec);
  if (!structure.ok) {
    return {
      passed: false,
      structuralErrors: structure.errors,
      cases: [],
      message: structure.errors[0]?.message ?? "电路结构还不完整。",
    };
  }

  const inputNodes = structure.inputs.slice(0, spec.inputLabels.length);
  const outputNodes = structure.outputs.slice(0, spec.outputLabels.length);
  const cases = [];

  const totalCombinations = 1 << inputNodes.length;
  for (let mask = 0; mask < totalCombinations; mask += 1) {
    const inputBits = inputNodes.map((_, index) => (mask >> (inputNodes.length - 1 - index)) & 1);
    const simInputs = Object.fromEntries(inputNodes.map((node, index) => [`${node.id}.out`, inputBits[index]]));
    const simulation = simulateCircuit(model, circuitEdges, simInputs);
    const expected = spec.evaluate(inputBits);
    const actual = outputNodes.map((node) => simulation.values?.[`${node.id}.in`]);
    const casePassed = expected.every((value, index) => actual[index] === value);
    cases.push({
      inputs: Object.fromEntries(spec.inputLabels.map((label, index) => [label, inputBits[index]])),
      expected,
      actual,
      passed: casePassed,
      unknown: actual.some((value) => value !== 0 && value !== 1),
    });
  }

  const passed = cases.every((item) => item.passed);
  const firstFailure = cases.find((item) => !item.passed);
  const message = passed
    ? "结构与功能全部正确：每种输入组合下输出都与真值表一致。"
    : firstFailure?.unknown
      ? "有输出没算出来：检查门与门之间是不是都连上线了（存在未知信号）。"
      : `输入 ${JSON.stringify(firstFailure?.inputs)} 时输出不对：期望 ${firstFailure?.expected.join("/")}，实际 ${firstFailure?.actual.join("/")}。`;

  return { passed, structuralErrors: [], cases, message, cost:passed?circuitCost(model,circuitEdges):null };
}
