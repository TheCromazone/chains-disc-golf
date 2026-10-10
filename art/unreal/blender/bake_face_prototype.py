"""Prototype: put a MetaHuman face onto the game's existing athlete head (read-only inputs, outputs in art/unreal/bake/).

blender -b --factory-startup -P art/unreal/blender/bake_face_prototype.py -- \
    --game assets/models/golfer.glb --albedo assets/textures/body/albedo.webp --normal assets/textures/body/normal.webp \
    --mh art/unreal/metahumans/Chains_M1/Chains_M1_head_lod0.glb --name M1 --out art/unreal/bake

1. align the MetaHuman head to the game head (nose/crown similarity, then ICP on the frontal face),
2. shape transfer: every game head vertex in a feathered face mask moves to the closest point of the MetaHuman surface
   (skin + eyeballs); the displacement field is smoothed over the mesh and stored as a shape key "mh_<name>" (a glTF morph
   target, so one body mesh can carry several faces and the game picks one per player),
3. bake the MetaHuman surface's tangent-space normals into the game head's own UV layout (face-mask texels only, merged
   into a copy of the game normal map), so the old scan's folds do not fight the new shape,
4. render current vs MetaHuman-derived side by side, and export the body with the morph target as a glb.
Albedo: the MetaHuman has no skin texture here (texture synthesis needs the optional MetaHuman Creator Core Data), so the
game's own albedo is kept; its features (brows, lips) ride the morph because they live in the same UVs.
"""
import bpy, bmesh, sys, os, math, json
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

argv = sys.argv[sys.argv.index('--') + 1:]
def opt(flag, default=None):
    return argv[argv.index(flag) + 1] if flag in argv else default
GAME = opt('--game'); ALBEDO = opt('--albedo'); NORMAL = opt('--normal'); MH = opt('--mh'); NAME = opt('--name', 'M1')
OUT = opt('--out', 'art/unreal/bake'); RES = int(opt('--res', '2048')); SIZE = int(opt('--size', '720'))
SKIN = tuple(float(x) for x in opt('--skin', '1,1,1').split(','))   # optional multiply on the albedo for the preview
os.makedirs(OUT, exist_ok=True)
REPORT = {}
def log(*a): print('CHAINS', *a, flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# ---------- game athlete ----------
bpy.ops.import_scene.gltf(filepath=GAME)
body = bpy.data.objects['body']
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o is not body: bpy.data.objects.remove(o, do_unlink=True)
arm = body.parent
me = body.data
W = body.matrix_world.copy()
gv = np.array([tuple(W @ v.co) for v in me.vertices])
head_idx = np.where(gv[:, 2] > 1.50)[0]
top = gv[head_idx, 2].max()
front = head_idx[np.abs(gv[head_idx, 0]) < 0.015]
nose_i = front[np.argmax(gv[front, 1])]; g_nose = Vector(gv[nose_i])
REPORT['game_nose'] = tuple(g_nose); REPORT['game_top'] = float(top)

# ---------- MetaHuman head (skin + eyeballs) ----------
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=MH)
mh = [o for o in bpy.data.objects if o not in before and o.type == 'MESH'][0]
mme = mh.data
counts = {}
for p in mme.polygons: counts[p.material_index] = counts.get(p.material_index, 0) + 1
skin_idx = max(counts, key=counts.get)
bm = bmesh.new(); bm.from_mesh(mme); bm.faces.ensure_lookup_table()
seen, keep = set(), set()
for f in bm.faces:
    if f.material_index == skin_idx: keep.add(f.index); continue
    if f.index in seen: continue
    stack, isl = [f], []; seen.add(f.index)
    while stack:
        g = stack.pop(); isl.append(g)
        for e in g.edges:
            for h in e.link_faces:
                if h.index not in seen and h.material_index == f.material_index: seen.add(h.index); stack.append(h)
    vs_ = {v for g in isl for v in g.verts}
    mn = Vector([min(v.co[i] for v in vs_) for i in range(3)]); mx = Vector([max(v.co[i] for v in vs_) for i in range(3)]); d = mx - mn
    if 0.02 < d.x < 0.034 and 0.02 < d.z < 0.034 and d.y < 0.03 and abs((mn.x + mx.x) / 2) > 0.02: keep.update(g.index for g in isl)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
