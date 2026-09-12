import test from "node:test";
import assert from "node:assert/strict";

import {
  REFERENCE_SLOT_LAYOUTS,
  buildPlacementBlueprint,
  findSnapTarget,
  scorePlacedComponents,
} from "./labPlacement.js";
import { LEARNING_ITEMS } from "./platformLogic.js";
const fullAdderChallenge = {
  id: "full-adder",
  components: [
    { name: "异或门1", pins: "A/B/X" },
    { name: "异或门2", pins: "X/Cin/S" },
    { name: "进位逻辑", pins: "A/B/Cin/Cout" },
  ],
};

const slotLayouts = {
  "full-adder": [
    { x: 22, y: 42, role: "第一层求和" },
    { x: 52, y: 42, role: "第二层求和" },
    { x: 76, y: 70, role: "进位输出" },
  ],
};

test("placement blueprint keeps duplicate-like stages distinct by source index", () => {
  const blueprint = buildPlacementBlueprint(fullAdderChallenge, slotLayouts);

  assert.equal(blueprint.length, 3);
  assert.deepEqual(
    blueprint.map((slot) => ({
      sourceIndex: slot.sourceIndex,
      componentName: slot.componentName,
      role: slot.role,
    })),
    [
      { sourceIndex: 0, componentName: "异或门1", role: "第一层求和" },
      { sourceIndex: 1, componentName: "异或门2", role: "第二层求和" },
      { sourceIndex: 2, componentName: "进位逻辑", role: "进位输出" },
    ],
  );
});

test("placement scoring passes when every component is snapped into its target slot", () => {
  const result = scorePlacedComponents(
    fullAdderChallenge,
    [
      { id: "xor-1", name: "异或门1", sourceIndex: 0, x: 22, y: 42 },
      { id: "xor-2", name: "异或门2", sourceIndex: 1, x: 52, y: 42 },
      { id: "carry", name: "进位逻辑", sourceIndex: 2, x: 76, y: 70 },
    ],
    slotLayouts,
  );

  assert.equal(result.passed, true);
  assert.equal(result.score, 100);
  assert.deepEqual(result.missingSlots, []);
  assert.deepEqual(result.misplacedComponents, []);
});

test("placement scoring reports missing slots and misplaced components", () => {
  const result = scorePlacedComponents(
    fullAdderChallenge,
    [
      { id: "xor-1", name: "异或门1", sourceIndex: 0, x: 23, y: 41 },
      { id: "carry", name: "进位逻辑", sourceIndex: 2, x: 34, y: 24 },
    ],
    slotLayouts,
  );

  assert.equal(result.passed, false);
  assert.deepEqual(result.missingSlots.map((slot) => slot.componentName), ["异或门2", "进位逻辑"]);
  assert.deepEqual(result.misplacedComponents.map((component) => component.id), ["carry"]);
  assert.equal(result.score < 100, true);
});

test("snap target returns the matching slot when a component is dropped close enough", () => {
  const blueprint = buildPlacementBlueprint(fullAdderChallenge, slotLayouts);
  const slot = findSnapTarget(
    blueprint,
    { sourceIndex: 1 },
    { x: 48, y: 44 },
    8,
  );

  assert.ok(slot);
  assert.equal(slot.sourceIndex, 1);
  assert.equal(slot.role, "第二层求和");
});

test("每个课程关卡都有专门的槽位布局，不再退回自动排布", () => {
  // 退回 fallbackPosition 时 role 会变成「目标槽位 N」，学生看到的是等距排布的占位槽。
  const missing = LEARNING_ITEMS
    .filter((item) => item.components?.length)
    .filter((item) => !REFERENCE_SLOT_LAYOUTS[item.id])
    .map((item) => item.id);
  assert.deepEqual(missing, [], `以下关卡缺少 REFERENCE_SLOT_LAYOUTS：${missing.join(", ")}`);
});

test("槽位布局与关卡部件数量、role 一一对应", () => {
  for (const item of LEARNING_ITEMS.filter((entry) => entry.components?.length)) {
    const slots = REFERENCE_SLOT_LAYOUTS[item.id];
    assert.ok(slots, `${item.id} 缺少槽位布局`);
    const blueprint = buildPlacementBlueprint(item);
    assert.equal(
      blueprint.length,
      slots.length,
      `${item.id} 槽位数 ${slots.length} 与部件数 ${blueprint.length} 不一致`,
    );
    for (const [index, slot] of blueprint.entries()) {
      assert.equal(slot.x, slots[index].x, `${item.id} 槽位 ${index} 的 x 应来自布局表`);
      assert.equal(slot.y, slots[index].y, `${item.id} 槽位 ${index} 的 y 应来自布局表`);
      assert.equal(typeof slot.role, "string");
      assert.notEqual(slot.role, `目标槽位 ${index + 1}`, `${item.id} 槽位 ${index} 缺少明确 role`);
    }
    const positions = new Set(blueprint.map((slot) => `${slot.x},${slot.y}`));
    assert.equal(positions.size, blueprint.length, `${item.id} 的槽位坐标不应重叠`);
  }
});
