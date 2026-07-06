export const HARDWARE_PARTS = {
  cpu: [
    { id: "cpu-i3", name: "\u5165\u95e8\u7ea7 CPU", price: 650, performance: 55 },
    { id: "cpu-i5", name: "\u4e3b\u6d41\u7ea7 CPU", price: 1150, performance: 78 },
    { id: "cpu-i7", name: "\u9ad8\u6027\u80fd CPU", price: 1900, performance: 94 },
  ],
  memory: [
    { id: "mem-8", name: "8GB \u5185\u5b58", price: 180, capacity: 8, performance: 55 },
    { id: "mem-16", name: "16GB \u5185\u5b58", price: 320, capacity: 16, performance: 78 },
    { id: "mem-32", name: "32GB \u5185\u5b58", price: 620, capacity: 32, performance: 94 },
  ],
  storage: [
    { id: "hdd-1tb", name: "1TB \u673a\u68b0\u786c\u76d8", price: 280, capacity: 1024, performance: 38 },
    { id: "ssd-512", name: "512GB \u56fa\u6001\u786c\u76d8", price: 360, capacity: 512, performance: 78 },
    { id: "ssd-1tb", name: "1TB \u9ad8\u901f\u56fa\u6001\u786c\u76d8", price: 620, capacity: 1024, performance: 92 },
  ],
  gpu: [
    { id: "gpu-integrated", name: "\u96c6\u6210\u663e\u5361", price: 0, performance: 35 },
    { id: "gpu-entry", name: "\u5165\u95e8\u72ec\u663e", price: 850, performance: 68 },
    { id: "gpu-pro", name: "\u521b\u4f5c\u72ec\u663e", price: 1650, performance: 90 },
  ],
};

export const HARDWARE_GAME_CASES = [
  {
    id: "game-office-pc",
    title: "\u529e\u516c\u7535\u8111",
    shortTitle: "\u529e\u516c\u914d\u7f6e",
    chapter: "overview",
    customer: "\u529e\u516c\u5ba4\u9700\u8981\u4e00\u53f0\u54cd\u5e94\u5feb\u3001\u7a33\u5b9a\u3001\u4ef7\u683c\u4f4e\u7684\u7535\u8111\u3002",
    targets: { budget: 2200, cpu: 45, memory: 8, storageCapacity: 256, storageSpeed: 70, gpu: 30 },
  },
  {
    id: "game-student-pc",
    title: "\u5b66\u751f\u5b66\u4e60\u7535\u8111",
    shortTitle: "\u5b66\u751f\u914d\u7f6e",
    chapter: "overview",
    customer: "\u5b66\u751f\u8981\u5b8c\u6210\u7f51\u8bfe\u3001\u6587\u6863\u3001\u8f7b\u91cf\u7f16\u7a0b\uff0c\u9884\u7b97\u6709\u9650\u4f46\u4e0d\u80fd\u5361\u987f\u3002",
    targets: { budget: 2800, cpu: 60, memory: 16, storageCapacity: 512, storageSpeed: 70, gpu: 30 },
  },
  {
    id: "game-programming-pc",
    title: "\u5165\u95e8\u7f16\u7a0b\u7535\u8111",
    shortTitle: "\u7f16\u7a0b\u914d\u7f6e",
    chapter: "overview",
    customer: "\u9700\u8981\u8fd0\u884c IDE\u3001\u865a\u62df\u673a\u548c\u6d4f\u89c8\u5668\uff0c\u91cd\u70b9\u662f CPU \u4e0e\u5185\u5b58\u5747\u8861\u3002",
    targets: { budget: 3600, cpu: 75, memory: 16, storageCapacity: 512, storageSpeed: 70, gpu: 30 },
  },
  {
    id: "game-archive-storage",
    title: "\u5927\u5bb9\u91cf\u8d44\u6599\u5b58\u50a8",
    shortTitle: "\u5bb9\u91cf\u914d\u7f6e",
    chapter: "storage",
    customer: "\u8001\u5e08\u8981\u4fdd\u5b58\u8bfe\u7a0b\u8d44\u6599\u548c\u89c6\u9891\u5907\u4efd\uff0c\u5bb9\u91cf\u4f18\u5148\uff0c\u901f\u5ea6\u591f\u7528\u5373\u53ef\u3002",
    targets: { budget: 2600, cpu: 45, memory: 8, storageCapacity: 1024, storageSpeed: 35, gpu: 30 },
  },
  {
    id: "game-fast-boot",
    title: "\u9ad8\u901f\u542f\u52a8\u4e0e\u8f6f\u4ef6\u8fd0\u884c",
    shortTitle: "\u901f\u5ea6\u914d\u7f6e",
    chapter: "storage",
    customer: "\u7535\u8111\u4e3b\u8981\u7528\u4e8e\u9891\u7e41\u5f00\u5173\u673a\u548c\u52a0\u8f7d\u5927\u578b\u8f6f\u4ef6\uff0c\u5b58\u50a8\u901f\u5ea6\u5fc5\u987b\u660e\u663e\u63d0\u5347\u3002",
    targets: { budget: 3200, cpu: 60, memory: 16, storageCapacity: 512, storageSpeed: 85, gpu: 30 },
  },
  {
    id: "game-video-storage",
    title: "\u89c6\u9891\u7d20\u6750\u5904\u7406",
    shortTitle: "\u89c6\u9891\u914d\u7f6e",
    chapter: "storage",
    customer: "\u9700\u8981\u526a\u8f91\u8bfe\u7a0b\u89c6\u9891\uff0c\u7d20\u6750\u5927\u3001\u8bfb\u5199\u9891\u7e41\uff0c\u5e76\u4e14\u9700\u8981\u57fa\u672c\u56fe\u5f62\u52a0\u901f\u3002",
    targets: { budget: 5200, cpu: 75, memory: 32, storageCapacity: 2048, storageSpeed: 85, gpu: 65 },
  },
];

