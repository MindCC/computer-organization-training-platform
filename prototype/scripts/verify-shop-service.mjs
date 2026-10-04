import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium,expect } from '@playwright/test';
import { gotoApp,fillLoginForm,submitLoginForm } from './lib/qaLogin.mjs';
import { openChallengeFromHome } from './lib/qaHome.mjs';
import { SERVICE_ORDERS } from '../src/shopServiceGame.js';

let browser;try{browser=await chromium.launch({channel:'msedge',headless:true});}catch{browser=await chromium.launch({headless:true});}
const artifacts=process.env.QA_ARTIFACT_DIR??'qa-artifacts';await mkdir(artifacts,{recursive:true});
const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const scene=page.getByRole('main',{name:'维修与升级工单'});
const workshop=page.getByRole('region',{name:'3D 交互装机工作台'});
const stage=name=>scene.getByRole('navigation',{name:'维修阶段'}).getByRole('button',{name,exact:false});
const detect=async()=>{for(const test of await scene.locator('.service-test').all()){await test.getByRole('button').click();await expect(test.locator('.service-test-reading>strong')).toBeVisible();await expect(test.getByRole('button')).toBeEnabled();}};
const layout=async label=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${label}: horizontal overflow`);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(artifacts,label+'.png'),fullPage:true});};
try{
  await gotoApp(page,process.env.PROTOTYPE_APP_URL??'http://127.0.0.1:5173');
  await fillLoginForm(page,{username:'demo2026001',password:'Student123!'});await submitLoginForm(page);
  await page.locator('.topbar-nav-item').filter({hasText:'硬件配置挑战'}).click();
  await page.getByRole('button',{name:'进入维修与升级工单'}).click();await expect(scene).toBeVisible();
  await scene.locator('.service-person').evaluate(img=>img.decode());await layout('service-reception-desktop');
  await page.setViewportSize({width:390,height:844});await layout('service-reception-mobile');await page.setViewportSize({width:1366,height:768});
  for(const [index,order] of SERVICE_ORDERS.entries()){
    await expect(scene.locator('.service-reception-copy')).toContainText(order.name);
    await scene.getByRole('button',{name:'聊聊当时开了哪些软件'}).click();await expect(scene.locator('.service-clue')).toContainText(order.clue);
    await scene.getByRole('button',{name:'接下维修工单 · 开始检测'}).click();
    await expect(scene.getByRole('button',{name:'处理器',exact:true})).toBeDisabled();
    if(index===0){
      let lost=false;
      await page.route('**/api/student/shop-service/*/actions',async route=>{if(!lost){lost=true;await route.fetch();await route.abort();}else await route.continue();});
      await scene.locator('.service-test').first().getByRole('button').click();
      await expect(scene.getByRole('button',{name:'重试上次操作'})).toBeVisible();
      await scene.getByRole('button',{name:'重试上次操作'}).click();await expect(scene.locator('.service-test-reading>strong')).toHaveCount(1);
      await page.unroute('**/api/student/shop-service/*/actions');
    }
    await detect();
    if(index===0){await scene.getByRole('button',{name:'显卡',exact:true}).click();await expect(scene.locator('.service-feedback')).toContainText('还不能解释');}
    await scene.getByRole('button',{name:{memory:'内存',storage:'存储',cpu:'处理器'}[order.bottleneck],exact:true}).click();
    await expect(scene.getByRole('button',{name:'进入 3D 升级工作台'})).toBeVisible();
    await scene.getByRole('button',{name:'进入 3D 升级工作台'}).click();await expect(workshop.locator('canvas')).toBeVisible();
    await expect(page.locator('#assembly-variant')).toBeDisabled();
    await workshop.getByRole('button',{name:'打开侧板',exact:true}).press('Enter');
    if(order.bottleneck==='cpu')await workshop.getByRole('button',{name:'拆下CPU 散热器',exact:true}).press('Enter');
    const label={cpu:'处理器',memory:'内存',storage:'硬盘'}[order.bottleneck];
    await workshop.getByRole('button',{name:'拆下'+label,exact:true}).press('Enter');
    await page.locator('#assembly-variant').selectOption(order.upgrade);
    await workshop.getByRole('button',{name:'安装到'+{cpu:'CPU 插座',memory:'DIMM 插槽',storage:'硬盘托架'}[order.bottleneck],exact:true}).last().press('Enter');
    if(order.bottleneck==='cpu')await workshop.getByRole('button',{name:'固定CPU 散热器',exact:true}).press('Enter');
    for(const [from,to] of order.bottleneck==='cpu'?[['psu-cpu','cpu-power'],['cooler-fan','cpu-fan']]:order.bottleneck==='storage'?[['ssd-data','board-sata'],['psu-sata','ssd-power']]:[]){await workshop.getByLabel('线缆端',{exact:true}).selectOption(from);await workshop.getByLabel('目标接口',{exact:true}).selectOption(to);await workshop.getByRole('button',{name:'连接接口',exact:true}).press('Enter');}
    await expect(workshop.getByRole('button',{name:'开机自检',exact:true})).toBeEnabled();
    await workshop.getByRole('button',{name:'开机自检',exact:true}).press('Enter');await expect(workshop.locator('canvas')).toHaveAttribute('data-monitor-message','开机成功',{timeout:10000});
    await scene.getByRole('button',{name:'保持开机 · 进入复测'}).click();await detect();
    await expect(scene.getByRole('button',{name:'交付升级方案'})).toBeEnabled();
    if(index===0){
      await page.reload();await expect(scene).toBeVisible();await stage('复测交付').click();
      await expect(scene.getByRole('button',{name:'交付升级方案'})).toBeDisabled();
      await scene.getByRole('button',{name:'返回工作台开机'}).click();await expect(page.locator('#assembly-variant')).toHaveValue(order.upgrade);
      await workshop.getByRole('button',{name:'开机自检',exact:true}).press('Enter');await expect(workshop.locator('canvas')).toHaveAttribute('data-monitor-message','开机成功',{timeout:10000});
      await scene.getByRole('button',{name:'保持开机 · 进入复测'}).click();
      await page.setViewportSize({width:390,height:844});await layout('service-retest-mobile');await page.setViewportSize({width:1366,height:768});
    }
    await scene.getByRole('button',{name:'交付升级方案'}).click();await expect(scene.locator('.service-acceptance')).toContainText('维修完成 · 已同步回执');
    await expect(scene.locator('.service-result')).toContainText(index===0?'95 / 100':'100 / 100');
    await layout(`service-${order.bottleneck}-receipt`);
    if(index<2)await scene.getByRole('button',{name:'下一位维修客户'}).click();
  }
  const response=await page.request.get(new URL('/api/student/shop-service',page.url()).href);const records=(await response.json()).records;assert.equal(records.filter(r=>r.state.result?.passed).length,3);
  await page.locator('.topbar-nav-item').filter({hasText:'学习记录'}).click();await expect(page.getByRole('region',{name:'维修与升级记录'})).toContainText('验收通过');
  await page.locator('.topbar-nav-item').filter({hasText:'错题本'}).click();await page.getByRole('button',{name:/维修诊断 ·/}).click();
  await expect(page.locator('.mistake-group')).toContainText('小周');await expect(page.locator('.mistake-group')).toContainText('已订正');
  await page.getByRole('button',{name:'重做维修工单'}).click();await expect(scene.locator('.service-reception-copy')).toContainText('小周');
  await page.locator('.topbar-nav-item').filter({hasText:'课程首页'}).click();await openChallengeFromHome(page,'办公电脑');
  await expect(page.getByRole('region',{name:'芯邻装机店'})).toBeVisible();await expect(scene).toHaveCount(0);
  await page.getByRole('button',{name:'进入维修与升级工单'}).click();await expect(scene).toBeVisible();
  await scene.getByRole('button',{name:'返回装机店',exact:true}).click();await expect(page.getByRole('region',{name:'芯邻装机店'})).toBeVisible();
  assert.deepEqual(errors,[]);console.log('PASS: 3 real 3D upgrade/boot/retest/server deliveries, lost-response replay, wrong diagnosis, refresh boot gate, records/mistakes/deep link, desktop/mobile layout.');
}catch(error){await page.screenshot({path:path.join(artifacts,'service-failure.png'),fullPage:true}).catch(()=>{});console.error((await page.locator('body').innerText()).slice(-3500));throw error;}finally{await browser.close();}
