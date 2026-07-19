import test from "node:test";
import assert from "node:assert/strict";

import { gradeHardwareBuild } from "./hardwareGame.js";
import {
  HARDWARE_WORKBENCH_CATEGORIES,
  buildHardwareWorkbenchModel,
  hardwareSelectionProgress,
} from "./hardwareWorkbench.js";

const selection = {
  cpu: "cpu-i3",
  memory: "mem-8",
  storage: "ssd-512",
  gpu: "gpu-integrated",
};

test("workbench exposes recognizable categories and selected catalog state", () => {
  const preview = gradeHardwareBuild("game-office-pc", selection);
  const model = buildHardwareWorkbenchModel(selection, preview);

  assert.deepEqual(model.categories.map((item) => item.id), ["cpu", "memory", "storage", "gpu"]);
  assert.equal(model.categories.every((item) => Number.isFinite(item.hotspot.x) && Number.isFinite(item.hotspot.y)), true);
  assert.equal(model.categories.find((item) => item.id === "memory").options.find((item) => item.selected).id, "mem-8");
  assert.equal(model.progress.selected, 4);
  assert.equal(model.progress.total, 4);
  assert.equal(model.budget.withinBudget, true);
});

test("selection progress counts only supported selected parts", () => {
  assert.deepEqual(
    hardwareSelectionProgress({ cpu: "cpu-i3", memory: null, storage: "missing", gpu: "gpu-integrated" }),
    { selected: 2, total: 4, percentage: 50 },
  );
});

test("workbench exposes readable unmet requirements and budget pressure", () => {
  const preview = gradeHardwareBuild("game-video-storage", selection);
  const model = buildHardwareWorkbenchModel(selection, preview);

  assert.equal(model.budget.percentage > 0, true);
  assert.equal(model.feedback.passed, false);
  assert.equal(model.feedback.issues.includes("\u5b58\u50a8\u901f\u5ea6\u4e0d\u8db3"), true);
  assert.equal(model.feedback.issues.includes("\u56fe\u5f62\u6027\u80fd\u4e0d\u8db3"), true);
});
