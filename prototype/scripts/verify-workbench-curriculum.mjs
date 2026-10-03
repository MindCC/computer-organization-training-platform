import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';
import {gotoApp,fillLoginForm,submitLoginForm} from './lib/qaLogin.mjs';
import {openChallengeFromHome} from './lib/qaHome.mjs';
import {CIRCUIT_CHALLENGES,getCircuitChallenge} from '../src/circuit/challengeCircuitModel.js';
import {CHALLENGES} from '../src/platformLogic.js';

const base=process.env.PROTOTYPE_API_URL??'http://127.0.0.1:8787';
const artifacts=process.env.QA_ARTIFACT_DIR??'qa-artifacts';await mkdir(artifacts,{recursive:true});
async function api(url,body,cookie,method='POST'){
  const response=await fetch(base+url,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json(),cookie:(response.headers.get('set-cookie')??'').split(';')[0]};
}
const teacher=await api('/api/auth/login',{username:'teacher',password:'ChangeMe123!'});assert.equal(teacher.status,200);
const c=await api('/api/classes',{name:'关卡课程验收-'+Date.now()},teacher.cookie);assert.equal(c.status,201);
const classId=c.data.class.id,username='curriculum-'+Date.now();
assert.equal((await api(`/api/teacher/classes/${classId}/import-students`,{csv:`${username},关卡验收学生,Student123!`},teacher.cookie)).status,200);
const student=await api('/api/auth/login',{username,password:'Student123!'});
assert.equal((await api('/api/student/attempts',{challengeId:'parity-check',result:{score:100,passed:true,circuitEdges:getCircuitChallenge('parity-check').requiredEdges}},student.cookie)).status,403);
let browser;try{browser=await chromium.launch({channel:'msedge',headless:true});}catch{browser=await chromium.launch({headless:true});}
const page=await browser.newPage({viewport:{width:1366,height:768}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await gotoApp(page,process.env.PROTOTYPE_APP_URL??base);await fillLoginForm(page,{username,password:'Student123!'});await submitLoginForm(page);
  await expect(page.locator('.project-chapter-board')).toBeVisible();
  await openChallengeFromHome(page,'三位偶校验');
  await expect(page.getByRole('button',{name:'提交检测',exact:true})).toBeDisabled();
  await expect(page.locator('.lab-studio-locked-notice')).toContainText('机器数编码');
  assert.equal((await api(`/api/teacher/classes/${classId}/skip-locked`,{allow:true},teacher.cookie,'PUT')).status,200);
  await page.reload();await expect(page.getByRole('button',{name:'提交检测',exact:true})).toBeEnabled();
  await page.locator('.route-fold-btn').filter({hasText:'全展开'}).click();
  const canvas=page.getByTestId('react-flow-circuit-canvas');
  async function enter(model){await page.locator('.lab-studio-step').filter({has:page.getByText(model.title,{exact:true})}).click();await expect(canvas.locator('.react-flow__node')).toHaveCount(model.nodes.length);}
  async function submit(id){
    const promise=page.waitForResponse(r=>r.url().endsWith('/api/student/attempts')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'提交检测',exact:true}).click();const response=await promise;assert.equal(response.status(),201,id);
    const body=await response.json();assert.equal(body.progress[id].status,'completed',id);
    const lesson=CHALLENGES.find(c=>c.id===id);assert.equal(body.progress[id].bestScore,lesson.grading==='participation'?0:100,id);
    await expect(page.locator('.quest-settlement')).toBeVisible();await page.locator('.quest-settlement').getByRole('button',{name:'复盘本关',exact:true}).click();
    return response.request().postDataJSON();
  }
  for(const model of CIRCUIT_CHALLENGES.filter(m=>m.id!=='computer-components')){
    await enter(model);await page.getByRole('button',{name:'填入参考结构',exact:true}).click();
    await expect(canvas.locator('.react-flow__edge')).toHaveCount(model.requiredEdges.length);
    await submit(model.id);await expect(page.locator('.circuit-flow-report')).toContainText('完整检测');
    console.log('Server verified',model.id);
  }
  await enter(getCircuitChallenge('machine-number'));await page.getByRole('button',{name:'填入参考结构',exact:true}).click();
  await expect(page.locator('.circuit-word-output').last()).toContainText('1011');
  await page.getByRole('spinbutton',{name:'十进制数',exact:true}).fill('3');await expect(page.locator('.circuit-word-output').last()).toContainText('0011');
  await enter(getCircuitChallenge('alu'));await page.getByRole('button',{name:'填入参考结构',exact:true}).click();
  await page.getByRole('combobox',{name:'控制位',exact:true}).selectOption('2');await expect(page.locator('.circuit-flow-manual-badge')).toBeVisible();
  await page.getByRole('combobox',{name:'控制位',exact:true}).selectOption('3');await expect(page.locator('.circuit-output-lamp').first()).toHaveAttribute('aria-label','输出 0');
  await page.getByRole('button',{name:'单步传播',exact:true}).click();await expect(page.locator('.workbench-trace-controls')).toContainText('传播步骤 1/');
  await page.getByRole('button',{name:'运行到结果',exact:true}).click();await expect(page.locator('.workbench-trace-controls')).toContainText('实时结果');
  await enter(getCircuitChallenge('bus-arbiter'));await page.getByRole('button',{name:'填入参考结构',exact:true}).click();
  await page.getByRole('button',{name:'提示 0/3',exact:true}).click();await expect(page.locator('.workbench-hints')).toContainText('优先级');
  await page.getByRole('button',{name:'放大工作台',exact:true}).click();await page.screenshot({path:path.join(artifacts,'curriculum-bus-arbiter.png')});await page.keyboard.press('Escape');
  // Build an actual freeform AND using NAND gates: no reference wires are submitted.
  await enter(getCircuitChallenge('and-gate'));await page.getByRole('button',{name:/自由拼装/}).click();
  const sandbox=page.locator('.sandbox');
  async function addGate(kind,x,y){
    await sandbox.locator(`.sandbox-gate[data-kind="${kind}"]`).dragTo(sandbox.locator('.react-flow__pane'),{targetPosition:{x,y}});
  }
  await addGate('nand',250,110);await addGate('nand',480,230);await expect(sandbox.locator('[data-component-type="nand"]')).toHaveCount(2);
  async function connect(a,b){
    let previous,stable=0;await expect.poll(async()=>{const v=await sandbox.locator('.react-flow__viewport').getAttribute('style');stable=v===previous?stable+1:0;previous=v;return stable;},{intervals:[100,100,100]}).toBeGreaterThanOrEqual(2);
    const from=await a.boundingBox(),to=await b.boundingBox();await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:14});await page.mouse.up();
  }
  const gates=sandbox.locator('[data-component-type="nand"]'),inputs=sandbox.locator('[data-component-type="input"]');
  await connect(inputs.nth(0).locator('.output .react-flow__handle'),gates.nth(0).locator('.input .react-flow__handle').nth(0));
  await connect(inputs.nth(1).locator('.output .react-flow__handle'),gates.nth(0).locator('.input .react-flow__handle').nth(1));
  await connect(gates.nth(0).locator('.output .react-flow__handle'),gates.nth(1).locator('.input .react-flow__handle').nth(0));
  await connect(gates.nth(0).locator('.output .react-flow__handle'),gates.nth(1).locator('.input .react-flow__handle').nth(1));
  await connect(gates.nth(1).locator('.output .react-flow__handle'),sandbox.locator('[data-component-type="output"] .react-flow__handle'));
  await expect(sandbox.locator('.react-flow__edge')).toHaveCount(5);
  const evidence=await submit('and-gate');assert.equal(evidence.result.mode,'freeform');assert.equal(evidence.result.circuitNodes.filter(n=>n.type==='nand').length,2);assert.equal(evidence.result.circuitEdges.length,5);
  await page.screenshot({path:path.join(artifacts,'curriculum-freeform-nand.png'),fullPage:true});
  const invalid=structuredClone(evidence);invalid.result.circuitNodes[2].type='alu1';assert.equal((await api('/api/student/attempts',invalid,student.cookie)).status,400);
  invalid.result.circuitNodes=evidence.result.circuitNodes;invalid.result.circuitEdges=evidence.result.circuitEdges.slice(1);
  const rejection=await api('/api/student/attempts',invalid,student.cookie);assert.equal(rejection.status,201);assert.ok(rejection.data.progress['and-gate'].errors.length>0);
  await page.getByRole('button',{name:/逻辑门沙盒/}).click();
  await expect(page.locator('.sandbox-gate[data-kind="chip:parity-check"]')).toHaveCount(1);
  await addGate('chip:parity-check',350,180);await expect(page.locator('[data-component-type="chip:parity-check"]')).toHaveCount(1);
  await page.reload();await expect(page.locator('.lab-experiment-context')).toContainText('30');
  assert.deepEqual(errors,[]);console.log('PASS: 29 real server submissions, locked practice/403, numeric controls, 4 ALU operations, real propagation, hints, actual freeform NAND evidence and invalid evidence rejection');
}catch(error){await page.screenshot({path:path.join(artifacts,'curriculum-error.png'),fullPage:true});throw error;}finally{await browser.close();}
