import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { gotoApp, fillLoginForm, submitLoginForm } from './lib/qaLogin.mjs';
import { clickTopNavItem } from './nav-helpers.mjs';
const app=process.env.PROTOTYPE_APP_URL??'http://127.0.0.1:5173';
mkdirSync('qa-artifacts',{recursive:true});
let browser;try{browser=await chromium.launch({channel:'msedge',headless:true});}catch{browser=await chromium.launch({headless:true});}
const page=await browser.newPage({viewport:{width:1366,height:900}}), errors=[];
page.on('pageerror',e=>errors.push(e.message));
const nav=label=>({click:()=>clickTopNavItem(page,label)});
const board=page.locator('.mind-board');
async function goBoard() {await nav('知识库').click();await page.locator('.kb-ribbon').getByRole('button',{name:'思维画板',exact:true}).click();await expect(board).toBeVisible();}
async function save() {await board.getByRole('button',{name:'保存画板',exact:true}).click();await expect(board.locator('.mind-save-status')).toHaveText('已保存到账号');}
try {
  await gotoApp(page,app);await fillLoginForm(page,{username:'demo2026001',password:'Student123!'});await submitLoginForm(page);
  await goBoard();
  await board.getByRole('button',{name:'填入存储系统示例'}).click();
  await expect(board.getByRole('button',{name:'整理成导图',exact:true})).toBeDisabled();
  await board.locator('.mind-source input[type=checkbox]').check();
  await board.getByRole('button',{name:'整理成导图',exact:true}).click();
  await expect(board.locator('.react-flow__node')).toHaveCount(10);
  await expect(board.locator('.mind-notice')).toContainText('本地提纲整理');
  await board.getByLabel('画板名称',{exact:true}).fill('存储系统测试画板');
  await board.getByLabel('选择编辑节点').selectOption('n1');
  await board.getByLabel('节点文字',{exact:true}).fill('高速缓存 Cache');
  await board.getByLabel('节点字号').selectOption('22');
  await board.getByLabel('节点颜色').fill('#123456');
  await board.getByRole('button',{name:'＋ 添加子节点'}).click();
  await board.getByLabel('节点文字',{exact:true}).fill('写回策略');
  await expect(board.locator('.react-flow__node')).toHaveCount(11);
  await board.getByRole('button',{name:'撤销',exact:true}).click();
  await expect(board.getByLabel('节点文字',{exact:true})).toHaveValue('新知识点');
  await board.getByRole('button',{name:'重做',exact:true}).click();
  await expect(board.getByLabel('节点文字',{exact:true})).toHaveValue('写回策略');
  await board.locator('.mind-relations>summary').click();
  await board.getByLabel('关系起点').selectOption('n1');await board.getByLabel('关系终点').selectOption('n4');await board.getByLabel('关系说明',{exact:true}).fill('交换数据');
  await board.getByRole('button',{name:'添加关系箭头',exact:true}).click();
  await expect(board.locator('.mind-relation')).toHaveCount(1);
  await save();
  let list=(await (await page.request.get(app+'/api/mind-maps')).json()).maps;const id=list[0].id;
  let stored=(await (await page.request.get(app+`/api/mind-maps/${id}`)).json()).map;
  assert.equal(stored.graph.nodes.find(n=>n.id==='n1').fontSize,22);assert.equal(stored.graph.nodes.find(n=>n.id==='n1').color,'#123456');assert.equal(stored.graph.relations[0].label,'交换数据');
  // Dragging persists actual positions, rather than merely moving a DOM node.
  const node=board.locator('.react-flow__node[data-id="n1"]');await node.scrollIntoViewIfNeeded();const box=await node.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+50,box.y+box.height/2+25,{steps:10});await page.mouse.up();
  await save();const moved=(await (await page.request.get(app+`/api/mind-maps/${id}`)).json()).map;
  assert.notEqual(moved.graph.nodes.find(n=>n.id==='n1').x,stored.graph.nodes.find(n=>n.id==='n1').x);
  await board.getByLabel('画板名称',{exact:true}).fill('恢复的本机草稿');
  page.once('dialog',d=>d.accept());await page.reload({waitUntil:'domcontentloaded'});await goBoard();
  await expect(board.getByLabel('画板名称',{exact:true})).toHaveValue('恢复的本机草稿');
  await save();
  const svgPromise=page.waitForEvent('download');await board.getByRole('button',{name:'导出 SVG',exact:true}).click();const svgDownload=await svgPromise;await svgDownload.saveAs('qa-artifacts/mind-map-export.svg');
  const svg=readFileSync('qa-artifacts/mind-map-export.svg','utf8');assert.ok(svg.includes('写回策略')&&svg.includes('交换数据')&&svg.includes('#123456'));
  const pngPromise=page.waitForEvent('download');await board.getByRole('button',{name:'导出 PNG',exact:true}).click();const png=await pngPromise;await png.saveAs('qa-artifacts/mind-map-export.png');assert.ok(readFileSync('qa-artifacts/mind-map-export.png').length>1000);
  await board.locator('.mind-optimize-consent input').check();
  await board.getByRole('button',{name:'重排与配色',exact:true}).click();await expect(board.locator('.mind-notice')).toContainText('本地重排');
  await save();
  await page.screenshot({path:'qa-artifacts/mind-map-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile must not overflow');
  await expect.poll(()=>board.locator('.mind-canvas').evaluate(canvas=>{const b=canvas.getBoundingClientRect();return [...canvas.querySelectorAll('.react-flow__node')].every(node=>{const n=node.getBoundingClientRect();return n.left>=b.left-1 && n.right<=b.right+1 && n.top>=b.top-1 && n.bottom<=b.bottom+1;});}),{message:'resizing must fit the full graph'}).toBe(true);
  await board.getByLabel('选择编辑节点').selectOption('n4');await board.getByLabel('节点文字',{exact:true}).fill('主存（手机编辑）');await save();
  await page.screenshot({path:'qa-artifacts/mind-map-mobile.png',fullPage:true});
  // Browser-side deterministic AI fixtures verify image transport and failure preservation.
  // Real provider transport, schema and large payloads are checked by server tests.
  await page.route('**/api/mind-maps/capabilities',r=>r.fulfill({json:{textAi:true,imageAi:true}}));
  await nav('课程课件').click();await expect(board).toHaveCount(0);await goBoard();
  await board.getByLabel('打开已保存画板').selectOption(String(id));await expect(board.locator('.react-flow__node')).toHaveCount(11);
  await board.locator('.mind-source>summary').click();await board.getByRole('tab',{name:'图片转导图',exact:true}).click();
  await board.getByLabel('选择思维导图图片').setInputFiles('qa-artifacts/mind-map-export.png');await expect(board.locator('.mind-image-preview img')).toBeVisible();
  await board.locator('.mind-source input[type=checkbox]').check();
  let payload;
  await page.route('**/api/mind-maps/generate',async route=>{payload=route.request().postDataJSON();await route.fulfill({status:502,json:{error:'图片识别服务测试失败'}});});
  await board.getByRole('button',{name:'AI 生成导图',exact:true}).click();await expect(board.locator('.mind-error')).toContainText('图片识别服务测试失败');await expect(board.locator('.react-flow__node')).toHaveCount(11);
  assert.ok(payload.image.startsWith('data:image/png;base64,'));assert.equal(payload.consent,true);assert.ok(!('grades' in payload));
  await page.unroute('**/api/mind-maps/generate');
  await page.route('**/api/mind-maps/generate',r=>r.fulfill({json:{source:'ai',notice:'测试视觉返回：请核对原图',graph:{title:'识别后的导图',nodes:[{id:'root',label:'识别主题',parentId:null},{id:'n1',label:'识别分支',parentId:'root'}],relations:[]}}}));
  await board.getByRole('button',{name:'AI 生成导图',exact:true}).click();await expect(board.locator('.react-flow__node')).toHaveCount(2);await expect(board.getByLabel('画板名称',{exact:true})).toHaveValue('识别后的导图');
  await page.unroute('**/api/mind-maps/generate');await page.unroute('**/api/mind-maps/capabilities');
  await board.getByRole('button',{name:'保存画板',exact:true}).click();await expect(board.locator('.mind-save-status')).toHaveText('已保存到账号');
  await board.getByRole('button',{name:'删除已保存画板',exact:true}).click();await board.getByRole('button',{name:'确认删除画板',exact:true}).click();await expect(board.locator('.mind-empty')).toBeVisible();
  // Teacher navigation reaches the same working feature with a separate owner scope.
  const teacher=await browser.newPage({viewport:{width:1366,height:900}});
  await gotoApp(teacher,app);await fillLoginForm(teacher,{username:process.env.TEACHER_USERNAME??'teacher',password:process.env.TEACHER_PASSWORD??'ChangeMe123!'});await teacher.locator('[data-login-role="teacher"]').click();await submitLoginForm(teacher);
  await clickTopNavItem(teacher,'知识库');await teacher.locator('.kb-ribbon').getByRole('button',{name:'思维画板',exact:true}).click();
  await expect(teacher.locator('.mind-board')).toBeVisible();await expect(teacher.getByLabel('打开已保存画板')).toHaveValue('');
  assert.equal((await (await teacher.request.get(app+'/api/mind-maps')).json()).maps.length,0);
  assert.deepEqual(errors,[]);
  console.log('思维画板验收通过：生成、编辑、关系箭头、拖动、撤销重做、保存恢复、完整 PNG/SVG 导出、手机布局、图片流程与错误保留、教师账号隔离。视觉流程使用测试响应，未调用外部 AI。');
}catch(e){await page.screenshot({path:'qa-artifacts/mind-map-failure.png',fullPage:true});throw e;}
finally{await browser.close();}
