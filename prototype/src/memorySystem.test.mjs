import test from "node:test";
import assert from "node:assert/strict";
import { buildMemoryAccessState } from "./memorySystem.js";

test("read access exposes MAR, decoder, selected cell, MDR, and data bus", () => {
  const state = buildMemoryAccessState({ address: 6, operation: "read" });

  assert.equal(state.mar, "0110");
  assert.equal(state.decodedRow, 1);
  assert.equal(state.decodedColumn, 2);
  assert.equal(state.selectedCell.address, 6);
  assert.equal(state.controlBus, "READ");
  assert.equal(state.mdr, state.selectedCell.value);
  assert.equal(state.dataBus, state.selectedCell.value);
  assert.equal(state.cells.filter((cell) => cell.selected).length, 1);
});

test("write access changes MDR and data bus to the write value", () => {
  const state = buildMemoryAccessState({ address: 9, operation: "write", writeValue: "10101100" });

  assert.equal(state.mar, "1001");
  assert.equal(state.decodedRow, 2);
  assert.equal(state.decodedColumn, 1);
  assert.equal(state.controlBus, "WRITE");
  assert.equal(state.mdr, "10101100");
  assert.equal(state.dataBus, "10101100");
  assert.equal(state.selectedCell.address, 9);
});
