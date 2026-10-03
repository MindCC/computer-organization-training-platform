// Follow the real customer reception before exercising the original 3D lab.
export async function acceptCustomerOrder(page){
  await page.locator('.shop-game,.hardware-customer-story').first().waitFor({state:'visible'});
  if(await page.locator('.shop-game').count()){
    const enter=page.getByRole('button',{name:'进入装机工作台',exact:true});
    if(await enter.isVisible().catch(()=>false)){await enter.click();return;}
    const clickIf=async name=>{const button=page.getByRole('button',{name,exact:true});if(await button.isVisible().catch(()=>false))await button.click();};
    await clickIf('打开营业门牌');await clickIf('我来试试，接待第一位客户');
    await clickIf('知道了，先听清楚再给方案');await clickIf('先聊聊具体用法');
    for(const name of ['平时主要开什么软件？','资料大概有多少？','预算准备了多少？'])await clickIf(name);
    await clickIf('整理需求，给出方案');await clickIf('采用经济方案');
  }
  await page.getByRole('button',{name:'接下工单 · 开始装机',exact:true}).click();
}
export async function selectCustomerOrder(page,locator){
  await page.locator('.shop-game,.hardware-customer-story').first().waitFor({state:'visible'});
  const menu=page.getByRole('button',{name:'订单与练习',exact:true});
  if(await page.locator('.shop-game').count()&&!(await locator.isVisible().catch(()=>false)))await menu.click();
  const office=(await locator.innerText()).includes('办公电脑');
  await locator.click();
  if(office)await page.locator('.shop-game').waitFor({state:'visible'});
  const close=page.getByRole('button',{name:'关闭面板',exact:true});
  if(await close.isVisible().catch(()=>false))await close.click();
  const enter=page.getByRole('button',{name:'进入装机工作台',exact:true});
  if(await enter.isVisible().catch(()=>false))await enter.click();
}
export async function openPracticeMenu(page){
  await page.locator('.shop-game,.hardware-customer-story').first().waitFor({state:'visible'});
  const practice=page.getByRole('button',{name:'进入装机教学练习',exact:true});
  if(!(await practice.isVisible().catch(()=>false))&&await page.locator('.shop-game').count())await page.getByRole('button',{name:'订单与练习',exact:true}).click();
}
export async function enterAssemblyPractice(page){await openPracticeMenu(page);await page.getByRole('button',{name:'进入装机教学练习',exact:true}).click();}
