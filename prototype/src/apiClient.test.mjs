import test from "node:test";
import assert from "node:assert/strict";

import { apiRequest, ApiError } from "./apiClient.js";

test('stage validation errors preserve the failing node so the editor can select it',async()=>{
  const originalFetch=globalThis.fetch;
  try{
    globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:'INVALID_TASK',message:'第7个环节：请至少选择1道题目',stageId:'step-check',stageIndex:6}}),{status:400,headers:{'content-type':'application/json'}});
    await assert.rejects(()=>apiRequest('/api/teacher/task-library',{method:'POST',body:'{}'}),error=>error instanceof ApiError&&error.stageId==='step-check'&&error.stageIndex===6&&error.status===400);
  }finally{globalThis.fetch=originalFetch;}
});

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
