import test from "node:test";
import assert from "node:assert/strict";

import { clearViewSession, readViewSession, resolveRestorableView, writeViewSession } from "./viewSession.js";

function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
    snapshot: () => Object.fromEntries(data),
  };
}

test("view session round-trips through storage", () => {
  const storage = makeStorage();
  writeViewSession({ view: "lab", challengeId: "full-adder" }, storage);
  assert.deepEqual(readViewSession(storage), { view: "lab", challengeId: "full-adder" });
  clearViewSession(storage);
  assert.equal(readViewSession(storage), null);
});

test("view session ignores malformed payloads and hostile challenge ids", () => {
  assert.equal(readViewSession(makeStorage({ "zcyl:view-session": "not json" })), null);
  assert.equal(readViewSession(makeStorage({ "zcyl:view-session": JSON.stringify({ view: 42 }) })), null);
  const withHostileId = makeStorage({
    "zcyl:view-session": JSON.stringify({ view: "lab", challengeId: "../../etc/passwd" }),
  });
  assert.deepEqual(readViewSession(withHostileId), { view: "lab", challengeId: null });
});

test("restoring a view respects the current role", () => {
  const labSession = { view: "lab", challengeId: "alu" };
  assert.deepEqual(resolveRestorableView(labSession, "student"), labSession);
  assert.equal(resolveRestorableView(labSession, "teacher"), null);
  assert.equal(resolveRestorableView(labSession, null), null);

  const teacherSession = { view: "teacher", challengeId: null };
  assert.deepEqual(resolveRestorableView(teacherSession, "teacher"), teacherSession);
  assert.equal(resolveRestorableView(teacherSession, "student"), null);

  // 教师的落地页是看板：登录过程中的 "home" 中间值不能把教师带到学生首页
  assert.equal(resolveRestorableView({ view: "home", challengeId: null }, "teacher"), null);
  assert.deepEqual(resolveRestorableView({ view: "home", challengeId: null }, "student"), { view: "home", challengeId: null });

  assert.deepEqual(resolveRestorableView({ view: "courseware", challengeId: null }, null), { view: "courseware", challengeId: null });
});

test("storage failures degrade quietly", () => {
  const broken = {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("quota"); },
    removeItem: () => { throw new Error("denied"); },
  };
  assert.equal(readViewSession(broken), null);
  assert.doesNotThrow(() => writeViewSession({ view: "home" }, broken));
  assert.doesNotThrow(() => clearViewSession(broken));
});