bm.to_mesh(mme); bm.free()
# MetaHuman glTF comes in facing -Y; the game faces +Y: turn it around, then nose/crown similarity
mh.matrix_world = Matrix.Rotation(math.pi, 4, 'Z') @ mh.matrix_world; bpy.context.view_layer.update()   # glTF objects use quaternion mode
mv = np.array([tuple(mh.matrix_world @ v.co) for v in mme.vertices])
m_front = np.where((np.abs(mv[:, 0]) < 0.015) & (mv[:, 2] > mv[:, 2].max() - 0.26))[0]   # skip the chest below the head
m_nose = Vector(mv[m_front[np.argmax(mv[m_front, 1])]]); m_top = mv[:, 2].max()
s = (top - g_nose.z) / (m_top - m_nose.z)
S = Matrix.Translation(g_nose) @ Matrix.Scale(s, 4) @ Matrix.Translation(-m_nose)
mh.matrix_world = S @ mh.matrix_world
bpy.context.view_layer.update()
REPORT['init_scale'] = s

def mh_points():
    return np.array([tuple(mh.matrix_world @ v.co) for v in mme.vertices])

# ---------- ICP (similarity) on the frontal face ----------
face_pts = head_idx[(gv[head_idx, 1] > g_nose.y - 0.075) & (gv[head_idx, 2] < g_nose.z + 0.075) & (gv[head_idx, 2] > g_nose.z - 0.085)
                    & (np.abs(gv[head_idx, 0]) < 0.065)]
src = gv[face_pts]
def umeyama(a, b):
    ma, mb = a.mean(0), b.mean(0); A, B = a - ma, b - mb
    U, D, Vt = np.linalg.svd(B.T @ A / len(a)); Sg = np.eye(3)
    if np.linalg.det(U) * np.linalg.det(Vt) < 0: Sg[2, 2] = -1
    R = U @ Sg @ Vt; c = np.trace(np.diag(D) @ Sg) / (A ** 2).sum(1).mean()
    return c, R, mb - c * R @ ma
errs = []
for it in range(25):
    bvh = BVHTree.FromObject(mh, bpy.context.evaluated_depsgraph_get())
    # nearest MetaHuman point (MH local -> world) for each game face point; align MH to the game points
    inv = mh.matrix_world.inverted(); M = mh.matrix_world
    near = []
    for p in src:
        r = bvh.find_nearest(inv @ Vector(p)); near.append(tuple(M @ r[0]))
    near = np.array(near); d = np.linalg.norm(near - src, axis=1)
    ok = d < np.percentile(d, 85)
    c, R, t = umeyama(near[ok], src[ok])
    T = Matrix(((*(c * R[0]), t[0]), (*(c * R[1]), t[1]), (*(c * R[2]), t[2]), (0, 0, 0, 1)))
    mh.matrix_world = T @ mh.matrix_world; bpy.context.view_layer.update()
    errs.append(float(d[ok].mean()))
REPORT['icp_mean_err_mm'] = [round(e * 1000, 2) for e in errs[::4]] + [round(errs[-1] * 1000, 2)]
log('icp', REPORT['icp_mean_err_mm'])

# ---------- face mask + shape transfer ----------
# feathered mask: full weight on the face (in front of the ears, chin to brow), 0 at hairline / ears / neck
cen = Vector((0, g_nose.y - 0.06, g_nose.z + 0.005))
def mask(p):
    q = Vector(p) - cen
    lat = abs(q.x) / 0.068; up = (q.z - 0.055) / 0.03 if q.z > 0.055 else 0; dn = (-q.z - 0.075) / 0.03 if q.z < -0.075 else 0
    back = (-(q.y) - 0.0) / 0.03 if q.y < 0 else 0
    r = max(lat - 0.75, 0) / 0.25 + max(up, 0) + max(dn, 0) + max(back, 0)
    return float(max(0.0, 1.0 - r)) if r < 1 else 0.0
