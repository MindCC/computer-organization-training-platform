import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { gotoApp, fillLoginForm, submitLoginForm } from './lib/qaLogin.mjs';
import { openChallengeFromHome } from './lib/qaHome.mjs';
import { CIRCUIT_CHALLENGES } from '../src/circuit/challengeCircuitModel.js';
import { clickTopNavItem } from './nav-helpers.mjs';

let browser;
try { browser = await chromium.launch({channel:'msedge',headless:true}); }
catch { browser = await chromium.launch({headless:true}); }
const artifacts=process.env.QA_ARTIFACT_DIR??'qa-artifacts';
await mkdir(artifacts,{recursive:true});
const page=await browser.newPage({viewport:{width:1366,height:768}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try {
  await gotoApp(page,process.env.PROTOTYPE_APP_URL??'http://127.0.0.1:5173');
  await fillLoginForm(page,{username:'demo2026001',password:'Student123!'});await submitLoginForm(page);
  await expect(page.locator('.project-chapter-board')).toBeVisible();
  const platformNav=await page.locator('.topbar-nav-item').allTextContents();
  await openChallengeFromHome(page,'认识数据流');
  await expect(page.locator('.topbar')).toHaveCount(1);
  await expect(page.locator('.lab-studio-header')).toHaveCount(0);
  assert.deepEqual(await page.locator('.topbar-nav-item').allTextContents(),platformNav);
  await expect(page.locator('.topbar .brand-wordmark')).toBeVisible();
  await expect(page.getByRole('navigation',{name:'主导航'})).toBeVisible();
  await page.locator('.profile-button').click();await expect(page.getByRole('button',{name:'个人设置',exact:true})).toBeVisible();await page.locator('.profile-button').click();
  await expect(page.locator('.lab-experiment-context')).toContainText('认识数据流');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'顶栏不能撑出页面宽度');
  const canvas=page.getByTestId('react-flow-circuit-canvas');
  await expect(canvas.locator('.react-flow__node')).toHaveCount(3);
  await page.screenshot({path:path.join(artifacts,'lab-workbench-layout.png'),fullPage:true});
  const box=await canvas.boundingBox();
  console.log('Canvas bounds',box);
  assert.ok(box.height>=380,'实验画布必须保留至少 380px 操作高度，不能被检测面板压扁');
  assert.ok(await canvas.evaluate(element=>{
    const box=element.getBoundingClientRect();
    for(let parent=element.parentElement;parent;parent=parent.parentElement){
      if(['hidden','clip'].includes(getComputedStyle(parent).overflowY)){
        const bounds=parent.getBoundingClientRect();
        if(box.bottom>bounds.bottom+1||box.top<bounds.top-1)return false;
      }
    }
    return true;
  }),'工作台不能被祖先容器裁切');
  await page.getByRole('button',{name:'放大工作台',exact:true}).click();
  await expect(page.locator('.circuit-flow-workbench')).toHaveClass(/expanded/);
  const focusBox=await canvas.boundingBox();assert.ok(focusBox.height>box.height,'放大后画布操作面积应增加');
  async function connect(from,to){
    let previous,stable=0;
    await expect.poll(async()=>{
      const transform=await page.locator('.react-flow__viewport').getAttribute('style');
      stable=transform===previous?stable+1:0;previous=transform;return stable;
    },{intervals:[100,100,100]}).toBeGreaterThanOrEqual(2);
    const a=await from.boundingBox(),b=await to.boundingBox();
    await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:14});await page.mouse.up();
  }
  await connect(page.getByTestId('port-input-a-out'),page.getByTestId('port-data-path-in'));
  await expect(canvas.locator('.react-flow__edge')).toHaveCount(1);
  await connect(page.getByTestId('port-data-path-out'),page.getByTestId('port-result-s-in'));
  await expect(canvas.locator('.react-flow__edge')).toHaveCount(2);
  const switchButton=page.locator('.circuit-input-switch'),lamp=page.locator('.circuit-output-lamp');
  await expect(lamp).toHaveAttribute('aria-label','输出 0');
  await switchButton.click();await expect(lamp).toHaveAttribute('aria-label','输出 1');
  await expect(page.locator('.circuit-flow-manual-badge')).toBeVisible();
  await switchButton.press('Space');await expect(lamp).toHaveAttribute('aria-label','输出 0');
  await page.locator('.circuit-flow-case-tabs button').nth(1).click();await expect(lamp).toHaveAttribute('aria-label','输出 1');
  await switchButton.press('Enter');await expect(lamp).toHaveAttribute('aria-label','输出 0');
  await expect(page.locator('.circuit-flow-case-panel .circuit-flow-value-row').first()).toContainText('0');
  await page.getByRole('checkbox',{name:'信号数值',exact:true}).uncheck();await expect(canvas.locator('.circuit-flow-port-value').first()).toBeHidden();
  await page.getByRole('checkbox',{name:'信号数值',exact:true}).check();
  await page.getByRole('checkbox',{name:'端口名称',exact:true}).uncheck();await expect(canvas.locator('.circuit-flow-port-row > span').first()).toBeHidden();
  await page.getByRole('checkbox',{name:'端口名称',exact:true}).check();
  await page.screenshot({path:path.join(artifacts,'lab-workbench-focused.png')});
  await page.getByRole('button',{name:'提交检测',exact:true}).click();await expect(page.locator('.circuit-flow-report')).toHaveClass(/passed/);
  await expect(page.locator('.quest-settlement')).toBeVisible();
  await page.locator('.quest-settlement').getByRole('button',{name:'复盘本关',exact:true}).click();
  await expect(page.locator('.quest-settlement')).toBeHidden();
  await page.keyboard.press('Escape');await expect(page.locator('.circuit-flow-workbench')).not.toHaveClass(/expanded/);
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(canvas.locator('.react-flow__edge')).toHaveCount(1);
  await page.getByRole('button',{name:'重做',exact:true}).click();await expect(canvas.locator('.react-flow__edge')).toHaveCount(2);
  await expect(page.locator('.lab-observation')).not.toHaveAttribute('open');
  await page.locator('.lab-observation summary').click();await expect(page.locator('.lab-assistant-panel')).toBeVisible();
  await page.locator('.lab-observation summary').click();
  await page.locator('.route-fold-btn').filter({hasText:'全展开'}).click();
  // Every fixed circuit still renders, including large multi-port and later-chapter models.
  for(const model of CIRCUIT_CHALLENGES.filter(model=>model.id!=='computer-components')){
    await page.locator('.lab-studio-step').filter({has:page.getByText(model.title,{exact:true})}).click();
    await expect(canvas.locator('.react-flow__node')).toHaveCount(model.nodes.length);
    await expect.poll(()=>canvas.locator('.react-flow__node').evaluateAll(nodes=>nodes.map(node=>node.dataset.id))).toEqual(model.nodes.map(node=>node.id));
    assert.ok((await canvas.boundingBox()).height>=380,model.title+'画布高度');
    if(model.id==='machine-number')await page.screenshot({path:path.join(artifacts,'lab-machine-shared-topbar.png'),fullPage:true});
  }
  await page.locator('.lab-studio-step').filter({hasText:'与门'}).first().click();
  await page.getByRole('button',{name:'填入参考结构',exact:true}).click();
  await page.locator('.circuit-flow-case-tabs button').nth(3).click();
  await expect(page.locator('.circuit-output-lamp')).toHaveAttribute('aria-label','输出 1');
  await page.locator('.circuit-input-switch').nth(0).click();
  await expect(page.locator('.circuit-input-switch').nth(1)).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.circuit-output-lamp')).toHaveAttribute('aria-label','输出 0');
  await page.getByRole('button',{name:/逻辑门沙盒/}).click();
  assert.ok(await page.locator('.sandbox-gate').count()>=8);await expect(page.locator('.sandbox .react-flow__node')).toHaveCount(4);
  const sandboxInputs=page.locator('.sandbox .circuit-input-switch');
  for(const [source,target] of [[0,0],[1,1]]){
    await connect(page.locator('.sandbox .circuit-flow-node[data-component-type="input"] .circuit-flow-handle').nth(source),page.locator('.sandbox .circuit-flow-node[data-component-type="and"] .circuit-flow-handle.input').nth(target));
  }
  await connect(page.locator('.sandbox .circuit-flow-node[data-component-type="and"] .circuit-flow-handle.output'),page.locator('.sandbox .circuit-flow-node[data-component-type="output"] .circuit-flow-handle'));
  await expect(page.locator('.sandbox .react-flow__edge')).toHaveCount(3);
  await sandboxInputs.nth(0).click();await sandboxInputs.nth(1).click();
  await expect(page.locator('.sandbox .circuit-output-lamp')).toHaveAttribute('aria-label','输出 1');
  await page.screenshot({path:path.join(artifacts,'lab-workbench-sandbox.png')});
  await page.getByRole('button',{name:'← 返回闯关',exact:true}).click();
  await page.locator('.lab-studio-step').filter({hasText:'认识数据流'}).click();
  for(const viewport of [{width:1918,height:950},{width:1024,height:768},{width:1093,height:614}]){
    await page.setViewportSize(viewport);assert.ok((await canvas.boundingBox()).height>=380,'小视口仍能滚动查看工作台');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'不能产生横向溢出');
    await expect.poll(()=>canvas.evaluate(element=>{
      const bounds=element.getBoundingClientRect();
      return [...element.querySelectorAll('.react-flow__node')].every(node=>{
        const rect=node.getBoundingClientRect();
        return rect.left>=bounds.left&&rect.right<=bounds.right&&rect.top>=bounds.top&&rect.bottom<=bounds.bottom;
      });
    })).toBe(true);
    await page.screenshot({path:path.join(artifacts,`lab-workbench-${viewport.width}.png`),fullPage:true});
  }
  await clickTopNavItem(page,'硬件配置挑战');
  await expect(page.getByRole('region',{name:'芯邻装机店'})).toBeVisible();
  assert.deepEqual(await page.locator('.topbar-nav-item').allTextContents(),platformNav);
  await page.locator('.topbar').screenshot({path:path.join(artifacts,'hardware-shared-topbar.png')});
  await clickTopNavItem(page,'课程首页');
  await expect(page.locator('.project-chapter-board')).toBeVisible();
  await openChallengeFromHome(page,'认识计算机五大部件');
  await expect(page.locator('.lab-overview')).toBeVisible();await expect(page.locator('.topbar')).toHaveCount(1);
  await expect(page.locator('.lab-studio-header')).toHaveCount(0);
  assert.deepEqual(await page.locator('.topbar-nav-item').allTextContents(),platformNav);
  await expect(page.locator('.computer-exploded canvas')).toBeVisible({timeout:60000});
  const overviewBox=await page.locator('.computer-exploded canvas').boundingBox();
  assert.ok(overviewBox.height>=380,'3D 探索画布保留操作高度');
  assert.ok(overviewBox.y>=(await page.locator('.topbar').boundingBox()).height,'3D 画布不能被顶栏遮挡');
  assert.ok(overviewBox.y+overviewBox.height<=page.viewportSize().height+1,'3D 探索须适配顶栏下的可用高度');
  await page.screenshot({path:path.join(artifacts,'lab-overview-shared-topbar.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log(`PASS lab layout, actual port drag, live switches/lamps, keyboard, display options, focus/escape, undo/redo, grading, ${CIRCUIT_CHALLENGES.length-1} circuit models, sandbox and responsive layout`);
} catch(error) {
  await page.screenshot({path:path.join(artifacts,'lab-workbench-error.png'),fullPage:true});throw error;
} finally {await browser.close();}
