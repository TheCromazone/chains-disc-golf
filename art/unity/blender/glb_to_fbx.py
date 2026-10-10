"""Convert a Chains golfer GLB (read-only) to FBX for the Unity humanoid / FBX round-trip test.

blender -b --factory-startup -P art/unity/blender/glb_to_fbx.py -- <in.glb> <out.fbx> [clip.glb ...]

Clip files (animation-only golfer-<clip>.glb, no skin) are grafted onto the skinned rig by node
name in a temporary merged GLB, so Blender imports them as real bone actions, then each becomes
an FBX take.
"""
import json
import os
import struct
import sys
import tempfile

import bpy


def read_glb(path):
    b = open(path, "rb").read()
    jlen = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + jlen])
    off = 20 + jlen
    blen = struct.unpack("<I", b[off:off + 4])[0]
    return j, b[off + 8:off + 8 + blen]


def pad4(x, fill=b"\0"):
    return x + fill * ((4 - len(x) % 4) % 4)


def merge(rig_path, clip_paths, out_path):
    j, binr = read_glb(rig_path)
    name_to_node = {n.get("name"): i for i, n in enumerate(j["nodes"])}
    binr = pad4(binr)
    j.setdefault("animations", [])
    for cp in clip_paths:
        cj, cbin = read_glb(cp)
        base = len(binr)
        bv_off, acc_off = len(j["bufferViews"]), len(j["accessors"])
        for bv in cj["bufferViews"]:
            bv = dict(bv, buffer=0, byteOffset=bv.get("byteOffset", 0) + base)
            j["bufferViews"].append(bv)
        for a in cj["accessors"]:
            j["accessors"].append(dict(a, bufferView=a["bufferView"] + bv_off))
        binr = pad4(binr + cbin)
        for anim in cj["animations"]:
            chans = []
            for c in anim["channels"]:
                nm = cj["nodes"][c["target"]["node"]].get("name")
                if nm in name_to_node and c["target"]["path"] != "scale":
                    chans.append({"sampler": c["sampler"],
                                  "target": {"node": name_to_node[nm], "path": c["target"]["path"]}})
            samplers = [dict(s, input=s["input"] + acc_off, output=s["output"] + acc_off)
                        for s in anim["samplers"]]
            j["animations"].append({"name": anim.get("name"), "channels": chans, "samplers": samplers})
    j["buffers"] = [{"byteLength": len(binr)}]
    js = pad4(json.dumps(j).encode(), b" ")
    total = 12 + 8 + len(js) + 8 + len(binr)
    with open(out_path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(binr), 0x004E4942) + binr)


argv = sys.argv[sys.argv.index("--") + 1:]
src, out, clips = argv[0], argv[1], argv[2:]

path = src
if clips:
    path = os.path.join(tempfile.mkdtemp(prefix="chains-glb-"), "merged.glb")
    merge(src, clips, path)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
print("armature:", arm.name, "bones:", [b.name for b in arm.data.bones])
print("actions:", [(a.name, tuple(a.frame_range)) for a in bpy.data.actions])
if bpy.data.actions:
    fr = bpy.data.actions[0].frame_range
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = int(fr[0]), int(fr[1])

bpy.ops.export_scene.fbx(
    filepath=out,
    use_selection=False,
    add_leaf_bones=False,
    bake_anim=bool(clips),
    bake_anim_use_all_actions=bool(clips),
    bake_anim_use_nla_strips=False,
    bake_anim_force_startend_keying=True,
    apply_scale_options="FBX_SCALE_UNITS",
)
print("wrote", out)