wts = np.array([mask(gv[i]) if i in set(head_idx.tolist()) else 0.0 for i in range(len(gv))])
bvh = BVHTree.FromObject(mh, bpy.context.evaluated_depsgraph_get()); inv = mh.matrix_world.inverted(); M = mh.matrix_world
disp = np.zeros_like(gv)
for i in np.where(wts > 0)[0]:
    r = bvh.find_nearest(inv @ Vector(gv[i]))
    if r[0] is None: continue
    d = np.array(tuple(M @ r[0])) - gv[i]
    n = np.linalg.norm(d)
    if n > 0.025: d *= 0.025 / n
    disp[i] = d
# smooth the displacement field (mesh Laplacian over vertex neighbours), keep the mask feather
nbr = [[] for _ in range(len(gv))]
for e in me.edges:
    a, b = e.vertices; nbr[a].append(b); nbr[b].append(a)
_pos = {}
for i in range(len(gv)): _pos.setdefault(tuple(np.round(gv[i], 5)), []).append(i)
for grp in _pos.values():
    if len(grp) > 1:
        u = sorted({n for g in grp for n in nbr[g]})
        for g in grp: nbr[g] = u
for _ in range(2):
    nd = disp.copy()
    for i in np.where(wts > 0)[0]:
        if nbr[i]: nd[i] = 0.5 * disp[i] + 0.5 * disp[nbr[i]].mean(0)
    disp = nd
# glTF splits vertices along UV seams: weld the duplicates (same position) so the displacement is identical on both
# sides of a seam, otherwise the smoothed field opens cracks along every UV island border
key = {}
for i in np.where(wts > 0)[0]: key.setdefault(tuple(np.round(gv[i], 5)), []).append(i)
for grp in key.values():
    if len(grp) > 1: disp[grp] = disp[grp].mean(0); wts[grp] = wts[grp].max()
disp *= wts[:, None]
REPORT['moved_verts'] = int((wts > 0).sum()); REPORT['max_disp_mm'] = round(float(np.linalg.norm(disp, axis=1).max() * 1000), 1)
REPORT['mean_disp_mm_face'] = round(float(np.linalg.norm(disp[wts > 0.99], axis=1).mean() * 1000), 1)
Winv = W.inverted().to_3x3()
if not me.shape_keys: body.shape_key_add(name='Basis')
sk = body.shape_key_add(name=f'mh_{NAME}')
for i in np.where(wts > 0)[0]:
    sk.data[i].co = me.vertices[i].co + Winv @ Vector(disp[i])
log('shape key', REPORT['moved_verts'], 'verts, max', REPORT['max_disp_mm'], 'mm')

# ---------- materials ----------
def game_material(normal_img):
    m = bpy.data.materials.new('game_body'); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = bpy.data.images.load(os.path.abspath(ALBEDO)); ti.image.colorspace_settings.name = 'sRGB'
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    mul.inputs['B'].default_value = (*SKIN, 1)
    nt.links.new(ti.outputs['Color'], mul.inputs['A']); nt.links.new(mul.outputs['Result'], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = 0.55
    bs.inputs['Subsurface Weight'].default_value = 0.1; bs.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.2)
    if normal_img is not None:
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = normal_img; tn.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    return m
orig_normal = bpy.data.images.load(os.path.abspath(NORMAL)) if NORMAL else None

