import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const manifest = JSON.parse(await readFile(new URL('../dist/.vite/manifest.json', import.meta.url), 'utf8'));
const entries = ['src/components/OverviewExplodedView.jsx', 'src/components/HardwareGamePage.jsx'];
let browser;
try { browser = await chromium.launch({ channel: 'msedge', headless: true }); }
catch { browser = await chromium.launch({ headless: true }); }
try {
  const page = await browser.newPage();
  await page.goto(process.env.PROTOTYPE_URL, { waitUntil: 'networkidle' });
  for (const entry of entries) {
    assert.ok(manifest[entry], `Missing production entry: ${entry}`);
    const result = await page.evaluate(async file => {
      try { await import('/' + file); return { ok: true }; }
      catch (error) { return { ok: false, error: error.stack }; }
    }, manifest[entry].file);
    assert.equal(result.ok, true, `${entry}: ${result.error}`);
    console.log(`PASS production module ${entry}`);
  }
} finally { await browser.close(); }
