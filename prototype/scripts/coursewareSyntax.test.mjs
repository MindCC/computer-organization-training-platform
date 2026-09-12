import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("interactive courseware script parses successfully", () => {
  const html = readFileSync(new URL("../public/courseware.html", import.meta.url), "utf8");
  const scriptStart = html.indexOf("<script>");
  const scriptEnd = html.lastIndexOf("</script>");
  assert.ok(scriptStart >= 0 && scriptEnd > scriptStart, "courseware must contain an inline script");
  assert.doesNotThrow(() => new Function(html.slice(scriptStart + "<script>".length, scriptEnd)));
});
