import test from "node:test";
import assert from "node:assert/strict";
import { assembleEdu16, createEdu16State, executeInstruction, stepMicro, runEdu16 } from "./cpuSimulator.js";

test("assembles and runs the addition teaching program with observable register changes", () => {
  const program = assembleEdu16("LOAD 16\nADD 17\nSTORE 18\nHALT");
  const state = createEdu16State({ program, memory: { 16: 6, 17: 1 } });
  const result = runEdu16(state);
  assert.equal(result.state.acc, 7);
  assert.equal(result.state.memory[18], 7);
  assert.equal(result.state.halted, true);
  assert.equal(result.instructionsExecuted, 4);
});

test("exposes fetch, decode, operand, execute and write-back micro steps", () => {
  const state = createEdu16State({ program: assembleEdu16("LOAD 16\nHALT"), memory: { 16: 9 } });
  const fetch = stepMicro(state);
  const read = stepMicro(fetch.state);
  const loaded = stepMicro(read.state);
  const decoded = stepMicro(loaded.state);
  const addressed = stepMicro(decoded.state);
  const operand = stepMicro(addressed.state);
  const executed = stepMicro(operand.state);
  const written = stepMicro(executed.state);
  assert.equal(fetch.trace.phase, "fetch-address");
  assert.equal(read.trace.phase, "fetch-read");
  assert.equal(decoded.trace.phase, "decode");
  assert.equal(operand.trace.phase, "operand-read");
  assert.equal(executed.trace.phase, "execute");
  assert.equal(written.trace.phase, "write-back");
  assert.equal(written.state.acc, 9);
});

test("handles a zero branch, arithmetic wrapping and invalid instruction traps", () => {
  const branch = runEdu16(createEdu16State({ program: assembleEdu16("LOAD 10\nJZ 3\nLOAD 11\nHALT"), memory: { 10: 0, 11: 99 } }));
  assert.equal(branch.state.acc, 0);
  assert.equal(branch.state.pc, 4);
  const wrapped = executeInstruction(createEdu16State({ program: assembleEdu16("LOAD 10\nADD 11\nHALT"), memory: { 10: 65535, 11: 1 } }));
  assert.equal(executeInstruction(wrapped.state).state.acc, 0);
  const trapped = executeInstruction(createEdu16State({ memory: { 0: 0x9000 } }));
  assert.match(trapped.state.trap, /非法操作码/);
});

test("rejects malformed assembly and stops a suspected loop at its execution budget", () => {
  assert.throws(() => assembleEdu16("LOAD 999"), /地址/);
  assert.throws(() => assembleEdu16("UNKNOWN 1"), /未知指令/);
  const loop = runEdu16(createEdu16State({ program: assembleEdu16("JMP 0") }), { maxInstructions: 3 });
  assert.match(loop.state.trap, /执行上限/);
  assert.equal(loop.instructionsExecuted, 3);
});
