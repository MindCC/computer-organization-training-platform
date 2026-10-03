"""Add a second reference DIMM and socket without rebuilding edited geometry."""
import bpy
import pathlib
import sys

def add_second_memory():
    if bpy.data.objects.get('ram_1'):
        return
    source = bpy.data.objects['ram_0']
    second = source.copy()
    second.name = 'ram_1'
    bpy.context.collection.objects.link(second)
    second.location.x += .15 / 3.1
    for mesh in source.children:
        duplicate = mesh.copy()
        if mesh.data: duplicate.data = mesh.data.copy()
        duplicate.name = mesh.name.replace('ram_0', 'ram_1')
        bpy.context.collection.objects.link(duplicate)
        duplicate.parent = second
    anchor = bpy.data.objects['socket_memory'].copy()
    anchor.name = 'socket_memory_1'
    anchor.location.x += .15 / 3.1
    bpy.context.collection.objects.link(anchor)
    focus = bpy.data.objects['focus_memory'].copy()
    focus.name = 'focus_memory_1'
    bpy.context.collection.objects.link(focus)
    focus.parent = anchor
    second['assemblyPair'] = 'memory'
    bpy.context.scene['memorySticks'] = 2

if __name__ == '__main__':
    add_second_memory()
    output = pathlib.Path(sys.argv[sys.argv.index('--') + 1]).resolve()
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
