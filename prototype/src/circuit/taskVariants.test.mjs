import test from "node:test";
import assert from "node:assert/strict";
import { HALF_ADDER_CIRCUIT } from "./challengeCircuitModel.js";
import { generateVariant } from "./taskVariants.js";
import { runAllCircuitTests } from "./circuitSimulation.js";

test("variants with same seed produce identical results", () => {
  const r1 = generateVariant(HALF_ADDER_CIRCUIT, 42);
  const r2 = generateVariant(HALF_ADDER_CIRCUIT, 42);
  assert.deepEqual(r1.variant.testCases.map((c) => c.name), r2.variant.testCases.map((c) => c.name));
  assert.equal(r1.seed, 42);
});

test("variants with different seeds produce different order", () => {
  const r1 = generateVariant(HALF_ADDER_CIRCUIT, 1);
  const r2 = generateVariant(HALF_ADDER_CIRCUIT, 999);
  // Compare expected values order, not names (names are generic)
  const vals1 = JSON.stringify(r1.variant.testCases.map((c) => c.expected));
  const vals2 = JSON.stringify(r2.variant.testCases.map((c) => c.expected));
  // At least one position should differ (shuffled)
  assert.ok(vals1 !== vals2 || r1.variant.testCases.length !== r2.variant.testCases.length);
});

test("variant test cases still pass with correct edges", () => {
  const { variant } = generateVariant(HALF_ADDER_CIRCUIT, 123);
  const result = runAllCircuitTests(variant, HALF_ADDER_CIRCUIT.requiredEdges);
  assert.equal(result.passed, true);
});

test("variant test cases fail with wrong edges", () => {
  const { variant } = generateVariant(HALF_ADDER_CIRCUIT, 456);
  const badEdges = HALF_ADDER_CIRCUIT.requiredEdges.slice(0, 2);
  const result = runAllCircuitTests(variant, badEdges);
  assert.equal(result.passed, false);
});
