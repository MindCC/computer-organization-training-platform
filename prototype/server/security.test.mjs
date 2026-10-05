import test from "node:test";
import assert from "node:assert/strict";

import { createLoginFailureTracker, isTrustedRequestOrigin, sanitizeProfile } from "./security.js";

test("origin comparison rejects prefix lookalikes and accepts exact origin", () => {
  const req = {
    protocol: "https",
    headers: { host: "school.example", origin: "https://school.example.evil" },
  };
  assert.equal(isTrustedRequestOrigin(req, "https://school.example"), false);
  req.headers.origin = "https://school.example";
  assert.equal(isTrustedRequestOrigin(req, "https://school.example"), true);
});

test("local development accepts Vite's next available port on loopback", () => {
  const req = {
    protocol: "http",
    headers: { host: "127.0.0.1:8787", origin: "http://127.0.0.1:5175" },
  };
  assert.equal(isTrustedRequestOrigin(req, "http://127.0.0.1:5173"), true);
});

test("local direct preview accepts only its exact request origin alongside Vite", () => {
  for (const host of ["127.0.0.1:8791", "localhost:8791", "[::1]:8791"]) {
    const req = { protocol: "http", headers: { host, origin: `http://${host}` } };
    assert.equal(isTrustedRequestOrigin(req, "http://127.0.0.1:5173"), true);
    req.headers.origin = "http://127.0.0.1:8792";
    assert.equal(isTrustedRequestOrigin(req, "http://127.0.0.1:5173"), false);
    req.headers.origin = "https://attacker.example";
    assert.equal(isTrustedRequestOrigin(req, "http://127.0.0.1:5173"), false);
  }
});

test("direct preview exception does not relax explicit public URLs or remote hosts", () => {
  const req = { protocol: "http", headers: { host: "127.0.0.1:8791", origin: "http://127.0.0.1:8791" } };
  assert.equal(isTrustedRequestOrigin(req, "https://school.example"), false);
  req.headers.host = "school.example";
  req.headers.origin = "http://school.example";
  assert.equal(isTrustedRequestOrigin(req, "http://127.0.0.1:5173"), false);
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

test("sanitizeProfile removes recoverable password fields", () => {
  assert.deepEqual(
    sanitizeProfile({
      initialPassword: "Student123!",
      goal: "finish course",
      mustChangePassword: true,
    }),
    { goal: "finish course", mustChangePassword: true },
  );
});
