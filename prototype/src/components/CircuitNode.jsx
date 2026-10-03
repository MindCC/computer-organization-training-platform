import { Handle, Position } from "@xyflow/react";

function portOffset(index, total) {
  if (total <= 1) return 63;
  return 42 + (42 * index) / Math.max(1, total - 1);
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
  nand: "&○",
  fullAdder: "Σ",
  mux2: "MUX",
  alu1: "ALU",
};

function GateSymbol({type}) {
  const inverted=type==='not'||type==='nand';
  return <svg className="circuit-gate-symbol" viewBox="0 0 72 54" aria-hidden="true">
    {['and','nand'].includes(type)?<><path d="M10 7H29C56 7 56 47 29 47H10Z"/>{inverted&&<circle cx="55" cy="27" r="5"/>}</>:
      ['or','xor'].includes(type)?<><path d="M13 7Q42 7 59 27Q42 47 13 47Q28 27 13 7Z"/>{type==='xor'&&<path d="M7 7Q22 27 7 47"/>}</>:
      ['buffer','not'].includes(type)?<><path d="M15 7L52 27L15 47Z"/>{inverted&&<circle cx="58" cy="27" r="5"/>}</>:
      <><rect x="9" y="7" width="54" height="40" rx="5"/><text x="36" y="32" textAnchor="middle">{TYPE_GLYPH[type]??'IC'}</text></>}
  </svg>;
}

export function CircuitNode({ data, selected }) {
  const inputPorts = (data.ports ?? []).filter((port) => port.direction === "in");
  const outputPorts = (data.ports ?? []).filter((port) => port.direction === "out");
  // 芯片节点（chip:xxx）统一用 IC 方块字形，其它按类型映射
  const glyph = data.componentType?.startsWith("chip:") ? "IC" : (TYPE_GLYPH[data.componentType] ?? "IC");
  const isInput=data.componentType==='input',isOutput=data.componentType==='output';
  const signal=data.portValues?.[(isInput?outputPorts:inputPorts)[0]?.id];
  const signalText=Number.isFinite(signal)?String(signal):'?';
  const wordPort=(isInput?outputPorts:inputPorts)[0];
  const isWord=(wordPort?.width??1)>1;
  const binary=Number.isInteger(signal)&&signal>=0?signal.toString(2).padStart(wordPort?.width??1,'0'):'?';
  const valueChip = (portId) => {
    const value = data.portValues?.[portId];
    if (value === undefined || value === null) return null;
    const tone = Number.isFinite(value) ? value===0?'zero':'one' : "unknown";
    return <em className={`circuit-flow-port-value signal-${tone}`}>{Number.isFinite(value) ? value : "?"}</em>;
  };

  return (
    <div className={`circuit-flow-node ${selected ? "selected" : ""}`} data-component-type={data.componentType} style={{minHeight:Math.max(140,70+Math.max(inputPorts.length,outputPorts.length)*26)}}>
      <div className="circuit-flow-node-head">
        <span className="circuit-flow-node-glyph" aria-hidden="true">{glyph}</span>
        <div className="circuit-flow-node-title">
          <strong title={data.label}>{data.label}</strong>
        </div>
      </div>

      <div className="circuit-node-device">
        {isInput&&data.inputControl?<label className="circuit-word-input nodrag nopan" onClick={event=>event.stopPropagation()}><small>{data.inputControl.options?'选择操作':'设置整数'}</small>{data.inputControl.options?<select aria-label={data.label} value={Number.isFinite(signal)?signal:data.inputControl.min} onChange={event=>data.onValueChange?.(Number(event.target.value))}>{data.inputControl.options.map((label,index)=><option key={index} value={index+data.inputControl.min}>{label}</option>)}</select>:<input aria-label={data.label} type="number" step="1" min={data.inputControl.min} max={data.inputControl.max} value={Number.isFinite(signal)?signal:data.inputControl.min} onChange={event=>{const value=Number(event.target.value);if(event.target.value!==''&&Number.isInteger(value)&&value>=data.inputControl.min&&value<=data.inputControl.max)data.onValueChange?.(value);}}/>}</label>:
          isInput?<button className={'circuit-input-switch nodrag nopan'+(signal===1?' on':'')} type="button" aria-label={`${data.label}开关，当前 ${signalText}`} aria-pressed={signal===1} onClick={event=>{event.stopPropagation();data.onToggle?.();}}><span/><b>{signalText}</b></button>:
          isOutput&&isWord?<output className="circuit-word-output" aria-label={`输出 ${signalText}`}><b>{binary}</b><small>十进制 {signalText}</small></output>:
          isOutput?<span className={'circuit-output-lamp signal-'+(signal===1?'one':signal===0?'zero':'unknown')} role="img" aria-label={`输出 ${signalText}`}><span/><b>{signalText}</b></span>:
          <GateSymbol type={data.componentType}/>}
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
          <span title={port.label}>{port.label}</span>
          {valueChip(port.id)}
        </div>
      ))}

      {outputPorts.map((port, index) => (
        <div className="circuit-flow-port-row output" key={port.id} style={{ top: `${portOffset(index, outputPorts.length)}%` }}>
          {valueChip(port.id)}
          <span title={port.label}>{port.label}</span>
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
