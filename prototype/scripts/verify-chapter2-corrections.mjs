import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

// One Chromium/page, static demos only: no account data or backend writes.
const browser = await chromium.launch({ headless: true });
const errors = [], failures = [];
let passed = 0;
const check = async (name, run) => {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { const detail = error.message.slice(0, 650); failures.push(`${name}: ${detail}`); console.error(`FAIL ${name}: ${detail}`); }
};
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(3000);
  page.on('pageerror', error => errors.push(error.message));
  const open = file => page.goto(pathToFileURL(path.resolve('public/demos', file)).href);
  const bits = selector => page.locator(`${selector} .bit`).allInnerTexts().then(items => items.map(item => item.trim()[0]).join(''));
  for (const file of ['arithmetic-basics.html', 'twos-complement.html']) {
    await open(file);
    await check(`${file}: encoding derivation, all 256 values`, async () => {
      const problems = await page.evaluate(() => {
        const problems = [];
        for (let value = -128; value <= 127; value++) {
          state.encodeValue = value;
          const s = buildEncodeScenario();
          const twos = ((value + 256) % 256).toString(2).padStart(8, '0');
          if (s.bits.join('') !== twos) problems.push(`twos ${value}`);
          if (value === -128) {
            if (s.ones !== null || !s.steps[2].text.includes('不可表示') || s.steps[2].cells.length || s.steps[3].cells.length) problems.push('unrepresentable -128');
          } else {
            const expected = (value >= 0 ? value : 255 + value).toString(2).padStart(8, '0');
            if (s.ones !== expected) problems.push(`ones ${value}: ${s.ones}`);
          }
          if (value >= 0 && /反码\s*\+\s*1/.test(s.steps[4].text)) problems.push(`positive +1 ${value}`);
          if (s.steps.some(step => step.cells.some(c => c.col > 7))) problems.push(`oversized row ${value}`);
        }
        return problems;
      });
      assert.deepEqual(problems, []);
    });
    await check(`${file}: visible positive and minimum encoding guidance`, async () => {
      await page.locator('[data-mode="encode"]').click();
      await page.evaluate(() => changeEncodeValue(5));
      assert.match(await page.locator('#arrowTwos').innerText(), /不变/);
      await page.evaluate(() => { changeEncodeValue(-128); goToStep(5); });
      assert.match(await page.locator('[data-row="sign"]').locator('..').innerText(), /不可表示/);
      assert.match(await page.locator('[data-row="ones"]').locator('..').innerText(), /不可表示/);
      assert.equal(await page.locator('[data-row="twos"] .bit-val').allTextContents().then(a => a.join('')), '10000000');
    });
    await check(`${file}: subtraction overflow explains opposite signs`, async () => {
      const messages = await page.evaluate(() => {
        state.mode = 'sub';
        return [[100, -100], [-100, 100], [0, -128]].map(([a, b]) => {
          state.A = decToBits(a); state.B = decToBits(b);
          return buildAddSubScenario().steps.at(-1).overflow;
        });
      });
      for (const message of messages) {
        assert.match(message, /异号相减/);
        assert.doesNotMatch(message, /正数减正数|负数减负数/);
      }
    });
  }
  await open('arithmetic-basics.html');
  await check('arithmetic shifts: all 1,536 bit pattern/encoding/direction combinations', async () => {
    const problems = await page.evaluate(() => {
      const problems = [];
      const decode = (raw, enc) => enc === 'twos' ? raw < 128 ? raw : raw - 256 : enc === 'sign' ? raw < 128 ? raw : -(raw - 128) : raw < 128 ? raw : raw - 255;
      for (let raw = 0; raw < 256; raw++) for (const enc of ['sign', 'ones', 'twos']) for (const dir of ['left', 'right']) {
        const input = raw.toString(2).padStart(8, '0').split('').map(Number);
        const step = arithmeticShiftOnce(input, dir, enc);
        const value = decode(raw, enc);
        const expected = dir === 'left' ? value * 2 : enc === 'twos' ? Math.floor(value / 2) : Math.trunc(value / 2);
        const overflow = dir === 'left' && (expected < (enc === 'twos' ? -128 : -127) || expected > 127);
        if (step.overflow !== overflow || (!overflow && decode(parseInt(step.result.join(''), 2), enc) !== expected)) problems.push({ raw, enc, dir });
      }
      return problems;
    });
    assert.deepEqual(problems, []);
  });
  await page.locator('[data-mode="workbench"]').click();
  await check('arithmetic right shift guidance follows all encodings', async () => {
    for (const enc of ['sign', 'ones', 'twos']) {
      await page.evaluate(enc => workSet(-5, 'asr', enc), enc);
      const expected = enc === 'twos' ? /向下取整/ : /向零取整/;
      assert.match(await page.locator('#banner').innerText(), expected);
      assert.match(await page.locator('#opGrid [data-op="asr"]').innerText(), expected);
      const highlighted = await page.locator('#vizResult .new-bit').getAttribute('data-col');
      assert.equal(highlighted, enc === 'sign' ? '1' : '0');
    }
  });
  await check('changing encoding clears stale overflow guidance', async () => {
    await page.evaluate(() => workSet(100, 'asl', 'twos'));
    assert.match(await page.locator('#banner').innerText(), /溢出/);
    const result = await bits('#vizResult');
    await page.locator('#encTabs [data-enc="sign"]').click();
    assert.equal(await bits('#vizResult'), result);
    assert.equal(await page.locator('#banner').innerText(), '');
  });
  await check('editing current register toggles the visible bit and clears operation state', async () => {
    await page.evaluate(() => workSet(-10, 'asl', 'sign'));
    assert.equal(await bits('#workBits'), '10001010');
    assert.equal(await bits('#vizResult'), '10010100');
    await page.locator('#workBits .bit').nth(3).click();
    assert.equal(await bits('#vizResult'), '10010100', 'before snapshot is read-only');
    await page.locator('#vizResult .bit').nth(3).click();
    assert.equal(await bits('#vizResult'), '10000100');
    assert.equal(await bits('#workBits'), '10000100');
    assert.equal(await page.locator('#banner').innerText(), '');
    await page.evaluate(() => workSet(100, 'asl', 'twos'));
    await page.locator('#vizResult .bit').last().click();
    assert.equal(await page.locator('#banner').innerText(), '');
    assert.equal(await page.evaluate(() => workState.overflow), false);
    await page.locator('#vizResult .bit').last().focus();
    await page.keyboard.press('Space');
    assert.equal(await bits('#vizResult'), '11001000');
    await page.keyboard.press('Enter');
    assert.equal(await bits('#vizResult'), '11001001');
  });
  await check('workbench current register remains usable on narrow screens', async () => {
    await mkdir('qa-artifacts', { recursive: true });
    await page.screenshot({ path: 'qa-artifacts/chapter2-workbench-fixed.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert(await page.locator('#vizResult').isVisible());
    await page.screenshot({ path: 'qa-artifacts/chapter2-workbench-mobile-fixed.png' });
    await page.setViewportSize({ width: 1366, height: 900 });
  });
  await page.locator('[data-mode="rotate"]').click();
  await check('carry rotate reset restores advertised C=1', async () => {
    await page.locator('#ringPreset').click();
    assert.match(await page.locator('#ringRead').innerText(), /C=1/);
    await page.evaluate(() => ringExecute('rcl'));
    assert.match(await page.locator('#ringRead').innerText(), /01101001/);
    await page.locator('#ringPreset').click();
    await page.evaluate(() => ringExecute('rcr'));
    assert.match(await page.locator('#ringRead').innerText(), /11011010/);
  });
  await open('alu.html');
  await check('normalization quiz: all generated mantissas have correct reference and option', async () => {
    const problems = await page.evaluate(() => {
      const originalRandom = Math.random, problems = [];
      try {
        for (let m = 8; m <= 255; m++) {
          let call = 0;
          Math.random = () => call++ === 0 ? (m - 8 + 0.5) / 248 : 0.5;
          const q = generateQuestion('floatnorm');
          const value = Number(q.prompt.match(/<code>([^<]+)/)[1]);
          let mantissa = value, count = 0, dir = '';
          while (mantissa < 1) { mantissa *= 2; count++; dir = '左'; }
          while (mantissa >= 2) { mantissa /= 2; count++; dir = '右'; }
          const expected = count ? `${dir}规 ${count} 位` : '无需规格化';
          if (q.choices[q.answer] !== expected || !q.choices.includes(expected) || new Set(q.choices).size !== 4) problems.push({ value, expected, actual: q.choices[q.answer] });
        }
      } finally { Math.random = originalRandom; }
      return problems;
    });
    assert.deepEqual(problems, []);
  });
  await check('0.125 normalization accepts left-three and rejects right-one through the quiz UI', async () => {
    await page.locator('[data-mode="quiz"]').click();
    const resetQuestion = () => page.evaluate(() => {
      const original = Math.random;
      try { Math.random = () => 0; window.__forceQuizType = 'floatnorm'; startQuizRound(); }
      finally { Math.random = original; }
    });
    await resetQuestion();
    assert.match(await page.locator('#quizPrompt').innerText(), /0\.1250/);
    await page.locator('.quiz-choice').filter({ hasText: '左规 3 位' }).click();
    await page.locator('#quizSubmit').click();
    assert.match(await page.locator('#quizFeedback').getAttribute('class'), /\bok\b/);
    assert.match(await page.locator('#quizFeedback').innerText(), /阶码相减 3/);
    await resetQuestion();
    await page.locator('.quiz-choice').filter({ hasText: '右规 1 位' }).click();
    await page.locator('#quizSubmit').click();
    assert.match(await page.locator('#quizFeedback').getAttribute('class'), /\bbad\b/);
    assert.match(await page.locator('#quizScore').innerText(), /1 \/ 2/);
  });
  await check('no browser script exceptions', async () => assert.deepEqual(errors, []));
  assert.equal(failures.length, 0, failures.join('\n'));
  console.log(`PASS ${passed} chapter-2 regression groups`);
} finally { await browser.close(); }
