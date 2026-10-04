import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {COURSEWARE} from '../courseware.js';
import {hostedDemoOf} from './demoNavigation.js';
import {isValidDemoId,normalizeDemoAttemptPayload} from '../../server/demoValidation.js';
const hosted=new URL('../../public/demos/',import.meta.url);
const standalone=new URL('../../../preview/demos/',import.meta.url);
const context={};
vm.runInNewContext(readFileSync(new URL('adder-alu-core.js',hosted),'utf8'),context);
const {halfAdder,fullAdder,rippleAdd,alu4,quizQuestion}=context.AdderAluCore;

test('半加器和全加器的全部输入得到正确和位与进位',()=>{
  for(let a=0;a<2;a++)for(let b=0;b<2;b++){
    const half=halfAdder(a,b);assert.equal(2*half.carry+half.sum,a+b);
    for(let cin=0;cin<2;cin++){const full=fullAdder(a,b,cin);assert.equal(2*full.carry+full.sum,a+b+cin);}
  }
});

test('4位串行进位与ALU覆盖全部输入及最高位进位、零标志',()=>{
  for(let a=0;a<16;a++)for(let b=0;b<16;b++)for(let cin=0;cin<2;cin++){
    const value=rippleAdd(a,b,cin);
    assert.equal(16*value.carry+value.output,a+b+cin);
    assert.equal(value.zero,((a+b+cin)%16===0)?1:0);
    assert.equal(value.stages.length,4);
    for(let index=1;index<4;index++)assert.equal(value.stages[index].cin,value.stages[index-1].carry);
    assert.equal(alu4(a,b,'ADD',cin).output,value.output);
  }
  for(let a=0;a<16;a++)for(let b=0;b<16;b++)for(const [op,expected] of [['AND',a&b],['OR',a|b],['XOR',a^b]]){
    const value=alu4(a,b,op);assert.equal(value.output,expected);assert.equal(value.carry,0);assert.equal(value.zero,expected===0?1:0);
  }
});

test('随机练习答案由输入与运算生成，并保留平台演示学情入口',()=>{
  let seed=41;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  for(let index=0;index<90;index++){
    const q=quizQuestion(index,random);
    const expected=q.mode===0?q.a+q.b:q.mode===1?q.a+q.b+q.cin:q.op==='ADD'?q.a+q.b:q.op==='AND'?q.a&q.b:q.op==='OR'?q.a|q.b:q.a^q.b;
    assert.equal(q.answer,expected);assert.equal(q.options.length,4);assert.equal(new Set(q.options).size,4);assert.ok(q.options.includes(expected));
  }
  assert.ok(isValidDemoId('adder-alu'));
  assert.ok(normalizeDemoAttemptPayload({demoId:'adder-alu',result:{score:100,total:5,correct:5,elapsedMinutes:1}}).ok);
  const html=readFileSync(new URL('adder-alu.html',hosted),'utf8');
  assert.match(html,/recordQuizAnswer\(ok\)/);
  for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new vm.Script(script[1]));
});

test('恢复后的独立源与平台副本相同，课程归属保持正确',()=>{
  for(const file of ['adder-alu.html','adder-alu-core.js','platform-link.js','alu.html']){
    assert.equal(readFileSync(new URL(file,standalone),'utf8'),readFileSync(new URL(file,hosted),'utf8'),file);
  }
  for(const chapter of COURSEWARE.chapters)for(const demo of chapter.demos){
    const id=demo.href.split('/').at(-1).replace('.html','');
    assert.equal(hostedDemoOf(id).chapterId,chapter.id);
    assert.ok(readFileSync(new URL(id+'.html',hosted),'utf8').includes('<html'));
  }
  const ch2=COURSEWARE.chapters.find(chapter=>chapter.id==='ch2'),ch3=COURSEWARE.chapters.find(chapter=>chapter.id==='ch3');
  assert.ok(ch2.demos.some(demo=>demo.href==='/demos/alu.html'));
  assert.deepEqual(ch3.demos.map(demo=>demo.href),['/demos/adder-alu.html']);
  assert.doesNotMatch(ch3.sections.join(' ')+ch3.keyPoints.join(' ')+ch3.discussionQuestions.join(' '),/布斯|恢复余数|浮点对阶|浮点加减/);
  const platform=readFileSync(new URL('platform-link.js',hosted),'utf8');
  assert.match(platform,/"adder-alu\.html": \{ id: "adder-alu"/);
});
