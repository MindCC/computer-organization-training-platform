import test from "node:test";
import assert from "node:assert/strict";
import { passwordStrength } from "./passwordStrength.js";

test("short password is weak", () => {
  assert.equal(passwordStrength("abc123").score, "weak");
});

test("8+ chars with letters and digits is medium", () => {
  assert.equal(passwordStrength("student123").score, "medium");
  assert.equal(passwordStrength("Student1234").score, "medium");
});

test("10+ chars with letters digits special is strong", () => {
  assert.equal(passwordStrength("Student123!abc").score, "strong");
});

test("strong requires all three categories", () => {
  assert.equal(passwordStrength("aaaaaaaaaa").score, "weak", "letters only is weak");
  assert.equal(passwordStrength("abcdef1234").score, "medium", "no special char caps at medium");
  assert.equal(passwordStrength("abcdef1234!").score, "strong");
});

test("empty password is weak", () => {
  assert.equal(passwordStrength("").score, "weak");
});
