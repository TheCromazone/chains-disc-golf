"""Blender-authored golf disc: a real PDGA-style cross-section (domed flight plate, wing rim with an
undercut lip, inner rim wall) lathed at 72 segments, shallow mould rings on the plate and embossed
mould text around the rim. Runtime tints the single 'plastic' material per disc and adds the stamp.
Run: blender -b -P tools/build-disc.py  ->  assets/models/disc.glb (+ art/blender/disc-v2.blend)
"""
from pathlib import Path
import math, json
import bpy

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/models'; SOURCE = ROOT / 'art/blender'
bpy.ops.wm.read_factory_settings(use_empty=True)

def xyz(p): return (p[0], -p[2], p[1])   # game (x, up, z) -> Blender (x, y, z-up)

# (radius, height) from the plate centre over the wing to the underside centre. Radius .105 = physics R_DISC.
PROFILE = [
  (0, .0192), (.012, .0191), (.024, .0189), (.036, .0185), (.048, .0180), (.058, .0173),
  (.0595, .0177), (.061, .0173),            # first mould ring
  (.068, .0162), (.075, .0149), (.0765, .0153), (.078, .0147),   # second ring
  (.084, .0132), (.090, .0110), (.095, .0082), (.099, .0052), (.1025, .0018), (.1045, -.0022),
  (.1050, -.0065), (.1042, -.0105), (.1018, -.0138), (.0982, -.0158), (.0940, -.0164),   # outer wing to the rim bottom
  (.0895, -.0155), (.0862, -.0132), (.0842, -.0098), (.0832, -.0058), (.0830, -.0015), (.0836, .0022),   # undercut lip and inner wall
  (.0700, .0048), (.0500, .0062), (.0300, .0070), (0, .0074),   # flight plate underside
]
SEG = 72
verts, faces = [], []
for (r, y) in PROFILE:
  for i in range(SEG):
    a = i * math.tau / SEG; verts.append(xyz((math.cos(a) * r, y, math.sin(a) * r)))
for j in range(len(PROFILE) - 1):
  for i in range(SEG):
    a, b = j * SEG + i, j * SEG + (i + 1) % SEG; faces.append((a, b, b + SEG, a + SEG))
me = bpy.data.meshes.new('disc'); me.from_pydata(verts, [], faces); me.update()
# weld the two centre rings into single points
import bmesh
bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
top = [v for v in bm.verts if abs(v.co.z - .0192) < 1e-6]; bot = [v for v in bm.verts if abs(v.co.z - .0074) < 1e-6]
for ring in (top, bot):
  bmesh.ops.pointmerge(bm, verts=ring, merge_co=ring[0].co.copy())
bm.to_mesh(me); bm.free(); me.update()
disc = bpy.data.objects.new('disc', me); bpy.context.collection.objects.link(disc)
plastic = bpy.data.materials.new('plastic'); plastic.use_nodes = True
plastic.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .3
me.materials.append(plastic)
for p in me.polygons: p.use_smooth = True
# crisp wing edge: split normals where the plate meets the wing and along the rim bottom
me.normals_split_custom_set([(0, 0, 0)] * len(me.loops)) if False else None

# embossed mould text on the rim top (radius .094, just above the surface there)
bpy.ops.curve.primitive_bezier_circle_add(radius=.0925, location=(0, 0, .0092)); circle = bpy.context.object
bpy.ops.object.text_add(location=(0, 0, .0092)); text = bpy.context.object
text.data.body = '     CHAINS     ·     DISC GOLF     ·' * 3
text.data.size = .0062; text.data.extrude = .0003; text.data.align_y = 'CENTER'; text.data.resolution_u = 1
text.data.follow_curve = circle
bpy.context.view_layer.objects.active = text; text.select_set(True); bpy.ops.object.convert(target='MESH')
text.name = 'mould_text'; text.data.materials.append(plastic)
mod = text.modifiers.new('lean', 'DECIMATE'); mod.decimate_type = 'DISSOLVE'; mod.angle_limit = math.radians(20); bpy.ops.object.modifier_apply(modifier=mod.name)
for p in text.data.polygons: p.use_smooth = False
bpy.data.objects.remove(circle)
# join into one mesh, one material
bpy.ops.object.select_all(action='DESELECT'); disc.select_set(True); text.select_set(True); bpy.context.view_layer.objects.active = disc
bpy.ops.object.join(); disc = bpy.context.object; disc.name = 'disc'
for uv in list(disc.data.uv_layers): disc.data.uv_layers.remove(uv)
disc.data.calc_loop_triangles(); tris = len(disc.data.loop_triangles)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'disc-v2.blend'), compress=True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'disc.glb'), export_format='GLB', export_yup=True, export_animations=False, export_texcoords=False, export_apply=True)
size = (OUT / 'disc.glb').stat().st_size
report = {'triangles': tris, 'bytes': size, 'radius': .105, 'height': .0192 + .0164}
print('CHAINS_DISC', json.dumps(report), flush=True)
