import test from "node:test";
import assert from "node:assert/strict";
import {
  PARAMETER_EXPERIMENTS,
  buildParameterCurve,
  calculateBusPerformance,
  calculateCachePerformance,
  calculateCpuPerformance,
  defaultExperimentForChapter,
  evaluateParameterExperiment,
  initialParametersForExperiment,
  normalizeParameters,
} from "./parameterExperiments.js";

function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`); }

test("CPU converts million instructions and GHz into seconds and milliseconds", () => {
  const result = calculateCpuPerformance({ clockGHz: 2, cpi: 4, instructionMillions: 1000 });
  assert.equal(result.instructionCount, 1e9);
  assert.equal(result.clockHz, 2e9);
  assert.equal(result.clockCycles, 4e9);
  assert.equal(result.runtimeSeconds, 2);
  assert.equal(result.runtimeMs, 2000);
  assert.equal(result.clockPeriodNs, 0.5);
});

test("CPU time decreases with frequency and increases with CPI and instruction count", () => {
  const parameters = { clockGHz: 2, cpi: 2, instructionMillions: 500 };
  const baseline = calculateCpuPerformance(parameters).runtimeMs;
  assert.equal(calculateCpuPerformance({ ...parameters, clockGHz: 4 }).runtimeMs, baseline / 2);
  assert.equal(calculateCpuPerformance({ ...parameters, cpi: 4 }).runtimeMs, baseline * 2);
  assert.equal(calculateCpuPerformance({ ...parameters, instructionMillions: 1000 }).runtimeMs, baseline * 2);
  assert.equal(calculateCpuPerformance({ ...parameters, instructionMillions: 0 }).runtimeMs, 0);
});

test("single-level Cache AMAT includes lookup time and additional miss penalty", () => {
  const result = calculateCachePerformance({ hitPercent: 90, cacheNs: 2, memoryNs: 80 });
  close(result.averageAccessNs, 10);
  close(result.missContributionNs, 8);
  close(result.hitRate, 0.9);
  close(result.missRate, 0.1);
  close(calculateCachePerformance({ hitPercent: 100, cacheNs: 2, memoryNs: 80 }).averageAccessNs, 2);
  close(calculateCachePerformance({ hitPercent: 0, cacheNs: 2, memoryNs: 80 }).averageAccessNs, 82);
});

test("Cache improves monotonically with hit rate; lookup time and extra memory delay increase AMAT", () => {
  const parameters = { hitPercent: 80, cacheNs: 2, memoryNs: 100 };
  const baseline = calculateCachePerformance(parameters).averageAccessNs;
  assert.ok(calculateCachePerformance({ ...parameters, hitPercent: 90 }).averageAccessNs < baseline);
  assert.ok(calculateCachePerformance({ ...parameters, cacheNs: 4 }).averageAccessNs > baseline);
  assert.ok(calculateCachePerformance({ ...parameters, memoryNs: 200 }).averageAccessNs > baseline);
  close(calculateCachePerformance({ ...parameters, memoryNs: 0 }).averageAccessNs, 2);
});

test("bus converts bits, MHz and transfers per cycle into decimal bytes per second", () => {
  const result = calculateBusPerformance({ widthBits: 64, clockMHz: 200, transfersPerCycle: 2 });
  assert.equal(result.bandwidthBytesPerSecond, 3.2e9);
  assert.equal(result.bandwidthMBps, 3200);
  assert.equal(result.bandwidthGBps, 3.2);
  assert.equal(result.bytesPerTransfer, 8);
  assert.equal(result.transfersPerSecond, 4e8);
});

test("bus bandwidth grows linearly with each independent physical input", () => {
  const parameters = { widthBits: 32, clockMHz: 200, transfersPerCycle: 1 };
  const baseline = calculateBusPerformance(parameters).bandwidthMBps;
  for (const [key, value] of [["widthBits", 64], ["clockMHz", 400], ["transfersPerCycle", 2]]) {
    assert.equal(calculateBusPerformance({ ...parameters, [key]: value }).bandwidthMBps, baseline * 2);
  }
});

test("invalid inputs are bounded safely, defaults are independent and source objects remain untouched", () => {
  const input = { clockGHz: 0, cpi: Infinity, instructionMillions: -20 };
  const copy = { ...input };
  assert.deepEqual(normalizeParameters("cpu", input), { clockGHz: 0.5, cpi: 1.5, instructionMillions: 0 });
  assert.deepEqual(input, copy);
  assert.deepEqual(normalizeParameters("cache", { hitPercent: 250, cacheNs: -2, memoryNs: "bad" }), { hitPercent: 100, cacheNs: 0.5, memoryNs: 80 });
  assert.equal(normalizeParameters("bus", { transfersPerCycle: 2.7 }).transfersPerCycle, 3);
  const defaults = initialParametersForExperiment("cpu");
  defaults.cpi = 8;
  assert.equal(initialParametersForExperiment("cpu").cpi, 1.5);
  for (const experiment of PARAMETER_EXPERIMENTS) {
    const result = evaluateParameterExperiment(experiment.id, { wrong: null });
    assert.ok(Number.isFinite(result.value));
    assert.equal(result.unit, experiment.outputUnit);
  }
});

test("chapter recommendations choose the relevant public teaching model without restricting other themes", () => {
  assert.equal(defaultExperimentForChapter("ch4"), "cache");
  assert.equal(defaultExperimentForChapter("ch7"), "bus");
  assert.equal(defaultExperimentForChapter("ch8"), "bus");
  for (const chapterId of ["ch1", "ch2", "ch3", "ch5", "ch6", undefined]) assert.equal(defaultExperimentForChapter(chapterId), "cpu");
  assert.deepEqual(PARAMETER_EXPERIMENTS.map(experiment => experiment.id), ["cpu", "cache", "bus"]);
});

test("every semantic curve uses the same formula and units as its live result", () => {
  for (const experiment of PARAMETER_EXPERIMENTS) {
    const parameters = initialParametersForExperiment(experiment.id);
    for (const input of experiment.inputs) {
      const curve = buildParameterCurve(experiment.id, parameters, input.key);
      assert.equal(curve.xUnit, input.unit);
      assert.equal(curve.yUnit, experiment.outputUnit);
      assert.equal(curve.points[0].x, input.min);
      assert.equal(curve.points.at(-1).x, input.max);
      assert.ok(curve.points.length >= 2 && curve.points.length <= 161);
      for (const point of curve.points) {
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
        close(point.y, evaluateParameterExperiment(experiment.id, { ...parameters, [input.key]: point.x }).value);
      }
      close(curve.current.y, evaluateParameterExperiment(experiment.id, parameters).value);
    }
  }
});

test("curve directions respect CPU reciprocal frequency, Cache hit-rate reduction and bus throughput", () => {
  for (const [id, key, decreasing] of [["cpu", "clockGHz", true], ["cpu", "cpi", false], ["cache", "hitPercent", true], ["cache", "memoryNs", false], ["bus", "clockMHz", false]]) {
    const points = buildParameterCurve(id, initialParametersForExperiment(id), key).points;
    for (let index = 1; index < points.length; index++) assert.ok(decreasing ? points[index].y <= points[index - 1].y : points[index].y >= points[index - 1].y);
  }
});
