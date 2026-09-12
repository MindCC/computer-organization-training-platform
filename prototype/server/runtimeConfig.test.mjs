import test from "node:test";
import assert from "node:assert/strict";

import { resolvePublicBaseUrl } from "./runtimeConfig.js";

test("development server trusts the local Vite origin by default", () => {
  assert.equal(
    resolvePublicBaseUrl({ NODE_ENV: "development" }),
    "http://127.0.0.1:5173",
  );
});

test("explicit public URL and production behavior remain configurable", () => {
  assert.equal(
    resolvePublicBaseUrl({ NODE_ENV: "development", PUBLIC_BASE_URL: "https://classroom.example" }),
    "https://classroom.example",
  );
  assert.equal(resolvePublicBaseUrl({ NODE_ENV: "production" }), "");
});
