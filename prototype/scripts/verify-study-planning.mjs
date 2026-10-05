import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { gotoApp, fillLoginForm, submitLoginForm } from './lib/qaLogin.mjs';
import { clickTopNavItem } from './nav-helpers.mjs';

const app=process.env.PROTOTYPE_APP_URL??'http://127.0.0.1:8788';
mkdirSync('qa-artifacts',{recursive:true});
let browser;try{browser=await chromium.launch({channel:'msedge',headless:true});}catch{browser=await chromium.launch({headless:true});}
const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const nav=(p,name)=>({click:()=>clickTopNavItem(p,name)});
const panel=page.getByTestId('study-planning');
let teacher;
async function post(p,path,body,method='POST'){const r=await p.request.fetch(app+path,{method,data:body});assert.ok(r.ok(),`${path}: ${r.status()} ${await r.text()}`);return r.json();}
try{
  teacher=await browser.newPage({viewport:{width:1366,height:768}});teacher.on('pageerror',e=>errors.push(e.message));
  await gotoApp(teacher,app);await fillLoginForm(teacher,{username:'teacher',password:'ChangeMe123!'});await teacher.locator('[data-login-role="teacher"]').click();await Promise.all([teacher.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.status()===200),submitLoginForm(teacher)]);await expect(teacher.locator('.topbar-nav-toggle').filter({hasText:'学习复盘'})).toBeVisible();
  const cls=(await post(teacher,'/api/classes',{name:'学习计划验收班'})).class;
  const username='studyqa-'+Date.now();await post(teacher,`/api/teacher/classes/${cls.id}/import-students`,{csv:`username,displayName,password\n${username},计划验收学生,Student123!`});
  await post(teacher,`/api/teacher/classes/${cls.id}/skip-locked`,{allow:true},'PUT');
  const summary=await (await teacher.request.get(app+`/api/teacher/classes/${cls.id}/learning-coach`)).json();
  await post(teacher,`/api/teacher/classes/${cls.id}/learning-coach/tasks`,{studentIds:[summary.students[0].id],title:'全加器教师补练'});
  await gotoApp(page,app);await fillLoginForm(page,{username,password:'Student123!'});await submitLoginForm(page);await nav(page,'学习记录').click();
  await expect(panel).toBeVisible();await expect(panel.getByRole('button',{name:'新建学习计划',exact:true})).toBeEnabled();
  await expect(panel).toContainText('全加器教师补练');
  await panel.getByRole('button',{name:'新建学习计划',exact:true}).click();await panel.getByLabel('学习计划目标').fill('掌握输入进位');await panel.getByLabel('学习计划关联内容').selectOption('lab:full-adder');await panel.getByLabel('学习计划预计分钟').fill('25');await panel.getByRole('button',{name:'保存学习计划',exact:true}).click();
  const item=panel.locator('.study-plan-item').filter({hasText:'掌握输入进位'});await expect(item).toBeVisible();
  await item.getByRole('button',{name:'调整',exact:true}).click();await panel.getByLabel('学习计划目标').fill('验证输入进位路径');await panel.getByRole('button',{name:'保存学习计划',exact:true}).click();
  const adjusted=panel.locator('.study-plan-item').filter({hasText:'验证输入进位路径'});await adjusted.getByRole('button',{name:'开始计时',exact:true}).click();
  await expect(panel.getByTestId('focus-timer')).toContainText('验证输入进位路径');await panel.getByRole('button',{name:'暂停计时',exact:true}).click();await expect(panel).toContainText('已暂停');
  const saved=(await (await page.request.get(app+'/api/student/study-workspace')).json()).active;assert.equal(saved.status,'paused');
  await page.reload({waitUntil:'domcontentloaded'});await expect(panel).toContainText('已暂停');
  await adjusted.getByRole('button',{name:'前往学习',exact:true}).click();const lab=page.locator('.lab-focus-disclosure');await expect(lab).toContainText('验证输入进位路径');await expect(lab).toContainText('已暂停');
  await lab.getByRole('button',{name:'继续计时',exact:true}).click();await expect(lab).toContainText('计时中');
  await nav(page,'学习记录').click();await expect(panel).toContainText('计时中');await panel.getByRole('button',{name:'结束并记录',exact:true}).click();await expect(panel).toContainText('已暂停');
  await panel.getByLabel('本轮学习成果').fill('找到了输入进位的传播路径');await panel.getByLabel('本轮学习疑问').fill('两位加法的进位如何传递？');await panel.getByRole('button',{name:'保存本轮学习记录',exact:true}).click();await expect(panel).toContainText('本轮学习记录已保存');
  await panel.locator('.study-week-review>summary').click();await expect(panel).toContainText('两位加法的进位如何传递？');
  assert.equal((await (await page.request.get(app+'/api/student/study-workspace')).json()).plans[0].status,'pending');
  await panel.getByRole('button',{name:'休息5分钟',exact:true}).click();await expect(panel.getByTestId('focus-timer')).toContainText('留一点休息时间');await panel.getByRole('button',{name:'结束休息',exact:true}).click();
  const after=(await (await page.request.get(app+'/api/student/study-workspace')).json());assert.equal(after.week.sessions,1);assert.equal(after.history.filter(t=>t.kind==='break').length,1);
  // Actual new circuit evidence completes the plan, separately from focus history.
  await adjusted.getByRole('button',{name:'前往学习',exact:true}).click();await page.getByRole('button',{name:'填入参考结构',exact:true}).click();
  await page.getByRole('button',{name:'提交检测',exact:true}).click();await expect(page.locator('.lab-studio-feedback.passed')).toBeAttached();
  await page.getByRole('button',{name:'复盘本关',exact:true}).click();
  await nav(page,'学习记录').click();await panel.getByRole('button',{name:'刷新学习计划',exact:true}).click();await panel.getByRole('button',{name:/已完成计划/}).click();await expect(panel).toContainText('关联实验的新检测通过记录');
  // Self-confirmation and failure retry preserve grades and the saved reflection.
  await panel.getByRole('button',{name:'新建学习计划',exact:true}).click();await panel.getByLabel('学习计划目标').fill('整理本轮疑问');await panel.getByRole('button',{name:'保存学习计划',exact:true}).click();const manual=panel.locator('.study-plan-item').filter({hasText:'整理本轮疑问'});await manual.getByRole('button',{name:'我已完成',exact:true}).click();await expect(panel).toContainText('个人确认完成');
  await page.route('**/api/student/study-workspace',r=>r.fulfill({status:503,json:{error:'验收网络暂不可用'}}));await panel.getByRole('button',{name:'刷新学习计划',exact:true}).click();await expect(panel).toContainText('验收网络暂不可用');await page.unroute('**/api/student/study-workspace');await panel.getByRole('button',{name:'刷新学习计划与计时',exact:true}).click();await expect(panel.locator('.study-error')).toHaveCount(0);
  await page.screenshot({path:'qa-artifacts/study-planning-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'qa-artifacts/study-planning-mobile.png',fullPage:true});
  // Teacher can use their own plans, but reviewing a student never mounts private tools.
  await teacher.reload({waitUntil:'domcontentloaded'});await expect(teacher.locator('.teacher-studio')).toBeVisible();await nav(teacher,'学习记录').click();await teacher.getByLabel('学情班级',{exact:true}).selectOption(String(cls.id));await teacher.getByLabel('学情查看对象',{exact:true}).selectOption(String(summary.students[0].id));await expect(teacher.locator('.teacher-review-scope')).toContainText('计划验收学生');await expect(teacher.getByTestId('study-planning')).toHaveCount(0);
  await teacher.getByLabel('学情查看对象',{exact:true}).selectOption('mine');await expect(teacher.getByTestId('study-planning')).toBeVisible();await expect(teacher.getByTestId('study-planning')).not.toContainText('两位加法的进位如何传递？');
  assert.deepEqual(errors,[]);console.log('PASS: private plans, editing/navigation, timer pause/resume/page/reload recovery, stopped reflection capture, rest exclusion, genuine circuit completion, self completion, mobile, network retry and teacher privacy.');
}catch(error){await page.screenshot({path:'qa-artifacts/study-planning-failure.png',fullPage:true});if(teacher){console.error('TEACHER PAGE:',await teacher.locator('body').innerText());await teacher.screenshot({path:'qa-artifacts/study-planning-teacher-failure.png',fullPage:true});}throw error;}finally{await browser.close();}
