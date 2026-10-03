/**
 * 有机学习树布局引擎（纯函数、无渲染依赖）：
 * - 底部中央长出由粗到细的树干（S 形微弯）；
 * - 八个章节作为主枝，从树干不同高度交替向两侧分出，枝长按实验数量生长；
 * - 每个实验是一根细枝，枝头一片叶子；完成点亮、进行中高亮、未开始为芽。
 * 输出全部为 SVG path 与坐标，供 records/LearningTreeCanvas 渲染。
 * 固定随机种子 → 同一模型布局恒定，便于测试与稳定的视觉呈现。
 */

export const ORGANIC_TREE_LAYOUT = Object.freeze({
  width: 2000,
  height: 1600,
  groundY: 1540,
  trunkCenterX: 1000,
  trunkBaseWidth: 72,
  trunkTopWidth: 7,
  branchBaseWidth: 18,
  branchTipWidth: 3,
  twigBaseWidth: 5,
  twigTipWidth: 1.8,
  branchStartT: 0.14,
  branchEndT: 0.95,
  seed: 20260919,
});

/** mulberry32 确定性伪随机。 */
export function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Catmull-Rom 样条采样为折线点列（保留每点宽度 w）。 */
export function sampleSpline(controls, samplesPerSegment = 10) {
  const points = [];
  for (let i = 0; i < controls.length - 1; i += 1) {
    const p0 = controls[Math.max(0, i - 1)];
    const p1 = controls[i];
    const p2 = controls[i + 1];
    const p3 = controls[Math.min(controls.length - 1, i + 2)];
    for (let s = 0; s < samplesPerSegment; s += 1) {
      const t = s / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      points.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        w: p1.w + (p2.w - p1.w) * t,
      });
    }
  }
  points.push({ ...controls[controls.length - 1] });
  return points;
}

/** 沿折线按弧长比例取点（t=0 起点，t=1 终点），返回点与单位切向。 */
export function pointAtFraction(line, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const lengths = [0];
  let total = 0;
  for (let i = 1; i < line.length; i += 1) {
    total += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
    lengths.push(total);
  }
  const target = clamped * total;
  let index = lengths.findIndex((len) => len >= target);
  if (index <= 0) index = 1;
  const prevLen = lengths[index - 1];
  const segLen = lengths[index] - prevLen || 1;
  const ratio = (target - prevLen) / segLen;
  const a = line[index - 1];
  const b = line[index];
  const x = a.x + (b.x - a.x) * ratio;
  const y = a.y + (b.y - a.y) * ratio;
  const w = a.w + (b.w - a.w) * ratio;
  const dx = (b.x - a.x) / segLen;
  const dy = (b.y - a.y) / segLen;
  return { x, y, w, tx: dx, ty: dy };
}

