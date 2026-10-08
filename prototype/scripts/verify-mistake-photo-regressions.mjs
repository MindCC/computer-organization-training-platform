import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createApp } from '../server/app.js';
import { openDatabase, migrate } from '../server/db.js';
import { seedMistakePhoto, QA_PHOTO_STUDENT } from './seed-mistake-photo.mjs';
import * as repo from '../server/photoMistakeRepository.js';
import { normalizeDraftQuestion, answerSimilarRound } from '../server/photoMistakes.js';
import { createKnowledgeRepository } from '../server/knowledgeRepository.js';
import { fillLoginForm, submitLoginForm, gotoApp } from './lib/qaLogin.mjs';
import { clickTopNavItem } from './nav-helpers.mjs';

// Real production UI and HTTP routes against an in-memory DB. The only mocked
// boundary is the external model: no photos/answers leave this process.
const db = openDatabase(':memory:'); migrate(db);
const { studentId, importId } = await seedMistakePhoto(db);
const mistakeId = repo.listImportMistakes(db, importId)[0].id;
const original = repo.mapMistakeRow(repo.getMistakeRow(db, studentId, mistakeId));
createKnowledgeRepository(db).createDocument({ studentId, title: '我的补码讲义', originalName: '补码.txt', fileType: 'txt', fileSize: 100,
  analysis: {}, analysisSource: 'local', chunks: [{ index: 0, pageNo: 3, content: `题目：${original.stem}\n答案：-106\n解析：符号位权重为 -128，其余位之和为 22。` }] });
