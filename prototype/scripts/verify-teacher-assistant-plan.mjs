import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { fillLoginForm } from './lib/qaLogin.mjs';
import { openTeacherWorkspace, TEACHER_WORKSPACE } from './lib/qaTeacherWorkspace.mjs';
import { selectTeacherClass } from './helpers/select-teacher-class.mjs';
import { mkdirSync } from 'node:fs';

const baseUrl = process.env.PROTOTYPE_APP_URL ?? 'http://127.0.0.1:5173';
const apiUrl = process.env.PROTOTYPE_API_URL ?? baseUrl;
const teacherUsername = process.env.TEACHER_USERNAME ?? 'teacher';
const teacherPassword = process.env.TEACHER_PASSWORD;
const className = `助教采纳校验班 ${Date.now()}`;
const jar = {};

async function api(path, options = {}, cookies = jar) {
  const headers = { ...(options.headers ?? {}) };
  if (cookies.cookie) headers.cookie = cookies.cookie;
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers });
  const cookie = response.headers.get('set-cookie');
  if (cookie) cookies.cookie = cookie.split(';')[0];
  const body = await response.json();
  assert.ok(response.ok, `${path}: ${JSON.stringify(body)}`);
  return body;
}

await api('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: teacherUsername, password: teacherPassword }) });
const { class: classroom } = await api('/api/classes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: className }) });
const studentUsername=`qa-plan-${Date.now()}`,studentJar={};
await api(`/api/teacher/classes/${classroom.id}/import-students`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csv: `学号,姓名,初始密码\n${studentUsername},证据学生,Student123!` }) });
await api(`/api/teacher/classes/${classroom.id}/skip-locked`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({allow:true})});
await api('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:studentUsername,password:'Student123!'})},studentJar);
await api('/api/student/attempts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({challengeId:'full-adder',result:{circuitEdges:[],elapsedMinutes:2}})},studentJar);

const browser = await chromium.launch({ channel: 'msedge', headless: true }).catch(() => chromium.launch({ headless: true }));
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await fillLoginForm(page, { username: teacherUsername, password: teacherPassword });
  await page.locator('[data-login-role="teacher"]').click();
  await page.locator('.login-submit').click();
  await page.locator('.teacher-studio').waitFor({ state: 'visible', timeout: 30_000 });
  assert.equal(await selectTeacherClass(page, className), true);

  await openTeacherWorkspace(page, TEACHER_WORKSPACE.statistics, TEACHER_WORKSPACE.assistant);
  await page.getByRole('button', { name: '生成 AI 助教建议' }).click();
  await expect(page.locator('.teacher-evidence-item').first()).toContainText('班级整体');
  await expect(page.locator('.teacher-plan-suggestion').first()).toContainText('依据');
  await expect(page.locator('.teacher-plan-suggestion').first()).toContainText('加法器进位路径');
  await page.getByRole('button', { name: '采纳并编辑课堂草稿' }).click();

  const focus = page.getByRole('textbox', { name: '本节教学重点' });
  await expect(focus).toBeVisible();
  await focus.fill('教师修订：先区分地址与数据');
  await page.getByRole('textbox', { name: /课堂步骤/ }).fill('观察数据流\n重做关键连线');
  await page.getByRole('textbox',{name:'教师调整说明（可选）'}).fill('先确认输入和输出，再进行独立复测。');
  const createResponse = page.waitForResponse((response) => response.url().endsWith('/api/teacher/task-library') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '保存任务',exact:true }).click();
  const response=await createResponse;assert.equal(response.status(),201);
  const {task}=await response.json();
  assert.deepEqual(task.config.lessonPlan.steps, ['观察数据流', '重做关键连线']);
  assert.ok(task.assistantReview.report.reportId);
  assert.equal(task.assistantReview.decisions.length,1);
  assert.equal(task.assistantReview.decisions[0].note,'先确认输入和输出，再进行独立复测。');
  assert.equal((await api(`/api/teacher/classes/${classroom.id}/sessions/current`)).session,null);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator(`[data-task-id="${task.id}"]`).getByRole('button',{name:'修改',exact:true}).click();
  await page.locator('.chain-teacher-plan>summary').click();
  await expect(page.getByRole('textbox',{name:'本节教学重点'})).toHaveValue('教师修订：先区分地址与数据');
  await page.locator('.assistant-decision-panel>summary').click();
  await expect(page.locator('.assistant-decision-panel')).toContainText('版本 1');
  await expect(page.locator('.assistant-decision-panel')).toContainText('原始安排及依据');
  await page.getByRole('textbox',{name:'教师讲解提示',exact:true}).fill('教师第二次调整：先看失败反例。');
  await page.getByRole('textbox',{name:'教师调整说明（可选）'}).fill('增加失败反例讨论。');
  const updateResponse=page.waitForResponse(r=>r.url().endsWith(`/api/teacher/task-library/${task.id}`)&&r.request().method()==='PUT');
  await page.getByRole('button',{name:'保存任务',exact:true}).click();
  assert.equal((await updateResponse).status(),200);
  let latest=(await api(`/api/teacher/task-library/${task.id}`)).task;
  assert.equal(latest.assistantReview.decisions.length,2);
  assert.equal(latest.assistantReview.decisions[1].note,'先确认输入和输出，再进行独立复测。');
  const published=await api(`/api/teacher/task-library/${task.id}/publish`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({classId:classroom.id,revision:latest.revision,clientSubmissionId:`publish-assistant-${Date.now()}`})});
  const studentView=await api('/api/student/classroom/current',{},studentJar);
  assert.equal(studentView.session.id,published.session.id);
  assert.doesNotMatch(JSON.stringify(studentView),/assistantReview|reportId|sourceReport|证据学生/);
  await page.locator(`[data-task-id="${task.id}"]`).getByRole('button',{name:'修改',exact:true}).click();
  await page.locator('.assistant-decision-panel>summary').click();
  await expect(page.locator('.assistant-decision-panel')).toContainText(`课堂 #${published.session.id}`);
  await expect(page.locator('.assistant-decision-panel')).toContainText('版本 2');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  mkdirSync('qa-artifacts',{recursive:true});
  await page.evaluate(()=>window.scrollTo(0,0));
  const panelBounds=await page.locator('.assistant-decision-panel').boundingBox();
  await page.screenshot({path:'qa-artifacts/assistant-decision-panel-mobile.png',fullPage:true,clip:panelBounds});
  await page.screenshot({path:'qa-artifacts/assistant-decision-mobile.png',fullPage:true});
  assert.deepEqual(errors, []);
  console.log('PASS: per-suggestion evidence, server snapshot, teacher revisions, publication trace, student privacy, reload and mobile');
} finally {
  await browser.close();
}
