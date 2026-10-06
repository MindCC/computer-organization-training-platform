import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
import {gotoApp,fillLoginForm,submitLoginForm} from './lib/qaLogin.mjs';
import {clickTopNavItem} from './nav-helpers.mjs';
import {openChallengeFromHome} from './lib/qaHome.mjs';

const app=process.env.PROTOTYPE_APP_URL??'http://127.0.0.1:8787';
mkdirSync('qa-artifacts',{recursive:true});
let browser;try{browser=await chromium.launch({channel:'msedge',headless:true});}catch{browser=await chromium.launch({headless:true});}
const errors=[],page=await browser.newPage({viewport:{width:1366,height:900}}),teacher=await browser.newPage({viewport:{width:1366,height:900}});
for(const p of [page,teacher])p.on('pageerror',e=>errors.push(e.message));
async function post(context,path,data){const response=await context.post(app+path,{data});assert.ok(response.ok(),`${path}: ${await response.text()}`);return response.json();}
try{
  await gotoApp(teacher,app);await fillLoginForm(teacher,{username:'teacher',password:'ChangeMe123!'});await teacher.locator('[data-login-role="teacher"]').click();
  const authenticated=teacher.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.status()===200);await submitLoginForm(teacher);await (await authenticated).finished();
  const classroom=(await post(teacher.request,'/api/classes',{name:'通用诊断验收班'})).class,username='general-coach-'+Date.now();
  await post(teacher.request,`/api/teacher/classes/${classroom.id}/import-students`,{csv:`${username},通用诊断验收学生,Student123!`});
  assert.ok((await teacher.request.put(app+`/api/teacher/classes/${classroom.id}/skip-locked`,{data:{allow:true}})).ok());
  await teacher.reload();await clickTopNavItem(teacher,'学习记录');await teacher.getByLabel('学情班级',{exact:true}).selectOption(String(classroom.id));
  const review=teacher.getByTestId('teacher-coach-review');
  await expect(review.getByLabel('教师诊断实验').locator('option')).toHaveCount(29);
  for(const id of ['not-gate','memory-address']){
    await review.getByLabel('教师诊断实验').selectOption(id);
    await expect(review.getByRole('button',{name:'选择全班',exact:true})).toBeVisible();
    await review.getByRole('button',{name:'选择全班',exact:true}).click();
    await review.getByRole('button',{name:'确认发布补练（1人）',exact:true}).click();
    await expect(review).toContainText('已发布 1 个补练任务');
  }
  await gotoApp(page,app);await fillLoginForm(page,{username,password:'Student123!'});await submitLoginForm(page);
  const next=page.getByTestId('coach-next-step'),coach=page.getByTestId('learning-coach');
  await next.getByRole('button',{name:'前往存储器与地址访问诊断与补练'}).click();
  await expect(coach).toContainText('存储器与地址访问 ·');
  await coach.getByRole('button',{name:'帮我诊断当前电路',exact:true}).click();
  await expect(coach.locator('.coach-session-meta')).toContainText('待修正');
  await coach.getByRole('button',{name:'给我概念提醒'}).click();await expect(coach.locator('.coach-hints')).not.toContainText('Cin');
  await page.getByRole('button',{name:'填入参考结构',exact:true}).click();
  await coach.getByRole('button',{name:'验证当前修改',exact:true}).click();
  await expect(coach.locator('.coach-session-meta')).toContainText('电路检测通过');
  await coach.getByRole('button',{name:'开始变式复测',exact:true}).click();
  await expect(coach.locator('.coach-retest fieldset')).toHaveCount(4);
  const run=(await (await page.request.get(app+'/api/student/learning-coach?challengeId=memory-address')).json()).latest;
  for(const [i,q] of run.retest.questions.entries()){
    const values=Object.values(q.inputs),address=values.find(v=>v>=100),read=values.find(v=>v===0||v===1);
    const expected=[read?[5,9,2,12][address-100]:0,read];
    for(let j=0;j<expected.length;j++)await coach.getByLabel(`第${i+1}题输出${j+1}`).selectOption(String(expected[j]));
  }
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await coach.getByRole('button',{name:'提交复测并判分'}).click();await expect(coach.locator('.coach-retest')).toContainText('4 / 4 题通过');
  await page.evaluate(()=>window.scrollTo(0,0));const bounds=await coach.boundingBox();await page.screenshot({path:'qa-artifacts/general-coach-mobile.png',fullPage:true,clip:bounds});
  await page.setViewportSize({width:1366,height:900});await page.reload();await expect(coach.locator('.coach-retest')).toContainText('4 / 4 题通过');
  await clickTopNavItem(page,'课程首页');await next.getByRole('button',{name:'前往非门诊断与补练'}).click();
  await expect(coach).toContainText('非门 ·');await expect(coach.locator('.coach-session')).toHaveCount(0);
  await page.getByRole('button',{name:'填入参考结构',exact:true}).click();await coach.getByRole('button',{name:'帮我诊断当前电路',exact:true}).click();
  await expect(coach.locator('.coach-session-meta')).toContainText('电路检测通过');await coach.getByRole('button',{name:'开始变式复测',exact:true}).click();
  await expect(coach.locator('.coach-retest fieldset')).toHaveCount(2);await expect(coach.locator('.coach-retest')).toContainText('本实验有 2 组不同输入');
  await clickTopNavItem(page,'课程首页');await openChallengeFromHome(page,'存储器与地址访问');await expect(coach.locator('.coach-retest')).toContainText('4 / 4 题通过');
  await review.getByRole('button',{name:'刷新补练记录'}).click();await expect(review.getByRole('button',{name:'待修正 · 0 人',exact:true})).toBeDisabled();
  const summary=(await (await teacher.request.get(app+`/api/teacher/classes/${classroom.id}/learning-coach?challengeId=memory-address`)).json());assert.equal(summary.pendingTasks,0);assert.equal(summary.passedStudents,1);
  await teacher.setViewportSize({width:390,height:844});assert.ok(await teacher.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);
  console.log('PASS: 29 experiment choices, teacher tasks, storage diagnosis/repair/retest, homepage routing, small-domain warning, isolated reload, student and teacher mobile.');
}catch(error){await page.screenshot({path:'qa-artifacts/general-coach-failure.png',fullPage:true});throw error;}finally{await browser.close();}
