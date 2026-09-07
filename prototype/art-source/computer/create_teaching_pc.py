"""Original generic teaching PC. Run: blender --background --python this_file.py
Coordinates below use the application's Y-up units; exported GLB is in meters.
No external models, textures, fonts or game assets are used.
"""
import bpy, math, pathlib
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'public/models'; OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
S=3.1
def xyz(v): return (v[0]/S,-v[2]/S,v[1]/S)
def mat(name,color,metal=.0,rough=.5):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 return m
steel=mat('Powder-coated navy steel',(.15,.23,.29),.35)
silver=mat('Brushed aluminium',(.63,.7,.74),.55,.38)
pcb=mat('Teal FR4',(.025,.22,.16),.08)
black=mat('Graphite polymer',(.035,.045,.052))
gold=mat('Gold contact',(.78,.52,.12),.7,.3)
white=mat('Ceramic label',(.85,.9,.87))
teal=mat('Teal connector',(.02,.55,.43))
mats=[steel,silver,pcb,black,gold,white,teal]
groups={}
def empty(name,pos):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=xyz(pos);return o
positions={'case':(0,0,0),'side_panel':(0,.44,0),'motherboard':(0,.05,0),'psu':(-.45,-.08,0),
 'cpu':(.05,.12,.15),'cooler':(.05,.18,.15),'ram_0':(-.3,.12,.1),'gpu':(.25,.12,-.15),'storage':(-.45,.12,-.15)}
for name,pos in positions.items():groups[name]=empty(name,pos)
empty('assembly_origin',(0,0,0))
for name,pos in positions.items():
 if name!='case':empty('socket_'+('memory' if name=='ram_0' else name),pos)
def box(parent,name,size,pos,material,bevel=.004):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(pos));o=bpy.context.object;o.name=name
 o.dimensions=(size[0]/S,size[2]/S,size[1]/S);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.data.materials.append(material)
 if bevel:
  m=o.modifiers.new('Manufactured edge','BEVEL');m.width=bevel/S;m.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
 o.parent=groups[parent];return o
def cylinder(parent,name,radius,depth,pos,material):
 bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=radius/S,depth=depth/S,location=xyz(pos))
 o=bpy.context.object;o.name=name;o.data.materials.append(material);o.parent=groups[parent];return o
# Local coordinates are deliberate: parents provide installation reference positions.
for x in [-.69,.69]:
 for z in [-.58,.58]:box('case','Chassis pillar',(.025,.88,.025),(x,0,z),steel)
for y in [-.43,.43]:
 for z in [-.58,.58]:box('case','Folded horizontal rail',(1.4,.03,.035),(0,y,z),silver)
 for x in [-.69,.69]:box('case','Side rail',(.035,.03,1.16),(x,y,0),steel)
box('case','Motherboard tray',(1.35,.022,1.12),(0,-.04,0),steel)
box('case','Front fascia',(.035,.84,1.12),(.69,0,0),steel)
for z in [i*.06-.48 for i in range(17)]:box('case','Front ventilation',(.01,.38,.013),(.715,.04,z),black,0)
box('side_panel','Removable service panel',(1.37,.022,1.14),(0,0,0),steel)
for x in [-.62,.62]:
 for z in [-.5,.5]:cylinder('side_panel','Captive fastener',.018,.03,(x,.02,z),silver)
box('motherboard','PCB',(1.2,.025,1),(0,0,0),pcb)
for x in [-.54,.54]:
 for z in [-.43,.43]:cylinder('motherboard','Standoff',.025,.035,(x,.012,z),gold)
box('motherboard','CPU keyed socket',(.31,.035,.31),(.05,.035,.15),black)
for x in [-.12,.22]:box('motherboard','Retention bracket',(.018,.045,.35),(x,.04,.15),silver)
for x in [-.3,-.15]:
 box('motherboard','DIMM slot',(.055,.04,.5),(x,.045,.1),black)
 for z in [-.155,.355]:box('motherboard','DIMM latch',(.07,.06,.025),(x,.045,z),white)
box('motherboard','PCIe slot',(.45,.035,.055),(.25,.045,-.15),black)
for x in [.37,.43,.49]:box('motherboard','VRM heat spreader',(.035,.1,.35),(x,.06,.23),silver)
for i in range(12):
 cylinder('motherboard','Capacitor',.017,.05,(-.52+i*.075,.04,-.37),silver)
for i in range(16):
 box('motherboard','Copper signal route',(.006,.002,.11),(-.5+i*.06,.014,-.27),gold,0)
