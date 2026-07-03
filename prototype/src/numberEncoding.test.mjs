import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMachineNumberExercise,
  encodeSignedInteger,
  gradeMachineNumberAnswer,
} from "./numberEncoding.js";

test("encodes positive and negative integers as 4-bit signed machine numbers", () => {
  assert.deepEqual(encodeSignedInteger(5, 4), {
    value: 5,
    bits: 4,
    signMagnitude: "0101",
    onesComplement: "0101",
    twosComplement: "0101",
    overflow: false,
  });

  assert.deepEqual(encodeSignedInteger(-5, 4), {
    value: -5,
    bits: 4,
    signMagnitude: "1101",
    onesComplement: "1010",
    twosComplement: "1011",
    overflow: false,
  });
});

test("marks values outside 4-bit signed range as overflow", () => {
  const result = encodeSignedInteger(-9, 4);

  assert.equal(result.overflow, true);
  assert.equal(result.twosComplement, null);
});

test("grades student machine-number answers with precise feedback", () => {
  const correct = gradeMachineNumberAnswer(-3, {
    signMagnitude: "1011",
    onesComplement: "1100",
    twosComplement: "1101",
  });
  const wrong = gradeMachineNumberAnswer(-3, {
    signMagnitude: "0011",
    onesComplement: "1011",
    twosComplement: "1100",
  });

  assert.equal(correct.passed, true);
  assert.equal(correct.score, 100);
  assert.deepEqual(wrong.errors.map((error) => error.type), ["符号位错误", "反码错误", "补码错误"]);
});

test("builds a beginner-friendly exercise set from common classroom numbers", () => {
  const exercise = buildMachineNumberExercise();

  assert.equal(exercise.bits, 4);
  assert.equal(exercise.cases.length >= 4, true);
  assert.equal(exercise.cases.some((item) => item.value < 0), true);
  assert.equal(exercise.cases.every((item) => item.expected.twosComplement?.length === 4), true);
});
