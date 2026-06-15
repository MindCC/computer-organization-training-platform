function clampPercent(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(92, Math.max(8, numeric));
}

function connectionParts(connection) {
  const [from = "", to = ""] = String(connection ?? "").split("->").map((item) => item.trim());
  return { from, to };
}

function outputValueText(outputs = {}) {
  const entries = Object.entries(outputs);
  if (entries.length === 0) return "未知";
  return entries.map(([key, value]) => `${key.toUpperCase()}=${value}`).join(" · ");
}

export function resolveConnectionTone(connection, feedback, simulationStep = 0) {
  if (feedback?.extraConnections?.includes(connection)) return "error";
  if (feedback && !feedback.passed && feedback.missing?.includes(connection)) return "missing";
  if (simulationStep > 0 || feedback?.passed) return "active";
  return "idle";
}

export function signalLabelForConnection(tone, simulationStep = 0) {
  if (tone === "error") return "!";
  if (tone === "missing") return "?";
  if (tone === "active") return "1";
  return simulationStep > 0 ? "1" : "Z";
}

export function buildSignalBadges({ sceneInput, outputs, activeStep, simulationStep = 0 }) {
  return [
    {
      id: "inputs",
      label: "输入",
      value: sceneInput || "等待输入",
      tone: "source",
    },
    {
      id: "probe",
      label: "探针",
      value: activeStep?.node ? `${activeStep.node} · 第 ${simulationStep + 1} 步` : "等待演示",
      tone: "probe",
    },
    {
      id: "outputs",
      label: "输出",
      value: outputValueText(outputs),
      tone: "sink",
    },
  ];
}

export function buildWorkbenchIssueMarkers(feedback) {
  if (!feedback || feedback.passed) return [];

  const markers = [];

  for (const [index, connection] of (feedback.missing ?? []).entries()) {
    const { from, to } = connectionParts(connection);
    markers.push({
      id: `missing-${connection}`,
      label: "缺少连线",
      detail: `${from} -> ${to}`,
      tone: "error",
      x: 16 + (index % 2) * 34,
      y: 74 + Math.floor(index / 2) * 10,
    });
  }

  for (const [index, connection] of (feedback.extraConnections ?? []).entries()) {
    markers.push({
      id: `extra-${connection}`,
      label: "多余连线",
      detail: connection,
      tone: "warning",
      x: 58,
      y: 74 + index * 10,
    });
  }

  const placement = feedback.placement ?? {};

  for (const [index, slot] of (placement.missingSlots ?? []).entries()) {
    markers.push({
      id: `slot-${slot.id}`,
      label: "元件未就位",
      detail: `${slot.displayLabel} -> ${slot.role}`,
      tone: "warning",
      x: clampPercent(slot.x, 22 + (index % 3) * 24),
      y: clampPercent(slot.y, 28 + Math.floor(index / 3) * 14),
    });
  }

  for (const [index, item] of (placement.misplacedComponents ?? []).entries()) {
    markers.push({
      id: `misplaced-${item.id ?? index}`,
      label: "槽位不匹配",
      detail: `${item.displayLabel ?? item.name} 需要重新对准`,
      tone: "error",
      x: clampPercent(item.x, 28 + (index % 3) * 22),
      y: clampPercent(item.y, 42 + Math.floor(index / 3) * 14),
    });
  }

  return markers;
}
