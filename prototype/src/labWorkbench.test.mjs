import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSignalBadges,
  buildWorkbenchIssueMarkers,
  resolveConnectionTone,
  signalLabelForConnection,
} from "./labWorkbench.js";

test("resolves connection tone from simulation and feedback state", () => {
  assert.equal(resolveConnectionTone("输入A->异或门1", null, 0), "idle");
  assert.equal(resolveConnectionTone("输入A->异或门1", null, 1), "active");
  assert.equal(
    resolveConnectionTone("错误->输出", { passed: false, extraConnections: ["错误->输出"] }, 1),
    "error",
  );
});

test("builds workbench issue markers for missing connections and placement errors", () => {
  const markers = buildWorkbenchIssueMarkers({
    passed: false,
    missing: ["进位输入Cin->异或门2"],
    extraConnections: ["输出Cout->输入A"],
    placement: {
      missingSlots: [{ id: "slot-xor-2", displayLabel: "异或门2", role: "二级求和", x: 52, y: 40 }],
      misplacedComponents: [{ id: "carry", name: "进位逻辑", displayLabel: "进位逻辑", x: 63, y: 58 }],
    },
  });

  assert.equal(markers.length, 4);
  assert.deepEqual(
    markers.map((marker) => marker.label),
    ["缺少连线", "多余连线", "元件未就位", "槽位不匹配"],
  );
  assert.equal(markers[2].x, 52);
});

test("builds readable signal badges and line labels", () => {
  const badges = buildSignalBadges({
    sceneInput: "A=1 · B=0 · Cin=1",
    outputs: { sum: 0, carry: 1 },
    activeStep: { node: "运算部件" },
    simulationStep: 1,
  });

  assert.equal(badges[0].value, "A=1 · B=0 · Cin=1");
  assert.equal(badges[1].value, "运算部件 · 第 2 步");
  assert.equal(badges[2].value, "SUM=0 · CARRY=1");
  assert.equal(signalLabelForConnection("error", 2), "!");
  assert.equal(signalLabelForConnection("idle", 0), "Z");
});
