import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {chromium,expect} from "@playwright/test";
import {gotoApp,fillLoginForm,submitLoginForm} from "./lib/qaLogin.mjs";
import {questionsForChapter} from "../src/assignmentQuestions.js";
import {HOSTED_DEMOS} from "../src/shared/demoNavigation.js";

const app = process.env.PROTOTYPE_APP_URL ?? "http://127.0.0.1:5173";
const artifacts = process.env.QA_ARTIFACT_DIR ?? "qa-artifacts";
await mkdir(artifacts,{recursive:true});
let browser;
try { browser = await chromium.launch({channel:"msedge",headless:true}); } catch { browser = await chromium.launch({headless:true}); }
const checks = [], errors = [];
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
async function json(request,path,data) {
  const response = data === undefined ? await request.get(app+path) : await request.post(app+path,{data});
  assert.ok(response.ok(),`${path}: ${response.status()} ${await response.text()}`);
  return response.json();
}
const context = await browser.newContext({viewport:{width:1366,height:768}});
context.on("page",page => page.on("pageerror",error => errors.push(error.message)));
const page = await context.newPage();
const nav = label => page.locator(".topbar-nav").getByRole("button",{name:label,exact:true});
try {
  await gotoApp(page,app);
  await fillLoginForm(page,{username:"demo2026001",password:"Student123!"});
  await submitLoginForm(page);
  await expect(page.locator(".project-chapter-board")).toBeVisible();
  const user = (await json(context.request,"/api/auth/me")).user;
  const q = questionsForChapter("ch1").find(question => question.type === "choice");
  const wrong = q.options.find(option => option !== q.answer);
  await nav("课后作业").click();
  await expect(page.locator(".practice-submit")).toBeEnabled();
  await page.locator(`[data-qid="${q.id}"]`).getByRole("radio",{name:wrong,exact:true}).check();
  const submitted = page.waitForResponse(response => response.url().endsWith("/api/student/chapter-practice") && response.request().method() === "POST");
  await page.locator(".practice-submit").click(); assert.equal((await submitted).status(),201);
  await expect(page.locator(`[data-qid="${q.id}"]`)).toHaveClass(/is-wrong/);
  await page.getByRole("button",{name:"打开错题本",exact:true}).click();
  const practiceItem = () => page.locator(`.mistake-group[data-source="practice"][data-question-id="${q.id}"]`);
  await expect(practiceItem()).toContainText(q.stem);
  await expect(practiceItem()).toContainText("待巩固");
  pass("题库真实判分自动进入统一错题本");
  await practiceItem().getByRole("button",{name:"重练这道题"}).click();
  await expect(page.locator(".practice-question")).toHaveCount(1);
  await expect(page.locator(".practice-submit")).toHaveText("提交此题订正");
  await page.locator(`[data-qid="${q.id}"]`).getByRole("radio",{name:q.answer,exact:true}).check();
  await page.locator(".practice-submit").click();
  await expect(page.locator(`[data-qid="${q.id}"]`)).toHaveClass(/is-correct/);
  await page.getByRole("button",{name:"返回错题本",exact:true}).click();
  await expect(practiceItem()).toContainText("已订正");
  await page.getByRole("button",{name:"只看待巩固",exact:true}).click();
  await expect(practiceItem()).toHaveCount(0);
  await page.getByRole("button",{name:"只看待巩固",exact:true}).click();
  pass("指定错题单独重练、订正状态和筛选正常");

  // Create a real class assignment in the runner's isolated database.
  const teacherContext = await browser.newContext({viewport:{width:1366,height:768}});
  await json(teacherContext.request,"/api/auth/login",{username:process.env.TEACHER_USERNAME??"teacher",password:process.env.TEACHER_PASSWORD??"ChangeMe123!"});
  let classId;
  for (const group of (await json(teacherContext.request,"/api/teacher/classes")).classes) {
    const overview = await json(teacherContext.request,`/api/teacher/classes/${group.id}/overview`);
    if (overview.students.some(student => student.id === user.id)) { classId = group.id; break; }
  }
  assert.ok(classId,"测试学生应属于教师班级");
  const assignmentId = (await json(teacherContext.request,`/api/teacher/classes/${classId}/assignments`,{title:"联动验收课后作业"})).assignment.id;
  const choice = (await json(teacherContext.request,`/api/teacher/assignments/${assignmentId}/questions`,{type:"choice",stem:"CPU 的中文名称是什么？",options:["中央处理器","硬盘"],answer:"中央处理器",score:10,explanation:"CPU 负责解释和执行指令。"})).question.id;
  const short = (await json(teacherContext.request,`/api/teacher/assignments/${assignmentId}/questions`,{type:"short_answer",stem:"说明指令执行过程",answer:"取指、译码、执行",score:10})).question.id;
  await json(teacherContext.request,`/api/teacher/assignments/${assignmentId}/publish`,{});
  await nav("课后作业").click();
  await page.getByRole("tab",{name:"教师作业",exact:true}).click();
  await page.locator(".assignment-card").filter({hasText:"联动验收课后作业"}).click();
  await page.locator(`[data-qid="${choice}"]`).getByRole("radio",{name:"选择题选项：硬盘"}).check();
  await page.locator(`[data-qid="${short}"]`).getByPlaceholder("输入你的答案").fill("只取指");
  await page.reload();await page.getByRole('tab',{name:'教师作业',exact:true}).click();await page.locator('.assignment-card').filter({hasText:'联动验收课后作业'}).click();
  await expect(page.locator(`[data-qid="${short}"]`).getByPlaceholder('输入你的答案')).toHaveValue('只取指');
  await expect(page.locator(`[data-qid="${choice}"]`).getByRole('radio',{name:'选择题选项：硬盘'})).toBeChecked();
  await page.route('**/api/student/assignments/*/draft',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'保存故障注入'})}));
  await page.getByRole('button',{name:'保存草稿',exact:true}).click();await expect(page.locator('.assignment-view')).toContainText('保存草稿失败');await expect(page.locator(`[data-qid="${short}"] input`)).toHaveValue('只取指');
  await page.unroute('**/api/student/assignments/*/draft');await page.getByRole('button',{name:'保存草稿',exact:true}).click();await expect(page.locator('.assignment-view')).toContainText('草稿已保存到服务器');
  assert.equal((await json(context.request,`/api/student/assignments/${assignmentId}`)).submission.answers.find(answer=>answer.questionId===short).value,'只取指');
  pass('教师作业刷新恢复本机输入，保存失败保留答案，重试同步真实草稿');
  await page.getByRole("button",{name:"提交作业",exact:true}).click();
  await expect(page.locator(".assignment-cards")).toBeVisible();
  const submission = (await json(context.request,"/api/student/submissions")).submissions.find(row => row.assignment_id === assignmentId);
  await json(teacherContext.request,`/api/teacher/submissions/${submission.id}/grade`,{questionScores:[{questionId:choice,score:0},{questionId:short,score:0}],feedback:"请补充译码与执行阶段。"});
  await nav("错题本").click();
  await expect(page.locator('.mistake-group[data-source="assignment"]')).toHaveCount(2);
  const homeworkItem = page.locator(`.mistake-group[data-question-id="${choice}"]`);
  await homeworkItem.getByRole("button",{name:"回看原作业"}).click();
  await expect(page.locator(".question-card")).toHaveCount(1);
  await expect(page.locator(".assignment-view")).toContainText("教师反馈：请补充译码与执行阶段。");
  await expect(page.locator(".question-card input").first()).toBeDisabled();
  await page.getByRole("button",{name:"查看完整作业"}).click();
  await expect(page.locator(".question-card")).toHaveCount(2);
  await page.getByRole("button",{name:"返回错题本",exact:true}).click();
  await homeworkItem.getByRole("button",{name:"就地订正这道题"}).click();
  await homeworkItem.getByRole("radio",{name:"中央处理器",exact:true}).check();
  await homeworkItem.getByRole("button",{name:"提交订正",exact:true}).click();
  await expect(homeworkItem.locator(".mistake-resolved")).toHaveText("已订正");
  assert.equal((await json(context.request,`/api/student/assignments/${assignmentId}`)).submission.total_score,0);
  await expect(page.locator(`.mistake-group[data-question-id="${short}"] .mistake-review`)).toHaveCount(0);
  pass("作业错题、指定原题、教师反馈与客观题独立订正正常");

  for (const width of [1366,768,390,320]) {
    await page.setViewportSize({width,height:width<500?844:768});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1),`错题本 ${width} 无页面横向溢出`);
    await page.screenshot({path:`${artifacts}/mistakes-integrated-${width}.png`,fullPage:true});
  }
  pass("错题本四种宽度的布局可读且无横向溢出");
  await page.setViewportSize({width:1366,height:768});
  await nav("课后作业").click();
  await expect(page.locator(`[data-qid="${q.id}"]`)).toHaveClass(/is-correct/);
  await page.reload();
  await expect(page.locator(`[data-qid="${q.id}"]`)).toHaveClass(/is-correct/);
  pass("账户练习成绩刷新后恢复");
  await nav("课程首页").click();
  await page.route("**/api/student/chapter-practice",route => route.abort());
  await nav("课后作业").click();
  await expect(page.locator(".study-sync-error")).toContainText("同步失败");
  await expect(page.locator(".practice-submit")).toBeDisabled();
  await page.unroute("**/api/student/chapter-practice");
  await page.getByRole("button",{name:"重试同步",exact:true}).click();
  await expect(page.locator(".practice-submit")).toBeEnabled();
  // Network loses the successful response. Retry must reuse the UUID.
  await page.locator(`[data-qid="${q.id}"]`).getByRole("radio",{name:wrong,exact:true}).check();
  await page.route("**/api/student/chapter-practice",async route => {
    if (route.request().method() === "POST") { await route.fetch(); await route.abort(); }
    else await route.continue();
  });
  await page.locator(".practice-submit").click();
  await expect(page.locator(".study-sync-error")).toContainText("提交失败");
  await page.unroute("**/api/student/chapter-practice");
  await page.locator(".practice-submit").click();
  await expect(page.locator(`[data-qid="${q.id}"]`)).toHaveClass(/is-wrong/);
  const state = await json(context.request,"/api/student/mistakes");
  assert.equal(state.items.find(item=>item.source==="practice"&&item.questionId===q.id).count,2);
  pass("断网保存草稿、恢复同步和提交响应丢失后的幂等重试");
  await page.locator(".profile-button").click();
  await page.getByRole("button",{name:"退出登录",exact:true}).click();
  await fillLoginForm(page,{username:"demo2026002",password:"Student123!"});await submitLoginForm(page);
  await expect(page.locator(".project-chapter-board")).toBeVisible();await nav("课后作业").click();
  await expect(page.locator(".practice-submit")).toBeEnabled();
  await expect(page.locator(`[data-qid="${q.id}"] input:checked`)).toHaveCount(0);
  assert.equal((await json(context.request,"/api/student/mistakes")).items.filter(item=>item.source==="practice").length,0);
  assert.ok(await page.evaluate(id=>localStorage.getItem(`zcyl:chapter-practice-v2:${id}`)!==null,user.id));
  pass("同一浏览器换账号不串题库草稿、成绩或错题");

  const guestContext = await browser.newContext({viewport:{width:1366,height:768}});
  const guest = await guestContext.newPage(); guest.on("pageerror",error=>errors.push(error.message));
  for (const demo of HOSTED_DEMOS) {
    await guest.goto(`${app}/demos/${demo.file}`,{waitUntil:"domcontentloaded"});
    await expect(guest.locator(".topbar")).toBeVisible();
    await expect(guest.locator(".hosted-demo-context h1")).toHaveText(demo.title);
    assert.equal(new URL(guest.url()).searchParams.get("demo"),demo.id);
    const frame = guest.frameLocator(".hosted-demo-frame");
    await expect(frame.locator("#platform-link-badge")).toContainText("独立模式");
    await guest.getByRole("button",{name:"返回互动演示",exact:true}).click();
    await expect(guest.locator(".courseware-demo-grid")).toBeVisible();
    assert.equal(new URL(guest.url()).searchParams.get("demo"),null);
  }
  pass("九个独立演示入口统一顶栏、游客访问和返回课程正常");
  await guest.goto(`${app}/demos/addressing.html`,{waitUntil:"domcontentloaded"});
  await fillLoginForm(guest,{username:"demo2026001",password:"Student123!"});await submitLoginForm(guest);
  await expect(guest.locator(".hosted-demo-context h1")).toHaveText("指令系统与寻址方式");
  await expect(guest.frameLocator(".hosted-demo-frame").locator("#platform-link-badge")).toContainText("已连接学情");
  pass("演示内登录后回到原演示并连接真实学情");
  for (const width of [1366,768,390,320]) {
    await guest.setViewportSize({width,height:width<500?844:768});
    await expect(guest.getByRole("button",{name:"返回互动演示",exact:true})).toBeVisible();
    assert.ok(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`演示框架 ${width} 无溢出`);
    await guest.screenshot({path:`${artifacts}/demo-system-${width}.png`});
  }
  await guest.getByRole("button",{name:"本章练习",exact:true}).click();
  await expect(guest.getByRole("tab",{name:/第5章/})).toHaveAttribute("aria-selected","true");
  pass("演示框架四种窗口尺寸与本章题库入口正常");
  await guest.goto(`${app}/courseware.html`,{waitUntil:"domcontentloaded"});
  await expect(guest.locator(".topbar")).toBeVisible();
  await expect(guest.locator(".hosted-demo-frame")).toHaveAttribute("src","/courseware.html?embedded=1");
  await expect(guest.frameLocator(".hosted-demo-frame").locator("body")).toBeVisible();
  await guest.getByRole("button",{name:"返回课程课件",exact:true}).click();
  await expect(guest.locator(".courseware-lecture-player iframe")).toBeVisible();
  pass("演讲课件完整保留，统一返回入口正常");
  const teacherPage = await teacherContext.newPage();
  await teacherPage.goto(`${app}/demos/alu.html`,{waitUntil:"domcontentloaded"});
  await expect(teacherPage.locator(".hosted-demo-context h1")).toContainText("定点乘除与浮点运算");
  await expect(teacherPage.locator(".topbar-nav").getByRole("button",{name:"教师看板",exact:true})).toBeVisible();
  await teacherPage.locator(".topbar-nav").getByRole("button",{name:"教师看板",exact:true}).click();
  await expect(teacherPage.locator(".teacher-reference-shell")).toBeVisible();
  pass("教师演示顶栏保持身份导航并可返回教师看板");
  assert.deepEqual(errors,[]);pass("上述操作无浏览器运行错误");
  await writeFile(`${artifacts}/learning-integration-results.json`,JSON.stringify({checks,errors},null,2));
  console.log(`${checks.length} 项学习系统联动验证通过`);
} catch (error) {
  await page.screenshot({path:`${artifacts}/learning-integration-failure.png`,fullPage:true}).catch(()=>{});
  throw error;
} finally { await browser.close(); }
