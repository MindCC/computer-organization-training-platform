import { useMemo } from "react";
import { Background, Controls, Handle, Position, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { CHALLENGES } from "../platformLogic.js";
import { CHALLENGE_DEPS, dependencyDepths } from "../challengeDependencies.js";

const TIER_GAP_Y = 96;
const NODE_GAP_X = 150;

function buildMapModel(progress, selectedId) {
  const depths = dependencyDepths(CHALLENGES.map((challenge) => challenge.id));
  const tiers = new Map();
  for (const challenge of CHALLENGES) {
    const depth = depths[challenge.id];
    if (!tiers.has(depth)) tiers.set(depth, []);
    tiers.get(depth).push(challenge);
  }

  const nodes = [];
  for (const [depth, items] of [...tiers.entries()].sort((a, b) => a[0] - b[0])) {
    items.forEach((challenge, index) => {
      const record = progress?.[challenge.id] ?? {};
      const status = record.status === "completed" ? "done" : record.status === "locked" ? "locked" : "open";
      nodes.push({
        id: challenge.id,
        type: "mapNode",
        position: { x: (index - (items.length - 1) / 2) * NODE_GAP_X, y: depth * TIER_GAP_Y },
        data: {
          label: challenge.shortTitle ?? challenge.title,
          title: challenge.title,
          status,
          selected: challenge.id === selectedId,
          bestScore: record.bestScore ?? 0,
          graded: challenge.grading !== "participation",
        },
        draggable: false,
      });
    });
  }

  const edges = [];
  for (const challenge of CHALLENGES) {
    for (const dep of CHALLENGE_DEPS[challenge.id] ?? []) {
      const depDone = progress?.[dep]?.status === "completed";
      edges.push({
        id: `${dep}->${challenge.id}`,
        source: dep,
        sourceHandle: "out",
        target: challenge.id,
        targetHandle: "in",
        type: "smoothstep",
        animated: false,
        className: depDone ? "map-edge done" : "map-edge",
      });
    }
  }
  return { nodes, edges };
}

function MapNode({ data, selected }) {
  const icon = data.status === "done" ? "✓" : data.status === "open" ? "▶" : "🔒";
  return (
    <div className={`map-node ${data.status} ${data.selected || selected ? "selected" : ""}`} data-status={data.status}>
      <Handle className="map-handle" id="in" position={Position.Top} type="target" />
      <span className="map-node-icon" aria-hidden="true">{icon}</span>
      <span className="map-node-label">{data.label}</span>
      <Handle className="map-handle" id="out" position={Position.Bottom} type="source" />
    </div>
  );
}

const nodeTypes = { mapNode: MapNode };

/**
 * 挑战依赖地图（仿图灵完备）：节点是关卡、连线是「元件依赖」。
 * 完成=绿、可做=蓝、未解锁=灰锁；点任意节点进入该关（未解锁的也可先进去练习）。
 */
export function ChallengeMap({ progress, selectedId, onEnter }) {
  const { nodes, edges } = useMemo(() => buildMapModel(progress, selectedId), [progress, selectedId]);
  const doneCount = nodes.filter((node) => node.data.status === "done").length;
  const openCount = nodes.filter((node) => node.data.status === "open").length;

  return (
    <div className="challenge-map-wrap">
      <div className="challenge-map-head">
        <div>
          <strong>挑战依赖地图</strong>
          <p>完成一个关卡，它的「元件」就会解锁依赖它的后续关卡——和图灵完备一样，从门一路造到整机。</p>
        </div>
        <div className="map-legend" aria-label="图例">
          <span><i className="legend-dot done" />已完成 {doneCount}</span>
          <span><i className="legend-dot open" />可做 {openCount}</span>
          <span><i className="legend-dot locked" />未解锁 {nodes.length - doneCount - openCount}</span>
        </div>
      </div>
      <div className="challenge-map-canvas">
        <ReactFlow
          edges={edges}
          elementsSelectable={false}
          fitView
          maxZoom={2}
          minZoom={0.35}
          nodeTypes={nodeTypes}
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable={false}
          onNodeClick={(_event, node) => onEnter?.(node.id)}
          proOptions={{ hideAttribution: true }}
          zoomOnScroll
        >
          <Background gap={20} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
