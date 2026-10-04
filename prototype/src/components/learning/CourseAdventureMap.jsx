import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ADVENTURE_MAP_SIZE, buildAdventureMap } from "../../adventureMapModel.js";
import { COURSEWARE } from "../../courseware.js";
import { ExperimentThumbnail } from '../ExperimentThumbnail.jsx';
import "./courseAdventureMap.css";

const { width: MAP_W, height: MAP_H } = ADVENTURE_MAP_SIZE;
const FULL_VIEW = { x: 0, y: 0, width: MAP_W, height: MAP_H };
const MIN_ZOOM = 1;
const MAX_ZOOM = 2.5;
const TERRAIN_OUTLINES = [
  "M-137,-72 Q-155,-20 -139,43 L-111,104 Q-53,116 4,109 Q64,126 116,91 Q155,58 147,2 L124,-70 Q72,-112 13,-106 Q-73,-124 -137,-72Z",
  "M-136,-82 L-151,-17 Q-148,49 -113,99 Q-51,121 10,110 L93,117 Q145,88 151,31 L137,-48 Q119,-104 50,-116 Q-49,-108 -136,-82Z",
  "M-134,-71 Q-159,-25 -143,34 Q-138,88 -76,110 L1,102 Q59,123 129,86 L152,19 Q154,-44 117,-91 L29,-108 Q-66,-124 -134,-71Z",
  "M-132,-83 Q-159,-34 -145,29 L-127,85 Q-57,123 12,113 Q83,126 126,82 L149,14 Q158,-48 103,-94 Q18,-128 -59,-111Z",
  "M-141,-80 L-153,-14 Q-143,65 -106,104 Q-37,116 34,106 L104,113 Q155,63 145,6 L127,-70 Q79,-118 3,-108 Q-76,-126 -141,-80Z",
  "M-132,-79 Q-158,-23 -140,42 L-106,106 Q-29,119 29,109 Q102,122 142,60 L153,1 Q132,-79 91,-99 L7,-114 Q-78,-110 -132,-79Z",
  "M-143,-73 Q-158,-7 -138,49 L-103,111 Q-43,105 13,115 L94,102 Q143,79 152,18 L126,-70 Q65,-124 -8,-107 Q-89,-118 -143,-73Z",
  "M-132,-80 Q-166,-31 -147,34 L-120,96 Q-58,122 9,110 L92,117 Q149,93 154,23 L136,-62 Q81,-108 12,-117 Q-73,-114 -132,-80Z",
];

const ROUTE_PATHS = [
  "M215,320 C295,373 396,345 550,316",
  "M550,316 C657,358 756,341 885,317",
  "M885,317 C1006,352 1115,347 1215,328",
  "M1215,328 C1354,374 1340,508 1215,598",
  "M1215,598 C1118,553 1008,557 885,595",
  "M885,595 C760,551 650,568 550,604",
  "M550,604 C425,563 321,563 215,605",
];

const DEMOS_BY_CHAPTER = Object.fromEntries(
  (COURSEWARE.chapters ?? []).map((chapter) => [chapter.id, chapter.demos ?? []]),
);

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function constrainView(view) {
  const margin = 80;
  return {
    ...view,
    x: clamp(view.x, -margin, MAP_W - view.width + margin),
    y: clamp(view.y, -margin, MAP_H - view.height + margin),
  };
}

function Marker({ region }) {
  return (
    <g className="adventure-map-marker" transform="translate(-102 -12)" aria-hidden="true">
      <path className="adventure-map-flag-pole" d="M0,39 L1,-24 M-8,39 Q0,34 9,39" />
      <path className="adventure-map-flag" d="M2,-24 Q19,-31 38,-22 L31,-10 L39,1 Q20,-7 2,0Z" />
      {region.state === "completed" ? <path className="adventure-map-flag-glyph" d="M11,-13 l6,5 12,-13" />
        : region.state === "locked" ? <g className="adventure-map-flag-glyph"><path d="M15,-9 v-6 a5,5 0 0 1 10,0 v6" /><rect x="13" y="-9" width="14" height="10" rx="2" /></g>
          : <path className="adventure-map-flag-glyph" d="M20,-20 L23,-13 L31,-12 L25,-7 L27,1 L20,-3 L13,1 L15,-7 L9,-12 L17,-13Z" />}
    </g>
  );
}