# ---------- bake MetaHuman normals into the game UVs (face texels only) ----------
baked = None
if NORMAL:
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
    # bake target: a head-only copy with the shape key applied, so the cage sits on the new face
    tgt = body.copy(); tgt.data = body.data.copy(); sc.collection.objects.link(tgt); tgt.parent = None; tgt.matrix_world = W
    tgt.modifiers.clear()
    # apply the shape: the mh key becomes the mesh
    keys = tgt.data.shape_keys.key_blocks
    for v, k in zip(tgt.data.vertices, keys[f'mh_{NAME}'].data): v.co = k.co
    tgt.shape_key_clear()
    tb = bmesh.new(); tb.from_mesh(tgt.data); tb.verts.ensure_lookup_table()
    bmesh.ops.delete(tb, geom=[f for f in tb.faces if min(wts[v.index] for v in f.verts) <= 0.0], context='FACES')
    tb.to_mesh(tgt.data); tb.free()
    img = bpy.data.images.new(f'mh_normal_{NAME}', RES, RES, alpha=True, float_buffer=False); img.colorspace_settings.name = 'Non-Color'
    img.pixels = np.zeros(RES * RES * 4, dtype=np.float32).tolist()   # alpha 0 = not baked
    bm_ = bpy.data.materials.new('bake'); bm_.use_nodes = True; nn = bm_.node_tree.nodes.new('ShaderNodeTexImage'); nn.image = img
    bm_.node_tree.nodes.active = nn
    tgt.data.materials.clear(); tgt.data.materials.append(bm_)
    for o in bpy.data.objects: o.select_set(False)
    mh.select_set(True); tgt.select_set(True); bpy.context.view_layer.objects.active = tgt
    sc.render.bake.use_selected_to_active = True; sc.render.bake.cage_extrusion = 0.006; sc.render.bake.max_ray_distance = 0.02
    sc.render.bake.margin = 4; sc.render.bake.normal_space = 'TANGENT'
    bpy.ops.object.bake(type='NORMAL')
    img.filepath_raw = os.path.join(OUT, f'mh_{NAME}_normal_faceonly.png'); img.file_format = 'PNG'; img.save()
    # merge over the game normal map with the feathered mask rasterised into UV space
    gw, gh = orig_normal.size
    base = np.array(orig_normal.pixels[:], dtype=np.float32).reshape(gh, gw, 4)
    if (gw, gh) != (RES, RES):
        log('normal map size', gw, gh, '!= bake', RES)
    bk = np.array(img.pixels[:], dtype=np.float32).reshape(RES, RES, 4)
    # Cycles fills every unbaked texel with a flat normal, so coverage comes from rasterising the face triangles' UVs
    # (Blender image rows run bottom-up, like UV v), weighted by the feathered mask, then grown 3 px for filtering.
    a = np.zeros((RES, RES), dtype=np.float32); uvl = me.uv_layers.active.data
    for p in me.polygons:
        wv = [wts[i] for i in p.vertices]
        if max(wv) <= 0: continue
        uv = [tuple(uvl[li].uv) for li in p.loop_indices]
        for k in range(1, len(uv) - 1):
            tri = np.array([uv[0], uv[k], uv[k + 1]]) * RES; wt = np.array([wv[0], wv[k], wv[k + 1]])
            x0, y0 = np.floor(tri.min(0)).astype(int); x1, y1 = np.ceil(tri.max(0)).astype(int)
            xs, ys = np.meshgrid(np.arange(max(x0, 0), min(x1 + 1, RES)), np.arange(max(y0, 0), min(y1 + 1, RES)))
            P = np.stack([xs + .5, ys + .5], -1)
            (ax, ay), (bx, by), (cx, cy) = tri; den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(den) < 1e-12: continue
            l1 = ((by - cy) * (P[..., 0] - cx) + (cx - bx) * (P[..., 1] - cy)) / den
            l2 = ((cy - ay) * (P[..., 0] - cx) + (ax - cx) * (P[..., 1] - cy)) / den; l3 = 1 - l1 - l2
            inside = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
            val = np.clip(l1 * wt[0] + l2 * wt[1] + l3 * wt[2], 0, 1)
            sub = a[ys[inside], xs[inside]]; a[ys[inside], xs[inside]] = np.maximum(sub, val[inside])
    for _ in range(3):
        g = a.copy(); g[1:] = np.maximum(g[1:], a[:-1]); g[:-1] = np.maximum(g[:-1], a[1:]); g[:, 1:] = np.maximum(g[:, 1:], a[:, :-1]); g[:, :-1] = np.maximum(g[:, :-1], a[:, 1:]); a = g
    # texels the bake never wrote (margins) or filled from a back face / missed ray (normal pointing into the surface) stay 0
    a = a[..., None] * ((bk[..., :3].sum(-1, keepdims=True) > 0.05) & (bk[..., 2:3] > 0.55))
    merged = base.copy(); merged[..., :3] = base[..., :3] * (1 - a) + bk[..., :3] * a
    baked = bpy.data.images.new(f'game_normal_mh_{NAME}', gw, gh, alpha=True); baked.colorspace_settings.name = 'Non-Color'
    baked.pixels = merged.ravel().tolist(); baked.filepath_raw = os.path.join(OUT, f'body_normal_mh_{NAME}.png'); baked.file_format = 'PNG'; baked.save()
    bpy.data.objects.remove(tgt, do_unlink=True)
    REPORT['baked_texels'] = int((a > 0).sum())
    log('normal bake texels', REPORT['baked_texels'])

