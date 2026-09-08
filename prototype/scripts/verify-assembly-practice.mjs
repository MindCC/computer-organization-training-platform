import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import path from 'node:path';

export async function verifyAssemblyPractice(page,artifactDir){
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.sidebar-nav .nav-item').filter({hasText:'硬件配置挑战'}).click();
  const orderDrafts=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('zcyl:assembly-draft:'))));
  await page.getByRole('button',{name:'进入装机教学练习',exact:true}).click();
  const workshop=page.getByRole('region',{name:'3D 交互装机工作台'}),review=page.getByRole('region',{name:'练习复盘',exact:true});
  const status=page.locator('.assembly-action-strip');
  await expect(status).toContainText('打开侧板');
  await page.getByRole('button',{name:'固定主板',exact:true}).click();
  await expect(review).toContainText('请先打开侧板');
  async function prepare(){for(const name of ['打开侧板','固定主板','固定电源'])await page.getByRole('button',{name,exact:true}).click();}
  async function installAll(expert){
    for(const [label,id,socket] of [['处理器','cpu','CPU 插座'],['内存','memory','DIMM 插槽'],['硬盘','storage','硬盘托架'],['显卡','gpu','PCIe 插槽']]){
      await page.locator('.assembly-part-tabs button').filter({hasText:label}).click();
      if(id==='gpu'&&await page.locator('.assembly-integrated').count())continue;
      if(expert){await page.getByRole('combobox',{name:'安装目标',exact:true}).selectOption(id);await page.getByRole('button',{name:'安装所选部件',exact:true}).click();}
      else await page.getByRole('button',{name:'安装到'+socket,exact:true}).last().click();
    }
    await page.getByRole('button',{name:'固定CPU 散热器',exact:true}).click();
  }
  async function connect(from,to){await page.getByRole('combobox',{name:'线缆端',exact:true}).selectOption(from);await page.getByRole('combobox',{name:'目标接口',exact:true}).selectOption(to);await page.getByRole('button',{name:'连接接口',exact:true}).click();}
  async function wireAll(){for(const [from,to] of [['psu-atx','board-atx'],['psu-cpu','cpu-power'],['cooler-fan','cpu-fan'],['ssd-data','board-sata'],['psu-sata','ssd-power']])await connect(from,to);}
  async function boot(){await page.getByRole('button',{name:'开机自检',exact:true}).click();await expect(review).toContainText('练习完成',{timeout:10000});await expect(page.locator('#assembly-variant')).toBeDisabled();await expect(page.getByRole('button',{name:'自检通过',exact:true})).toBeDisabled();}
  await prepare();await expect(status).toContainText('安装处理器');
  // Refresh an unfinished run after installing one part and asking for help.
  await page.locator('#assembly-variant').selectOption('cpu-i5');
  await page.getByRole('button',{name:'安装到CPU 插座',exact:true}).last().click();
  await page.getByRole('button',{name:'查看提示',exact:true}).click();
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.sidebar-nav .nav-item').filter({hasText:'硬件配置挑战'}).click();
  await page.getByRole('button',{name:'进入装机教学练习',exact:true}).click();
  await expect(page.locator('.practice-save-status')).toContainText('已恢复未完成练习');
  await expect(page.locator('.assembly-counter strong')).toContainText('1 /');
  await expect(page.locator('#assembly-variant')).toHaveValue('cpu-i5');
  await expect(review.locator('.practice-metrics')).toContainText('待完成');
  await expect(review).toContainText('请先打开侧板');
  await expect(page.getByRole('button',{name:'拆下处理器',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'拆下处理器',exact:true}).click();
  await installAll(false);await wireAll();await boot();
  await expect(review.locator('.practice-metrics')).toContainText('92');
  await expect(page.locator('.practice-history details')).toHaveCount(1);
  await page.getByRole('combobox',{name:'练习模式',exact:true}).selectOption('independent');
  await expect(workshop.locator('canvas')).toHaveAttribute('data-preview','');
  await expect(page.locator('.assembly-guide')).toHaveCount(0);
  await expect(page.getByRole('combobox',{name:'安装目标',exact:true})).toHaveValue('');
  await prepare();
  await page.getByRole('combobox',{name:'安装目标',exact:true}).selectOption('memory');
  await page.getByRole('button',{name:'安装所选部件',exact:true}).click();
  await expect(status).toContainText('安装未完成');
  await expect(page.locator('.assembly-counter strong')).toContainText('0 /');
  await page.getByRole('button',{name:'查看提示',exact:true}).click();
  await expect(status).toContainText('CPU 插座');
  await page.getByRole('combobox',{name:'安装目标',exact:true}).selectOption('cpu');await page.getByRole('button',{name:'安装所选部件',exact:true}).click();
  await expect(page.locator('.assembly-guide')).toHaveCount(0);
  await page.getByRole('button',{name:'重新练习',exact:true}).click();
  await prepare();await installAll(true);await wireAll();await boot();
  await expect(review.locator('.practice-metrics')).toContainText('100');
  await page.getByRole('combobox',{name:'练习模式',exact:true}).selectOption('fault');
  for(const fault of ['power','cooling','storage']){
    await page.getByRole('combobox',{name:'故障工单',exact:true}).selectOption(fault);
    await page.getByRole('button',{name:'开机自检',exact:true}).click();
    await expect(review).not.toContainText('练习完成');
    await expect(status).toContainText(fault==='power'?'初始化未通过':fault==='cooling'?'散热保护检查未通过':'存储设备未被完整识别');
    if(fault==='cooling'){await page.getByRole('button',{name:'固定CPU 散热器',exact:true}).click();await connect('cooler-fan','cpu-fan');}
    else {
      await page.getByRole('button',{name:'连接线缆',exact:true}).click();
      await workshop.locator('canvas').scrollIntoViewIfNeeded();
      await page.locator(`[data-connector="${fault==='power'?'psu-cpu':'ssd-data'}"]`).click();
      const target=page.locator(`[data-connector="${fault==='power'?'cpu-power':'board-sata'}"]`);
      await expect(target).toHaveAttribute('data-match','false');
      await target.click();await page.getByRole('button',{name:'结束接线',exact:true}).click();
    }
    await boot();await expect(review.locator('.practice-metrics')).toContainText('95');
  }
  await review.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifactDir,'assembly-practice-review.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'practice mobile overflow');
  await page.screenshot({path:path.join(artifactDir,'assembly-practice-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1366,height:768});
  await page.getByRole('button',{name:'返回客户订单',exact:true}).click();
  const after=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('zcyl:assembly-draft:'))));
  assert.deepEqual(after,orderDrafts,'practice must preserve all order drafts');
  await expect(page.getByRole('button',{name:'请先完成装配与开机自检',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'进入装机教学练习',exact:true}).click();
  await expect(review).not.toContainText('练习完成');
  await expect(page.locator('.practice-history details')).toHaveCount(5);
  await page.reload({waitUntil:'networkidle'});await page.locator('.sidebar-nav .nav-item').filter({hasText:'硬件配置挑战'}).click();
  await expect(page.getByRole('button',{name:'进入装机教学练习',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'进入装机教学练习',exact:true}).click();
  await expect(page.locator('.practice-history details')).toHaveCount(5);
  await expect(page.locator('.assembly-boot.online')).toHaveCount(0);
  await page.locator('.practice-history summary').first().click();
  await expect(page.locator('.practice-history')).toContainText('SATA 数据线');
  await page.screenshot({path:path.join(artifactDir,'assembly-practice-history.png'),fullPage:true});
  const beforeFailure=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('zcyl:assembly-practice:'))));
  await page.evaluate(()=>{
    window.practiceOriginalSetItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key.startsWith('zcyl:assembly-practice:'))throw new DOMException('Quota exceeded','QuotaExceededError');return window.practiceOriginalSetItem.call(this,key,value);};
  });
  await page.getByRole('button',{name:'查看提示',exact:true}).click();
  await expect(page.locator('.practice-save-status')).toContainText('无法保存练习');
  await page.getByRole('button',{name:'打开侧板',exact:true}).click();
  await expect(page.getByRole('button',{name:'合上侧板',exact:true})).toBeEnabled();
  assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('zcyl:assembly-practice:')))),beforeFailure,'failed save preserves prior snapshot');
  await page.evaluate(()=>{Storage.prototype.setItem=window.practiceOriginalSetItem;delete window.practiceOriginalSetItem;});
  await page.getByRole('button',{name:'返回客户订单',exact:true}).click();
  console.log('  PASS guided, independent, fault repairs, unfinished refresh, persistent history, restart, mobile and order isolation');
}
