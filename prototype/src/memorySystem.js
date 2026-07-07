const DEFAULT_VALUES = [
  "00110101", "01011100", "11100001", "00001111",
  "10010010", "01101001", "11001010", "00111100",
  "10100011", "01010110", "11110000", "00011011",
  "01111110", "10000100", "00100110", "11010001",
];

function clampAddress(address) {
  return Math.max(0, Math.min(15, Number(address) || 0));
}

function toBinary(value, width) {
  return Number(value).toString(2).padStart(width, "0");
}

function normalizeByte(value) {
  const bits = String(value ?? "").replace(/[^01]/g, "");
  return bits.padEnd(8, "0").slice(0, 8);
}

export function buildMemoryAccessState({ address = 0, operation = "read", writeValue = "00000000" } = {}) {
  const normalizedAddress = clampAddress(address);
  const decodedRow = Math.floor(normalizedAddress / 4);
  const decodedColumn = normalizedAddress % 4;
  const cells = DEFAULT_VALUES.map((value, index) => ({
    address: index,
    binaryAddress: toBinary(index, 4),
    row: Math.floor(index / 4),
    column: index % 4,
    value,
    selected: index === normalizedAddress,
  }));
  const selectedCell = cells[normalizedAddress];
  const isWrite = operation === "write";
  const mdr = isWrite ? normalizeByte(writeValue) : selectedCell.value;

  return {
    address: normalizedAddress,
    operation: isWrite ? "write" : "read",
    decodedRow,
    decodedColumn,
    selectedCell,
    mar: toBinary(normalizedAddress, 4),
    mdr,
    controlBus: isWrite ? "WRITE" : "READ",
    addressBus: "A" + toBinary(normalizedAddress, 4),
    dataBus: mdr,
    cells,
    explanation: isWrite
      ? "CPU 将 " + toBinary(normalizedAddress, 4) + " 送入 MAR，译码选中第 " + (decodedRow + 1) + " 行第 " + (decodedColumn + 1) + " 列，将 MDR 数据写入该主存单元"
      : "CPU 将 " + toBinary(normalizedAddress, 4) + " 送入 MAR，译码选中第 " + (decodedRow + 1) + " 行第 " + (decodedColumn + 1) + " 列，读出数据暂存 MDR 等待 CPU 读取",
  };
}
