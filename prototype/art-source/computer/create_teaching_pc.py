"""Original generic teaching PC. Run: blender --background --python this_file.py
Coordinates below use the application's Y-up units; exported GLB is in meters.
No external models, textures, fonts or game assets are used.
"""
import bpy, math, pathlib, sys, argparse
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description='Create a NEW editable teaching model; never overwrite hand-edited sources.')
parser.add_argument('--output',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
source_path=pathlib.Path(args.output).resolve()
if source_path.exists(): raise RuntimeError('Output already exists; choose a new source filename to preserve manual work.')
source_path.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
S=3.1
def xyz(v): return (v[0]/S,-v[2]/S,v[1]/S)
def mat(name,color,metal=.0,rough=.5):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 return m
steel=mat('Powder-coated navy steel',(.09,.15,.19),.25,.58)
silver=mat('Brushed aluminium',(.63,.7,.74),.55,.38)
pcb=mat('Teal FR4',(.012,.09,.059),.08,.7)
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
origin=empty('assembly_origin',(0,0,0));origin['schemaVersion']=2
origin['assetId']='teaching-pc';origin['author']='Original ZCYL teaching asset'
for name,pos in positions.items():
 if name!='case':empty('socket_'+('memory' if name=='ram_0' else name),pos)
def box(parent,name,size,pos,material,bevel=.004):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(pos));o=bpy.context.object;o.name=name
 o.dimensions=(size[0]/S,size[2]/S,size[1]/S);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.data.materials.append(material)
 if bevel:
  m=o.modifiers.new('Manufactured edge','BEVEL');m.width=bevel/S;m.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
 o.parent=groups[parent] if isinstance(parent,str) else parent;return o
def cylinder(parent,name,radius,depth,pos,material):
 bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=radius/S,depth=depth/S,location=xyz(pos))
 o=bpy.context.object;o.name=name;o.data.materials.append(material);o.parent=groups[parent] if isinstance(parent,str) else parent;return o

def child_empty(parent,name,pos):
 o=empty(name,pos);o.parent=groups[parent] if isinstance(parent,str) else parent;return o

def hinge(parent,name,pos,angle):
 o=child_empty(parent,name,pos);o['motion']='hinge';o['openAngle']=angle
 # Blender X corresponds to glTF X. Keep the action in the editable source and GLB.
 o.rotation_mode='XYZ';o.rotation_euler.x=angle;o.keyframe_insert(data_path='rotation_euler',frame=1)
 o.rotation_euler.x=0;o.keyframe_insert(data_path='rotation_euler',frame=25)
 o.animation_data.action.name=name+'_close';o.rotation_euler.x=0
 return o

def rotor(parent,name,pos):
 o=child_empty(parent,name,pos);o['motion']='rotor'
 o.rotation_mode='XYZ';o.keyframe_insert(data_path='rotation_euler',frame=1)
 o.rotation_euler.z=math.tau;o.keyframe_insert(data_path='rotation_euler',frame=49)
 o.animation_data.action.name=name+'_spin';o.rotation_euler.z=0
 return o
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
box('motherboard','CPU keyed socket',(.26,.035,.26),(.05,.035,.15),black)
for x in [-.09,.19]:box('motherboard','Retention bracket',(.018,.045,.29),(x,.04,.15),silver)
lever=hinge('motherboard','cpu_retention_lever',(.19,.045,.005),-1.25)
box(lever,'CPU latch lever',(.018,.018,.31),(0,0,.145),silver)
box(lever,'CPU latch handle',(.06,.018,.018),(-.023,0,.3),silver)
for x in [-.3,-.15]:
 box('motherboard','DIMM slot',(.055,.04,.5),(x,.045,.1),black)
 for index,z in enumerate([-.155,.355]):
  latch=hinge('motherboard','dimm_latch_'+('front' if index==0 else 'back')+('' if x==-.3 else '_spare'),(x,.045,z),(-.85 if index==0 else .85))
  box(latch,'DIMM latch',(.055,.065,.027),(0,.025,0),white)
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
box('cpu','CPU substrate',(.225,.012,.225),(0,0,0),pcb)
box('cpu','Heat spreader',(.205,.033,.205),(0,.025,0),silver)
# A true triangular orientation marker, not a square label.
mesh=bpy.data.meshes.new('CPU orientation triangle');mesh.from_pydata([xyz(v) for v in [(-.096,.043,.096),(-.066,.043,.096),(-.096,.043,.066)]],[],[(0,1,2)])
mark=bpy.data.objects.new('CPU direction triangle',mesh);bpy.context.collection.objects.link(mark);mark.parent=groups['cpu'];mark.data.materials.append(gold)
for i in range(6):box('cpu','Engraved identification',(.11-i*.012,.002,.006),(0,.043,-.05+i*.014),black,0)
box('ram_0','DIMM PCB',(.025,.15,.46),(0,.07,0),pcb)
for z in [-.18,-.09,0,.09,.18]:box('ram_0','Memory IC',(.035,.07,.065),(0,.075,z),black)
for z in [-.22+i*.018 for i in range(25)]:
 if abs(z-.02)>.015:box('ram_0','Keyed DIMM contact',(.028,.025,.01),(0,.003,z),gold,0)
