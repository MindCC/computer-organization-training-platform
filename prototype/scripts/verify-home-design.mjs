import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { gotoApp, fillLoginForm, submitLoginForm } from './lib/qaLogin.mjs';
import { CHALLENGES, LEARNING_ITEMS } from '../src/platformLogic.js';
import { COURSEWARE } from '../src/courseware.js';

const app=process.env.PROTOTYPE_APP_URL??'http://127.0.0.1:5173/';
const artifacts=process.env.QA_ARTIFACT_DIR??'qa-artifacts';
await mkdir(artifacts,{recursive:true});
let browser;
try{browser=await chromium.launch({channel:'msedge',headless:true});}catch{browser=await chromium.launch({headless:true});}
const page=await browser.newPage({viewport:{width:1366,height:768}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
  await gotoApp(page,app);await fillLoginForm(page,{username:'',password:''});await page.locator('.demo-login-button').click();
  await expect(page.locator('.project-chapter-board')).toBeVisible();
  if(process.argv.includes('--preview')){
    await page.screenshot({path:`${artifacts}/home-preview.png`});
  }else if(process.argv.includes('--baseline')){
    await page.screenshot({path:`${artifacts}/home-before-desktop.png`,fullPage:true});
  }else{
    const home=page.locator('.quest-student-home');
    await expect(home.getByRole('heading',{name:'把原理，接成电路。',exact:true})).toBeVisible();
    await expect(page.locator('.home-workshop-scene img')).toBeVisible();
    assert.ok(await page.locator('.home-workshop-scene img').evaluate(image=>image.complete&&image.naturalWidth>0));
    // Actual text/background colors, including transparent ancestors. Icons are excluded.
    async function readable(){
      const failures=await home.evaluate(root=>{
        const rgb=s=>(s.match(/[\d.]+/g)??[]).map(Number);
        const luminance=c=>c.slice(0,3).map(n=>n/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
        return [...root.querySelectorAll('*')].filter(el=>!el.closest('svg')&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&el.getBoundingClientRect().width>0).flatMap(el=>{
          const style=getComputedStyle(el),foreground=rgb(style.color);let ancestor=el,background=[255,255,255];
          while(ancestor){const color=rgb(getComputedStyle(ancestor).backgroundColor);if(color.length===3||color[3]===1){background=color;break;}ancestor=ancestor.parentElement;}
          const a=luminance(foreground),b=luminance(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
          const large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700);
          return ratio<(large?3:4.5)?[{text:el.textContent.trim().slice(0,45),ratio:Number(ratio.toFixed(2)),color:style.color}]:[];
        });
      });
      assert.deepEqual(failures,[],'首页实际文本对比度');
    }
    await readable();
    for(const width of [1366,1093,768,390,320]){
      await page.setViewportSize({width,height:width<500?844:768});
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      const action=await home.locator('.quest-primary-action').boundingBox();
      assert.ok(action&&action.x>=0&&action.x+action.width<=width&&action.y+action.height<=844,'当前任务入口清楚可见');
      await page.screenshot({path:`${artifacts}/home-after-${width}.png`,fullPage:true});
    }
    await page.setViewportSize({width:1366,height:768});
    const chapters=home.locator('.project-chapter');await expect(chapters).toHaveCount(8);
    for(let index=0;index<8;index++){
      const chapter=chapters.nth(index),toggle=chapter.locator('.project-chapter-toggle');
      await toggle.focus();
      if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded','true');
      const id=await toggle.getAttribute('aria-controls');await expect(page.locator(`#${id}`)).toBeVisible();
      const expected=(COURSEWARE.chapters.find(c=>c.id===`ch${index+1}`)?.demos??[]).map(d=>d.href);
      assert.deepEqual(await chapter.locator('a.demo-entry').evaluateAll(entries=>entries.map(e=>e.getAttribute('href'))),expected);
    }
    await expect(home.locator('button.project-experiment-row')).toHaveCount(CHALLENGES.length+6);
    await readable();
    const demo=home.locator('a.demo-entry[href="/demos/addressing.html"]');
    const popupPromise=page.waitForEvent('popup');await demo.click();const popup=await popupPromise;
    await expect(popup.locator('#platform-link-badge')).toContainText('已连接学情');await popup.close();
    await home.locator('.project-experiment-row').filter({hasText:'三位偶校验'}).click();
    await expect(page.getByTestId('react-flow-circuit-canvas')).toBeVisible();
    await page.getByRole('button',{name:'课程首页',exact:true}).first().click();
    await expect(home.locator('.project-chapter-board')).toBeVisible();
    // UI-only completion fixture; no scores or progress are written to the API.
    await page.route('**/api/student/progress',async route=>{
      const response=await route.fetch(),body=await response.json();
      body.progress=Object.fromEntries(LEARNING_ITEMS.map(item=>[item.id,{status:'completed',attempts:1,bestScore:item.grading==='participation'?0:100,elapsedMinutes:1}]));
      await route.fulfill({response,json:body});
    });
    await page.reload();await expect(home.getByRole('heading',{name:'课程路线已完成',exact:true})).toBeVisible();
    await expect(home.locator('.quest-hero-stats')).toContainText('100');
    await readable();await page.screenshot({path:`${artifacts}/home-after-completed.png`});
    await page.unroute('**/api/student/progress');
    await page.locator('.profile-button').click();await page.getByRole('button',{name:'退出登录',exact:true}).click();
    await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('button',{name:'先浏览课程',exact:true}).click();
    await expect(home.locator('.first-use-guide')).toBeVisible();await expect(home.locator('.quest-empty-banner')).toBeVisible();
    await expect(home.locator('.quest-hero-stats')).toContainText('暂无成绩');
    await readable();await page.screenshot({path:`${artifacts}/home-after-first-use.png`,fullPage:true});
    await page.getByRole('button',{name:'跳过引导',exact:true}).click();await expect(home.locator('.first-use-guide')).toHaveCount(0);
    await page.reload();await expect(home.locator('.first-use-guide')).toHaveCount(0);
    await home.getByRole('button',{name:'开始第一个实验',exact:true}).click();await expect(page.locator('#login-username')).toBeVisible();
    console.log('PASS: solid readable surfaces, text contrast, desktop/scaled/mobile, 8 keyboard chapter toggles, 36 experiments, 8 demo entries, linked popup, new circuit navigation, guest guidance and dismissal persistence');
  }
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
