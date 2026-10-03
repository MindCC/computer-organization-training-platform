import { GATE_DEFS, GateAssemblyCanvas, makeGateNode } from "./GateAssemblyCanvas.jsx";
import { getUnlockedChips } from '../circuit/chipDefinitions.js';

function starterNodes() {
  return [
    makeGateNode(GATE_DEFS.find((def) => def.kind === "input"), { x: 40, y: 60 }),
    makeGateNode(GATE_DEFS.find((def) => def.kind === "input"), { x: 40, y: 220 }),
    makeGateNode(GATE_DEFS.find((def) => def.kind === "and"), { x: 340, y: 130 }),
    makeGateNode(GATE_DEFS.find((def) => def.kind === "output"), { x: 640, y: 130 }),
  ];
}

/** 逻辑门沙盒：自由拼装练习（不计分）。装配与仿真全部复用 GateAssemblyCanvas。 */
export function LogicGateSandbox({progress={}}) {
  const chips=getUnlockedChips(progress).map(chip=>({kind:`chip:${chip.id}`,componentType:`chip:${chip.id}`,label:chip.label,icon:'IC',desc:chip.description,ports:chip.ports.map(p=>({...p,signal:'bit',width:1}))}));
  return (
    <GateAssemblyCanvas
      initialNodes={starterNodes()}
      paletteDefs={[...GATE_DEFS,...chips]}
      statusText={`把逻辑门拖进画布，连好线观察结果。已解锁 ${chips.length} 个可复用元件；沙盒不计分。`}
    />
  );
}
