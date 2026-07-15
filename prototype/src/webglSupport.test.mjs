import test from "node:test";
import assert from "node:assert/strict";

import { canUseWebGL } from "./webglSupport.js";

test("returns false when canvas or context creation fails", () => {
  assert.equal(canUseWebGL(() => null), false);
  assert.equal(canUseWebGL(() => ({ getContext: () => null })), false);
  assert.equal(canUseWebGL(() => { throw new Error("blocked"); }), false);
});

test("accepts WebGL2 or WebGL", () => {
  const context = {};
  assert.equal(
    canUseWebGL(() => ({ getContext: (kind) => kind === "webgl2" ? context : null })),
    true,
  );
  assert.equal(
    canUseWebGL(() => ({ getContext: (kind) => kind === "webgl" ? context : null })),
    true,
  );
});
test("releases the temporary capability-probe context", () => {
  let released = false;
  const context = {
    getExtension: (name) => name === "WEBGL_lose_context"
      ? { loseContext: () => { released = true; } }
      : null,
  };

  assert.equal(canUseWebGL(() => ({ getContext: () => context })), true);
  assert.equal(released, true);
});