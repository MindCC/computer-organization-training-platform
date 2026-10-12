import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../public/demos/platform-link.js',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function demo({storage=new Map(),user={id:7,role:'student',displayName:'测试学生'},offline=false}={}) {
  let now=0,fail=offline;const events={},requests=[],timers=[],elements={};let id=0;
  const window={addEventListener:(event,cb)=>{events[event]=cb;}};
  const document={hidden:false,readyState:'complete',documentElement:{},body:{appendChild:el=>{elements[el.id]=el;}},getElementById:key=>elements[key],addEventListener:(event,cb)=>{events[event]=cb;},createElement:()=>({style:{},set innerHTML(text){this.textContent=text.replace(/<[^>]*>/g,'');}})};
  const localStorage={get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  vm.runInNewContext(code,{window,document,location:{pathname:'/demos/cpu.html',protocol:'http:'},localStorage,crypto:{randomUUID:()=>`test-demo-${++id}`},Date:{now:()=>now},Math,JSON,setInterval:(cb,ms)=>timers.push({cb,ms}),fetch:async(url,options)=>{if(url==='/api/auth/me')return {ok:true,json:async()=>({user})};requests.push(JSON.parse(options.body));if(fail)throw new Error('offline');return {ok:true};}});
  return {window,document,events,requests,storage,timers,setNow:value=>{now=value;},setOffline:value=>{fail=value;}};
}
test('演示可见计时，无需答题，后台和闲置不累计，不凑整分钟',async()=>{
  const d=demo();await settle();d.setNow(15000);d.window.__platformLink.flush();await settle();
  assert.equal(d.requests[0].result.total,0);assert.equal(d.requests[0].result.elapsedMinutes,0.25);
  d.setNow(20000);d.document.hidden=true;d.events.visibilitychange();await settle();
  d.setNow(80000);d.window.__platformLink.flush();await settle();
  assert.equal(d.requests.reduce((sum,p)=>sum+p.result.elapsedMinutes,0),1/3);
  d.document.hidden=false;d.events.visibilitychange();d.setNow(680000);d.window.__platformLink.flush();await settle();
  assert.equal(d.requests.at(-1).result.elapsedMinutes,5,'长时间闲置最多计入五分钟');
  d.window.__platformLink.flush();await settle();assert.equal(d.requests.length,3,'重复离开不会重复计时');
});
test('每道题立即保存原答案、参考答案与解析；失败重试使用同一标识',async()=>{
  const d=demo({offline:true});await settle();
  d.window.__platformLink.recordQuizAnswer(false,{prompt:'<b>补码</b>选择',mode:'choice',choices:['0','1'],answer:1,explain:'正确为1'},0);await settle();
  const p=d.requests[0];assert.equal(p.result.questions[0].studentAnswer,'0');assert.equal(p.result.questions[0].referenceAnswer,'1');assert.equal(p.result.questions[0].stem,'补码选择');
  assert.equal(d.storage.size,1);
  d.setOffline(false);d.events.online();await settle();assert.equal(d.requests[1].clientSubmissionId,p.clientSubmissionId);assert.equal(d.storage.size,0);
  d.window.__platformLink.recordQuizAnswer(false,{prompt:'二进制原答',mode:'bits',answer:[0,1],explain:'逐位分析'},[1,0]);await settle();
  assert.equal(d.requests.at(-1).result.questions[0].studentAnswer,'10');
});
test('待同步记录刷新恢复且账号隔离，教师试练写入教师端点',async()=>{
  const storage=new Map(), first=demo({storage,offline:true});await settle();first.window.__platformLink.recordQuizAnswer(false,{prompt:'测试题',answer:2},1);await settle();
  const other=demo({storage,user:{id:8,role:'student'}});await settle();assert.equal(other.requests.length,0);
  const restored=demo({storage});await settle();assert.equal(restored.requests.length,1);assert.equal(storage.size,0);
  const teacher=demo({user:{id:9,role:'teacher'}});await settle();teacher.setNow(15000);teacher.window.__platformLink.flush();await settle();assert.equal(teacher.requests[0].accountId,9);
});
test('old demo answers preserve unknown timing; new shown-question snapshots freeze for offline replay',async()=>{
  const d=demo({offline:true});await settle();
  const q={prompt:'定点数补码',answer:'01',explain:'按位计算'};
  d.window.__platformLink.recordQuestionShown(q,null);
  d.setNow(1000);d.events.click({type:'click',target:{closest:()=>true}});
  d.window.__platformLink.recordQuizAnswer(true,q,'01');await settle();
  const observation=d.requests[0].result.questions[0].observation;
  assert.equal(observation.firstAnswerMs,0);assert.equal(observation.visibleActiveMs,0,'without an observed visible question no time is invented');
  d.setNow(10000);d.setOffline(false);d.events.online();await settle();
  assert.deepEqual(d.requests[1].result.questions[0].observation,observation);
});
