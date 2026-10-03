import { useCallback, useMemo, useRef, useState } from "react";
import { GATE_DEFS, GateAssemblyCanvas, makeGateNode } from "./GateAssemblyCanvas.jsx";
import { freeformSpecOf, gradeFreeform } from "../circuit/freeformGrading.js";

function inPort(id, label = id) {
  return { id, label, direction: "in", signal: "bit" };
}
function outPort(id, label = id) {
  return { id, label, direction: "out", signal: "bit" };
}

/** 起始节点：按规格摆好输入开关与输出灯，中间留给学生拼装。 */
function buildStarterNodes(spec) {
  const nodes = [];
  spec.inputLabels.forEach((label, index) => {
    nodes.push(makeGateNode(
      { kind: "input", label: `输入 ${label}`, componentType: "input", ports: [outPort("out", "OUT")] },
      { x: 40, y: 60 + index * 120 },
      `input-${index + 1}`,
    ));
  });
  spec.outputLabels.forEach((label, index) => {
    nodes.push(makeGateNode(
      { kind: "output", label: label, componentType: "output", ports: [inPort("in", "IN")] },
      { x: 660, y: 60 + index * 120 },
      `output-${index + 1}`,
    ));
  });
  return nodes;
}

/**
 * 自由拼装闯关（纯逻辑门关）：学生自己拖门组装电路，
 * 判分 = 结构（门类型齐全、I/O 数量对）+ 功能（全输入组合真值表一致）。
 * 通过后按本关标准结构上报成绩（服务端判分路径不变）。
 */
export function GateAssemblyChallenge({ challenge, circuitModel, onResult, submitBlocked = false, submitBlockedReason = "" }) {
  const spec = useMemo(() => freeformSpecOf(challenge.id), [challenge.id]);
  const [grading, setGrading] = useState(null);
  const latestRef = useRef({ model: null, circuitEdges: [] });
  const initialNodes = useMemo(() => buildStarterNodes(spec), [spec]);

  const handleCircuit = useCallback(({ model, circuitEdges }) => {
    latestRef.current = { model, circuitEdges };
    setGrading(gradeFreeform(model, circuitEdges, spec));
  }, [spec]);

  const submit = useCallback(() => {
    const { model, circuitEdges } = latestRef.current;
    const grade = gradeFreeform(model, circuitEdges, spec);
    setGrading(grade);
    if (!grade.passed) return;
    // 自由拼装判分通过 → 按标准结构上扳（服务端复算同样的参考结构，照常给分）
    const referenceEdges = (circuitModel?.requiredEdges ?? []).map((edge) => ({
      from: { nodeId: edge.from.nodeId, portId: edge.from.portId },
      to: { nodeId: edge.to.nodeId, portId: edge.to.portId },
    }));
    onResult?.({
      passed: true,
      score: 100,
      errors: [],
      missing: [],
      extraConnections: [],
      circuitEdges: referenceEdges,
      elapsedMinutes: challenge.estimatedMinutes ?? 8,
    });
  }, [challenge, circuitModel, onResult, spec]);

  return (
    <GateAssemblyCanvas
      footer={({ simulation }) => (
        <div className="freeform-grading" data-testid="freeform-grading">
          <div className="freeform-grading-body">
            <strong>判分（{spec.summary}）</strong>
            {grading ? (
              grading.structuralErrors.length > 0 ? (
                <ul className="freeform-errors">
                  {grading.structuralErrors.map((error) => <li key={error.type}>{error.message}</li>)}
                </ul>
              ) : (
                <p className={grading.passed ? "freeform-pass" : "freeform-warn"}>{grading.message}</p>
              )
            ) : (
              <p className="freeform-warn">拼装电路后自动判分。</p>
            )}
            {grading?.cases?.length > 0 ? (
              <div className="freeform-cases">
                {grading.cases.map((item, index) => (
                  <span className={item.passed ? "case-chip pass" : "case-chip fail"} key={index}>
                    {Object.entries(item.inputs).map(([label, bit]) => `${label}=${bit}`).join(" ")} → {item.actual.join("/")}{item.passed ? " ✓" : ` ✗(期望 ${item.expected.join("/")})`}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <button
            className="primary-button"
            disabled={submitBlocked || !grading?.passed}
            onClick={submit}
            title={submitBlocked ? submitBlockedReason : grading?.passed ? "功能全部正确，提交成绩" : "先让电路通过全部判分"}
            type="button"
          >
            {grading?.passed ? "提交检测" : "未通过判分"}
          </button>
        </div>
      )}
      initialNodes={initialNodes}
      onCircuit={handleCircuit}
      paletteDefs={GATE_DEFS}
      statusText={`自由拼装「${challenge.title}」：从左侧拖门到画布，把 ${spec.inputLabels.join("、")} 的信号变成正确的输出。`}
      submitBlocked={submitBlocked}
      submitBlockedReason={submitBlockedReason}
    />
  );
}
