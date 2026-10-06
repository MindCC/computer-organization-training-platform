import { chromium } from "playwright";
import { gotoApp, fillLoginForm, submitLoginForm } from "./lib/qaLogin.mjs";
import { clickTopNavItem } from "./nav-helpers.mjs";
const browser = await chromium.launch({ headless: true });
let worst = { ratio: 0 }, problems = [], checked = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await gotoApp(page, "http://127.0.0.1:5173/");
  await fillLoginForm(page, { username: "demo2026001", password: "Student123!" });
  await submitLoginForm(page);
  await page.waitForSelector(".quest-student-home", { timeout: 20000 });
  await clickTopNavItem(page, "学习记录");
  await page.waitForSelector("[data-testid=course-knowledge-graph]", { timeout: 20000 });
  for (let chapter = 1; chapter <= 8; chapter += 1) {
    await page.locator(`[data-knowledge-chapter="ch${chapter}"]`).click();
    await page.waitForTimeout(600);
    const rows = await page.evaluate(() => [...document.querySelectorAll(".kg-node")].map(node => {
      const rect = node.querySelector("rect");
      const text = node.querySelector("text");
      const lines = [...text.querySelectorAll("tspan")];
      // getBBox 是未缩放的图形单位，直接和卡片属性比较
      const wrapped = lines.map(s => ({ t: s.textContent, w: +s.getBBox().width.toFixed(1) }));
      const lineHeights = lines.map(s => { const b = s.getBBox(); return { top: +b.y.toFixed(1), bottom: +(b.y + b.height).toFixed(1) }; });
      const box = { w: +rect.getAttribute("width"), h: +rect.getAttribute("height") };
      return {
        id: node.dataset.kpId.replace("concept-", ""),
        box,
        maxLineWidth: Math.max(...wrapped.map(l => l.w)),
        lines: wrapped.map(l => l.t),
        longest: wrapped.reduce((a, b) => (b.w > a.w ? b : a)),
        top: Math.min(...lineHeights.map(l => l.top)),
        bottom: Math.max(...lineHeights.map(l => l.bottom)),
        textUnits: +text.getBBox().width.toFixed(1),
      };
    }));
    for (const row of rows) {
      checked += 1;
      const ratio = row.textUnits / row.box.w;
      if (ratio > worst.ratio) worst = { ratio, ...row, chapter };
      if (row.textUnits > row.box.w - 8 || row.top < -row.box.h / 2 || row.bottom > row.box.h / 2) problems.push({ chapter, ...row });
    }
  }
  console.log("检查节点数", checked);
  console.log("最宽文本/卡片比", worst.ratio.toFixed(3), "章节", worst.chapter, "文本", worst.textUnits, "卡片宽", worst.box.w, JSON.stringify(worst.lines));
  console.log("溢出或越界节点", problems.length, JSON.stringify(problems.slice(0, 6)));
} finally { await browser.close(); }