box('motherboard','Chipset',(.2,.035,.16),(.02,.036,-.28),black)
box('motherboard','Rear IO shield',(.13,.12,.5),(.53,.075,-.08),silver)
for z in [-.25,-.13,0,.12]:box('motherboard','USB port',(.035,.065,.065),(.60,.08,z),black)
for name,pos in [('ATX',(-.55,.05,.2)),('CPU_PWR',(.3,.05,.4)),('SATA',(-.5,.05,-.35)),('CPU_FAN',(.24,.05,.31))]:box('motherboard',name,(.065,.045,.065),pos,teal)
box('cpu','CPU substrate',(.275,.012,.275),(0,0,0),pcb)
box('cpu','Heat spreader',(.245,.033,.245),(0,.025,0),silver)
box('cpu','Direction marker',(.025,.002,.025),(-.112,.043,.112),gold,0)
for i in range(6):box('cpu','Engraved identification',(.11-i*.012,.002,.006),(0,.043,-.05+i*.014),black,0)
box('ram_0','DIMM PCB',(.025,.15,.46),(0,.07,0),pcb)
for z in [-.18,-.09,0,.09,.18]:box('ram_0','Memory IC',(.035,.07,.065),(0,.075,z),black)
for z in [-.22+i*.018 for i in range(25)]:
 if abs(z-.02)>.015:box('ram_0','Keyed DIMM contact',(.028,.025,.01),(0,.003,z),gold,0)
box('gpu','GPU PCB',(.56,.025,.25),(0,0,0),pcb)
box('gpu','Dual fan shroud',(.55,.1,.24),(0,.066,0),steel)
for x in [-.145,.145]:
 cylinder('gpu','Fan rotor',.09,.018,(x,.125,0),black)
 cylinder('gpu','Fan hub',.026,.022,(x,.137,0),teal)
 for i in range(7):
  a=i*math.tau/7;o=box('gpu','Fan vane',(.075,.014,.018),(x+math.cos(a)*.045,.14,math.sin(a)*.045),silver,0);o.rotation_euler.z=-a
box('gpu','PCIe gold edge',(.38,.026,.017),(0,-.014,-.1),gold)
box('gpu','IO bracket',(.02,.17,.27),(.29,.06,0),silver)
box('storage','SSD enclosure',(.18,.065,.32),(0,.028,0),silver)
box('storage','SSD label',(.145,.003,.22),(0,.063,0),white)
for i in range(6):box('storage','SSD label print',(.09-i*.008,.002,.007),(0,.066,-.06+i*.023),black,0)
box('storage','SATA connectors',(.135,.025,.026),(0,.02,-.171),black)
box('psu','Power supply enclosure',(.33,.26,.43),(0,0,0),steel)
cylinder('psu','PSU fan guard',.125,.012,(0,.139,0),black)
for i in range(9):box('psu','Vent grille',(.27,.008,.012),(0,.15,-.11+i*.027),silver,0)
box('psu','Modular connector block',(.28,.13,.015),(0,-.03,.225),black)
for x in [-.1,0,.1]:box('psu','Power socket',(.065,.055,.022),(x,-.025,.235),teal)
box('cooler','Copper cold plate',(.23,.023,.23),(0,0,0),gold)
for i in range(12):box('cooler','Aluminium cooling fin',(.3,.006,.28),(0,.035+i*.013,0),silver,.001)
cylinder('cooler','CPU fan',.14,.026,(0,.205,0),black)
cylinder('cooler','CPU fan hub',.04,.03,(0,.22,0),teal)
for i in range(9):
 a=i*math.tau/9;o=box('cooler','Fan blade',(.105,.013,.024),(math.cos(a)*.065,.224,math.sin(a)*.065),silver,0);o.rotation_euler.z=-a
# Merge meshes per semantic node to keep browser draw calls bounded.
for group in groups.values():
 meshes=[o for o in group.children if o.type=='MESH']
 bpy.ops.object.select_all(action='DESELECT')
 for o in meshes:o.select_set(True)
 bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join()
 meshes[0].name=group.name+'_mesh'
bpy.context.scene.unit_settings.system='METRIC'
bpy.context.scene['author']='Original ZCYL teaching asset'
bpy.ops.wm.save_as_mainfile(filepath=str(pathlib.Path(__file__).with_name('teaching-pc.blend')))
bpy.ops.export_scene.gltf(filepath=str(OUT/'teaching-pc.glb'),export_format='GLB',export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
print('TEACHING_PC_EXPORTED',OUT/'teaching-pc.glb')
