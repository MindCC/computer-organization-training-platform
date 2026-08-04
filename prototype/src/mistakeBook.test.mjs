import test from "node:test";
import assert from "node:assert/strict";
import { buildMistakeBook, renderMistakeCsv } from "./mistakeBook.js";

const titles = { "and-gate": "与门", "full-adder": "全加器", "alu": "简化 ALU" };

test("only failed attempts with errors count as mistakes", () => {
  const book = buildMistakeBook([
    { challengeId: "and-gate", passed: false, errors: ["接线错误"], score: 40, createdAt: "2026-07-01T10:00:00Z" },
    { challengeId: "and-gate", passed: true, errors: [], score: 90, createdAt: "2026-07-02T10:00:00Z" },
    { challengeId: "full-adder", passed: false, errors: [], score: 60, createdAt: "2026-07-03T10:00:00Z" },
    { challengeId: "alu", passed: false, errors: ["控制位缺失"], score: 30, createdAt: "2026-07-04T10:00:00Z" },
  ], titles);
  assert.equal(book.overview.totalMistakes, 2, "passed=true and empty-errors attempts are not mistakes");
  assert.equal(book.items.length, 2);
});

test("same error type merges with count and recent snapshots", () => {
  const book = buildMistakeBook([
    { challengeId: "and-gate", passed: false, errors: ["接线错误"], score: 40, createdAt: "2026-07-01T10:00:00Z" },
    { challengeId: "and-gate", passed: false, errors: ["接线错误"], score: 55, createdAt: "2026-07-05T10:00:00Z" },
    { challengeId: "and-gate", passed: false, errors: ["接线错误"], score: 70, createdAt: "2026-07-08T10:00:00Z" },
    { challengeId: "and-gate", passed: false, errors: ["接线错误"], score: 80, createdAt: "2026-07-09T10:00:00Z" },
  ], titles);
  assert.equal(book.items.length, 1);
  assert.equal(book.items[0].count, 4);
  assert.equal(book.items[0].errorType, "接线错误");
  assert.equal(book.items[0].challengeTitle, "与门");
  assert.equal(book.items[0].snapshots.length, 3, "snapshots capped at recent 3");
  assert.equal(book.items[0].snapshots[0].score, 80, "newest snapshot first");
});

test("overview reports totals and top error type", () => {
  const book = buildMistakeBook([
    { challengeId: "and-gate", passed: false, errors: ["接线错误"], score: 40, createdAt: "2026-07-01T10:00:00Z" },
    { challengeId: "and-gate", passed: false, errors: ["接线错误"], score: 45, createdAt: "2026-07-02T10:00:00Z" },
    { challengeId: "full-adder", passed: false, errors: ["进位缺失"], score: 50, createdAt: "2026-07-03T10:00:00Z" },
  ], titles);
  assert.equal(book.overview.totalMistakes, 3);
  assert.equal(book.overview.challengeCount, 2);
  assert.equal(book.overview.topErrorType, "接线错误");
});

test("empty attempts yields empty mistake book with zeroed overview", () => {
  const book = buildMistakeBook([], titles);
  assert.equal(book.overview.totalMistakes, 0);
  assert.equal(book.overview.challengeCount, 0);
  assert.equal(book.overview.topErrorType, null);
  assert.equal(book.items.length, 0);
});

test("csv export includes header and rows", () => {
  const book = buildMistakeBook([
    { challengeId: "and-gate", passed: false, errors: ["接线错误"], score: 40, createdAt: "2026-07-01T10:00:00Z" },
  ], titles);
  const csv = renderMistakeCsv(book.items);
  assert.match(csv, /关卡,错误类型,频次/);
  assert.match(csv, /与门,接线错误,1/);
});
