// Monotonic, client-observed activity. Neither duration nor inactivity is evidence of intent.
export function createQuestionActivityClock(now=()=>performance.now()) {
  let active=0,first=null,changes=0,visible=false,last=now(),interaction=last;
  function tick() {const at=now();if(visible)active+=Math.max(0,Math.min(at,interaction+300000)-last);last=at;}
  return {
    visibility(value){tick();visible=Boolean(value);},
    activity(){tick();interaction=now();},
    answer(){tick();interaction=now();if(first===null)first=Math.round(active);changes++;},
    snapshot(){tick();return {visibleActiveMs:Math.min(86400000,Math.round(active)),firstAnswerMs:first,inputChanges:Math.min(changes,100000)};},
    reset(){active=0;first=null;changes=0;last=now();interaction=last;}
  };
}
