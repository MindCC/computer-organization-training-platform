import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { gotoApp, fillLoginForm, submitLoginForm } from './lib/qaLogin.mjs';
import { KNOWLEDGE_POINTS, knowledgePointsByChapter, knowledgeEvidenceOf } from '../src/knowledgePoints.js';
import { buildAdventureMap } from '../src/adventureMapModel.js';
import { questionsForKp } from '../src/assignmentQuestions.js';

const app = process.env.PROTOTYPE_APP_URL ?? 'http://127.0.0.1:5173';
const artifacts = process.env.QA_ARTIFACT_DIR ?? 'qa-artifacts';
await mkdir(artifacts, { recursive: true });
let browser;
try { browser = await chromium.launch({ channel: 'msedge', headless: true }); } catch { browser = await chromium.launch({ headless: true }); }
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
const errors = [], checks = [];
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const pass = name => { checks.push(name); console.log('PASS ' + name); };
const nav = label => page.locator('.topbar-nav').getByRole('button', { name: label, exact: true });
async function json(request, path, data) {
  const response = data === undefined ? await request.get(app + path) : await request.post(app + path, { data });
  assert.ok(response.ok(), path + ': ' + response.status() + ' ' + await response.text());
  return response.json();
}
async function login(username, password = 'Student123!') {
  await gotoApp(page, app); await fillLoginForm(page, { username, password }); await submitLoginForm(page);
  await expect(page.locator('.quest-student-home')).toBeVisible();
}
async function noOverflow() { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); }
try {
  await login('demo2026001');
  const map = page.getByTestId('course-adventure-map');
  await expect(map).toBeVisible();
  await expect(map.locator('.adventure-map-viewport')).toHaveClass(/has-art/);
  assert.equal(await map.locator('[data-region-id]').count(), 8);
  assert.equal(await page.locator('[data-testid="knowledge-star-map"]').count(), 0);
  pass('课程首页展示手绘八章地图，学习记录保留课程知识图谱');
  const progress = (await json(context.request, '/api/student/progress')).progress;
  const model = buildAdventureMap(progress);
  for (const region of model.regions) await expect(map.locator('[data-region-id="' + region.chapterId + '"]')).toHaveAttribute('data-region-state', region.state);
  for(const region of model.regions){
    await map.locator(`[data-region-id="${region.chapterId}"]`).click();
    assert.equal(await map.locator('.adventure-map-challenge .experiment-thumbnail').count(),region.total);
  }
  pass('八章区域状态来自实际账户进度，含全部课程与硬件任务');
  await map.getByRole('button', { name: '放大地图', exact: true }).click();
  await expect(map.getByLabel('地图缩放比例')).toHaveText('125%');
  await map.getByRole('button', { name: '复位全图', exact: true }).click();
  await expect(map.getByLabel('地图缩放比例')).toHaveText('100%');
  await map.locator('[data-region-id="ch1"]').focus(); await page.keyboard.press('ArrowRight');
  await expect(map.locator('[data-region-id="ch2"]')).toHaveAttribute('aria-pressed', 'true');
  pass('地图缩放、复位与键盘选择有效');
  await map.locator('[data-region-id="ch1"]').click();
  await map.screenshot({ path: artifacts + '/learning-atlas-desktop.png' });
  await nav('学习记录').click();
  const graph = page.getByTestId('course-knowledge-graph');
  await expect(graph).toBeVisible();
  assert.equal(await graph.locator('[data-knowledge-chapter]').count(), 8);
  for (const chapterId of ['ch1','ch2','ch3','ch4','ch5','ch6','ch7','ch8']) {
    await graph.locator('[data-knowledge-chapter="' + chapterId + '"]').click();
    assert.equal(await graph.locator('.kg-node').count(), knowledgePointsByChapter(chapterId).length);
    assert.equal(await graph.locator('.kg-node[data-status="locked"]').count(), 0);
  }
  pass('课程图谱八章完整概念可浏览，没有用关卡冒充知识点或锁定概念');
  await graph.getByRole('searchbox', { name: '搜索课程知识点' }).fill('Cache');
  await graph.locator('[data-search-concept="concept-cache-mapping"]').click();
  const cacheDetail = graph.locator('.concept-inspector .kp-detail');
  await expect(cacheDetail).toHaveAttribute('data-kp-detail', 'concept-cache-mapping');
  await expect(cacheDetail).toContainText('暂无对应实验');
  assert.equal(await cacheDetail.locator('.kp-enter-btn').count(), 0);
  pass('跨章搜索 Cache，未覆盖实验的概念仍能浏览并说明真实覆盖');
  await graph.getByRole('searchbox', { name: '搜索课程知识点' }).fill('');
  await graph.locator('[data-knowledge-chapter="ch4"]').click();
  await page.locator('.learning-workspace').screenshot({ path: artifacts + '/course-knowledge-desktop.png' });
  const target = KNOWLEDGE_POINTS.find(point => point.chapterId === 'ch3' && point.challengeIds.includes('and-gate') && questionsForKp(point.id).length);
  assert.ok(target);
  await graph.locator('[data-knowledge-chapter="ch3"]').click();
  await graph.locator('.kg-node[data-kp-id="' + target.id + '"]').click();
  const detail = graph.locator('.concept-inspector .kp-detail');
  await expect(detail.locator('.concept-evidence')).toContainText(knowledgeEvidenceOf(target, progress).label);
  const question = questionsForKp(target.id)[0];
  await detail.locator('[data-concept-question="' + question.id + '"]').click();
  await expect(page.locator('.practice-question')).toHaveCount(1);
  await expect(page.locator('.practice-question')).toHaveAttribute('data-qid', question.id);
  await expect(page.locator('.study-focus-strip')).toContainText('知识点练习');
  await page.getByRole('button', { name: '返回学习图谱', exact: true }).click();
  await expect(graph).toBeVisible();
  pass('图谱精确关联题库，正常练习有正确来源与返回学习页面入口');
  await page.setViewportSize({ width: 390, height: 844 });
  await nav('课程首页').click();
  await expect(map.locator('.adventure-map-mobile-regions button')).toHaveCount(8);
  await map.locator('.adventure-map-mobile-regions button').last().click();
  await expect(map.locator('.adventure-map-inspector')).toContainText('第八章');
  await noOverflow();
  await map.screenshot({ path: artifacts + '/learning-atlas-mobile.png' });
  pass('手机地图八区可选择，章节实验清单可阅读，页面无横向溢出');
  await nav('学习记录').click();
  await graph.locator('[data-knowledge-chapter="ch8"]').click();
  const dma = knowledgePointsByChapter('ch8').find(point => point.title.includes('DMA'));
  assert.ok(dma);
  await graph.locator('[data-mobile-concept="' + dma.id + '"]').click();
  await expect(graph.locator('.concept-mobile-list .kp-detail')).toHaveAttribute('data-kp-detail', dma.id);
  await graph.getByRole('searchbox', { name: '搜索课程知识点' }).fill('段页式');
  await graph.locator('[data-search-concept="concept-segmented-paged-memory"]').click();
  await expect(graph.locator('.concept-search-mobile-detail .kp-detail')).toBeVisible();
  await noOverflow();
  await page.locator('.learning-workspace').screenshot({ path: artifacts + '/course-knowledge-mobile.png' });
  pass('手机知识点详情就在所选项下，搜索课件概念与关系正常');
  const teacher = await browser.newContext();
  await json(teacher.request, '/api/auth/login', { username: process.env.TEACHER_USERNAME ?? 'teacher', password: process.env.TEACHER_PASSWORD ?? 'ChangeMe123!' });
  const classroom = (await json(teacher.request, '/api/classes', { name: '地图零进度验证班' })).class;
  assert.ok(classroom?.id);
  const studentNo = 'atlas-' + Date.now();
  await json(teacher.request, '/api/teacher/classes/' + classroom.id + '/import-students', { csv: '学号,姓名,初始密码\n' + studentNo + ',地图测试学生,Student123!' });
  await json(context.request, '/api/auth/logout', {});
  await page.setViewportSize({ width: 1366, height: 768 });
  await login(studentNo);
  await expect(map).toBeVisible();

  const freshProgress = (await json(context.request, '/api/student/progress')).progress;
  assert.equal(buildAdventureMap(freshProgress).completed, 0);
  await nav('学习记录').click();
  await expect(graph).toBeVisible();
  assert.equal(await page.locator('.records-kpi').count(), 5);
  await expect(page.locator('.records-kpi-empty')).toHaveText('暂无成绩');
  assert.equal(await graph.locator('.kg-node[data-status="evidence"]').count(), 0);
  await expect(graph.locator('.concept-explorer-title')).toContainText(String(KNOWLEDGE_POINTS.length));
  pass('新学生零记录时仍能探索地图与全课程图谱，账号没有继承旧状态');
  assert.deepEqual(errors, []); pass('全程没有页面运行错误');
  await writeFile(artifacts + '/learning-atlas-results.json', JSON.stringify({ checks, errors, conceptCount: KNOWLEDGE_POINTS.length, regions: model.regions.map(region => ({ id: region.chapterId, state: region.state })) }, null, 2));
  console.log('学习地图验收：' + checks.length + ' 项通过');
} catch (error) { await page.screenshot({ path: artifacts + '/learning-atlas-failure.png', fullPage: true }).catch(() => {}); throw error; }
finally { await browser.close(); }
