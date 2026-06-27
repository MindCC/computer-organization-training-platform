import { buildCircuitModelIndex, edgeKey, portKey } from "./challengeCircuitModel.js";

function cloneEdge(edge) {
  return { from: { ...edge.from }, to: { ...edge.to } };
}

function sameEdge(first, second) {
  return edgeKey(first) === edgeKey(second);
}

function requiredEdgeMatch(model, edge) {
  return (model?.requiredEdges ?? []).find((required) => sameEdge(required, edge)) ?? null;
}

export function canConnectPorts(model, connection, existingEdges = []) {
  const index = buildCircuitModelIndex(model);
  const from = index.ports.get(portKey(connection?.from?.nodeId, connection?.from?.portId));
  const to = index.ports.get(portKey(connection?.to?.nodeId, connection?.to?.portId));

  if (!from || !to) {
    return { ok: false, type: "端口不存在", message: "连接的起点或终点端口不存在。" };
  }

  if (from.port.direction !== "out" || to.port.direction !== "in") {
    return {
      ok: false,
      type: "端口方向错误",
      message: "导线必须从输出端口连接到输入端口。",
      from: cloneEdge(connection).from,
      to: cloneEdge(connection).to,
    };
  }

  const duplicateDriver = existingEdges.find((edge) => edge.to.nodeId === connection.to.nodeId && edge.to.portId === connection.to.portId);
  if (duplicateDriver) {
    return {
      ok: false,
      type: "输入端重复驱动",
      message: "该输入端已经被一条导线驱动，请先删除原有导线。",
      nodeId: connection.to.nodeId,
      portId: connection.to.portId,
    };
  }

  return { ok: true };
}

export function validateCircuitStructure(model, studentEdges = []) {
  const errors = [];
  const validEdges = [];
  const invalidEdges = [];

  for (const edge of studentEdges) {
    const result = canConnectPorts(model, edge, validEdges);
    if (!result.ok) {
      invalidEdges.push({ edge: cloneEdge(edge), reason: result.type });
      errors.push({
        type: result.type,
        message: result.message,
        nodeId: result.nodeId ?? edge.to?.nodeId,
        portId: result.portId ?? edge.to?.portId,
      });
      continue;
    }
    validEdges.push(cloneEdge(edge));
  }

  const missingEdges = (model?.requiredEdges ?? []).filter((required) => !validEdges.some((edge) => sameEdge(required, edge)));
  const extraEdges = validEdges.filter((edge) => !requiredEdgeMatch(model, edge));

  for (const edge of missingEdges) {
    errors.push({
      type: edge.hint?.type ?? "结构不完整",
      message: edge.hint?.message ?? "必要连接尚未完成。",
      nodeId: edge.to.nodeId,
      portId: edge.to.portId,
    });
  }

  for (const edge of extraEdges) {
    errors.push({
      type: "结构冲突",
      message: "这条导线不是本关目标结构的一部分。",
      nodeId: edge.to.nodeId,
      portId: edge.to.portId,
    });
  }

  const requiredCount = Math.max(1, model?.requiredEdges?.length ?? 0);
  const baseScore = Math.round(((requiredCount - missingEdges.length) / requiredCount) * 100);
  const score = Math.max(0, baseScore - extraEdges.length * 10 - invalidEdges.length * 15);

  return { passed: errors.length === 0, score, missingEdges, extraEdges, invalidEdges, errors };
}
