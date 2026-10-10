"""Write the game athlete's head (rest pose, faces above the neck) as JSON in Unreal head space (cm, x lateral, y forward, z up)
for MetaHuman conforming:  blender -b -P extract_game_head.py -- <golfer.glb> <out.json> [zcut_m=1.50]"""
import bpy, sys, json
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]; zcut = float(argv[2]) if len(argv) > 2 else 1.50
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
b = bpy.data.objects['body']; me = b.data
vs = [b.matrix_world @ v.co for v in me.vertices]
keep = [p for p in me.polygons if all(vs[i].z > zcut for i in p.vertices)]
used = sorted({i for p in keep for i in p.vertices}); remap = {o: n for n, o in enumerate(used)}
tris = []
for p in keep:
    ids = [remap[i] for i in p.vertices]
    for k in range(1, len(ids) - 1): tris += [ids[0], ids[k], ids[k + 1]]
verts = [[vs[i].x * 100, vs[i].y * 100, vs[i].z * 100] for i in used]
json.dump({"src": src, "zcut_m": zcut, "orig_index": used, "verts": verts, "tris": tris}, open(out, 'w'))
print("CHAINS head verts", len(verts), "tris", len(tris) // 3)
