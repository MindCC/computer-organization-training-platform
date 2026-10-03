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
      { kind: "input", label: `输入 ${label}`, componentType: "input", ioIndex:index, ports: [outPort("out", "OUT")] },
      { x: 40, y: 60 + index * 180 },
      `input-${index + 1}`,
    ));
  });
  spec.outputLabels.forEach((label, index) => {
    nodes.push(makeGateNode(
      { kind: "output", label: label, componentType: "output", ioIndex:index, ports: [inPort("in", "IN")] },
      { x: 660, y: 60 + index * 180 },
      `output-${index + 1}`,
    ));
  });
  return nodes;
}

/**
 * 自由拼装闯关（纯逻辑门关）：学生自己拖门组装电路，
 * 判分 = 合法的组合电路 + 全输入组合真值表一致。
 * 上报学生实际节点与导线，服务端重新构建端口并复算。
 */
export function GateAssemblyChallenge({ challenge, circuitModel, onResult, onDraft, submitBlocked = false, submitBlockedReason = "" }) {
  const spec = useMemo(() => freeformSpecOf(challenge.id), [challenge.id]);
  const [grading, setGrading] = useState(null);
  const latestRef = useRef({ model: null, circuitEdges: [] });
  const initialNodes = useMemo(() => buildStarterNodes(spec), [spec]);

  const handleCircuit = useCallback(({ model, circuitEdges, inputs }) => {
    latestRef.current = { model, circuitEdges };
    setGrading(gradeFreeform(model, circuitEdges, spec));
    onDraft?.({model,edges:circuitEdges,inputs});
  }, [spec,onDraft]);

  const submit = useCallback(() => {
    const { model, circuitEdges } = latestRef.current;
    const grade = gradeFreeform(model, circuitEdges, spec);
    setGrading(grade);
    if (!grade.passed) return;
    onResult?.({
      passed: true,
      score: 100,
      errors: [],
      missing: [],
      extraConnections: [],
      mode:'freeform',
      circuitNodes:model.nodes,
      circuitEdges,
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
            {grading?.cost?<p>元件 {grading.cost.components} · 导线 {grading.cost.wires} · 逻辑深度 {grading.cost.depth} 层。通过后可继续尝试更简洁的电路。</p>:null}
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
      paletteDefs={GATE_DEFS.filter(def=>def.kind!=='input'&&def.kind!=='output'&&(!spec.allowedGateTypes||spec.allowedGateTypes.includes(def.componentType)))}
      statusText={`自由拼装「${challenge.title}」：从左侧拖门到画布，把 ${spec.inputLabels.join("、")} 的信号变成正确的输出。`}
      submitBlocked={submitBlocked}
      submitBlockedReason={submitBlockedReason}
    />
  );
}
