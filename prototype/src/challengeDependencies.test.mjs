import test from "node:test";
import assert from "node:assert/strict";

import { CHALLENGE_DEPS, dependenciesOf, dependencyDepth, dependencyDepths, isUnlocked } from "./challengeDependencies.js";
import { CHALLENGES, buildInitialProgress, recordAttempt } from "./platformLogic.js";

const passed = { passed: true, errors: [], score: 100, elapsedMinutes: 5 };

test("全部课程关卡都有依赖定义且无环", () => {
  const ids = CHALLENGES.map((c) => c.id);
  for (const id of ids) assert.ok(id in CHALLENGE_DEPS, `${id} 缺少依赖定义`);
  // 依赖必须指向已有关卡
  for (const id of ids) for (const dep of dependenciesOf(id)) assert.ok(ids.includes(dep), `${id} 依赖了不存在的 ${dep}`);
  // 深度有限 = 无环
  const depths = dependencyDepths(ids);
  for (const id of ids) assert.ok(Number.isFinite(depths[id]));
});

test("拓扑深度符合图灵完备式结构（根→门→加法器→ALU→CPU→总线→IO）", () => {
  assert.equal(dependencyDepth("computer-components"), 0);
  assert.equal(dependencyDepth("program-flow"), 1);
  assert.equal(dependencyDepth("machine-number"), 2);
  assert.equal(dependencyDepth("data-flow"), 3);
  assert.equal(dependencyDepth("and-gate"), 4);
  assert.equal(dependencyDepth("memory-address"), 3);
  assert.equal(dependencyDepth("half-adder"), 5);
  assert.equal(dependencyDepth("mux"), 5);
  assert.equal(dependencyDepth("full-adder"), 6);
  assert.equal(dependencyDepth("alu"), 7);
  assert.equal(dependencyDepth("cpu-datapath"), 8);
  assert.equal(dependencyDepth("system-bus"), 9);
  assert.equal(dependencyDepth("io-transfer"), 10);
});

test("解锁条件按依赖判定", () => {
  const progress = { "machine-number": { status: "completed" } };
  assert.equal(isUnlocked("data-flow", progress), true);
  assert.equal(isUnlocked("and-gate", progress), false, "与门依赖数据流，数据流没完成不解锁");
  assert.equal(isUnlocked("half-adder", { "xor-gate": { status: "completed" } }), false, "半加器需要 xor+and 双依赖");
  assert.equal(isUnlocked("half-adder", { "xor-gate": { status: "completed" }, "and-gate": { status: "completed" } }), true);
});

test("依赖驱动解锁：完成数据流后四个逻辑门并行解锁（不再是线性一次一关）", () => {
  let progress = buildInitialProgress(CHALLENGES);
  for (const id of ["computer-components", "program-flow", "machine-number", "data-flow"]) {
    progress = recordAttempt(progress, id, passed);
  }
  for (const gate of ["and-gate", "or-gate", "not-gate", "xor-gate"]) {
    assert.equal(progress[gate].status, "in-progress", `${gate} 应在数据流完成后并行解锁`);
  }
  assert.equal(progress["half-adder"].status, "locked", "半加器还需 xor+and");
  assert.equal(progress["memory-address"].status, "in-progress", "存储器依赖机器数，应已解锁");
});

test("半加器在 xor 与 and 都完成后才解锁，而不是按顺序", () => {
  let progress = buildInitialProgress(CHALLENGES);
  for (const id of ["computer-components", "program-flow", "machine-number", "data-flow", "xor-gate"]) {
    progress = recordAttempt(progress, id, passed);
  }
  assert.equal(progress["half-adder"].status, "locked", "只做了 xor，and 没做，半加器不解锁");
  progress = recordAttempt(progress, "and-gate", passed);
  assert.equal(progress["half-adder"].status, "in-progress", "xor+and 都完成后半加器解锁");
});

test("CPU 在 ALU 与指令数据双依赖都完成后解锁", () => {
  const progress = {
    "alu": { status: "completed" },
    "instruction-data": { status: "locked" },
  };
  assert.equal(isUnlocked("cpu-datapath", progress), false);
  progress["instruction-data"].status = "completed";
  assert.equal(isUnlocked("cpu-datapath", progress), true);
});
