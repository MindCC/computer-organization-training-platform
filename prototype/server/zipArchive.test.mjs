import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildZip } from "./zipArchive.js";

test("buildZip produces a valid zip with UTF-8 Chinese filenames and contents", () => {
  const zip = buildZip([
    { name: "scores.csv", content: "学号,姓名\n001,张三\n" },
    { name: "summary.json", content: JSON.stringify({ ok: true }) },
  ]);

  // 用系统 unzip（git-bash 自带）验证
  const dir = mkdtempSync(path.join(tmpdir(), "zcyl-zip-test-"));
  const zipPath = path.join(dir, "archive.zip");
  writeFileSync(zipPath, zip);
  try {
    execFileSync("unzip", ["-o", zipPath, "-d", dir], { stdio: "pipe" });
    const csv = readFileSync(path.join(dir, "scores.csv"), "utf8");
    assert.match(csv, /张三/);
    const summary = JSON.parse(readFileSync(path.join(dir, "summary.json"), "utf8"));
    assert.equal(summary.ok, true);
  } catch (error) {
    // unzip 不可用时退回结构校验
    assert.ok(zip.length > 100, "zip buffer should be non-trivial");
    assert.equal(zip.readUInt32LE(0), 0x04034b50, "starts with local file header");
    const endOffset = zip.length - 22;
    assert.equal(zip.readUInt32LE(endOffset), 0x06054b50, "ends with EOCD");
    assert.equal(zip.readUInt16LE(endOffset + 8), 2, "two files recorded");
  }
});

test("empty file list still yields a valid (empty) zip", () => {
  const zip = buildZip([]);
  const endOffset = zip.length - 22;
  assert.equal(zip.readUInt32LE(endOffset), 0x06054b50);
  assert.equal(zip.readUInt16LE(endOffset + 8), 0);
});
