import { Handle, Position } from "@xyflow/react";

function portOffset(index, total) {
  if (total <= 1) return 50;
  return 30 + (40 * index) / Math.max(1, total - 1);
}

// Logic-gate / component glyphs, styled after textbook gate symbols
// and the hardware-chip look used in circuit-learning games.
const TYPE_GLYPH = {
  input: "IN",
  output: "OUT",
  buffer: "▸",
  and: "&",
  or: "≥1",
  not: "1◯",
  xor: "=1",
  fullAdder: "Σ",
  mux2: "MUX",
  alu1: "ALU",
};

export function CircuitNode({ data, selected }) {
  const inputPorts = (data.ports ?? []).filter((port) => port.direction === "in");
  const outputPorts = (data.ports ?? []).filter((port) => port.direction === "out");
  // 芯片节点（chip:xxx）统一用 IC 方块字形，其它按类型映射
  const glyph = data.componentType?.startsWith("chip:") ? "▣" : (TYPE_GLYPH[data.componentType] ?? "◆");
  const valueChip = (portId) => {
    const value = data.portValues?.[portId];
    if (value === undefined || value === null) return null;
    const tone = value === 1 ? "one" : value === 0 ? "zero" : "unknown";
    return <em className={`circuit-flow-port-value signal-${tone}`}>{value === 0 || value === 1 ? value : "?"}</em>;
  };

  return (
    <div className={`circuit-flow-node ${selected ? "selected" : ""}`} data-component-type={data.componentType}>
      <div className="circuit-flow-node-head">
        <span className="circuit-flow-node-glyph" aria-hidden="true">{glyph}</span>
        <div className="circuit-flow-node-title">
          <strong>{data.label}</strong>
        </div>
      </div>

      {inputPorts.map((port, index) => (
        <div className="circuit-flow-port-row input" key={port.id} style={{ top: `${portOffset(index, inputPorts.length)}%` }}>
          <Handle
            className="circuit-flow-handle input"
            data-testid={`port-${data.nodeId ?? "node"}-${port.id}`}
            id={port.id}
            position={Position.Left}
            type="target"
          />
          <span>{port.label}</span>
          {valueChip(port.id)}
        </div>
      ))}

      {outputPorts.map((port, index) => (
        <div className="circuit-flow-port-row output" key={port.id} style={{ top: `${portOffset(index, outputPorts.length)}%` }}>
          {valueChip(port.id)}
          <span>{port.label}</span>
          <Handle
            className="circuit-flow-handle output"
            data-testid={`port-${data.nodeId ?? "node"}-${port.id}`}
            id={port.id}
            position={Position.Right}
            type="source"
          />
        </div>
      ))}
    </div>
  );
}
