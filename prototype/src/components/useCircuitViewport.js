import { useEffect, useRef } from 'react';

// Refit only when the drawing area changes size, preserving manual pan/zoom otherwise.
export function useCircuitViewport(fitView) {
  const canvasRef=useRef(null),fitRef=useRef(fitView);
  fitRef.current=fitView;
  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas||typeof ResizeObserver==='undefined')return;
    let frame;
    const observer=new ResizeObserver(entries=>{
      if(!entries[0].contentRect.width||!entries[0].contentRect.height)return;
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>fitRef.current?.({padding:.2,maxZoom:1.3,duration:0}));
    });
    observer.observe(canvas);
    return ()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[]);
  return canvasRef;
}
