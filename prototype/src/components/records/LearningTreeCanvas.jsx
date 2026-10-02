import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { layoutOrganicTree } from "../../organicTreeLayout.js";

/**
 * 有机学习树画布（浅色主题版）：一棵真正的树——
 * 底部深色树干由粗到细，八章主枝两侧交替分出，每个实验是枝头叶子。
 * 完成点亮（绿/青）、进行中高亮（琥珀）、未开始为灰芽。
 * 滚轮以光标为中心缩放、拖拽平移、控制器放大/缩小/复位；点击叶子进入实验。
 */

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.6;
const ZOOM_STEP = 1.28;

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function LearningTreeCanvas({ model, onOpenChallenge }) {
  const tree = useMemo(() => layoutOrganicTree(model), [model]);
  const containerRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 0.5 });
  const dragRef = useRef(null);

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 48;
    const k = clampZoom(Math.min((rect.width - pad) / tree.width, (rect.height - pad) / tree.height));
    setView({
      k,
      x: (rect.width - tree.width * k) / 2,
      y: (rect.height - tree.height * k) / 2 + 6,
    });
  }, [tree.width, tree.height]);

  useEffect(() => { fitToView(); }, [fitToView]);

  const zoomAt = useCallback((px, py, factor) => {
    setView((current) => {
      const next = clampZoom(current.k * factor);
      const worldX = (px - current.x) / current.k;
      const worldY = (py - current.y) / current.k;
      return { k: next, x: px - worldX * next, y: py - worldY * next };
    });
  }, []);

  const zoomAtCenter = useCallback((factor) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, factor);
  }, [zoomAt]);

  // 滚轮缩放必须 non-passive 才能阻止页面滚动
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.0014));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  function handlePointerDown(event) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    // 缩放控制器与图例是可点击控件，不参与拖拽。
    if (event.target.closest?.(".tree-zoom-controls, .learning-tree-legend")) return;
    const drag = {
      startX: event.clientX,
      startY: event.clientY,
      viewX: view.x,
      viewY: view.y,
      moved: false,
    };
    dragRef.current = drag;
    // 拖拽监听挂在 window 上，不做 setPointerCapture：
    // 捕获会把后续 click 重定向到画布容器，叶子的 onClick 就永远不会触发。
    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - drag.startX;
      const dy = moveEvent.clientY - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      setView((current) => ({ ...current, x: drag.viewX + dx, y: drag.viewY + dy }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      // moved 标志保留到 click 事件读取后再清
      setTimeout(() => { if (dragRef.current === drag) dragRef.current = null; }, 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function handleLeafClick(leaf) {
    if (dragRef.current?.moved) return;
    onOpenChallenge?.(leaf.leafId);
  }

  return (
    <div
      aria-label="章节学习树画布"
      className="learning-tree-canvas organic"
      data-testid="learning-tree-canvas"
      data-zoom={view.k.toFixed(4)}
      onPointerDown={handlePointerDown}
      ref={containerRef}
      role="application"
    >
      <svg className="organic-tree-svg" height="100%" width="100%">
        <defs>
          <linearGradient id="treeTrunkGrad" x1="0" x2="0" y1="1" y2="0">
            <stop offset="0%" stopColor="#4a3423" />
            <stop offset="100%" stopColor="#6f4e37" />
          </linearGradient>
          <radialGradient id="treeGroundGrad">
            <stop offset="0%" stopColor="rgba(13, 148, 136, 0.22)" />
            <stop offset="100%" stopColor="rgba(13, 148, 136, 0)" />
          </radialGradient>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <ellipse className="tree-ground" cx={tree.width / 2} cy={tree.groundY} rx="210" ry="18" />

          {tree.branches.map((branch) => (
            <path
              className={`tree-branch ${branch.allLit ? "lit" : branch.litCount > 0 ? "active" : "dim"}`}
              d={branch.path}
              key={branch.id}
            />
          ))}

          <path className="tree-trunk" d={tree.trunk.path} />

          {tree.twigs.map((twig) => (
            <path
              className={`tree-twig ${twig.lit ? "lit" : twig.status === "in-progress" ? "active" : "dim"}`}
              d={twig.path}
              key={twig.id}
            />
          ))}

          {tree.branches.map((branch) => (
            <g className="tree-chapter" key={`label-${branch.id}`}>
              <text className="tree-chapter-name" textAnchor={branch.label.anchor} x={branch.label.x} y={branch.label.y}>
                第{branch.number}章 {branch.shortTitle}
              </text>
              <text className="tree-chapter-count" textAnchor={branch.label.anchor} x={branch.label.x} y={branch.label.y + 24}>
                {branch.litCount}/{branch.total} 点亮
              </text>
            </g>
          ))}

          {tree.twigs.map((twig) => {
            const state = twig.lit ? "lit" : twig.status === "in-progress" ? "active" : "dim";
            return (
              <g
                className={`tree-leaf ${state}`}
                data-leaf-id={twig.leafId}
                key={`leaf-${twig.leafId}`}
                onClick={() => handleLeafClick(twig)}
              >
                {state !== "dim" ? <circle className="leaf-halo" cx={twig.tip.x} cy={twig.tip.y} r={state === "lit" ? 20 : 17} /> : null}
                <circle className="leaf-dot" cx={twig.tip.x} cy={twig.tip.y} r={state === "lit" ? 11 : state === "active" ? 9 : 7} />
                <circle className="leaf-hit" cx={twig.tip.x} cy={twig.tip.y} r={26} />
                <text className="tree-leaf-label" textAnchor={twig.label.anchor} x={twig.label.x} y={twig.label.y + 3}>
                  {twig.title}
                </text>
                <title>{`${twig.title} · ${twig.lit ? `已点亮${twig.scoreLabel && twig.scoreLabel !== "—" ? ` · ${twig.scoreLabel}` : ""}` : twig.status === "in-progress" ? "进行中" : "未点亮"}`}</title>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="tree-zoom-controls">
        <button aria-label="放大" className="tree-zoom-btn tree-zoom-in" onClick={() => zoomAtCenter(ZOOM_STEP)} type="button">+</button>
        <button aria-label="缩小" className="tree-zoom-btn tree-zoom-out" onClick={() => zoomAtCenter(1 / ZOOM_STEP)} type="button">−</button>
        <button aria-label="适应视图" className="tree-zoom-btn tree-zoom-fit" onClick={fitToView} type="button">⌂</button>
      </div>

      <div className="learning-tree-legend" aria-hidden="true">
        <span className="legend-item lit">已点亮</span>
        <span className="legend-item active">进行中</span>
        <span className="legend-item dim">未点亮</span>
        <span className="legend-hint">滚轮缩放 · 拖拽平移 · 点击叶子进入实验</span>
      </div>
    </div>
  );
}
