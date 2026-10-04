import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium,expect } from '@playwright/test';
import { gotoApp,fillLoginForm,submitLoginForm } from './lib/qaLogin.mjs';
import { HARDWARE_GAME_CASES } from '../src/hardwareGame.js';
import { storyProfile, buildStoryOffers } from '../src/hardwareStory.js';
let browser;
try{browser=await chromium.launch({channel:'msedge',headless:true});}catch{browser=await chromium.launch({headless:true});}
const artifacts=process.env.QA_ARTIFACT_DIR??'qa-artifacts';await mkdir(artifacts,{recursive:true});
async function assertSeparate(first,second,label){
  if(!await first.isVisible()||!await second.isVisible())return;
  const a=await first.boundingBox(),b=await second.boundingBox();
  const intersects=Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y);
  assert.equal(intersects,false,label);
}
async function assertReceptionLayout(page){
  await assertSeparate(page.locator('.shop-dialogue-portrait'),page.locator('.shop-dialogue-line'),'客户头像不能盖住台词');
  await assertSeparate(page.locator('.shop-dialogue-portrait'),page.locator('.shop-choices'),'客户头像不能盖住方案或价格');
  await assertSeparate(page.locator('.shop-hotspot'),page.locator('.shop-dialogue'),'装机工作台入口不能被对话框盖住');
}
let page;
try{
  page=await browser.newPage({viewport:{width:1527,height:1213},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await gotoApp(page,process.env.PROTOTYPE_APP_URL??'http://127.0.0.1:5173');
  await fillLoginForm(page,{username:'demo2026001',password:'Student123!'});await submitLoginForm(page);
  const enter=()=>page.locator('.topbar-nav .topbar-nav-item').filter({hasText:'硬件配置挑战'}).click();await enter();
  const shop=page.getByRole('region',{name:'芯邻装机店'}),stage=page.locator('.hardware-game-layout'),workshop=page.getByRole('region',{name:'3D 交互装机工作台'});
  await expect(shop).toHaveAttribute('data-chapter-node','opening');await expect(page.locator('.assembly-viewport canvas')).toHaveCount(0);
  await page.getByRole('button',{name:'打开营业门牌',exact:true}).click();
  await page.getByRole('button',{name:'客人说要快，我该怎么问？',exact:true}).click();await expect(shop).toContainText('问他做什么');
  await page.getByRole('button',{name:'知道了，先听清楚再给方案',exact:true}).click();
  await page.getByRole('button',{name:'直接上高配，肯定快吧？',exact:true}).click();await expect(shop).toHaveAttribute('data-chapter-node','redirect');
  await page.getByRole('button',{name:'你说得对，先了解具体需求',exact:true}).click();
  await page.locator('.shop-character').evaluate(img=>img.decode());
  const box=await shop.boundingBox();await page.setViewportSize({width:1527+Math.round(1487-box.width),height:1213+Math.round(1058-box.height)});
  await shop.screenshot({path:path.join(artifacts,'shop-reception.png')});
  await page.locator('.shop-dialogue').screenshot({path:path.join(artifacts,'shop-dialogue.png')});
  await page.getByRole('button',{name:'查看需求工单',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('待了解');await page.keyboard.press('Escape');
  for(const [name,reply] of [['平时主要开什么软件？','不玩大型游戏'],['资料大概有多少？','两百多 GB'],['预算准备了多少？','2200']]){await page.getByRole('button',{name,exact:true}).click();await expect(page.locator('.shop-dialogue-line')).toContainText(reply);}
  await page.getByRole('button',{name:'整理需求，给出方案',exact:true}).click();
  const originalViewport=page.viewportSize();
  for(const viewport of [{width:1366,height:768},{width:1527,height:1213},{width:390,height:844}]){
    await page.setViewportSize(viewport);await assertReceptionLayout(page);
    await shop.screenshot({path:path.join(artifacts,`shop-offers-${viewport.width}.png`)});
  }
  await page.setViewportSize(originalViewport);
  await page.getByRole('button',{name:'采用均衡方案',exact:true}).click();await expect(page.locator('.shop-quote')).toContainText('2693');
  await assertReceptionLayout(page);
  await page.getByRole('button',{name:'再比较一下方案',exact:true}).click();
  await page.getByRole('button',{name:'采用经济方案',exact:true}).click();await expect(page.locator('.shop-quote')).toContainText('1584');
  await shop.screenshot({path:path.join(artifacts,'shop-quote.png')});
  await page.getByRole('button',{name:'接下工单 · 开始装机',exact:true}).click();
  await expect(stage).toHaveAttribute('data-story-stage','1');await expect(workshop).toBeVisible();await expect(workshop.locator('canvas')).toHaveAttribute('data-model-source','blender-glb');
  await expect(page.getByRole('button',{name:'请先完成装配与开机自检',exact:true})).toBeDisabled();
  for(const name of ['打开侧板','固定主板','固定电源'])await page.getByRole('button',{name,exact:true}).press('Enter');
  for(const [label,socket] of [['处理器','CPU 插座'],['内存','DIMM 插槽'],['硬盘','硬盘托架']]){await page.locator('.assembly-part-tabs button').filter({hasText:label}).press('Enter');await page.getByRole('button',{name:'安装到'+socket,exact:true}).last().press('Enter');}
  await page.getByRole('button',{name:'固定CPU 散热器',exact:true}).press('Enter');
  for(const [from,to] of [['psu-atx','board-atx'],['psu-cpu','cpu-power'],['cooler-fan','cpu-fan'],['ssd-data','board-sata'],['psu-sata','ssd-power']]){await page.getByRole('combobox',{name:'线缆端',exact:true}).selectOption(from);await page.getByRole('combobox',{name:'目标接口',exact:true}).selectOption(to);await page.getByRole('button',{name:'连接接口',exact:true}).press('Enter');}
  await page.getByRole('button',{name:'开机自检',exact:true}).press('Enter');await expect(workshop.locator('canvas')).toHaveAttribute('data-monitor-message','开机成功',{timeout:10000});
  await expect(workshop.locator('canvas')).toHaveAttribute('data-pc-pose','upright');await expect(stage).toHaveAttribute('data-story-stage','2');
  // Revisiting the counter and confirming the same offer must keep a real boot valid.
  await page.getByRole('button',{name:'返回店铺柜台',exact:true}).click();
  await page.getByRole('button',{name:'重看客户对话',exact:true}).click();
  await page.getByRole('button',{name:'整理需求，给出方案',exact:true}).click();
  await page.getByRole('button',{name:'采用经济方案',exact:true}).click();
  await page.getByRole('button',{name:'接下工单 · 开始装机',exact:true}).click();
  await expect(workshop.locator('canvas')).toHaveAttribute('data-monitor-message','开机成功');
  await expect(page.getByRole('button',{name:'交付装机 · 提交方案',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'关闭电源',exact:true}).press('Enter');await expect(stage).toHaveAttribute('data-story-stage','1');await expect(page.getByRole('button',{name:'交付这台电脑',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'开机自检',exact:true}).press('Enter');await expect(workshop.locator('canvas')).toHaveAttribute('data-monitor-message','开机成功',{timeout:10000});
  await page.route('**/api/student/attempts',route=>route.abort());
  await page.getByRole('button',{name:'专注装机 ↗',exact:true}).click();await expect(workshop).toHaveClass(/focused/);
  await page.getByRole('button',{name:'交付这台电脑',exact:true}).click();await expect(workshop).not.toHaveClass(/focused/);
  await expect(page.locator('.hardware-receipt-sync')).toContainText('服务器同步未完成');await expect(shop).toHaveAttribute('data-chapter-node','workshop');
  await page.unroute('**/api/student/attempts');await page.getByRole('button',{name:'交付装机 · 提交方案',exact:true}).click();
  await expect(shop).toHaveAttribute('data-chapter-node','thanks');await expect(stage).toHaveAttribute('data-story-stage','3');await expect(page.locator('.shop-character')).toHaveAttribute('src','/shop-story/xiaolin-pleased.webp');
  await expect(page.getByRole('button',{name:'接待下一位客户 · 阿宁',exact:true}).filter({visible:true})).toBeEnabled();
  await shop.screenshot({path:path.join(artifacts,'shop-handover.png')});
  await page.getByRole('button',{name:'配置取舍我写进说明里了',exact:true}).click();await expect(shop).toHaveAttribute('data-chapter-node','reflection');
  await page.getByRole('button',{name:'平衡性能与成本',exact:true}).click();await expect(shop).toHaveAttribute('data-chapter-node','closing');await expect(page.locator('.shop-closing')).toContainText('394');
  await page.locator('.shop-backdrop').evaluate(img=>img.decode());
  await shop.screenshot({path:path.join(artifacts,'shop-evening.png')});
  await page.getByRole('button',{name:'接待下一位客户 · 阿宁',exact:true}).filter({visible:true}).click();
  await expect(page.getByRole('region',{name:'客户接待'})).toContainText('阿宁');await expect(stage).toHaveAttribute('data-story-stage','0');await expect(page.locator('.hardware-receipt-sync')).toHaveCount(0);
  await expect(shop).toHaveAttribute('data-customer','阿宁');
  await expect(page.locator('.shop-character')).toHaveAttribute('src','/shop-story/aning.webp');
  await page.locator('.shop-character').evaluate(img=>img.decode());
  assert.ok(await page.locator('.shop-character').evaluate(img=>img.naturalWidth>0));
  await page.getByRole('button',{name:'预算最多能到多少？',exact:true}).click();
  await expect(page.locator('.shop-dialogue-line')).toContainText('元件预算');
  await page.getByRole('button',{name:'查看需求工单',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('阿宁');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'整理需求，给出方案',exact:true}).click();
  for(const viewport of [{width:1366,height:768},{width:390,height:844}]){
    await page.setViewportSize(viewport);await assertReceptionLayout(page);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:path.join(artifacts,`aning-reception-${viewport.width}.png`),fullPage:true});
  }
  await page.setViewportSize(originalViewport);
  await page.getByRole('button',{name:'采用经济方案',exact:true}).click();await expect(page.locator('.shop-quote')).toContainText('交付总报价');
  await page.getByRole('button',{name:'接下工单 · 开始装机',exact:true}).click();await expect(workshop).toBeVisible();
  await expect(page.getByRole('button',{name:'请先完成装配与开机自检',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'返回店铺柜台',exact:true}).click();await expect(page.locator('.shop-character')).toBeVisible();
  await page.screenshot({path:path.join(artifacts,'shop-next-customer.png'),fullPage:true});
  await page.getByRole('button',{name:'订单与练习',exact:true}).click();
  await page.getByRole('button',{name:'返回街角装机店',exact:true}).click();await expect(shop).toHaveAttribute('data-chapter-node','workshop');
  await page.getByRole('button',{name:'进入装机工作台',exact:true}).click();await expect(page.getByRole('button',{name:'请先完成装配与开机自检',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'返回店铺柜台',exact:true}).click();
  await page.reload({waitUntil:'domcontentloaded'});await enter();await expect(shop).toHaveAttribute('data-chapter-node','workshop');
  await page.getByRole('button',{name:'重看客户对话',exact:true}).click();await expect(page.getByRole('button',{name:'预算准备了多少？',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(artifacts,'shop-mobile.png'),fullPage:true});
  await page.getByRole('button',{name:'对话记录',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'订单与练习',exact:true}).click();await page.locator('.hardware-case').filter({hasText:'学生学习电脑'}).click();await expect(page.getByRole('region',{name:'客户接待'})).toContainText('阿宁');
  await page.getByRole('button',{name:'订单与练习',exact:true}).click();await page.getByRole('button',{name:'返回街角装机店',exact:true}).click();await page.getByRole('button',{name:'订单与练习',exact:true}).click();await page.getByRole('button',{name:'进入装机教学练习',exact:true}).click();await expect(page.getByRole('region',{name:'装机教学练习',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'返回客户订单',exact:true}).click();
  for(const order of HARDWARE_GAME_CASES.slice(1)) {
    const profile=storyProfile(order.id);
    await page.setViewportSize({width:1366,height:900});
    await page.getByRole('button',{name:'订单与练习',exact:true}).click();await page.locator('.hardware-case').filter({hasText:order.title}).click();
    await expect(shop).toHaveAttribute('data-customer',profile.name);await expect(page.locator('.hardware-receipt-sync')).toHaveCount(0);
    await expect(page.locator('.shop-character')).toHaveAttribute('src',profile.portrait);await page.locator('.shop-character').evaluate(img=>img.decode());
    if(await page.getByRole('button',{name:'重看客户对话',exact:true}).isVisible())await page.getByRole('button',{name:'重看客户对话',exact:true}).click();
    for(const question of profile.questions){await page.getByRole('button',{name:question.label,exact:true}).click();await expect(page.locator('.shop-dialogue-line')).toHaveText(question.answer);}
    await page.getByRole('button',{name:'查看需求工单',exact:true}).click();await expect(page.getByRole('dialog')).toContainText(profile.name);await expect(page.getByRole('dialog')).toContainText(String(order.targets.budget));await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'整理需求，给出方案',exact:true}).click();await expect(page.locator('.shop-dialogue-line')).toHaveText(profile.offersLine);
    for(const width of [1366,390]){await page.setViewportSize({width,height:width===390?844:900});await assertReceptionLayout(page);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(artifacts,`customer-${order.id}-${width}.png`),fullPage:true});}
    await page.setViewportSize({width:1366,height:900});await page.getByRole('button',{name:'采用经济方案',exact:true}).click();await expect(page.locator('.shop-dialogue-line')).toHaveText(profile.quoteLine);
    await page.getByRole('button',{name:'接下工单 · 开始装机',exact:true}).click();await expect(workshop).toBeVisible();await expect(page.getByRole('button',{name:'请先完成装配与开机自检',exact:true})).toBeDisabled();
    // Each order must boot its own actual assembly and receive server confirmation.
    if(await page.getByRole('button',{name:'打开侧板',exact:true}).isVisible())await page.getByRole('button',{name:'打开侧板',exact:true}).press('Enter');
    for(const name of ['固定主板','固定电源'])if(await page.getByRole('button',{name,exact:true}).isVisible())await page.getByRole('button',{name,exact:true}).press('Enter');
    const discrete=buildStoryOffers(order.id)[0].selection.gpu!=='gpu-integrated';
    const items=[['处理器','CPU 插座'],['内存','DIMM 插槽'],['硬盘','硬盘托架'],...(discrete?[['显卡','PCIe 插槽']]:[])];
    for(const [label,socket] of items){await page.locator('.assembly-part-tabs button').filter({hasText:label}).press('Enter');const install=page.getByRole('button',{name:'安装到'+socket,exact:true}).last();if(await install.isEnabled())await install.press('Enter');}
    const cooler=page.getByRole('button',{name:'固定CPU 散热器',exact:true});if(await cooler.isVisible())await cooler.press('Enter');
    for(const [from,to] of [['psu-atx','board-atx'],['psu-cpu','cpu-power'],['cooler-fan','cpu-fan'],['ssd-data','board-sata'],['psu-sata','ssd-power']]){await page.getByRole('combobox',{name:'线缆端',exact:true}).selectOption(from);await page.getByRole('combobox',{name:'目标接口',exact:true}).selectOption(to);await page.getByRole('button',{name:'连接接口',exact:true}).press('Enter');}
    await page.getByRole('button',{name:'开机自检',exact:true}).press('Enter');await expect(workshop.locator('canvas')).toHaveAttribute('data-monitor-message','开机成功',{timeout:10000});
    await page.getByRole('button',{name:'交付装机 · 提交方案',exact:true}).click();await expect(stage).toHaveAttribute('data-story-stage','3');await expect(page.locator('.hardware-receipt-sync')).toContainText('已同步到服务器');await expect(page.locator('.shop-dialogue-line')).toHaveText(profile.thanks);
    const next=storyProfile(HARDWARE_GAME_CASES[(HARDWARE_GAME_CASES.indexOf(order)+1)%HARDWARE_GAME_CASES.length].id);
    const nextButton=page.getByRole('button',{name:`接待下一位客户 · ${next.name}`,exact:true}).filter({visible:true});await expect(nextButton).toBeEnabled();await nextButton.click();await expect(page.locator('.hardware-receipt-sync')).toHaveCount(0);
    console.log(`PASS ${profile.name}: portrait, dialogue, desktop/mobile, real assembly/boot, server delivery and next customer`);
  }
  assert.deepEqual(errors,[]);console.log('PASS full first-day narrative, all six customers, actual offers/assembly/boot, offline and synced delivery, ending, recovery, mobile, classroom orders and teaching entry');
}catch(error){await page?.screenshot({path:path.join(artifacts,'shop-error.png'),fullPage:true});throw error;}finally{await browser.close();}
