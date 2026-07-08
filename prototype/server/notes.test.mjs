import test from "node:test";
import assert from "node:assert/strict";

import {
  createNote,
  createUser,
  deleteNote,
  listNotes,
  migrate,
  openDatabase,
  updateNote,
} from "./db.js";

function makeDb() {
  const db = openDatabase(":memory:");
  migrate(db);
  return db;
}

test("notes support challenge association, search, update and owner-scoped delete", () => {
  const db = makeDb();
  const student = createUser(db, {
    username: "2026001",
    displayName: "李同学",
    role: "student",
    passwordHash: "hash",
  });
  const other = createUser(db, {
    username: "2026002",
    displayName: "王同学",
    role: "student",
    passwordHash: "hash",
  });

  const note = createNote(db, student.id, {
    title: "补码复盘",
    content: "负数补码先取反再加一。",
    tag: "机器数",
    challengeId: "machine-number",
  });
  createNote(db, student.id, {
    title: "全加器",
    content: "进位链路需要同时看两个半加器。",
    tag: "运算器",
    challengeId: "full-adder",
  });
  createNote(db, other.id, {
    title: "别人的笔记",
    content: "不应该被看到。",
    tag: "课堂",
    challengeId: "data-flow",
  });

  assert.equal(note.challengeId, "machine-number");
  assert.equal(listNotes(db, student.id, { query: "补码" }).length, 1);
  assert.equal(listNotes(db, student.id, { tag: "运算器" })[0].challengeId, "full-adder");
  assert.equal(listNotes(db, student.id, { challengeId: "machine-number" })[0].title, "补码复盘");

  const updated = updateNote(db, student.id, note.id, {
    title: "补码错题复盘",
    content: "先判断符号位，再做取反加一。",
    tag: "错题",
    challengeId: "machine-number",
  });
  assert.equal(updated.title, "补码错题复盘");
  assert.equal(updated.tag, "错题");
  assert.equal(updateNote(db, other.id, note.id, { title: "越权" }), null);

  assert.equal(deleteNote(db, other.id, note.id), false);
  assert.equal(deleteNote(db, student.id, note.id), true);
  assert.equal(listNotes(db, student.id, { query: "错题复盘" }).length, 0);
});
