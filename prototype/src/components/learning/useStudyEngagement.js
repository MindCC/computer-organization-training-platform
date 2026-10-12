import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../apiClient.js';
export function useStudyEngagement(userId,recordVisit=false) {
  const [data,setData]=useState(null),[error,setError]=useState('');const sequence=useRef(0);
  const refresh=useCallback(async()=>{
    if(!userId)return;const seq=++sequence.current;
    try{const result=await apiRequest('/api/student/study-engagement');if(seq===sequence.current){setData(result);setError('');}}
    catch(e){if(seq===sequence.current)setError(e.message);}
  },[userId]);
  useEffect(()=>{
    setData(null);setError('');let timer,visited=null;
    const visit=()=>{
      if(!recordVisit||document.visibilityState!=='visible')return;
      const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
      if(visited===day)return;visited=day;
      apiRequest('/api/student/study-engagement/visit',{method:'POST',body:'{}'}).then(refresh).catch(()=>{visited=null;});
    };
    refresh();visit();
    const changed=()=>{clearTimeout(timer);timer=setTimeout(refresh,200);};
    const visible=()=>{if(document.visibilityState==='visible'){visit();refresh();}};
    const interval=setInterval(visit,60000);
    window.addEventListener('study-evidence-changed',changed);document.addEventListener('visibilitychange',visible);
    return()=>{sequence.current++;clearTimeout(timer);clearInterval(interval);window.removeEventListener('study-evidence-changed',changed);document.removeEventListener('visibilitychange',visible);};
  },[refresh,recordVisit]);
  return {data,error,refresh};
}
