"""Export the CURRENT edited .blend without regenerating or saving over it.
blender --background art-source/computer/teaching-pc-v2.blend --python art-source/computer/export_teaching_pc.py
"""
import bpy, pathlib, json, hashlib, struct
ROOT=pathlib.Path(__file__).resolve().parents[2]
parts=['case','side_panel','motherboard','psu','cpu','cooler','ram_0','gpu','storage']
ports=['psu-atx','psu-cpu','psu-sata','board-atx','cpu-power','cpu-fan','board-sata','cooler-fan','ssd-data','ssd-power']
required=parts+['assembly_origin']+['socket_'+('memory' if n=='ram_0' else n) for n in parts if n!='case']+['port_'+n for n in ports]+['cpu_retention_lever','dimm_latch_front','dimm_latch_back','cooler_fan_rotor','gpu_fan_left','gpu_fan_right']
for name in required:
 if not bpy.data.objects.get(name):raise RuntimeError('Missing required node: '+name)
if bpy.data.objects['assembly_origin'].get('schemaVersion')!=2:raise RuntimeError('Expected asset schema 2')
out=ROOT/'public/models/teaching-pc.glb';out.parent.mkdir(parents=True,exist_ok=True)
candidate=out.with_name('teaching-pc.exporting.glb')
bpy.ops.export_scene.gltf(filepath=str(candidate),export_format='GLB',export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=True)
data=candidate.read_bytes();j=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
triangles=sum(j['accessors'][p.get('indices',p['attributes']['POSITION'])]['count']//3 for m in j['meshes'] for p in m['primitives'])
if len(data)>5*1024*1024 or triangles>100000:raise RuntimeError('Asset exceeds 5 MiB / 100k triangle budget')
if any(x.get('uri') for x in j.get('images',[])+j.get('buffers',[])):raise RuntimeError('External resources are not permitted')
manifest={'schemaVersion':2,'url':'models/teaching-pc.glb','sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'triangles':triangles}
candidate.replace(out)
(ROOT/'src/teachingPcManifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('TEACHING_PC_EXPORT',json.dumps(manifest))
