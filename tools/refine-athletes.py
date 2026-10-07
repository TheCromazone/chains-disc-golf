"""Conservative, UV-preserving fairing of the four scanned athlete bodies.

Blender -b -P tools/refine-athletes.py. Original sources stay untouched.
Remove small scan ripples on limbs and clothing, preserving the face, fingers,
shoe contact surfaces, mesh topology, wardrobe and the eleven-joint contract.
"""
from pathlib import Path
import json, math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
report = {}
for tag, lod in [('', False), ('', True), ('-f', False), ('-f', True)]:
    # The female phone textures share the FULL body's UV atlas. The historical
    # decimated source has a different unwrap and must never consume those maps.
    source = f'golfer-v3{tag}{"-lod" if lod and not tag else ""}-source.blend'
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'art/blender' / source))
    body = bpy.data.objects['body']
    mesh = body.data
    original = [v.co.copy() for v in mesh.vertices]
    neighbours = [set() for _ in original]
    for edge in mesh.edges:
        a, b = edge.vertices
        neighbours[a].add(b)
        neighbours[b].add(a)
    names = {g.index: g.name for g in body.vertex_groups}
    weights = []
    for v in mesh.vertices:
        groups = {names[g.group]: g.weight for g in v.groups}
        # Head detail, fingers and shoe soles are invariant. Soft blend at the
        # elbow prevents the forearm/hand and upper-arm boundaries becoming seams.
        protected = groups.get('head', 0)
        for side in ['R', 'L']:
            elbow = bpy.data.objects['ChainsRig'].data.bones['el' + side].head_local
            if v.co.z < elbow.z - .18:
                protected = max(protected, groups.get('el' + side, 0))
        if v.co.z < .22:
            protected = 1
        weights.append(max(0, 1 - min(1, protected * 3)))
    positions = [p.copy() for p in original]
    # Taubin's negative pass preserves limb volume; every displacement is
    # capped at 4 mm, below the baked texture's anatomical feature scale.
    for _ in range(3 if tag else 2):
        for gain in [.32, -.34]:
            following = []
            for i, p in enumerate(positions):
                if not neighbours[i] or not weights[i]:
                    following.append(p.copy())
                    continue
                mean = sum((positions[j] for j in neighbours[i]), Vector()) / len(neighbours[i])
                candidate = p + (mean - p) * gain * weights[i]
                delta = candidate - original[i]
                if delta.length > .004:
                    candidate = original[i] + delta.normalized() * .004
                following.append(candidate)
            positions = following
    for v, p in zip(mesh.vertices, positions):
        v.co = p
    mesh.update()
    rig = bpy.data.objects['ChainsRig']
    rig['surfacePass'] = 'premium: volume-preserving scan fairing, max 4 mm'
    name = f'golfer{tag}{"-lod" if lod else ""}-premium'
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'art/blender' / (name + '.blend')), compress=True)
    out = ROOT / 'assets/models' / (name + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', export_yup=True,
        export_animations=False, export_image_format='NONE', export_skins=True,
        export_all_influences=False, export_extras=True, export_texcoords=True, export_apply=False,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=10 if lod else 6,
        export_draco_position_quantization=13 if lod else 14, export_draco_normal_quantization=8 if lod else 10,
        export_draco_texcoord_quantization=12, export_draco_generic_quantization=12)
    moved = [(p - q).length for p, q in zip(positions, original)]
    report[name] = {'source': source, 'vertices': len(original), 'triangles': len(mesh.polygons),
        'maxDisplacementM': max(moved), 'meanDisplacementM': sum(moved) / len(moved), 'bytes': out.stat().st_size}
    print(name, report[name])
(ROOT / 'art/blender/athlete-premium-report.json').write_text(json.dumps(report, indent=2) + '\n')
