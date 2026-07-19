import test from "node:test";
import assert from "node:assert/strict";
import { HALF_ADDER_CIRCUIT } from "./challengeCircuitModel.js";
import { injectFaults, verifyFaultFix, FAULT_TYPES } from "./faultInjection.js";
import { runAllCircuitTests } from "./circuitSimulation.js";

test("injectFaults with fixed seed produces deterministic faults", () => {
  const r1 = injectFaults(HALF_ADDER_CIRCUIT, { seed: 42, faultCount: 2 });
  const r2 = injectFaults(HALF_ADDER_CIRCUIT, { seed: 42, faultCount: 2 });
  assert.deepEqual(r1.faults.map((f) => f.type), r2.faults.map((f) => f.type));
  assert.equal(r1.seed, 42);
});

test("injectFaults reduces edge count", () => {
  const result = injectFaults(HALF_ADDER_CIRCUIT, { seed: 123, faultCount: 2 });
  assert.ok(result.modifiedEdges.length < HALF_ADDER_CIRCUIT.requiredEdges.length);
  assert.ok(result.faults.length > 0);
  assert.ok(result.description.length > 0);
});

test("injected faults cause circuit tests to fail", () => {
  const result = injectFaults(HALF_ADDER_CIRCUIT, { seed: 99, faultCount: 1, faultTypes: [FAULT_TYPES.BROKEN_WIRE] });
  const testResult = runAllCircuitTests(HALF_ADDER_CIRCUIT, result.modifiedEdges);
  assert.equal(testResult.passed, false);
});

test("verifyFaultFix confirms restoration of original edges", () => {
  const result = injectFaults(HALF_ADDER_CIRCUIT, { seed: 7, faultCount: 1, faultTypes: [FAULT_TYPES.BROKEN_WIRE] });
  const check1 = verifyFaultFix(HALF_ADDER_CIRCUIT, result.modifiedEdges, result);
  assert.equal(check1.fixed, false);

  const check2 = verifyFaultFix(HALF_ADDER_CIRCUIT, HALF_ADDER_CIRCUIT.requiredEdges, result);
  assert.equal(check2.fixed, true);
  assert.equal(check2.message, "所有故障已修复！");
});

test("injectFaults with reversed wire produces a reversed edge", () => {
  const result = injectFaults(HALF_ADDER_CIRCUIT, { seed: 5, faultCount: 1, faultTypes: [FAULT_TYPES.REVERSED_WIRE] });
  const reversedFault = result.faults.find((f) => f.type === FAULT_TYPES.REVERSED_WIRE);
  assert.ok(reversedFault);
  assert.notDeepEqual(reversedFault.edge.from, HALF_ADDER_CIRCUIT.requiredEdges.find((e) =>
    e.from.nodeId === reversedFault.edge.to.nodeId && e.from.portId === reversedFault.edge.to.portId
  )?.from);
});
