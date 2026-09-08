import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Texture } from 'three/src/textures/Texture.js';
import { createHash } from 'node:crypto';
import manifest from '../teachingPcManifest.json' with {type:'json'};
import { validateTeachingGlb, MODEL_NODES, disposeTeachingAsset } from './teachingPcAsset.js';
import { createTeachingMotion } from './teachingAssetRig.js';
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
 assert.ok(result.json.images.some(image=>Number.isInteger(image.bufferView)),'silkscreen texture is embedded');
 assert.ok(result.json.animations.length>=6,'source includes independently named mechanical actions');
 console.log('asset bytes',buffer.byteLength,'triangles',result.triangles);
});
test('actual GLB parses into independently disposable instances with all semantic parts',async()=>{
 // Node does not decode images; real PNG decoding/rendering is covered by production browser QA.
 const loader=new GLTFLoader().register(()=>({name:'node-texture-placeholder',loadTexture:()=>Promise.resolve(new Texture())}));
 const a=await loader.parseAsync(buffer.slice(0),'');const b=await loader.parseAsync(buffer.slice(0),'');
 for(const name of MODEL_NODES)assert.ok(a.scene.getObjectByName(name),name);
 const motion=createTeachingMotion(a.scene,a.animations);
 for(const closed of [false,true]){
  motion.update({installed:closed?{cpu:true,memory:true}:{}},.1,true);
  for(const name of ['cpu_retention_lever','dimm_latch_front','dimm_latch_back']){
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
