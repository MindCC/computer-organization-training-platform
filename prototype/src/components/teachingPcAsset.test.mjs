import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Texture } from 'three/src/textures/Texture.js';
import { createHash } from 'node:crypto';
import manifest from '../teachingPcManifest.json' with {type:'json'};
import { validateTeachingGlb, validateTeachingSceneBounds, MODEL_NODES, disposeTeachingAsset } from './teachingPcAsset.js';
import { createTeachingMotion, setTeachingStorageVariant } from './teachingAssetRig.js';
import { Quaternion } from 'three/src/math/Quaternion.js';
const data=readFileSync(new URL('../../public/models/teaching-pc.glb',import.meta.url));
const buffer=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
test('real Blender GLB is self-contained, named and under triangle/file budgets',()=>{
 const result=validateTeachingGlb(buffer);
 assert.ok(result.triangles>1000);
 assert.ok(result.triangles<100000);
 assert.equal(result.json.asset.version,'2.0');
 assert.equal(manifest.sha256,createHash('sha256').update(data).digest('hex'));
 assert.equal(manifest.bytes,data.length);
 assert.ok((result.json.images ?? []).every(image=>Number.isInteger(image.bufferView)),'any textures must be embedded');
 assert.equal(result.json.nodes.find(node=>node.name==='assembly_origin').extras.visualRevision,'gitee-reference-2026-10-02');
 assert.ok(result.json.animations.length>=6,'source includes independently named mechanical actions');
 console.log('asset bytes',buffer.byteLength,'triangles',result.triangles);
});
test('actual GLB parses into independently disposable instances with all semantic parts',async()=>{
 // Node does not decode images; real PNG decoding/rendering is covered by production browser QA.
 const loader=new GLTFLoader().register(()=>({name:'node-texture-placeholder',loadTexture:()=>Promise.resolve(new Texture())}));
 const a=await loader.parseAsync(buffer.slice(0),'');const b=await loader.parseAsync(buffer.slice(0),'');
 assert.doesNotThrow(()=>validateTeachingSceneBounds(a.scene),'desktop peripherals do not enlarge the PC size check');
 const testCase=b.scene.getObjectByName('case');
 testCase.scale.multiplyScalar(10);
 assert.throws(()=>validateTeachingSceneBounds(b.scene),/模型尺寸/,'oversized PC geometry is still rejected');
 testCase.scale.multiplyScalar(.1);
 for(const name of MODEL_NODES)assert.ok(a.scene.getObjectByName(name),name);
 const ram0=a.scene.getObjectByName('ram_0'),ram1=a.scene.getObjectByName('ram_1');
 for(const ram of [ram0,ram1]){
  let vertices=0;
  ram.traverse(node=>{if(node.isMesh)vertices+=node.geometry.attributes.position.count;});
  assert.ok(vertices>100,'each DIMM has actual populated geometry');
 }
 assert.ok(Math.abs((ram1.position.x-ram0.position.x)*3.1-.15)<1e-6,'DIMMs occupy separate motherboard slots');
 const secondSocket=a.scene.getObjectByName('socket_memory_1');
 assert.ok(ram1.position.distanceTo(secondSocket.position)<1e-6,'second DIMM aligns with its installation anchor');
 for(const name of ['monitor','keyboard','mouse'])assert.ok(a.scene.getObjectByName(name)?.children.length,name+' has modeled geometry');
 const storage=a.scene.getObjectByName('storage');
 const dataPort=storage.getObjectByName('port_ssd-data');
 const portPosition=dataPort.position.clone();
 for(const [id,variant] of [['hdd-1tb','hdd'],['ssd-512','ssd'],['ssd-1tb','ssd']]){
  assert.equal(setTeachingStorageVariant(storage,id),variant);
  assert.equal(storage.getObjectByName('storage_ssd').visible,variant==='ssd');
  assert.equal(storage.getObjectByName('storage_hdd').visible,variant==='hdd');
  assert.ok(dataPort.position.equals(portPosition),'storage appearance preserves the cable anchor');
 }
 const motion=createTeachingMotion(a.scene,a.animations);
 for(const closed of [false,true]){
  motion.update({installed:closed?{cpu:true,memory:true}:{}},.1,true);
  for(const name of ['cpu_retention_lever','dimm_latch_front','dimm_latch_back','dimm_latch_front_spare','dimm_latch_back_spare']){
   const track=a.animations.find(clip=>clip.name===name+'_close').tracks.find(t=>t.name===name+'.quaternion');
   const expected=new Quaternion().fromArray(track.values,closed?track.values.length-4:0);
   assert.ok(a.scene.getObjectByName(name).quaternion.angleTo(expected)<1e-3,'joint follows authored '+(closed?'closed':'open')+' pose');
  }
 }
 const am=a.scene.getObjectByName('cpu'),bm=b.scene.getObjectByName('cpu');
 am.position.x=999;assert.notEqual(bm.position.x,999);
 const resources=new Set();a.scene.traverse(n=>{if(n.geometry)resources.add(n.geometry);});
 a._resources=resources;am.removeFromParent();
 const geometryCount=resources.size;
 let disposed=0;for(const r of resources)r.addEventListener('dispose',()=>disposed++);
 disposeTeachingAsset(a);disposeTeachingAsset(a);
 assert.equal(disposed,geometryCount);
 disposeTeachingAsset(b);
});
test('invalid and oversized GLBs are rejected before parsing',()=>{
 assert.throws(()=>validateTeachingGlb(new ArrayBuffer(30)));
 assert.throws(()=>validateTeachingGlb(new ArrayBuffer(5*1024*1024+1)));
});
