import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {fillLoginForm} from './lib/qaLogin.mjs';

const url=process.env.PROTOTYPE_APP_URL??'http://127.0.0.1:8791';
const dir=process.env.QA_ARTIFACT_DIR??path.resolve('qa-artifacts');mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1366,height:768}}),errors=[];
try {
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});await fillLoginForm(page,{username:process.env.TEACHER_USERNAME??'teacher',password:process.env.TEACHER_PASSWORD??'ChangeMe123!'});await page.locator('[data-login-role="teacher"]').click();await page.locator('.login-submit').click();await page.locator('.topbar').waitFor();
  const classResponse=await context.request.post(url+'/api/classes',{data:{name:'AI任务链验证班'}});assert.equal(classResponse.status(),201);const cls=(await classResponse.json()).class;
  await page.reload();await page.getByRole('button',{name:'创建任务',exact:true}).click();await page.getByLabel('任务链名称').fill('人工草稿（生成前保留）');await page.getByRole('tab',{name:'AI 创建',exact:true}).click();
  const prompt='设计一节45分钟的补码运算课，包含课前诊断、观察补码减法与溢出的互动演示、机器数编码实验、AI答疑、补码运算检验和学习反思。目标具体，学生按顺序完成。';await page.getByLabel('AI教学要求').fill(prompt);
  const waiting=page.waitForResponse(response=>response.url().endsWith(`/api/teacher/classes/${cls.id}/task-chain/generate`),{timeout:70000});await page.getByRole('button',{name:'生成任务链草稿',exact:true}).click();
  const response=await waiting;assert.equal(response.status(),200);assert.deepEqual(response.request().postDataJSON(),{prompt,consent:'deepseek-task-chain'});const generated=await response.json();assert.equal(generated.source,'deepseek',`live AI source: ${generated.reason}`);
  const {taskChain}=generated;assert.ok(taskChain.stages.length>=1&&taskChain.stages.length<=16);await page.getByText('DeepSeek 生成草稿',{exact:true}).waitFor();assert.equal(await page.locator('.chain-generated-draft li').count(),taskChain.stages.length);
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(dir,'task-chain-ai-generated.png'),fullPage:true});
  await page.getByRole('tab',{name:'手动编排',exact:true}).click();assert.equal(await page.getByLabel('任务链名称').inputValue(),'人工草稿（生成前保留）');await page.getByRole('tab',{name:'AI 创建',exact:true}).click();await page.getByRole('button',{name:'采用草稿并继续编排',exact:true}).click();
  assert.equal(await page.getByLabel('任务链名称').inputValue(),taskChain.title);assert.equal(await page.locator('.chain-stage-list li').count(),taskChain.stages.length);await page.getByLabel('学习目标与操作要求').fill('课堂演示时请说明输入、运算过程和判断证据。');
  const creating=page.waitForResponse(response=>response.url().endsWith('/api/teacher/task-library')&&response.request().method()==='POST');await page.getByRole('button',{name:'保存任务',exact:true}).click();const saved=await creating;assert.equal(saved.status(),201);const config=(await saved.json()).task.config;assert.equal(config.taskChain.stages.length,taskChain.stages.length);assert.equal(config.taskChain.stages[0].instructions,'课堂演示时请说明输入、运算过程和判断证据。');
  assert.deepEqual(errors,[]);console.log('PASS live DeepSeek generation, unchanged manual draft before adoption, editable adoption and persisted classroom draft');
}catch(error){console.error(error.stack);process.exitCode=1;}finally{await context.close();await browser.close();}
