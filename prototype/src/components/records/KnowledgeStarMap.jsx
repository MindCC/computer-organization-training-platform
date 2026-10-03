import { useMemo } from "react";
import { CHALLENGE_DEPS, dependencyDepth } from "../../challengeDependencies.js";
import { CHALLENGES } from "../../platformLogic.js";
import { createSeededRandom } from "../../organicTreeLayout.js";

/**
 * 知识图谱 · 星图（手写 SVG，浅色主题）：
 * - 18 个关卡 = 18 颗星，依赖关系（CHALLENGE_DEPS）= 星座连线；
 * - 按依赖层级（dependencyDepth）从左到右分层布局，层内纵向散布并加确定性抖动，
 *   营造真实星图的星座感；背景点缀一层极淡的「远星」；
 * - 状态着色：已完成=亮星（青色四角星芒）、进行中=琥珀脉冲、未解锁/未开始=暗星；
 * - 点击任意星星进入对应实验（锁定的关卡同样可进入练习，与平台解锁口径一致）。
 */

const STAR_W = 1240;
const STAR_H = 560;
const PAD_X = 72;
const PAD_TOP = 46;
const PAD_BOTTOM = 64;
const LAYOUT_SEED = 20261015;

const STATUS_TEXT = {
  completed: "已完成",
  "in-progress": "进行中",
  unlocked: "未开始",
  locked: "未解锁",
};

function buildStarLayout() {
  const ids = Object.keys(CHALLENGE_DEPS);
  const depths = Object.fromEntries(ids.map((id) => [id, dependencyDepth(id)]));
  const maxDepth = Math.max(...Object.values(depths));
  const rng = createSeededRandom(LAYOUT_SEED);

  // 层内顺序保持关卡声明顺序（即教材章节顺序），布局稳定。
  const layers = new Map();
  for (const id of ids) {
    const depth = depths[id];
    if (!layers.has(depth)) layers.set(depth, []);
    layers.get(depth).push(id);
  }

  const innerW = STAR_W - PAD_X * 2;
  const innerH = STAR_H - PAD_TOP - PAD_BOTTOM;
  const positions = {};
  for (const [depth, layerIds] of layers) {
    const x = PAD_X + (maxDepth > 0 ? (depth / maxDepth) * innerW : innerW / 2);
    layerIds.forEach((id, index) => {
      const spread = (index + 0.5) / layerIds.length;
      const jitter = (rng() - 0.5) * Math.min(46, innerH / layerIds.length / 2.2);
      positions[id] = {
        x: Math.round(x + (rng() - 0.5) * 26),
        y: Math.round(STAR_H - PAD_BOTTOM - spread * innerH + jitter),
        depth,
      };
    });
  }

  const edges = ids.flatMap((id) =>
    (CHALLENGE_DEPS[id] ?? []).map((dep) => ({ from: dep, to: id })),
  );

  return { depths, edges, maxDepth, positions };
}

export function KnowledgeStarMap({ progress = {}, onOpenChallenge }) {
  const layout = useMemo(buildStarLayout, []);
  const titles = useMemo(
    () => Object.fromEntries(CHALLENGES.map((challenge) => [challenge.id, challenge.title])),
    [],
  );
  const bgDots = useMemo(() => {
    const rng = createSeededRandom(LAYOUT_SEED ^ 0x5f3759df);
    return Array.from({ length: 72 }, (_, index) => ({
      id: index,
      x: Math.round(rng() * STAR_W),
      y: Math.round(rng() * STAR_H),
      r: 0.8 + rng() * 1.1,
    }));
  }, []);

  const stateOf = (id) => {
    const status = progress?.[id]?.status;
    if (status === "completed") return "lit";
    if (status === "in-progress") return "active";
    return "dim";
  };

  return (
    <div className="star-map-wrap" data-testid="knowledge-star-map">
      <svg
        className="star-map-svg"
        role="img"
        aria-label="知识图谱星图：18 个关卡按依赖层级连成星座"
        viewBox={`0 0 ${STAR_W} ${STAR_H}`}
      >
        {bgDots.map((dot) => (
          <circle className="star-bg-dot" cx={dot.x} cy={dot.y} key={`bg-${dot.id}`} r={dot.r} />
        ))}

        {Array.from({ length: layout.maxDepth + 1 }, (_, depth) => {
          const x = PAD_X + (layout.maxDepth > 0 ? (depth / layout.maxDepth) * (STAR_W - PAD_X * 2) : 0);
          return (
            <g key={`layer-${depth}`}>
              <line className="star-layer-line" x1={x} x2={x} y1={PAD_TOP - 22} y2={STAR_H - PAD_BOTTOM + 26} />
              <text className="star-layer-label" textAnchor="middle" x={x} y={STAR_H - PAD_BOTTOM + 44}>
                L{depth}
              </text>
            </g>
          );
        })}

        {layout.edges.map((edge) => {
          const from = layout.positions[edge.from];
          const to = layout.positions[edge.to];
          const lit = stateOf(edge.from) === "lit" && stateOf(edge.to) === "lit";
          return (
            <line
              className={`star-edge ${lit ? "lit" : ""}`}
              key={`${edge.from}->${edge.to}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            />
          );
        })}

        {CHALLENGES.map((challenge) => {
          const pos = layout.positions[challenge.id];
          if (!pos) return null;
          const state = stateOf(challenge.id);
          const record = progress?.[challenge.id];
          const statusText = STATUS_TEXT[record?.status] ?? "未开始";
          return (
            <g
              className={`star-node ${state}`}
              data-challenge-id={challenge.id}
              data-star-state={state}
              key={challenge.id}
              onClick={() => onOpenChallenge?.(challenge.id)}
              transform={`translate(${pos.x} ${pos.y})`}
            >
              {state !== "dim" ? <circle className="star-halo" r={state === "lit" ? 19 : 16} /> : null}
              {state === "lit" ? (
                <polygon
                  className="star-sparkle"
                  points="0,-14 3.2,-3.2 14,0 3.2,3.2 0,14 -3.2,3.2 -14,0 -3.2,-3.2"
                />
              ) : null}
              <circle className="star-core" r={state === "lit" ? 4.5 : state === "active" ? 7.5 : 5} />
              <circle className="star-hit" r={22} />
              <text className="star-label" textAnchor="middle" y={30}>
                {titles[challenge.id] ?? challenge.id}
              </text>
              <title>{`${titles[challenge.id] ?? challenge.id} · ${statusText} · 依赖层级 L${pos.depth}（点击进入实验）`}</title>
            </g>
          );
        })}
      </svg>
      <div className="star-map-legend" aria-hidden="true">
        <span className="legend-item lit">已完成 · 亮星</span>
        <span className="legend-item active">进行中 · 脉冲</span>
        <span className="legend-item dim">未解锁 · 暗星</span>
        <span className="legend-hint">连线 = 依赖关系 · L0→L10 = 依赖层级 · 点击星星进入实验</span>
      </div>
    </div>
  );
}
