import { GATE_DEFS, GateAssemblyCanvas, makeGateNode } from "./GateAssemblyCanvas.jsx";

function starterNodes() {
  return [
    makeGateNode(GATE_DEFS.find((def) => def.kind === "input"), { x: 40, y: 60 }),
    makeGateNode(GATE_DEFS.find((def) => def.kind === "input"), { x: 40, y: 220 }),
    makeGateNode(GATE_DEFS.find((def) => def.kind === "and"), { x: 340, y: 130 }),
    makeGateNode(GATE_DEFS.find((def) => def.kind === "output"), { x: 640, y: 130 }),
  ];
}

/** 逻辑门沙盒：自由拼装练习（不计分）。装配与仿真全部复用 GateAssemblyCanvas。 */
export function LogicGateSandbox() {
  return (
    <GateAssemblyCanvas
      initialNodes={starterNodes()}
      paletteDefs={GATE_DEFS}
      statusText="把左边的逻辑门拖进画布，连好线就能看到实时结果。"
    />
  );
}
