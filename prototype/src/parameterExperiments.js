/**
 * Public textbook teaching calculations. These functions do not read or write grades.
 * CPU: https://www.cs.cornell.edu/courses/cs3410/2025sp/notes/pipelining.html
 * AMAT: https://courses.cs.cornell.edu/cs3410/2026sp/notes/caches.html
 * Bus bandwidth follows bit width × cycles/second × transfers/cycle ÷ 8 bits/byte.
 */
function experiment(definition) {
  return Object.freeze({ ...definition, inputs: Object.freeze(definition.inputs.map(input => Object.freeze(input))) });
}

export const PARAMETER_EXPERIMENTS = Object.freeze([
  experiment({
    id: "cpu", title: "CPU 性能", shortTitle: "CPU", defaultSweepKey: "clockGHz",
    question: "同一段程序，频率、CPI 和指令量如何共同决定运行时间？",
    outputLabel: "程序运行时间", outputUnit: "ms",
    formula: "运行时间 = 指令量 × CPI ÷ 时钟频率",
    assumption: "把三项参数作为独立变量；CPI 为整个程序的平均值，不模拟流水线、缓存或功耗。",
    inputs: [
      { key: "clockGHz", label: "时钟频率", symbol: "f", unit: "GHz", min: 0.5, max: 6, step: 0.1, defaultValue: 3, help: "每秒时钟周期数，1 GHz = 10⁹ Hz。" },
      { key: "cpi", label: "平均 CPI", symbol: "CPI", unit: "周期/指令", min: 0.25, max: 8, step: 0.25, defaultValue: 1.5, help: "平均每条指令消耗的周期数，可小于 1。" },
      { key: "instructionMillions", label: "程序指令量", symbol: "N", unit: "百万条", min: 0, max: 2000, step: 10, defaultValue: 1000, help: "实际执行的指令总量，不是程序代码的行数。" },
    ],
  }),
  experiment({
    id: "cache", title: "Cache 访问", shortTitle: "Cache", defaultSweepKey: "hitPercent",
    question: "提高命中率，能减少多少平均存储器访问时间？",
    outputLabel: "平均访问时间 AMAT", outputUnit: "ns",
    formula: "AMAT = 缓存访问时间 + (1 − 命中率) × 未命中额外延迟",
    assumption: "单级、串行 Cache 查找模型：每次先查缓存；未命中后再付出额外内存访问延迟。",
    inputs: [
      { key: "hitPercent", label: "Cache 命中率", symbol: "h", unit: "%", min: 0, max: 100, step: 1, defaultValue: 90, help: "在缓存中直接找到所需数据的访问比例。" },
      { key: "cacheNs", label: "缓存访问时间", symbol: "tₕ", unit: "ns", min: 0.5, max: 20, step: 0.5, defaultValue: 2, help: "每次访问都要付出的 Cache 查找时间。" },
      { key: "memoryNs", label: "未命中后的内存延迟", symbol: "tₘ", unit: "ns", min: 0, max: 300, step: 5, defaultValue: 80, help: "未命中后追加的延迟，不包含上面的缓存访问时间。" },
    ],
  }),
  experiment({
    id: "bus", title: "总线带宽", shortTitle: "总线", defaultSweepKey: "clockMHz",
    question: "加宽总线、提高频率或每周期传输次数，吞吐量怎样变化？",
    outputLabel: "理论峰值带宽", outputUnit: "MB/s",
    formula: "带宽 = 位宽 × 时钟频率 × 每周期传输次数 ÷ 8",
    assumption: "计算连续传输的理论峰值，不计协议、仲裁和等待开销；1 MB = 10⁶ B，1 GB = 10⁹ B。",
    inputs: [
      { key: "widthBits", label: "数据总线位宽", symbol: "w", unit: "bit", min: 8, max: 256, step: 8, defaultValue: 64, integer: true, help: "一次传输能同时携带的二进制位数，8 bit = 1 B。" },
      { key: "clockMHz", label: "总线时钟频率", symbol: "f", unit: "MHz", min: 25, max: 1000, step: 25, defaultValue: 200, help: "每秒时钟周期数，1 MHz = 10⁶ Hz。" },
      { key: "transfersPerCycle", label: "每周期传输次数", symbol: "k", unit: "次/周期", min: 1, max: 4, step: 1, defaultValue: 2, integer: true, help: "在一个时钟周期内完成的数据传输次数。" },
    ],
  }),
]);