export const HARDWARE_GAME_PROGRESS_ITEMS = HARDWARE_GAME_CASES.map((gameCase) => ({
  id: gameCase.id,
  title: gameCase.title,
  shortTitle: gameCase.shortTitle,
  estimatedMinutes: 6,
}));

export function gradeHardwareBuild(caseId, selection) {
  const gameCase = HARDWARE_GAME_CASES.find((item) => item.id === caseId);
  if (!gameCase) {
    return { passed: false, score: 0, errors: [{ type: "\u672a\u77e5\u6848\u4f8b", message: "\u6ca1\u6709\u627e\u5230\u5f53\u524d\u786c\u4ef6\u914d\u7f6e\u6848\u4f8b\u3002" }] };
  }

  const parts = resolveSelectedParts(selection);
  const metrics = buildHardwareMetrics(parts);
  const errors = buildHardwareErrors(gameCase.targets, metrics);
  const score = Math.max(0, 100 - errors.reduce((sum, error) => sum + error.penalty, 0));

  return {
    passed: errors.length === 0,
    score,
    errors: errors.map(({ penalty, ...error }) => error),
    metrics,
    targets: gameCase.targets,
    selectedParts: parts,
    explanation: buildHardwareExplanation(gameCase, errors),
  };
}

export function isHardwareGameCase(challengeId) {
  return HARDWARE_GAME_CASES.some((item) => item.id === challengeId);
}

export function summarizeHardwareGameAttempts(attempts = []) {
  const gameAttempts = attempts.filter((attempt) => isHardwareGameCase(attempt.challengeId));
  const scoreValues = gameAttempts.map((attempt) => Number(attempt.score ?? attempt.result?.score ?? 0));
  const bottleneckCounts = new Map();
  const typicalBuilds = [];

  for (const attempt of gameAttempts) {
    const result = attempt.result ?? {};
    for (const error of result.errors ?? []) {
      bottleneckCounts.set(error.type, (bottleneckCounts.get(error.type) ?? 0) + 1);
    }
    if (Number(attempt.score ?? result.score ?? 0) >= 90) {
      typicalBuilds.push({
        caseId: attempt.challengeId,
        score: Number(attempt.score ?? result.score ?? 0),
        parts: result.selectedParts ?? {},
      });
    }
  }

  return {
    totalAttempts: gameAttempts.length,
    completedCases: new Set(gameAttempts.filter((attempt) => Number(attempt.score ?? attempt.result?.score ?? 0) >= 100).map((attempt) => attempt.challengeId)).size,
    averageScore: scoreValues.length ? Math.round(scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length) : 0,
    frequentBottlenecks: [...bottleneckCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type, "zh-Hans-CN")),
    typicalBuilds,
  };
}

