import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { validateTeachingGlb, MODEL_NODES, disposeTeachingAsset } from './teachingPcAsset.js';
const data=readFileSync(new URL('../../public/models/teaching-pc.glb',import.meta.url));
const buffer=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
test('real Blender GLB is self-contained, named and under triangle/file budgets',()=>{
 const result=validateTeachingGlb(buffer);
 assert.ok(result.triangles>1000);
 assert.ok(result.triangles<100000);
 assert.equal(result.json.asset.version,'2.0');
 console.log('asset bytes',buffer.byteLength,'triangles',result.triangles);
});
test('actual GLB parses into independently disposable instances with all semantic parts',async()=>{
 const loader=new GLTFLoader();
 const a=await loader.parseAsync(buffer.slice(0),'');const b=await loader.parseAsync(buffer.slice(0),'');
 for(const name of MODEL_NODES)assert.ok(a.scene.getObjectByName(name),name);
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
