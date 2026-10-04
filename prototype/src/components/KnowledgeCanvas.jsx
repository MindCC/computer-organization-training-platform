import { useEffect, useId, useRef, useState } from 'react';
import { ArrowsOut, Crosshair, Minus, Plus } from '@phosphor-icons/react';
import { centerConceptCamera, fitConceptCamera, MAX_CONCEPT_ZOOM, MIN_CONCEPT_ZOOM, zoomConceptCamera } from '../knowledgeCanvas.js';

export function KnowledgeCanvas({ model, selectedId, title, children }) {
  const viewportRef = useRef(null);
  const instructionsId = useId();
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const sizeRef = useRef({ width: 1, height: 1 });
  const gestures = useRef({ pointers: new Map(), previous: null, moved: false });
  const [camera, setCamera] = useState(cameraRef.current);
  const [size, setSize] = useState(sizeRef.current);
  const [dragging, setDragging] = useState(false);
  function update(next) { cameraRef.current = next; setCamera(next); }
  function fit() { update(fitConceptCamera(model.nodes, sizeRef.current)); }
  function zoomBy(factor, anchor = { x: sizeRef.current.width / 2, y: sizeRef.current.height / 2 }) {
    update(zoomConceptCamera(cameraRef.current, cameraRef.current.zoom * factor, anchor));
  }
  function locate() {
    const node = model.nodes.find(entry => entry.id === selectedId);
    if (node) update(centerConceptCamera(cameraRef.current, node, sizeRef.current, true));
  }
  useEffect(() => {
    const viewport = viewportRef.current;
    let first = true;
    const observer = new ResizeObserver(() => {
      const next = { width: viewport.clientWidth, height: viewport.clientHeight };
      if (!next.width || !next.height) return;
      const old = sizeRef.current;
      sizeRef.current = next; setSize(next);
      if (first) { first = false; update(fitConceptCamera(model.nodes, next)); }
      else update({ ...cameraRef.current, x: cameraRef.current.x + (next.width - old.width) / 2, y: cameraRef.current.y + (next.height - old.height) / 2 });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [model]);
  useEffect(() => {
    const node = model.nodes.find(entry => entry.id === selectedId);
    if (!node) return;
    const current = cameraRef.current, viewport = sizeRef.current;
    const x = current.x + node.x * current.zoom, y = current.y + node.y * current.zoom;
    if (x < 24 || x > viewport.width - 24 || y < 24 || y > viewport.height - 24) update(centerConceptCamera(current, node, viewport));
  }, [selectedId, model]);
  useEffect(() => {
    const viewport = viewportRef.current;
    function wheel(event) {
      event.preventDefault();
      const bounds = viewport.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1);
      zoomBy(Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.002), { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    }
    viewport.addEventListener('wheel', wheel, { passive: false });
    return () => viewport.removeEventListener('wheel', wheel);
  }, []);
  function localPoint(event) {
    const bounds = viewportRef.current.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }
  function snapshot() {
    const points = [...gestures.current.pointers.values()];
    if (points.length > 1) return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2, distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) };
    return points[0] ? { ...points[0], distance: 0 } : null;
  }
  function pointerDown(event) {
    if (event.button !== 0 && event.button !== 1) return;
    if (!gestures.current.pointers.size) gestures.current.moved = false;
    // Keep leaf clicks intact; capture only the blank canvas, or a two-touch gesture.
    if (event.target.closest('.kg-node') && !gestures.current.pointers.size && event.pointerType !== 'touch') return;
    const gesture = gestures.current;
    gesture.pointers.set(event.pointerId, localPoint(event));
    gesture.previous = snapshot();
    gesture.moved = false;
    if (!event.target.closest('.kg-node') || gesture.pointers.size > 1) {
      event.preventDefault(); viewportRef.current.setPointerCapture(event.pointerId);
      viewportRef.current.focus({ preventScroll: true });
    }
  }
  function pointerMove(event) {
    const gesture = gestures.current;
    if (!gesture.pointers.has(event.pointerId)) return;
    gesture.pointers.set(event.pointerId, localPoint(event));
    const next = snapshot(), previous = gesture.previous;
    if (!previous || !next) return;
    const dx = next.x - previous.x, dy = next.y - previous.y;
    if (Math.abs(dx) + Math.abs(dy) > 1 || (next.distance && Math.abs(next.distance - previous.distance) > 1)) {
      gesture.moved = true; setDragging(true);
    }
    const zoomed = previous.distance > 0 && next.distance > 0
      ? zoomConceptCamera(cameraRef.current, cameraRef.current.zoom * next.distance / previous.distance, previous)
      : cameraRef.current;
    update({ ...zoomed, x: zoomed.x + dx, y: zoomed.y + dy });
    gesture.previous = next;
  }
  function pointerEnd(event) {
    const gesture = gestures.current;
    gesture.pointers.delete(event.pointerId); gesture.previous = snapshot();
    if (viewportRef.current.hasPointerCapture(event.pointerId)) viewportRef.current.releasePointerCapture(event.pointerId);
    if (!gesture.pointers.size) setDragging(false);
  }
  function keyboard(event) {
    if (event.target !== event.currentTarget) return;
    if (event.key === '+' || event.key === '=') zoomBy(1.2);
    else if (event.key === '-') zoomBy(1 / 1.2);
    else if (event.key === '0') fit();
    else if (event.key.toLowerCase() === 'f') locate();
    else if (event.key.startsWith('Arrow')) {
      const delta = { ArrowLeft: [48, 0], ArrowRight: [-48, 0], ArrowUp: [0, 48], ArrowDown: [0, -48] }[event.key];
      if (!delta) return;
      update({ ...cameraRef.current, x: cameraRef.current.x + delta[0], y: cameraRef.current.y + delta[1] });
    } else return;
    event.preventDefault();
  }
  return <section className="concept-canvas" aria-label="知识图谱画布工具">
    <div className="concept-canvas-toolbar">
      <div className="concept-canvas-zoom">
        <button type="button" aria-label="缩小知识图谱" onClick={() => zoomBy(1 / 1.2)} disabled={camera.zoom <= MIN_CONCEPT_ZOOM}><Minus size={17} /></button>
        <output aria-label="知识图谱缩放比例">{Math.round(camera.zoom * 100)}%</output>
        <button type="button" aria-label="放大知识图谱" onClick={() => zoomBy(1.2)} disabled={camera.zoom >= MAX_CONCEPT_ZOOM}><Plus size={17} /></button>
      </div>
      <button type="button" onClick={fit} aria-label="适应知识图谱全图"><ArrowsOut size={16} /><span>适应全图</span></button>
      <button type="button" onClick={locate} aria-label="定位当前知识点"><Crosshair size={16} /><span>定位知识点</span></button>
    </div>
    <div className={'concept-graph-desktop' + (dragging ? ' is-dragging' : '')} ref={viewportRef} tabIndex={0} role="group" aria-label="可拖动缩放的知识图谱画布" aria-describedby={instructionsId}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd} onKeyDown={keyboard}
      onClickCapture={event => { if (gestures.current.moved) { event.preventDefault(); event.stopPropagation(); gestures.current.moved = false; } }}>
      <svg className="kg-svg" viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-label={title + '知识点关系图'}>
        <g data-testid="concept-camera" transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>{children}</g>
      </svg>
    </div>
    <p className="concept-canvas-instructions" id={instructionsId}>拖动空白处移动 · 滚轮或双指缩放 · 点击知识点查看详情<span>键盘：方向键移动，+/− 缩放，0 全图，F 定位</span></p>
  </section>;
}
