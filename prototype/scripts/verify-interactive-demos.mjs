import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { HOSTED_DEMOS } from '../src/shared/demoNavigation.js';
import { clickTopNavItem } from './nav-helpers.mjs';

const base = process.env.PROTOTYPE_APP_URL ?? 'http://127.0.0.1:5173';
await mkdir('qa-artifacts', { recursive:true });
const browser = await chromium.launch({headless:true});
const errors = [], grades = [];
try {
  const context = await browser.newContext({viewport:{width:1920,height:947}, reducedMotion:'reduce'});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, {waitUntil:'domcontentloaded'});
  const nav = label => page.locator('.topbar-nav-item').filter({ hasText: label }).first();
  await clickTopNavItem(page, '互动演示');
  await expect(page.locator('.courseware-chapter-card')).toHaveCount(8);
  await expect(nav('互动演示')).toHaveClass(/active/);
  assert.equal(await page.locator('.courseware-demo-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),4);
  await page.screenshot({path:'qa-artifacts/interactive-demos-hub-desktop.png'});
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.courseware-chapter-card')).toHaveCount(8);
  await page.locator('a[href="/demos/arithmetic-basics.html"]').click();
  await expect(page).toHaveURL(/demo=arithmetic-basics/);
  await expect(nav('互动演示')).toHaveClass(/active/);
  await page.getByRole('button',{name:'返回互动演示',exact:true}).click();
  await expect(page.locator('.courseware-demo-grid')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.hosted-demo-frame')).toHaveAttribute('src','/demos/arithmetic-basics.html?embedded=1');
  await page.goForward();
  await expect(page.locator('.courseware-demo-grid')).toBeVisible();
  await clickTopNavItem(page, '课程课件');
  // 课件页为章节大纲版式：讲演在折叠的章节内，未展开不挂载 iframe
  await expect(page.locator('.courseware-outline')).toBeVisible();
  await expect(page.locator('.courseware-chapter-card, .parameter-playground')).toHaveCount(0);
  await page.locator('.outline-chapter', { hasText: '第三章' }).first().locator('summary').click();
  await expect(page.locator('.outline-lecture iframe').first()).toBeVisible();

  for (const demo of HOSTED_DEMOS) {
    await page.goto(`${base}/?demo=${demo.id}`,{waitUntil:'domcontentloaded'});
    await expect(nav('互动演示')).toHaveClass(/active/);
    const frame = page.frameLocator('.hosted-demo-frame');
    await expect(frame.locator('body.demo-theme')).toBeVisible();
    await expect(frame.locator('link[href="demo-theme.css"]')).toHaveCount(1);
    const theme = await frame.locator('body').evaluate(body=>({bg:getComputedStyle(body).backgroundImage,heading:getComputedStyle(body.querySelector('h1')).fontSize,panel:getComputedStyle(body.querySelector('.panel, .card')).borderRadius}));
    assert.ok(theme.bg.includes('radial-gradient'), demo.id);
    assert.equal(theme.heading,'44px', demo.id);
    assert.equal(theme.panel,'16px', demo.id);
    const tabs = frame.locator('.mode-tabs button, .mode-switch button, .tabs button');
    const count = await tabs.count();
    assert.ok(count>=2);
    for (let i=0;i<count;i++) {
      await tabs.nth(i).click();
      assert.ok(await tabs.nth(i).evaluate(el=>el.classList.contains('active')||el.getAttribute('aria-selected')==='true'));
      assert.ok((await frame.locator('body').innerText()).length>100);
    }
    await tabs.first().click();
    if(demo.id==='intro') {
      await frame.locator('.part[data-part="cu"]').click();
      await expect(frame.locator('#partInfo')).toContainText('控制器');
      await frame.locator('#animStep').click();
      assert.ok((await frame.locator('.step-chip.now').count())>0);
    } else if(demo.id==='adder-alu') {
      await frame.locator('#a-bit').click();await frame.locator('#b-bit').click();
      await expect(frame.locator('#results .result').nth(0).locator('strong')).toHaveText('0');
      await expect(frame.locator('#results .result').nth(1).locator('strong')).toHaveText('1');
    } else {
      const step = frame.locator('#stage .inline-steps button').filter({hasText:/下一步|单步|步进/}).first();
      if(await step.isVisible())await step.click();
      else if(await frame.locator('#nextBtn').isVisible())await frame.locator('#nextBtn').click();
      await expect(frame.locator('#stage')).not.toBeEmpty();
    }
    await page.screenshot({path:`qa-artifacts/interactive-demo-${demo.id}-desktop.png`});
    await page.setViewportSize({width:390,height:844});
    await expect(nav('互动演示')).toBeVisible();
    for (let i=0;i<count;i++) {
      await tabs.nth(i).click();
      const width = await frame.locator('body').evaluate(()=>({actual:document.documentElement.scrollWidth,limit:innerWidth}));
      assert.ok(width.actual<=width.limit+1,`${demo.id} mode ${i} mobile overflow ${JSON.stringify(width)}`);
    }
    await tabs.first().click();
    const mobile = await frame.locator('body').evaluate(body=>({width:document.documentElement.scrollWidth,viewport:innerWidth,h1:getComputedStyle(body.querySelector('h1')).fontSize}));
    assert.equal(mobile.h1,'28px', demo.id);
    assert.ok(mobile.width<=mobile.viewport+1,`${demo.id} mobile overflow ${JSON.stringify(mobile)}`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${demo.id} shell mobile overflow`);
    await page.screenshot({path:`qa-artifacts/interactive-demo-${demo.id}-mobile.png`});
    await page.setViewportSize({width:1920,height:947});
    console.log(`PASS ${demo.id}: theme, ${count} modes, interaction, mobile`);
  }
  await context.close();

  for (const role of ['student','teacher']) {
    const roleContext = await browser.newContext({viewport:{width:1366,height:768}});
    const p = await roleContext.newPage();p.on('pageerror',error=>errors.push(error.message));
    await p.goto(base,{waitUntil:'domcontentloaded'});
    await p.getByRole('button',{name:'登录',exact:true}).click();
    await p.locator(`[data-demo-role="${role}"]`).click();
    await expect(p.locator('.profile-button')).toBeVisible();
    await clickTopNavItem(p, '互动演示');
    await expect(p.locator('.courseware-chapter-card')).toHaveCount(8);
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${role} desktop nav overflow`);
    const bounds=await p.locator('.topbar').evaluate(el=>[...el.children].map(c=>({left:c.getBoundingClientRect().left,right:c.getBoundingClientRect().right,width:innerWidth})));
    assert.ok(bounds.every(b=>b.left>=0&&b.right<=b.width+1),`${role} topbar clipped ${JSON.stringify(bounds)}`);
    await p.screenshot({path:`qa-artifacts/interactive-demos-${role}-1366.png`});
    await p.reload({waitUntil:'domcontentloaded'});
    await expect(p.locator('.courseware-chapter-card')).toHaveCount(8);
    await p.locator('a[href="/demos/adder-alu.html"]').click();
    await expect(p.locator('.topbar-nav-item.active')).toHaveText('互动演示');
    const f=p.frameLocator('.hosted-demo-frame');await expect(f.locator('body.demo-theme')).toBeVisible();
    if(role==='student') {
      await expect(p.getByRole('button',{name:'本章练习',exact:true})).toBeVisible();
      await roleContext.route('**/api/student/demo-attempts',route=>{grades.push(route.request().postDataJSON());return route.fulfill({status:200,contentType:'application/json',body:'{}'});});
      await expect(f.locator('#platform-link-badge')).toContainText('已连接学情');
      await f.locator('body').evaluate(() => { Math.random = () => 0.375; });
      await f.getByRole('tab',{name:'随堂练习'}).click();
      for(let index=0;index<5;index++) {
        const answer=await f.locator('body').evaluate((body,i)=>globalThis.AdderAluCore.quizQuestion(i).answer,index);
        await f.locator(`[data-answer="${answer}"]`).click();
        await expect(f.locator('#quiz-feedback')).toContainText('正确');
        if(index<4)await f.locator('#quiz-next').click();
      }
      await expect.poll(()=>grades.length).toBe(1);
      assert.equal(grades[0].demoId,'adder-alu');assert.equal(grades[0].result.correct,5);assert.equal(grades[0].result.score,100);
      await p.getByRole('button',{name:'本章练习',exact:true}).click();
      await expect(p.locator('.hosted-demo-frame')).toHaveCount(0);
      await expect(p.getByRole('tab',{name:/第3章/})).toHaveAttribute('aria-selected','true');
    }
    await roleContext.close();
  }
  const standalone=await browser.newPage({viewport:{width:1366,height:768}});
  await standalone.goto(pathToFileURL(resolve('public/demos/adder-alu.html')).href);
  await expect(standalone.locator('body.demo-theme')).toBeVisible();
  await standalone.locator('#a-bit').click();await expect(standalone.locator('#results strong').first()).toHaveText('1');
  assert.equal(await standalone.locator('h1').evaluate(el=>getComputedStyle(el).fontSize),'44px');
  await standalone.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: guest hub/history, isolated AI courseware, all chapters, student/teacher navigation, quiz linkage and standalone HTML');
} finally { await browser.close(); }
