export const EDU16_OPCODES = Object.freeze({ HALT: 0, LOAD: 1, STORE: 2, ADD: 3, SUB: 4, AND: 5, OR: 6, JZ: 7, JMP: 8 });
const OPCODE_NAMES = Object.fromEntries(Object.entries(EDU16_OPCODES).map(([name, opcode]) => [opcode, name]));
const WORD_MAX = 0xffff;
const ADDRESS_MAX = 0xff;

export function assembleEdu16(source) {
  if (typeof source !== "string") throw new Error("程序必须是文本");
  const program = [];
  source.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.replace(/;.*/, "").trim();
    if (!line) return;
    const [mnemonic, operandText, extra] = line.split(/\s+/);
    const opcode = EDU16_OPCODES[mnemonic?.toUpperCase()];
    if (opcode == null) throw new Error(`第 ${index + 1} 行未知指令：${mnemonic}`);
    if (extra || (opcode === EDU16_OPCODES.HALT ? operandText : !operandText)) throw new Error(`第 ${index + 1} 行操作数无效`);
    const address = opcode === EDU16_OPCODES.HALT ? 0 : parseAddress(operandText, index + 1);
    program.push((opcode << 12) | address);
  });
  if (program.length === 0) throw new Error("程序不能为空");
  if (program.length > 256) throw new Error("程序不能超过 256 条指令");
  return program;
}

export function createEdu16State({ program = [], memory = {}, pc = 0, acc = 0 } = {}) {
  const words = new Array(256).fill(0);
  for (const [address, value] of Object.entries(memory)) words[parseAddress(address)] = word(value);
  program.forEach((value, index) => { if (index > ADDRESS_MAX) throw new Error("程序不能超过 256 条指令"); words[index] = word(value); });
  return { memory: words, pc: address(pc), mar: 0, mdr: 0, ir: 0, acc: word(acc), phase: "fetch-address", halted: false, trap: null, instructionCount: 0 };
}

export function stepMicro(state) {
  const current = normalizeState(state);
  if (current.halted || current.trap) return { state: current, trace: trace(current, "stopped", [], "处理器已经停止。") };
  const next = cloneState(current);
  let changes = [];
  let explanation = "";
  switch (current.phase) {
    case "fetch-address":
      next.mar = current.pc;
      next.phase = "fetch-read";
      changes = changed(current, next, ["mar"]);
      explanation = "PC 中的下一条指令地址送入 MAR。";
      break;
    case "fetch-read":
      next.mdr = current.memory[current.mar];
      next.phase = "fetch-load-ir";
      changes = changed(current, next, ["mdr"]);
      explanation = "主存按 MAR 读出指令字，送入 MDR。";
      break;
    case "fetch-load-ir":
      next.ir = current.mdr;
      next.pc = address(current.pc + 1);
      next.phase = "decode";
      changes = changed(current, next, ["ir", "pc"]);
      explanation = "MDR 的指令进入 IR，PC 指向顺序下一条指令。";
      break;
    case "decode": {
      const decoded = decode(current.ir);
      if (!decoded) { next.trap = `非法操作码：${current.ir >> 12}`; changes = changed(current, next, ["trap"]); explanation = "操作码未定义，处理器停止。"; break; }
      next.phase = needsOperand(decoded.opcode) ? "operand-address" : "execute";
      explanation = `控制器译码为 ${decoded.name}。`;
      break;
    }
    case "operand-address":
      next.mar = operand(current.ir);
      next.phase = "operand-read";
      changes = changed(current, next, ["mar"]);
      explanation = "指令低 8 位地址送入 MAR。";
      break;
    case "operand-read":
      next.mdr = current.memory[current.mar];
      next.phase = "execute";
      changes = changed(current, next, ["mdr"]);
      explanation = "操作数从主存读入 MDR。";
      break;
    case "execute": {
      const result = executeOperation(current, next);
      changes = changed(current, next, result.fields);
      explanation = result.explanation;
      break;
    }
    case "write-back":
      next.phase = "fetch-address";
      next.instructionCount += 1;
      changes = changed(current, next, ["instructionCount"]);
      explanation = "本条指令完成，准备取下一条指令。";
      break;
    default: next.trap = `未知微步骤：${current.phase}`; changes = changed(current, next, ["trap"]); explanation = "状态无效，处理器停止。";
  }
  return { state: next, trace: trace(next, current.phase, changes, explanation) };
}

