/**
 * 有机学习树布局引擎（纯函数、无渲染依赖）：
 * - 底部中央长出由粗到细的树干（S 形微弯）；
 * - 八个章节作为主枝，从树干不同高度交替向两侧分出，枝长按实验数量生长；
 * - 每个实验是一根细枝，枝头一片叶子；完成点亮、进行中高亮、未开始为芽。
 * 输出全部为 SVG path 与坐标，供 records/LearningTreeCanvas 渲染。
 * 固定随机种子 → 同一模型布局恒定，便于测试与稳定的视觉呈现。
 */

export const ORGANIC_TREE_LAYOUT = Object.freeze({
  width: 2200,
  height: 1600,
  groundY: 1540,
  trunkCenterX: 1100,
  trunkBaseWidth: 48,
  trunkTopWidth: 10,
  branchBaseWidth: 14,
  branchTipWidth: 4,
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

function rotate(tx, ty, angleRad) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return { x: tx * cos - ty * sin, y: tx * sin + ty * cos };
}

function buildBranchCurve(anchor, side, length, rand) {
  const up = -Math.PI / 2;
  // 枝越长越横向伸展，避免向上弯进上一根同侧树枝的领地
  const spreadMag = Math.min(1.35, 0.85 + rand() * 0.2 + length / 2600);
  const dirAngle = up + spreadMag * side;
  const bend = (0.2 + rand() * 0.16) * -side; // 向竖直方向回弯
  const points = [{ x: anchor.x, y: anchor.y, w: anchor.w }];
  let dir = { x: Math.cos(dirAngle), y: Math.sin(dirAngle) };
  let cursor = { x: anchor.x, y: anchor.y };
  const segments = 3;
  for (let i = 1; i <= segments; i += 1) {
    const step = (length / segments) * (i === segments ? 0.92 : 1);
    cursor = { x: cursor.x + dir.x * step, y: cursor.y + dir.y * step };
    points.push({
      x: cursor.x,
      y: cursor.y,
      w: anchor.w + (anchor.tipWidth - anchor.w) * (i / segments),
    });
    dir = rotate(dir.x, dir.y, bend * (i / segments));
  }
  return sampleSpline(points, 12);
}

function buildTwigCurve(start, dirAngle, length, rand) {
  const midBend = (rand() - 0.5) * 0.5;
  const dir = { x: Math.cos(dirAngle), y: Math.sin(dirAngle) };
  const bent = rotate(dir.x, dir.y, midBend);
  const p = [
    { x: start.x, y: start.y, w: start.w },
    { x: start.x + dir.x * length * 0.55, y: start.y + dir.y * length * 0.55, w: start.w * 0.7 },
    { x: start.x + bent.x * length, y: start.y + bent.y * length, w: start.tipWidth },
  ];
  return sampleSpline(p, 6);
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

  // ── 树干：S 形微弯、由粗到细 ──
  const trunkControls = [
    { x: cx, y: gy, w: layout.trunkBaseWidth },
    { x: cx - 18, y: gy - 240, w: 38 },
    { x: cx + 18, y: gy - 480, w: 30 },
    { x: cx - 14, y: gy - 700, w: 23 },
    { x: cx + 10, y: gy - 900, w: 17 },
    { x: cx - 6, y: gy - 1070, w: 13 },
    { x: cx, y: gy - 1210, w: layout.trunkTopWidth },
  ];
  const trunkLine = sampleSpline(trunkControls, 14);
  const trunk = { path: ribbonPath(trunkLine) };

  // ── 章节分配到两侧：保持章号自下而上，同时让两侧叶数大致均衡 ──
  const chapters = model?.chapters ?? [];
  const sides = balanceSides(chapters);

  // ── 主枝 ──
  const branches = [];
  const twigs = [];
  const count = Math.max(chapters.length, 1);
  chapters.forEach((chapter, index) => {
    const t = count === 1 ? 0.5 : layout.branchStartT + (index / (count - 1)) * (layout.branchEndT - layout.branchStartT);
    const anchor = pointAtFraction(trunkLine, t);
    const side = sides.get(chapter.id) ?? (index % 2 === 0 ? -1 : 1);
    const leafCount = chapter.items.length;
    const length = 150 + leafCount * 52 + rand() * 40;
    const branchLine = buildBranchCurve(
      { x: anchor.x, y: anchor.y, w: layout.branchBaseWidth, tipWidth: layout.branchTipWidth },
      side,
      length,
      rand,
    );
    const tip = pointAtFraction(branchLine, 1);

    branches.push({
      id: `branch-${chapter.id}`,
      chapterId: chapter.id,
      number: chapter.number,
      shortTitle: chapter.shortTitle,
      litCount: chapter.litCount,
      total: chapter.total,
      allLit: chapter.allLit,
      side,
      path: ribbonPath(branchLine),
      label: branchLabelPosition(branchLine, side),
      tip,
    });

    // ── 细枝（每个实验一根）与枝头叶子 ──
    chapter.items.forEach((leaf, leafIndex) => {
      const s = leafCount === 1 ? 0.6 : 0.22 + (leafIndex / (leafCount - 1)) * 0.75;
      const base = pointAtFraction(branchLine, s);
      const branchAngle = Math.atan2(base.ty, base.tx);
      const alternator = leafIndex % 2 === 0 ? 1 : -1;
      const twigAngle = branchAngle + alternator * (0.5 + rand() * 0.45);
      const twigLength = 55 + rand() * 35;
      const twigLine = buildTwigCurve(
        { x: base.x, y: base.y, w: layout.twigBaseWidth, tipWidth: layout.twigTipWidth },
        twigAngle,
        twigLength,
        rand,
      );
      const twigTip = pointAtFraction(twigLine, 1);
      twigs.push({
        id: `twig-${leaf.id}`,
        leafId: leaf.id,
        chapterId: chapter.id,
        title: leaf.title,
        status: leaf.status,
        lit: leaf.lit,
        bestScore: leaf.bestScore,
        path: ribbonPath(twigLine),
        tip: { x: twigTip.x, y: twigTip.y },
        label: leafLabelPosition(twigTip, twigAngle, side),
        side,
      });
    });
  });

  return { width: layout.width, height: layout.height, groundY: gy, trunk, branches, twigs };
}

/** 贪心把章节分到叶数较少的一侧；并列时交给当前章号较小的一侧，保证确定性。 */
function balanceSides(chapters) {
  const sides = new Map();
  let leftLoad = 0;
  let rightLoad = 0;
  for (const chapter of chapters) {
    const leaves = chapter.items.length;
    const side = leftLoad === rightLoad
      ? (chapter.number % 2 === 1 ? -1 : 1)
      : leftLoad < rightLoad ? -1 : 1;
    sides.set(chapter.id, side);
    if (side === -1) leftLoad += leaves;
    else rightLoad += leaves;
  }
  return sides;
}

/** 章节标签放在主枝起始段的外侧，避开树干与邻枝。 */
function branchLabelPosition(branchLine, side) {
  const base = pointAtFraction(branchLine, 0.12);
  // 取垂直于枝方向、指向画布外侧的法线
  const nx = -base.ty;
  const ny = base.tx;
  const sign = Math.sign(nx) === side ? 1 : -1;
  const offset = 40;
  return {
    x: base.x + nx * sign * offset,
    y: base.y + ny * sign * offset,
    anchor: side === -1 ? "end" : "start",
  };
}

function leafLabelPosition(tip, twigAngle, side) {
  const distance = 26;
  return {
    x: tip.x + Math.cos(twigAngle) * distance,
    y: tip.y + Math.sin(twigAngle) * distance,
    anchor: side === -1 ? "end" : "start",
  };
}
