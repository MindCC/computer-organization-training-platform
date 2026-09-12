import test from "node:test";
import assert from "node:assert/strict";
import { credentialsCsv } from "./importCredentials.js";

test("credentials csv neutralizes spreadsheet formula payloads", () => {
  const csv = credentialsCsv([
    { username: "s001", displayName: "张三", password: "Zcyl-abc123" },
    { username: "s002", displayName: "=cmd|'/c calc'!A0", password: "@SUM(1+1)" },
  ]);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "学号,姓名,初始密码");
  assert.equal(lines[1], "s001,张三,Zcyl-abc123");
  assert.match(lines[2], /^s002,'=cmd/);
  assert.match(lines[2], /'@SUM/);
});

test("credentials csv quotes cells containing separators and quotes", () => {
  const csv = credentialsCsv([{ username: "s003", displayName: '李"四", A', password: "p,3" }]);
  assert.equal(csv.split("\r\n")[1], 's003,"李""四"", A","p,3"');
});

test("credentials csv keeps the header when nothing was imported", () => {
  assert.equal(credentialsCsv([]), "学号,姓名,初始密码");
});
