export const REFERENCE_SLOT_LAYOUTS = {
  "data-flow": [
    { x: 20, y: 60, role: "信号入口" },
    { x: 50, y: 60, role: "数据通路" },
    { x: 80, y: 60, role: "结果观察" },
  ],
  "half-adder": [
    { x: 46, y: 34, role: "和位计算" },
    { x: 46, y: 74, role: "进位计算" },
    { x: 80, y: 54, role: "结果输出" },
  ],
  "full-adder": [
    { x: 28, y: 34, role: "第一层求和" },
    { x: 52, y: 34, role: "第二层求和" },
    { x: 74, y: 74, role: "进位输出" },
  ],
  "multi-adder": [
    { x: 24, y: 58, role: "低位加法" },
    { x: 50, y: 58, role: "中位加法" },
    { x: 76, y: 58, role: "高位加法" },
  ],
  mux: [
    { x: 18, y: 32, role: "数据源 D0" },
    { x: 18, y: 74, role: "数据源 D1" },
    { x: 40, y: 84, role: "选择信号" },
  ],
  alu: [
    { x: 34, y: 28, role: "加法单元" },
    { x: 34, y: 78, role: "逻辑单元" },
    { x: 68, y: 54, role: "结果选择" },
  ],
};

function fallbackPosition(index) {
  return { x: 18 + index * 18, y: 56 };
}

function buildDisplayLabel(componentName, duplicateIndex, totalDuplicates) {
  if (totalDuplicates <= 1) return componentName;
  return `${componentName}${duplicateIndex + 1}`;
}

function distanceBetween(first, second) {
  const dx = Number(first.x ?? 0) - Number(second.x ?? 0);
  const dy = Number(first.y ?? 0) - Number(second.y ?? 0);
  return Math.hypot(dx, dy);
}

export function buildPlacementBlueprint(challenge, layoutMap = REFERENCE_SLOT_LAYOUTS) {
  const slots = layoutMap[challenge?.id] ?? [];
  const duplicateTotals = new Map();
  const seenDuplicates = new Map();

  for (const component of challenge?.components ?? []) {
    duplicateTotals.set(component.name, (duplicateTotals.get(component.name) ?? 0) + 1);
  }

  return (challenge?.components ?? []).map((component, sourceIndex) => {
    const slot = slots[sourceIndex] ?? fallbackPosition(sourceIndex);
    const duplicateIndex = seenDuplicates.get(component.name) ?? 0;
    seenDuplicates.set(component.name, duplicateIndex + 1);

    return {
      id: `slot-${challenge.id}-${sourceIndex}`,
      sourceIndex,
      componentName: component.name,
      displayLabel: buildDisplayLabel(component.name, duplicateIndex, duplicateTotals.get(component.name) ?? 1),
      role: slot.role ?? `目标槽位 ${sourceIndex + 1}`,
      x: slot.x,
      y: slot.y,
    };
  });
}

export function buildReferencePlacedComponents(challenge, layoutMap = REFERENCE_SLOT_LAYOUTS) {
  return buildPlacementBlueprint(challenge, layoutMap).map((slot) => ({
    id: `${slot.displayLabel}-${slot.sourceIndex}-reference`,
    name: slot.componentName,
    displayLabel: slot.displayLabel,
    sourceIndex: slot.sourceIndex,
    x: slot.x,
    y: slot.y,
  }));
}

export function findSnapTarget(slots, payload, position, tolerance = 9) {
  const candidates = (slots ?? []).filter((slot) => slot.sourceIndex === payload?.sourceIndex);
  let match = null;

  for (const slot of candidates) {
    const distance = distanceBetween(slot, position);
    if (distance > tolerance) continue;
    if (!match || distance < match.distance) {
      match = { slot, distance };
    }
  }

  return match?.slot ?? null;
}

export function scorePlacedComponents(challenge, placedComponents, layoutMap = REFERENCE_SLOT_LAYOUTS, tolerance = 8) {
  const blueprint = buildPlacementBlueprint(challenge, layoutMap);
  const matchedSlotIds = new Set();
  const misplacedComponents = [];

  for (const component of placedComponents ?? []) {
    const slot = blueprint.find((item) => item.sourceIndex === component.sourceIndex);
    if (!slot) {
      misplacedComponents.push(component);
      continue;
    }

    if (distanceBetween(slot, component) <= tolerance) {
      matchedSlotIds.add(slot.id);
    } else {
      misplacedComponents.push(component);
    }
  }

  const missingSlots = blueprint.filter((slot) => !matchedSlotIds.has(slot.id));
  const matchedCount = matchedSlotIds.size;
  const baseScore = blueprint.length === 0 ? 100 : Math.round((matchedCount / blueprint.length) * 100);
  const score = Math.max(0, baseScore - misplacedComponents.length * 10);

  return {
    passed: missingSlots.length === 0 && misplacedComponents.length === 0,
    score,
    matchedSlotIds: [...matchedSlotIds],
    missingSlots,
    misplacedComponents,
    slots: blueprint,
  };
}
