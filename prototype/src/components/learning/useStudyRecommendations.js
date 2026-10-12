import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../apiClient.js';

export function useStudyRecommendations(userId, sparkOnly = false) {
  const [data,setData]=useState(null),[error,setError]=useState('');
  const sequence=useRef(0);
  const refresh=useCallback(async()=>{
    if(!userId)return;
    const request=++sequence.current;
    try {
      const result=await apiRequest(`/api/student/study-recommendations${sparkOnly?'/spark':''}`);
      if(request===sequence.current){setData(result);setError('');}
    } catch(err){if(request===sequence.current)setError(err.message);}
  },[userId,sparkOnly]);
  useEffect(()=>{
    setData(null);setError('');refresh();let timer;
    const changed=()=>{clearTimeout(timer);timer=setTimeout(refresh,200);};
    const visible=()=>{if(document.visibilityState==='visible')refresh();};
    window.addEventListener('study-evidence-changed',changed);document.addEventListener('visibilitychange',visible);
    return()=>{sequence.current++;clearTimeout(timer);window.removeEventListener('study-evidence-changed',changed);document.removeEventListener('visibilitychange',visible);};
  },[refresh]);
  return {data,error,refresh};
}
