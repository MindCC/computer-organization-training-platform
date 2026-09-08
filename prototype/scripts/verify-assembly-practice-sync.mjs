import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import path from 'node:path';

export async function verifyAssemblyPracticeSync(page,browser,artifactDir){
  const synced=p=>expect(p.locator('.practice-sync-status')).toContainText('已同步到服务器',{timeout:15000});
  const enter=async p=>{await p.locator('.sidebar-nav .nav-item').filter({hasText:'硬件配置挑战'}).click();await p.getByRole('button',{name:'进入装机教学练习',exact:true}).click();};
  await page.getByRole('button',{name:'进入装机教学练习',exact:true}).click();
  await page.getByRole('combobox',{name:'练习模式',exact:true}).selectOption('guided');
  await page.getByRole('button',{name:'重新练习',exact:true}).click();
  for(const name of ['打开侧板','固定主板','固定电源'])await page.getByRole('button',{name,exact:true}).click();
  await page.locator('#assembly-variant').selectOption('cpu-i5');
  await page.getByRole('button',{name:'安装到CPU 插座',exact:true}).last().click();await synced(page);
  const state=await page.context().storageState();
  for(const origin of state.origins)origin.localStorage=origin.localStorage.filter(item=>!item.name.startsWith('zcyl:assembly-practice:'));
  // A second isolated storage context represents another device; use the same single browser.
  const context=await browser.newContext({storageState:state,viewport:{width:1366,height:768}}),other=await context.newPage();
  const errors=[];other.on('pageerror',error=>errors.push(error.message));
  const route='**/api/student/assembly-practice/*';
  // Production cookies are Secure; browser fetch has Chromium's localhost handling.
  const request=(endpoint,body)=>other.evaluate(async({endpoint,body})=>{
    const response=await fetch(endpoint,{credentials:'include',...(body?{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json()};
  },{endpoint,body});
  try{
    await other.route(route,handler=>handler.request().method()==='PUT'?handler.abort():handler.continue());
    await other.goto(page.url(),{waitUntil:'networkidle'});await enter(other);
    await expect(other.locator('#assembly-variant')).toHaveValue('cpu-i5');
    await expect(other.locator('.assembly-counter strong')).toContainText('1 /');
    await expect(other.locator('.practice-history details')).toHaveCount(5);
    await expect(other.getByRole('region',{name:'练习复盘',exact:true})).not.toContainText('练习完成');
    await other.locator('#assembly-variant').selectOption('cpu-i3');
    await expect(other.locator('.practice-sync-status')).toContainText('无法连接服务器');
    await page.getByRole('button',{name:'查看提示',exact:true}).click();await synced(page);
    await page.getByRole('button',{name:'返回客户订单',exact:true}).click();
    await other.unroute(route);await other.getByRole('button',{name:'重试同步',exact:true}).click();
    await expect(other.getByRole('region',{name:'练习同步冲突'})).toBeVisible();
    await other.screenshot({path:path.join(artifactDir,'assembly-practice-sync-conflict.png'),fullPage:true});
    await other.getByRole('button',{name:'恢复服务器进度',exact:true}).click();
    await expect(other.locator('#assembly-variant')).toHaveValue('cpu-i5');await synced(other);
    // Modify the remote copy while this device is still open, then explicitly retain local progress.
    const endpointPath=await other.evaluate(()=>{
      const key=Object.keys(localStorage).find(k=>k.startsWith('zcyl:assembly-practice:'));
      return '/api/student/assembly-practice/'+encodeURIComponent(decodeURIComponent(key.split(':').at(-1)));
    });
    const endpoint=new URL(endpointPath,other.url()).href;
    const result=await request(endpoint);assert.equal(result.status,200);const remote=result.body;
    remote.document.active.category='memory';
    const response=await request(endpoint,{operationId:crypto.randomUUID(),baseRevision:remote.revision,document:remote.document});
    assert.equal(response.status,200);
    await other.locator('#assembly-variant').selectOption('cpu-i3');
    await expect(other.getByRole('region',{name:'练习同步冲突'})).toBeVisible();
    await other.getByRole('button',{name:'使用本机进度并同步',exact:true}).click();await synced(other);
    assert.equal((await request(endpoint)).body.document.active.parts.cpu,'cpu-i3');
    // True offline editing survives a reload after connectivity returns.
    await context.setOffline(true);await other.getByRole('button',{name:'查看提示',exact:true}).click();
    await expect(other.locator('.practice-sync-status')).toContainText('无法连接服务器');
    const local=await other.evaluate(()=>JSON.parse(Object.entries(localStorage).find(([k])=>k.startsWith('zcyl:assembly-practice:'))[1]));
    assert.ok(local.sync.pending);
    await context.setOffline(false);await synced(other);
    await other.reload({waitUntil:'networkidle'});await enter(other);
    await expect(other.locator('#assembly-variant')).toHaveValue('cpu-i3');await synced(other);
    const final=(await request(endpoint)).body;
    assert.ok(final.document.active.events.length>=local.active.events.length);
    assert.deepEqual(errors,[]);
    console.log('  PASS cross-device practice recovery, offline retry, both conflict choices and no restored boot');
  }finally{await context.close();}
}
