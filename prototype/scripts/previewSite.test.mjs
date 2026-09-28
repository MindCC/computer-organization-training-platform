import test from "node:test";
import assert from "node:assert/strict";

import { COURSEWARE } from "../src/courseware.js";
import { buildPreviewSite, collectPreviewFiles, renderIndexHtml } from "./previewSite.mjs";

test("预览站与源文件一致（改过演示页/课件页要重新执行 npm run preview:site）", () => {
  const result = buildPreviewSite({ check: true });

  assert.equal(result.ok, true, `预览站与源文件不一致：${result.problems.join("；")}`);
});

test("预览站首页收录了全部课堂演示，链接指向站内页面", () => {
  const html = renderIndexHtml();
  const demos = COURSEWARE.chapters.flatMap((chapter) => chapter.demos ?? []);

  assert.ok(demos.length >= 8, `课堂演示数量异常：${demos.length}`);
  for (const demo of demos) {
    const fileName = demo.href.split("/").pop();
    assert.ok(html.includes(demo.title), `首页缺少演示标题：${demo.title}`);
    assert.ok(html.includes(`href="demos/${fileName}"`), `首页缺少站内链接：demos/${fileName}`);
    assert.equal(html.includes(`href="${demo.href}"`), false, `${fileName} 仍指向平台绝对路径，静态站上会 404`);
  }
  assert.ok(html.includes('href="courseware.html"'), "首页缺少课件页入口");
});

test("预览站是自包含的：演示页只依赖同目录的 platform-link.js", () => {
  const targets = collectPreviewFiles().map((file) => file.to);

  assert.ok(targets.includes("courseware.html"));
  assert.ok(targets.includes("demos/platform-link.js"));
  assert.equal(targets.filter((target) => target.startsWith("demos/")).length, 9, "应为 8 个演示页 + platform-link.js");
  assert.equal(targets.some((target) => target.includes("..")), false);
});
