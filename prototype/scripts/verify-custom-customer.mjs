import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium,expect } from '@playwright/test';
import { gotoApp,fillLoginForm,submitLoginForm } from './lib/qaLogin.mjs';
import { clickTopNavItem } from './nav-helpers.mjs';
let browser;try{browser=await chromium.launch({channel:'msedge',headless:true});}catch{browser=await chromium.launch({headless:true});}
const artifacts=process.env.QA_ARTIFACT_DIR??'qa-artifacts';await mkdir(artifacts,{recursive:true});let page;
try{
  page=await browser.newPage({viewport:{width:1366,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await gotoApp(page,process.env.PROTOTYPE_APP_URL??'http://127.0.0.1:5173');await fillLoginForm(page,{username:'demo2026001',password:'Student123!'});await submitLoginForm(page);
  const enter=async()=>{await clickTopNavItem(page,'硬件配置挑战');await page.getByRole('button',{name:'自定义客户 · AI',exact:true}).click();};await enter();
  const scene=page.getByRole('region',{name:'自定义客户工坊'});await expect(scene).toHaveAttribute('data-custom-mode','create');await expect(scene.locator('canvas')).toHaveCount(0);
  await page.getByLabel('名字',{exact:true}).fill('阿禾');await page.getByLabel('职业',{exact:true}).fill('社区志愿者');await page.getByLabel('性格',{exact:true}).fill('温和、仔细，喜欢先问清楚再决定');
  const requirements=page.getByRole('textbox',{name:'装机需求',exact:true});
  await requirements.fill('做文档、表格、网课，资料约200GB，明确至少8GB内存、256GB空间，要SSD，不玩游戏、不做视频剪辑，集成显卡即可。元件预算2200元。');
  await page.locator('.custom-character').evaluate(img=>img.decode());await scene.screenshot({path:path.join(artifacts,'custom-customer-editor.png')});
  // Exercise visible failure without consuming a model call or manufacturing an order.
  await page.route('**/api/student/custom-customers',route=>route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:{code:'AI_TIMEOUT',message:'AI 分析超时，请保留需求并重试'}})}));
  await page.getByRole('button',{name:'分析需求 · 生成客户剧情',exact:true}).click();await expect(page.getByRole('alert')).toContainText('AI 分析超时');await expect(scene).toHaveAttribute('data-custom-mode','create');await expect(requirements).toHaveValue(/资料约200GB/);await page.unroute('**/api/student/custom-customers');
  // Real configured DeepSeek call and real persisted server order (no fixture on success).
  const generated=page.waitForResponse(r=>r.url().endsWith('/api/student/custom-customers')&&r.request().method()==='POST',{timeout:75000});
  await page.getByRole('button',{name:'分析需求 · 生成客户剧情',exact:true}).click();const response=await generated;const data=await response.json();assert.equal(response.status(),201,JSON.stringify(data));
  const order=data.order;assert.equal(order.source,'ai');assert.ok(order.targets);assert.equal(order.targets.budget,2200);assert.ok(order.targets.memory>=8);assert.ok(order.targets.storageCapacity>=256);
  await writeFile(path.join(artifacts,'custom-ai-live.json'),JSON.stringify(order,null,2));
  await expect(scene).toHaveAttribute('data-custom-mode','dialogue');await scene.screenshot({path:path.join(artifacts,'custom-customer-dialogue.png')});
  for(let i=0;i<8&&await scene.getAttribute('data-custom-mode')==='dialogue';i++){const choice=scene.locator('.shop-choices button').first();await choice.click();}
  await expect(scene).toHaveAttribute('data-custom-mode','offers');await expect(page.getByRole('button',{name:'采用经济方案',exact:true})).toBeEnabled();await scene.screenshot({path:path.join(artifacts,'custom-customer-offers.png')});
  await page.getByRole('button',{name:'采用经济方案',exact:true}).click();await page.getByRole('button',{name:'接下自由工单 · 开始装机',exact:true}).click();
  const workshop=page.getByRole('region',{name:'3D 交互装机工作台'});await expect(workshop.locator('canvas')).toHaveAttribute('data-model-source','blender-glb');await expect(page.getByRole('button',{name:'交付自定义工单',exact:true})).toBeDisabled();
  for(const name of ['打开侧板','固定主板','固定电源'])await page.getByRole('button',{name,exact:true}).press('Enter');
  for(const [label,socket] of [['处理器','CPU 插座'],['内存','DIMM 插槽'],['硬盘','硬盘托架']]){await page.locator('.assembly-part-tabs button').filter({hasText:label}).press('Enter');await page.getByRole('button',{name:'安装到'+socket,exact:true}).last().press('Enter');}
  await page.getByRole('button',{name:'固定CPU 散热器',exact:true}).press('Enter');
  for(const [from,to] of [['psu-atx','board-atx'],['psu-cpu','cpu-power'],['cooler-fan','cpu-fan'],['ssd-data','board-sata'],['psu-sata','ssd-power']]){await page.getByRole('combobox',{name:'线缆端',exact:true}).selectOption(from);await page.getByRole('combobox',{name:'目标接口',exact:true}).selectOption(to);await page.getByRole('button',{name:'连接接口',exact:true}).press('Enter');}
  await page.getByRole('button',{name:'开机自检',exact:true}).press('Enter');await expect(workshop.locator('canvas')).toHaveAttribute('data-monitor-message','开机成功',{timeout:10000});await expect(workshop.locator('canvas')).toHaveAttribute('data-pc-pose','upright');
  await page.route('**/api/student/custom-customers/*/receipts',route=>route.abort());await page.getByRole('button',{name:'交付自定义工单',exact:true}).click();await expect(page.getByRole('alert')).toContainText('交付未完成');await expect(scene).toHaveAttribute('data-custom-mode','workshop');await page.unroute('**/api/student/custom-customers/*/receipts');
  // A server reply arriving after shutdown must not complete the current scene.
  let receivedResponse,releaseResponse;const received=new Promise(resolve=>{receivedResponse=resolve;}),held=new Promise(resolve=>{releaseResponse=resolve;});
  await page.route('**/api/student/custom-customers/*/receipts',async route=>{const serverResponse=await route.fetch();receivedResponse();await held;await route.fulfill({response:serverResponse});});
  await page.getByRole('button',{name:'交付自定义工单',exact:true}).click();await received;await page.getByRole('button',{name:'关闭电源',exact:true}).press('Enter');releaseResponse();await expect(page.getByRole('button',{name:'交付自定义工单',exact:true})).toBeDisabled();await expect(scene).toHaveAttribute('data-custom-mode','workshop');await expect(page.locator('.custom-receipt')).toHaveCount(0);await page.unroute('**/api/student/custom-customers/*/receipts');
  await page.getByRole('button',{name:'开机自检',exact:true}).press('Enter');await expect(workshop.locator('canvas')).toHaveAttribute('data-monitor-message','开机成功',{timeout:10000});
  await page.getByRole('button',{name:'交付自定义工单',exact:true}).click();await expect(scene).toHaveAttribute('data-custom-mode','receipt');await expect(scene).toContainText('服务器已记录');await scene.screenshot({path:path.join(artifacts,'custom-customer-receipt.png')});
  await page.getByRole('button',{name:'回工作台看看',exact:true}).click();await expect(workshop.locator('canvas')).toHaveAttribute('data-monitor-message','开机成功');await page.getByRole('button',{name:'关闭电源',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'交付自定义工单',exact:true})).toBeDisabled();
  await page.reload({waitUntil:'domcontentloaded'});await enter();await expect(scene).toHaveAttribute('data-custom-mode','workshop');await expect(page.getByRole('button',{name:'交付自定义工单',exact:true})).toBeDisabled();await expect(page.locator('.custom-receipt')).toHaveCount(0);
  await page.getByRole('button',{name:'修改人物与需求',exact:true}).click();await expect(page.getByLabel('名字',{exact:true})).toHaveValue('阿禾');await expect(requirements).toHaveValue(/资料约200GB/);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(artifacts,'custom-customer-mobile.png'),fullPage:true});
  await page.getByRole('button',{name:'返回剧情店铺',exact:true}).click();await expect(page.getByRole('region',{name:'芯邻装机店'})).toBeVisible();assert.deepEqual(errors,[]);
  console.log('PASS real DeepSeek story, custom editor, failure/input retention, branches, offers, real 3D/boot/delivery, power invalidation, recovery, mobile and original shop entry');
}catch(e){await page?.screenshot({path:path.join(artifacts,'custom-customer-error.png'),fullPage:true});throw e;}finally{await browser.close();}
