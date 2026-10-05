import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { gotoApp, fillLoginForm, submitLoginForm } from './lib/qaLogin.mjs';
import { clickTopNavItem } from './nav-helpers.mjs';

const app=process.env.PROTOTYPE_APP_URL??'http://127.0.0.1:8788';
mkdirSync('qa-artifacts',{recursive:true});
let browser;try{browser=await chromium.launch({channel:'msedge',headless:true});}catch{browser=await chromium.launch({headless:true});}
const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await gotoApp(page,app);await fillLoginForm(page,{username:'teacher',password:'ChangeMe123!'});await page.locator('[data-login-role="teacher"]').click();await submitLoginForm(page);await expect(page.locator('.teacher-studio')).toBeVisible();
  const title='班级管理验收-'+Date.now();
  // Detect the original defect against the pre-fix production build.
  if(await page.locator('.teacher-class-create').count()){
    await page.locator('.teacher-class-create>summary').click();await page.getByLabel('新班级名称').fill(title);await page.getByRole('button',{name:'创建班级',exact:true}).click();await expect(page.locator('.teacher-class-create')).toContainText('班级已创建');
    assert.equal(await page.locator('.teacher-class-create').evaluate(n=>n.open),false,'创建成功后表单仍展开在工具栏，无法就近导入学生');
  }
  await page.getByRole('button',{name:'创建班级',exact:true}).click();
  const management=page.getByTestId('class-management');await expect(management).toBeVisible();
  await management.getByLabel('新班级名称').fill(title);await management.getByRole('button',{name:'确认创建班级',exact:true}).click();
  await expect(management).toContainText('班级已创建');await expect(management.getByLabel('新班级名称')).toHaveCount(0);await expect(management).toContainText(title);assert.ok(await page.locator('.teacher-dashboard-toolbar').evaluate(n=>n.offsetHeight<=130),'工具栏保持紧凑');
  const id=Number(await page.locator('.teacher-class-select select').inputValue()), username='classqa-'+Date.now();
  const importer=management.getByTestId('student-import');await expect(importer.getByRole('button',{name:'导入学生',exact:true})).toBeDisabled();
  await importer.getByLabel('选择学生CSV文件').setInputFiles({name:'学生.csv',mimeType:'text/csv',buffer:Buffer.from(`\uFEFF学号,姓名,初始密码\n${username},名单验收学生,\n,缺少学号,`)});
  await expect(importer.getByLabel('学生导入 CSV')).toContainText('名单验收学生');await importer.getByRole('button',{name:'导入学生',exact:true}).click();
  await expect(importer).toContainText('新增 1');await expect(importer).toContainText('跳过 1');await expect(importer).toContainText('第3行');await expect(management.locator('.class-roster')).toContainText('名单验收学生');
  const password=await importer.locator('.teacher-credential-row code').textContent();assert.ok(password);
  const download=page.waitForEvent('download');await importer.getByRole('button',{name:'下载初始口令 CSV',exact:true}).click();assert.ok((await download).suggestedFilename().endsWith('.csv'));
  // Server errors are shown next to the import; saved roster and credentials survive.
  await page.route(`**/api/teacher/classes/${id}/import-students`,r=>r.fulfill({status:400,json:{error:'验收CSV格式错误'}}));await importer.getByRole('button',{name:'导入学生',exact:true}).click();await expect(importer.getByRole('alert')).toContainText('验收CSV格式错误');await expect(importer.locator('.teacher-credential-row code')).toHaveText(password);await page.unroute(`**/api/teacher/classes/${id}/import-students`);
  const student=await browser.newPage({viewport:{width:1366,height:768}});await gotoApp(student,app);await fillLoginForm(student,{username,password});await submitLoginForm(student);await expect(student.locator('.quest-student-home')).toBeVisible();await student.close();
  await importer.getByLabel('学生导入 CSV').fill(`学号,姓名,初始密码\n${username}-2,粘贴验收学生,Student123!`);await importer.getByRole('button',{name:'导入学生',exact:true}).click();await expect(management.locator('.class-roster')).toContainText('粘贴验收学生');
  await expect(importer.locator('.teacher-credential-row')).toHaveCount(2);await expect(importer.locator('.teacher-credential-row').first().locator('code')).toHaveText(password);
  await page.getByRole('button',{name:'创建班级',exact:true}).click();await management.getByLabel('新班级名称').fill('取消不会创建');await management.getByRole('button',{name:'取消创建',exact:true}).click();await expect(management.getByLabel('新班级名称')).toHaveCount(0);
  await page.screenshot({path:'qa-artifacts/class-management-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'手机页面横向溢出');await page.screenshot({path:'qa-artifacts/class-management-mobile.png',fullPage:true});
  await management.getByRole('button',{name:'返回教学活动',exact:true}).click();await expect(management).toHaveCount(0);await page.locator('.teacher-workspace-nav').getByRole('button',{name:'班级管理',exact:true}).click();await expect(management.locator('.class-roster')).toContainText('名单验收学生');
  await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('.teacher-studio')).toBeVisible();await page.locator('.teacher-class-select select').selectOption(String(id));await page.locator('.teacher-workspace-nav').getByRole('button',{name:'班级管理',exact:true}).click();await expect(management.locator('.class-roster')).toContainText('名单验收学生');
  await clickTopNavItem(page,'课程首页');await expect(page.getByTestId('course-adventure-map')).toBeVisible();await expect(page.getByRole('button',{name:'进入教师工作台',exact:true})).toBeVisible();await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByTestId('course-adventure-map')).toBeVisible();
  for(const label of ['AI讲演','互动演示','硬件配置挑战','学习记录','错题本','知识库','课后作业']) { await clickTopNavItem(page,label);await expect(page.locator('.topbar-nav-item.active').first()).toContainText(label); }
  await clickTopNavItem(page,'硬件配置挑战');await page.locator('.shop-custom-entry').click();await expect(page.locator('.custom-customer-page')).toBeVisible();assert.equal((await page.request.get(app+'/api/teacher/custom-customers/status')).status(),200);
  await clickTopNavItem(page,'学习记录');await page.getByLabel('学情查看对象',{exact:true}).selectOption('mine');await expect(page.getByTestId('study-planning')).toBeVisible();await page.getByRole('button',{name:'小芯复习建议，点击提问',exact:true}).click();await page.getByLabel('你的课程问题',{exact:true}).fill('全加器怎样处理输入进位？');await page.getByRole('button',{name:'发送到 DeepSeek',exact:true}).click();await expect(page.locator('.study-mascot-source')).toContainText('课程参考');await page.getByRole('button',{name:'关闭小芯助教',exact:true}).click();
  await expect(page.locator('.records-calendar-panel')).toBeVisible();assert.equal((await page.request.get(app+'/api/teacher/activity')).status(),200);assert.equal((await page.request.get(app+'/api/teacher/cpu-practice')).status(),200);const ownReport=page.waitForEvent('download');await page.getByRole('link',{name:'导出实验报告',exact:true}).click();assert.equal((await ownReport).suggestedFilename(),'teacher-practice-report.md');
  await page.getByLabel('学情查看对象',{exact:true}).selectOption('all');await expect(page.locator('.teacher-review-roster')).toBeVisible();await page.getByLabel('学情查看对象',{exact:true}).selectOption(String((await (await page.request.get(app+`/api/teacher/classes/${id}/overview`)).json()).students[0].id));await expect(page.locator('.teacher-review-scope')).toContainText('正在查看');await expect(page.getByTestId('study-planning')).toHaveCount(0);await expect(page.locator('.records-kpi-review .study-mascot-trigger')).toHaveCount(0);
  await expect(page.locator('.pomodoro-panel')).toHaveCount(0);await expect(page.locator('.records-calendar-panel')).toHaveCount(0);await expect(page.getByRole('link',{name:'导出实验报告',exact:true})).toHaveCount(0);
  await clickTopNavItem(page,'教师看板');await expect(page.locator('.teacher-studio')).toBeVisible();
  await page.locator('.profile-button').click();await page.getByRole('button',{name:'个人设置',exact:true}).click();const settings=page.getByRole('dialog');await settings.getByRole('tab',{name:'课堂管理',exact:true}).click();await expect(settings.getByLabel('选择学生CSV文件')).toBeVisible();await expect(settings.getByLabel('学生导入 CSV')).toBeVisible();await expect(settings.getByRole('button',{name:'导入学生',exact:true})).toBeDisabled();
  assert.deepEqual(errors,[]);console.log('PASS: class creation/cancel/compact toolbar, CSV file and paste import, row errors and credentials, student login, roster refresh, mobile and reload persistence.');
}catch(e){await page.screenshot({path:'qa-artifacts/class-management-failure.png',fullPage:true});throw e;}finally{await browser.close();}
