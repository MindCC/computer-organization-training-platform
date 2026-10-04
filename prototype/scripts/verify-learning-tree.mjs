import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {gotoApp,fillLoginForm} from './lib/qaLogin.mjs';
import {LEARNING_ITEMS} from '../src/platformLogic.js';
import {COURSE_CHAPTERS,chapterIdOf} from '../src/courseChapters.js';

const artifacts=process.env.QA_ARTIFACT_DIR??'qa-artifacts';await mkdir(artifacts,{recursive:true});
let browser;try{browser=await chromium.launch({channel:'msedge',headless:true});}catch{browser=await chromium.launch({headless:true});}
const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'reduce'});const errors=[];page.on('pageerror',error=>errors.push(error.message));
const canvas=page.locator('.learning-tree-canvas');
const zoom=async()=>Number(await canvas.getAttribute('data-zoom'));
async function enterRecords(){await page.getByRole('button',{name:'学习记录',exact:true}).click();const treeSection=page.locator("[data-testid='records-tree-section']");await treeSection.waitFor();if(!(await treeSection.evaluate(el=>el.open)))await treeSection.locator('summary').click();await expect(canvas).toBeVisible();}
async function positionCanvas(){await canvas.evaluate(el=>{const nav=document.querySelector('.topbar');window.scrollTo(0,el.getBoundingClientRect().top+window.scrollY-(nav?.getBoundingClientRect().height??90)-12);});}
async function capturePanel(path){await page.evaluate(()=>window.scrollTo(0,0));const clip=await page.locator('.records-tree-panel').boundingBox();await page.screenshot({path,clip,fullPage:true});}
try{
  await gotoApp(page,process.env.PROTOTYPE_APP_URL??'http://127.0.0.1:5173');await fillLoginForm(page,{username:'',password:''});await page.locator('.demo-login-button').click();
  await expect(page.locator('.course-adventure-map')).toBeVisible();await enterRecords();
  await expect(page.locator('.tree-leaf')).toHaveCount(LEARNING_ITEMS.length);await expect(page.locator('.tree-chapter-label')).toHaveCount(8);
  // 每章全部真实实验都能从侧栏进入，包括密集的第 3 章、硬件装机和未解锁项。
  for(const chapter of COURSE_CHAPTERS){
    await page.getByLabel('查看章节',{exact:true}).selectOption(chapter.id);
    const items=LEARNING_ITEMS.filter(item=>chapterIdOf(item)===chapter.id);
    await expect(page.locator('.tree-experiment')).toHaveCount(items.length);
    await expect(page.locator('.tree-detail-heading h2')).toHaveText(chapter.title.replace(/^第[一二三四五六七八九十\d]+章\s*/,''));
    const fit=await zoom();await page.getByRole('button',{name:'放大本章',exact:true}).click();assert.ok(await zoom()>fit,`${chapter.id} 没有聚焦`);
    await page.getByRole('button',{name:'适应视图',exact:true}).click();
  }
  await positionCanvas();
  // 适应视图中每片叶子均留在画布内，而且章节标签不会覆盖叶子的中心。
  const covered=await canvas.evaluate(el=>{
    const rect=el.getBoundingClientRect();const labels=[...el.querySelectorAll('.tree-chapter-label')].map(item=>item.getBoundingClientRect());
    return [...el.querySelectorAll('.leaf-hit')].flatMap(leaf=>{const box=leaf.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
      return x<rect.left||x>rect.right||y<rect.top||y>rect.bottom||labels.some(label=>x>label.left&&x<label.right&&y>label.top&&y<label.bottom)?[leaf.closest('[data-leaf-id]').dataset.leafId]:[];});
  });assert.deepEqual(covered,[],'叶子被裁剪或被章节标签遮挡');
  await page.locator('.tree-chapter-label').filter({hasText:'运算单元设计'}).click();await expect(page.locator('.tree-experiment')).toHaveCount(LEARNING_ITEMS.filter(item=>chapterIdOf(item)==='ch3').length);
  const before=await zoom();await page.getByRole('button',{name:'放大',exact:true}).click();assert.ok(await zoom()>before);
  await page.getByRole('button',{name:'缩小',exact:true}).click();assert.ok(Math.abs(await zoom()-before)<.001);
  await positionCanvas();const rect=await canvas.boundingBox();await page.mouse.move(rect.x+rect.width*.75,rect.y+rect.height*.5);
  await page.mouse.wheel(0,-160);await expect.poll(zoom).toBeGreaterThan(before);
  const pan=await canvas.getAttribute('data-pan');await page.mouse.move(rect.x+rect.width*.85,rect.y+rect.height*.6);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.85+40,rect.y+rect.height*.6+30,{steps:4});await page.mouse.up();assert.notEqual(await canvas.getAttribute('data-pan'),pan);
  await page.getByRole('button',{name:'适应视图',exact:true}).click();
  const leaf=page.locator('[data-leaf-id="data-flow"]');await leaf.hover();await expect(page.getByRole('tooltip')).toContainText('认识数据流');await leaf.locator('.leaf-hit').click();await expect(page.locator('.lab-studio')).toBeVisible();
  await enterRecords();await page.locator('[data-leaf-id="machine-number"]').focus();await page.keyboard.press('Enter');await expect(page.locator('.lab-studio')).toBeVisible();
  await enterRecords();await page.getByLabel('查看章节',{exact:true}).selectOption('ch8');await page.locator('.tree-experiment').filter({hasText:LEARNING_ITEMS.find(item=>item.id==='io-transfer').title}).click();await expect(page.locator('.lab-studio')).toBeVisible();
  await enterRecords();
  for(const width of [1366,1093,768,390,320]){
    await page.setViewportSize({width,height:768});await page.getByRole('button',{name:'适应视图',exact:true}).click();
    const geometry=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,canvas:document.querySelector('.learning-tree-canvas').getBoundingClientRect().width,labelSize:getComputedStyle(document.querySelector('.tree-chapter-label')).fontSize,offenders:[...document.querySelectorAll('.records-screen *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1&&el.getBoundingClientRect().width>0).map(el=>`${el.tagName}.${el.className.baseVal??el.className}:${Math.round(el.getBoundingClientRect().right)}`).slice(0,20)}));
    if(geometry.overflow){console.log(geometry);await page.screenshot({path:`${artifacts}/tree-overflow.png`});}
    assert.equal(geometry.overflow,false,`${width}px 横向溢出 ${geometry.offenders.join(', ')}`);assert.ok(geometry.canvas>150);assert.ok(parseFloat(geometry.labelSize)>=11);
    for(const id of ['ch1','ch3','ch8']){await page.getByLabel('查看章节',{exact:true}).selectOption(id);await expect(page.locator('.tree-experiment')).toHaveCount(LEARNING_ITEMS.filter(item=>chapterIdOf(item)===id).length);}
    console.log(`PASS ${width}px: 章节切换、完整实验列表、无横向溢出`);
    if(width===390)await capturePanel(`${artifacts}/tree-mobile.png`);
  }
  await page.setViewportSize({width:1366,height:900});await page.getByLabel('查看章节',{exact:true}).selectOption('ch3');await page.getByRole('button',{name:'适应视图',exact:true}).click();await page.mouse.move(0,0);
  await capturePanel(`${artifacts}/tree-after.png`);
  await page.getByRole('button',{name:'放大本章',exact:true}).click();await capturePanel(`${artifacts}/tree-focus.png`);
  assert.deepEqual(errors,[]);
  console.log('PASS 36 片叶子 / 8 个章节、章节聚焦、鼠标与键盘实验导航、滚轮缩放、拖动平移、零页面异常');
}finally{await browser.close();}
