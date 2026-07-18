import test from "node:test";
import assert from "node:assert/strict";

import { createLoginFailureTracker, isTrustedRequestOrigin } from "./security.js";

test("origin comparison rejects prefix lookalikes and accepts exact origin", () => {
  const req = {
    protocol: "https",
    headers: { host: "school.example", origin: "https://school.example.evil" },
  };
  assert.equal(isTrustedRequestOrigin(req, "https://school.example"), false);
  req.headers.origin = "https://school.example";
  assert.equal(isTrustedRequestOrigin(req, "https://school.example"), true);
});

test("login failure window restarts after expiry", () => {
  let clock = 1_000;
  const tracker = createLoginFailureTracker({
    maxFailures: 2,
    windowMs: 100,
    maxEntries: 10,
    now: () => clock,
  });
  tracker.recordFailure("student");
  tracker.recordFailure("student");
  assert.equal(tracker.check("student").blocked, true);
  clock += 101;
  assert.equal(tracker.check("student").blocked, false);
  assert.equal(tracker.recordFailure("student").remaining, 1);
});

test("login failure tracker stays bounded", () => {
  const tracker = createLoginFailureTracker({
    maxFailures: 5,
    windowMs: 60_000,
    maxEntries: 2,
    now: () => 1_000,
  });
  tracker.recordFailure("a");
  tracker.recordFailure("b");
  tracker.recordFailure("c");
  assert.equal(tracker.size(), 2);
});
