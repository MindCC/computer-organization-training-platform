import { CubeTexture } from 'three/src/textures/CubeTexture.js';
import { SRGBColorSpace } from 'three/src/constants.js';

// A tiny local studio environment gives metals reflections without a network HDR dependency.
export function addWorkshopReflections(scene, registry) {
  const faces=Array.from({length:6},(_,index)=>{
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const ctx=canvas.getContext('2d');
    const gradient=ctx.createLinearGradient(0,0,64,64);
    gradient.addColorStop(0,index===2?'#f9fcff':'#c3d3d7');
    gradient.addColorStop(.55,index===3?'#33494c':'#758f99');
    gradient.addColorStop(1,'#243b45');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
    if(index!==3){ctx.fillStyle='#f2f4e9';ctx.fillRect(8,4,12,50);}
    return canvas;
  });
  const env=registry.add(new CubeTexture(faces));env.colorSpace=SRGBColorSpace;env.needsUpdate=true;
  scene.environment=env;scene.environmentIntensity=.65;
}