function Compass() {
  return (
    <g className="adventure-map-compass" transform="translate(75 74)" aria-hidden="true">
      <circle r="27" />
      <circle r="22" />
      <path d="M0,-30 L7,-6 L30,0 L7,6 L0,30 L-7,6 L-30,0 L-7,-6Z" />
      <path className="compass-dark" d="M0,-30 L7,-6 L0,0Z M0,0 L-7,6 L0,30Z" />
      <text y="-39" textAnchor="middle">N</text>
    </g>
  );
}

export function CourseAdventureMap({ progress = {}, onOpenChallenge }) {
  const model = useMemo(() => buildAdventureMap(progress), [progress]);
  const [selectedId, setSelectedId] = useState(() => model.currentRegionId ?? "ch1");
  const [view, setView] = useState(FULL_VIEW);
  const [dragging, setDragging] = useState(false);
  const [artLoaded, setArtLoaded] = useState(false);
  const svgRef = useRef(null);
  const viewRef = useRef(view);
  const gestureRef = useRef(null);
  const regionRefs = useRef({});
  const selectedByUserRef = useRef(false);
  const ids = useId().replace(/:/g, "");
  const inspectorId = `adventure-inspector-${ids}`;
  const headingId = `adventure-heading-${ids}`;
  viewRef.current = view;

  const selected = model.regions.find((region) => region.chapterId === selectedId) ?? model.regions[0];
  const current = model.regions.find((region) => region.chapterId === model.currentRegionId);
  const zoom = MAP_W / view.width;

  useEffect(() => {
    // SVG image load events differ between browsers; track the actual asset separately.
    const artwork = new Image();
    artwork.onload = () => setArtLoaded(true);
    artwork.onerror = () => setArtLoaded(false);
    artwork.src = '/learning-map/course-adventure.webp';
    return () => { artwork.onload = null; artwork.onerror = null; };
  }, []);

  const zoomTo = (nextZoom, anchor) => {
    const currentView = viewRef.current;
    const next = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const focal = anchor ?? { x: currentView.x + currentView.width / 2, y: currentView.y + currentView.height / 2 };
    const ratioX = (focal.x - currentView.x) / currentView.width;
    const ratioY = (focal.y - currentView.y) / currentView.height;
    const width = MAP_W / next;
    const height = MAP_H / next;
    setView(constrainView({ x: focal.x - width * ratioX, y: focal.y - height * ratioY, width, height }));
  };

  const revealRegion = (id) => {
    const region = model.regions.find((entry) => entry.chapterId === id);
    const currentView = viewRef.current;
    if (region && (region.x < currentView.x + 130 || region.x > currentView.x + currentView.width - 130
      || region.y < currentView.y + 100 || region.y > currentView.y + currentView.height - 100)) {
      setView(constrainView({ ...currentView, x: region.x - currentView.width / 2, y: region.y - currentView.height / 2 }));
    }
  };

  const selectRegion = (id, focus = false) => {
    selectedByUserRef.current = true;
    setSelectedId(id);
    if (focus) {
      regionRefs.current[id]?.focus({ preventScroll: true });
      revealRegion(id);
    }
  };

  useEffect(() => {
    if (!selectedByUserRef.current) setSelectedId(model.currentRegionId ?? "ch1");
  }, [model.currentRegionId]);

  const locateCurrent = () => {
    if (!current) return;
    selectRegion(current.chapterId);
    const width = MAP_W / 1.65;
    const height = MAP_H / 1.65;
    setView(constrainView({ x: current.x - width / 2, y: current.y - height / 2, width, height }));
  };

  useEffect(() => {
    const pointerMove = (event) => {
      const gesture = gestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const dx = event.clientX - gesture.clientX;
      const dy = event.clientY - gesture.clientY;
      if (!gesture.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      gesture.moved = true;
      setDragging(true);
      setView(constrainView({ ...gesture.view, x: gesture.view.x - dx / gesture.pixelScale, y: gesture.view.y - dy / gesture.pixelScale }));
    };
    const pointerEnd = () => {
      gestureRef.current = null;
      setDragging(false);
    };
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerEnd);
    window.addEventListener("pointercancel", pointerEnd);
    return () => {
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerEnd);
      window.removeEventListener("pointercancel", pointerEnd);
    };
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const wheelZoom = (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const matrix = svg.getScreenCTM();
      const anchor = matrix ? point.matrixTransform(matrix.inverse()) : undefined;
      zoomTo(MAP_W / viewRef.current.width * (event.deltaY > 0 ? 0.9 : 1.1), anchor);
    };
    svg.addEventListener("wheel", wheelZoom, { passive: false });
    return () => svg.removeEventListener("wheel", wheelZoom);
  }, []);

  const startPan = (event) => {
    if (event.button !== 0 || event.target.closest?.("[data-region-id]")) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    gestureRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      pixelScale: svg.getScreenCTM()?.a ?? rect.width / viewRef.current.width,
      view: viewRef.current,
      moved: false,
    };
    if (event.pointerType !== "touch") event.preventDefault();
  };

  const handleRegionKey = (event, regionIndex) => {
    let nextIndex;
    if (["ArrowRight", "ArrowLeft"].includes(event.key)) {
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const region = model.regions[regionIndex];
      const sameRow = model.regions.filter((entry) => Math.abs(entry.y - region.y) < 100).sort((a, b) => a.x - b.x);
      const at = sameRow.findIndex((entry) => entry.chapterId === region.chapterId);
      nextIndex = model.regions.findIndex((entry) => entry.chapterId === sameRow[clamp(at + direction, 0, sameRow.length - 1)].chapterId);
    } else if (["ArrowUp", "ArrowDown"].includes(event.key)) {
      const region = model.regions[regionIndex];
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const candidates = model.regions.filter((entry) => direction > 0 ? entry.y - region.y > 100 : region.y - entry.y > 100);
      const nearest = candidates.sort((a, b) => Math.abs(a.x - region.x) - Math.abs(b.x - region.x))[0];
      if (nearest) nextIndex = model.regions.indexOf(nearest);
    } else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = model.regions.length - 1;
    else if (["Enter", " "].includes(event.key)) nextIndex = regionIndex;
    if (nextIndex === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    selectRegion(model.regions[nextIndex].chapterId, true);
  };

  return (
    <section className="course-adventure-map" data-testid="course-adventure-map" aria-labelledby={headingId}>
      <header className="adventure-map-heading">
        <div>
          <p className="adventure-map-eyebrow">COURSE EXPEDITION · 课程探索</p>
          <h3 id={headingId}>课程关卡地图</h3>
          <p>沿教材路线探索八个区域，选择地标查看本章全部关卡。</p>
        </div>
        <div className="adventure-map-summary" aria-label={`已完成 ${model.completed} 个关卡，共 ${model.total} 个；已点亮 ${model.completedRegions} 个区域`}>
          <strong>{model.completed}<span> / {model.total}</span></strong>
          <span>关卡已完成 · {model.completedRegions} / 8 区域已点亮</span>
        </div>
      </header>

      <div className="adventure-map-layout">
        <div className="adventure-map-canvas-panel">
          <div className="adventure-map-tools" aria-label="地图视图控制">
            <div className="adventure-map-zoom-tools">
              <button type="button" aria-label="缩小地图" onClick={() => zoomTo(zoom - 0.25)} disabled={zoom <= MIN_ZOOM + 0.01}>−</button>
              <output aria-label="地图缩放比例">{Math.round(zoom * 100)}%</output>
              <button type="button" aria-label="放大地图" onClick={() => zoomTo(zoom + 0.25)} disabled={zoom >= MAX_ZOOM - 0.01}>+</button>
            </div>
            <button type="button" className="adventure-map-tool-text" onClick={() => setView(FULL_VIEW)}>复位全图</button>
            {current ? <button type="button" className="adventure-map-tool-text current" onClick={locateCurrent}>定位推荐区域</button> : null}
          </div>

          <div className={`adventure-map-viewport ${dragging ? "is-dragging" : ""} ${artLoaded ? "has-art" : ""}`}>
            <svg
              className="adventure-map-svg"
              ref={svgRef}
              viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
              preserveAspectRatio="xMidYMid meet"
              role="group"
              aria-label="八章课程探索地图，方向键选择区域，点击地标查看关卡"
              onPointerDown={startPan}
              onKeyDown={(event) => {
                const focusedId = event.target.closest?.("[data-region-id]")?.dataset.regionId;
                const anchor = model.regions.find((region) => region.chapterId === focusedId);
                if (["+", "="].includes(event.key)) { event.preventDefault(); zoomTo(zoom + 0.25, anchor); }
                else if (event.key === "-") { event.preventDefault(); zoomTo(zoom - 0.25, anchor); }
                else if (event.key === "0") { event.preventDefault(); setView(FULL_VIEW); }
              }}
            >
              <defs>
                <pattern id={`paper-grain-${ids}`} width="40" height="40" patternUnits="userSpaceOnUse">
                  <circle cx="7" cy="11" r="1" fill="#aa956d" opacity=".12" />
                  <circle cx="29" cy="31" r=".7" fill="#aa956d" opacity=".15" />
                  <path d="M22 4 l5 1 M2 28 l3 -1" stroke="#aa956d" strokeWidth=".7" opacity=".1" />
                </pattern>
              </defs>
              <rect className="adventure-map-paper" x="-100" y="-100" width={MAP_W + 200} height={MAP_H + 200} />
              <rect x="0" y="0" width={MAP_W} height={MAP_H} fill={`url(#paper-grain-${ids})`} />
              <image
                className="adventure-map-art"
                href="/learning-map/course-adventure.webp"
                x="0" y="0" width={MAP_W} height={MAP_H}
                preserveAspectRatio="xMidYMid slice"
                onLoad={() => setArtLoaded(true)}
                onError={() => setArtLoaded(false)}
                aria-hidden="true"
              />

              <g className="adventure-map-route" aria-hidden="true">
                {ROUTE_PATHS.map((path, index) => (
                  <g key={path} className={model.regions[index].state === "completed" && model.regions[index + 1].state === "completed" ? "is-completed" : ""}>
                    <path className="route-underlay" d={path} />
                    <path className="route-trail" d={path} />
                  </g>
                ))}
              </g>
              <Compass />

              {model.regions.map((region, index) => (
                <g
                  key={region.chapterId}
                  ref={(node) => { regionRefs.current[region.chapterId] = node; }}
                  className={`adventure-map-region ${region.state} ${selected.chapterId === region.chapterId ? "is-selected" : ""} ${region.isCurrent ? "is-current" : ""}`}
                  data-region-id={region.chapterId}
                  data-region-state={region.state}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected.chapterId === region.chapterId}
                  aria-controls={inspectorId}
                  aria-label={`第${region.chapter.number}章 ${region.name}，${region.stateLabel}，已完成${region.completed}/${region.total}个关卡，选择查看`}
                  transform={`translate(${region.x} ${region.y})`}
                  onClick={() => selectRegion(region.chapterId)}
                  onFocus={() => { selectRegion(region.chapterId); revealRegion(region.chapterId); }}
                  onKeyDown={(event) => handleRegionKey(event, index)}
                >
                  <path className="adventure-map-region-wash" d={TERRAIN_OUTLINES[index]} />
                  {region.state === "locked" ? <path className="adventure-map-region-mist" d={TERRAIN_OUTLINES[index]} /> : null}
                  <path className="adventure-map-region-edge" d={TERRAIN_OUTLINES[index]} />
                  <path className="adventure-map-region-sketch" transform="translate(4 3) scale(.975)" d={TERRAIN_OUTLINES[index]} />
                  {region.isCurrent ? <ellipse className="adventure-map-current-ring" cx="0" cy="4" rx="119" ry="78" /> : null}
                  <Marker region={region} />
                  <g className="adventure-map-label" transform="translate(0 111)">
                    <path className="adventure-map-label-paper" d="M-122,-20 Q-4,-27 120,-20 L116,45 Q6,51 -119,43Z" />
                    <text className="adventure-map-region-name" textAnchor="middle" y="5">{region.name}</text>
                    <text className="adventure-map-region-meta" textAnchor="middle" y="32">{`第${region.chapter.number}章 · ${region.stateLabel} · ${region.completed}/${region.total}`}</text>
                    {region.isCurrent ? <g transform="translate(80 -34)"><path className="adventure-map-next-paper" d="M-47,-15 L43,-13 L47,14 L-44,16Z" /><text className="adventure-map-next-text" textAnchor="middle" y="6">下一站</text></g> : null}
                  </g>
                  <title>{`${region.chapter.title} · ${region.stateLabel} · ${region.completed}/${region.total} 个关卡已完成`}</title>
                </g>
              ))}
              <text className="adventure-map-cartography-note" x="720" y="856" textAnchor="middle">教材路线 · 区域点亮表示关卡完成情况</text>
            </svg>
          </div>

          <nav className="adventure-map-mobile-regions" aria-label="选择课程区域">
            {model.regions.map((region) => <button key={region.chapterId} type="button" className={`${region.state} ${selectedId === region.chapterId ? "is-selected" : ""}`} aria-pressed={selectedId === region.chapterId} onClick={() => selectRegion(region.chapterId)}><span>{region.chapter.number}. {region.name}</span><small>{region.stateLabel} · {region.completed}/{region.total}</small></button>)}
          </nav>

          <div className="adventure-map-legend">
            <div className="adventure-map-legend-states" aria-label="区域状态图例">
              <span className="completed"><i />已点亮</span><span className="exploring"><i />探索中</span><span className="available"><i />可进入</span><span className="locked"><i />未解锁</span>
            </div>
            <span className="adventure-map-gesture-help">拖动空白处 · Ctrl + 滚轮缩放 · 方向键选区</span>
          </div>
        </div>

        <aside className={`adventure-map-inspector ${selected.state}`} id={inspectorId} aria-label={`${selected.name}章节关卡`}>
          <div className="adventure-map-inspector-top">
            <span className="adventure-map-chapter-number">CHAPTER {String(selected.chapter.number).padStart(2, "0")}</span>
            <span className={`adventure-map-status ${selected.state}`}>{selected.stateLabel}</span>
          </div>
          <h4>{selected.name}</h4>
          <p className="adventure-map-chapter-title">{selected.chapter.title}</p>
          <p className="adventure-map-region-description">{selected.description}</p>
          <div className="adventure-map-inspector-progress">
            <div><span>本章关卡</span><strong>{selected.completed} <span>/ {selected.total} 已完成</span></strong></div>
            <div className="adventure-map-progress-track" role="progressbar" aria-label="本章完成进度" aria-valuemin={0} aria-valuemax={selected.total} aria-valuenow={selected.completed}><span style={{ width: `${selected.completed / selected.total * 100}%` }} /></div>
          </div>
          <p className="adventure-map-preview-note">全部关卡都可浏览。未解锁关卡可先预习，提交条件以实验台提示为准。</p>
          <ul className="adventure-map-challenge-list">
            {selected.items.map((item) => (
              <li key={item.id} data-map-challenge-id={item.id} className={`adventure-map-challenge ${item.status === "completed" ? "completed" : item.status === "locked" ? "locked" : "active"}`}>
                <div className="adventure-map-challenge-heading">
                  <ExperimentThumbnail challengeId={item.id}/>
                  <div><h5>{item.title}</h5><p><span>{item.kind === "hardware" ? "硬件配置" : "电路实验"}</span><span>{item.statusLabel}</span><span title={item.scoreNote || undefined}>{item.scoreLabel}</span></p></div>
                </div>
                {item.prerequisiteHint ? <p className="adventure-map-prerequisite">{item.prerequisiteHint}</p> : null}
                <div className="adventure-map-challenge-actions">
                  {item.isRecommended ? <span className="adventure-map-recommended">推荐下一关</span> : <span>{item.estimatedMinutes ? `约 ${item.estimatedMinutes} 分钟` : ""}</span>}
                  <button type="button" onClick={() => onOpenChallenge?.(item.id)} disabled={!onOpenChallenge} aria-label={`${item.actionLabel}：${item.title}`}>{item.actionLabel}<span aria-hidden="true">↗</span></button>
                </div>
              </li>
            ))}
          </ul>
          {(DEMOS_BY_CHAPTER[selected.chapterId] ?? []).length > 0 ? <div className="adventure-map-demos">
            <strong>本章课堂演示</strong>
            {(DEMOS_BY_CHAPTER[selected.chapterId] ?? []).map((demo) => <a key={demo.href} href={demo.href} rel="noreferrer" target="_blank" title={demo.note}><ExperimentThumbnail demo={demo}/><span>{demo.title}</span><span aria-hidden="true">↗</span></a>)}
          </div> : null}
          <p className="adventure-map-completion-note">区域点亮需完成本章全部关卡。参与型实验只记录完成，不计入测评分数。</p>
        </aside>
      </div>
    </section>
  );
}
