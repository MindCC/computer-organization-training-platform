import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { fillLoginForm } from './lib/qaLogin.mjs';

// 任务链学情回归：任务库卡片完成度、各环节学情与「学情统计」同源联动。
// 造数全部走真实 API（发布课堂、学生接受并提交），不断言任何模拟数据。
const url=process.env.PROTOTYPE_APP_URL??'http://127.0.0.1:5173';
const apiUrl=process.env.PROTOTYPE_API_URL??url;
const dir=process.env.QA_ARTIFACT_DIR??path.resolve('qa-artifacts');mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
const teacherContext=await browser.newContext({viewport:{width:1366,height:768}});
async function api(jar,route,method='GET',body) {
  const response=await fetch(apiUrl+route,{method,headers:{'content-type':'application/json',...(jar.cookie?{cookie:jar.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(response.headers.get('set-cookie'))jar.cookie=response.headers.get('set-cookie').split(';')[0];
  const data=await response.json();assert.ok(response.ok,`${route}: ${JSON.stringify(data)}`);return data;
}
async function login(context,username,password,role='teacher') {
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});await fillLoginForm(page,{username,password});await page.locator(`[data-login-role="${role}"]`).click();await page.locator('.login-submit').click();
  await page.locator('.platform-topbar,.topbar').first().waitFor();return page;
}
try {
  const jar={};await api(jar,'/api/auth/login','POST',{username:process.env.TEACHER_USERNAME??'teacher',password:process.env.TEACHER_PASSWORD??'ChangeMe123!'});
  const {class:cls}=await api(jar,'/api/classes','POST',{name:'任务链学情 QA'});
  await api(jar,`/api/teacher/classes/${cls.id}/import-students`,'POST',{csv:'learn101,学生甲,Student123!\nlearn102,学生乙,Student123!'});
  const config={templateKey:'task-chain',durationMinutes:30,passScore:80,taskChain:{title:'学情联动任务链',stages:[
    {id:'quiz',type:'practice',title:'课前诊断',instructions:'独立作答，检验补码范围与编码。',chapterId:'ch2',questionIds:['ch2-q02','ch2-q04','ch2-q07'],completion:'passed'},
    {id:'wrap',type:'custom',title:'总结确认',instructions:'确认已完成本节学习。',submissionMode:'confirm'}]}};
  const {task}=await api(jar,'/api/teacher/task-library','POST',config);
  const published=await api(jar,`/api/teacher/task-library/${task.id}/publish`,'POST',{classId:cls.id,revision:1,clientSubmissionId:'publish-learning-qa-001'});
  const sessionId=published.session.id;
  // 学生甲：练习满分并通过确认环节，完成整条任务链
  const alice={};await api(alice,'/api/auth/login','POST',{username:'learn101',password:'Student123!'});
  await api(alice,`/api/student/classroom/${sessionId}/enter`,'POST');
  await api(alice,`/api/student/classroom/${sessionId}/complete-stage`,'POST',{stageId:'quiz',evidence:{answers:{'ch2-q02':'-128 ~ 127','ch2-q04':'-1','ch2-q07':'11111011'}},clientSubmissionId:'alice-quiz-001'});
  await api(alice,`/api/student/classroom/${sessionId}/complete-stage`,'POST',{stageId:'wrap',evidence:{completed:true},clientSubmissionId:'alice-wrap-001'});
  // 学生乙：练习全错得 0 分未通过，停留在第一环节
  const bob={};await api(bob,'/api/auth/login','POST',{username:'learn102',password:'Student123!'});
  await api(bob,`/api/student/classroom/${sessionId}/enter`,'POST');
  const wrong=Object.fromEntries(['ch2-q02','ch2-q04','ch2-q07'].map(id=>[id,'错误答案']));
  await api(bob,`/api/student/classroom/${sessionId}/complete-stage`,'POST',{stageId:'quiz',evidence:{answers:wrong},clientSubmissionId:'bob-quiz-001'});

  const {learning}=await api(jar,`/api/teacher/task-library/${task.id}/learning`);
  assert.equal(learning.summary.totalStudents,2);assert.equal(learning.summary.completed,1);assert.equal(learning.summary.inProgress,1);
  assert.equal(learning.summary.completionRate,50);assert.equal(learning.summary.averageScore,50,'甲乙真实均分 (100+0)/2');
  assert.equal(learning.stages.length,2);
  assert.equal(learning.stages[0].completed,1);assert.equal(learning.stages[0].inProgress,1);assert.equal(learning.stages[0].averageScore,50);
  assert.equal(learning.stages[0].topErrors.length,3,'乙的三道错题题干进入常见错误');
  assert.equal(learning.stages[1].completed,1);assert.equal(learning.stages[1].averageScore,null,'参与型环节不计分');
  assert.equal(learning.publications.length,1);assert.equal(learning.publications[0].className,'任务链学情 QA');assert.equal(learning.publications[0].status,'live');
  const listed=await api(jar,'/api/teacher/task-library');
  const card=listed.tasks.find(item=>item.id===task.id);
  assert.equal(card.learning.completed,1);assert.equal(card.learning.totalStudents,2);assert.equal(card.learning.averageScore,50);
  console.log('PASS task-chain learning API aggregates completion, per-stage stats and graded averages from real records');

  const teacher=await login(teacherContext,process.env.TEACHER_USERNAME??'teacher',process.env.TEACHER_PASSWORD??'ChangeMe123!','teacher');
  const teacherCard=teacher.locator(`[data-task-id="${task.id}"]`);
  await teacherCard.waitFor();
  await teacherCard.getByText('1 / 2 人完成',{exact:true}).waitFor();
  await teacherCard.getByText('计分平均 50 分',{exact:true}).waitFor();
  await teacherCard.getByRole('button',{name:'学情',exact:true}).click();
  const dialog=teacher.getByRole('dialog',{name:'学情联动任务链 学情'});
  await dialog.waitFor();
  await dialog.getByText('1 / 2 人完成 · 50%',{exact:true}).waitFor();
  const stageRows=dialog.locator('.task-learning-stages ol>li');
  assert.equal(await stageRows.count(),2);
  await stageRows.first().getByText(/1 人完成 · 1 人正在做 · 计分平均 50 分/).waitFor();
  await stageRows.nth(1).getByText(/参与完成 · 不计知识成绩/).waitFor();
  await dialog.locator('.task-learning-errors').getByText('8 位补码能表示的有符号整数范围是？').waitFor();
  await dialog.locator('.task-learning-publications').getByText('任务链学情 QA',{exact:true}).waitFor();
  await teacher.screenshot({path:path.join(dir,'task-library-learning-dialog.png'),fullPage:true});
  console.log('PASS library card and learning dialog show per-chain and per-stage learning stats');

  await dialog.getByRole('button',{name:'查看学情统计',exact:true}).click();
  await teacher.getByText('课堂完成度与报告',{exact:true}).waitFor();
  await teacher.locator('.live-session-dashboard').getByText('学情联动任务链',{exact:true}).waitFor();
  await teacher.locator('.classroom-command-center').getByRole('button',{name:'刷新',exact:true}).click();
  await teacher.locator('.session-student-row',{hasText:'学生甲'}).getByText('全部任务已完成').waitFor();
  await teacher.locator('.session-student-row',{hasText:'学生乙'}).getByText(/课前诊断/).waitFor();
  console.log('PASS statistics jump opens the live classroom monitor with the same student records');
  assert.deepEqual(errors,[]);console.log('PASS zero page errors');
}catch(error){console.error(error.stack);process.exitCode=1;}finally{await teacherContext.close();await browser.close();}