export function getParameterExperiment(id) {
  return PARAMETER_EXPERIMENTS.find(item => item.id === id) ?? PARAMETER_EXPERIMENTS[0];
}

export function defaultExperimentForChapter(chapterId) {
  return chapterId === "ch4" ? "cache" : ["ch7", "ch8"].includes(chapterId) ? "bus" : "cpu";
}

export function initialParametersForExperiment(id) {
  return Object.fromEntries(getParameterExperiment(id).inputs.map(input => [input.key, input.defaultValue]));
}

export function normalizeParameters(id, parameters = {}) {
  return Object.fromEntries(getParameterExperiment(id).inputs.map(input => {
    const raw = parameters?.[input.key];
    const number = (typeof raw === "number" || (typeof raw === "string" && raw.trim())) ? Number(raw) : NaN;
    let value = Number.isFinite(number) ? Math.min(input.max, Math.max(input.min, number)) : input.defaultValue;
    if (input.integer) value = Math.round(value);
    return [input.key, value];
  }));
}

export function calculateCpuPerformance(parameters) {
  const values = normalizeParameters("cpu", parameters);
  const instructionCount = values.instructionMillions * 1e6;
  const clockHz = values.clockGHz * 1e9;
  const clockCycles = instructionCount * values.cpi;
  const runtimeSeconds = clockCycles / clockHz;
  return { ...values, instructionCount, clockHz, clockCycles, runtimeSeconds, runtimeMs: runtimeSeconds * 1000, clockPeriodNs: 1 / values.clockGHz, millionInstructionsPerSecond: values.clockGHz * 1000 / values.cpi };
}

export function calculateCachePerformance(parameters) {
  const values = normalizeParameters("cache", parameters);
  const hitRate = values.hitPercent / 100;
  const missRate = 1 - hitRate;
  const missContributionNs = missRate * values.memoryNs;
  return { ...values, hitRate, missRate, missContributionNs, averageAccessNs: values.cacheNs + missContributionNs };
}

export function calculateBusPerformance(parameters) {
  const values = normalizeParameters("bus", parameters);
  const bytesPerTransfer = values.widthBits / 8;
  const transfersPerSecond = values.clockMHz * 1e6 * values.transfersPerCycle;
  const bandwidthBytesPerSecond = bytesPerTransfer * transfersPerSecond;
  return { ...values, bytesPerTransfer, transfersPerSecond, bandwidthBytesPerSecond, bandwidthMBps: bandwidthBytesPerSecond / 1e6, bandwidthGBps: bandwidthBytesPerSecond / 1e9 };
}

export function evaluateParameterExperiment(id, parameters) {
  const definition = getParameterExperiment(id);
  const result = definition.id === "cache" ? calculateCachePerformance(parameters)
    : definition.id === "bus" ? calculateBusPerformance(parameters) : calculateCpuPerformance(parameters);
  const value = definition.id === "cache" ? result.averageAccessNs : definition.id === "bus" ? result.bandwidthMBps : result.runtimeMs;
  return { ...result, value, unit: definition.outputUnit, label: definition.outputLabel };
}

/** Sweep one actual parameter while holding the other controls fixed. */
export function buildParameterCurve(id, parameters, sweepKey, pointCount = 61) {
  const definition = getParameterExperiment(id);
  const input = definition.inputs.find(item => item.key === sweepKey)
    ?? definition.inputs.find(item => item.key === definition.defaultSweepKey);
  const values = normalizeParameters(definition.id, parameters);
  const count = Number.isFinite(pointCount) ? Math.max(2, Math.min(161, Math.round(pointCount))) : 61;
  const samples = input.integer
    ? Array.from({ length: Math.floor((input.max - input.min) / input.step) + 1 }, (_, index) => input.min + index * input.step)
    : Array.from({ length: count }, (_, index) => input.min + (input.max - input.min) * index / (count - 1));
  return {
    key: input.key, xLabel: input.label, xUnit: input.unit, yLabel: definition.outputLabel, yUnit: definition.outputUnit,
    xMin: input.min, xMax: input.max,
    points: samples.map(x => ({ x, y: evaluateParameterExperiment(definition.id, { ...values, [input.key]: x }).value })),
    current: { x: values[input.key], y: evaluateParameterExperiment(definition.id, values).value },
  };
}
