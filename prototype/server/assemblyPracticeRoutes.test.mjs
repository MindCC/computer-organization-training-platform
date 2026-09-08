import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { openDatabase,createUser,createSession } from './db.js';
import { hashToken } from './auth.js';
import { HARDWARE_GAME_CASES } from '../src/hardwareGame.js';
import { createPracticeSeed } from '../src/assemblyPractice.js';

test('assembly sync API enforces session ownership, validates data, preserves boot and grade boundaries',async()=>{
  const db=openDatabase(':memory:'),app=createApp({db,serveStatic:false,logger:()=>{}});
  const users=['student','student','teacher'].map((role,i)=>createUser(db,{username:'sync-'+i,displayName:'test',role,passwordHash:'x'}));
  users.forEach((user,i)=>createSession(db,user.id,hashToken('sync-token-'+i),new Date(Date.now()+60000)));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`,url='/api/student/assembly-practice/'+HARDWARE_GAME_CASES[0].id;
  async function call(index,method='GET',body,path=url,extra={}){
    const res=await fetch(base+path,{method,headers:{'content-type':'application/json',...(index===null?{}:{cookie:`zcyl_session=sync-token-${index}`}),...extra},...(body?{body:JSON.stringify(body)}:{})});
    return {status:res.status,body:await res.json()};
  }
  try{
    assert.equal((await call(null)).status,401);assert.equal((await call(2)).status,403);
    assert.equal((await call(0,'GET',null,url,{'x-practice-student':String(users[1].id)})).status,403);
    assert.equal((await call(0,'GET',null,'/api/student/assembly-practice/unknown')).status,404);
    const parts={cpu:'cpu-i3',memory:'mem-8',storage:'ssd-512',gpu:'gpu-integrated'};
    const active={id:'practice-a',mode:'fault',fault:'power',parts,...createPracticeSeed(parts,'fault','power'),category:'cpu',elapsedMs:1000,events:[],powered:true,session:{completedAt:1}};
    const batch={operationId:'request-0001',baseRevision:0,studentId:users[1].id,document:{version:1,active,history:[]}};
    assert.equal((await call(0,'PUT',batch,url,{origin:'https://evil.invalid'})).status,403);
    assert.equal((await call(0,'PUT',{...batch,baseRevision:-1})).status,400);
    assert.equal((await call(0,'PUT',{...batch,document:{version:1,active:{},history:[]}})).status,400);
    assert.equal((await call(0,'PUT',batch)).body.revision,1);
    assert.equal((await call(0,'PUT',batch)).body.duplicate,true);
    assert.equal((await call(1)).body.revision,0);
    const saved=(await call(0)).body.document;
    assert.equal(saved.active.powered,undefined);assert.equal(saved.active.session,undefined);
    assert.equal(saved.active.structure.cables.eps,undefined);
    const conflict=await call(0,'PUT',{...batch,operationId:'request-0002'});
    assert.equal(conflict.status,409);assert.equal(conflict.body.current.revision,1);
    assert.equal((await call(0,'PUT',{...batch,document:{version:1,active:null,history:[]}})).status,409);
    const saved2=await call(0,'PUT',{...batch,baseRevision:1,operationId:'request-0002',document:{version:1,active:null,history:[{id:'finished',mode:'guided',fault:'power',completedAt:1000,seconds:1,errorCount:2,hints:1,score:999,errors:[]}]}});
    assert.equal(saved2.status,200);assert.equal((await call(0)).body.document.history[0].score,87);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM challenge_attempts').get().n,0);
  }finally{await new Promise(r=>server.close(r));db.close();}
});
