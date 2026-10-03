import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowsOut, Check, Leaf, Minus, Plus } from "@phosphor-icons/react";
import { layoutOrganicTree } from "../../organicTreeLayout.js";
import "./learningTree.css";

const clampZoom = (k) => Math.min(2.6, Math.max(.08, k));
const statusOf = (leaf) => leaf.lit ? "已完成" : leaf.status === "in-progress" ? "进行中" : leaf.status === "locked" ? "未解锁 · 可练习" : "未开始";
export function LearningTreeCanvas({ model, onOpenChallenge }) {
  const tree = useMemo(() => layoutOrganicTree(model), [model]);
  const [chapterId, setChapterId] = useState(() => model.chapters.find((c) => c.items.some((leaf) => leaf.status === "in-progress"))?.id ?? model.chapters[0]?.id);
  const chapter = model.chapters.find((c) => c.id === chapterId) ?? model.chapters[0];
  const containerRef = useRef(null), dragRef = useRef(null), cleanupRef = useRef(null), boundsRef = useRef(null), autoFitRef = useRef(true);
  const [view, setView] = useState({ x: 0, y: 0, k: .5 });
  const [hoveredLeaf, setHoveredLeaf] = useState(null);
  const fitBounds = useCallback((bounds) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const k = clampZoom(Math.min((rect.width - 40) / bounds.width, (rect.height - 96) / bounds.height));
    setView({ k, x: (rect.width - bounds.width * k) / 2 - bounds.x * k, y: (rect.height - bounds.height * k) / 2 - bounds.y * k });
  }, []);
  const fitToView = useCallback(() => {
    boundsRef.current = { x: 0, y: 0, width: tree.width, height: tree.height };
    autoFitRef.current = true;
    setHoveredLeaf(null);
    fitBounds(boundsRef.current);
  }, [fitBounds, tree.width, tree.height]);
  useEffect(() => { fitToView(); }, [fitToView]);
  useEffect(() => {
    const observer = new ResizeObserver(() => { if (autoFitRef.current && boundsRef.current) fitBounds(boundsRef.current); });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => { observer.disconnect(); cleanupRef.current?.(); };
  }, [fitBounds]);
  const zoomAt = useCallback((px, py, factor) => {
    autoFitRef.current = false;
    setHoveredLeaf(null);
    setView((v) => { const k = clampZoom(v.k * factor); return { k, x: px - (px - v.x) / v.k * k, y: py - (py - v.y) / v.k * k }; });
  }, []);
  const zoomAtCenter = (factor) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) zoomAt(rect.width / 2, rect.height / 2, factor);
  };
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const onWheel = (e) => { e.preventDefault(); const rect = el.getBoundingClientRect(); zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * .0014)); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);
  function handlePointerDown(e) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (e.target.closest?.("button, .tree-zoom-controls, .tree-leaf-popover")) return;
    cleanupRef.current?.();
    const drag = { x: e.clientX, y: e.clientY, viewX: view.x, viewY: view.y, moved: false, id: e.pointerId };
    dragRef.current = drag;
    const cleanup = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onCancel); cleanupRef.current = null; };
    const onMove = (event) => {
      if (event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) <= 4 && !drag.moved) return;
      drag.moved = true; autoFitRef.current = false; setHoveredLeaf(null);
      setView((v) => ({ ...v, x: drag.viewX + dx, y: drag.viewY + dy }));
    };
    const onUp = (event) => {
      if (event.pointerId !== drag.id) return;
      cleanup();
      // 留到 click 读取，不捕获指针，避免叶子点击被重定向到画布。
      setTimeout(() => { if (dragRef.current === drag) dragRef.current = null; }, 0);
    };
    const onCancel = () => { cleanup(); dragRef.current = null; };
    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); window.addEventListener("pointercancel", onCancel);
  }
  function focusChapter() {
    const branch = tree.branches.find((b) => b.chapterId === chapter?.id);
    if (branch) { boundsRef.current = branch.bounds; autoFitRef.current = true; setHoveredLeaf(null); fitBounds(branch.bounds); }
  }
  function openLeaf(leaf) { if (!dragRef.current?.moved) onOpenChallenge?.(leaf.leafId); }
  return <div className="learning-tree-explorer">
    <div className="learning-tree-toolbar">
      <p>每一片叶子，对应一个课程实验。<span>点击章节查看实验，点击叶子进入工作台。</span></p>
      <label className="tree-chapter-picker">查看章节<select aria-label="查看章节" value={chapter?.id ?? ""} onChange={(e) => { setChapterId(e.target.value); fitToView(); }}>
        {model.chapters.map((c) => <option key={c.id} value={c.id}>第{c.number}章 · {c.shortTitle}</option>)}
      </select></label>
    </div>
    <div className="learning-tree-body">
      <div aria-label="章节学习树画布" className="learning-tree-canvas organic" data-testid="learning-tree-canvas" data-zoom={view.k.toFixed(4)} data-pan={`${view.x.toFixed(1)},${view.y.toFixed(1)}`} onPointerDown={handlePointerDown} ref={containerRef}>
        <div className="tree-canvas-caption"><Leaf size={17} weight="duotone" /><span><strong>{model.totals.lit}</strong> / {model.totals.total} 片叶子已点亮</span></div>
        <button className="tree-focus-button tree-canvas-focus" type="button" onClick={focusChapter}><ArrowsOut size={16} /> 放大本章</button>
        <svg className="organic-tree-svg" height="100%" width="100%" aria-label="八章学习进度树">
          <defs>
            <linearGradient id="treeTrunkGrad" x1="0" x2="1" y1="1" y2="0"><stop offset="0%" stopColor="#493a2c" /><stop offset="100%" stopColor="#917259" /></linearGradient>
            <radialGradient id="treeGroundGrad"><stop offset="0%" stopColor="#d2dfd2" /><stop offset="100%" stopColor="#f6f8f3" stopOpacity="0" /></radialGradient>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <ellipse className="tree-ground" cx={tree.trunkCenterX} cy={tree.groundY} rx="280" ry="30" />
            {tree.branches.map((b) => <path className={`tree-branch ${b.chapterId === chapter?.id ? "selected" : ""}`} d={b.path} key={b.id} />)}
            <path className="tree-trunk" d={tree.trunk.path} />
            {tree.twigs.map((t) => <path className={`tree-twig ${t.lit ? "lit" : t.status === "in-progress" ? "active" : "dim"}`} d={t.path} key={t.id} />)}
            {tree.twigs.map((t) => <g className={`tree-leaf ${t.lit ? "lit" : t.status === "in-progress" ? "active" : "dim"} ${t.chapterId === chapter?.id ? "selected" : ""}`} data-leaf-id={t.leafId} key={t.id} role="button" tabIndex={0} aria-label={`${t.title} · ${statusOf(t)} · 进入实验`}
              onClick={() => openLeaf(t)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenChallenge?.(t.leafId); } }}
              onPointerEnter={() => { if (!dragRef.current?.moved) setHoveredLeaf(t); }} onPointerLeave={() => setHoveredLeaf(null)} onFocus={() => setHoveredLeaf(t)} onBlur={() => setHoveredLeaf(null)}>
              <circle className="leaf-hit" cx={t.tip.x} cy={t.tip.y} r="32" />
              <g transform={`translate(${t.tip.x} ${t.tip.y}) rotate(${t.angle})`}><path className="leaf-dot" d="M -28 0 Q -12 -29 30 0 Q 12 29 -28 0 Z" /><path className="leaf-vein" d="M -24 0 Q 0 -3 24 0" /></g>
              <title>{`${t.title} · ${statusOf(t)} · ${t.scoreLabel}`}</title>
            </g>)}
          </g>
        </svg>
        <div className="tree-chapter-labels">{tree.branches.map((b) => <button className={`tree-chapter-label ${b.chapterId === chapter?.id ? "selected" : ""} ${b.side < 0 ? "left" : "right"}`} key={b.id} type="button" title={`第${b.number}章 ${b.shortTitle}`} aria-pressed={b.chapterId === chapter?.id} style={{ top: view.y + b.label.y * view.k }} onClick={() => { setChapterId(b.chapterId); setHoveredLeaf(null); }}>
          <span className="tree-chapter-number">{String(b.number).padStart(2, "0")}</span><span className="tree-chapter-title">{b.shortTitle}</span><small>{b.litCount}/{b.total}</small>
        </button>)}</div>
        {hoveredLeaf && <div className="tree-leaf-popover" role="tooltip"><strong>{hoveredLeaf.title}</strong><span>{statusOf(hoveredLeaf)}{hoveredLeaf.scoreLabel !== "—" ? ` · ${hoveredLeaf.scoreLabel}` : ""}</span><small>点击叶子进入实验</small></div>}
        <div className="tree-zoom-controls">
          <button aria-label="放大" className="tree-zoom-btn tree-zoom-in" onClick={() => zoomAtCenter(1.28)} type="button"><Plus size={17} /></button>
          <button aria-label="缩小" className="tree-zoom-btn tree-zoom-out" onClick={() => zoomAtCenter(1 / 1.28)} type="button"><Minus size={17} /></button>
          <span className="tree-zoom-level">{Math.round(view.k * 100)}%</span>
          <button aria-label="适应视图" className="tree-zoom-btn tree-zoom-fit" onClick={fitToView} type="button"><ArrowsOut size={17} /></button>
        </div>
        <span className="tree-navigation-hint">拖动平移 · 滚轮缩放</span>
      </div>
      {chapter && <aside className="tree-chapter-detail" aria-label="当前章节实验">
        <div className="tree-detail-heading"><span>第 {String(chapter.number).padStart(2, "0")} 章</span><h2>{chapter.shortTitle}</h2><p>{chapter.litCount} / {chapter.total} 个实验已完成</p><div className="tree-detail-progress" role="progressbar" aria-label="当前章节完成进度" aria-valuenow={chapter.litCount} aria-valuemin={0} aria-valuemax={chapter.total}><i style={{ width: `${chapter.total ? chapter.litCount / chapter.total * 100 : 0}%` }} /></div></div>
        <ol className="tree-experiment-list">{chapter.items.map((leaf, i) => <li key={leaf.id}><button type="button" className={`tree-experiment ${leaf.lit ? "lit" : leaf.status === "in-progress" ? "active" : "dim"}`} onClick={() => onOpenChallenge?.(leaf.id)}>
          <span className="tree-experiment-marker">{leaf.lit ? <Check size={13} weight="bold" /> : String(i + 1).padStart(2, "0")}</span><span className="tree-experiment-copy"><strong>{leaf.title}</strong><small>{statusOf(leaf)}{leaf.scoreLabel !== "—" ? ` · ${leaf.scoreLabel}` : ""}</small></span><ArrowRight size={15} className="tree-experiment-arrow" />
        </button></li>)}</ol>
        <p className="tree-detail-note">未解锁的实验也可以进入练习，完成前置关卡后再提交检测。</p>
      </aside>}
    </div>
    <div className="learning-tree-footer"><div className="learning-tree-legend"><span className="legend-item lit">已完成</span><span className="legend-item active">进行中</span><span className="legend-item dim">未点亮</span></div><span>从第一章的树根，长向第八章的枝梢</span></div>
  </div>;
}
