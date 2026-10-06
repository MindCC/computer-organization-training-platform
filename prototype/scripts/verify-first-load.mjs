import {chromium,expect} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {gotoApp,fillLoginForm,submitLoginForm} from './lib/qaLogin.mjs';
const target=process.env.PROTOTYPE_APP_URL,tag=process.env.QA_LOAD_TAG??'baseline';
if(!target)throw new Error('PROTOTYPE_APP_URL is required');
mkdirSync('qa-artifacts',{recursive:true});
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage(),cdp=await context.newCDPSession(page);
await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
let requests=new Map();
cdp.on('Network.requestWillBeSent',event=>requests.set(event.requestId,{url:event.request.url,type:event.type}));
cdp.on('Network.responseReceived',event=>{const item=requests.get(event.requestId);if(item)Object.assign(item,{status:event.response.status,mime:event.response.mimeType,cache:event.response.fromDiskCache});});
cdp.on('Network.loadingFinished',event=>{const item=requests.get(event.requestId);if(item)item.bytes=event.encodedDataLength;});
async function settle(){await page.waitForLoadState('networkidle',{timeout:15000});await page.evaluate(()=>document.fonts.ready);}
function summarize(name){const rows=[...requests.values()].filter(row=>row.url.startsWith(target)&&Number.isFinite(row.bytes)).map(row=>({...row,url:new URL(row.url).pathname}));return{name,requests:rows.length,bytes:rows.reduce((sum,row)=>sum+row.bytes,0),byType:Object.fromEntries([...new Set(rows.map(row=>row.type))].map(type=>[type,rows.filter(row=>row.type===type).reduce((sum,row)=>sum+row.bytes,0)])),largest:rows.sort((a,b)=>b.bytes-a.bytes).slice(0,12)};}
try{
 await gotoApp(page,target);await settle();const landing=summarize('anonymous cold landing');
 await fillLoginForm(page,{username:'demo2026001',password:'Student123!'});await submitLoginForm(page);await expect(page.getByTestId('course-adventure-map')).toBeVisible();await settle();
 requests=new Map();await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByTestId('course-adventure-map')).toBeVisible();await settle();const home=summarize('student cold home');
 const report={tag,target,landing,home};writeFileSync(`qa-artifacts/first-load-${tag}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 if(tag==='after'){assert.ok(landing.bytes<1500000,'anonymous landing exceeds 1.5MB');assert.ok(home.bytes<2000000,'student home exceeds 2MB');assert.ok(![...requests.values()].some(row=>/\.(glb|mp4|pptx)(\?|$)/.test(row.url)),'home eagerly loads lab/video resources');}
}finally{await browser.close();}
