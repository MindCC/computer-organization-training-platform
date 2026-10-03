import test from 'node:test';
import assert from 'node:assert/strict';
import { customCustomerKey,readCustomCustomer,saveCustomCustomer } from './customCustomerState.js';
test('custom recovery is isolated and cannot restore AI authority, boot, grade or receipt',()=>{
  assert.notEqual(customCustomerKey(1),customCustomerKey(2));assert.equal(customCustomerKey(null),null);
  const storage={value:null,getItem(){return this.value;},setItem(_key,value){this.value=value;}};
  const data={form:{profile:{name:'阿禾',occupation:'学生',personality:'耐心'},requirements:'网课',budget:2200},orderId:'12345678-1234-1234-1234-123456789abc',accepted:true,nodeId:'a',portrait:null,ready:true,receipt:{passed:true},targets:{budget:1}};
  assert.equal(saveCustomCustomer(storage,'key',data),true);const recovered=readCustomCustomer(storage,'key');
  assert.equal(recovered.accepted,true);assert.equal(recovered.ready,undefined);assert.equal(recovered.receipt,undefined);assert.equal(recovered.targets,undefined);
  storage.value='bad json';assert.equal(readCustomCustomer(storage,'key').orderId,null);
  storage.value=JSON.stringify({...data,portrait:'data:image/svg+xml;base64,aGVsbG8='});assert.equal(readCustomCustomer(storage,'key').portrait,null);
});
