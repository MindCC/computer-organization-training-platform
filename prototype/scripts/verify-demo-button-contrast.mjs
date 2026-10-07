import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['arithmetic-basics', 'twos-complement', 'memory-system', 'addressing', 'cpu', 'bus', 'io', 'alu'];
const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.on('pageerror', error => errors.push(error.message));
function luminance(rgb) {
  return rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
}
async function contrast(locator) {
  const style = await locator.evaluate(el => { const s = getComputedStyle(el); return { color: s.color, background: s.backgroundColor, opacity: s.opacity }; });
  const values = [luminance(style.color), luminance(style.background)].sort((a, b) => b - a);
  return { ...style, ratio: (values[0] + .05) / (values[1] + .05) };
}
try {
  for (const file of process.argv.includes('--reproduce') ? files.slice(0, 1) : files) {
    await page.goto(pathToFileURL(path.join(root, `public/demos/${file}.html`)).href);
    await page.locator('[data-mode="quiz"]').click();
    const submit = page.locator('#quizSubmit'), next = page.locator('#quizNext');
    assert(await submit.isVisible());
    assert(!await next.isVisible());
    if (await page.locator('.quiz-choice').count()) await page.locator('.quiz-choice').first().click();
    else if (await page.locator('#quizInput').count()) await page.locator('#quizInput').fill('0');
    await submit.click();
    assert(await next.isVisible());
    assert(!await submit.isVisible());
    await page.mouse.move(0, 0);
    const normal = await contrast(next);
    if (process.argv.includes('--reproduce')) {
      assert(normal.ratio < 4.5, `Expected the reported contrast failure: ${JSON.stringify(normal)}`);
      console.log(`REPRODUCED ${file}: next button contrast ${normal.ratio.toFixed(2)}:1`);
      break;
    }
    assert(normal.ratio >= 4.5 && normal.opacity === '1', `${file} normal next button: ${JSON.stringify(normal)}`);
    await next.hover();
    const hover = await contrast(next);
    assert(hover.ratio >= 4.5, `${file} hover next button: ${JSON.stringify(hover)}`);
    await next.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    assert(await next.evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none'), `${file}: keyboard focus must be visible`);
    if (file === 'arithmetic-basics') {
      await fs.mkdir(path.join(root, 'qa-artifacts'), { recursive: true });
      await page.locator('#stage').screenshot({ path: path.join(root, 'qa-artifacts/demo-next-button-fixed.png') });
      await page.setViewportSize({ width: 390, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile practice must not overflow');
      assert((await contrast(next)).ratio >= 4.5);
      await page.setViewportSize({ width: 1366, height: 900 });
    }
    await page.keyboard.press('Enter');
    assert(await submit.isVisible());
    assert(!await next.isVisible());
    assert((await contrast(submit)).ratio >= 4.5, `${file}: submit must remain legible`);
    console.log(`PASS ${file}: next contrast ${normal.ratio.toFixed(2)}:1, hover ${hover.ratio.toFixed(2)}:1, focus and Enter navigation`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
