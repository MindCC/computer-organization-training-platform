import { useEffect, useRef } from 'react';
import { createQuestionActivityClock } from '../../questionActivityClock.js';

export function useQuestionObservation(questionId, clocks, enabled=true) {
  const element=useRef(null),clock=useRef(null);
  if(!clock.current)clock.current=clocks?.get(questionId)??createQuestionActivityClock();
  if(clocks)clocks.set(questionId,clock.current);
  useEffect(()=>{
    let onscreen=false;
    const update=()=>clock.current.visibility(enabled&&onscreen&&document.visibilityState==='visible');
    const observer=new IntersectionObserver(entries=>{onscreen=entries[0]?.isIntersecting??false;update();},{threshold:0.1});
    if(element.current)observer.observe(element.current);
    const activity=()=>{if(enabled&&onscreen&&document.visibilityState==='visible')clock.current.activity();};
    document.addEventListener('visibilitychange',update);
    for(const name of ['pointerdown','keydown','wheel'])document.addEventListener(name,activity,{passive:true});
    return()=>{clock.current.visibility(false);observer.disconnect();document.removeEventListener('visibilitychange',update);for(const name of ['pointerdown','keydown','wheel'])document.removeEventListener(name,activity);};
  },[enabled,questionId]);
  return {ref:element,answer:()=>clock.current.answer()};
}
