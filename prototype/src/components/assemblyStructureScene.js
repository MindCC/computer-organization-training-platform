import { Mesh } from 'three/src/objects/Mesh.js';
import { TubeGeometry } from 'three/src/geometries/TubeGeometry.js';
import { CatmullRomCurve3 } from 'three/src/extras/curves/CatmullRomCurve3.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import { MeshStandardMaterial } from 'three/src/materials/MeshStandardMaterial.js';
import { BoxGeometry } from 'three/src/geometries/BoxGeometry.js';
import { Group } from 'three/src/objects/Group.js';
import { attachTeachingPart, readSocketPose } from './teachingAssetRig.js';
export function createStructureScene(scene,partGroups,asset,registry) {
 const extras=new Map();
 for(const name of ['side_panel','cooler']){
  let node=asset?.scene.getObjectByName(name);
  if(node){const group=new Group();const pose=readSocketPose(asset.scene.getObjectByName('socket_'+name));attachTeachingPart(node,group,pose);group.userData.pose=pose;node.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});node=group;}
  else {
   node=new Mesh(registry.add(new BoxGeometry(...(name==='cooler'?[.3,.22,.28]:[1.37,.022,1.14]))),
    registry.add(new MeshStandardMaterial({color:name==='cooler'?'#abbfc7':'#385568',metalness:.35,roughness:.5})));
   node.position.set(...(name==='cooler'?[.05,.27,.15]:[0,.44,0]));
  }
  scene.add(node);extras.set(name,node);
 }
 const closedPanelPosition=extras.get("side_panel").position.clone();
 const cooler=extras.get('cooler'),coolerPosition=cooler.position.clone();
 let coolerInstalled=false;
 const paths={
  atx:[[-.45,-.08,.22],[-.63,-.02,.38],[-.55,.1,.2]],
  eps:[[-.45,-.08,.22],[.42,-.02,.47],[.3,.1,.4]],
  fan:[[.05,.39,.15],[.25,.3,.27],[.24,.1,.31]],
  sata:[[-.45,.14,-.32],[-.58,.15,-.41],[-.5,.1,-.35]],
  'sata-power':[[-.45,-.08,.22],[-.64,-.06,-.2],[-.43,.14,-.32]]
 };
 const wires=Object.entries(asset?{}:paths).map(([id,points],index)=>{
 const mesh=new Mesh(registry.add(new TubeGeometry(new CatmullRomCurve3(points.map(p=>new Vector3(...p))),20,.009,5,false)),
 registry.add(new MeshStandardMaterial({color:index<2?'#394653':index===2?'#c39237':'#229f91',roughness:.65})));
 scene.add(mesh);return {id,mesh};
 });
 return {update(state,reducedMotion){
  const s=state?.structure;
  if(!s)return;
  const panel=extras.get('side_panel');
  const target=s.open?new Vector3(1.12,-.4,-.1):closedPanelPosition;
  panel.position.lerp(target,reducedMotion?1:.15);
  if(s.cooler && !coolerInstalled && !reducedMotion)cooler.position.copy(coolerPosition).addScaledVector(cooler.userData.pose?.approach??new Vector3(0,1,0),.3);
  coolerInstalled=Boolean(s.cooler);cooler.visible=coolerInstalled;
  cooler.position.lerp(coolerPosition,reducedMotion?1:.15);
  partGroups.get('motherboard').group.visible=Boolean(s.motherboard);
  const psu=partGroups.get('psu').group;
  psu.position.fromArray(s.psu?partGroups.get('psu').part.basePos:[1.1,-.24,.55]);
  for(const {id,mesh} of wires)mesh.visible=Boolean(s.cables[id]);
 },dispose(){for(const n of extras.values())n.removeFromParent();for(const w of wires)w.mesh.removeFromParent();}};
}
