import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { fillLoginForm } from './lib/qaLogin.mjs';
import { questionsForChapter } from '../src/assignmentQuestions.js';
import { clickTopNavItem } from './nav-helpers.mjs';

const url=process.env.PROTOTYPE_APP_URL,apiUrl=process.env.PROTOTYPE_API_URL;
const dir=process.env.QA_ARTIFACT_DIR??path.resolve('qa-artifacts');mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
const teacherContext=await browser.newContext({viewport:{width:1366,height:768}}),studentContext=await browser.newContext({viewport:{width:1366,height:768}});
async function api(jar,route,method='GET',body,expected=200){const res=await fetch(apiUrl+route,{method,headers:{'content-type':'application/json',...(jar.cookie?{cookie:jar.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});if(res.headers.get('set-cookie'))jar.cookie=res.headers.get('set-cookie').split(';')[0];const data=await res.json();if(expected>=400)assert.equal(res.status,expected,JSON.stringify(data));else assert.ok(res.ok,`${route}: ${JSON.stringify(data)}`);return data;}
async function login(context,username,password,role){const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await fillLoginForm(p,{username,password});await p.locator(`[data-login-role="${role}"]`).click();await p.locator('.login-submit').click();await p.locator('.topbar').waitFor();return p;}
async function posted(p,route,click){const wait=p.waitForResponse(r=>r.url().endsWith(route)&&r.request().method()==='POST');await click();const res=await wait;const data=await res.json();assert.ok(res.ok(),JSON.stringify(data));return data;}
async function library(p){await clickTopNavItem(p,'教师看板');await p.getByRole('button',{name:'任务库',exact:true}).click();await p.getByRole('heading',{name:'我的教学任务'}).waitFor();}
async function noOverflow(p){assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
try{
 const jar={};await api(jar,'/api/auth/login','POST',{username:process.env.TEACHER_USERNAME,password:process.env.TEACHER_PASSWORD});
 const {class:cls}=await api(jar,'/api/classes','POST',{name:'全课程协同 QA（合成测试班）'});
 await api(jar,`/api/teacher/classes/${cls.id}/import-students`,'POST',{csv:'loop101,测试学生甲,Student123!\nloop102,测试学生乙,Student123!'});
 const alice={},bob={};const aliceAuth=await api(alice,'/api/auth/login','POST',{username:'loop101',password:'Student123!'});const bobAuth=await api(bob,'/api/auth/login','POST',{username:'loop102',password:'Student123!'});
 const aliceId=aliceAuth.user.id,bobId=bobAuth.user.id;
 const teacher=await login(teacherContext,process.env.TEACHER_USERNAME,process.env.TEACHER_PASSWORD,'teacher');
 const student=await login(studentContext,'loop101','Student123!','student');
 for(const chapterId of ['ch4','ch6']){
  const goal=chapterId==='ch4'?'concept-cache-mapping':'concept-cpu-registers';
  await library(teacher);await teacher.getByRole('button',{name:'模板库',exact:true}).click();
  await teacher.getByLabel('模板应用章节').selectOption(chapterId);await teacher.getByRole('button',{name:/^诊断与实验课堂/}).click();
  await teacher.getByLabel('任务链名称').fill(`${chapterId} 统一教学链 QA`);
  const goals=teacher.getByRole('region',{name:'任务知识目标'});await goals.getByText(/Cache|CPU/).first().waitFor();
  assert.equal(await teacher.getByLabel('节点作用').inputValue(),'diagnosis');
  const created=await posted(teacher,'/api/teacher/task-library',()=>teacher.getByRole('button',{name:'保存任务',exact:true}).click());
  await teacher.locator(`[data-task-id="${created.task.id}"]`).getByRole('button',{name:'发布',exact:true}).click();
  const published=await posted(teacher,`/api/teacher/task-library/${created.task.id}/publish`,()=>teacher.getByRole('button',{name:'确认发布',exact:true}).click());
  const source=published.session,first=created.task.config.taskChain.stages[0];
  await api(alice,`/api/student/classroom/${source.id}/enter`,'POST');
  await api(alice,`/api/student/classroom/${source.id}/complete-stage`,'POST',{stageId:first.id,clientSubmissionId:`diagnostic-${chapterId}`,evidence:{answers:Object.fromEntries(first.questionIds.map(id=>[id,'错误答案']))}});
  await library(teacher);await teacher.locator(`[data-task-id="${created.task.id}"]`).getByRole('button',{name:'学情',exact:true}).click();
  let dialog=teacher.getByRole('dialog',{name:`${created.task.title} 学情`});await dialog.getByRole('button',{name:'查看本次课堂',exact:true}).click();
  await dialog.getByRole('region',{name:'知识诊断与教学调整'}).waitFor();
  const report=await api(jar,`/api/teacher/task-library/${created.task.id}/learning?sessionId=${source.id}`);
  const kp=report.learning.knowledge.points.find(p=>p.knowledgePointId===goal);assert.equal(kp.students.find(s=>s.studentId===aliceId).rate,0);assert.equal(kp.students.find(s=>s.studentId===bobId).status,'unverified');
  await dialog.getByRole('button',{name:'结束本次课堂，准备后续任务',exact:true}).click();await dialog.locator('.task-learning-scope').getByText(/已结束/).waitFor();
  const suggestion=dialog.locator('.teaching-recommendation').filter({hasText:kp.title}).filter({hasText:'补学 · 1 人'});await suggestion.getByRole('button',{name:'编排后续任务',exact:true}).click();
  await teacher.getByRole('region',{name:'后续任务发布对象'}).waitFor();
  await teacher.getByLabel('任务链名称').fill(`${chapterId} 教师修改的个性化任务`);
  const roster=teacher.locator('.teaching-recipients');assert.equal(await roster.getByLabel('测试学生甲').isChecked(),true);await roster.getByLabel('测试学生乙').check();await roster.getByLabel('测试学生乙').uncheck();
  await teacher.getByRole('button',{name:'用知识目标准备 AI 编排要求',exact:true}).click();
  const gen=await posted(teacher,`/api/teacher/classes/${cls.id}/task-chain/generate`,()=>teacher.getByRole('button',{name:'生成任务链草稿',exact:true}).click());
  assert.equal(gen.source,'local','isolated QA has no model key');assert.ok(gen.taskChain.stages.some(s=>s.purpose==='retest'));
  await teacher.getByRole('button',{name:'采用草稿并继续编排',exact:true}).click();
  // 模板只建议内容；教师再次确认标题，名单和来源应保留。
  await teacher.getByLabel('任务链名称').fill(`${chapterId} 教师修改的个性化任务`);
  assert.equal(await roster.getByLabel('测试学生甲').isChecked(),true);
  await teacher.screenshot({path:path.join(dir,`teaching-loop-${chapterId}-editor.png`),fullPage:true});
  const follow=await posted(teacher,'/api/teacher/task-library',()=>teacher.getByRole('button',{name:'保存任务',exact:true}).click());
  assert.deepEqual(follow.task.config.taskChain.followUp.studentIds,[aliceId]);
  await teacher.reload();await library(teacher);await teacher.locator(`[data-task-id="${follow.task.id}"]`).getByRole('button',{name:'发布',exact:true}).click();
  const pubDialog=teacher.getByRole('dialog',{name:'发布任务到班级'});assert.equal(await pubDialog.getByLabel('测试学生甲').isChecked(),true);assert.equal(await pubDialog.getByLabel('测试学生乙').isChecked(),false);
  const assigned=await posted(teacher,`/api/teacher/task-library/${follow.task.id}/publish`,()=>pubDialog.getByRole('button',{name:'确认发布',exact:true}).click());const session=assigned.session;
  assert.notEqual((await api(bob,'/api/student/classroom/current')).session?.id,session.id);
  await api(bob,`/api/student/classroom/${session.id}/enter`,'POST',{},403);
  await student.reload();await student.getByText(/老师为你安排的个性化后续任务/).waitFor();
  await student.getByRole('button',{name:'接受任务并开始',exact:true}).click();
  await student.getByRole('button',{name:'确认完成并继续',exact:true}).click();await student.getByRole('button',{name:'继续下一环节',exact:true}).click();
  const stages=follow.task.config.taskChain.stages;
  for(const stage of stages.filter(s=>s.type==='practice')){
    for(const id of stage.questionIds){const q=questionsForChapter(chapterId).find(q=>q.id===id);const card=student.locator(`[data-qid="${id}"]`);if(q.type==='choice')await card.locator('label').filter({hasText:q.answer}).first().click();else if(q.type==='truefalse')await card.locator('label').filter({hasText:q.answer==='true'?'正确':'错误'}).first().click();else await card.locator('input[type="text"],input:not([type])').fill(q.answer??q.keywords.flat().join(' '));}
    await student.getByRole('button',{name:'提交本环节并判分',exact:true}).click();await student.getByRole('button',{name:'继续下一环节',exact:true}).click();
  }
  await student.getByLabel('我的学习说明').fill('我重新观察了演示，通过变式题验证步骤，并解释了这个知识点的应用。');await student.getByRole('button',{name:'提交学习说明并继续',exact:true}).click();
  await student.getByText('本节任务链已全部完成。',{exact:true}).waitFor();
  await library(teacher);await teacher.locator(`[data-task-id="${created.task.id}"]`).getByRole('button',{name:'学情',exact:true}).click();dialog=teacher.getByRole('dialog',{name:`${created.task.title} 学情`});await dialog.getByRole('button',{name:'查看本次课堂',exact:true}).click();
  await dialog.getByRole('button',{name:'查看后续学情与复测',exact:true}).click();await dialog.getByRole('region',{name:'复测前后对比'}).getByText('+100个百分点',{exact:true}).waitFor();
  const result=await api(jar,`/api/teacher/task-library/${follow.task.id}/learning?sessionId=${session.id}`);const compared=result.learning.knowledge.comparison.points.find(p=>p.knowledgePointId===goal).students[0];assert.equal(compared.before,0);assert.equal(compared.after,100);assert.equal(compared.repeatedQuestionIds.length,0);
  await teacher.screenshot({path:path.join(dir,`teaching-loop-${chapterId}-comparison.png`),fullPage:true});await noOverflow(teacher);await teacher.setViewportSize({width:390,height:844});await noOverflow(teacher);await teacher.screenshot({path:path.join(dir,`teaching-loop-${chapterId}-mobile.png`),fullPage:true});await teacher.setViewportSize({width:1366,height:768});
  await dialog.getByRole('button',{name:'结束本次课堂，准备后续任务',exact:true}).click();await dialog.getByRole('button',{name:'关闭',exact:true}).click();
  console.log(`PASS ${chapterId}: generic template, evidence diagnosis, teacher edits, AI local fallback, target isolation, student learning and matched variant retest 0→100`);
 }
 assert.deepEqual(errors,[]);console.log('PASS desktop/mobile no page overflow or runtime errors; test data are synthetic, not classroom effectiveness evidence');
}catch(error){console.error(error.stack);process.exitCode=1;}finally{await teacherContext.close();await studentContext.close();await browser.close();}
