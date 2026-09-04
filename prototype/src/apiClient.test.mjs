import test from "node:test";
import assert from "node:assert/strict";

import { apiRequest } from "./apiClient.js";

test("does not retry a failed POST because it may already have changed server state", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new TypeError("response lost after server commit");
  };
  try {
    await assert.rejects(
      () => apiRequest("/api/student/notes", { method: "POST", body: JSON.stringify({ content: "draft" }) }),
      /response lost/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
