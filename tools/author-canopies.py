"""Blender authoring + deterministic raycast AO bake for Chains' six tree crowns.

Run: blender --background --python tools/author-canopies.py
Coordinates are runtime Y-up. Crowns are closed, overlapping irregular shells,
not assemblies of UV spheres. No texture or Blender dependency is shipped.
"""
import bpy
import math
import json
import base64
import struct
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]
TAU = math.tau
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def shell(name, rings, segments, phase, warp, offset=(0, 0, 0), aspect=(1, 1), droop=0, leaf_edge=0):
    """Latitudinal closed shell with broad asymmetric lobes and offset centerline.

    rings: (height, radius, centerX, centerZ). Radius-zero ends are single poles.
    Ring scallops follow the whole volume, avoiding equally sized local balls.
    """
    vertices, rows, faces = [], [], []
    for row, (height, radius, cx, cz) in enumerate(rings):
        phase_row = row * 8 / max(1, len(rings) - 1) if segments >= 60 else row
        ids = []
        count = 1 if radius == 0 else segments
        for i in range(count):
            a = i / segments * TAU
            # Two unequal broad shoulders and a smaller leaf-edge indentation.
            f1, f2, f3 = (13, 19, 7) if segments >= 40 else (7, 9, 4)
            fine = (.55 * math.sin(a * f1 + phase_row * .71 + phase)
                    + .30 * math.sin(a * f2 - phase_row * .63 - phase * .7)
                    + .25 * math.sin(a * f3 + phase_row * .31 + phase * .5))
            edge_amplitude = .75 + .25 * math.sin(a * 3 + phase + phase_row * .27)
            contour = (1 + warp * math.sin(a * 3 + phase + phase_row * .13)
                       + warp * .44 * math.sin(a * 5 - phase * .7 + phase_row * .09)
                       + warp * .55 * math.cos(a + phase)
                       + leaf_edge * fine * edge_amplitude)
            ywarp = (radius * warp * .55 * math.sin(a * 3 + phase + .6)
                     - droop * radius * max(0, math.sin(a * 5 + phase + phase_row * .11)) ** 4
                     + radius * leaf_edge * .16 * math.sin(a * (f1 + 2) - phase + phase_row * .8))
            vertices.append((offset[0] + cx + radius * contour * math.cos(a) * aspect[0],
                             offset[1] + height + ywarp,
                             offset[2] + cz + radius * contour * math.sin(a) * aspect[1]))
            ids.append(len(vertices) - 1)
        rows.append(ids)
    for lo, hi in zip(rows, rows[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            if len(lo) == 1:
                faces.append((lo[0], hi[i], hi[j]))
            elif len(hi) == 1:
                faces.append((lo[i], hi[0], lo[j]))
            else:
                faces.extend([(lo[i], hi[i], hi[j]), (lo[i], hi[j], lo[j])])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    # Blender is Z-up; source stays Y-up deliberately, matching shipped geometry.
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def reduce_outer_shell(obj, triangles=480):
    # Preserve the dense sculptable source. The runtime version distributes its
    # vertices by geometric error instead of keeping coarse latitude chords.
    source = obj.copy()
    source.data = obj.data.copy()
    source.name = obj.name + '_dense_authoring'
    bpy.context.collection.objects.link(source)
    source.hide_render = True
    source.hide_set(True)
    source['role'] = 'Dense authoring source; not exported or included in runtime AO bake'
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new('Even silhouette allocation', 'DECIMATE')
    modifier.ratio = triangles / len(obj.data.polygons)
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)
    return obj


def deciduous(variant):
    phase = .7 + variant * 1.91
    # Dominant broad crown, a low spreading oak / leaning maple / upright crown.
    aspects = [(1, .88), (.87, 1), (.9, .88)]
    tops = [8.6, 9.0, 8.85]
    centers = [(-.25, .05), (.42, -.15), (-.15, .24)]
    cx, cz = centers[variant]
    dense_rings = []
    for row in range(33):
        t = row / 32
        latitude = math.pi * t
        # A continuous broad dome with a slightly full lower crown, and an
        # asymmetric centerline. More vertical samples avoid straight chords.
        y = 4.82 + (tops[variant] - 4.82) * (1 - math.cos(latitude)) * .5
        radius = 0 if row in (0, 32) else 2.83 * math.sin(latitude) * (1 + .055 * math.cos(latitude))
        dense_rings.append((y, radius, cx * t + .24 * t*t, cz * t))
    core = reduce_outer_shell(shell(f'deciduous_{variant}_main', dense_rings,
                                   64, phase, .065, aspect=aspects[variant], leaf_edge=.055))
    # Tucked interior foliage lies beneath the continuous outer shell. These
    # shaded recesses never form independently readable outer crown shoulders.
    shelves = []
    for side in range(2):
        angle = phase + side * 2.65
        ox, oz = math.cos(angle) * .90, math.sin(angle) * .90
        lift = .1 + side * .16 + (variant == 2) * .10
        shelves.append(shell(f'deciduous_{variant}_shelf_{side}', [
            (4.25, 0, 0, 0), (4.45, 1.05, .05, -.04),
            (4.72, 1.55 if side else 1.65, .03, .02),
            (5.12, 1.2, -.2, .08), (5.55, 0, -.4, .13)], 8, phase + side * .9, .095,
            offset=(ox, lift, oz), aspect=(1, .71 if side else .84)))
    return [core] + shelves


def pine(variant):
    phase = .45 + variant * 2.1
    # Three long, overlapping bough shells, each with an uneven drooping skirt.
    # No regular stacked cone ridges: branch centers lean differently by variant.
    widths = [(1, .94, .94), (.87, .95, 1), (.98, .84, .90)][variant]
    specs = [(3.72, 2.00 * widths[0], 7.35),
             (5.48, 1.68 * widths[1], 9.25),
             (7.48, 1.19 * widths[2], [10.62, 10.95, 10.8][variant])]
    objects = []
    for tier, (bottom, radius, top) in enumerate(specs):
        height = top - bottom
        leanx = math.cos(phase + tier * .75) * .27
        leanz = math.sin(phase + tier * .75) * .24
        objects.append(shell(f'pine_{variant}_bough_{tier}', [
            (bottom + .22, 0, 0, 0),
            (bottom + .06, radius * .65, 0, 0),
            (bottom + .40, radius, leanx * .2, leanz * .2),
            (bottom + height * .54, radius * .64, leanx * .8, leanz * .8),
            (bottom + height * .89, radius * .18, leanx * 1.3, leanz * 1.3),
            (top, 0, leanx * 1.6, leanz * 1.6)], 22, phase + tier * 1.35, .16, droop=.23, leaf_edge=.06))
    return objects


def hemisphere(n, rays=64):
    tangent = n.cross(Vector((0, 0, 1)))
    if tangent.length < .01:
        tangent = n.cross(Vector((1, 0, 0)))
    tangent.normalize()
    bitangent = n.cross(tangent)
    for i in range(rays):
        z = math.sqrt((i + .5) / rays)
        radius = math.sqrt(1 - z * z)
        a = i * 2.399963229728653
        yield (tangent * (radius * math.cos(a)) + bitangent * (radius * math.sin(a)) + n * z).normalized()


def bake(objects):
    positions, faces = [], []
    for obj in objects:
        base = len(positions)
        positions.extend([v.co.copy() for v in obj.data.vertices])
        faces.extend([tuple(base + i for i in p.vertices) for p in obj.data.polygons])
    bvh = BVHTree.FromPolygons(positions, faces, all_triangles=True)
    up = list(hemisphere(Vector((0, 1, 0))))
    colors = []
    for obj in objects:
        attr = obj.data.color_attributes.new(name='CanopyAO', type='FLOAT_COLOR', domain='POINT')
        visibility_values = []
        for vertex in obj.data.vertices:
            normal = vertex.normal.normalized()
            origin = vertex.co + normal * .014
            local_hits = sum(bvh.ray_cast(origin, direction, 4.5)[0] is not None
                             for direction in hemisphere(normal))
            sky_hits = sum(bvh.ray_cast(origin, direction, 14)[0] is not None for direction in up)
            visibility = .58 * (1 - local_hits / 64) + .42 * (1 - sky_hits / 64)
            visibility_values.append(visibility)
        if obj.name.endswith('_main'):
            # The finest edge triangles are silhouette detail, not individual
            # lighting lobes. Filter their sampled AO along the connected outer
            # shell before the response curve; the large interior gradient stays.
            neighbors = [set() for _ in obj.data.vertices]
            for edge in obj.data.edges:
                a, b = edge.vertices
                neighbors[a].add(b)
                neighbors[b].add(a)
            for _ in range(4):
                filtered = []
                for i, adjacent in enumerate(neighbors):
                    center = obj.data.vertices[i].co
                    weights = [(j, 1 / max(.04, (obj.data.vertices[j].co - center).length_squared)) for j in adjacent]
                    average = sum(visibility_values[j] * w for j, w in weights) / sum(w for _, w in weights)
                    filtered.append(visibility_values[i] * .4 + average * .6)
                visibility_values = filtered
        for vertex, visibility in zip(obj.data.vertices, visibility_values):
            # The exterior stays neutral; sheltered joins and interiors darken.
            gain = .22 + .78 * visibility ** 2.25
            attr.data[vertex.index].color = (gain, gain, gain, 1)
            colors.append(round(gain * 255))
    return positions, faces, colors


def crown_normals(objects, species):
    """A single broad envelope carries light over the detailed leaf silhouette.

    Foliage normal transfer is authored into the Blender source and runtime,
    while raycast AO above still uses actual triangle geometry for recesses.
    """
    result = []
    for obj in objects:
        normals = []
        for vertex in obj.data.vertices:
            x, y, z = vertex.co
            if species == 'deciduous':
                n = Vector((x / 8.2, (y - 6.65) / 4.8, z / 7.6)).normalized()
            else:
                radial = max(.1, math.hypot(x, z))
                n = Vector((x / radial, .40, z / radial)).normalized()
                # Keep physically downward-facing bough interiors sheltered.
                if vertex.normal.y < -.3:
                    n = (n * .3 + vertex.normal * .7).normalized()
            normals.append(tuple(n))
            result.append(n)
        obj.data.normals_split_custom_set_from_vertices(normals)
    return result


payloads, metrics = {}, {}
for species, author in [('pine', pine), ('deciduous', deciduous)]:
    for variant in range(3):
        objects = author(variant)
        # Keep visual crowns inside the unchanged existing collision envelopes.
        radius_limit = 2.28 if species == 'pine' else 3.38
        for obj in objects:
            for vertex in obj.data.vertices:
                radius = math.hypot(vertex.co.x, vertex.co.z)
                if radius > radius_limit:
                    vertex.co.x *= radius_limit / radius
                    vertex.co.z *= radius_limit / radius
            obj.data.update()
        positions, faces, colors = bake(objects)
        normals = crown_normals(objects, species)
        key = f'{species}{variant}'
        binary = bytearray()
        for p, n, c in zip(positions, normals, colors):
            binary.extend(struct.pack('<hhhbbbB', *(round(v * 2048) for v in p),
                                      *(round(v * 127) for v in n), c))
        for face in faces:
            binary.extend(struct.pack('<HHH', *face))
        payloads[key] = [len(positions), base64.b64encode(binary).decode('ascii')]
        metrics[key] = dict(vertices=len(positions), triangles=len(faces), shells=len(objects),
                            bytes=len(binary), aoMin=min(colors) / 255, aoMax=max(colors) / 255,
                            bounds=[[min(p[i] for p in positions), max(p[i] for p in positions)] for i in range(3)])
        for obj in objects:
            obj['species'] = species
            obj['variant'] = variant
            obj['ao_rays'] = '64 cosine hemisphere + 64 world sky hemisphere; 4.5m / 14m range'
            obj['runtime_Y_up'] = True
            mat = bpy.data.materials.get('Canopy AO preview')
            if not mat:
                mat = bpy.data.materials.new('Canopy AO preview')
                mat.use_nodes = True
                nodes = mat.node_tree.nodes
                color = nodes.new('ShaderNodeVertexColor')
                color.layer_name = 'CanopyAO'
                mat.node_tree.links.new(color.outputs['Color'], nodes.get('Principled BSDF').inputs['Base Color'])
            obj.data.materials.append(mat)

data_path = ROOT / 'src/canopy-data.js'
data_path.write_text('// Generated by Blender tools/author-canopies.py. Positions:int16/2048, normals:int8/127, AO:uint8.\n'
                     + 'export const CANOPY_DATA = ' + json.dumps(payloads, separators=(',', ':')) + ';\n', encoding='utf-8')
source = ROOT / 'art/blender/canopies-r4.blend'
source.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(source), compress=True)
(ROOT / 'art/blender/canopies-r4.json').write_text(json.dumps(dict(
    authoring='Blender closed irregular shells; 3 shells per crown',
    bake='Per-vertex BVH raycasts: 64 cosine-weighted surface hemisphere + 64 sky hemisphere',
    normals='Transferred from a coherent whole-crown envelope; custom split normals in Blender',
    outer_shell='Deciduous: dense64x32 latitude source; Blender geometry-error decimation to480triangles',
    ao_response='.22 + .78 * visibility ** 2.25; fully exposed vertices remain neutral1.0',
    ao_filter='Primary outer shell only: four distance-weighted adjacency passes before response curve',
    quantization='Y-up coordinates 1/2048 metre; signed8-bit normals; grayscale vertex AO8-bit',
    crowns=metrics), indent=2) + '\n', encoding='utf-8')
print(json.dumps(metrics, indent=2))
