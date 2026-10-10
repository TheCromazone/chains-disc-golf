"""Render front three-quarter previews of MetaHuman head glTFs exported from UE (art/unreal/metahumans/*).
blender -b --factory-startup -P art/unreal/blender/render_heads.py -- --out <png> [--yaw 35] [--size 640]
        <head.glb>[=<label>[=<r,g,b skin linear>]] ...
One image per head, tiled side by side into --out. The head mesh comes in untextured (no synthesized MetaHuman skin
textures are available without the optional MetaHuman Creator Core Data), so it is shaded as a skin-toned clay.
"""
import bpy, sys, math, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
def opt(flag, default):
    if flag in argv:
        i = argv.index(flag); v = argv[i + 1]; del argv[i:i + 2]; return v
    return default
OUT = opt('--out', '/tmp/heads.png'); YAW = float(opt('--yaw', '35')); SIZE = int(opt('--size', '640'))
ENGINE = opt('--engine', 'CYCLES')
heads = []
for a in argv:
    parts = a.split('=')
    col = tuple(float(x) for x in parts[2].split(',')) if len(parts) > 2 else (0.55, 0.38, 0.30)
    heads.append((parts[0], parts[1] if len(parts) > 1 else os.path.basename(parts[0]), col))

tiles = []
for i, (path, label, skin) in enumerate(heads):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    head = max(meshes, key=lambda o: len(o.data.vertices))
    me = head.data
    # Material slots in the UE export: per-slot face counts identify the skin (largest) and the eyes (two small
    # spheres either side of the midline). Everything else (teeth, saliva, lashes) is hidden by deleting its faces.
    counts = {}
    for p in me.polygons: counts[p.material_index] = counts.get(p.material_index, 0) + 1
    skin_idx = max(counts, key=counts.get)
    skin_mat = bpy.data.materials.new('skin'); skin_mat.use_nodes = True
    bsdf = skin_mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*skin, 1); bsdf.inputs['Roughness'].default_value = 0.55
    bsdf.inputs['Subsurface Weight'].default_value = 0.15; bsdf.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.2)
    eye_mat = bpy.data.materials.new('eye'); eye_mat.use_nodes = True
    eb = eye_mat.node_tree.nodes['Principled BSDF']; eb.inputs['Base Color'].default_value = (0.03, 0.025, 0.02, 1); eb.inputs['Roughness'].default_value = 0.15
    # Keep the skin slot plus the eyeballs (~2.5 cm islands either side of the midline). Teeth, saliva, the eye shell,
    # lashes and cartilage (UE hides most of these with M_Hide) are deleted.
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    seen, eye_faces, dead = set(), set(), []
    for f in bm.faces:
        if f.index in seen or f.material_index == skin_idx: continue
        stack, island = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop(); island.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen and h.material_index == f.material_index:
                        seen.add(h.index); stack.append(h)
        vs_ = {v for g in island for v in g.verts}
        mn = Vector((min(v.co.x for v in vs_), min(v.co.y for v in vs_), min(v.co.z for v in vs_)))
        mx = Vector((max(v.co.x for v in vs_), max(v.co.y for v in vs_), max(v.co.z for v in vs_)))
        dims = mx - mn
        edges = {e for g in island for e in g.edges}
        boundary = sum(1 for e in edges if sum(1 for h in e.link_faces if h.material_index == f.material_index) < 2)
        # glTF splits vertices at UV seams, so an eyeball arrives as a few islands (sclera, cornea cap): ~2.5 cm across
        is_eye = 0.02 < dims.x < 0.034 and 0.02 < dims.z < 0.034 and dims.y < 0.03 and abs((mn.x + mx.x) / 2) > 0.02
        (eye_faces.update(g.index for g in island) if is_eye else dead.extend(island))
    for f in bm.faces: f.material_index = 1 if f.index in eye_faces else 0
    eye_cents = []
    bmesh.ops.delete(bm, geom=list(set(dead)), context='FACES')
    bm.to_mesh(me); bm.free()
    idx = [p.material_index for p in me.polygons]
    me.materials.clear(); me.materials.append(skin_mat); me.materials.append(eye_mat)
    for p, k in zip(me.polygons, idx): p.material_index = k   # clearing the slots resets the indices
    eyes = [p for p in me.polygons if p.material_index == 1]
    for p in me.polygons: p.use_smooth = True
    # frame: head top 25 cm, face forward axis found from the eye centroids (eyes are in front of the skull centre)
    vs = [head.matrix_world @ v.co for v in me.vertices]
    top = max(v.z for v in vs)
    sel = [v for v in vs if v.z > top - 0.26]
    cx = sum(v.x for v in sel) / len(sel); cy = sum(v.y for v in sel) / len(sel)
    fwd = Vector((0, -1, 0))   # UE MetaHuman head exported through glTF faces -Y once imported into Blender
    target = Vector((cx, cy, top - 0.115))
    yaw = math.radians(YAW)
    d = Vector((math.sin(yaw) * (1 if fwd.y > 0 else -1), fwd.y * math.cos(yaw), 0.06)).normalized()
    cam_data = bpy.data.cameras.new('cam'); cam_data.lens = 85
    cam = bpy.data.objects.new('cam', cam_data); bpy.context.scene.collection.objects.link(cam)
    cam.location = target + d * 0.95
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    def light(name, energy, loc, size=0.6, color=(1, 1, 1)):
        ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.size = size; ld.color = color
        lo = bpy.data.objects.new(name, ld); bpy.context.scene.collection.objects.link(lo)
        lo.location = loc; lo.rotation_euler = (target - lo.location).to_track_quat('-Z', 'Y').to_euler()
    side = 1 if fwd.y > 0 else -1
    light('key', 60, target + Vector((0.9 * side * -1, fwd.y * 0.8, 0.6)), 0.8, (1, 0.96, 0.9))
    light('fill', 18, target + Vector((0.9 * side, fwd.y * 0.9, 0.1)), 1.2, (0.9, 0.95, 1))
    light('rim', 40, target + Vector((0.3 * side, -fwd.y * 0.9, 0.5)), 0.5)
    w = bpy.data.worlds.new('w'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.16, 0.17, 0.19, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    sc = bpy.context.scene; sc.world = w
    sc.render.engine = ENGINE
    if ENGINE == 'CYCLES':
        sc.cycles.samples = 48; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
    sc.render.resolution_x = SIZE; sc.render.resolution_y = SIZE
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
    tile = os.path.splitext(OUT)[0] + f'_{i}.png'
    sc.render.filepath = tile
    bpy.ops.render.render(write_still=True)
    tiles.append((tile, label))
    print('CHAINS rendered', tile, 'fwd', tuple(fwd), 'eyes', len(eyes))

# tile into one strip with labels (PIL is not bundled with Blender; composite with bpy images instead)
import numpy as np
imgs = []
for t, _ in tiles:
    im = bpy.data.images.load(t); px = np.array(im.pixels[:]).reshape(SIZE, SIZE, 4); imgs.append(px)
strip = np.concatenate(imgs, axis=1) if imgs else None
if strip is not None:
    out = bpy.data.images.new('strip', strip.shape[1], strip.shape[0], alpha=True)
    out.pixels = strip.ravel().tolist(); out.filepath_raw = OUT; out.file_format = 'PNG'; out.save()
    print('CHAINS strip', OUT, [l for _, l in tiles])
