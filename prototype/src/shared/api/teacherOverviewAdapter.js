function toNonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
}

export function adaptHardwareGameSummary(raw = {}) {
  const completedCases = toNonNegativeInteger(raw?.completedCases);
  const averageScore = Math.min(100, toNonNegativeInteger(raw?.averageScore));
  const frequentBottlenecks = (Array.isArray(raw?.frequentBottlenecks)
    ? raw.frequentBottlenecks
    : [])
    .filter((item) => item && typeof item.type === "string" && item.type.trim())
    .map((item) => {
      const type = item.type.trim();
      const count = toNonNegativeInteger(item.count);
      return {
        key: `${type}:${count}`,
        type,
        count,
        label: `${type} · ${count} 次`,
      };
    });
  const typicalBuilds = (Array.isArray(raw?.typicalBuilds)
    ? raw.typicalBuilds
    : [])
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .slice(0, 3);

  return {
    completedCases,
    averageScore,
    frequentBottlenecks,
    typicalBuilds,
  };
}
