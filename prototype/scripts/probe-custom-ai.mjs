// Sends only fictional QA customer inputs and the public catalog. Never prints credentials.
import { writeFile,mkdir } from 'node:fs/promises';
import { generateCustomerStory } from '../server/customCustomer.js';
import { requestChatCompletion } from '../server/aiClient.js';
const input={profile:{name:'阿禾',occupation:'社区志愿者',personality:'温和、仔细'},requirements:'做文档、表格、网课，资料约200GB，明确至少8GB内存、256GB空间，要SSD，不玩游戏、不做视频剪辑，集成显卡即可。',budget:2200};
await mkdir('qa-artifacts',{recursive:true});
try{
  const result=await generateCustomerStory(input,{aiRequester:async(config,messages)=>{const content=await requestChatCompletion(config,messages);await writeFile('qa-artifacts/custom-ai-raw.txt',content);return content;}});
  await writeFile('qa-artifacts/custom-ai-probe.json',JSON.stringify(result,null,2));console.log(JSON.stringify({source:result.source,nodes:result.nodes.length,targets:result.targets}));
}catch(e){console.log(JSON.stringify({code:e.code,message:e.message}));process.exitCode=1;}
