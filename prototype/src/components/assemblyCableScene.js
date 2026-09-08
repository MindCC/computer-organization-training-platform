import { Mesh } from 'three/src/objects/Mesh.js';
import { SphereGeometry } from 'three/src/geometries/SphereGeometry.js';
import { TubeGeometry } from 'three/src/geometries/TubeGeometry.js';
import { CatmullRomCurve3 } from 'three/src/extras/curves/CatmullRomCurve3.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import { Vector2 } from 'three/src/math/Vector2.js';
import { Raycaster } from 'three/src/core/Raycaster.js';
import { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js';
import { MeshStandardMaterial } from 'three/src/materials/MeshStandardMaterial.js';
import { CABLES } from '../completeAssembly.js';

// Endpoints follow the current world matrix of each authored connector.
export function createCableScene(scene, container, camera, registry, onConnector) {
  const layer = document.createElement('div'); layer.className = 'assembly-connector-layer'; container.append(layer);
  const lines=document.createElementNS('http://www.w3.org/2000/svg','svg');lines.setAttribute('class','assembly-connector-leaders');layer.append(lines);
  const ports = CABLES.flatMap(c => [{ id:c.from, label:c.fromLabel, source:true, cable:c }, { id:c.to, label:c.toLabel, source:false, cable:c }]).map(info => {
    const anchor = scene.getObjectByName('port_' + info.id);
    const material = registry.add(new MeshBasicMaterial({ color:'#20bfa4', depthTest:false, transparent:true, opacity:.85 }));
    const marker = new Mesh(registry.add(new SphereGeometry(.016, 10, 8)), material); marker.renderOrder = 8; scene.add(marker);
    const button = document.createElement('button'); button.type='button'; button.dataset.connector=info.id;
    button.setAttribute('aria-label', (info.source?'拿起':'连接到') + info.label); button.textContent=info.label;
    button.onclick=()=>onConnector?.(info.id); layer.append(button);
    const leader=document.createElementNS('http://www.w3.org/2000/svg','line');leader.setAttribute('stroke','#8b977d');leader.setAttribute('stroke-width','1');lines.append(leader);
    return {...info,anchor,marker,button,leader};
  });
  const wires = CABLES.map(c => {
    const material = registry.add(new MeshStandardMaterial({color:['atx','eps'].includes(c.id)?'#35414c':c.id==='fan'?'#b18a47':'#169e90',roughness:.7,transparent:true}));
    const mesh = new Mesh(new TubeGeometry(new CatmullRomCurve3([new Vector3(),new Vector3(0,.01,0)]),16,.008,5,false), material);
    mesh.frustumCulled=false; scene.add(mesh); return {c,mesh,key:''};
  });
  const from=new Vector3(), to=new Vector3(), ndc=new Vector3();
  function available(port,state) {
    const owner=port.anchor?.userData.partId;
    return Boolean(owner && (owner==='cooler'?state.structure?.cooler:owner==='motherboard'||owner==='psu'?state.structure?.[owner]:state.installed?.[owner]));
  }
  const raycaster=new Raycaster(),pointer=new Vector2();
  return { pick(event) {
    const bounds=container.getBoundingClientRect();pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);
    raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(ports.filter(p=>p.marker.visible).map(p=>p.marker))[0];
    const port=ports.find(p=>p.marker===hit?.object);if(port){onConnector?.(port.id);return true;}return false;
  },focus(id) { return ports.find(p=>p.id===id)?.anchor?.getWorldPosition(new Vector3()); }, update(state) {
    if (!state) return;
    scene.updateMatrixWorld(true);
    const mode=state.cableMode && state.structure?.open && !state.powered;
    layer.hidden=!mode;
    const selected=CABLES.find(c=>c.from===state.selectedConnector),connected=state.structure?.cables??{};
    for(const [index,port] of ports.entries()) {
      const shown=mode && available(port,state) && !connected[port.cable.id] && (state.selectedConnector ? !port.source || port.id===state.selectedConnector : port.source);
      port.marker.visible=Boolean(shown); port.button.hidden=!shown;port.leader.style.display=shown?'':'none';
      if(!shown)continue;
      port.anchor.getWorldPosition(port.marker.position); ndc.copy(port.marker.position).project(camera);
      if(ndc.z < -1 || ndc.z > 1){port.marker.visible=false;port.button.hidden=true;port.leader.style.display='none';continue;}
      const x=(ndc.x+1)*container.clientWidth/2, y=(1-ndc.y)*container.clientHeight/2;
      // Stable lanes prevent nearby physical connectors from producing overlapping hit targets.
      const lane=Math.floor(index/2), top=100, bottom=container.clientHeight-40;
      port.button.style.left=(port.source?78:container.clientWidth-78)+'px';
      port.button.style.top=(top+lane*Math.max(32,(bottom-top)/4))+'px';
      port.leader.setAttribute('x1',String(x));port.leader.setAttribute('y1',String(y));port.leader.setAttribute('x2',String(parseFloat(port.button.style.left)));port.leader.setAttribute('y2',String(parseFloat(port.button.style.top)));
      const match=selected?.to===port.id || state.selectedConnector===port.id;
      port.button.dataset.match=match?'true':'false';port.marker.material.color.set(match?'#19d3ac':'#dfaf51');
    }
    for(const wire of wires){
      const a=ports.find(p=>p.id===wire.c.from),b=ports.find(p=>p.id===wire.c.to);
      const preview=mode && selected?.id===wire.c.id && available(a,state) && available(b,state);
      wire.mesh.visible=Boolean(a.anchor && b.anchor && (connected[wire.c.id] || preview));
      if(!wire.mesh.visible)continue;
      wire.mesh.material.opacity=connected[wire.c.id]?1:.35;
      a.anchor.getWorldPosition(from);b.anchor.getWorldPosition(to);
      const key=from.toArray().concat(to.toArray()).map(x=>x.toFixed(4)).join(',');if(key===wire.key)continue;wire.key=key;
      const mid=from.clone().lerp(to,.5);mid.y=Math.max(from.y,to.y)+.09;
      const curve=new CatmullRomCurve3([from.clone(),from.clone().add(new Vector3(0,.06,0)),mid,to.clone().add(new Vector3(0,.055,0)),to.clone()]);
      wire.mesh.geometry.dispose();wire.mesh.geometry=new TubeGeometry(curve,24,.008,5,false);
    }
  },dispose(){layer.remove();for(const p of ports)p.marker.removeFromParent();for(const w of wires){w.mesh.geometry.dispose();w.mesh.removeFromParent();}} };
}
