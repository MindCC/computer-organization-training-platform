import test from "node:test";
import assert from "node:assert/strict";

import { LEARNING_ITEMS } from "./platformLogic.js";
import { COURSE_CHAPTERS } from "./courseChapters.js";
import { buildLearningTreeModel } from "./recordsScreenModel.js";
import {
  ORGANIC_TREE_LAYOUT,
  layoutOrganicTree,
  pointAtFraction,
  ribbonPath,
  sampleSpline,
} from "./organicTreeLayout.js";

const model = buildLearningTreeModel({
  "computer-components": { status: "completed", bestScore: 100 },
  "data-flow": { status: "in-progress", bestScore: 40 },
});

test("有机树包含树干、八根章节主枝和全部实验细枝", () => {
  const tree = layoutOrganicTree(model);

  assert.equal(typeof tree.trunk.path, "string");
  assert.equal(tree.trunk.path.startsWith("M"), true);
  assert.equal(tree.branches.length, COURSE_CHAPTERS.length);
  assert.equal(tree.twigs.length, LEARNING_ITEMS.length);

  for (const branch of tree.branches) {
    assert.equal(branch.path.startsWith("M"), true, `${branch.id} 主枝轮廓非法`);
    assert.equal(Number.isFinite(branch.tip.x) && Number.isFinite(branch.tip.y), true);
  }
});

test("所有细枝端点与标签都落在画布范围内且为有限数", () => {
  const tree = layoutOrganicTree(model);

  for (const twig of tree.twigs) {
    assert.equal(Number.isFinite(twig.tip.x) && Number.isFinite(twig.tip.y), true, `${twig.id} 端点非法`);
    assert.equal(twig.tip.x >= -40 && twig.tip.x <= tree.width + 40, true, `${twig.id} 端点 x 越界：${twig.tip.x}`);
    assert.equal(twig.tip.y >= -40 && twig.tip.y <= tree.height + 40, true, `${twig.id} 端点 y 越界：${twig.tip.y}`);
    assert.equal(Number.isFinite(twig.label.x) && Number.isFinite(twig.label.y), true);
  }
});

test("布局确定性：同一模型两次布局完全一致", () => {
  const first = layoutOrganicTree(model);
  const second = layoutOrganicTree(model);

  assert.deepEqual(first, second);
});

test("放大后的树冠叶子互不叠压：任意两叶端点间距 ≥ 60", () => {
  const tree = layoutOrganicTree(model);
  let minSpacing = Infinity;
  for (let i = 0; i < tree.twigs.length; i += 1) {
    for (let j = i + 1; j < tree.twigs.length; j += 1) {
      const spacing = Math.hypot(
        tree.twigs[i].tip.x - tree.twigs[j].tip.x,
        tree.twigs[i].tip.y - tree.twigs[j].tip.y,
      );
      if (spacing < minSpacing) minSpacing = spacing;
    }
  }
  // 实测约 83：叶子半径 11 + 标签偏移 26 的安全下限取 60。
  assert.equal(minSpacing >= 60, true, `叶子最小间距仅 ${minSpacing.toFixed(1)}，会叠压`);
});

test("章节主枝自下而上按章号沿树干分布，且左右两侧均衡", () => {
  const tree = layoutOrganicTree(model);
  const ordered = [...tree.branches].sort((a, b) => a.number - b.number);
  ordered.forEach((branch, index) => assert.equal(branch.side, index % 2 === 0 ? -1 : 1));

  // 取每个主枝标签 y（靠近树干锚点）：章号越大位置越高（y 越小）
  for (let i = 1; i < ordered.length; i += 1) {
    assert.equal(ordered[i].label.y <= ordered[i - 1].label.y, true,
      `第${ordered[i].number}章应不低于第${ordered[i - 1].number}章`);
  }

  const left = tree.branches.filter((branch) => branch.side === -1).reduce((sum, branch) => sum + branch.total, 0);
  const right = tree.branches.filter((branch) => branch.side === 1).reduce((sum, branch) => sum + branch.total, 0);
  assert.equal(Math.abs(left - right) <= 10, true, `两侧叶数差异过大：左 ${left} 右 ${right}`);
});

test("密集章节仍保持舒展树形，并提供完整的章节聚焦边界", () => {
  const tree = layoutOrganicTree(model);
  for (const branch of tree.branches) {
    const leaves = tree.twigs.filter((twig) => twig.chapterId === branch.chapterId);
    assert.ok(branch.bounds.width > 0 && branch.bounds.height > 0);
    for (const leaf of leaves) {
      assert.ok(leaf.tip.x >= branch.bounds.x && leaf.tip.x <= branch.bounds.x + branch.bounds.width);
      assert.ok(leaf.tip.y >= branch.bounds.y && leaf.tip.y <= branch.bounds.y + branch.bounds.height);
    }
  }
  const spans = tree.branches.map((branch) => Math.abs(branch.tip.x - tree.trunkCenterX));
  assert.ok(Math.max(...spans) / Math.min(...spans) < 2, "章节数量不同也不应造成树冠一边倒");
});

test("点亮状态与章节归属传递到细枝", () => {
  const tree = layoutOrganicTree(model);
  const lit = tree.twigs.find((twig) => twig.leafId === "computer-components");
  const active = tree.twigs.find((twig) => twig.leafId === "data-flow");
  const dim = tree.twigs.find((twig) => twig.leafId === "io-transfer");

  assert.equal(lit.lit, true);
  assert.equal(lit.chapterId, "ch1");
  assert.equal(active.status, "in-progress");
  assert.equal(active.chapterId, "ch3");
  assert.equal(dim.lit, false);
  assert.equal(dim.chapterId, "ch8");
});

test("样条采样与带状轮廓的几何基础正确", () => {
  const line = sampleSpline([{ x: 0, y: 0, w: 10 }, { x: 100, y: 0, w: 4 }], 10);
  assert.equal(line.length >= 10, true);

  const mid = pointAtFraction(line, 0.5);
  assert.equal(Math.abs(mid.x - 50) < 2, true);
  assert.equal(mid.w > 4 && mid.w < 10, true);

  const path = ribbonPath(line);
  assert.equal(path.startsWith("M"), true);
  assert.equal(path.endsWith("Z"), true);
});

test("树干从地面长出并收敛到树梢宽度", () => {
  const tree = layoutOrganicTree(model, { width: 800, height: 600, groundY: 560, trunkCenterX: 400 });
  assert.equal(tree.width, 800);
  assert.equal(tree.groundY, 560);
  assert.equal(ORGANIC_TREE_LAYOUT.trunkBaseWidth > ORGANIC_TREE_LAYOUT.trunkTopWidth, true);
});
