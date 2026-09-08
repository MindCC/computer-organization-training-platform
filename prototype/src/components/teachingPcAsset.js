import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Box3 } from 'three/src/math/Box3.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import manifest from '../teachingPcManifest.json' with { type: 'json' };
import { CONNECTOR_IDS, MOVING_NODES } from './teachingAssetRig.js';
export const MODEL_NODES=['case','side_panel','motherboard','psu','cpu','cooler','ram_0','gpu','storage'];
let bytes;
export function validateTeachingGlb(buffer) {
 const view=new DataView(buffer);
 if(buffer.byteLength>5*1024*1024 || buffer.byteLength<20 || view.getUint32(0,true)!==0x46546c67 || view.getUint32(4,true)!==2 || view.getUint32(8,true)!==buffer.byteLength || view.getUint32(16,true)!==0x4e4f534a) throw new Error('模型格式或大小不符合规范');
 const length=view.getUint32(12,true);
 const json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)).trim());
 if((json.buffers??[]).some(x=>x.uri) || (json.images??[]).some(x=>x.uri))throw new Error('模型不得引用外部资源');
 for(const name of [...MODEL_NODES,'assembly_origin',...MODEL_NODES.filter(n=>n!=='case').map(n=>'socket_'+(n==='ram_0'?'memory':n))])
  if((json.nodes??[]).filter(n=>n.name===name).length!==1)throw new Error('模型节点缺失或重复：'+name);
 if(json.nodes.find(n=>n.name==='assembly_origin')?.extras?.schemaVersion!==2)throw new Error('教学模型版本不受支持');
 for(const name of [...CONNECTOR_IDS.map(id=>'port_'+id),...MOVING_NODES])
  if(json.nodes.filter(n=>n.name===name).length!==1)throw new Error('模型接口或可动节点缺失：'+name);
 const triangles=(json.meshes??[]).flatMap(m=>m.primitives).reduce((sum,p)=>sum+(json.accessors[p.indices??p.attributes.POSITION]?.count??0)/3,0);
 if(triangles>100000)throw new Error('模型面数超过预算');
 return {json,triangles};
}
export function disposeTeachingAsset(asset) {
 if (asset?._disposed) return;
 const resources=asset?._resources ?? new Set();
 asset?.scene?.traverse(n=>{if(n.geometry)resources.add(n.geometry);for(const m of (Array.isArray(n.material)?n.material:[n.material]).filter(Boolean)){resources.add(m);for(const value of Object.values(m))if(value?.isTexture)resources.add(value);}});
 for(const r of resources){r.dispose();r.image?.close?.();}
 if(asset)asset._disposed=true;
}
export async function loadTeachingAsset() {
 if(!bytes) bytes=fetch(import.meta.env.BASE_URL+manifest.url+'?v='+manifest.sha256,{signal:AbortSignal.timeout(10000)})
 .then(r=>{if(!r.ok)throw new Error('模型请求失败 '+r.status);return r.arrayBuffer();})
 .then(async buffer=>{
  validateTeachingGlb(buffer);
  if(buffer.byteLength!==manifest.bytes)throw new Error('模型版本与清单不一致');
  if(globalThis.crypto?.subtle){const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');if(hash!==manifest.sha256)throw new Error('模型校验和不匹配');}
  return buffer;
 }).catch(error=>{bytes=null;throw error;});
 const asset=await new GLTFLoader().parseAsync((await bytes).slice(0),'');
 asset.scene.updateMatrixWorld(true);
 const size=new Box3().setFromObject(asset.scene).getSize(new Vector3());
 if(!size.toArray().every(Number.isFinite) || size.x<.3 || size.x>.6 || size.y<.15 || size.y>.6 || size.z<.15 || size.z>.6){disposeTeachingAsset(asset);throw new Error('模型尺寸不符合教学主机规范');}
 const resources=new Set();
 asset.scene.traverse(n=>{if(n.geometry)resources.add(n.geometry);for(const m of (Array.isArray(n.material)?n.material:[n.material]).filter(Boolean)){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}});
 asset._resources=resources;
 return asset;
}
