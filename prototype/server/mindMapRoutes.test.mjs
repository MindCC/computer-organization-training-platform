import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { openDatabase, migrate, createUser } from './db.js';
import { hashPassword } from './auth.js';

async function setup(options={}) {
  const db=openDatabase(':memory:');migrate(db);
  const passwordHash=await hashPassword('MapTest123!');
  for(const [username,role] of [['alice','student'],['bob','student'],['teacher','teacher']])createUser(db,{username,role,displayName:username,passwordHash});
  const app=createApp({db,serveStatic:false,logger:()=>{},mindMapOptions:{env:{},...options}});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const url=`http://127.0.0.1:${server.address().port}`;
  async function request(path,{cookie,...opts}={}) {
    const res=await fetch(url+path,{...opts,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...opts.headers}});
    return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
  }
  const login=async username=>(await request('/api/auth/login',{method:'POST',body:JSON.stringify({username,password:'MapTest123!'})})).cookie;
  return {db,request,login,close:async()=>{await new Promise(r=>server.close(r));db.close();}};
}
const graph={title:'CPU',nodes:[{id:'root',label:'CPU',parentId:null},{id:'alu',label:'运算器',parentId:'root'}],relations:[]};

test('real HTTP authentication, owner isolation, version conflicts, CRUD and teacher access',async()=>{
  const s=await setup();try{
    assert.equal((await s.request('/api/mind-maps')).status,401);
    const a=await s.login('alice'),b=await s.login('bob'),t=await s.login('teacher');
    let result=await s.request('/api/mind-maps',{cookie:a,method:'POST',body:JSON.stringify({graph})});
    assert.equal(result.status,201);const map=result.body.map;
    assert.equal((await s.request('/api/mind-maps',{cookie:b})).body.maps.length,0);
    for(const method of ['GET','PUT','DELETE'])assert.equal((await s.request(`/api/mind-maps/${map.id}`,{cookie:b,method,...(method==='PUT'?{body:JSON.stringify({graph,version:1})}:{})})).status,404);
    result=await s.request(`/api/mind-maps/${map.id}`,{cookie:a,method:'PUT',body:JSON.stringify({graph:{...graph,title:'修改后的 CPU'},version:1})});
    assert.equal(result.status,200);assert.equal(result.body.map.version,2);
    assert.equal((await s.request(`/api/mind-maps/${map.id}`,{cookie:a,method:'PUT',body:JSON.stringify({graph,version:1})})).status,409);
    assert.equal((await s.request('/api/mind-maps',{cookie:t,method:'POST',body:JSON.stringify({graph})})).status,201);
    assert.equal((await s.request('/api/teacher/knowledge/documents',{cookie:t})).status,200);
    assert.equal((await s.request(`/api/mind-maps/${map.id}`,{cookie:a,method:'DELETE'})).status,200);
    assert.equal((await s.request(`/api/mind-maps/${map.id}`,{cookie:a})).status,404);
  }finally{await s.close();}
});
test('generation rejects missing consent and cross-origin writes, and labels local results',async()=>{
  const s=await setup();try{
    const cookie=await s.login('alice');
    assert.equal((await s.request('/api/mind-maps/generate',{cookie,method:'POST',body:JSON.stringify({text:'CPU'})})).status,400);
    assert.equal((await s.request('/api/mind-maps/generate',{cookie,method:'POST',headers:{origin:'https://attacker.invalid'},body:JSON.stringify({text:'CPU',consent:true})})).status,403);
    const result=await s.request('/api/mind-maps/generate',{cookie,method:'POST',body:JSON.stringify({text:'CPU\n- 运算器\n- 控制器',consent:true,grades:'private'})});
    assert.equal(result.status,200);assert.equal(result.body.source,'local');assert.equal(result.body.graph.nodes.length,3);
  }finally{await s.close();}
});
test('image generation accepts over 1MB through bounded authenticated JSON parser',async()=>{
  const env={MINDMAP_API_KEY:'fake',MINDMAP_BASE_URL:'https://example.invalid/v1',MINDMAP_MODEL:'vision',MINDMAP_VISION_ENABLED:'1'};
  let calls=0;
  const s=await setup({env,fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(graph)}}]})};}});
  try{
    const cookie=await s.login('alice'),bytes=Buffer.alloc(1100000);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
    const result=await s.request('/api/mind-maps/generate',{cookie,method:'POST',body:JSON.stringify({image:`data:image/png;base64,${bytes.toString('base64')}`,consent:true})});
    assert.equal(result.status,200);assert.equal(result.body.source,'ai');assert.equal(calls,1);
    assert.equal((await s.request('/api/mind-maps',{cookie,method:'POST',body:JSON.stringify({graph:{...graph,nodes:[]}})})).status,400);
  }finally{await s.close();}
});
