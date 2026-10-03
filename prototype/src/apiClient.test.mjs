import test from "node:test";
import assert from "node:assert/strict";

import { apiRequest, ApiError } from "./apiClient.js";

test('legacy HTTP errors retain their status so expired sessions differ from service failures',async()=>{
  const originalFetch=globalThis.fetch;
  try {
    for(const status of [401,503]) {
      globalThis.fetch=async()=>new Response(JSON.stringify({error:status===401?'请先登录':'服务暂时不可用'}),{status,headers:{'content-type':'application/json'}});
      await assert.rejects(()=>apiRequest('/api/auth/me'),error=>error instanceof ApiError && error.status===status);
    }
  } finally {globalThis.fetch=originalFetch;}
});

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
