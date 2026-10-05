/**
 * 知识库（LLMWiki 式学习笔记）E2E 验收（2026-10-15）：
 * 登录演示学生 → 进知识库页 → 上传含明确关键词的 .md → 文档列表出现且有摘要/关键词
 * → 展开要点 → UI 检索关键词命中（含高亮/关联要点）→ API 直连断言 search 命中块
 * → 删除文档 → UI 与 API 均消失（索引级联清理）。
 *
 * 前置：API(8787) 与 Vite(5173) 已启动，演示班级已 seed。
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { clickTopNavItem } from "./nav-helpers.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));
const { chromium } = require("playwright");

const BASE_URL = process.env.PROTOTYPE_APP_URL ?? process.env.QA_BASE_URL ?? "http://127.0.0.1:5173";
const API_URL = process.env.PROTOTYPE_API_URL ?? process.env.QA_API_URL ?? "http://127.0.0.1:8787";
const ARTIFACT_DIR = fileURLToPath(new URL("../qa-artifacts/", import.meta.url));
mkdirSync(ARTIFACT_DIR, { recursive: true });

const DOC_TITLE = "存储系统复习要点-紫晶缓存协议";
// 文档标题取自上传文件名：夹具文件名直接用中文标题，顺带覆盖中文文件名全链路
const FIXTURE_PATH = `${ARTIFACT_DIR}/${DOC_TITLE}.md`;
const FIXTURE = `# 存储系统复习要点：紫晶缓存协议

本章围绕高速缓存（Cache）与主存的协同工作展开，重点记录一种课堂讨论的假设协议——紫晶缓存协议（AmethystCache）。这个协议是本课程复习的核心线索，串联起缓存结构、写策略与一致性维护三块内容。

紫晶缓存协议的核心思想是在 MESI 协议基础上增加一个预取挂起状态，用于标记那些被预取但尚未被任何核访问的缓存行。当总线上出现对该行的读请求时，持有行直接进行写回，避免伪共享带来的性能抖动。

Cache 与主存之间的数据交换以块（Block）为单位，块大小通常为 64 字节。地址映射方式包括直接映射、全相联映射与组相联映射。组相联映射兼顾命中率与硬件开销，是现代处理器的主流选择。

写策略分为写直达与写回。写回策略配合脏位可以减少总线流量。紫晶缓存协议在写回路径上要求先检查预取挂起队列，再决定是否需要广播无效化消息，这一步是它区别于 MESI 的关键工程取舍。

替换算法方面，LRU 需要维护访问顺序链表，硬件代价高；随机替换实现简单但命中率不稳定。实验表明在四路组相联下，伪 LRU 是一种工程折中，教科书普遍推荐作为默认方案。

内存墙问题促使多级缓存结构出现：L1 分指令缓存与数据缓存，L2 统一缓存，L3 多核共享。缓存一致性协议（如 MESI、MOESI 与紫晶缓存协议）保证多核视角下内存语义正确，是多核处理器设计的基础。

总线仲裁决定了多个主设备同时请求总线时的优先级，常见方案有链式查询、计数器定时查询与独立请求。集中式仲裁逻辑简单，分布式仲裁可靠性更高，复习时注意与中断判优对比记忆。`;
writeFileSync(FIXTURE_PATH, FIXTURE, "utf8");

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, passed: Boolean(condition), detail });
  console.log(`${condition ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
}

let browser;
try { browser = await chromium.launch({channel:"msedge",headless:true}); } catch { browser = await chromium.launch({headless:true}); }
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const pageErrors = []; page.on("pageerror",error => pageErrors.push(error.message));

  // 0. 登录演示学生
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.locator("#login-username").fill("demo2026001");
  await page.locator("#login-password").fill("Student123!");
  await page.locator(".login-submit").click();
  await page.waitForSelector(".project-chapter-board", { timeout: 15000 });
  check("登录演示学生", true);

  // 0b. rerun 安全：清空演示学生的知识库旧文档（含历史崩溃运行残留），保证检索命中唯一
  const preDocs = (await (await page.request.get(`${API_URL}/api/student/knowledge/documents`)).json()).documents ?? [];
  for (const old of preDocs) {
    await page.request.delete(`${API_URL}/api/student/knowledge/documents/${old.id}`);
  }

  // 1. 进入知识库页（路由 id 仍为 notes，nav 文案为「知识库」）
  await clickTopNavItem(page, "知识库");
  await page.waitForSelector(".kb-layout", { timeout: 15000 });
  check("知识库显示左侧工具栏、文件侧栏与主阅读区",
    await page.locator(".kb-ribbon").count() === 1
    && await page.locator(".kb-vault-sidebar").count() === 1
    && await page.locator(".kb-documents-panel").count() === 1);

  // 2. 上传 .md 测试文件 → 等待分析结果卡
  await page.locator(".kb-ribbon").getByRole("button",{name:"上传文档",exact:true}).click();
  await page.setInputFiles(".kb-file-input", FIXTURE_PATH);
  await page.locator(".kb-upload-submit").click();
  await page.waitForSelector(".kb-upload-result", { timeout: 60000 });
  const resultText = await page.locator(".kb-upload-result").innerText();
  check("上传后显示解析/分析结果卡", resultText.includes(DOC_TITLE), resultText.split("\n")[0]);
  check("结果卡含摘要", /已入库/.test(resultText) && resultText.length > 40);
  check("结果卡含关键词 chips", await page.locator(".kb-upload-result .kb-keyword-chip").count() >= 3);
  check("结果卡显示知识块数（≥2 块）", /[2-9]\d* 个知识块/.test(resultText), resultText.match(/\d+ 个知识块/)?.[0] ?? "无");

  // 3. 文档列表：标题、块数、摘要、关键词、要点、删除按钮
  await page.getByRole("button",{name:"阅读这份文档",exact:true}).click();
  const docCard = page.locator(".kb-doc-card", { hasText: DOC_TITLE }).first();
  await docCard.waitFor({ state: "visible", timeout: 10000 });
  const cardText = await docCard.innerText();
  check("主阅读区显示文档标题与摘要，侧栏选中对应文件", (await page.locator(".kb-documents-panel h1").innerText()) === DOC_TITLE && cardText.length > 60 && (await page.locator('.kb-file-entry[aria-current="page"]').innerText()).includes(DOC_TITLE));
  check("文档卡显示块数与 MD 类型徽标", /块/.test(cardText) && (await docCard.locator(".kb-badge.type").innerText()) === "MD");
  check("文档卡含关键词 chips", await docCard.locator(".kb-keyword-chip").count() >= 3);

  // 4. 要点展开
  await docCard.locator(".kb-points-toggle").click();
  const pointCount = await docCard.locator(".kb-points-list li").count();
  check("要点可展开且 ≥3 条", pointCount >= 3, `${pointCount} 条`);

  // 5. UI 检索：命中块 + 高亮 + 关联要点
  await page.locator(".kb-ribbon").getByRole("button",{name:"全文检索",exact:true}).click();
  await page.locator(".kb-search-input").fill("紫晶缓存");
  await page.locator(".kb-search-submit").click();
  await page.waitForSelector(".kb-hit-card", { timeout: 10000 });
  const hitCards = page.locator(".kb-hit-card");
  const firstHit = hitCards.first();
  const hitText = await firstHit.innerText();
  check("UI 检索「紫晶缓存」命中知识块", await hitCards.count() >= 1 && hitText.includes(DOC_TITLE));
  check("命中片段含 <mark> 高亮", await firstHit.locator("mark").count() >= 1);
  check("命中块显示关联要点", (await firstHit.locator(".kb-hit-point").count()) === 1
    && (await firstHit.locator(".kb-hit-point").innerText()).length > 5);
  await page.screenshot({ path: `${ARTIFACT_DIR}/knowledge-base.png`, fullPage: true });

  // 6. API 直连断言 search 端点返回命中块
  const apiSearch = await (await page.request.get(`${API_URL}/api/student/knowledge/search?q=${encodeURIComponent("紫晶缓存")}`)).json();
  const apiHit = (apiSearch.hits ?? [])[0];
  check("API search 返回命中块（含文档名与片段）",
    (apiSearch.hits ?? []).length >= 1 && apiHit.documentTitle === DOC_TITLE && apiHit.snippet.includes("紫晶"),
    `${(apiSearch.hits ?? []).length} hits`);
  check("API 命中块含块序号", Number.isInteger(apiHit.chunkIndex));

  // 6b. API 详情：分析 + 块数
  const apiDocs = (await (await page.request.get(`${API_URL}/api/student/knowledge/documents`)).json()).documents ?? [];
  const uploaded = apiDocs.find((item) => item.title === DOC_TITLE);
  const apiDetail = (await (await page.request.get(`${API_URL}/api/student/knowledge/documents/${uploaded.id}`)).json()).document;
  check("API 文档详情含分析（摘要/要点/关键词）与分块",
    Boolean(apiDetail) && apiDetail.chunkCount >= 2 && apiDetail.analysis.summary.length > 10
    && apiDetail.analysis.keyPoints.length >= 3 && apiDetail.analysis.keywords.length >= 3
    && apiDetail.chunks.length === apiDetail.chunkCount);

  // 7. 删除：UI 两步确认 → 卡片消失；API 文档与索引同步消失
  await firstHit.getByRole("button",{name:"打开对应原文",exact:true}).click();
  await page.waitForSelector(".kb-reading-chunk",{timeout:10000});
  check("搜索结果定位到实际原文片段", await page.locator(".kb-reading-chunk").count() === 1 && (await page.locator(".kb-reading-chunk").innerText()).includes("紫晶缓存"));
  await page.getByRole("button",{name:"查看全部正文",exact:true}).click();
  check("正文视图显示真实完整分块", await page.locator(".kb-reading-chunk").count() === apiDetail.chunkCount);
  await page.getByRole("tab",{name:"摘要与要点",exact:true}).click();

  // Actual second upload makes file switching and grouping observable.
  await page.locator(".kb-ribbon").getByRole("button",{name:"上传文档",exact:true}).click();
  await page.setInputFiles(".kb-file-input",{name:"指令流水线-验收.txt",mimeType:"text/plain",buffer:Buffer.from("流水线将指令划分为取指、译码、执行、访存和写回。数据冒险可以通过旁路和停顿解决。控制冒险可以通过分支预测降低影响。", "utf8")});
  await page.locator(".kb-upload-submit").click();
  await page.waitForSelector(".kb-upload-result",{timeout:60000});
  await page.getByRole("button",{name:"阅读这份文档",exact:true}).click();
  check("侧栏按真实文件类型分组", await page.locator(".kb-file-folder").count() === 2 && await page.locator(".kb-file-entry").count() === 2);
  await page.getByRole("textbox",{name:"筛选文档名称"}).fill("流水线");
  check("侧栏文件名称筛选可用", await page.locator(".kb-file-entry").count() === 1 && (await page.locator(".kb-file-entry").innerText()).includes("流水线"));
  await page.getByRole("textbox",{name:"筛选文档名称"}).fill("");
  await page.locator(".kb-file-entry").filter({hasText:DOC_TITLE}).focus();
  await page.keyboard.press("Enter");
  check("侧栏键盘切换文件会更新主阅读区", (await page.locator(".kb-documents-panel h1").innerText()) === DOC_TITLE);
  await page.getByRole("button",{name:"收起文件侧栏",exact:true}).click();
  check("左侧文件导航可以收起", await page.locator(".kb-vault-sidebar").count() === 0);
  await page.getByRole("button",{name:"展开文件侧栏",exact:true}).click();
  check("侧栏可以重新展开且选中文件保留", await page.locator('.kb-file-entry[aria-current="page"]').count() === 1);
  const folder = page.locator(".kb-folder-toggle").filter({hasText:"TXT 文档"});
  await folder.click(); check("文件分组支持折叠", await folder.getAttribute("aria-expanded") === "false"); await folder.click();
  const pointToggle = docCard.locator(".kb-points-toggle");
  if (await pointToggle.getAttribute("aria-expanded") === "true") await pointToggle.click();
  for (const width of [1366,1093,768,390,320]) {
    await page.setViewportSize({width,height:width<500?844:768});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} px 不应出现页面横向溢出`);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`${ARTIFACT_DIR}/knowledge-obsidian-${width}.png`,fullPage:true});
  }
  check("五种窗口宽度无页面横向溢出",true);
  await page.reload();await page.waitForSelector(".kb-vault",{timeout:15000});
  if (await page.locator(".kb-vault-sidebar").count() === 0) await page.getByRole("button",{name:"展开文件侧栏",exact:true}).click();
  await page.locator(".kb-file-entry").filter({hasText:DOC_TITLE}).click();
  await page.locator(".kb-ribbon").getByRole("button",{name:"全文检索",exact:true}).click();
  await page.locator(".kb-search-input").fill("紫晶缓存"); await page.locator(".kb-search-submit").click();
  await page.locator(".kb-hit-open").first().click(); await page.waitForSelector(".kb-reading-chunk");
  await docCard.locator(".kb-delete-button").click();
  await docCard.locator(".kb-confirm-delete").click();
  await page.waitForFunction(
    (title) => document.querySelector(".kb-documents-panel h1")?.textContent !== title
      && ![...document.querySelectorAll(".kb-doc-card")].some((card) => card.textContent.includes(title)),
    DOC_TITLE,
    { timeout: 10000 },
  );
  check("删除后文档卡从列表消失", true);
  check("删除正在阅读的检索文档后切回有效资料", (await page.locator(".kb-documents-panel h1").innerText()) === "指令流水线-验收" && (await page.locator(".kb-doc-summary").innerText()).includes("流水线"));
  const afterDocs = (await (await page.request.get(`${API_URL}/api/student/knowledge/documents`)).json()).documents ?? [];
  const afterSearch = (await (await page.request.get(`${API_URL}/api/student/knowledge/search?q=${encodeURIComponent("紫晶缓存")}`)).json()).hits ?? [];
  check("API 文档列表已不含该文档", !afterDocs.some((item) => item.title === DOC_TITLE));
  check("删除后全文索引同步清除（search 0 命中）", afterSearch.length === 0, `${afterSearch.length} hits`);
  check("上述知识库交互无运行错误",pageErrors.length===0,pageErrors.join(" | "));

  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.passed);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
