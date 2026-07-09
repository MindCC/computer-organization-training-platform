import { useRef } from "react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";

export function ChallengeCanvas({
  activeStep,
  challenge,
  challengeId,
  connectionBlueprint,
  connections,
  expandedComponent,
  feedback,
  inputState,
  onBoardDragOver,
  onBoardDrop,
  onPlacedComponentDragStart,
  onRemoveConnection,
  onWireDragEnd,
  onWireHoverChange,
  onWireDragMove,
  onWireDragStart,
  outputText,
  placementBlueprint = [],
  placementPreview,
  placedComponents = [],
  selectedComponent,
  setExpandedComponent,
  setSelectedComponent,
  simulation,
  simulationStep,
  wireDrag,
  wireHoverEndpoint,
  wirePreviewCopy,
  wirePreviewStatus,
}) {
  const boardRef = useRef(null);
  const scenes = {
    "computer-components": {
      label: "五大部件协同",
      hint: "把一次计算看成输入、存储、控制、运算和输出之间的协作，而不是单个硬件独立完成。",
      inputText: `输入信号=${inputState.a}`,
      outputText,
      wires: [
        { className: "horizontal start", activeAt: 0 },
        { className: "horizontal mid", activeAt: 1 },
        { className: "horizontal mux-out", activeAt: 2 },
      ],
      nodes: [
        { name: "输入设备", tone: "io", className: "source top", detail: "把外部信息送入系统" },
        { name: "存储器", tone: "module", className: "module wide", detail: "保存程序和数据" },
        { name: "控制器", tone: "control", className: "mux center", detail: "发出控制信号" },
        { name: "运算器", tone: "logic", className: "logic core", detail: "执行计算" },
        { name: "输出设备", tone: "output", className: "output", detail: "呈现最终结果" },
      ],
    },
    "program-flow": {
      label: "程序运行路线",
      hint: "从键盘输入 1+1 到屏幕显示 2，中间经过主存、CPU取指和运算器执行。",
      inputText: `${inputState.a}+${inputState.b}`,
      outputText,
      wires: [
        { className: "horizontal start", activeAt: 0 },
        { className: "horizontal mid", activeAt: 1 },
        { className: "horizontal top-out", activeAt: 2 },
        { className: "horizontal mux-out", activeAt: 3 },
      ],
      nodes: [
        { name: "键盘输入", tone: "io", className: "input", detail: "输入表达式" },
        { name: "主存", tone: "module", className: "module wide", detail: "保存程序和数据" },
        { name: "CPU取指", tone: "control", className: "mux center", detail: "取得下一条指令" },
        { name: "运算器执行", tone: "logic", className: "adder core", detail: "执行 1+1" },
        { name: "屏幕输出", tone: "output", className: "output", detail: "显示结果" },
      ],
    },
    "instruction-data": {
      label: "指令与数据",
      hint: "同一片内存中的内容没有天然标签，CPU根据取指阶段或执行阶段决定如何解释它。",
      inputText: `地址=${inputState.address}`,
      outputText,
      wires: [
        { className: "horizontal upper-feed", activeAt: 0 },
        { className: "horizontal lower-feed", activeAt: 1 },
        { className: "horizontal mux-out", activeAt: 2 },
      ],
      nodes: [
        { name: "程序计数器PC", tone: "control", className: "selector signal", detail: "指出下一条指令地址" },
        { name: "地址100", tone: "module", className: "module wide", detail: "取指阶段是指令" },
        { name: "地址101/102", tone: "module", className: "source bottom", detail: "执行阶段是数据" },
        { name: "指令寄存器IR", tone: "control", className: "mux center", detail: "保存当前指令" },
        { name: "结果寄存器", tone: "output", className: "output", detail: "保存运算结果" },
      ],
    },
    "memory-address": {
      label: "\u5b58\u50a8\u5668\u4e0e\u5730\u5740\u8bbf\u95ee",
      hint: "\u4e00\u6b21\u8bfb\u4e3b\u5b58\u5206\u4e24\u6761\u542b\u4e49\u4e0d\u540c\u7684\u8def\uff1a\u5730\u5740\u5148\u8fdb\u5165 MAR \u9009\u62e9\u5355\u5143\uff0c\u6570\u636e\u518d\u4ece\u4e3b\u5b58\u8fdb\u5165 MDR \u5e76\u9001\u56de CPU\u3002",
      inputText: `\u5730\u5740=${inputState.address}`,
      outputText,
      wires: [
        { className: "horizontal start", activeAt: 0 },
        { className: "horizontal mid", activeAt: 1 },
        { className: "horizontal mux-out", activeAt: 2 },
      ],
      nodes: [
        { name: "\u8bbf\u95ee\u5730\u5740", tone: "io", className: "input", detail: "CPU \u53d1\u51fa\u5730\u5740" },
        { name: "\u5730\u5740\u5bc4\u5b58\u5668MAR", tone: "control", className: "selector signal", detail: "\u4fdd\u5b58\u8981\u8bbf\u95ee\u7684\u5730\u5740" },
        { name: "\u4e3b\u5b58\u5355\u5143", tone: "module", className: "module wide", detail: "\u6309\u5730\u5740\u8bfb\u51fa\u6570\u636e" },
        { name: "\u6570\u636e\u5bc4\u5b58\u5668MDR", tone: "module", className: "mux center", detail: "\u6682\u5b58\u4e3b\u5b58\u6570\u636e" },
        { name: "CPU\u6570\u636e\u603b\u7ebf", tone: "output", className: "output", detail: "\u9001\u56de CPU \u5185\u90e8" },
      ],
    },
    "data-flow": {
      label: "信号直通",
      hint: "只有一条主线，核心是把输入和结果端真正连通。",
      inputText: `输入A=${inputState.a}`,
      outputText,
      wires: [
        { className: "horizontal start", activeAt: 0 },
        { className: "horizontal mid", activeAt: 1 },
      ],
      nodes: [
        { name: "输入开关", tone: "io", className: "input", detail: "信号起点 · 切换 0/1" },
        { name: "数据通路", tone: "module", className: "module wide", detail: "单一主线 · 直通输出" },
        { name: "结果灯", tone: "output", className: "output", detail: "观察最终结果" },
      ],
    },
    "and-gate": {
      label: "与门真值表",
      hint: "两个输入都为 1 时输出才为 1。先把 A、B 接进与门，再把结果接到输出端。",
      inputText: `A=${inputState.a} · B=${inputState.b}`,
      outputText,
      wires: [
        { className: "horizontal upper-feed", activeAt: 0 },
        { className: "horizontal lower-feed", activeAt: 0 },
        { className: "horizontal mux-out", activeAt: 1 },
      ],
      nodes: [
        { name: "输入A", tone: "io", className: "source top", detail: "第一个条件" },
        { name: "输入B", tone: "io", className: "source bottom", detail: "第二个条件" },
        { name: "与门", tone: "logic", className: "logic core", detail: "同时为 1 才通过" },
        { name: "输出Y", tone: "output", className: "output", detail: "观察与运算结果" },
      ],
    },
    "or-gate": {
      label: "或门真值表",
      hint: "只要 A 或 B 有一个为 1，输出就为 1。重点观察 0/1 组合下的输出变化。",
      inputText: `A=${inputState.a} · B=${inputState.b}`,
      outputText,
      wires: [
        { className: "horizontal upper-feed", activeAt: 0 },
        { className: "horizontal lower-feed", activeAt: 0 },
        { className: "horizontal mux-out", activeAt: 1 },
      ],
      nodes: [
        { name: "输入A", tone: "io", className: "source top", detail: "第一路输入" },
        { name: "输入B", tone: "io", className: "source bottom", detail: "第二路输入" },
        { name: "或门", tone: "logic", className: "logic core", detail: "至少一路为 1" },
        { name: "输出Y", tone: "output", className: "output", detail: "观察或运算结果" },
      ],
    },
    "not-gate": {
      label: "非门取反",
      hint: "非门只有一路输入。A 为 0 时输出 1，A 为 1 时输出 0。",
      inputText: `A=${inputState.a}`,
      outputText,
      wires: [
        { className: "horizontal start", activeAt: 0 },
        { className: "horizontal mid", activeAt: 1 },
      ],
      nodes: [
        { name: "输入A", tone: "io", className: "input", detail: "待取反信号" },
        { name: "非门", tone: "logic", className: "logic core", detail: "反相输出" },
        { name: "输出Y", tone: "output", className: "output", detail: "观察取反结果" },
      ],
    },
    "xor-gate": {
      label: "异或门真值表",
      hint: "两个输入不同则输出 1，相同则输出 0。这一关直接铺垫半加器的和位。",
      inputText: `A=${inputState.a} · B=${inputState.b}`,
      outputText,
      wires: [
        { className: "horizontal upper-feed", activeAt: 0 },
        { className: "horizontal lower-feed", activeAt: 0 },
        { className: "horizontal mux-out", activeAt: 1 },
      ],
      nodes: [
        { name: "输入A", tone: "io", className: "source top", detail: "第一路输入" },
        { name: "输入B", tone: "io", className: "source bottom", detail: "第二路输入" },
        { name: "异或门", tone: "logic", className: "xor top", detail: "不同为 1" },
        { name: "输出Y", tone: "output", className: "output", detail: "观察异或结果" },
      ],
    },
    "half-adder": {
      label: "和位与进位分流",
      hint: "输入A和B会同时进入两条并行逻辑：一条算和位，一条算进位。",
      inputText: `A=${inputState.a} · B=${inputState.b}`,
      outputText,
      wires: [
        { className: "horizontal start", activeAt: 0 },
        { className: "diagonal up", activeAt: 0 },
        { className: "diagonal down", activeAt: 0 },
        { className: "horizontal end-top", activeAt: 1 },
        { className: "horizontal end-bottom", activeAt: 1 },
      ],
      nodes: [
        { name: "输入端", tone: "io", className: "input split", detail: "两个输入同时出发" },
        { name: "异或门", tone: "logic", className: "xor top", detail: "负责和位 S" },
        { name: "与门", tone: "logic", className: "and bottom", detail: "负责进位 C" },
        { name: "输出端", tone: "output", className: "output dual", detail: "上方和位 · 下方进位" },
      ],
    },
    "full-adder": {
      label: "进位分叉合流",
      hint: "A、B 先求临时和，再与 Cin 合并；进位逻辑单独走另一条支路。",
      inputText: `A=${inputState.a} · B=${inputState.b} · Cin=${inputState.cin}`,
      outputText,
      wires: [
        { className: "horizontal start", activeAt: 0 },
        { className: "horizontal mid", activeAt: 1 },
        { className: "vertical carry", activeAt: 1 },
        { className: "horizontal top-out", activeAt: 2 },
        { className: "horizontal bottom-out", activeAt: 2 },
      ],
      nodes: [
        { name: "输入端", tone: "io", className: "input stacked", detail: "A / B / Cin 三路输入" },
        { name: "异或门1", tone: "logic", className: "xor first", detail: "先算临时和 X" },
        { name: "异或门2", tone: "logic", className: "xor second", detail: "X 再与 Cin 合并" },
        { name: "进位逻辑", tone: "control", className: "carry core", detail: "判断 Cout 是否产生" },
        { name: "输出端", tone: "output", className: "output dual", detail: "和位 S · 输出进位 Cout" },
      ],
    },
    "machine-number": {
      label: "机器数编码流水线",
      hint: "先判断符号位，再拆数值位；负数从原码到反码，再通过加一得到补码，最后写入结果寄存器。",
      inputText: `整数=${inputState.signedValue}`,
      outputText,
      wires: [
        { className: "horizontal start", activeAt: 0 },
        { className: "horizontal mid", activeAt: 1 },
        { className: "horizontal chain-two", activeAt: 2 },
        { className: "horizontal mux-out", activeAt: 3 },
      ],
      nodes: [
        { name: "十进制数", tone: "io", className: "input", detail: "课堂输入 -7 到 7" },
        { name: "符号位判断", tone: "control", className: "selector signal", detail: "正数 0 / 负数 1" },
        { name: "数值位拆分", tone: "module", className: "module wide", detail: "绝对值转二进制" },
        { name: "反码生成器", tone: "logic", className: "logic core", detail: "负数逐位取反" },
        { name: "补码生成器", tone: "module", className: "mux center", detail: "负数反码加 1" },
        { name: "结果寄存器", tone: "output", className: "output", detail: "保存最终补码" },
      ],
    },
    "multi-adder": {
      label: "级联传播",
      hint: "三个全加器首尾相接，低位进位会一路推向高位。",
      inputText: `A=${inputState.aNumber} · B=${inputState.bNumber} · 初始进位=${inputState.cin}`,
      outputText,
      wires: [
        { className: "horizontal chain-one", activeAt: 0 },
        { className: "horizontal chain-two", activeAt: 1 },
        { className: "horizontal chain-three", activeAt: 2 },
      ],
      nodes: [
        { name: "全加器0", tone: "module", className: "adder first", detail: "最低位" },
        { name: "全加器1", tone: "module", className: "adder second", detail: "接收前一位 Cout" },
        { name: "全加器2", tone: "module", className: "adder third", detail: "输出高位与总进位" },
        { name: "结果寄存器", tone: "output", className: "output result", detail: "汇总各位和位" },
      ],
    },
    mux: {
      label: "路径切换",
      hint: "两路数据同时就位，是否通过由选择信号决定。",
      inputText: `D0=${inputState.a} · D1=${inputState.b} · Sel=${inputState.select}`,
      outputText,
      wires: [
        { className: "horizontal upper-feed", activeAt: 0 },
        { className: "horizontal lower-feed", activeAt: 0 },
        { className: "vertical select-wire", activeAt: 1 },
        { className: "horizontal mux-out", activeAt: 2 },
      ],
      nodes: [
        { name: "数据源0", tone: "io", className: "source top", detail: "上路输入" },
        { name: "数据源1", tone: "io", className: "source bottom", detail: "下路输入" },
        { name: "选择端", tone: "control", className: "selector signal", detail: "决定走哪一路" },
        { name: "选择器", tone: "module", className: "mux center", detail: "把两条路收成一条路" },
        { name: "输出端", tone: "output", className: "output", detail: "当前选中的结果" },
      ],
    },
    alu: {
      label: "运算核心汇总",
      hint: "加法单元、逻辑单元并行准备结果，再交给结果选择器统一输出。",
      inputText: `A=${inputState.a} · B=${inputState.b} · Cin=${inputState.cin} · Op=${inputState.op}`,
      outputText,
      wires: [
        { className: "horizontal upper-feed", activeAt: 0 },
        { className: "horizontal lower-feed", activeAt: 0 },
        { className: "horizontal alu-upper", activeAt: 1 },
        { className: "horizontal alu-lower", activeAt: 1 },
        { className: "horizontal mux-out", activeAt: 2 },
      ],
      nodes: [
        { name: "输入端", tone: "io", className: "input stacked", detail: "A / B / Cin / Op" },
        { name: "加法单元", tone: "logic", className: "adder core", detail: "产生和位与进位" },
        { name: "逻辑单元", tone: "logic", className: "logic core", detail: "产生 AND / OR / XOR" },
        { name: "结果选择器", tone: "control", className: "mux center", detail: "按控制位选结果" },
        { name: "输出端", tone: "output", className: "output flags", detail: "结果 F · 零标志 · 进位标志" },
      ],
    },
  };

  const scene = scenes[challengeId];
  const signalBadges = buildSignalBadges({
    sceneInput: scene.inputText,
    outputs: simulation?.outputs,
    activeStep,
    simulationStep,
  });
  const issueMarkers = buildWorkbenchIssueMarkers(feedback);
  const inputAnchors = buildExternalAnchorLayout(connectionBlueprint.externalInputs, "input");
  const outputAnchors = buildExternalAnchorLayout(connectionBlueprint.externalOutputs, "output");
  const componentPins = Object.fromEntries(
    connectionBlueprint.components.map((item) => [item.name, buildComponentPinLayout(item.pins)]),
  );
  const renderedLines = buildRenderableConnections({
    challenge,
    connectionBlueprint,
    placedComponents,
    connections,
  });
  const previewLine = wireDrag
    ? {
      id: "preview-line",
      from: wireDrag.startEndpoint,
      to: wireDrag.pointer,
    }
    : null;

  function getBoardPoint(event) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };

    return {
      x: clampPlacement(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clampPlacement(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }

  function buildEndpointPayload(endpoint, event) {
    return {
      ...endpoint,
      ...getBoardPoint(event),
    };
  }

  function handleEndpointPointerDown(event, endpoint) {
    event.preventDefault();
    event.stopPropagation();
    const payload = buildEndpointPayload(endpoint, event);
    if (wireDrag) {
      onWireDragEnd(payload);
      return;
    }
    onWireDragStart(payload);
  }

  return (
    <div className={`challenge-scene ${challengeId} ${placedComponents.length > 0 ? "has-components" : ""}`}>
      <div className="challenge-scene-header">
        <div>
          <span className="eyebrow">关卡骨架</span>
          <h3>{scene.label}</h3>
          <p>{scene.hint}</p>
        </div>
        <div className="scene-readout">
          <span>输入快照</span>
          <strong>{scene.inputText}</strong>
          <small>输出：{scene.outputText}</small>
        </div>
      </div>

      <div className="workbench-signal-strip" aria-label="信号状态">
        {signalBadges.map((badge) => (
          <div className={`signal-badge ${badge.tone}`} key={badge.id}>
            <span>{badge.label}</span>
            <strong>{badge.value}</strong>
          </div>
        ))}
      </div>

      <div
        className={`challenge-scene-board lab-dropzone ${wireDrag ? "wiring-active" : ""}`}
        onDragOver={onBoardDragOver}
        onDrop={onBoardDrop}
        onPointerMove={(event) => {
          if (!wireDrag) return;
          if (event.target === event.currentTarget) {
            onWireHoverChange(null);
          }
          onWireDragMove(getBoardPoint(event));
        }}
        onPointerUp={() => {
          if (!wireDrag) return;
          onWireDragEnd(null);
        }}
        ref={boardRef}
      >
        {scene.wires.map((wire) => (
          <span
            className={`scene-wire ${wire.className} ${simulationStep >= wire.activeAt ? "active" : ""}`}
            key={wire.className}
          />
        ))}
        <svg className="connection-overlay" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
          {renderedLines.map((line, index) => {
            const tone = resolveConnectionTone(line.id, feedback, simulationStep);
            const route = buildOrthogonalWireRoute(line, index);
            const routePoints = formatWireRoutePoints(route.points);

            return (
              <g key={line.id}>
                <polyline
                  className="connection-hitbox"
                  data-click-x={route.clickPoint.x}
                  data-click-y={route.clickPoint.y}
                  onClick={() => onRemoveConnection(line.id)}
                  points={routePoints}
                />
                <polyline
                  className={`connection-line ${tone}`}
                  points={routePoints}
                />
                <text className={`connection-signal-label ${tone}`} x={route.label.x} y={route.label.y}>
                  {signalLabelForConnection(tone, simulationStep)}
                </text>
              </g>
            );
          })}
          {previewLine ? (
            <line
              className={`connection-line preview ${wirePreviewStatus}`}
              x1={previewLine.from.x}
              x2={previewLine.to.x}
              y1={previewLine.from.y}
              y2={previewLine.to.y}
            />
          ) : null}
        </svg>
        <div className="canvas-wire-hit-layer" aria-label="画布导线操作">
          {renderedLines.map((line, index) => {
            const route = buildOrthogonalWireRoute(line, index);
            return (
              <button
                aria-label={`移除导线 ${line.id}`}
                className="canvas-wire-hit-target"
                key={`hit-${line.id}`}
                onClick={() => onRemoveConnection(line.id)}
                style={{ left: `${route.clickPoint.x}%`, top: `${route.clickPoint.y}%` }}
                title={`移除导线：${line.id}`}
                type="button"
              />
            );
          })}
        </div>
        {issueMarkers.length > 0 ? (
          <div className="canvas-issue-layer" aria-live="polite">
            {issueMarkers.map((marker) => (
              <div
                className={`canvas-issue-marker ${marker.tone}`}
                key={marker.id}
                style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
              >
                <strong>{marker.label}</strong>
                <span>{marker.detail}</span>
              </div>
            ))}
          </div>
        ) : null}
        {wireDrag ? (
          <div className={`wire-target-indicator ${wirePreviewCopy.tone}`}>
            <strong>当前连线</strong>
            <span>{wirePreviewCopy.summary}</span>
            <small>{wirePreviewCopy.detail}</small>
          </div>
        ) : null}
        <div className="placement-slot-layer" aria-hidden="true">
          {placementBlueprint.map((slot) => (
            <div
              className={[
                "placement-slot",
                placementPreview?.matchedSlotIds.includes(slot.id) ? "matched" : "",
                selectedComponent === slot.displayLabel ? "selected" : "",
              ].filter(Boolean).join(" ")}
              key={slot.id}
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            >
              <strong>{slot.displayLabel}</strong>
              <small>{slot.role}</small>
            </div>
          ))}
        </div>
        {inputAnchors.map((anchor) => (
          <button
            className={[
              "lab-anchor",
              "input",
              wireDrag?.startEndpoint.key === anchor.key ? "selected start" : "",
              wireHoverEndpoint?.key === anchor.key && wireDrag ? `target ${wirePreviewStatus}` : "",
            ].filter(Boolean).join(" ")}
            key={anchor.key}
            onPointerDown={(event) => {
              handleEndpointPointerDown(event, anchor);
            }}
            onPointerEnter={(event) => {
              if (!wireDrag) return;
              onWireHoverChange(buildEndpointPayload(anchor, event));
            }}
            onPointerLeave={() => {
              if (!wireDrag) return;
              onWireHoverChange(null);
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!wireDrag) return;
              onWireDragEnd(buildEndpointPayload(anchor, event));
            }}
            style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }}
            type="button"
          >
            <span>{anchor.label}</span>
          </button>
        ))}
        {outputAnchors.map((anchor) => (
          <button
            className={[
              "lab-anchor",
              "output",
              wireDrag?.startEndpoint.key === anchor.key ? "selected start" : "",
              wireHoverEndpoint?.key === anchor.key && wireDrag ? `target ${wirePreviewStatus}` : "",
            ].filter(Boolean).join(" ")}
            key={anchor.key}
            onPointerDown={(event) => {
              handleEndpointPointerDown(event, anchor);
            }}
            onPointerEnter={(event) => {
              if (!wireDrag) return;
              onWireHoverChange(buildEndpointPayload(anchor, event));
            }}
            onPointerLeave={() => {
              if (!wireDrag) return;
              onWireHoverChange(null);
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!wireDrag) return;
              onWireDragEnd(buildEndpointPayload(anchor, event));
            }}
            style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }}
            type="button"
          >
            <span>{anchor.label}</span>
          </button>
        ))}
        {scene.nodes.map((node) => {
          const isSelected = selectedComponent === node.name || expandedComponent === node.name;
          return (
            <button
              className={`scene-node ${node.tone} ${node.className} ${isSelected ? "selected" : ""}`}
              key={node.name}
              onClick={() => {
                setSelectedComponent(node.name);
                setExpandedComponent(node.name);
              }}
              type="button"
            >
              <strong>{node.name}</strong>
              <small>{node.detail}</small>
            </button>
          );
        })}
        <div className="floating-layer">
          {placedComponents.map((component) => (
            <div
              className={`floating-component ${selectedComponent === (component.displayLabel ?? component.name) ? "selected" : ""}`}
              data-component-id={component.id}
              draggable
              key={component.id}
              onClick={() => {
                setSelectedComponent(component.displayLabel ?? component.name);
                setExpandedComponent(component.displayLabel ?? component.name);
              }}
              onDragStart={(event) => onPlacedComponentDragStart(event, component)}
              style={{ left: `${component.x}%`, top: `${component.y}%` }}
            >
              <div className="floating-component-head">
                <Cpu size={16} />
                <span>{component.displayLabel ?? component.name}</span>
              </div>
              <button
                className="component-drag-handle"
                draggable
                onClick={(event) => event.stopPropagation()}
                onDragStart={(event) => {
                  event.stopPropagation();
                  onPlacedComponentDragStart(event, component);
                }}
                type="button"
              >
                拖动元件
              </button>
              <div className="floating-pin-cluster">
                {(componentPins[component.name] ?? []).map((pin) => (
                  <button
                    className={[
                      "floating-pin",
                      wireDrag?.startEndpoint.key === `${component.id}-${pin.pin}` ? "selected start" : "",
                      wireHoverEndpoint?.key === `${component.id}-${pin.pin}` && wireDrag ? `target ${wirePreviewStatus}` : "",
                    ].filter(Boolean).join(" ")}
                    key={`${component.id}-${pin.pin}`}
                    style={{ left: `${pin.offsetX}%`, top: `${pin.offsetY}%` }}
                    onPointerDown={(event) => {
                      handleEndpointPointerDown(event, {
                        key: `${component.id}-${pin.pin}`,
                        label: component.name,
                        componentName: component.name,
                        componentLabel: component.displayLabel ?? component.name,
                        pin: pin.pin,
                        pinRole: pin.role,
                      });
                    }}
                    onPointerEnter={(event) => {
                      if (!wireDrag) return;
                      onWireHoverChange(buildEndpointPayload({
                        key: `${component.id}-${pin.pin}`,
                        label: component.name,
                        componentName: component.name,
                        componentLabel: component.displayLabel ?? component.name,
                        pin: pin.pin,
                        pinRole: pin.role,
                      }, event));
                    }}
                    onPointerLeave={() => {
                      if (!wireDrag) return;
                      onWireHoverChange(null);
                    }}
                    onPointerUp={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      if (!wireDrag) return;
                      onWireDragEnd(buildEndpointPayload({
                        key: `${component.id}-${pin.pin}`,
                        label: component.name,
                        componentName: component.name,
                        componentLabel: component.displayLabel ?? component.name,
                        pin: pin.pin,
                        pinRole: pin.role,
                      }, event));
                    }}
                    type="button"
                  >
                    {pin.pin}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
