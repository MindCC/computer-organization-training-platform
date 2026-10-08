import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// 移位运算编码区分冒烟验证：算术移位按 原码/反码/补码 分开，同一串位三种读数。
// 直接读取静态演示文件，不需要应用服务器。
const url = process.env.SHIFT_DEMO_URL ?? `file://${process.cwd().replaceAll('\\','/')}/public/demos/arithmetic-basics.html`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('button[data-mode="workbench"]').click();
  await page.locator('#workBits .bit').first().waitFor();

  const resultBits = () => page.locator('#vizResult .bit').allInnerTexts().then(cells => cells.map(c => c.trim()[0]).join(''));
  const readouts = () => page.locator('#readoutGrid .readout').allInnerTexts();
  const banner = () => page.locator('#banner').innerText();

  // 补码：100 算术左移 → 符号翻转溢出
  await page.getByRole('button', { name: /100 算术左移/ }).click();
  assert.equal(await resultBits(), '11001000');
  assert.match(await banner(), /溢出/);
  assert.match((await readouts()).join('\n'), /\+100 → -56/);

  // 原码：−10 算术左移 → 符号位不动、数值位移 → −20
  await page.getByRole('button', { name: /−10 原码算术左移/ }).click();
  assert.equal(await resultBits(), '10010100');
  const outs1 = (await readouts()).join('\n');
  assert.match(outs1, /原码读数\n-10 → -20/, 'sign-magnitude reading');
  assert.match(outs1, /反码读数\n-117 → -107/, 'ones-complement reading of same bits');
  assert.match(outs1, /补码读数\n-118 → -108/, 'twos reading of same bits');

  // 反码：−10 算术左移 → 空位补符号位 1 → −20
  await page.getByRole('button', { name: /−10 反码算术左移/ }).click();
  assert.equal(await resultBits(), '11101011');
  assert.match((await readouts()).join('\n'), /-10 → -20/);

  // 算术移位与逻辑移位的区分：同一初值（原码 −10），逻辑左移整体移动会把符号位移出，
  // 算术左移保持符号位不动、只动数值位。
  await page.getByRole('button', { name: /−10 原码算术左移/ }).click();
  assert.equal(await resultBits(), '10010100', '原码算术左移：符号位保持 1，未被移动或覆盖');
  await page.locator('#opGrid [data-op="lsl"]').click();
  assert.equal(await resultBits(), '00101000', '逻辑左移：整体移动，符号位被移出（用于对比展示）');
  assert.ok((await page.locator('#opGrid [data-op]').evaluateAll(btns => btns.map(b => b.dataset.op)))
    .join(',').includes('lsl,lsr,asl,asr'), '逻辑与算术按钮并列');

  // 编码切换不重写位串，只换解读：原码选中态
  await page.locator('#encTabs [data-enc="sign"]').click();
  assert.equal(await page.locator('#encTabs [data-enc="sign"]').getAttribute('aria-pressed'), 'true');

  // 补码算术右移（预设）保持正确：−32 → −16
  await page.getByRole('button', { name: /−32 算术右移/ }).click();
  assert.equal(await resultBits(), '11110000');
  assert.match((await readouts()).join('\n'), /-32 → -16/);

  assert.deepEqual(errors, []);
  console.log('PASS shift workbench distinguishes sign-magnitude/ones/twos encodings with correct arithmetic shifts and readouts');
} finally {
  await browser.close();
}