box('gpu','GPU PCB',(.56,.025,.25),(0,0,0),pcb)
box('gpu','Dual fan shroud',(.55,.1,.24),(0,.066,0),steel)
for x in [-.145,.145]:
 fan=rotor('gpu','gpu_fan_'+('left' if x<0 else 'right'),(x,.125,0))
 cylinder(fan,'Fan rotor',.09,.018,(0,0,0),black)
 cylinder(fan,'Fan hub',.026,.022,(0,.012,0),teal)
 for i in range(7):
  a=i*math.tau/7;o=box(fan,'Fan vane',(.075,.014,.018),(math.cos(a)*.045,.015,math.sin(a)*.045),silver,0);o.rotation_euler.z=-a
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
fan=rotor('cooler','cooler_fan_rotor',(0,.205,0))
cylinder(fan,'CPU fan',.14,.026,(0,0,0),black)
cylinder(fan,'CPU fan hub',.04,.03,(0,.015,0),teal)
for i in range(9):
 a=i*math.tau/9;o=box(fan,'Fan blade',(.105,.013,.024),(math.cos(a)*.065,.019,math.sin(a)*.065),silver,0);o.rotation_euler.z=-a

# Semantically named connection anchors follow their owning part, including during installation.
ports=[('psu','psu-atx',(-.1,-.025,.25)),('psu','psu-cpu',(0,-.025,.25)),('psu','psu-sata',(.1,-.025,.25)),
 ('motherboard','board-atx',(-.55,.08,.2)),('motherboard','cpu-power',(.3,.08,.4)),
 ('motherboard','cpu-fan',(.24,.08,.31)),('motherboard','board-sata',(-.5,.08,-.35)),
 ('cooler','cooler-fan',(.13,.19,.05)),('storage','ssd-data',(-.035,.025,-.186)),('storage','ssd-power',(.045,.025,-.186))]
for owner,name,pos in ports:
 o=child_empty(owner,'port_'+name,pos);o['connectorId']=name;o['partId']=owner
 o['outward']=[0,1,0]
 # Separate visible connector housings with inset key detail.
 box(owner,'Keyed '+name,(.046,.028,.022),pos,teal,.002)
 box(owner,'Connector notch '+name,(.014,.012,.025),(pos[0],pos[1]+.014,pos[2]),black,0)

for name in ['cpu','memory','gpu','storage','motherboard','psu','cooler','side_panel']:
 socket=bpy.data.objects.get('socket_'+name);socket['partId']=name;socket['approach']=[0,1,0] if name!='storage' else [0,0,1]
 focus=empty('focus_'+name,(0,0,0));focus.parent=socket;focus['purpose']='inspection'

# Small packed silkscreen atlas: traces, component outlines and readable pin markings.
W=512;pixels=[0.0]*(W*W*4)
def pixel(x,y,c):
 if 0<=x<W and 0<=y<W:
  i=(y*W+x)*4;pixels[i:i+4]=c
def line(x1,y1,x2,y2,c):
 for t in range(max(abs(x2-x1),abs(y2-y1))+1):
  n=max(abs(x2-x1),abs(y2-y1),1);pixel(round(x1+(x2-x1)*t/n),round(y1+(y2-y1)*t/n),c)
for y in range(W):
 for x in range(W): pixel(x,y,(.026,.115,.078,1))
for x in range(30,490,32):
 line(x,30,x,480,(.055,.19,.12,1));line(x,45,x+18,63,(.07,.23,.14,1))
for y in range(24,490,42):
 line(15,y,496,y,(.035,.16,.105,1))
 for x in range(25,480,65):
  for xx in range(x,x+35):pixel(xx,y+4,(.58,.72,.64,1))
  for yy in range(y+4,min(y+18,512)):pixel(x,yy,(.58,.72,.64,1));pixel(x+34,yy,(.58,.72,.64,1))
glyphs={'C':['111','100','100','100','111'],'P':['110','101','110','100','100'],'U':['101','101','101','101','111'],'D':['110','101','101','101','110'],'I':['111','010','010','010','111'],'M':['101','111','111','101','101'],'S':['111','100','111','001','111'],'A':['010','101','111','101','101'],'T':['111','010','010','010','010'],'F':['111','100','110','100','100'],'N':['101','111','111','111','101'],'2':['110','001','010','100','111'],'4':['101','101','111','001','001']}
def label(word,x,y):
 for k,ch in enumerate(word):
  for row,bits in enumerate(glyphs.get(ch,['000']*5)):
   for col,bit in enumerate(bits):
    if bit=='1':
     for dx in range(3):
      for dy in range(3):pixel(x+k*13+col*3+dx,y+(4-row)*3+dy,(.8,.86,.79,1))
label('CPU',280,295);label('DIMM',80,340);label('SATA',20,64);label('FAN',350,385);label('AT24',20,350)
img=bpy.data.images.new('Teaching PCB silkscreen 512',width=W,height=W);img.pixels.foreach_set(pixels);img.pack()
silk=mat('PCB silk and traces',(.04,.13,.09),.05,.7)
nodes=silk.node_tree.nodes;tex=nodes.new('ShaderNodeTexImage');tex.image=img;silk.node_tree.links.new(tex.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
bpy.ops.mesh.primitive_plane_add(size=1,location=xyz((0,.014,0)))
decal=bpy.context.object;decal.name='PCB silkscreen';decal.scale=(1.19/S,.99/S,1);decal.parent=groups['motherboard'];decal.data.materials.append(silk)

# Merge meshes per semantic node to keep browser draw calls bounded.
for group in list(groups.values())+[o for o in bpy.data.objects if o.get('motion')]:
 meshes=[o for o in group.children if o.type=='MESH']
 if not meshes:continue
 bpy.ops.object.select_all(action='DESELECT')
 for o in meshes:o.select_set(True)
 bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join()
 meshes[0].name=group.name+'_mesh'
bpy.context.scene.unit_settings.system='METRIC'
bpy.context.scene['author']='Original ZCYL teaching asset'
bpy.context.scene.frame_set(25)
for o in bpy.data.objects:
 if o.get('motion')=='rotor':o.rotation_euler.z=0
bpy.ops.wm.save_as_mainfile(filepath=str(source_path))
print('TEACHING_PC_SOURCE_CREATED',source_path)
