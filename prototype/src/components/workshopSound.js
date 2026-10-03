/** Optional short feedback tones, created only by the sound toggle's user gesture. */
export function createWorkshopSound() {
  let context;
  return {
    async enable() {
      try {const Audio=window.AudioContext??window.webkitAudioContext;if(!Audio)return false;
        context??=new Audio();await context.resume();return context.state==='running';
      }catch{return false;}
    },
    play(kind) {
      if(context?.state!=='running')return;
      try {
        const frequencies=kind==='error'?[180]:kind==='power'?[330,440]:kind==='ready'?[523,659,784]:[720];
        frequencies.forEach((frequency,index)=>{
          const oscillator=context.createOscillator(),gain=context.createGain(),start=context.currentTime+index*.09;
          oscillator.type=kind==='error'?'triangle':'sine';oscillator.frequency.value=frequency;
          gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.045,start+.008);gain.gain.exponentialRampToValueAtTime(.0001,start+.12);
          oscillator.connect(gain);gain.connect(context.destination);oscillator.start(start);oscillator.stop(start+.14);
          oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
        });
      }catch{/* Audio availability never blocks assembly. */}
    },
    dispose(){const current=context;context=null;void current?.close().catch(()=>{});},
  };
}
