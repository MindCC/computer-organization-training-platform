import { REFERENCE_SLOT_LAYOUTS } from "./labPlacement.js";

function parseConnectionLabel(connection) {
  const [from = "", to = ""] = String(connection).split("->").map((item) => item.trim());
  return { from, to };
}

function inferExternalSide(label) {
  if (/输入|数据源|选择信号|控制位|标志位逻辑/.test(label)) return "input";
  if (/输出|结果|和位|进位/.test(label)) return "output";
  return "output";
}

function inferPinRole(pin) {
  const value = String(pin ?? "").trim();
  if (/^(A|B|Cin|D0|D1|in)$/i.test(value)) return "input";
  if (/选择|控制/.test(value)) return "input";
  if (/^(S|C|Cout|Y|F|out)$/i.test(value)) return "output";
  if (/标志/.test(value)) return "output";
  return "neutral";
}

function endpointFlowRole(endpoint) {
  if (!endpoint) return "unknown";
  if (endpoint.flowRole) return endpoint.flowRole;

  if (endpoint.side === "input") return "source";
  if (endpoint.side === "output") return "sink";

  const pinRole = endpoint.pinRole ?? (endpoint.pin ? inferPinRole(endpoint.pin) : null);
  if (pinRole === "input") return "sink";
  if (pinRole === "output") return "source";

  return "unknown";
}

function endpointFitsConnectionSide(endpoint, connectionSide) {
  const role = endpointFlowRole(endpoint);
  if (role === "unknown") return true;
  return connectionSide === "from" ? role === "source" : role === "sink";
}

function distributePinOffsets(items, offsetX, startY = 30, endY = 70) {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ ...items[0], offsetX, offsetY: 50 }];
  }

  return items.map((item, index) => ({
    ...item,
    offsetX,
    offsetY: startY + ((endY - startY) * index) / Math.max(1, items.length - 1),
  }));
}

function findTokenMatchedPin(pinLayouts, label) {
  const normalized = String(label ?? "").trim();
  return pinLayouts.find((layout) => {
    if (layout.pin === "Cin") return /Cin/i.test(normalized);
    if (layout.pin === "Cout") return /Cout/i.test(normalized);
    if (layout.pin === "D0") return /0/.test(normalized) || /D0/i.test(normalized);
    if (layout.pin === "D1") return /1/.test(normalized) || /D1/i.test(normalized);
    if (layout.pin === "A") return /A/.test(normalized);
    if (layout.pin === "B") return /B/.test(normalized);
    if (layout.pin === "S") return /S/.test(normalized);
    if (layout.pin === "C") return /进位C/.test(normalized) || /^C$/.test(normalized);
    if (layout.pin === "Y") return /Y/.test(normalized);
    if (layout.pin === "F") return /F/.test(normalized);
    if (layout.pin === "in") return /输入/.test(normalized);
    if (layout.pin === "out") return /输出|结果/.test(normalized);
    return layout.pin === normalized;
  });
}

function findPinLayoutForConnection(pinLayouts, ownRole, otherLabel) {
  const tokenMatched = findTokenMatchedPin(pinLayouts, otherLabel);
  if (tokenMatched) return tokenMatched;

  const preferredRole = ownRole === "from" ? "output" : "input";
  const preferred = pinLayouts.find((layout) => layout.role === preferredRole);
  if (preferred) return preferred;

  return pinLayouts[0] ?? null;
}

function componentPointToBoardPosition(component, pinLayout, componentBox = { width: 16, height: 16 }) {
  return {
    x: component.x + ((pinLayout.offsetX - 50) / 100) * componentBox.width,
    y: component.y + ((pinLayout.offsetY - 50) / 100) * componentBox.height,
  };
}

function clampBoardPoint(value) {
  return Math.min(94, Math.max(6, Number(value)));
}

function roundBoardPoint(value) {
  return Math.round(Number(value) * 10) / 10;
}

function simplifyRoute(points) {
  return points.filter((point, index) => {
    const previous = points[index - 1];
    if (!previous) return true;
    return Math.abs(previous.x - point.x) > 0.2 || Math.abs(previous.y - point.y) > 0.2;
  });
}