function resolveSelectedParts(selection = {}) {
  return Object.fromEntries(
    Object.entries(HARDWARE_PARTS).map(([category, items]) => [
      category,
      items.find((item) => item.id === selection[category]) ?? items[0],
    ]),
  );
}

function buildHardwareMetrics(parts) {
  return {
    totalPrice: Object.values(parts).reduce((sum, part) => sum + part.price, 0),
    cpu: parts.cpu.performance,
    memory: parts.memory.capacity,
    storageCapacity: parts.storage.capacity,
    storageSpeed: parts.storage.performance,
    gpu: parts.gpu.performance,
  };
}

function buildHardwareErrors(targets, metrics) {
  const checks = [
    ["\u9884\u7b97\u8d85\u652f", "\u603b\u4ef7\u8d85\u8fc7\u5ba2\u6237\u9884\u7b97\u3002", metrics.totalPrice <= targets.budget, 25],
    ["CPU \u6027\u80fd\u4e0d\u8db3", "\u5904\u7406\u5668\u6027\u80fd\u6ca1\u6709\u8fbe\u5230\u4efb\u52a1\u8981\u6c42\u3002", metrics.cpu >= targets.cpu, 20],
    ["\u5185\u5b58\u4e0d\u8db3", "\u5185\u5b58\u5bb9\u91cf\u4f4e\u4e8e\u5ba2\u6237\u573a\u666f\u8981\u6c42\u3002", metrics.memory >= targets.memory, 20],
    ["\u5bb9\u91cf\u4e0d\u8db3", "\u5b58\u50a8\u5bb9\u91cf\u4e0d\u591f\u4fdd\u5b58\u76ee\u6807\u8d44\u6599\u3002", metrics.storageCapacity >= targets.storageCapacity, 15],
    ["\u5b58\u50a8\u901f\u5ea6\u4e0d\u8db3", "\u5b58\u50a8\u8bfb\u5199\u901f\u5ea6\u4f1a\u6210\u4e3a\u4f53\u9a8c\u74f6\u9888\u3002", metrics.storageSpeed >= targets.storageSpeed, 15],
    ["\u56fe\u5f62\u6027\u80fd\u4e0d\u8db3", "\u56fe\u5f62\u6027\u80fd\u4e0d\u80fd\u6ee1\u8db3\u8be5\u573a\u666f\u3002", metrics.gpu >= targets.gpu, 10],
  ];
  return checks
    .filter(([, , passed]) => !passed)
    .map(([type, message, , penalty]) => ({ type, message, penalty }));
}

function buildHardwareExplanation(gameCase, errors) {
  if (errors.length === 0) {
    return `${gameCase.title} \u5df2\u6ee1\u8db3\u76ee\u6807\uff1a\u9884\u7b97\u3001\u901f\u5ea6\u3001\u5bb9\u91cf\u548c\u573a\u666f\u9700\u6c42\u90fd\u8fbe\u6807\u3002`;
  }
  return `\u5f53\u524d\u914d\u7f6e\u8fd8\u6ca1\u6709\u6ee1\u8db3 ${gameCase.title}\uff1a${errors.map((error) => error.type).join("\u3001")}\u3002`;
}

export function hardwareCaseTitle(caseId) {
  return HARDWARE_GAME_CASES.find((item) => item.id === caseId)?.title ?? caseId;
}

export function formatHardwareBuildParts(parts = {}) {
  return [parts.cpu, parts.memory, parts.storage, parts.gpu]
    .filter(Boolean)
    .map((part) => part.name)
    .join(" / ");
}
