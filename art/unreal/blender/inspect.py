import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
for f in argv:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=f)
    print("=====", os.path.basename(f))
    for o in bpy.data.objects:
        if o.type == 'MESH':
            me = o.data
            tris = sum(len(p.vertices) - 2 for p in me.polygons)
            bb = [o.matrix_world @ __import__('mathutils').Vector(c) for c in o.bound_box]
            mn = [min(v[i] for v in bb) for i in range(3)]; mx = [max(v[i] for v in bb) for i in range(3)]
            print(f"MESH {o.name} verts={len(me.vertices)} tris={tris} mats={[m.name if m else None for m in me.materials]} uv={[u.name for u in me.uv_layers]} shapekeys={len(me.shape_keys.key_blocks) if me.shape_keys else 0} parent={o.parent.name if o.parent else None}")
            print("   bbox", [round(x,3) for x in mn], [round(x,3) for x in mx])
        else:
            print(o.type, o.name)
    for im in bpy.data.images:
        print("IMAGE", im.name, im.size[:], im.filepath)