# ---------- render: current vs MetaHuman-derived ----------
mh.hide_render = True
sc.render.engine = 'CYCLES'; sc.cycles.samples = 64; sc.cycles.use_denoising = True
sc.render.resolution_x = SIZE; sc.render.resolution_y = SIZE
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.16, 0.17, 0.19, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6; sc.world = w
tgtp = Vector((0, g_nose.y - 0.07, g_nose.z + 0.01))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.lens = 85; sc.collection.objects.link(cam); sc.camera = cam
yaw = math.radians(30); cam.location = tgtp + Vector((math.sin(yaw), math.cos(yaw), 0.05)).normalized() * 0.85
cam.rotation_euler = (tgtp - cam.location).to_track_quat('-Z', 'Y').to_euler()
def light(name, energy, off, size, col=(1, 1, 1)):
    l = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA')); l.data.energy = energy; l.data.size = size; l.data.color = col
    sc.collection.objects.link(l); l.location = tgtp + Vector(off); l.rotation_euler = (tgtp - l.location).to_track_quat('-Z', 'Y').to_euler()
light('key', 60, (-0.8, 0.8, 0.6), 0.8, (1, 0.96, 0.9)); light('fill', 18, (0.9, 0.9, 0.1), 1.2, (0.9, 0.95, 1)); light('rim', 40, (0.3, -0.9, 0.5), 0.5)
tiles = []
for label, key_val, nimg in (('current', 0.0, orig_normal), (f'mh_{NAME}', 1.0, baked if baked is not None else orig_normal)):
    body.data.materials.clear(); body.data.materials.append(game_material(nimg))
    body.data.shape_keys.key_blocks[f'mh_{NAME}'].value = key_val
    sc.render.filepath = os.path.join(OUT, f'compare_{NAME}_{label}.png'); bpy.ops.render.render(write_still=True)
    tiles.append(sc.render.filepath)
imgs = [np.array(bpy.data.images.load(t).pixels[:]).reshape(SIZE, SIZE, 4) for t in tiles]
strip = np.concatenate(imgs, axis=1)
out = bpy.data.images.new('strip', strip.shape[1], strip.shape[0], alpha=True); out.pixels = strip.ravel().tolist()
out.filepath_raw = os.path.join(OUT, f'compare_{NAME}.png'); out.file_format = 'PNG'; out.save()

# ---------- export the prototype body with the morph target ----------
body.data.shape_keys.key_blocks[f'mh_{NAME}'].value = 0.0
body.data.materials.clear(); body.data.materials.append(game_material(None))
for o in bpy.data.objects: o.select_set(False)
body.select_set(True); arm.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f'golfer_mh_{NAME}_morph.glb'), use_selection=True, export_morph=True,
                          export_image_format='NONE', export_animations=False)
REPORT['outputs'] = sorted(os.listdir(OUT))
json.dump(REPORT, open(os.path.join(OUT, f'bake_report_{NAME}.json'), 'w'), indent=1)
log('done', json.dumps(REPORT))
