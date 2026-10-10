"""Compare a Unity-exported FBX clip against the Blender-exported source FBX (joint world positions).

blender -b --factory-startup -P art/unity/blender/roundtrip_check.py -- <source.fbx> <unity_export.fbx> <action-substring>

The FBX importer assigns each object its own imported action; for the source file (three takes)
the take matching <action-substring> is assigned to the armature. Joint world positions are
sampled at 5 evenly spaced frames. A Unity export turns the 'root' bone into the armature object,
so 'root' is read from that object.
"""
import sys
import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
src, rt, want = argv


def joints(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    if arm.animation_data and arm.animation_data.action and want not in arm.animation_data.action.name:
        act = next(a for a in bpy.data.actions if want in a.name)
        arm.animation_data.action = act
        if hasattr(act, "slots") and len(act.slots):
            arm.animation_data.action_slot = act.slots[0]
    f0, f1 = arm.animation_data.action.frame_range
    out = []
    for k in range(5):
        bpy.context.scene.frame_set(int(round(f0 + (f1 - f0) * k / 4)))
        bpy.context.view_layer.update()
        mw = arm.matrix_world
        d = {pb.name: (mw @ pb.head).copy() for pb in arm.pose.bones}
        if arm.name == "root":
            d["root"] = mw.translation.copy()
        out.append(d)
    print(path.split("/")[-1], "armature", arm.name, "frames", (f0, f1), "joints", sorted(out[0]))
    return out


a, b = joints(src), joints(rt)
worst, n = 0.0, 0
for da, db in zip(a, b):
    for name, p in da.items():
        if name in db:
            worst = max(worst, (p - db[name]).length)
            n += 1
print(f"compared {n} joint samples; max joint position difference: {worst * 100:.2f} cm")
