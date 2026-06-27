import { Handle, Position } from "@xyflow/react";

function portOffset(index, total) {
  if (total <= 1) return 50;
  return 28 + (44 * index) / Math.max(1, total - 1);
}

export function CircuitNode({ data, selected }) {
  const inputPorts = (data.ports ?? []).filter((port) => port.direction === "in");
  const outputPorts = (data.ports ?? []).filter((port) => port.direction === "out");

  return (
    <div className={`circuit-flow-node ${selected ? "selected" : ""}`} data-component-type={data.componentType}>
      <div className="circuit-flow-node-title">
        <strong>{data.label}</strong>
        <span>{data.componentType}</span>
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
        </div>
      ))}

      {outputPorts.map((port, index) => (
        <div className="circuit-flow-port-row output" key={port.id} style={{ top: `${portOffset(index, outputPorts.length)}%` }}>
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
