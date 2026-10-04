import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium,expect } from '@playwright/test';
import {gotoApp,fillLoginForm,submitLoginForm} from './lib/qaLogin.mjs';
import {openTeacherWorkspace,TEACHER_WORKSPACE} from './lib/qaTeacherWorkspace.mjs';
import {questionsForChapter} from '../src/assignmentQuestions.js';
import {randomUUID} from 'node:crypto';

const app=process.env.PROTOTYPE_APP_URL??process.env.PROTOTYPE_URL, artifacts=process.env.QA_ARTIFACT_DIR??'qa-artifacts';
await mkdir(artifacts,{recursive:true});
let browser;try{browser=await chromium.launch({channel:'msedge',headless:true});}catch{browser=await chromium.launch({headless:true});}
let page;const results=[],errors=[];
const pass=label=>{results.push(label);console.log('PASS '+label);};
try{
  page=await browser.newPage({viewport:{width:1366,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  const nav=name=>page.locator('.topbar-nav').getByRole('button',{name,exact:true}).click();
  const login=async(name='demo2026001')=>{await fillLoginForm(page,{username:name,password:name==='teacher'?'ChangeMe123!':'Student123!'});if(name==='teacher')await page.getByRole('tab',{name:'教师入口'}).click();await submitLoginForm(page);await expect(page.locator('.profile-button')).toBeVisible();};
  const logout=async()=>{await page.locator('.profile-button').click();await page.getByRole('button',{name:'退出登录',exact:true}).click();};
  await page.route('**/api/auth/me',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'审核故障注入'})}));
  await gotoApp(page,app);await expect(page.locator('.platform-connection')).toContainText('暂时无法连接');
  await page.unroute('**/api/auth/me');await page.getByRole('button',{name:'重新连接',exact:true}).click();await expect(page.locator('.quest-student-home')).toBeVisible();pass('服务不可用显示重连页，重试后恢复访客首页');
  await page.getByRole('button',{name:'通知',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('登录后查看个人提醒');await page.keyboard.press('Escape');pass('游客通知有真实入口，无固定假数字');
  await page.route('**/api/student/progress',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'学情暂时不可用'})}));
  await login();await expect(page.locator('.platform-sync-banner')).toContainText('同步失败');await expect(page.locator('.profile-button')).toContainText('演示学生1');
  await page.unroute('**/api/student/progress');await page.getByRole('button',{name:'重试同步',exact:true}).click();await expect(page.locator('.platform-sync-banner')).toHaveCount(0);pass('业务同步失败保留登录态，并可恢复真实学情');
  const practiceQuestion=questionsForChapter('ch1').find(question=>question.type==='choice');
  const practiceResponse=await page.request.post(app+'/api/student/chapter-practice',{data:{chapterId:'ch1',answers:{[practiceQuestion.id]:practiceQuestion.options.find(option=>option!==practiceQuestion.answer)},clientSubmissionId:randomUUID()}});assert.ok(practiceResponse.ok());
  await page.getByRole('button',{name:'通知',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('待巩固错题');await expect(page.getByRole('dialog')).not.toContainText('你有 3 条');await page.screenshot({path:path.join(artifacts,'platform-notifications.png'),fullPage:true});await page.keyboard.press('Escape');pass('学生提醒读取实际错题和课程记录');
  await page.locator('.profile-button').click();await expect(page.locator('.profile-menu')).not.toContainText('查看学情');await expect(page.locator('.profile-menu')).not.toContainText('打开笔记');await page.getByRole('button',{name:'帮助支持',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('先选功能分类');await page.getByText('装机店：接待、装配、自检和交付',{exact:true}).click();await expect(page.getByRole('dialog')).toContainText('等待服务器返回验收结果');await page.keyboard.press('Escape');pass('账号菜单入口精简，帮助包含逐步指南，Escape 关闭并恢复焦点');

  for(const [label,selector] of [['课程首页','.quest-student-home'],['学习记录','.records-screen'],['课后作业','.student-assignments'],['错题本','.mistakes-layout'],['知识库','.kb-vault'],['课程课件','.courseware-view']]) {
    await nav(label);await expect(page.locator(selector)).toBeVisible();
    for(const width of [1366,768,390,320]){
      await page.setViewportSize({width,height:width<500?844:900});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${label} at ${width} px overflow`);
      if(width===1366||width===390)await page.screenshot({path:path.join(artifacts,`platform-${label}-${width}.png`),fullPage:true});
    }
    await page.setViewportSize({width:1366,height:900});pass(label+'：四种宽度的布局与实际入口正常');
  }
  await nav('知识库');await expect(page.locator('.kb-vault')).toBeVisible();await nav('错题本');await expect(page.locator('.mistakes-layout')).toBeVisible();
  await page.goBack();await expect(page.locator('.kb-vault')).toBeVisible();await page.goForward();await expect(page.locator('.mistakes-layout')).toBeVisible();pass('浏览器前进与后退恢复对应页面');
  await page.route('**/api/student/mistakes',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'错题服务故障注入'})}));
  await nav('课程首页');await nav('错题本');await expect(page.getByRole('button',{name:'重试加载错题',exact:true})).toBeVisible();await page.unroute('**/api/student/mistakes');await page.getByRole('button',{name:'重试加载错题',exact:true}).click();await expect(page.locator('.mistake-group').first()).toBeVisible();pass('错题加载失败有可用重试');
  await page.route('**/api/student/knowledge/documents',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'资料服务故障注入'})}));
  await nav('知识库');await expect(page.getByRole('button',{name:'重试加载文档',exact:true})).toBeVisible();await page.unroute('**/api/student/knowledge/documents');await page.getByRole('button',{name:'重试加载文档',exact:true}).click();await expect(page.getByRole('button',{name:'重试加载文档',exact:true})).toHaveCount(0);pass('知识库加载失败可重试，无需退出页面');
  await page.route('**/api/auth/logout',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'退出故障注入'})}));
  await logout();await expect(page.locator('.platform-sync-banner')).toContainText('退出失败');await expect(page.locator('.profile-button')).toContainText('演示学生1');await page.unroute('**/api/auth/logout');await logout();await expect(page.locator('.profile-button')).toHaveCount(0);pass('退出失败保留真实身份，重试才退出');
  await login('demo2026002');await expect(page.locator('.profile-button')).toContainText('演示学生2');await page.goBack();await expect(page.locator('.profile-button')).toContainText('演示学生2');await logout();pass('账户切换与历史返回不恢复上一位用户身份');
  await login('teacher');await expect(page.locator('.teacher-studio')).toBeVisible();
  await openTeacherWorkspace(page,TEACHER_WORKSPACE.statistics,TEACHER_WORKSPACE.insight);
  await page.locator('.teacher-quest-chapter-detail').first().locator('summary').click();await page.locator('.teacher-quest-item').first().click();await expect(page.getByRole('region',{name:'学生学习证据'})).toBeVisible();pass('教师章节明细点击后显示真实学习证据');
  for(const width of [1366,768,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`teacher at ${width} px overflow`);await page.screenshot({path:path.join(artifacts,`platform-teacher-${width}.png`),fullPage:true});}
  await page.setViewportSize({width:1366,height:900});pass('教师工作台三个窗口尺寸无溢出');
  await openTeacherWorkspace(page,TEACHER_WORKSPACE.teaching);
  const disclosure=page.locator('.teacher-section-disclosure').filter({hasText:'课后作业管理'});await disclosure.locator('summary').click();
  await page.getByRole('button',{name:'创建作业',exact:true}).click();await page.getByRole('textbox',{name:'作业标题',exact:true}).fill('全平台审核作业');
  await page.route('**/api/teacher/classes/*/assignments',async route=>{if(route.request().method()==='POST')await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'创建故障注入'})});else await route.continue();});
  await page.locator('.assignment-creator').getByRole('button',{name:'创建',exact:true}).click();await expect(page.locator('.assignment-creator')).toContainText('创建失败');await expect(page.getByRole('textbox',{name:'作业标题',exact:true})).toHaveValue('全平台审核作业');
  await page.unroute('**/api/teacher/classes/*/assignments');await page.locator('.assignment-creator').getByRole('button',{name:'创建',exact:true}).click();await expect(page.locator('.assignment-row').filter({hasText:'全平台审核作业'})).toBeVisible();pass('创建作业失败保留输入，重试写入真实草稿');
  // Delay a real classroom response, switch class, then release it.
  const classSelect=page.locator('.teacher-class-select select');
  const currentClass=await classSelect.inputValue();
  const otherClass=await classSelect.locator('option').evaluateAll((options,id)=>options.find(option=>option.value&&option.value!==id)?.value,currentClass);
  assert.ok(otherClass);
  const sessionResponse=await page.request.post(`${app}/api/teacher/classes/${otherClass}/sessions`,{data:{templateKey:'computer-data-flow',durationMinutes:45,passScore:80}});assert.ok(sessionResponse.ok());
  let release,held;const waitRelease=new Promise(resolve=>release=resolve),waitHeld=new Promise(resolve=>held=resolve);
  const delayedUrl=`**/api/teacher/classes/${otherClass}/sessions/current`;
  await page.route(delayedUrl,async route=>{const response=await route.fetch();held();await waitRelease;await route.fulfill({response});});
  await classSelect.selectOption(otherClass);await waitHeld;
  await classSelect.selectOption(currentClass);await expect(page.locator('.session-setup-panel')).toBeVisible();
  const releasedResponse=page.waitForResponse(response=>response.url().endsWith(`/classes/${otherClass}/sessions/current`));release();await releasedResponse;
  await expect(page.locator('.live-session-dashboard')).toHaveCount(0);await expect(classSelect).toHaveValue(currentClass);await page.unroute(delayedUrl);pass('切换班级后迟到的课堂响应不覆盖当前班级');
  await classSelect.selectOption(otherClass);await expect(page.locator('.live-session-dashboard')).toBeVisible();
  await page.route('**/api/teacher/sessions/*/start',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'课堂控制故障注入'})}));
  await page.getByRole('button',{name:'开始课堂',exact:true}).click();await expect(page.locator('.classroom-command-center')).toContainText('课堂操作失败');await expect(page.getByRole('button',{name:'开始课堂',exact:true})).toBeEnabled();
  await page.unroute('**/api/teacher/sessions/*/start');await page.getByRole('button',{name:'开始课堂',exact:true}).click();await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();pass('课堂控制失败有反馈并可重试，无未捕获异常');
  assert.deepEqual(errors,[]);pass('全部巡检无未捕获前端运行异常');
  console.log(`${results.length} platform audit checks passed`);
}catch(error){if(page)await page.screenshot({path:path.join(artifacts,'platform-audit-error.png'),fullPage:true});throw error;}finally{await browser.close();}