export function executeInstruction(state) {
  let result = { state: normalizeState(state), trace: null };
  const startingCount = result.state.instructionCount;
  for (let i = 0; i < 8 && !result.state.halted && !result.state.trap; i += 1) {
    result = stepMicro(result.state);
    if (result.state.instructionCount > startingCount) break;
  }
  return result;
}

export function runEdu16(state, { maxInstructions = 1000 } = {}) {
  if (!Number.isInteger(maxInstructions) || maxInstructions < 1) throw new Error("执行上限无效");
  let current = normalizeState(state);
  const startingCount = current.instructionCount;
  while (!current.halted && !current.trap && current.instructionCount - startingCount < maxInstructions) current = executeInstruction(current).state;
  if (!current.halted && !current.trap) current = { ...current, trap: `达到执行上限 ${maxInstructions}，程序可能存在循环。` };
  return { state: current, instructionsExecuted: current.instructionCount - startingCount };
}

function executeOperation(current, next) {
  const decoded = decode(current.ir);
  if (!decoded) { next.trap = `非法操作码：${current.ir >> 12}`; return { fields: ["trap"], explanation: "操作码未定义，处理器停止。" }; }
  switch (decoded.opcode) {
    case EDU16_OPCODES.HALT: next.halted = true; next.instructionCount += 1; return { fields: ["halted", "instructionCount"], explanation: "HALT 停止执行。" };
    case EDU16_OPCODES.LOAD: next.acc = current.mdr; break;
    case EDU16_OPCODES.STORE: next.memory[current.mar] = current.acc; break;
    case EDU16_OPCODES.ADD: next.acc = word(current.acc + current.mdr); break;
    case EDU16_OPCODES.SUB: next.acc = word(current.acc - current.mdr); break;
    case EDU16_OPCODES.AND: next.acc = current.acc & current.mdr; break;
    case EDU16_OPCODES.OR: next.acc = current.acc | current.mdr; break;
    case EDU16_OPCODES.JZ: if (current.acc === 0) next.pc = operand(current.ir); break;
    case EDU16_OPCODES.JMP: next.pc = operand(current.ir); break;
  }
  next.phase = "write-back";
  return { fields: decoded.opcode === EDU16_OPCODES.STORE ? ["memory"] : decoded.opcode === EDU16_OPCODES.JZ || decoded.opcode === EDU16_OPCODES.JMP ? ["pc"] : ["acc"], explanation: `${decoded.name} 的执行结果已产生。` };
}

function trace(state, phase, changes, explanation) { return { phase, changes, explanation, activeTransfers: transferFor(phase), registers: { pc: state.pc, mar: state.mar, mdr: state.mdr, ir: state.ir, acc: state.acc } }; }
function transferFor(phase) { return ({ "fetch-address": ["PC→MAR"], "fetch-read": ["M(MAR)→MDR"], "fetch-load-ir": ["MDR→IR", "PC+1→PC"], "operand-address": ["IR.address→MAR"], "operand-read": ["M(MAR)→MDR"], execute: ["MDR/ACC→ALU"] })[phase] ?? []; }
function decode(ir) { const opcode = ir >> 12; return OPCODE_NAMES[opcode] ? { opcode, name: OPCODE_NAMES[opcode] } : null; }
function needsOperand(opcode) { return opcode !== EDU16_OPCODES.HALT; }
function operand(ir) { return ir & ADDRESS_MAX; }
function parseAddress(value, line = null) { const result = Number(value); if (!Number.isInteger(result) || result < 0 || result > ADDRESS_MAX) throw new Error(`${line ? `第 ${line} 行` : "地址"}地址必须在 0 到 255 之间`); return result; }
function address(value) { return Number(value) & ADDRESS_MAX; }
function word(value) { if (!Number.isInteger(Number(value))) throw new Error("字值必须是整数"); return Number(value) & WORD_MAX; }
function normalizeState(state) { const current = state && typeof state === "object" ? state : {}; return { ...createEdu16State({ memory: current.memory, pc: current.pc, acc: current.acc }), mar: address(current.mar ?? 0), mdr: word(current.mdr ?? 0), ir: word(current.ir ?? 0), phase: current.phase ?? "fetch-address", halted: current.halted === true, trap: current.trap ?? null, instructionCount: Number.isInteger(current.instructionCount) ? current.instructionCount : 0 }; }
function cloneState(state) { return { ...state, memory: [...state.memory] }; }
function changed(before, after, fields) { return fields.filter((field) => field === "memory" ? before.memory.some((value, index) => value !== after.memory[index]) : before[field] !== after[field]); }
