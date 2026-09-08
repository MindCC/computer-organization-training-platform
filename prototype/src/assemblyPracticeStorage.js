import { assemblyDraftKey } from './assemblyDraft.js';
import { HARDWARE_PARTS } from './hardwareGame.js';
import { reconcileInstallation } from './hardwareAssembly.js';
import { reconcileStructure } from './completeAssembly.js';
import { PRACTICE_FAULTS, practiceReview } from './assemblyPractice.js';

const modes=['guided','independent','fault'];
const finiteTime=value=>Number.isFinite(value)&&value>=0;
const validId=value=>typeof value==='string'&&value.length>0&&value.length<=100;
const selection=value=>value&&Object.keys(HARDWARE_PARTS).every(key=>HARDWARE_PARTS[key].some(part=>part.id===value[key]))
  ? Object.fromEntries(Object.keys(HARDWARE_PARTS).map(key=>[key,value[key]])):null;
const faultValid=value=>PRACTICE_FAULTS.some(f=>f.id===value);

export function practiceStorageKey(userId,caseId){
  return assemblyDraftKey(userId,caseId)?.replace('zcyl:assembly-draft:v1:','zcyl:assembly-practice:v1:')??null;
}

function eventsFrom(raw){
  if(!Array.isArray(raw)||raw.length>5000)return null;
  return raw.filter(e=>e&&['action','hint'].includes(e.type)&&finiteTime(e.at)&&(e.type==='hint'||typeof e.ok==='boolean'))
    .map(e=>({type:e.type,...(e.type==='action'?{ok:e.ok}:{}),at:e.at,message:String(e.message??'').slice(0,500)}));
}

function activeFrom(raw){
  if(!raw||!validId(raw.id)||!modes.includes(raw.mode)||!faultValid(raw.fault)||!finiteTime(raw.elapsedMs))return null;
  const parts=selection(raw.parts),events=eventsFrom(raw.events);
  if(!parts||!events)return null;
  const installed=reconcileInstallation(raw.installed??{},parts);
  return {id:raw.id,mode:raw.mode,fault:raw.fault,parts,installed,structure:reconcileStructure(raw.structure,installed,parts),
    category:Object.keys(HARDWARE_PARTS).includes(raw.category)?raw.category:'cpu',elapsedMs:raw.elapsedMs,events};
}

function historyFrom(raw){
  if(!Array.isArray(raw))return [];
  const seen=new Set();
  return raw.filter(r=>r&&validId(r.id)&&modes.includes(r.mode)&&faultValid(r.fault)&&finiteTime(r.completedAt)&&finiteTime(r.seconds)
    &&Number.isSafeInteger(r.errorCount)&&r.errorCount>=0&&Number.isSafeInteger(r.hints)&&r.hints>=0)
    .filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;})
    .map(r=>({id:r.id,mode:r.mode,fault:r.fault,completedAt:r.completedAt,seconds:Math.round(r.seconds),errorCount:r.errorCount,hints:r.hints,
      score:Math.max(0,100-r.errorCount*5-r.hints*3),errors:Array.isArray(r.errors)?r.errors.slice(-20).map(e=>String(e).slice(0,500)):[]}))
    .sort((a,b)=>b.completedAt-a.completedAt).slice(0,20);
}

export function readPracticeStore(storage,key){
  const empty={active:null,history:[],available:Boolean(storage&&key),corrupt:false};
  if(!key||!storage?.getItem)return {...empty,available:false};
  try{
    const text=storage.getItem(key);if(!text)return empty;
    if(text.length>3*1024*1024)return {...empty,corrupt:true};
    const data=JSON.parse(text);
    if(data?.version!==1)return {...empty,corrupt:true};
    const active=activeFrom(data.active);
    return {...empty,active,history:historyFrom(data.history),corrupt:Boolean(data.active&&!active)};
  }catch{return {...empty,available:false,corrupt:true};}
}

export function resumePractice(active,now=Date.now()){
  const valid=activeFrom(active);if(!valid)return null;
  const {elapsedMs,events,...state}=valid;
  return {...state,session:{startedAt:now-elapsedMs,events},restored:true};
}

export function savePracticeProgress(storage,key,run,now=Date.now()){
  const old=readPracticeStore(storage,key);
  if(!key||!storage?.setItem||!finiteTime(run?.session?.startedAt)||!finiteTime(now))return {ok:false,history:old.history};
  const active=activeFrom({...run,events:run.session.events,elapsedMs:Math.max(0,(run.session.completedAt??now)-run.session.startedAt)});
  if(!active)return {ok:false,history:old.history};
  let history=old.history;
  if(run.session.completedAt){
    const report=practiceReview(run.session);
    const record={id:run.id,mode:run.mode,fault:run.fault,completedAt:run.session.completedAt,seconds:report.seconds,errorCount:report.errorCount,hints:report.hints,errors:report.errors.slice(-20).map(e=>e.message)};
    history=historyFrom([record,...history.filter(item=>item.id!==run.id)]);
  }
  try{
    storage.setItem(key,JSON.stringify({version:1,active:run.session.completedAt?null:active,history}));
    return {ok:true,history};
  }catch{return {ok:false,history:old.history};}
}
