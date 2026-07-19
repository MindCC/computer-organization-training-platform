import { HARDWARE_PARTS } from "./hardwareGame.js";

export const HARDWARE_WORKBENCH_CATEGORIES = [
  { id: "cpu", label: "CPU", detail: "\u5904\u7406\u5668", hotspot: { x: 42, y: 41 } },
  { id: "memory", label: "\u5185\u5b58", detail: "\u8fd0\u884c\u5bb9\u91cf", hotspot: { x: 60, y: 58 } },
  { id: "storage", label: "\u5b58\u50a8", detail: "\u5bb9\u91cf\u4e0e\u901f\u5ea6", hotspot: { x: 69, y: 78 } },
  { id: "gpu", label: "\u663e\u5361", detail: "\u56fe\u5f62\u6027\u80fd", hotspot: { x: 25, y: 77 } },
];

export function hardwareSelectionProgress(selection = {}) {
  const selected = HARDWARE_WORKBENCH_CATEGORIES.reduce((count, category) => {
    const valid = HARDWARE_PARTS[category.id]?.some((part) => part.id === selection[category.id]);
    return count + (valid ? 1 : 0);
  }, 0);
  const total = HARDWARE_WORKBENCH_CATEGORIES.length;
  return {
    selected,
    total,
    percentage: Math.round((selected / total) * 100),
  };
}

export function buildHardwareWorkbenchModel(selection = {}, preview = {}) {
  const progress = hardwareSelectionProgress(selection);
  const targetBudget = Number(preview.targets?.budget ?? 0);
  const totalPrice = Number(preview.metrics?.totalPrice ?? 0);

  return {
    categories: HARDWARE_WORKBENCH_CATEGORIES.map((category) => ({
      ...category,
      selectedPartId: selection[category.id] ?? null,
      options: (HARDWARE_PARTS[category.id] ?? []).map((part) => ({
        ...part,
        categoryId: category.id,
        selected: part.id === selection[category.id],
        spec: partSpec(category.id, part),
      })),
    })),
    progress,
    budget: {
      totalPrice,
      target: targetBudget,
      withinBudget: targetBudget > 0 ? totalPrice <= targetBudget : true,
      percentage: targetBudget > 0 ? Math.round((totalPrice / targetBudget) * 100) : 0,
    },
    feedback: {
      passed: Boolean(preview.passed),
      score: Number(preview.score ?? 0),
      issues: (preview.errors ?? []).map((error) => error.type).filter(Boolean),
    },
  };
}

function partSpec(categoryId, part) {
  if (categoryId === "memory") return `${part.capacity}GB \u00b7 \u6027\u80fd ${part.performance}`;
  if (categoryId === "storage") return `${part.capacity}GB \u00b7 \u901f\u5ea6 ${part.performance}`;
  return `\u6027\u80fd ${part.performance}`;
}
