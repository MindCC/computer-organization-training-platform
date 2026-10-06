import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { gotoApp, fillLoginForm, submitLoginForm } from './lib/qaLogin.mjs';
import { clickTopNavItem } from './nav-helpers.mjs';
import { acceptCustomerOrder } from './lib/qaShop.mjs';
import { openChallengeFromHome } from './lib/qaHome.mjs';
import { CABLES } from '../src/completeAssembly.js';
import { CHALLENGES } from '../src/platformLogic.js';
const app=process.env.PROTOTYPE_APP_URL,dir=path.resolve('qa-artifacts/study-companion');mkdirSync(dir,{recursive:true});
let browser;try{browser=await chromium.launch({channel:'msedge',headless:true});}catch{browser=await chromium.launch({headless:true});}
const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const pet=page.getByTestId('study-companion'),trigger=pet.getByRole('button'),dialog=page.locator('.study-companion-dialog'),live=dialog.getByRole('region',{name:'当前现场状态'});
async function post(url,data,method='POST'){const r=await page.request.fetch(app+url,{method,data});assert.ok(r.ok(),`${url}: ${r.status()} ${await r.text()}`);return r.json();}
async function close(){await dialog.getByRole('button',{name:'关闭小芯助教'}).click();}
try{
 await post('/api/auth/login',{username:'teacher',password:'ChangeMe123!'});
 const cls=(await post('/api/classes',{name:'随行学伴验收班'})).class;
 const username=`companion-${Date.now()}`;
 await post(`/api/teacher/classes/${cls.id}/import-students`,{csv:`username,displayName,password\n${username},随行验收学生,Student123!`});
 await post(`/api/teacher/classes/${cls.id}/skip-locked`,{allow:true},'PUT');await post('/api/auth/logout',{});
 await gotoApp(page,app);await fillLoginForm(page,{username,password:'Student123!'});await submitLoginForm(page);
 await expect(pet).toBeVisible();await expect(pet).toHaveCount(1);
 const before=await pet.boundingBox();await page.mouse.move(before.x+45,before.y+35);await page.mouse.down();await page.mouse.move(55,180,{steps:8});await page.mouse.up();await expect(dialog).toHaveCount(0);
 const moved=await pet.boundingBox();assert.ok(moved.x<100);await trigger.focus();await page.keyboard.press('ArrowRight');assert.ok((await pet.boundingBox()).x>moved.x);
 await trigger.click();await expect(dialog).toBeVisible();await close();
 await clickTopNavItem(page,'硬件配置挑战');await acceptCustomerOrder(page);
 const work=page.getByRole('region',{name:'3D 交互装机工作台'});
 await expect(work).toBeVisible();await page.getByRole('button',{name:'专注装机 ↗',exact:true}).click();
 await page.getByRole('button',{name:'打开侧板',exact:true}).click();await page.getByRole('button',{name:'固定主板',exact:true}).click();await page.getByRole('button',{name:'固定电源',exact:true}).click();
 for(const name of ['处理器','内存','硬盘']){await page.locator('.assembly-part-tabs button').filter({hasText:name}).click();await page.locator('.assembly-part-config').getByRole('button',{name:/^安装到/}).click();}
 await page.locator('.assembly-part-tabs button').filter({hasText:'显卡'}).click();await page.locator('#assembly-variant').selectOption('gpu-entry');await page.locator('.assembly-part-config').getByRole('button',{name:'安装到PCIe 插槽',exact:true}).click();
 await page.getByRole('button',{name:'固定CPU 散热器',exact:true}).click();await page.getByRole('button',{name:'合上侧板',exact:true}).click();
 await expect(page.locator('.assembly-counter')).toContainText('4 / 4');await expect(page.locator('.assembly-counter')).toContainText('接线 0/5');
 const boot=page.getByRole('button',{name:'开机自检',exact:true});await expect(boot).toBeEnabled();await boot.click();await expect(page.locator('.assembly-action-strip')).toContainText('还缺 5 项');await expect(page.locator('.assembly-boot')).toHaveCount(0);
 await trigger.click();await expect(live).toContainText('还缺 5 项');await expect(live).toContainText('打开侧板');
 const top=await trigger.evaluate(e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+25)?.closest('[data-testid="study-companion"]')!==null;});assert.ok(top);
 await dialog.getByLabel('你的课程问题').fill('为什么部件装齐了却不能开机？');
 let sent=page.waitForRequest(r=>r.url().endsWith('/api/student/study-assistant')&&r.method()==='POST');await dialog.getByRole('button',{name:'发送到 DeepSeek'}).click();let payload=(await sent).postDataJSON();assert.ok(!payload.context.assembly);await expect(dialog.locator('.study-mascot-source')).toBeVisible();
 await dialog.getByLabel('本次提问附带当前装配与接线快照').check();sent=page.waitForRequest(r=>r.url().endsWith('/api/student/study-assistant')&&r.method()==='POST');await dialog.getByRole('button',{name:'发送到 DeepSeek'}).click();payload=(await sent).postDataJSON();assert.equal(payload.stateConsent,'current-task-state');assert.equal(payload.context.assembly.structure.open,false);assert.ok(!JSON.stringify(payload).includes(username));
 await expect(dialog).toContainText('还缺 5 项');await page.screenshot({path:path.join(dir,'assembly-blockers-desktop.png')});await close();
 await page.getByRole('button',{name:'打开侧板',exact:true}).click();
 await expect(page.getByLabel('线缆端')).toBeVisible();
 const canvas=await work.locator('canvas').boundingBox(),workBounds=await work.boundingBox();assert.ok(canvas.height>workBounds.height*.5,'focused scene remains primary');
 for(const cable of CABLES){await page.getByLabel('线缆端').selectOption(cable.from);await page.getByLabel('目标接口',{exact:true}).selectOption(cable.to);await page.getByRole('button',{name:'连接接口',exact:true}).click();}
 await trigger.click();await expect(live).toContainText('可以开机自检');await expect(dialog.locator('.companion-stale')).toBeVisible();await close();
 await page.getByRole('button',{name:'合上侧板',exact:true}).click();await boot.click();await expect(page.locator('.assembly-boot')).toContainText('开机成功',{timeout:12000});
 await trigger.click();await expect(live).toContainText('自检已通过');await close();await page.keyboard.press('Escape');
 await clickTopNavItem(page,'课后作业');await expect(pet).toHaveCount(1);await trigger.click();await expect(dialog).not.toContainText('装配与接线快照');await close();
 const row=page.locator('.practice-question').first();await row.locator('.study-mascot-trigger').click();await expect(dialog).toHaveCount(1);await dialog.getByLabel('你的课程问题').fill('解释本题的思路');sent=page.waitForRequest(r=>r.url().endsWith('/api/student/study-assistant')&&r.method()==='POST');await dialog.getByRole('button',{name:'发送到 DeepSeek'}).click();payload=(await sent).postDataJSON();assert.equal(payload.context.questionId,await row.getAttribute('data-qid'));await expect(dialog.locator('.study-mascot-source')).toBeVisible();await close();
 for(const name of ['学习记录','错题本','知识库','AI讲演','互动演示','课程首页']){await clickTopNavItem(page,name);await expect(pet).toBeVisible();await expect(pet).toHaveCount(1);}
 await openChallengeFromHome(page,CHALLENGES.find(c=>c.id==='full-adder').title);await trigger.click();await expect(dialog).toContainText('全加器');await expect(live).not.toContainText('装机');await close();
 await page.getByRole('button',{name:'填入参考结构',exact:true}).click();await trigger.click();await expect(live).toContainText('当前输入的输出已计算');await expect(dialog.getByLabel('本次提问附带当前电路输入与检查计数')).toBeVisible();
 await page.screenshot({path:path.join(dir,'circuit-live-desktop.png')});await close();await clickTopNavItem(page,'课程首页');
 await page.setViewportSize({width:390,height:844});await expect(pet).toBeVisible();let bounds=await pet.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.y+bounds.height<=844);
 await trigger.click();bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.y+bounds.height<=844);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:path.join(dir,'companion-mobile.png')});await page.setViewportSize({width:320,height:480});bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=320&&bounds.y+bounds.height<=480);await expect(dialog.getByRole('button',{name:'关闭小芯助教'})).toBeVisible();await close();await expect(dialog).toHaveCount(0);
 await page.setViewportSize({width:1366,height:768});await page.reload({waitUntil:'domcontentloaded'});await expect(pet).toBeVisible();bounds=await pet.boundingBox();assert.ok(bounds.x<300,'drag position survives reload');
 await page.locator('.profile-button').click();await page.getByRole('button',{name:'退出登录',exact:true}).click();await expect(pet).toHaveCount(0);
 await fillLoginForm(page,{username:'teacher',password:'ChangeMe123!'});await page.locator('[data-login-role="teacher"]').click();await submitLoginForm(page);await clickTopNavItem(page,'学习记录');await expect(pet).toHaveCount(0);await page.getByLabel('学情查看对象').selectOption('mine');await expect(pet).toBeVisible();
 assert.deepEqual(errors,[]);console.log('PASS companion: blocked POST → live troubleshooting → five cables → successful boot; drag/keyboard/persistence; all student pages; current circuit draft; explicit state consent; 390/320 mobile; teacher review isolation');
}finally{await browser.close();}
