const defaults=()=>({profile:{name:'阿禾',occupation:'',personality:'随和，喜欢听清楚方案的取舍'},requirements:'',budget:2200});
export const defaultCustomerForm=defaults;
export function customCustomerKey(userId){return userId?`zcyl:custom-customer:v1:${encodeURIComponent(userId)}`:null;}
export function readCustomCustomer(storage,key){
  try{
    const value=JSON.parse(storage?.getItem(key)??'null'),form=defaults();
    if(!value)return {form,orderId:null,accepted:false,nodeId:null,portrait:null};
    for(const [name,max] of [['name',24],['occupation',40],['personality',80]])if(typeof value.form?.profile?.[name]==='string')form.profile[name]=value.form.profile[name].slice(0,max);
    if(typeof value.form?.requirements==='string')form.requirements=value.form.requirements.slice(0,2000);
    if(Number.isSafeInteger(value.form?.budget)&&value.form.budget>=100&&value.form.budget<=100000)form.budget=value.form.budget;
    const orderId=typeof value.orderId==='string'&&/^[a-f0-9-]{36}$/.test(value.orderId)?value.orderId:null;
    const portrait=typeof value.portrait==='string'&&value.portrait.length<2800000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value.portrait)?value.portrait:null;
    return {form,orderId,accepted:Boolean(orderId&&value.accepted===true),nodeId:typeof value.nodeId==='string'?value.nodeId:null,portrait};
  }catch{return {form:defaults(),orderId:null,accepted:false,nodeId:null,portrait:null};}
}
export function saveCustomCustomer(storage,key,{form,orderId,accepted,nodeId,portrait}){
  try{if(!storage||!key)return false;storage.setItem(key,JSON.stringify({version:1,form,orderId,accepted,nodeId,portrait}));return true;}catch{return false;}
}
