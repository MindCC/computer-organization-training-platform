import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { fillLoginForm } from './lib/qaLogin.mjs';

const url=process.env.PROTOTYPE_APP_URL??'http://127.0.0.1:5173';
const apiUrl=process.env.PROTOTYPE_API_URL??url;
const dir=process.env.QA_ARTIFACT_DIR??path.resolve('qa-artifacts');mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
const teacherContext=await browser.newContext({viewport:{width:1366,height:768}}),studentContext=await browser.newContext({viewport:{width:1366,height:768}});
await studentContext.addInitScript(()=>Object.defineProperty(globalThis.crypto,'randomUUID',{value:undefined,configurable:true}));
async function api(jar,route,method='GET',body) {
  const response=await fetch(apiUrl+route,{method,headers:{'content-type':'application/json',...(jar.cookie?{cookie:jar.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(response.headers.get('set-cookie'))jar.cookie=response.headers.get('set-cookie').split(';')[0];
  const data=await response.json();assert.ok(response.ok,`${route}: ${JSON.stringify(data)}`);return data;
}
async function login(context,username,password,role='student') {
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});await fillLoginForm(page,{username,password});await page.locator(`[data-login-role="${role}"]`).click();await page.locator('.login-submit').click();
  await page.locator('.platform-topbar,.topbar').first().waitFor();return page;
}
async function posted(page,route,click) {
  const waiting=page.waitForResponse(response=>response.url().endsWith(route)&&response.request().method()!=='GET');
  await click();const response=await waiting;const data=await response.json();assert.ok(response.ok(),`${route}: ${JSON.stringify(data)}`);return data;
}
async function answer(page,id,value){await page.locator(`[data-qid="${id}"]`).locator('label').filter({hasText:value}).first().click();}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false,'no horizontal overflow');}
try {
  const jar={};await api(jar,'/api/auth/login','POST',{username:process.env.TEACHER_USERNAME??'teacher',password:process.env.TEACHER_PASSWORD??'ChangeMe123!'});
  const {class:cls}=await api(jar,'/api/classes','POST',{name:'补码任务链 QA'});
  await api(jar,`/api/teacher/classes/${cls.id}/import-students`,'POST',{csv:'chain101,任务链学生,Student123!'});
  const teacher=await login(teacherContext,process.env.TEACHER_USERNAME??'teacher',process.env.TEACHER_PASSWORD??'ChangeMe123!','teacher');
  await teacher.getByRole('button',{name:'创建任务',exact:true}).click();
  await teacher.getByRole('tab',{name:'AI 创建',exact:true}).click();await teacher.getByLabel('AI教学要求').fill('45分钟补码运算课，包含诊断、演示、实验、答疑和检验。');const generated=await posted(teacher,`/api/teacher/classes/${cls.id}/task-chain/generate`,()=>teacher.getByRole('button',{name:'生成任务链草稿',exact:true}).click());assert.equal(generated.source,'local');assert.equal(generated.reason,'AI_DISABLED');await teacher.getByText('尚未配置 DeepSeek，已提供本地课程模板建议。',{exact:true}).waitFor();await teacher.getByRole('button',{name:'采用草稿并继续编排',exact:true}).click();
  await teacher.getByLabel('任务链名称').fill('补码运算任务链 QA');
  const unsavedSessions=await api(jar,`/api/teacher/classes/${cls.id}/sessions/current`);
  assert.equal(unsavedSessions.session,null);
  await teacher.getByRole('button',{name:'预览课堂任务',exact:true}).click();
  await teacher.getByRole('dialog',{name:'教师任务预览'}).waitFor();
  assert.equal(await teacher.locator('.chain-presenter-nav button').count(),6);
  await teacher.locator('.chain-presenter [data-qid="ch2-q02"]').waitFor();
  await teacher.getByRole('button',{name:'关闭演示',exact:true}).click();
  await teacher.locator('.chain-stage-list button').nth(1).click();
  await teacher.getByRole('button',{name:'演示本环节',exact:true}).click();
  await teacher.frameLocator('.chain-presenter iframe').locator('[data-mode="sub"]').click();
  await teacher.screenshot({path:path.join(dir,'task-chain-teacher-preview.png')});
  await teacher.getByRole('button',{name:'关闭演示',exact:true}).click();
  assert.equal((await api(jar,`/api/teacher/classes/${cls.id}/sessions/current`)).session,null,'preview must not create or publish a classroom');
  console.log('PASS teacher previews all tasks and current edited step before saving, with no classroom publication');
  assert.equal(await teacher.locator('.chain-stage-list li').count(),6);
  await teacher.locator('.chain-outline summary').click();
  await teacher.locator('.chain-stage-list button').last().click();await teacher.getByRole('button',{name:'上移环节',exact:true}).click();await teacher.getByRole('button',{name:'下移环节',exact:true}).click();
  await teacher.locator('.chain-add-palette').getByRole('button',{name:'课程课件',exact:true}).click();assert.equal(await teacher.locator('.chain-stage-list li').count(),7);await teacher.getByRole('button',{name:'删除环节',exact:true}).click();
  await teacher.evaluate(()=>window.scrollTo(0,0));await teacher.screenshot({path:path.join(dir,'task-chain-builder-desktop.png'),fullPage:true});await noOverflow(teacher);
  await teacher.setViewportSize({width:390,height:844});await noOverflow(teacher);await teacher.screenshot({path:path.join(dir,'task-chain-builder-mobile.png'),fullPage:true});await teacher.setViewportSize({width:1366,height:768});
  const created=await posted(teacher,'/api/teacher/task-library',()=>teacher.getByRole('button',{name:'保存任务',exact:true}).click());const taskId=created.task.id;
  await teacher.reload();await teacher.locator(`[data-task-id="${taskId}"]`).getByRole('button',{name:'修改',exact:true}).click();await teacher.getByLabel('任务链名称').fill('补码运算任务链 QA（已核对）');
  await posted(teacher,`/api/teacher/task-library/${taskId}`,()=>teacher.getByRole('button',{name:'保存任务',exact:true}).click());
  await teacher.locator(`[data-task-id="${taskId}"]`).getByRole('button',{name:'发布',exact:true}).click();
  const published=await posted(teacher,`/api/teacher/task-library/${taskId}/publish`,()=>teacher.getByRole('button',{name:'确认发布',exact:true}).click());const sessionId=published.session.id;
  await teacher.getByRole('button',{name:'课堂演示',exact:true}).click();await answer(teacher,'ch2-q02','-128 ~ 127');await teacher.getByRole('button',{name:'检查演示答案',exact:true}).click();assert.equal(await teacher.locator('.chain-presenter .q-result').count(),3);await teacher.locator('.chain-presenter .kp-chip').first().click();await teacher.locator('.chain-presenter-nav button').nth(1).click();await teacher.frameLocator('.chain-presenter iframe').locator('[data-mode="sub"]').click();await teacher.getByRole('button',{name:'大屏演示',exact:true}).click();await teacher.screenshot({path:path.join(dir,'task-chain-teacher-demo.png'),fullPage:true});await teacher.getByRole('button',{name:'退出大屏',exact:true}).click();await teacher.getByRole('button',{name:'关闭演示',exact:true}).click();
  console.log('PASS teacher edits, reorders, persists, restores and starts task chain');
  const student=await login(studentContext,'chain101','Student123!');
  await student.getByRole('region',{name:'当前课堂任务链'}).waitFor();
  assert.equal(await student.locator('.student-chain-route li').count(),6,'student sees the full task route before accepting');
  await student.locator('.student-chain-route li').first().getByText('课前诊断：我会表示负数吗？',{exact:true}).waitFor();
  await teacher.locator('.classroom-command-center').getByRole('button',{name:'刷新',exact:true}).click();
  await teacher.locator('.session-student-row',{hasText:'任务链学生'}).click();
  await teacher.getByRole('region',{name:'学生任务反馈'}).getByText(/尚未接受任务/).waitFor();
  await teacher.getByRole('button',{name:'收起',exact:true}).click();
  await student.getByRole('button',{name:'接受任务并开始',exact:true}).click();
  await student.locator('[data-qid="ch2-q02"]').waitFor();await answer(student,'ch2-q02','-128 ~ 127');await answer(student,'ch2-q04','-1');await answer(student,'ch2-q07','11111011');
  let step=await posted(student,`/api/student/classroom/${sessionId}/complete-stage`,()=>student.getByRole('button',{name:'提交本环节并判分'}).click());assert.equal(step.studentState.current_stage_index,1);
  await teacher.locator('.classroom-command-center').getByRole('button',{name:'刷新',exact:true}).click();
  await teacher.locator('.session-student-row',{hasText:'任务链学生'}).getByText('已完成 1 / 6 环节',{exact:true}).waitFor();
  await teacher.locator('.session-student-row',{hasText:'任务链学生'}).click();
  await teacher.getByRole('region',{name:'学生任务反馈'}).getByText('课前诊断：我会表示负数吗？ · 100分',{exact:true}).waitFor();
  await teacher.getByRole('button',{name:'收起',exact:true}).click();
  console.log('PASS student directly sees published tasks; teacher sees acceptance, real 1/6 progress and actual score');
  await student.getByRole('button',{name:'继续下一环节'}).click();await student.frameLocator('.chain-demo-frame').locator('[data-mode="sub"]').click();
  await student.screenshot({path:path.join(dir,'task-chain-demo.png'),fullPage:true});
  await posted(teacher,`/api/teacher/sessions/${sessionId}/pause`,()=>teacher.getByRole('button',{name:'暂停',exact:true}).click());
  await student.getByText('教师已暂停课堂，请等待恢复。当前输入已保留。').waitFor({timeout:20000});assert.equal(await student.getByRole('button',{name:'确认完成并继续'}).isDisabled(),true);
  await posted(teacher,`/api/teacher/sessions/${sessionId}/resume`,()=>teacher.getByRole('button',{name:'恢复',exact:true}).click());await student.getByRole('button',{name:'确认完成并继续'}).waitFor();
  await posted(student,`/api/student/classroom/${sessionId}/complete-stage`,()=>student.getByRole('button',{name:'确认完成并继续'}).click());await student.getByRole('button',{name:'继续下一环节'}).click();
  await student.locator('.circuit-flow-workbench').waitFor({timeout:15000}).catch(async cause=>{console.error('LAB DEBUG',errors,await student.locator('body').innerText());await student.screenshot({path:path.join(dir,'task-chain-lab-failure.png'),fullPage:true});throw cause;});await student.getByRole('button',{name:'填入参考结构',exact:true}).click();
  const lab=await posted(student,'/api/student/attempts',()=>student.getByRole('button',{name:'提交检测',exact:true}).click());assert.equal(lab.classroomSession.current_stage_index,3);
  await student.locator('.quest-settlement').getByRole('button',{name:/下一/}).click();await student.getByLabel('我的学习说明').fill('我观察到符号位参与加法，进位不能直接作为有符号溢出的证据。');
  await student.reload();await student.getByLabel('我的学习说明').waitFor();assert.match(await student.getByLabel('我的学习说明').inputValue(),/符号位/);
  await student.getByRole('button',{name:'向小芯 AI 助教提问',exact:true}).click();await student.getByLabel('你的课程问题').fill('补码加法的进位和溢出有什么区别？');
  const ai=await posted(student,'/api/student/study-assistant',()=>student.getByRole('button',{name:'发送到 DeepSeek'}).click());assert.equal(ai.source,'local');await student.getByRole('button',{name:'关闭小芯助教'}).click();
  await posted(student,`/api/student/classroom/${sessionId}/complete-stage`,()=>student.getByRole('button',{name:'提交学习说明并继续'}).click());await student.getByRole('button',{name:'继续下一环节'}).click();
  await answer(student,'ch2-q08','00000011');await answer(student,'ch2-q09','正确答案就是 −56');await answer(student,'ch2-q10','正确');
  step=await posted(student,`/api/student/classroom/${sessionId}/complete-stage`,()=>student.getByRole('button',{name:'提交本环节并判分'}).click());assert.equal(step.studentState.current_stage_index,4);assert.equal(step.result.score,0);
  await answer(student,'ch2-q08','11111101');await answer(student,'ch2-q09','发生有符号溢出，真实和为 200');await answer(student,'ch2-q10','错误');
  await student.setViewportSize({width:390,height:844});await noOverflow(student);await student.screenshot({path:path.join(dir,'task-chain-student-mobile.png'),fullPage:true});await student.setViewportSize({width:1366,height:768});
  await posted(student,`/api/student/classroom/${sessionId}/complete-stage`,()=>student.getByRole('button',{name:'提交本环节并判分'}).click());await student.getByRole('button',{name:'继续下一环节'}).click();
  await student.getByLabel('我的学习说明').fill('5减3可以加上负3的补码，结果为2；100加100超出8位补码范围，发生同号相加结果异号的溢出。');
  step=await posted(student,`/api/student/classroom/${sessionId}/complete-stage`,()=>student.getByRole('button',{name:'提交学习说明并继续'}).click());assert.equal(step.studentState.status,'completed');assert.equal(step.studentState.result.gradedStageCount,2);
  await student.locator('.chain-review').waitFor();await student.screenshot({path:path.join(dir,'task-chain-student-review.png'),fullPage:true});
  await teacher.locator('.classroom-command-center').getByRole('button',{name:'刷新',exact:true}).click();await teacher.locator('.session-student-row',{hasText:'任务链学生'}).click();await teacher.getByText(/5减3可以加上负3/).waitFor();await teacher.screenshot({path:path.join(dir,'task-chain-teacher-progress.png'),fullPage:true});
  await teacher.getByRole('button',{name:'结束课堂',exact:true}).click();const ended=await posted(teacher,`/api/teacher/sessions/${sessionId}/end`,()=>teacher.getByRole('button',{name:'确认结束',exact:true}).click());assert.equal(ended.report.studentReports[0].completedStages,6);
  console.log('PASS student follows actual demo, lab, AI help, graded practice retry and reflection; teacher sees evidence');
  assert.deepEqual(errors,[]);console.log('PASS responsive layouts, reload recovery and zero page errors');
}catch(error){console.error(error.stack);process.exitCode=1;}finally{await teacherContext.close();await studentContext.close();await browser.close();}
