import assert from "node:assert/strict";
import test from "node:test";

import { HALF_ADDER_CIRCUIT } from "./challengeCircuitModel.js";
import {
  circuitEdgeToFlowEdge,
  circuitModelToFlow,
  flowConnectionToCircuitEdge,
  flowEdgesToCircuitEdges,
  makeCircuitEdgeId,
} from "./reactFlowMapping.js";

test("结构化模型可以映射为 React Flow 节点和 handle 连线", () => {
  const flow = circuitModelToFlow(HALF_ADDER_CIRCUIT, { includeRequiredEdges: true });

  assert.equal(flow.nodes.length, HALF_ADDER_CIRCUIT.nodes.length);
  assert.equal(flow.edges.length, HALF_ADDER_CIRCUIT.requiredEdges.length);
  assert.deepEqual(flow.nodes.find((node) => node.id === "xor-1").data.ports.map((port) => port.id), ["a", "b", "s"]);

  const edge = flow.edges.find((item) => item.id === "input-a:out->xor-1:a");
  assert.equal(edge.source, "input-a");
  assert.equal(edge.sourceHandle, "out");
  assert.equal(edge.target, "xor-1");
  assert.equal(edge.targetHandle, "a");
});

test("React Flow edge 可以转换回平台电路边", () => {
  const sourceEdge = HALF_ADDER_CIRCUIT.requiredEdges[0];
  const flowEdge = circuitEdgeToFlowEdge(sourceEdge);

  assert.equal(makeCircuitEdgeId(sourceEdge), "input-a:out->xor-1:a");
  assert.deepEqual(flowEdgesToCircuitEdges([flowEdge]), [
    { from: { nodeId: "input-a", portId: "out" }, to: { nodeId: "xor-1", portId: "a" } },
  ]);
});

test("React Flow onConnect payload 可以转换为平台电路边", () => {
  assert.deepEqual(
    flowConnectionToCircuitEdge({ source: "input-b", sourceHandle: "out", target: "and-1", targetHandle: "b" }),
    { from: { nodeId: "input-b", portId: "out" }, to: { nodeId: "and-1", portId: "b" } },
  );
});

test("React Flow onConnect payload 反向拖拽时会按端口方向归一化", () => {
  assert.deepEqual(
    flowConnectionToCircuitEdge(
      { source: "and-1", sourceHandle: "b", target: "input-b", targetHandle: "out" },
      HALF_ADDER_CIRCUIT,
    ),
    { from: { nodeId: "input-b", portId: "out" }, to: { nodeId: "and-1", portId: "b" } },
  );
});
