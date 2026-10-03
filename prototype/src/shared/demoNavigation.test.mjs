import test from "node:test";
import assert from "node:assert/strict";
import {HOSTED_DEMOS,hostedDemoOf,demoRedirectTarget} from "./demoNavigation.js";
test("所有课堂演示与演讲课件通过统一系统入口，内部嵌入不重定向", () => {
  for (const demo of HOSTED_DEMOS) {
    assert.equal(demoRedirectTarget(`/demos/${demo.file}`),`/?demo=${demo.id}`);
    assert.equal(demoRedirectTarget(`/demos/${demo.file}?embedded=1`),null);
    assert.equal(hostedDemoOf(demo.id).path,`/demos/${demo.file}`);
  }
  assert.equal(demoRedirectTarget("/courseware.html"),"/?demo=courseware");
  assert.equal(demoRedirectTarget("/courseware.html?embedded=1"),null);
  for (const url of ["/demos/unknown.html","/demos/platform-link.js","/api/student/chapter-practice","/?demo=intro","/demos/../intro.html"]) assert.equal(demoRedirectTarget(url),null);
  assert.equal(hostedDemoOf("https://example.com"),null);
});
