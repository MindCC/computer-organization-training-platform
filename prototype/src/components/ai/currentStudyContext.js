import { useEffect, useRef, useSyncExternalStore } from 'react';
let current = null;
const listeners = new Set();
function notify() { for (const listener of listeners) listener(); }
export function useCurrentStudyContext(snapshot) {
 const owner = useRef(Symbol('current-study'));
 const key = JSON.stringify(snapshot);
 useEffect(()=>{
  current = {owner:owner.current,snapshot:JSON.parse(key)}; notify();
  return ()=>{if(current?.owner===owner.current){current=null;notify();}};
 },[key]);
}
export function useStudySnapshot() {
 return useSyncExternalStore(listener=>{listeners.add(listener);return ()=>listeners.delete(listener);},()=>current?.snapshot??null,()=>null);
}