const fill = (stem, answer) => ({ qtype: 'fill', stem, answer, options: [], analysis: '解析' });
const short = stem => ({ qtype: 'short_answer', stem, answer: '补码统一运算', options: [], analysis: '解析' });
const round1 = repo.createRound(db, { studentId, photoMistakeId: mistakeId, clientSubmissionId: 'regression-round-1', questions: [fill('第一轮题目', '16')] });
const round2 = repo.createRound(db, { studentId, photoMistakeId: mistakeId, clientSubmissionId: 'regression-round-2', questions: [fill('第二轮不同题目', '32')] });
const round3 = repo.createRound(db, { studentId, photoMistakeId: mistakeId, clientSubmissionId: 'regression-round-3', questions: [short('第一道简答'), short('第二道简答')] });
const png = repo.getImportImage(db, studentId, importId, 0);
const draftImport = repo.createImport(db, { studentId, clientSubmissionId: 'regression-draft', images: [png], provider: 'test' });
repo.replaceImportMistakes(db, { studentId, importId: draftImport.id, questions: [normalizeDraftQuestion({ stem: '待核对题目', chapterId: 'ch2', qtype: 'fill', referenceAnswer: '1' })] });
const server = createApp({ db, logger: () => {} }).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await gotoApp(page, base);
  await fillLoginForm(page, QA_PHOTO_STUDENT); await submitLoginForm(page);
  await page.getByRole('button', { name: '错题本', exact: true }).waitFor();
  await clickTopNavItem(page, '错题本');
  const card = page.locator('.mistake-group[data-source="photo"]').filter({ hasText: '10010110' });
  await card.waitFor();
  await card.getByRole('button', { name: '讲错因', exact: true }).click();
  await card.getByTestId('photo-answer-source').waitFor();
  assert.match(await card.getByTestId('photo-answer-source').innerText(), /知识库命中.*0 Token/);
  assert.equal(await card.getByText(/生成讲解时会把/).count(), 0);
  assert.match(await card.innerText(), /来源：我的补码讲义 · 第 3 页/);
  assert.match(await card.locator('.photo-explain').innerText(), /-106/);
  console.log('PASS 本地知识库命中直接展示来源与答案，无需 AI 同意或模型配置');
  await card.getByRole('button', { name: '出同类题', exact: true }).click();
  await card.getByRole('button', { name: '第 1 轮 · 未作答', exact: true }).click();
  await card.getByLabel('第 1 题答案', { exact: true }).fill('16');
  await card.getByRole('button', { name: '第 2 轮 · 未作答', exact: true }).click();
  assert.equal(await card.getByLabel('第 1 题答案', { exact: true }).inputValue(), '');
  assert.equal(await card.getByRole('button', { name: '提交并判分' }).isDisabled(), true);
  await card.getByLabel('第 1 题答案', { exact: true }).fill('32');
  // A late response for round 2 must not replace the active round 1.
  let releaseRound2;
  const round2Gate = new Promise(resolve => { releaseRound2 = resolve; });
  await page.route(`**/api/student/photo-rounds/${round2.id}/answers`, async route => {
    await round2Gate;
    await route.continue();
  });
  const submitted = page.waitForRequest(request => request.url().endsWith(`/photo-rounds/${round2.id}/answers`));
  await card.getByRole('button', { name: '提交并判分' }).click();
  await submitted;
  await card.getByRole('button', { name: '第 1 轮 · 未作答', exact: true }).click();
  await card.getByLabel('第 1 题答案', { exact: true }).fill('16');
  releaseRound2();
  await card.getByRole('button', { name: '第 2 轮 · 全对 ✓', exact: true }).waitFor();
  assert.equal(await card.getByLabel('第 1 题答案', { exact: true }).inputValue(), '16');
  assert.deepEqual(JSON.parse(repo.getRoundRow(db, studentId, round2.id).answers_json), { 0: '32' });
  assert.equal(repo.getRoundRow(db, studentId, round1.id).answers_json, null);
  console.log('PASS 轮次切换清空输入，延迟响应不污染当前轮次');

  await card.getByRole('button', { name: '第 3 轮 · 未作答', exact: true }).click();
  await card.getByLabel('第 1 题作答', { exact: true }).fill('第一题我的理解');
  await card.getByLabel('第 2 题作答', { exact: true }).fill('第二题我的理解');
  const judge = card.getByLabel(/简答题交给 AI 判分/);
  await judge.check();
  await card.locator('.photo-round-question').nth(0).getByLabel('我答对了', { exact: true }).check();
  assert.equal(await judge.isVisible(), true);
  await judge.uncheck();
  assert.equal(await card.getByRole('button', { name: '提交并判分' }).isDisabled(), true);
  await judge.check();
  await page.route(`**/api/student/photo-rounds/${round3.id}/answers`, async route => {
    const input = route.request().postDataJSON();
    assert.equal(input.aiJudgeConsent, true);
    assert.deepEqual(input.selfAssessments, { 0: 'correct' });
    const result = await answerSimilarRound(db, studentId, round3.id, input, {
      env: { DEEPSEEK_API_KEY: 'test-only' },
      fetchImpl: async (_url, init) => {
        const prompt = JSON.parse(init.body).messages[0].content;
        assert.match(prompt, /第二题我的理解/);
        assert.doesNotMatch(prompt, /第一题我的理解/);
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ results: [{ index: 1, correct: true, note: '正确' }] }) } }] }) };
      },
    });
    await route.fulfill({ json: result });
  });
  await card.getByRole('button', { name: '提交并判分' }).click();
  await card.getByTestId('photo-round-result').waitFor();
  assert.equal(JSON.parse(repo.getRoundRow(db, studentId, round3.id).results_json)[0].mode, 'self');
  assert.equal(JSON.parse(repo.getRoundRow(db, studentId, round3.id).results_json)[1].mode, 'ai');
  console.log('PASS 部分简答自评、其余 AI 判分，保留显式同意');

  await page.getByTestId('photo-import-open').click();
  const dialog = page.getByRole('dialog', { name: '拍照导入错题' });
  await dialog.getByRole('button', { name: '继续核对', exact: true }).click();
  await dialog.getByText('1 道题待核对').waitFor();
  await dialog.locator('.photo-draft-fields textarea').first().fill('保存后可恢复的题干');
  await dialog.getByRole('button', { name: '保存草稿并关闭', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(repo.listImportMistakes(db, draftImport.id)[0].stem, '保存后可恢复的题干');
  await page.reload();
  await page.getByTestId('photo-import-open').click();
  await dialog.getByRole('button', { name: '继续核对', exact: true }).click();
  await dialog.getByText('1 道题待核对').waitFor();
  assert.equal(await dialog.locator('.photo-draft-fields textarea').first().inputValue(), '保存后可恢复的题干');
  await dialog.getByRole('button', { name: '核对无误，收入错题本', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(repo.getImportRow(db, studentId, draftImport.id).status, 'archived');
  await page.getByTestId('photo-import-open').click();
  await dialog.getByRole('status').waitFor({ state: 'hidden' });
  assert.equal(await dialog.getByRole('button', { name: '继续核对', exact: true }).count(), 0);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  console.log('PASS 草稿关闭、刷新恢复、保存并归档；已归档退出草稿列表');

  async function assertNormalPrint() {
    await page.emulateMedia({ media: 'print' });
    assert.notEqual(await page.locator('#root').evaluate(element => getComputedStyle(element).display), 'none');
    assert.equal(await page.locator('body > .review-paper-print').count(), 0);
    await page.emulateMedia({ media: 'screen' });
  }
  await assertNormalPrint();
  await page.getByTestId('review-paper-toggle').click();
  await page.getByTestId('paper-select').first().click();
  await page.getByTestId('review-paper-open').click();
  const paper = page.getByRole('dialog', { name: '错题复习卷预览' });
  await paper.waitFor();
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('#root').evaluate(element => getComputedStyle(element).display), 'none');
  assert.equal(await page.locator('body > .review-paper-print').evaluate(element => getComputedStyle(element).display), 'block');
  await page.emulateMedia({ media: 'screen' });
  await paper.getByRole('button', { name: '关闭', exact: true }).click();
  await paper.waitFor({ state: 'hidden' });
  await assertNormalPrint();
  console.log('PASS 普通页面与复习卷打印，以及关闭预览后恢复');
  assert.deepEqual(errors, []);
  console.log('PASS 拍照错题审查问题浏览器回归（隔离数据库、无外部 AI）');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  db.close();
}
