import { normalizePracticeDocument, mergePracticeHistory } from './assemblyPracticeStorage.js';
import { createRandomId } from './shared/randomId.js';

const empty=()=>({version:1,active:null,history:[]});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function createPracticeTransport(caseId,userId){
  return async(method,body,signal)=>{
    const response=await fetch(`/api/student/assembly-practice/${encodeURIComponent(caseId)}`,{
      method,credentials:'include',signal,headers:{'content-type':'application/json','x-practice-student':String(userId)},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const data=await response.json();
    if(!response.ok)throw Object.assign(new Error(typeof data.error==='string'?data.error:'练习同步失败'),{status:response.status,current:data.current});
    return data;
  };
}

// One serialized outbox per mounted student/order. Persist document + request together.
export function createPracticeSync({storage,key,request,onChange=()=>{},onRestore=()=>{},uuid=()=>createRandomId('practice')}){
  let document=empty(),revision=null,dirty=false,pending=null,conflict=null;
  let stopped=false,busy=null,timer=null,controller=null,localAvailable=true,status='loading',epoch=0;
  try{
    const raw=JSON.parse(storage?.getItem(key)??'null');
    if(raw){
      document=normalizePracticeDocument(raw);
      dirty=Boolean(document.active||document.history.length);
      if(raw.sync&&Number.isSafeInteger(raw.sync.revision)&&raw.sync.revision>=0){
        revision=raw.sync.revision;dirty=raw.sync.dirty!==false;
        const item=raw.sync.pending;
        if(item&&typeof item.operationId==='string'&&Number.isSafeInteger(item.baseRevision)&&item.baseRevision>=0)
          pending={operationId:item.operationId,baseRevision:item.baseRevision,document:normalizePracticeDocument(item.document)};
      }
    }
  }catch{localAvailable=false;}
  function snapshot(){return {status,localAvailable,conflict,document,revision};}
  function notify(){if(!stopped)onChange(snapshot());}
  function persist(){
    try{if(!key||!storage?.setItem)throw new Error('storage unavailable');storage.setItem(key,JSON.stringify({...document,sync:{revision,dirty,pending}}));localAvailable=true;}
    catch{localAvailable=false;}
  }
  function schedule(){if(stopped||conflict)return;clearTimeout(timer);timer=setTimeout(()=>{void flush();},1000);}
  function setConflict(remote){conflict={...remote,document:normalizePracticeDocument(remote.document)};status='conflict';notify();}
  function adopt(remote,restore){
    document=normalizePracticeDocument(remote.document);revision=remote.revision;dirty=false;pending=null;conflict=null;
    persist();if(restore&&!stopped){epoch++;onRestore(document);}status='synced';notify();
  }
  async function call(method,body){
    controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),8000);
    try{return await request(method,body,controller.signal);}finally{clearTimeout(timeout);controller=null;}
  }
  async function reconcile(restore){
    const remote=await call('GET');if(stopped)return;
    if(!Number.isSafeInteger(remote.revision)||remote.revision<0)throw new Error('服务器练习版本无效');
    remote.document=normalizePracticeDocument(remote.document);
    if(!dirty||same(document,remote.document)){adopt(remote,restore);return;}
    if((revision===null&&remote.revision===0)||revision===remote.revision){revision=remote.revision;persist();}
    else setConflict(remote);
  }
  async function perform(initial){
    try{
      status='syncing';notify();
      // Retry the exact pending request before reading a revision: the previous response may have been lost.
      if(!pending&&(initial||revision===null))await reconcile(!initial);
      if(stopped||conflict)return;
      for(let round=0;round<2&&(pending||dirty);round++){
        if(!pending){pending={operationId:uuid(),baseRevision:revision,document};persist();}
        const sent=pending;
        const result=await call('PUT',sent);if(stopped)return;
        if(!Number.isSafeInteger(result.revision)||result.revision<=sent.baseRevision)throw new Error('服务器保存结果无效');
        revision=result.revision;pending=null;dirty=!same(document,sent.document);persist();
        if(result.duplicate)await reconcile(!initial);
        if(stopped||conflict)return;
      }
      status=dirty?'pending':'synced';notify();if(dirty)schedule();
    }catch(error){
      if(stopped)return;
      if(error.status===409&&error.current){setConflict(error.current);return;}
      status=error.status===401||error.status===403?'auth':error.status>=400&&error.status<500?'rejected':'offline';notify();
    }
  }
  function flush(initial=false){
    if(stopped||conflict)return Promise.resolve();
    if(busy)return busy;
    clearTimeout(timer);busy=perform(initial).finally(()=>{busy=null;});return busy;
  }
  function resolve(choice){
    if(!conflict||stopped)return;
    const remote=conflict;
    document={...(choice==='remote'?remote.document:document),history:mergePracticeHistory(document.history,remote.document.history)};
    revision=remote.revision;pending=null;dirty=true;conflict=null;persist();epoch++;onRestore(document);status='pending';notify();schedule();
  }
  function createStorage(){
    const owner=epoch;
    return {
      getItem:()=>JSON.stringify(document),
      setItem(_key,text){
        if(stopped||owner!==epoch)return;
        const next=normalizePracticeDocument(JSON.parse(text));
        if(!same(document,next)){document=next;dirty=true;persist();if(!conflict){status='pending';schedule();}notify();}
        if(!localAvailable)throw new Error('无法保存到本机');
      }
    };
  }
  return {
    start:()=>flush(true),flush,resolve,snapshot,createStorage,
    stop(){stopped=true;clearTimeout(timer);controller?.abort();},
    storage:createStorage()
  };
}
