import test from 'node:test';
import assert from 'node:assert/strict';
import { createPracticeSync } from './assemblyPracticeSync.js';

const empty=()=>({version:1,active:null,history:[]});
const doc=id=>({...empty(),history:[{id,mode:'guided',fault:'power',completedAt:1000,seconds:1,errorCount:0,hints:0,score:100,errors:[]}]});
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};};
function server(){
  let current={revision:0,document:empty()},offline=false,lose=false,puts=0;const receipts=new Map();
  return {get current(){return current;},set current(v){current=v;},set offline(v){offline=v;},set lose(v){lose=v;},get puts(){return puts;},
    async request(method,body){
      if(offline)throw new Error('offline');
      if(method==='GET')return structuredClone(current);
      puts++;
      if(receipts.has(body.operationId))return {...receipts.get(body.operationId),duplicate:true};
      if(body.baseRevision!==current.revision)throw Object.assign(new Error('conflict'),{status:409,current:structuredClone(current)});
      current={revision:current.revision+1,document:structuredClone(body.document)};
      const result={revision:current.revision};receipts.set(body.operationId,result);
      if(lose){lose=false;throw new Error('response lost');}return result;
    }
  };
}
const client=(s,storage=memory(),extra={})=>createPracticeSync({storage,key:'practice',request:s.request,...extra});
test('a fresh browser restores the server; offline outbox survives reload and retries a lost response once',async()=>{
  const s=server(),storage=memory(),a=client(s,storage);await a.start();
  s.lose=true;a.storage.setItem('',JSON.stringify(doc('first')));await a.flush();assert.equal(a.snapshot().status,'offline');a.stop();
  const b=client(s,storage);await b.start();assert.equal(b.snapshot().status,'synced');assert.equal(s.current.revision,1);
  const c=client(s);await c.start();assert.equal(c.snapshot().document.history[0].id,'first');
  s.offline=true;b.storage.setItem('',JSON.stringify(doc('second')));await b.flush();assert.equal(b.snapshot().status,'offline');
  s.offline=false;await b.flush();assert.equal(s.current.revision,2);b.stop();c.stop();
});
test('concurrent devices require an explicit choice and merge both histories',async()=>{
  const s=server(),a=client(s),b=client(s);await a.start();await b.start();
  a.storage.setItem('',JSON.stringify(doc('a')));await a.flush();b.storage.setItem('',JSON.stringify(doc('b')));await b.flush();
  assert.equal(b.snapshot().status,'conflict');assert.equal(s.current.document.history[0].id,'a');
  b.resolve('local');await b.flush();assert.deepEqual(new Set(s.current.document.history.map(r=>r.id)),new Set(['a','b']));
  a.storage.setItem('',JSON.stringify(doc('c')));await a.flush();assert.equal(a.snapshot().status,'conflict');
  a.resolve('remote');await a.flush();assert.equal(s.current.document.history.length,3);a.stop();b.stop();
});
test('legacy local history never silently overwrites another device; login expiry remains visible',async()=>{
  const s=server();s.current={revision:2,document:doc('remote')};const storage=memory();storage.setItem('practice',JSON.stringify(doc('local')));
  const a=client(s,storage);await a.start();assert.equal(a.snapshot().status,'conflict');assert.equal(s.puts,0);a.stop();
  const b=createPracticeSync({storage:memory(),key:'practice',request:async()=>{throw Object.assign(new Error('login'),{status:401});}});
  await b.start();assert.equal(b.snapshot().status,'auth');b.stop();
});
test('edits during upload remain queued; stopping cannot apply an old response',async()=>{
  const s=server();let release;const a=client(s,memory(),{request:async(method,body)=>{if(method==='PUT')await new Promise(r=>{release=r;});return s.request(method,body);}});
  await a.start();a.storage.setItem('',JSON.stringify(doc('one')));const saving=a.flush();
  a.storage.setItem('',JSON.stringify(doc('two')));release();
  await new Promise(r=>setTimeout(r,0));assert.ok(a.snapshot().document.history.some(r=>r.id==='two'));
  a.stop();release();await saving;assert.equal(a.snapshot().document.history[0].id,'two');
});

test('resolving a conflict invalidates the old workbench cleanup writer',async()=>{
  const s=server(),a=client(s),b=client(s);await a.start();await b.start();
  const stale=b.createStorage();a.storage.setItem('',JSON.stringify(doc('a')));await a.flush();
  stale.setItem('',JSON.stringify(doc('b')));await b.flush();b.resolve('remote');
  stale.setItem('',JSON.stringify(doc('stale-cleanup')));await b.flush();
  assert.equal(s.current.document.history.some(r=>r.id==='stale-cleanup'),false);a.stop();b.stop();
});

test('a write that changes during a request is sent as a new revision after the acknowledgement',async()=>{
  const s=server();let release,first=true;
  const a=client(s,memory(),{request:async(method,body)=>{if(method==='PUT'&&first){first=false;await new Promise(r=>{release=r;});}return s.request(method,body);}});
  await a.start();a.storage.setItem('',JSON.stringify(doc('one')));const saving=a.flush();
  a.storage.setItem('',JSON.stringify(doc('two')));release();await saving;
  assert.equal(s.current.revision,2);assert.equal(s.current.document.history[0].id,'two');assert.equal(a.snapshot().status,'synced');a.stop();
});
