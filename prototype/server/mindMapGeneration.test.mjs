import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMindMap, readMindMapConfig } from './mindMapGeneration.js';

test('requires explicit consent and rejects empty or oversized input', async () => {
  for (const input of [{text:'CPU'}, {text:'', consent:true}, {text:'x'.repeat(6001), consent:true}]) {
    await assert.rejects(generateMindMap(input, { env: {} }), e => e.status === 400);
  }
});
test('unconfigured text becomes an honestly labeled local outline', async () => {
  const result = await generateMindMap({text:'存储系统\n- Cache\n  - 命中率\n- 主存', consent:true}, {env:{}});
  assert.equal(result.source, 'local');
  assert.equal(result.graph.nodes.find(n => n.label === '命中率').parentId, result.graph.nodes.find(n => n.label === 'Cache').id);
});
test('local outline preserves numeric knowledge and caps excessive indentation', async () => {
  const result=await generateMindMap({text:'64位存储系统\n- 32位地址\n  - 3.14\n'+Array.from({length:15},(_,i)=>' '.repeat(i*2)+'- 深层知识'+i).join('\n'),consent:true},{env:{}});
  assert.equal(result.graph.title,'64位存储系统');
  assert.ok(result.graph.nodes.some(n=>n.label==='32位地址'));
  assert.ok(result.graph.nodes.some(n=>n.label==='3.14'));
});
test('images require a configured vision model; invalid image is rejected before fetch', async () => {
  await assert.rejects(generateMindMap({ image:'data:image/png;base64,iVBORw0KGgo=', consent:true }, { env:{} }), e => e.status === 503);
  await assert.rejects(generateMindMap({ image:'data:image/svg+xml;base64,eA==', consent:true }, { env:{} }), e => e.status === 400);
});
test('vision request contains only selected input and parses graph data', async () => {
  let sent;
  const env = { MINDMAP_API_KEY:'test', MINDMAP_BASE_URL:'https://example.invalid/v1', MINDMAP_MODEL:'vision', MINDMAP_VISION_ENABLED:'1' };
  const result = await generateMindMap({ text:'梳理图片', image:'data:image/png;base64,iVBORw0KGgo=', consent:true, grades:'private', account:'private' }, {
    env, fetchImpl:async (_url, options) => { sent = JSON.parse(options.body); return { ok:true, json:async () => ({ choices:[{message:{content:JSON.stringify({title:'CPU', nodes:[{id:'root',label:'CPU',parentId:null},{id:'alu',label:'ALU',parentId:'root'}]})}}] }) }; },
  });
  assert.equal(result.source, 'ai');
  assert.ok(Array.isArray(sent.messages[0].content));
  assert.ok(!JSON.stringify(sent).includes('private'));
  assert.equal(result.graph.nodes.length, 2);
  assert.equal(readMindMapConfig(env).vision, true);
});
test('invalid AI graph and HTTP errors surface without inventing image content', async () => {
  const env = { MINDMAP_API_KEY:'test', MINDMAP_BASE_URL:'https://example.invalid/v1', MINDMAP_MODEL:'vision', MINDMAP_VISION_ENABLED:'1' };
  for (const fetchImpl of [async () => ({ok:false,status:500}), async () => ({ok:true,json:async () => ({choices:[{message:{content:'{"nodes":[]}'}}]})})]) {
    await assert.rejects(generateMindMap({text:'CPU',consent:true}, {env,fetchImpl}), e => e.status === 502);
  }
});
