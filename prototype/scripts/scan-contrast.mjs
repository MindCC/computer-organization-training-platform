/**
 * 演示页文字对比度扫描：找出「浅色文字落在浅色背景上」（对比度 < 2.6:1）的元素。
 * 用法：node scripts/scan-contrast.mjs <file:///或http(s):// URL> [更多...]
 */
import { createRequire } from "node:module";
const require = createRequire("E:/workspace/composition-principle-platform/prototype/package.json");
const { chromium } = require("playwright");

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error("用法：node scripts/scan-contrast.mjs <url> [...]");
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
let anyBad = 0;
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  for (const url of urls) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    const issues = await page.evaluate(() => {
      function lum(rgb) {
        const m = rgb.match(/\d+(\.\d+)?/g); if (!m) return null;
        const c = m.map(Number).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      }
      function bgOf(el) {
        for (let n = el; n && n !== document.body; n = n.parentElement) {
          const b = getComputedStyle(n).backgroundColor;
          if (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") return b;
        }
        return "rgb(255,255,255)";
      }
      const bad = [];
      for (const el of document.querySelectorAll("body *")) {
        if (!el.textContent.trim() || el.children.length > 2) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const fl = lum(cs.color), bl = lum(bgOf(el));
        if (fl === null || bl === null) continue;
        const ratio = (Math.max(fl, bl) + 0.05) / (Math.min(fl, bl) + 0.05);
        if (ratio < 2.6) bad.push({ sel: el.tagName + "." + String(el.className).slice(0, 44), text: el.textContent.trim().slice(0, 22), ratio: ratio.toFixed(2), color: cs.color, bg: bgOf(el) });
      }
      return bad.slice(0, 25);
    });
    if (issues.length === 0) console.log(`✔ ${url} — 无低对比文字`);
    else {
      anyBad += issues.length;
      console.log(`✖ ${url} — ${issues.length} 处低对比：`);
      for (const issue of issues) console.log(`   [${issue.ratio}] ${issue.sel} "${issue.text}" color=${issue.color} bg=${issue.bg}`);
    }
  }
} finally {
  await browser.close();
}
process.exit(anyBad === 0 ? 0 : 1);
