export function MemorySystemPanel({ state, address, operation, writeValue, onAddressChange, onOperationChange, onWriteValueChange }) {
  return (
    <section className="memory-system-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">简化存储系统</span>
          <h2>设置地址与译码 MDR 数据通路</h2>
          <p>{state.explanation}</p>
        </div>
      </div>

      <div className="memory-controls">
        <label className="memory-address-control">
          <span>MAR地址 {state.mar}</span>
          <input type="range" min="0" max="15" value={address} onChange={(event) => onAddressChange(Number(event.target.value))} />
        </label>
        <div className="segmented-control" aria-label="操作模式">
          <button className={operation === "read" ? "active" : ""} onClick={() => onOperationChange("read")} type="button">读</button>
          <button className={operation === "write" ? "active" : ""} onClick={() => onOperationChange("write")} type="button">写</button>
        </div>
        <label className="memory-write-control">
          <span>写入数据</span>
          <input value={writeValue} onChange={(event) => onWriteValueChange(event.target.value)} maxLength={8} aria-label="写入数据" />
        </label>
      </div>

      <div className="memory-bus-strip">
        <span>MAR <strong>{state.mar}</strong></span>
        <span>地址译码 <strong>R{state.decodedRow + 1} / C{state.decodedColumn + 1}</strong></span>
        <span>控制总线 <strong>{state.controlBus}</strong></span>
        <span>MDR <strong>{state.mdr}</strong></span>
        <span>数据总线 <strong>{state.dataBus}</strong></span>
      </div>

      <div className="memory-matrix" aria-label="存储单元矩阵">
        {state.cells.map((cell) => (
          <div className={cell.selected ? "memory-cell selected" : "memory-cell"} key={cell.address}>
            <small>{cell.binaryAddress}</small>
            <strong>{cell.selected && operation === "write" ? state.mdr : cell.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