export function buildOrthogonalWireRoute(line, index = 0) {
  const from = line?.from ?? { x: 0, y: 0 };
  const to = line?.to ?? { x: 0, y: 0 };
  const sameRow = Math.abs(from.y - to.y) < 3;

  if (sameRow) {
    const points = simplifyRoute([from, to]);
    return {
      points,
      label: {
        x: roundBoardPoint((from.x + to.x) / 2),
        y: roundBoardPoint(from.y - 1.4),
      },
      clickPoint: {
        x: roundBoardPoint((from.x + to.x) / 2),
        y: roundBoardPoint(from.y),
      },
    };
  }

  const direction = to.x >= from.x ? 1 : -1;
  const horizontalGap = Math.abs(to.x - from.x);
  const laneOffset = ((index % 5) - 2) * 2.2;
  const middleX = (from.x + to.x) / 2;
  const detourX = direction > 0
    ? Math.max(from.x, to.x) + 8
    : Math.min(from.x, to.x) - 8;
  const elbowX = clampBoardPoint((horizontalGap >= 16 ? middleX : detourX) + laneOffset);
  const labelY = (from.y + to.y) / 2;
  const points = simplifyRoute([
    from,
    { x: elbowX, y: from.y },
    { x: elbowX, y: to.y },
    to,
  ]);

  return {
    points,
    label: {
      x: roundBoardPoint(elbowX + (direction > 0 ? 1.7 : -1.7)),
      y: roundBoardPoint(labelY),
    },
    clickPoint: {
      x: roundBoardPoint(elbowX),
      y: roundBoardPoint(labelY),
    },
  };
}

export function formatWireRoutePoints(points = []) {
  return points.map((point) => `${roundBoardPoint(point.x)},${roundBoardPoint(point.y)}`).join(" ");
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

export function buildComponentPinLayout(pins = []) {
  const descriptors = pins.map((pin) => ({
    pin,
    role: inferPinRole(pin),
  }));
  const inputs = descriptors.filter((item) => item.role === "input");
  const outputs = descriptors.filter((item) => item.role === "output");
  const neutral = descriptors.filter((item) => item.role === "neutral");

  return [
    ...distributePinOffsets(inputs, 8),
    ...distributePinOffsets(outputs, 92),
    ...distributePinOffsets(neutral, 50, 26, 74),
  ];
}

export function buildRenderableConnections({
  challenge,
  connectionBlueprint,
  placedComponents,
  connections,
  componentBox,
}) {
  const inputAnchors = connectionBlueprint?.externalInputs?.map((item, index) => ({
    ...item,
    key: `input-${item.label}`,
    x: 8,
    y: 26 + index * 18,
  })) ?? [];
  const outputAnchors = connectionBlueprint?.externalOutputs?.map((item, index) => ({
    ...item,
    key: `output-${item.label}`,
    x: 92,
    y: 26 + index * 18,
  })) ?? [];
  const pinLayoutsByName = new Map(
    (connectionBlueprint?.components ?? []).map((component) => [component.name, buildComponentPinLayout(component.pins)]),
  );

  function resolveComponentPlacement(label) {
    const placed = placedComponents.find((item) => item.name === label);
    if (placed) return placed;

    const referenceIndex = challenge?.components?.findIndex((item) => item.name === label) ?? -1;
    if (referenceIndex === -1) return null;

    const fallback = REFERENCE_SLOT_LAYOUTS[challenge.id]?.[referenceIndex] ?? { x: 50, y: 56 };
    return {
      id: `reference-${label}-${referenceIndex}`,
      name: label,
      x: fallback.x,
      y: fallback.y,
    };
  }

  function resolvePosition(label, otherLabel, ownRole) {
    const inputAnchor = inputAnchors.find((item) => item.label === label);
    if (inputAnchor) return inputAnchor;

    const outputAnchor = outputAnchors.find((item) => item.label === label);
    if (outputAnchor) return outputAnchor;

    const component = resolveComponentPlacement(label);
    if (!component) return null;

    const pinLayouts = pinLayoutsByName.get(label) ?? [];
    const pinLayout = findPinLayoutForConnection(pinLayouts, ownRole, otherLabel);
    if (!pinLayout) {
      return {
        key: `component-${label}-${ownRole}`,
        x: component.x,
        y: component.y,
      };
    }

    return {
      key: `component-${label}-${pinLayout.pin}-${ownRole}`,
      pin: pinLayout.pin,
      ...componentPointToBoardPosition(component, pinLayout, componentBox),
    };
  }

  return (connections ?? [])
    .map((connection) => {
      const { from: fromLabel, to: toLabel } = parseConnectionLabel(connection);
      const from = resolvePosition(fromLabel, toLabel, "from");
      const to = resolvePosition(toLabel, fromLabel, "to");
      if (!from || !to) return null;
      return { id: connection, from, to };
    })
    .filter(Boolean);
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
      reason: "not-required",
    };
  }

  const { from, to } = parseConnectionLabel(connection);
  const startSide = startEndpoint.label === from ? "from" : startEndpoint.label === to ? "to" : null;
  const endSide = endEndpoint.label === from ? "from" : endEndpoint.label === to ? "to" : null;

  if (
    (startSide && !endpointFitsConnectionSide(startEndpoint, startSide))
    || (endSide && !endpointFitsConnectionSide(endEndpoint, endSide))
  ) {
    return {
      status: "invalid",
      connection: null,
      reason: "direction",
    };
  }

  return {
    status: "valid",
    connection,
    reason: null,
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
