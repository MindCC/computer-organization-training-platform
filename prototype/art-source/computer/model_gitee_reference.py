"""Remodel the teaching rig using the user's Gitee three-view reference sheets.

Load teaching-pc-v2.blend before running. All assembly anchors and animation
objects stay intact. Dimensions are fitted to the existing teaching sockets;
these are visual teaching models, not manufacturing CAD or photogrammetry.
Run with -- --output <new.blend>. Refuses to overwrite an edited source.
"""
import argparse
import math
import pathlib
import sys
import bpy

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
output = pathlib.Path(args.output).resolve()
if output.exists():
    raise RuntimeError('Choose a new output filename; preserve edited sources.')
S = 3.1
def xyz(v): return (v[0] / S, -v[2] / S, v[1] / S)
parts = ['case', 'side_panel', 'motherboard', 'psu', 'cpu', 'cooler', 'ram_0', 'gpu', 'storage']
groups = {name: bpy.data.objects[name] for name in parts}
rig = {o.name: (tuple(o.location), tuple(o.rotation_euler), tuple(o.scale))
       for o in bpy.data.objects if o.type == 'EMPTY'}
# Replace visible meshes, retaining every socket, port, hinge and rotor object.
for root in groups.values():
    for child in list(root.children_recursive):
        if child.type == 'MESH': bpy.data.objects.remove(child, do_unlink=True)

def material(name, color, metal=0, rough=.5, alpha=1):
    m = bpy.data.materials.new('Reference / ' + name)
    m.diffuse_color = (*color, alpha)
    m.use_nodes = True
    n = m.node_tree.nodes.get('Principled BSDF')
    n.inputs['Base Color'].default_value = (*color, 1)
    n.inputs['Metallic'].default_value = metal
    n.inputs['Roughness'].default_value = rough
    n.inputs['Alpha'].default_value = alpha
    if alpha < 1: m.surface_render_method = 'DITHERED'
    return m

steel = material('Graphite powder coat', (.045, .052, .061), .3, .48)
black = material('Fan polymer', (.014, .018, .022), .05, .5)
silver = material('Brushed aluminium', (.62, .66, .69), .7, .32)
edge = material('Machined edge', (.34, .39, .42), .6, .38)
pcb = material('Green FR4', (.025, .29, .09), .05, .6)
trace = material('Solder mask traces', (.055, .4, .14), .12, .55)
gold = material('Gold plated contacts', (.73, .47, .11), .7, .3)
copper = material('Copper heatpipes', (.55, .23, .095), .72, .29)
white = material('Printed label', (.8, .82, .78), 0, .72)
ink = material('Silkscreen', (.55, .68, .57), 0, .8)
glass = material('Smoked side window', (.16, .23, .27), .05, .2, .17)

def parent_object(obj, parent, mat):
    obj.parent = groups[parent] if isinstance(parent, str) else parent
    obj.data.materials.append(mat)
    return obj

def box(parent, name, size, pos, mat, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(pos))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (size[0] / S, size[2] / S, size[1] / S)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new('Manufactured edges', 'BEVEL')
        modifier.width = bevel / S
        modifier.segments = 2
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return parent_object(obj, parent, mat)

def cylinder(parent, name, radius, depth, pos, mat, vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius / S, depth=depth / S, location=xyz(pos))
    obj = bpy.context.object
    obj.name = name
    return parent_object(obj, parent, mat)

def ring(parent, name, radius, thickness, pos, mat):
    bpy.ops.mesh.primitive_torus_add(major_segments=40, minor_segments=6,
        major_radius=radius / S, minor_radius=thickness / S, location=xyz(pos))
    obj = bpy.context.object
    obj.name = name
    return parent_object(obj, parent, mat)

