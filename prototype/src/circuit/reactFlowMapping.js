import { edgeKey } from "./challengeCircuitModel.js";

export function makeCircuitEdgeId(edge) {
  return edgeKey(edge);
}

export function circuitEdgeToFlowEdge(edge, options = {}) {
  return {
    id: makeCircuitEdgeId(edge),
    source: edge.from.nodeId,
    sourceHandle: edge.from.portId,
    target: edge.to.nodeId,
    targetHandle: edge.to.portId,
    type: options.type ?? "smoothstep",
    data: {
      requiredEdgeId: edge.id ?? null,
      hint: edge.hint ?? null,
    },
  };
}

export function circuitModelToFlow(model, { includeRequiredEdges = false } = {}) {
  return {
    nodes: (model?.nodes ?? []).map((node) => ({
      id: node.id,
      type: "circuitNode",
      position: { ...node.position },
      data: {
        nodeId: node.id,
        label: node.label,
        componentType: node.type,
        ports: node.ports.map((port) => ({ ...port })),
      },
    })),
    edges: includeRequiredEdges ? (model?.requiredEdges ?? []).map((edge) => circuitEdgeToFlowEdge(edge)) : [],
  };
}

export function flowEdgesToCircuitEdges(edges = []) {
  return edges.map((edge) => ({
    from: { nodeId: edge.source, portId: edge.sourceHandle },
    to: { nodeId: edge.target, portId: edge.targetHandle },
  }));
}

export function flowConnectionToCircuitEdge(connection, model = null) {
  const sourcePort = findModelPort(model, connection.source, connection.sourceHandle);
  const targetPort = findModelPort(model, connection.target, connection.targetHandle);
  if (sourcePort?.direction === "in" && targetPort?.direction === "out") {
    return {
      from: { nodeId: connection.target, portId: connection.targetHandle },
      to: { nodeId: connection.source, portId: connection.sourceHandle },
    };
  }
  return {
    from: { nodeId: connection.source, portId: connection.sourceHandle },
    to: { nodeId: connection.target, portId: connection.targetHandle },
  };
}

function findModelPort(model, nodeId, portId) {
  return (model?.nodes ?? []).find((node) => node.id === nodeId)?.ports.find((port) => port.id === portId) ?? null;
}