/** 把带宽度点列转成闭合锥形带状 path（树枝/树干的实体轮廓）。 */
export function ribbonPath(line) {
  const left = [];
  const right = [];
  for (let i = 0; i < line.length; i += 1) {
    const prev = line[Math.max(0, i - 1)];
    const next = line[Math.min(line.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const half = (line[i].w ?? 2) / 2;
    left.push([line[i].x + nx * half, line[i].y + ny * half]);
    right.push([line[i].x - nx * half, line[i].y - ny * half]);
  }
  const forward = left.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const backward = right.reverse().map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return `${forward} ${backward} Z`;
}

/**
 * 主入口：把 buildLearningTreeModel 的结果排成一棵有机树。
 * @returns {{
 *   width: number, height: number, groundY: number,
 *   trunk: { path: string },
 *   branches: Array, twigs: Array,
 * }}
 */
export function layoutOrganicTree(model, options = {}) {
  const layout = { ...ORGANIC_TREE_LAYOUT, ...options };
  const rand = createSeededRandom(layout.seed);
  const cx = layout.trunkCenterX;
  const gy = layout.groundY;
  const sx = layout.width / ORGANIC_TREE_LAYOUT.width;
  const sy = layout.height / ORGANIC_TREE_LAYOUT.height;

  // ── 树干：S 形微弯、由粗到细 ──
  const trunkControls = [
    { x: cx, y: gy, w: layout.trunkBaseWidth },
    { x: cx - 24 * sx, y: gy - 240 * sy, w: 54 },
    { x: cx + 20 * sx, y: gy - 480 * sy, w: 38 },
    { x: cx - 12 * sx, y: gy - 720 * sy, w: 26 },
    { x: cx + 16 * sx, y: gy - 930 * sy, w: 17 },
    { x: cx - 6 * sx, y: gy - 1130 * sy, w: 10 },
    { x: cx + 12 * sx, y: gy - 1300 * sy, w: layout.trunkTopWidth },
  ];
  const trunkLine = sampleSpline(trunkControls, 14);
  const trunk = { path: ribbonPath(trunkLine) };

  const chapters = model?.chapters ?? [];

  // ── 主枝 ──
  const branches = [];
  const twigs = [];
  const count = Math.max(chapters.length, 1);
  chapters.forEach((chapter, index) => {
    const t = count === 1 ? 0.5 : layout.branchStartT + (index / (count - 1)) * (layout.branchEndT - layout.branchStartT);
    const anchor = pointAtFraction(trunkLine, t);
    const side = index % 2 === 0 ? -1 : 1;
    const leafCount = chapter.items.length;
    // 两排交错的细枝为密集章节留出空间，不让某一章把整棵树拉偏。
    const length = Math.max(490, 230 + (Math.ceil(leafCount / 2) - 1) * 100) * sx;
    const rise = (110 + rand() * 25) * sy;
    const branchLine = sampleSpline([
      { x: anchor.x, y: anchor.y, w: layout.branchBaseWidth },
      { x: anchor.x + side * length * .26, y: anchor.y - rise * .5, w: 12 },
      { x: anchor.x + side * length * .66, y: anchor.y - rise * .85, w: 7 },
      { x: anchor.x + side * length, y: anchor.y - rise, w: layout.branchTipWidth },
    ], 14);
    const tip = pointAtFraction(branchLine, 1);

    const branch = {
      id: `branch-${chapter.id}`,
      chapterId: chapter.id,
      number: chapter.number,
      shortTitle: chapter.shortTitle,
      litCount: chapter.litCount,
      total: chapter.total,
      allLit: chapter.allLit,
      side,
      path: ribbonPath(branchLine),
      label: { x: anchor.x + side * 130 * sx, y: anchor.y + 12 * sy, anchor: side < 0 ? "end" : "start" },
      tip,
    };
    branches.push(branch);

    // ── 细枝（每个实验一根）与枝头叶子 ──
    chapter.items.forEach((leaf, leafIndex) => {
      const rowIndex = Math.floor(leafIndex / 2);
      const rows = Math.ceil(leafCount / 2);
      const s = rows <= 1 ? .94 : .3 + rowIndex / (rows - 1) * .66;
      const base = pointAtFraction(branchLine, s);
      const direction = leafIndex % 2 === 0 ? -1 : 1;
      const reach = (75 + rand() * 12) * sy;
      const twigLine = sampleSpline([
        { x: base.x, y: base.y, w: layout.twigBaseWidth },
        { x: base.x + side * 22 * sx, y: base.y + direction * reach * .55, w: 3 },
        { x: base.x + side * 48 * sx, y: base.y + direction * reach, w: layout.twigTipWidth },
      ], 8);
      const twigTip = pointAtFraction(twigLine, 1);
      twigs.push({
        id: `twig-${leaf.id}`,
        leafId: leaf.id,
        chapterId: chapter.id,
        title: leaf.title,
        status: leaf.status,
        lit: leaf.lit,
        bestScore: leaf.bestScore,
        scoreLabel: leaf.scoreLabel,
        path: ribbonPath(twigLine),
        tip: { x: twigTip.x, y: twigTip.y },
        label: { x: twigTip.x + side * 32 * sx, y: twigTip.y, anchor: side < 0 ? "end" : "start" },
        angle: side * direction * 35,
        side,
      });
    });
    const points = [anchor, tip, ...twigs.filter((twig) => twig.chapterId === chapter.id).map((twig) => twig.tip)];
    const minX = Math.min(...points.map((point) => point.x)) - 65 * sx;
    const minY = Math.min(...points.map((point) => point.y)) - 65 * sy;
    branch.bounds = {
      x: minX, y: minY,
      width: Math.max(...points.map((point) => point.x)) + 65 * sx - minX,
      height: Math.max(...points.map((point) => point.y)) + 80 * sy - minY,
    };
  });

  return { width: layout.width, height: layout.height, groundY: gy, trunkCenterX: cx, trunk, branches, twigs };
}