def pipe(parent, name, points, radius, mat):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius / S
    curve.bevel_resolution = 2
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for point, position in zip(spline.points, points): point.co = (*xyz(position), 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    parent_object(obj, parent, mat)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    return obj

def screw(parent, pos, radius=.012):
    cylinder(parent, 'Recessed screw head', radius, .006, pos, edge, 12)
    box(parent, 'Screw slot', (radius * 1.25, .0015, .0025), (pos[0], pos[1] + .004, pos[2]), black, 0)

def fan(rotor_name, radius, blades):
    root = bpy.data.objects[rotor_name]
    cylinder(root, 'Rotor hub', radius * .26, .021, (0, .01, 0), black)
    cylinder(root, 'Hub cap', radius * .2, .002, (0, .022, 0), edge)
    # Swept solid blades, with a pitched profile; each rotates around the original rig axis.
    for i in range(blades):
        angle = i * math.tau / blades
        outline = [(radius * .22, -.08), (radius * .92, .02),
                   (radius * .99, .32), (radius * .58, .55), (radius * .25, .35)]
        vertices = []
        for y in [.005, .013]:
            for r, a in outline:
                vertices.append(xyz((math.cos(angle+a)*r, y + .012*r/radius, math.sin(angle+a)*r)))
        faces = [(4,3,2,1,0), (5,6,7,8,9)] + [(j,(j+1)%5,(j+1)%5+5,j+5) for j in range(5)]
        mesh = bpy.data.meshes.new('Swept blade')
        mesh.from_pydata(vertices, [], faces)
        obj = bpy.data.objects.new('Swept fan blade', mesh)
        bpy.context.collection.objects.link(obj)
        parent_object(obj, root, black)

# Dark tower case with solid fascia, lower intake slots and open service side.
for x in [-.69, .69]:
    for z in [-.58, .58]: box('case', 'Folded corner post', (.03, .88, .03), (x, 0, z), steel)
for y in [-.43, .43]:
    for z in [-.58, .58]: box('case', 'Chassis long rail', (1.4, .026, .036), (0, y, z), steel)
    for x in [-.69, .69]: box('case', 'Chassis cross rail', (.035, .026, 1.16), (x, y, 0), steel)
box('case', 'Steel motherboard tray', (1.35, .023, 1.12), (0, -.042, 0), steel)
box('case', 'Solid graphite fascia', (.048, .85, 1.13), (.704, 0, 0), steel, .007)
box('case', 'Front fascia seam', (.003, .004, 1.07), (.73, .13, 0), black, 0)
for z in [-.43+i*.055 for i in range(17)]:
    box('case', 'Lower intake slot', (.006, .31, .016), (.73, -.19, z), black, .003)
for x in [-.55+i*.075 for i in range(16)]:
    box('case', 'Top mesh rib', (.023, .81, .016), (x, 0, -.574), steel, .002)
for x in [-.58, .56]:
    for y in [-.32, .32]: box('case', 'Rubber foot', (.12, .1, .045), (x, y, .612), black, .008)
button = cylinder('case', 'Power button', .028, .008, (.733, .33, -.43), edge)
button.rotation_euler.y = math.pi / 2
for z in [-.28, -.19]: box('case', 'Front USB socket', (.008, .024, .06), (.733, .33, z), black)
for x in [-.62, .62]: box('side_panel', 'Window frame', (.12, .025, 1.14), (x, 0, 0), steel)
for z in [-.51, .51]: box('side_panel', 'Window edge', (1.13, .025, .12), (0, 0, z), steel)
box('side_panel', 'Smoked glass pane', (1.12, .008, .92), (0, 0, 0), glass)
for x in [-.62, .62]:
    for z in [-.5, .5]: screw('side_panel', (x, .019, z), .018)

# Green motherboard, populated circuitry and physical socket details.
box('motherboard', 'Green laminated PCB', (1.2, .022, 1), (0, 0, 0), pcb, .003)
for x in [-.54, .54]:
    for z in [-.43, .43]:
        ring('motherboard', 'Plated mounting hole', .02, .004, (x, .014, z), gold)
        cylinder('motherboard', 'Mounting bore', .012, .002, (x, .013, z), black, 16)
box('motherboard', 'CPU socket housing', (.27, .031, .27), (.05, .031, .15), black)
box('motherboard', 'Socket contact bed', (.222, .003, .222), (.05, .048, .15), gold, 0)
for x in [-.092, .192]: box('motherboard', 'Steel socket frame', (.018, .013, .29), (x, .053, .15), silver)
for z in [.014, .286]: box('motherboard', 'Socket end frame', (.28, .013, .015), (.05, .053, z), silver)
for name in ['cpu_retention_lever', 'dimm_latch_front', 'dimm_latch_back', 'dimm_latch_front_spare', 'dimm_latch_back_spare']:
    root = bpy.data.objects.get(name)
    if name.startswith('cpu'):
        box(root, 'Steel socket lever', (.013, .013, .3), (0, 0, .145), silver)
        box(root, 'Lever grip', (.06, .018, .018), (-.022, 0, .29), silver)
    elif root:
        box(root, 'DIMM locking tab', (.055, .06, .025), (0, .025, 0), white)
for x in [-.3, -.15, -.43]:
    box('motherboard', 'DIMM socket body', (.045, .04, .5), (x, .039, .1), black)
    box('motherboard', 'DIMM socket channel', (.011, .002, .47), (x, .06, .1), gold, 0)
for z in [-.15, -.29, -.4]:
    box('motherboard', 'PCI expansion socket', (.46, .03, .041), (.25, .033, z), black)
    box('motherboard', 'PCI socket contacts', (.42, .002, .007), (.25, .049, z), gold, 0)
for x in [.29, .35, .41]:
    box('motherboard', 'VRM heatsink fin', (.019, .073, .24), (x, .054, .31), silver)
for i in range(12):
    x = -.52 + i * .087
    cylinder('motherboard', 'Capacitor can', .015, .044, (x, .039, -.46), silver, 16)
    box('motherboard', 'Capacitor score', (.015, .001, .002), (x, .062, -.46), black, 0)
for i in range(9):
    x = -.49 + (i % 3) * .1
    z = -.22 - (i // 3) * .085
    box('motherboard', 'Controller IC', (.06, .022, .045), (x, .025, z), black)
    for dx in [-.033, .033]: box('motherboard', 'IC solder pins', (.008, .007, .038), (x+dx, .018, z), silver, 0)
box('motherboard', 'Chipset package', (.155, .027, .135), (.02, .028, -.28), black)
for i in range(20):
    x = -.53+i*.051
    box('motherboard', 'PCB signal route', (.002, .001, .10), (x, .012, -.075), trace, 0)
    box('motherboard', 'SMD resistor', (.018, .01, .01), (x, .018, .44), black, 0)
    box('motherboard', 'Silkscreen component mark', (.023, .001, .003), (x, .013, .465), ink, 0)
box('motherboard', 'Rear IO shield', (.13, .105, .49), (.535, .065, .12), silver)
for z in [-.07, .035, .14, .245]:
    box('motherboard', 'Rear IO aperture', (.007, .052, .065), (.604, .07, z), black)
    box('motherboard', 'USB inner tongue', (.009, .009, .043), (.609, .071, z), edge, 0)

# CPU: green substrate, bevelled nickel heatspreader and underside LGA array.
box('cpu', 'CPU substrate', (.225, .012, .225), (0, 0, 0), pcb)
box('cpu', 'Nickel heatspreader', (.199, .029, .199), (0, .019, 0), silver, .009)
for i in range(4): box('cpu', 'Etched identification', (.095-i*.012, .0006, .003), (0, .034, -.025+i*.012), edge, 0)
for i in range(10):
    for j in range(10):
        if 3 <= i <= 6 and 3 <= j <= 6: continue
        box('cpu', 'LGA contact pad', (.011, .001, .011), (-.087+i*.019, -.007, -.087+j*.019), gold, 0)
mesh = bpy.data.meshes.new('CPU keyed triangle')
mesh.from_pydata([xyz(p) for p in [(-.098,.035,.093),(-.075,.035,.093),(-.098,.035,.07)]], [], [(0,1,2)])
obj = bpy.data.objects.new('CPU orientation triangle', mesh)
bpy.context.collection.objects.link(obj)
parent_object(obj, 'cpu', gold)

# Low green DIMM with eight chips per side and a real gap between contact banks.
box('ram_0', 'DIMM PCB', (.018, .12, .47), (0, .068, 0), pcb, .001)
for side in [-1, 1]:
    for i in range(8): box('ram_0', 'Memory package', (.008, .063, .043), (side*.014, .076, -.195+i*.056), black, .001)
for i in range(40):
    z = -.227+i*.0116
    if abs(z-.028) < .012: continue
    box('ram_0', 'Individual gold finger', (.019, .022, .007), (0, .002, z), gold, 0)
box('ram_0', 'DIMM specification sticker', (.001, .038, .11), (.019, .075, .01), white, 0)

# Two-fan graphics card: PCB, fin stack, angular rails and real spinning blades.
box('gpu', 'Graphics PCB', (.56, .018, .25), (0, 0, 0), pcb)
box('gpu', 'Aluminium fin core', (.53, .07, .225), (0, .047, 0), edge)
for i in range(22): box('gpu', 'Heatsink fin edge', (.006, .078, .23), (-.255+i*.024, .052, 0), silver, 0)
for z in [-.118, .118]: box('gpu', 'Angular shroud rail', (.56, .032, .025), (0, .102, z), steel, .007)
for x in [-.275, 0, .275]: box('gpu', 'Shroud bridge', (.022, .024, .225), (x, .105, 0), steel, .003)
for x, name in [(-.145,'gpu_fan_left'),(.145,'gpu_fan_right')]:
    ring('gpu', 'Fan aperture rim', .098, .006, (x, .112, 0), steel)
    fan(name, .093, 9)
for i in range(28):
    x = -.18 + i * .013
    if -.03 < x < -.008: continue
    box('gpu', 'PCIe gold finger', (.008, .032, .008), (x, -.018, -.107), gold, 0)
box('gpu', 'Steel IO bracket', (.013, .165, .27), (.289, .063, 0), silver)
for z in [-.076, 0, .076]: box('gpu', 'Display output socket', (.018, .038, .05), (.297, .066, z), black)
for x in [-.245, .245]:
    for z in [-.093,.093]: screw('gpu', (x, .122, z), .008)

# PSU fan grille, modular sockets, folded sheet metal enclosure.
box('psu', 'Graphite PSU enclosure', (.33, .26, .43), (0, 0, 0), steel, .007)
cylinder('psu', 'Fan recess', .133, .005, (0, .133, 0), black, 40)
for radius in [.033,.056,.079,.102,.125]: ring('psu', 'Concentric wire grille', radius, .0025, (0,.142,0), edge)
for angle in [0, math.pi/2]:
    obj = box('psu', 'Fan grille support', (.27,.005,.007),(0,.145,0),silver,0)
    obj.rotation_euler.z = angle
for x in [-.137,.137]:
    for z in [-.14,.14]: screw('psu',(x,.135,z),.01)
box('psu','PSU side label',(.24,.001,.055),(0,-.131,0),white,0)
box('psu','Modular connector panel',(.285,.14,.016),(0,-.025,.223),black)
for x in [-.10,0,.10]: box('psu','Modular power socket',(.066,.055,.02),(x,-.025,.237),edge)

# Silver fin stack with copper U pipes and black axial fan on the retained rig.
box('cooler','Copper cold plate',(.23,.022,.23),(0,0,0),copper)
for i in range(18): box('cooler','Stamped aluminium fin',(.25,.004,.24),(0,.03+i*.012,0),silver,.001)
for x in [-.095,-.035,.035,.095]:
    pipe('cooler','Copper heatpipe',[(x,.008,-.075),(x,.008,-.10),(x,.035,-.112),(x,.242,-.112)],.008,copper)
    pipe('cooler','Copper return pipe',[(x,.008,.075),(x,.008,.10),(x,.035,.112),(x,.242,.112)],.008,copper)
# A mounting parent turns the retained rotor axis toward the tower's front.
# The original rotor coordinates, keyframes and action name remain intact.
mount = bpy.data.objects.new('cooler_fan_mount', None)
bpy.context.collection.objects.link(mount)
mount.parent = groups['cooler']
mount.location = xyz((0,.128,-.04))
mount.rotation_euler.x = math.pi / 2
bpy.data.objects['cooler_fan_rotor'].parent = mount
for x in [-.128,.128]: box('cooler','Fan frame side',(.014,.256,.025),(x,.128,.165),black)
for y in [.007,.249]: box('cooler','Fan frame edge',(.256,.014,.025),(0,y,.165),black)
rim = ring('cooler','Fan intake ring',.118,.007,(0,.128,.165),black)
rim.rotation_euler.x = math.pi / 2
fan('cooler_fan_rotor',.112,9)

# Two storage appearances share the original storage parent and SATA endpoints.
for variant in ['ssd','hdd']:
    root = bpy.data.objects.new('storage_'+variant, None)
    bpy.context.collection.objects.link(root)
    root.parent = groups['storage']
    groups['storage_'+variant] = root
box('storage_ssd','Slim silver SSD',(.18,.048,.32),(0,.022,0),silver,.005)
box('storage_ssd','SSD inset label',(.134,.001,.19),(0,.047,0),white,0)
for i in range(6): box('storage_ssd','SSD label line',(.075-i*.006,.001,.004),(0,.048,-.057+i*.019),edge,0)
box('storage_hdd','Cast HDD base',(.19,.078,.32),(0,.036,0),steel,.005)
box('storage_hdd','Stamped drive cover',(.184,.006,.312),(0,.078,0),edge,.004)
cylinder('storage_hdd','Drive cover circular pressing',.071,.003,(0,.083,.03),silver,40)
box('storage_hdd','HDD identification label',(.146,.001,.13),(0,.086,-.056),white,0)
for i in range(6): box('storage_hdd','HDD barcode',(.003,.001,.036),(-.042+i*.014,.087,-.066),black,0)
for variant, y in [('ssd',.049),('hdd',.085)]:
    for x in [-.076,.076]:
        for z in [-.138,.138]: screw('storage_'+variant,(x,y,z),.007)
box('storage','SATA keyed connector strip',(.135,.026,.025),(0,.022,-.169),black)

# Connector housings are built exactly at the retained connection anchors.
for anchor in [o for o in bpy.data.objects if o.name.startswith('port_')]:
    x, by, bz = anchor.location
    position = (x*S, bz*S, -by*S)
    box(anchor.parent,'Keyed connector '+anchor.name,(.046,.028,.022),position,black)
    box(anchor.parent,'Connector contact inset',(.025,.002,.011),(position[0],position[1]+.015,position[2]),gold,0)

# Desktop peripherals from the remaining three reference sheets.
screen_material = material('Monitor screen', (.013,.025,.032), .1, .3)
for name, pos in [('monitor',(.28,-.43,-.91)),('keyboard',(.36,-.444,.86)),('mouse',(.99,-.444,.84))]:
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    root.location = xyz(pos)
    root['referencePart'] = name
    groups[name] = root
box('monitor','Thin black display bezel',(1.02,.56,.045),(0,.59,0),black,.01)
box('monitor','LCD front surface',(.977,.504,.003),(0,.599,.025),screen_material,.003)
box('monitor','Thicker lower bezel',(1.014,.034,.007),(0,.323,.025),steel,.003)
box('monitor','Rear electronics housing',(.63,.29,.033),(0,.5,-.034),steel,.009)
box('monitor','Flat upright stand',(.094,.36,.054),(0,.195,-.038),steel,.004)
foot = cylinder('monitor','Oval stand base',.20,.025,(0,.014,.026),black,48)
foot.scale.y = .6
button = cylinder('monitor','Monitor power button',.009,.003,(0,.322,.031),edge,16)
button.rotation_euler.x = math.pi/2
box('keyboard','Full size keyboard housing',(.87,.025,.29),(0,.016,0),steel,.01)
key = material('Keycaps',(.028,.031,.035),0,.63)
for row in range(5):
    for col in range(14):
        # Spacebar and modifier key gaps in the bottom row.
        if row==4 and 3 <= col <= 8: continue
        box('keyboard','Individual keycap',(.037,.016,.037),(-.404+col*.045,.037,-.086+row*.044),key,.003)
box('keyboard','Spacebar',(.263,.016,.037),(-.156,.037,.09),key,.003)
for row in range(5):
    for col in range(4):
        box('keyboard','Numpad keycap',(.037,.016,.037),(.262+col*.044,.037,-.086+row*.044),key,.003)
for col in range(16): box('keyboard','Function key',(.033,.013,.026),(-.404+col*.049,.035,-.126),key,.002)
bpy.ops.mesh.primitive_uv_sphere_add(segments=28,ring_count=14,location=xyz((0,.034,0)))
obj=bpy.context.object
obj.name='Rounded mouse shell'
obj.scale=(.068/S,.108/S,.043/S)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
parent_object(obj,'mouse',steel)
for face in obj.data.polygons: face.use_smooth=True
box('mouse','Mouse base',(.103,.012,.165),(0,.007,0),black,.008)
pipe('mouse','Button seam',[(0,.06,-.083),(0,.075,-.05),(0,.077,.016)],.0018,black)
wheel=cylinder('mouse','Scroll wheel',.016,.012,(0,.077,-.039),black,24)
wheel.rotation_euler.y=math.pi/2
for z in [-.01,.029]: box('mouse','Side button',(.008,.012,.028),(-.064,.041,z),black,.003)

# Keep browser draw calls bounded; preserve independently moving objects.
merge_groups = list(groups.values()) + [o for o in bpy.data.objects if o.get('motion')]
for group in merge_groups:
    meshes = [o for o in group.children if o.type == 'MESH']
    if not meshes: continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes: obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    meshes[0].name = group.name + '_mesh'
for name, transform in rig.items():
    obj = bpy.data.objects[name]
    assert (tuple(obj.location), tuple(obj.rotation_euler), tuple(obj.scale)) == transform, name+' rig moved'
origin = bpy.data.objects['assembly_origin']
origin['visualRevision'] = 'gitee-reference-2026-10-02'
origin['referenceCommits'] = '984aef8,5ec960f'
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from add_second_memory import add_second_memory
add_second_memory()
bpy.context.scene['referenceNotes'] = 'User supplied three-view sheets; fitted to existing teaching rig. SSD/HDD are runtime variants.'
bpy.context.scene.frame_set(25)
output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(output))
print('REFERENCE_MODEL_SAVED', str(output))
