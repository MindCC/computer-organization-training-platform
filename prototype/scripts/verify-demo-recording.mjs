import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {createApp} from '../server/app.js';
import {openDatabase,migrate,createUser,createClass,addStudentToClass} from '../server/db.js';
import {hashPassword} from '../server/auth.js';
import {HOSTED_DEMOS} from '../src/shared/demoNavigation.js';
import {clickTopNavItem} from './nav-helpers.mjs';
const db=openDatabase(':memory:');migrate(db);
const passwordHash=await hashPassword('DemoQa123!');
const teacher=createUser(db,{username:'demoqa-teacher',displayName:'测试教师',role:'teacher',passwordHash});
const student=createUser(db,{username:'demoqa-student',displayName:'测试学生',role:'student',passwordHash});
const other=createUser(db,{username:'demoqa-other',displayName:'其他教师',role:'teacher',passwordHash});
const classroom=createClass(db,teacher.id,'演示记录测试班');addStudentToClass(db,classroom.id,student.id);
const server=createApp({db,logger:()=>{},assistantOptions:{env:{}}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});const errors=[];
async function login(context,username){assert.equal((await context.request.post(base+'/api/auth/login',{data:{username,password:'DemoQa123!'}})).status(),200);}
try {
  const context=await browser.newContext({viewport:{width:1366,height:900}});await login(context,student.username);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const demo of HOSTED_DEMOS) {
    await page.goto(`${base}/demos/${demo.file}?embedded=1`);await page.waitForFunction(()=>window.__platformLink?.linked);
    if(await page.locator('[data-mode="quiz"]').count())await page.locator('[data-mode="quiz"]').click();
    else if(demo.id==='intro')await page.locator('#modeQuiz').click();
    let expected;
    if(demo.id==='adder-alu') {
      const prompt=await page.locator('#quiz-prompt').innerText();
      const answer=Number(prompt.match(/A=(\d+)/)[1])+Number(prompt.match(/B=(\d+)/)[1]);
      const wrong=await page.locator('#quiz-options button').evaluateAll((buttons,answer)=>buttons.find(button=>Number(button.dataset.answer)!==answer).dataset.answer,answer);
      expected={answer:wrong,stem:prompt};await page.locator(`#quiz-options button[data-answer="${wrong}"]`).click();
    } else {
      const q=await page.evaluate(()=>({...quizState.current}));
      const stem=q.prompt || q.question;
      if(Array.isArray(q.choices)) {
        const index=(q.answer+1)%q.choices.length;expected={answer:q.choices[index],stem};await page.locator(`.quiz-choice[data-idx="${index}"]`).click();
      } else if(q.mode==='bits') {
        const bits=q.answer.map(bit=>1-bit);expected={answer:bits.join(''),stem};
        await page.evaluate(bits=>{quizState.answerBits=bits;document.querySelectorAll('.quiz-bit').forEach((el,i)=>{el.querySelector('.bit-val').textContent=bits[i];el.classList.toggle('on',bits[i]===1);});},bits);
      } else {
        const answer=String(Number(q.answer)+1);expected={answer,stem};await page.locator('#quizInput').fill(answer);
      }
      await page.locator('#quizSubmit').click();
    }
    await page.waitForFunction(()=>document.querySelector('#platform-link-badge').textContent.includes('答题与时长已保存'));
    const book=await (await context.request.get(base+'/api/student/mistakes')).json();
    const item=book.items.find(item=>item.navigation.demoId===demo.id);assert(item,`${demo.id}: one wrong answer must enter mistake book immediately`);
    if(expected)assert.equal(item.studentAnswer,expected.answer.replace(/<[^>]+>/g,''));
    assert(item.referenceAnswer && item.explanation);assert.equal(item.chapterId,demo.chapterId);
    console.log(`PASS ${demo.id}: original wrong answer and explanation saved`);
  }
  // Time persists without any answer, including a short visit and repeated final flush.
  await page.goto(base+'/demos/cpu.html?embedded=1');await page.waitForFunction(()=>window.__platformLink?.linked);
  const before=db.prepare('SELECT SUM(elapsed_minutes) AS n FROM demo_attempts WHERE student_id=?').get(student.id).n;
  await page.clock.install();await page.clock.fastForward(30000);await page.evaluate(()=>window.__platformLink.flush());
  await page.waitForFunction(()=>!Object.keys(localStorage).some(key=>key.startsWith('demo-evidence-v2:')));
  const after=db.prepare('SELECT SUM(elapsed_minutes) AS n FROM demo_attempts WHERE student_id=?').get(student.id).n;
  assert(after-before>=0.49 && after-before<0.55,`No-quiz timing: ${after-before}`);
  await page.goto(base+'/');await page.waitForSelector('.topbar-nav');await clickTopNavItem(page,'学习记录');
  await page.waitForSelector('[data-testid="chart-recent-activity"]');await page.waitForFunction(()=>document.querySelector('.records-kpi-strip').textContent.includes('演示'));
  const kpi=page.locator('.records-kpi').filter({hasText:'累计学习'});assert((await kpi.innerText()).includes('演示'));
  assert((await page.locator('[data-testid="chart-recent-activity"]').innerText()).includes('互动演示'));
  const chart=page.locator('[data-testid="chart-study-time"]');assert((await chart.locator('svg title').allTextContents()).some(text=>!text.endsWith('· 0 分钟')));
  await clickTopNavItem(page,'错题本');await page.getByRole('button',{name:/^互动演示 ·/}).click();assert.equal(await page.locator('article[data-source="demo"]').count(),10);
  await fs.mkdir('qa-artifacts',{recursive:true});await page.screenshot({path:'qa-artifacts/demo-mistakes-recorded.png',fullPage:true});
  await page.locator('article[data-source="demo"] .mistake-retry').first().click();await page.waitForSelector('.hosted-demo-frame');
  const teacherContext=await browser.newContext();await login(teacherContext,teacher.username);
  const detail=await (await teacherContext.request.get(`${base}/api/teacher/classes/${classroom.id}/learning-review/${student.id}`)).json();
  assert.equal(detail.mistakes.overview.sourceCounts.demo,10);assert(detail.demos.some(demo=>demo.elapsedMinutes>0));assert(detail.activity.demos[0].minutes>0);
  const teacherPage=await teacherContext.newPage();teacherPage.on('pageerror',e=>errors.push(e.message));await teacherPage.goto(base+'/');await clickTopNavItem(teacherPage,'学习记录');
  await teacherPage.getByLabel('学情查看对象').selectOption(String(student.id));await teacherPage.waitForSelector('.records-screen');
  assert((await teacherPage.locator('.records-kpi').filter({hasText:'累计学习'}).innerText()).includes('演示'));
  await teacherPage.getByRole('button',{name:'错题本',exact:true}).last().click();await teacherPage.waitForSelector('article[data-source="demo"]');assert.equal(await teacherPage.locator('article[data-source="demo"]').count(),10);
  const otherContext=await browser.newContext();await login(otherContext,other.username);assert.equal((await otherContext.request.get(`${base}/api/teacher/classes/${classroom.id}/learning-review/${student.id}`)).status(),404);await otherContext.close();
  await teacherPage.goto(base+'/demos/cpu.html?embedded=1');await teacherPage.waitForFunction(()=>window.__platformLink?.linked);await teacherPage.locator('[data-mode="quiz"]').click();await teacherPage.locator('.quiz-choice').first().click();await teacherPage.locator('#quizSubmit').click();await teacherPage.waitForFunction(()=>document.querySelector('#platform-link-badge').textContent.includes('答题与时长已保存'));
  assert(db.prepare('SELECT COUNT(*) AS n FROM demo_attempts WHERE student_id=?').get(teacher.id).n>0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM challenge_attempts').get().n,0);
  assert.deepEqual(errors,[]);console.log('PASS time-only learning, student records/mistakes, teacher review and account isolation');
} finally {await browser.close();await new Promise(r=>{server.close(r);server.closeAllConnections();});db.close();}
