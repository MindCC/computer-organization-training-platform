function parseConnectionLabel(connection) {
  const [from = "", to = ""] = String(connection).split("->").map((item) => item.trim());
  return { from, to };
}

function inferExternalSide(label) {
  if (/输入|数据源|选择信号|控制位|标志位逻辑/.test(label)) return "input";
  if (/输出|结果|和位|进位/.test(label)) return "output";
  return "output";
}

export function buildConnectionBlueprint(challenge) {
  const componentNames = new Set((challenge?.components ?? []).map((item) => item.name));
  const labels = new Map();

  for (const connection of challenge?.requiredConnections ?? []) {
    const { from, to } = parseConnectionLabel(connection);
    if (from) labels.set(from, componentNames.has(from) ? "component" : inferExternalSide(from));
    if (to) labels.set(to, componentNames.has(to) ? "component" : inferExternalSide(to));
  }

  return {
    components: (challenge?.components ?? []).map((component) => ({
      name: component.name,
      pins: String(component.pins ?? "")
        .split("/")
        .map((item) => item.trim())
        .filter(Boolean),
    })),
    externalInputs: [...labels.entries()]
      .filter(([, kind]) => kind === "input")
      .map(([label]) => ({ label })),
    externalOutputs: [...labels.entries()]
      .filter(([, kind]) => kind === "output")
      .map(([label]) => ({ label })),
  };
}

export function normalizeConnectionLabels(challenge, firstLabel, secondLabel) {
  const first = String(firstLabel ?? "").trim();
  const second = String(secondLabel ?? "").trim();
  if (!first || !second || first === second) return null;

  return (
    (challenge?.requiredConnections ?? []).find((connection) => {
      const { from, to } = parseConnectionLabel(connection);
      return (from === first && to === second) || (from === second && to === first);
    }) ?? null
  );
}

export function toggleConnectionByLabels(challenge, currentConnections, firstLabel, secondLabel) {
  const normalized = normalizeConnectionLabels(challenge, firstLabel, secondLabel);
  if (!normalized) {
    return {
      connections: [...currentConnections],
      lastConnection: null,
    };
  }

  const exists = currentConnections.includes(normalized);
  return {
    connections: exists
      ? currentConnections.filter((item) => item !== normalized)
      : [...currentConnections, normalized],
    lastConnection: normalized,
  };
}

export function beginWireDrag(endpoint) {
  if (!endpoint) return null;

  return {
    startEndpoint: { ...endpoint },
    pointer: {
      x: endpoint.x,
      y: endpoint.y,
    },
  };
}

export function cancelWireDrag() {
  return null;
}

export function inspectWireTarget(challenge, startEndpoint, endEndpoint) {
  if (!startEndpoint || !endEndpoint) {
    return {
      status: "empty",
      connection: null,
    };
  }

  if (startEndpoint.key === endEndpoint.key) {
    return {
      status: "self",
      connection: null,
    };
  }

  const connection = normalizeConnectionLabels(
    challenge,
    startEndpoint.label,
    endEndpoint.label,
  );

  if (!connection) {
    return {
      status: "invalid",
      connection: null,
    };
  }

  return {
    status: "valid",
    connection,
  };
}

export function completeWireDrag(challenge, currentConnections, dragState, endEndpoint) {
  const inspection = inspectWireTarget(challenge, dragState?.startEndpoint, endEndpoint);
  if (inspection.status === "empty" || inspection.status === "self") {
    return {
      connections: [...currentConnections],
      lastConnection: null,
      cancelled: true,
      status: inspection.status,
    };
  }

  if (inspection.status === "invalid") {
    return {
      connections: [...currentConnections],
      lastConnection: null,
      cancelled: false,
      status: inspection.status,
    };
  }

  const next = toggleConnectionByLabels(
    challenge,
    currentConnections,
    dragState.startEndpoint.label,
    endEndpoint.label,
  );

  return {
    ...next,
    cancelled: next.lastConnection === null,
    status: inspection.status,
  };
}
