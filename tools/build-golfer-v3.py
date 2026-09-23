"""Chains athlete v3: photoreal Meshy bodies re-rigged on ChainsRig.
Run: blender -b -P tools/build-golfer-v3.py -- [--source <meshy.glb>] [--variant m|f] [--preview <dir>]
Reads a Meshy 7 image-to-3D athlete (~100k triangles, 24-joint auto-rig, 2048 baked albedo), straightens
its A-pose into the ChainsRig rest (arms and legs vertical; the hands stay half open, the runtime morphs the disc hand's
grip), merges the 24 joint weights into the eleven ChainsRig bones, fits the scan's loose tee onto the body as a jersey (fit_shirt: shorter
sleeves on the arm, a waist taper, armpit weights that let the throwing arm rise without a wing of shirt), decimates to a
game body and a phone LOD (the face keeps
most of its triangles), unwraps each body afresh so no triangle straddles a texture seam, then bakes from the
untouched high-res copy: albedo, tangent normals, ambient occlusion, and a world-position map that classifies
every texel into recolourable regions (skin, shirt, shorts, hair, socks, shoes, iris, beard zones).
Hair, headwear and glasses are grown from the measured skull. Writes:
  art/blender/golfer-v3[-f]-source.blend, -lod-source.blend, golfer-v3[-f]-textures/*.png (masters)
  assets/models/golfer[-f].glb, golfer[-f]-lod.glb, golfer[-f]-build-report.json, tools/golfer[-f]-rig.json
then run: python tools/pack-body-textures.py [--variant f] --clean
The female phone LOD is her full body re-exported lean (her decimated scan shatters); to redo just that step from the
committed source blend: blender -b -P tools/build-golfer-v3.py -- --variant f --lod-from-full
"""
from pathlib import Path
import sys, json, math, shutil
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/models'; SOURCE = ROOT / 'art/blender'
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(flag, default=None): return argv[argv.index(flag) + 1] if flag in argv else default
VARIANT = arg('--variant', 'm')
TAG = '' if VARIANT == 'm' else '-' + VARIANT      # file names: golfer-f.glb, golfer-v3-f-source.blend
KEY = '' if VARIANT == 'm' else '_' + VARIANT      # manifest keys: golfer_f, body_f_albedo
TEXSRC = SOURCE / f'golfer-v3{TAG}-textures'
PREVIEW = '--preview' in argv
PREVIEW_DIR = Path(arg('--preview', 'docs/qa/r7'))
if not PREVIEW_DIR.is_absolute(): PREVIEW_DIR = ROOT / PREVIEW_DIR   # Blender resolves bare relative render paths against the drive root
DEFAULT_SOURCE = {'m': str(ROOT / 'art/meshy/athlete-m2/athlete-m2.glb'), 'f': str(ROOT / 'art/meshy/athlete-f.glb')}   # m2: Meshy multi-image scan (grey raglan tee, black shorts, grey trail shoes); art/meshy is local only
MESHY = Path(arg('--source', DEFAULT_SOURCE.get(VARIANT, '')))
BUDGET = {'full': 12400, 'lod': 6200}   # body triangles; hair, headwear and glasses variants ride on top
TEX = 2048
REPORT = {}
BONES = ['root', 'spine', 'head', 'shR', 'elR', 'shL', 'elL', 'hipR', 'knR', 'hipL', 'knL']
PARENTS = {'root': None, 'spine': 'root', 'head': 'spine', 'shR': 'spine', 'elR': 'shR', 'shL': 'spine', 'elL': 'shL', 'hipR': 'root', 'knR': 'hipR', 'hipL': 'root', 'knL': 'hipL'}
# Meshy joint -> ChainsRig bone. Clavicles ride the spine, the hand and toes ride the forearm and shin.
MAP = {'Hips': 'root', 'Spine02': 'spine', 'Spine01': 'spine', 'Spine': 'spine', 'LeftShoulder': 'spine', 'RightShoulder': 'spine',
       'neck': 'head', 'Head': 'head', 'head_end': 'head', 'headfront': 'head',
       'RightArm': 'shR', 'RightForeArm': 'elR', 'RightHand': 'elR', 'LeftArm': 'shL', 'LeftForeArm': 'elL', 'LeftHand': 'elL',
       'RightUpLeg': 'hipR', 'RightLeg': 'knR', 'RightFoot': 'knR', 'RightToeBase': 'knR', 'LeftUpLeg': 'hipL', 'LeftLeg': 'knL', 'LeftFoot': 'knL', 'LeftToeBase': 'knL'}
REGIONS = ['skin', 'jersey', 'shorts', 'hair', 'socks', 'shoes', 'iris']

def xyz(p): return (p[0], -p[2], p[1])          # game -> Blender
def game(v): return (v.x, v.z, -v.y)            # Blender -> game (glTF y-up, -z forward)

def log(*a): print('CHAINS', *a, flush=True)

# ---------- generic helpers ----------
def material(name, color, rough=.8):
  m = bpy.data.materials.new(name); m.use_nodes = True
  bs = m.node_tree.nodes.get('Principled BSDF')
  bs.inputs['Base Color'].default_value = (*color, 1); bs.inputs['Roughness'].default_value = rough
  m.diffuse_color = (*color, 1)
  return m

def select(objs):
  bpy.ops.object.select_all(action='DESELECT')
  for o in objs: o.select_set(True)
  bpy.context.view_layer.objects.active = objs[0]

def apply_mod(o, mod):
  select([o]); bpy.ops.object.modifier_apply(modifier=mod.name)

def join(objs, name):
  objs = [o for o in objs if o is not None]; select(objs)
  if len(objs) > 1: bpy.ops.object.join()
  o = objs[0]; o.name = name; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True); return o

def smooth(o):
  for p in o.data.polygons: p.use_smooth = True

def ell(name, pos, r, mat=None, seg=20, rings=12, rot=(0, 0, 0)):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=xyz(pos), calc_uvs=True)
  o = bpy.context.object; o.name = name; o.scale = (r[0], r[2], r[1]); o.rotation_euler = rot
  bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
  if mat is not None: o.data.materials.append(mat)
  smooth(o); return o

def torus(name, pos, R, r, mat=None, tilt=0, major=28, minor=8, squash=1, scale=(1, 1)):
  bpy.ops.mesh.primitive_torus_add(major_segments=major, minor_segments=minor, location=xyz(pos), major_radius=R, minor_radius=r, generate_uvs=True)
  o = bpy.context.object; o.name = name; o.rotation_euler = (tilt, 0, 0); o.scale = (scale[0], scale[1], squash)   # scale in the ring's own plane (width, height) about its centre
  bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
  if mat is not None: o.data.materials.append(mat)
  smooth(o); return o

def capsule(name, a, b, r1, r2, mat=None, seg=12, steps=4):
  A, B = Vector(a), Vector(b); d = B - A; L = d.length; n = d / L
  up = Vector((0, 0, 1)) if abs(n.y) > .9 else Vector((0, 1, 0))
  u = n.cross(up).normalized(); v = n.cross(u)
  ring_pos = [(A - n * r1 * math.sin(math.pi / 2 * (1 - k / steps)), r1 * math.cos(math.pi / 2 * (1 - k / steps))) for k in range(steps + 1)]
  ring_pos += [(B + n * r2 * math.sin(math.pi / 2 * (k / steps)), r2 * math.cos(math.pi / 2 * (k / steps))) for k in range(steps + 1)]
  verts, faces, uvs = [], [], []
  for c, r in ring_pos:
    for i in range(seg):
      ang = i * math.tau / seg; verts.append(xyz(c + u * math.cos(ang) * r + v * math.sin(ang) * r))
  for j in range(len(ring_pos) - 1):
    for i in range(seg):
      p, q = j * seg + i, j * seg + (i + 1) % seg; faces.append((p, q, q + seg, p + seg))
      uvs.append([(i / seg, j / len(ring_pos)), ((i + 1) / seg, j / len(ring_pos)), ((i + 1) / seg, (j + 1) / len(ring_pos)), (i / seg, (j + 1) / len(ring_pos))])
  me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
  o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
  if mat is not None: me.materials.append(mat)
  layer = me.uv_layers.new(name='UVMap')
  for poly, corners in zip(me.polygons, uvs):
    for li, uv in zip(poly.loop_indices, corners): layer.data[li].uv = uv
  smooth(o); return o

def solidify(o, thickness):
  m = o.modifiers.new('cloth', 'SOLIDIFY'); m.thickness = thickness; m.offset = 1; m.use_rim = True; apply_mod(o, m); smooth(o); return o

def tris(o):
  o.data.calc_loop_triangles(); return len(o.data.loop_triangles)

def decimate_to(o, target, protect=None):
  n = tris(o)
  if n <= target: return o
  m = o.modifiers.new('decimate', 'DECIMATE'); m.ratio = target / n; m.use_collapse_triangulate = True
  if protect: m.vertex_group = protect; m.vertex_group_factor = 1.0   # weight 1 collapses freely, weight 0 never collapses
  apply_mod(o, m); smooth(o); return o

def cut(o, keep):
  mw = o.matrix_world; bm = bmesh.new(); bm.from_mesh(o.data)
  bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(game(mw @ f.calc_center_median()))], context='FACES')
  bm.to_mesh(o.data); bm.free()

def meshes(): return [o for o in bpy.context.scene.objects if o.type == 'MESH']

def rigid(o, bone):
  vg = o.vertex_groups.new(name=bone); vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')

# ---------- source ----------
def import_source():
  bpy.ops.wm.read_factory_settings(use_empty=True)
  for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
  for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.actions, bpy.data.armatures):
    for d in list(coll):
      if d.users == 0: coll.remove(d)
  bpy.ops.import_scene.gltf(filepath=str(MESHY))
  arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
  body = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.parent == arm)
  for o in list(bpy.context.scene.objects):
    if o.type == 'MESH' and o is not body: bpy.data.objects.remove(o, do_unlink=True)
  arm.animation_data_clear()   # Meshy may ship a preview clip; the rest pose is what we straighten
  for pb in arm.pose.bones: pb.matrix_basis = Matrix.Identity(4)
  arm.rotation_mode = 'XYZ'; arm.rotation_euler = (0, 0, math.pi)   # Meshy faces -Y; ChainsRig faces +Y in Blender (-Z in glTF). The importer leaves quaternion mode, so set the mode first.
  bpy.context.view_layer.update()
  return arm, body

def aim(arm, pb, target):
  """Rotate a pose bone (about its head, in world space) so its child joint lies along target."""
  mw = arm.matrix_world; R = mw.to_3x3().normalized()
  head = mw @ pb.head; child = mw @ pb.children[0].head
  q = (child - head).normalized().rotation_difference(Vector(target).normalized())
  qa = (R.inverted() @ q.to_matrix() @ R).to_quaternion()
  pb.matrix = Matrix.Translation(pb.head) @ qa.to_matrix().to_4x4() @ Matrix.Translation(-pb.head) @ pb.matrix
  bpy.context.view_layer.update()

def straighten(arm):
  """A-pose -> ChainsRig rest: arms hang vertically, thighs vertical, shins keep their natural lean."""
  pose = arm.pose.bones; mw = arm.matrix_world
  for s in ('Left', 'Right'):
    aim(arm, pose[s + 'Arm'], (0, 0, -1)); aim(arm, pose[s + 'ForeArm'], (0, 0, -1))
    aim(arm, pose[s + 'UpLeg'], (0, 0, -1))
    pb = pose[s + 'Leg']; d = (mw @ pb.children[0].head) - (mw @ pb.head); aim(arm, pb, (0, d.y, d.z))
  return {b.name: game(mw @ b.head) for b in pose}

def merge_seams(body):
  # merge the seam-split vertices (Meshy 7 leaves them up to half a millimetre apart); open seams resist decimation and starve the face
  bm = bmesh.new(); bm.from_mesh(body.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=5e-4)
  REPORT['seams'] = {'verts': len(bm.verts), 'boundary': sum(1 for e in bm.edges if e.is_boundary)}; log('seams', json.dumps(REPORT['seams']))
  bm.to_mesh(body.data); bm.free()

def unhook_flank(body, J):
  """Meshy's auto-rig can skin the torso's flank beside the hanging elbow (and the waist beside the forearm) partly or wholly
  to the arm (the m2 scan: waist vertices at 1.0 on the forearm). Raised, the arm dragged a sheet of shirt out of the ribs:
  a web to the disc hand at the tee, torn shards under the akimbo arm in the menu. In the scan's A-pose the arm stands clear
  of the torso, so arm weight on a vertex 7-10 cm or more from the arm's bone chain goes to the torso groups it already has."""
  c = world_coords(body); n = len(c); gi = {vg.name: vg.index for vg in body.vertex_groups}   # the joints are in world space; the parented scan's own coordinates still face the other way
  Wm = np.zeros((n, len(body.vertex_groups)), np.float32)
  for v in body.data.vertices:
    for g in v.groups: Wm[v.index, g.group] = g.weight
  ss = lambda a, b, t: (lambda u: u * u * (3 - 2 * u))(np.clip((t - a) / (b - a), 0, 1))
  tor = [gi[k] for k in ('Spine02', 'Spine01', 'Spine', 'Hips') if k in gi]; before = Wm.copy(); moved_n = 0
  for s in ('Left', 'Right'):
    P = [np.array(J[s + k], np.float32) for k in ('Arm', 'ForeArm', 'Hand')]; P.append(P[2] + (P[2] - P[1]) / np.linalg.norm(P[2] - P[1]) * .19)   # to the fingertips
    d = np.full(n, 9.0, np.float32)
    for a, b in zip(P[:-1], P[1:]):
      t = np.clip((c - a) @ (b - a) / float((b - a) @ (b - a)), 0, 1); d = np.minimum(d, np.linalg.norm(c - (a + t[:, None] * (b - a)), axis=1))
    k = ss(.07, .1, d); arm = [gi[s + x] for x in ('Arm', 'ForeArm', 'Hand') if s + x in gi]
    near = body.vertex_groups.new(name='near' + s[0])   # fit_shirt: only surface near the arm in the A-pose can be sleeve (the hanging arm overlaps the lats by ~3 cm)
    for j in np.nonzero(k < .5)[0].tolist(): near.add([j], 1.0, 'REPLACE')
    moved = Wm[:, arm].sum(1) * k; Wm[:, arm] *= (1 - k)[:, None]; moved_n += int((moved > .05).sum())
    have = Wm[:, tor].sum(1, keepdims=True)
    share = np.where(have > 1e-4, Wm[:, tor] / np.maximum(have, 1e-4), 0)
    up = c[:, 1] > J['Spine01'][1]   # no torso weight yet: by height, the chest bone or the hips
    share[(have[:, 0] <= 1e-4) & up, tor.index(gi['Spine01'])] = 1; share[(have[:, 0] <= 1e-4) & ~up, tor.index(gi['Hips'])] = 1
    Wm[:, tor] += moved[:, None] * share
  for j in np.nonzero(np.abs(Wm - before).max(1) > 1e-5)[0].tolist():
    for g, vg in enumerate(list(body.vertex_groups)[:Wm.shape[1]]):
      if Wm[j, g] > 1e-5: vg.add([j], float(Wm[j, g]), 'REPLACE')
      elif before[j, g] > 0: vg.remove([j])
  REPORT['unhooked'] = moved_n; log('unhooked flank verts', moved_n)

def bake_pose(arm, body):
  mod = next(m for m in body.modifiers if m.type == 'ARMATURE'); apply_mod(body, mod)
  select([body]); bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
  bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
  bpy.data.objects.remove(arm, do_unlink=True)

def remap_weights(body):
  names = [vg.name for vg in body.vertex_groups]; acc = {b: {} for b in BONES}
  for v in body.data.vertices:
    for g in v.groups:
      t = MAP.get(names[g.group])
      if t and g.weight > 1e-4: acc[t][v.index] = acc[t].get(v.index, 0.0) + g.weight
  for vg in list(body.vertex_groups):
    if not vg.name.startswith('near'): body.vertex_groups.remove(vg)   # unhook_flank's arm-side maps stay for fit_shirt
  for b in BONES:
    vg = body.vertex_groups.new(name=b)
    for i, w in acc[b].items(): vg.add([i], w, 'REPLACE')

def weights(body, bone):
  """Weight of a ChainsRig bone per vertex; before remap_weights it is the sum of the Meshy groups that map to it."""
  names = {vg.name: vg.index for vg in body.vertex_groups}
  idx = {names[bone]} if bone in names else {names[m] for m, t in MAP.items() if t == bone and m in names}
  out = np.zeros(len(body.data.vertices), np.float32)
  for v in body.data.vertices:
    for g in v.groups:
      if g.group in idx: out[v.index] += g.weight
  return np.minimum(out, 1)

def coords(body):
  n = len(body.data.vertices); buf = np.empty(n * 3, np.float32); body.data.vertices.foreach_get('co', buf)
  b = buf.reshape(n, 3); return np.stack([b[:, 0], b[:, 2], -b[:, 1]], 1)   # game coords

def set_coords(body, c):
  body.data.vertices.foreach_set('co', np.ascontiguousarray(np.stack([c[:, 0], -c[:, 2], c[:, 1]], 1), np.float32).reshape(-1)); body.data.update()

def hand_box(c, h):
  return (np.abs(c[:, 0] - h[0]) < .08) & (np.abs(c[:, 2] - h[2]) < .1) & (c[:, 1] < h[1] + .015) & (c[:, 1] > h[1] - .26)

SLEEVE = .17   # the fitted sleeve ends this far below the shoulder joint; pack-body-textures.py recolours the scan's longer sleeve below it as arm
def fit_shirt(body, RIG, ref=None, rewire=True):
  """The scan wears a loose tee: its sleeves stand off the arm and reach the elbow, its sides hang straight from the chest to
  the thigh, and the auto-rig skinned the flank under each armpit to the upper arm, so the raised throwing arm dragged the
  shirt's side out into a wing. In the rest pose (arms hanging): the flank facing each arm goes to the chest bones, the sleeve
  and the arm's back and front up to the joint go wholly to the arm, and the chest and back beside the joint to the torso; the
  sleeve and shoulder cap are pulled toward the arm's axis and the sleeve shortened; the torso is tapered from the armpit to
  the waist (sides in, lower back forward), widens again to the hips and eases back to the shorts' own width at the cuffs.
  ref: the full body's measurements, so the phone LOD is fitted to the same shape. rewire: the weight moves read which side
  of the armpit a vertex faces from its normal; the female scan's doubled, partly flipped cloth layers would be torn apart
  by that (twin layers riding different bones), so she keeps her weights and gets only the shape, which is position-only."""
  c = coords(body); n = len(c); x, y, z = c[:, 0], c[:, 1], c[:, 2]
  nb = np.empty(n * 3, np.float32); body.data.vertices.foreach_get('normal', nb); nb = nb.reshape(n, 3); nrm = np.stack([nb[:, 0], nb[:, 2], -nb[:, 1]], 1)
  W = {b: weights(body, b) for b in BONES}; W0 = {b: w.copy() for b, w in W.items()}
  ss = lambda a, b, t: (lambda u: u * u * (3 - 2 * u))(np.clip((t - a) / (b - a), 0, 1))   # smoothstep; a > b runs downhill
  hipY = (RIG['hipR'][1] + RIG['hipL'][1]) / 2; kneeY = (RIG['knR'][1] + RIG['knL'][1]) / 2
  d = np.zeros_like(c); geo = {'hem': {}}
  for side, s in (('R', 1), ('L', -1)):
    sh, el = 'sh' + side, 'el' + side; S, E = RIG[sh], RIG[el]
    near = weights(body, 'near' + side) > .5 if 'near' + side in body.vertex_groups else np.ones(n, bool)   # unhook_flank: surface by the arm in the A-pose
    if ref: ax, az, rs, apex = ref[side]
    else:   # the arm's axis and radius from its skin above the elbow (hers is a few coarse rings: the whole elbow region, else the joint)
      low = (W[sh] + W[el] > .9) & (y > E[1] + .02) & (y < E[1] + .07) & (s * x > .06)
      if low.sum() < 8: low = (W[sh] + W[el] > .5) & (y > E[1] - .12) & (y < E[1] + .1) & (s * x > .03)
      ax, az, rs = (float(np.median(x[low])), float(np.median(z[low])), 0) if low.sum() >= 6 else (S[0], S[2], .034)
      rs = rs or float(np.median(np.hypot(x[low] - ax, z[low] - az)))
    dx, dz = x - ax, z - az; r = np.hypot(dx, dz); out = (dx * nrm[:, 0] + dz * nrm[:, 2]) / np.maximum(r, 1e-6)   # +1: the normal leaves the arm's axis
    flank = (out < -.3) & (s * x > .03) & (s * x < s * ax - .01) & (y > E[1]) & (y < S[1] - .03) & (r < .16)   # torso side facing the arm
    if not ref: apex = float(np.percentile(y[flank], 95)) if flank.sum() > 10 else S[1] - .12   # the armpit: top of that flank
    geo[side] = (ax, az, rs, apex)
    if rewire:
      f = flank * (1 - ss(apex - .03, apex + .05, y)) * ss(.15, .45, -out)
      moved = f * (W[sh] + W[el]); W[sh] *= 1 - f; W[el] *= 1 - f
      tor = W['spine'] + W['root']; share = np.where(tor > 1e-3, W['spine'] / np.maximum(tor, 1e-3), (y > (RIG['root'][1] + RIG['spine'][1]) / 2).astype(np.float32))
      W['spine'] += moved * share; W['root'] += moved * (1 - share)
      f2 = (y > apex - .08) * (1 - ss(s * ax - .08, s * ax - .02, s * x)); moved2 = f2 * W[sh]; W[sh] -= moved2; W['spine'] += moved2   # chest and back medial of the joint
      sleeve = (out > .1) & (s * x > .05) & (r < rs * 2.8) & (y > E[1]) & (y < apex) & near   # the m2 scan's hanging arm sinks into the lats: without `near` its flank read as sleeve and went to the arm (spikes at the waist)
      upper = (s * x > s * ax - .03) & (r < .1) & (y >= apex) & (y < S[1]) & near
      g = sleeve * (1 - ss(apex - .07, apex, y)) + upper * ss(s * ax - .03, s * ax, s * x) * (1 - ss(S[1] - .07, S[1] - .01, y)); tor = W['spine'] + W['root']
      W[sh] += g * tor; W['spine'] *= 1 - g; W['root'] *= 1 - g
    # toward the arm's axis, as much as the vertex rides the arm: below the new hem onto the arm's own radius, above it the
    # sleeve keeps a few millimetres of cloth and a fifth of its slack
    hem = S[1] - SLEEVE; rarm = rs * (1.1 + .45 * ss(E[1], S[1], y)); geo['hem'][side] = round(float(hem), 4)
    below = 1 - ss(hem - .012, hem, y); rt = rarm + (1 - below) * (rarm * .08 + .004)
    m = np.clip(W[sh], 0, 1) * (1 - ss(.10, .16, r)) * ss(E[1] + .02, E[1] + .06, y) * (1 - ss(S[1] + .01, S[1] + .07, y)) * (s * x > .03) * near
    ex = np.maximum(0, r - rt) * m * (1 - .2 * (1 - below))
    d[:, 0] -= ex * dx / np.maximum(r, 1e-6); d[:, 2] -= ex * dz / np.maximum(r, 1e-6)
  # torso taper from 1 cm sections of the surface (the decimated torso has few vertices, its edges are dense enough), arms excluded
  apex = min(geo['R'][3], geo['L'][3]); tw = 1 - np.clip(W['shR'] + W['elR'] + W['shL'] + W['elL'], 0, 1)
  body.data.calc_loop_triangles(); T = np.empty(len(body.data.loop_triangles) * 3, np.int32); body.data.loop_triangles.foreach_get('vertices', T); T = T.reshape(-1, 3); A = c[T]
  def section(yy):
    s = A[:, :, 1] - yy; q = []
    for i, j in ((0, 1), (1, 2), (2, 0)):
      m = (s[:, i] < 0) != (s[:, j] < 0); u = (s[m, i] / (s[m, i] - s[m, j]))[:, None]
      q.append(np.concatenate([A[m, i] + u * (A[m, j] - A[m, i]), tw[T[m, i]][:, None] * (1 - u) + tw[T[m, j]][:, None] * u], 1))
    q = np.concatenate(q); return q[q[:, 3] > .5]
  ys = np.arange(kneeY + .1, apex + .005, .01); st = np.full((len(ys), 4), np.nan)
  for k, yy in enumerate(ys):
    q = section(yy)
    if len(q) >= 12: x0 = float(np.median(q[:, 0])); st[k] = x0, np.percentile(np.abs(q[:, 0] - x0), 95), np.percentile(q[:, 2], 3), np.percentile(q[:, 2], 97)
  ok = ~np.isnan(st[:, 0]); st = np.stack([np.interp(ys, ys[ok], st[ok, i]) for i in range(4)], 1)
  med = lambda v: np.array([np.median(v[max(0, i - 3):i + 4]) for i in range(len(v))])   # a stray hand or fold in a band or two must not set the taper
  bx0, bhw, bzf, bzb = (med(st[:, i]) for i in range(4)); bhw = np.minimum(bhw, 1.15 * np.median(bhw))
  top = ys > apex - .06
  chw, czf, czb = ref['chest'] if ref else (float(bhw[top].mean()), float(bzf[top].mean()), float(bzb[top].mean())); geo['chest'] = (chw, czf, czb); zc = (czf + czb) / 2
  # half-width: the chest's at the armpit, the same at the waist, 1.22 x it at the hip joints; the back comes forward ~16 %
  # toward the waist (lumbar curve) and the belly flattens a little
  key = [hipY, hipY + .45 * (apex - hipY), apex - .1]
  sx = np.minimum(1, np.interp(ys, key, [1.22, 1.0, 1.02]) * chw / np.maximum(bhw, 1e-3))
  szb = np.minimum(1, (zc + (czb - zc) * np.interp(ys, key, [1.0, .84, 1.0]) - zc) / np.maximum(bzb - zc, 1e-3))
  szf = np.minimum(1, (zc + (czf - zc) * np.interp(ys, key, [1.02, .92, 1.0]) - zc) / np.minimum(bzf - zc, -1e-3))
  # below the hip joints the shorts ease back out to their own width at the cuffs (the thighs under them never move): held
  # wide under a fitted shirt they read as puffy
  cuffY = kneeY + .12; legs = ys < hipY
  sx = np.where(legs, 1 - (1 - np.interp(hipY, ys, sx)) * np.clip((ys - cuffY) / (hipY - cuffY), 0, 1), sx)
  fz = ss(hipY - .16, hipY - .02, ys) * ss(apex + .01, apex - .08, ys); fx = np.where(legs, ss(apex + .01, apex - .08, ys), fz)
  sx, szb, szf = 1 - (1 - sx) * fx, 1 - (1 - szb) * fz, 1 - (1 - szf) * fz
  inb = (y > ys[0]) & (y < ys[-1]); X0 = np.interp(y, ys, bx0); SX = np.interp(y, ys, sx); SZ = np.where(z > zc, np.interp(y, ys, szb), np.interp(y, ys, szf))
  d[:, 0] += inb * tw * (X0 + (x - X0) * SX - x); d[:, 2] += inb * tw * (zc + (z - zc) * SZ - z)
  set_coords(body, c + d)
  # the scan's own cuff, now bare arm a few centimetres under the new hem, stays a ridge round the upper arm: relax that band
  bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table(); cc = c + d
  for side, s in (('R', 1), ('L', -1)):
    h = geo['hem'][side]; band = np.nonzero((W['sh' + side] + W['el' + side] > .6) & (s * cc[:, 0] > .05) & (cc[:, 1] > h - .08) & (cc[:, 1] < h - .003))[0]
    for _ in range(6): bmesh.ops.smooth_vert(bm, verts=[bm.verts[i] for i in band.tolist()], factor=.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
  bm.to_mesh(body.data); bm.free()
  for b in BONES:
    ch = np.nonzero(np.abs(W[b] - W0[b]) > 1e-4)[0]; vg = body.vertex_groups[b]
    for i in ch.tolist():
      if W[b][i] > 1e-4: vg.add([i], float(W[b][i]), 'REPLACE')
      else: vg.remove([i])
  for g in [vg for vg in body.vertex_groups if vg.name.startswith('near')]: body.vertex_groups.remove(g)
  REPORT.setdefault('fit', []).append({'arms': {k: [round(float(v), 4) for v in geo[k]] for k in 'RL'}, 'chest': [round(v, 4) for v in geo['chest']], 'waistScale': round(float(sx[np.argmin(np.abs(ys - key[1]))]), 3), 'maxMove': round(float(np.linalg.norm(d, axis=1).max()), 4)})
  log('fit', json.dumps(REPORT['fit'][-1])); return geo

def decimate_split(body, J, budget, share=.3):
  """Two passes with an explicit budget: first the body collapses while the face and hands are pinned (weight 0
  never collapses), then the face and hands collapse to their own share while the body is pinned. One mesh, no
  seam, and the face keeps its triangles on every scan regardless of how dense the source happened to be."""
  def regions():   # recomputed per pass: applying a modifier renumbers the vertices
    c = coords(body); d = weights(body, 'head') > .5
    for side in ('Right', 'Left'): d |= hand_box(c, np.array(J[side + 'Hand'], np.float32))
    body.data.calc_loop_triangles(); vi = np.empty(len(body.data.loop_triangles) * 3, np.int32); body.data.loop_triangles.foreach_get('vertices', vi)
    t = d[vi.reshape(-1, 3)].all(1); return d, int(t.sum()), int((~t).sum())
  d, nd, nr = regions(); bd = min(nd, int(budget * share)); br = min(nr, budget - bd); before = (nd, nr)
  body.vertex_groups.new(name='coarse')
  for pin_detail, keep in ((True, br), (False, bd)):
    d, nd, nr = regions(); mask = ~d if pin_detail else d; have = nr if pin_detail else nd
    vg = body.vertex_groups['coarse']; vg.add(list(range(len(d))), 0.0, 'REPLACE'); vg.add(np.nonzero(mask)[0].tolist(), 1.0, 'REPLACE')
    decimate_to(body, tris(body) - (have - keep), 'coarse')
  body.vertex_groups.remove(body.vertex_groups['coarse'])
  log('decimated', json.dumps({'detailTris': before[0], 'bodyTris': before[1], 'detailBudget': bd, 'bodyBudget': br, 'result': tris(body)}))

def detail_group(body, J):
  """Decimation weight map: 1 collapses freely, 0 never collapses. The face keeps most of its triangles, the
  hands about half, so the game body spends its budget where the camera looks."""
  c = coords(body); w = np.ones(len(c), np.float32)
  w[weights(body, 'head') > .5] = .78
  for side in ('Right', 'Left'): w[hand_box(c, np.array(J[side + 'Hand'], np.float32))] = .8
  vg = body.vertex_groups.new(name='coarse')
  for i, x in enumerate(w.tolist()): vg.add([i], x, 'REPLACE')
  return 'coarse'

def unwrap(o):
  """Fresh islands for the decimated body: Meshy's atlas is hundreds of tiny islands and collapsed edges smear
  UVs across their gutters (white and black specks). Smart-projected islands with a real margin bake clean."""
  select([o]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
  bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.004, correct_aspect=True, scale_to_bounds=False)
  bpy.ops.uv.select_all(action='SELECT')
  bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method='SCALED', margin=.004, shape_method='AABB')   # smart project alone leaves half the atlas empty; boxes never overlap
  bpy.ops.object.mode_set(mode='OBJECT')

# ---------- bakes ----------
def cycles_gpu():
  sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.use_denoising = False
  try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA'):
      try: prefs.compute_device_type = kind; break
      except TypeError: continue
    prefs.get_devices()
    for d in prefs.devices: d.use = d.type != 'CPU'
    sc.cycles.device = 'GPU'
  except Exception as e: log('cycles gpu unavailable, cpu bake', e)
  sc.render.bake.margin = 16 if TEX >= 2048 else 8; sc.render.bake.margin_type = 'EXTEND'; sc.render.bake.use_clear = True

def float_image(name, data=False):
  img = bpy.data.images.new(name, TEX, TEX, alpha=True, float_buffer=True)
  img.colorspace_settings.name = 'Non-Color' if data else 'sRGB'; return img

def bake(body, hi, kind, img, **kw):
  mat = body.data.materials[0]; nodes = mat.node_tree.nodes
  n = nodes.get('bake') or nodes.new('ShaderNodeTexImage'); n.name = 'bake'; n.image = img; nodes.active = n
  select([hi, body] if hi else [body]); bpy.context.view_layer.objects.active = body
  bpy.ops.object.bake(type=kind, use_selected_to_active=hi is not None, **kw)

def pixels(img):
  buf = np.empty(TEX * TEX * 4, np.float32); img.pixels.foreach_get(buf); return buf.reshape(TEX, TEX, 4)

def save_png(name, rgba, data=False):
  img = float_image('out_' + name, data); flat = np.ascontiguousarray(rgba, np.float32).reshape(-1)
  img.pixels.foreach_set(flat); img.filepath_raw = str(TEXSRC / (name + '.png')); img.file_format = 'PNG'; img.save()
  bpy.data.images.remove(img)

def boxblur(a, r):
  """Separable box blur of radius r texels (cumulative sums), edge-clamped."""
  def run(x):
    p = np.pad(x, ((r, r + 1), (0, 0)), mode='edge'); c = np.cumsum(p, 0); return (c[2 * r + 1:] - c[:-2 * r - 1]) / (2 * r + 1)
  return run(run(a).T).T

def linear_to_srgb(c): return np.where(c <= .0031308, c * 12.92, 1.055 * np.power(np.maximum(c, 1e-7), 1 / 2.4) - .055)

def blur3(m):
  p = np.pad(m, 1, mode='edge'); return sum(p[1 + dy:TEX + 1 + dy, 1 + dx:TEX + 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)) / 9

def emit_material(name, img):
  m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
  out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img
  nt.links.new(tx.outputs['Color'], em.inputs['Color']); nt.links.new(em.outputs[0], out.inputs['Surface']); return m

def bake_textures(body, hi, J, head, lod):
  """Albedo, normal and AO from the high-res copy onto the body's fresh UVs, a position map from the body
  itself, then the region masks. LOD bodies get their own 1024 set (no normal map)."""
  sfx = '_lod' if lod else ''
  TEXSRC.mkdir(parents=True, exist_ok=True); cycles_gpu()
  keep_mat = body.data.materials[0]
  alb_img = float_image('alb', True); bake(body, hi, 'EMIT', alb_img, cage_extrusion=.02, max_ray_distance=.06)
  col = pixels(alb_img)[:, :, :3].copy(); bpy.data.images.remove(alb_img)   # scene-linear, straight from the Meshy albedo
  # world position (encoded 0..1) baked from the game body's own surface
  pm = bpy.data.materials.new('posbake'); pm.use_nodes = True; nt = pm.node_tree; nt.nodes.clear()
  outn = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); geo = nt.nodes.new('ShaderNodeNewGeometry')
  mul = nt.nodes.new('ShaderNodeVectorMath'); mul.operation = 'MULTIPLY_ADD'; mul.inputs[1].default_value = (.5, .5, .5); mul.inputs[2].default_value = (.5, .5, .0)
  nt.links.new(geo.outputs['Position'], mul.inputs[0]); nt.links.new(mul.outputs[0], em.inputs['Color']); nt.links.new(em.outputs[0], outn.inputs['Surface'])
  body.data.materials[0] = pm
  pos_img = float_image('pos', True); bake(body, None, 'EMIT', pos_img)
  P = pixels(pos_img); body.data.materials[0] = keep_mat; bpy.data.materials.remove(pm)
  hit = P[:, :, :3].sum(2) > 1e-6
  # a transfer ray that starts under a fold the decimation cut away misses the scan and leaves a black texel: inpaint from neighbours
  miss = hit & (col.sum(2) < .01); valid = (hit & ~miss).astype(np.float32); fill = col.copy(); have = ~miss
  for rad in (2, 6, 16, 48):
    w = boxblur(valid, rad); c = np.stack([boxblur(col[:, :, i] * valid, rad) for i in range(3)], -1) / np.maximum(w, 1e-6)[:, :, None]
    take = ~have & (w > 1e-4); fill[take] = c[take]; have |= take
  REPORT['albedoMisses' + sfx] = float(miss.mean()); col = fill
  # forearm map from the elbow-bone weights: skin below the elbow is never shirt, whatever colour the scan gave it
  fw = np.clip(weights(body, 'elR') + weights(body, 'elL'), 0, 1); uw = np.clip(weights(body, 'shR') + weights(body, 'shL'), 0, 1)
  ca = body.data.color_attributes.new(name='armw', type='FLOAT_COLOR', domain='POINT')
  buf = np.stack([fw, uw, np.zeros_like(fw), np.ones_like(fw)], 1).astype(np.float32); ca.data.foreach_set('color', buf.reshape(-1))
  am = bpy.data.materials.new('armbake'); am.use_nodes = True; nt = am.node_tree; nt.nodes.clear()
  outn = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'armw'
  nt.links.new(at.outputs['Color'], em.inputs['Color']); nt.links.new(em.outputs[0], outn.inputs['Surface'])
  body.data.materials[0] = am; arm_img = float_image('armw', True); bake(body, None, 'EMIT', arm_img)
  armpix = pixels(arm_img); forearm = armpix[:, :, 0] > .5; upperarm = armpix[:, :, 1] > .5; body.data.materials[0] = keep_mat; bpy.data.materials.remove(am); bpy.data.images.remove(arm_img); body.data.color_attributes.remove(ca)
  px = (P[:, :, 0] - .5) * 2; py = (P[:, :, 2]) * 2; pz = -(P[:, :, 1] - .5) * 2   # Blender xyz -> game x, y, z
  # high-res -> game body: tangent normals and occlusion
  if not lod:
    nrm_img = float_image('nrm', True); bake(body, hi, 'NORMAL', nrm_img, normal_space='TANGENT', cage_extrusion=.02, max_ray_distance=.06)
    N = pixels(nrm_img); miss = N[:, :, 2] < .55; N[miss] = (.5, .5, 1, 1)
  bpy.context.scene.cycles.samples = 48
  ao_img = float_image('ao', True); bake(body, hi, 'AO', ao_img, cage_extrusion=.02, max_ray_distance=.06)
  AO = pixels(ao_img)[:, :, 0]; AO = np.where(hit & (AO < .02), 1.0, AO)   # a ray that finds no scan surface is a miss, not a cave: treat it as open
  # ---- classify ----
  # colour tests first, then every texel takes the class its neighbourhood votes for: a shadowed crease on a
  # thigh stays skin, a highlight on a sleeve stays shirt, and silhouette rims stop leaking into other regions
  lum = .2126 * col[:, :, 0] + .7152 * col[:, :, 1] + .0722 * col[:, :, 2]
  mx = col.max(2); mn = col.min(2); sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
  warm = (col[:, :, 0] >= col[:, :, 1]) & (col[:, :, 1] >= col[:, :, 2] * .95)
  eyeY, headZ, faceZ = head['eyeY'], J['Head'][2], head['faceZ']
  neckY, hipY, kneeY, ankleY = J['neck'][1], J['RightUpLeg'][1], J['RightLeg'][1], J['RightFoot'][1]
  chinY = head['chin']
  headzone = hit & (py > neckY + .02)
  front = pz < headZ - .04
  darkraw = hit & (lum < .04) & ((sat < .5) | (lum < .012))
  skinraw = hit & (sat > .27) & warm & ~darkraw
  lightraw = hit & ~skinraw & ~darkraw
  vr = max(3, TEX // 340)
  votes = np.stack([boxblur(m.astype(np.float32), vr) for m in (skinraw, darkraw, lightraw)], -1); cls = votes.argmax(-1)
  skin_c = hit & (cls == 0); dark_c = hit & (cls == 1); light_c = hit & (cls == 2)
  hair = headzone & dark_c & ((front & (py > eyeY + .052)) | (~front & (py > eyeY - .095)))
  iris = headzone & (pz < faceZ + .05) & (lum < .1) & (np.abs(py - eyeY) < .024) & (np.abs(px) > .014) & (np.abs(px) < .056)
  brows = headzone & front & darkraw & (np.abs(py - (eyeY + .034)) < .014) & (np.abs(px) > .008) & (np.abs(px) < .065)
  hair = (hair | brows) & ~iris
  shorts = ~headzone & dark_c & ~forearm & ~upperarm & (py > kneeY - .03) & (py < hipY + .09)   # hands and forearms hang inside the shorts band; a shadowed wrist is skin, not shorts
  sleeve = upperarm & (py > J['RightArm'][1] - .17)   # the sleeve reaches about 17 cm below the shoulder joint; arm skin below it is never shirt
  jersey = ~headzone & ~skin_c & ~shorts & ~forearm & ~(upperarm & ~sleeve) & (py > hipY - .07) & (py < neckY + .03)   # every torso texel that is not skin: shadowed folds included, so nothing stays white under a colour
  # below the shin every non-skin texel is sock or shoe: the m2 scan's grey trail shoes are neither dark nor white, and
  # the colour tests had turned their uppers into skin. The shoe is what sits under the ankle, or darker than the sock
  # just above it (the collar)
  low = hit & ~skin_c & ~jersey & (py < ankleY + .21); band = low & (py > ankleY + .06) & (py < ankleY + .15)
  sockw = float(np.median(lum[band])) if band.sum() > 50 else .5
  shoes = low & ((py < ankleY - .01) | ((py < ankleY + .05) & (lum < .6 * sockw)))
  socks = low & ~shoes & (py > ankleY - .04)
  REPORT['feet' + sfx] = {'ankleY': float(ankleY), 'sockLum': sockw}
  eyewhite = headzone & light_c & (np.abs(py - eyeY) < .03) & (np.abs(px) < .07) & (pz < faceZ + .06)
  skin = hit & ~(hair | iris | shoes | shorts | jersey | socks | eyewhite)
  # beard zones over skin: mustache .25, chin .5, jaw .75 (the runtime picks strengths per style)
  fz = front & skin & (pz < headZ)
  mustache = fz & (py < eyeY - .055) & (py > eyeY - .085) & (np.abs(px) < .036)
  chin = fz & (py < eyeY - .095) & (py > chinY - .005) & (np.abs(px) < .048)
  jaw = fz & (py < eyeY - .05) & (py > chinY - .002) & (np.abs(px) >= .036) & (np.abs(px) < .095) & ~mustache & ~chin
  fr = max(4, TEX // 150)   # ~1.4 cm feather so a beard fades into the skin instead of ending in a rectangle
  beard = np.zeros((TEX, TEX), np.float32)
  for zone, z in ((mustache, 1), (chin, 2), (jaw, 3)):
    soft = np.clip((boxblur(zone.astype(np.float32), fr) - .5) * 2.2, 0, 1) * zone   # 0 at the zone edge, 1 a feather-width inside
    beard = np.where(zone, z / 4 + np.maximum(soft, .05) * .24, beard)
  masks = [skin, jersey, shorts, hair, socks, shoes, iris]
  soft = [blur3(blur3(m.astype(np.float32))) for m in masks]
  mask1 = np.stack(soft[:4], -1); mask2 = np.stack(soft[4:] + [beard], -1)   # the beard channel carries a zone id and must not be blurred across zones
  region_lum = [float(lum[m].mean()) if m.any() else .5 for m in masks]
  cover = {r: float(m.mean()) for r, m in zip(REGIONS, masks)}
  # cloth keeps its folds but loses Meshy's baked lighting: divide the shirt and socks by their own low-frequency
  # luminance so a colour lands evenly instead of showing the studio shadows as stains
  cloth = (jersey | socks).astype(np.float32); r = max(8, TEX // 48)
  low = boxblur(lum * cloth, r) / np.maximum(boxblur(cloth, r), 1e-3)
  target = np.percentile(lum[jersey | socks], 70) if (jersey | socks).any() else 1   # the lit part of the shirt is the reference white
  gain = np.clip(np.where(low > 1e-3, target / np.maximum(low, 1e-3), 1), .6, 2.8)
  col = col * np.where(cloth[:, :, None] > 0, gain[:, :, None], 1)
  region_lum = [float((.2126 * col[:, :, 0] + .7152 * col[:, :, 1] + .0722 * col[:, :, 2])[m].mean()) if m.any() else .5 for m in masks]
  skin_mean = [float(x) for x in col[skin].mean(0)] if skin.any() else [.35, .22, .16]   # the scan's own skin colour, so the runtime shifts it toward a tone instead of painting over it
  REPORT['skinMean' + sfx] = skin_mean
  # occlusion folded into the albedo so the baked lighting and the real shadows agree
  out = col * (1 - .55 * (1 - AO[:, :, None]) * hit[:, :, None])
  save_png('albedo' + sfx, np.concatenate([linear_to_srgb(np.clip(out, 0, 1)), np.ones((TEX, TEX, 1), np.float32)], 2), True)   # encode ourselves: Blender writes float buffers to PNG untransformed, which had been shipping linear values as sRGB (dark, muddy skin)
  save_png('mask1' + sfx, mask1, True); save_png('mask2' + sfx, mask2, True)
  if not lod:
    save_png('normal', np.concatenate([N[:, :, :3], np.ones((TEX, TEX, 1), np.float32)], 2), True); bpy.data.images.remove(nrm_img)
  for i in (pos_img, ao_img): bpy.data.images.remove(i)
  nodes = keep_mat.node_tree.nodes; nodes.remove(nodes['bake']); nodes.active = next(n for n in nodes if n.type == 'TEX_IMAGE')
  nodes.active.image = bpy.data.images.load(str(TEXSRC / f'albedo{sfx}.png'))   # previews and the saved blend show the baked albedo on the new UVs
  REPORT['textures' + sfx] = {'regionLum': dict(zip(REGIONS, region_lum)), 'coverage': cover, 'hit': float(hit.mean())}
  log('regions' + sfx, json.dumps(REPORT['textures' + sfx]))
  return region_lum, skin_mean

# ---------- measurements ----------
def world_coords(body):   # game coords in world space: before bake_pose the scan is still parented to the turned armature
  c = coords(body); M = np.array(body.matrix_world); b = np.stack([c[:, 0], -c[:, 2], c[:, 1]], 1) @ M[:3, :3].T + M[:3, 3]; return np.stack([b[:, 0], b[:, 2], -b[:, 1]], 1)

def measure_head(body, J):
  w = weights(body, 'head'); c = world_coords(body)   # local coords faced backwards before bake_pose: the bake's eye line and nose landed on the back of the head and the iris and beard masks came out empty
  sel = (w > .5) & (c[:, 1] > J['neck'][1] + .02)
  lo, hi = c[sel].min(0), c[sel].max(0); centre = (lo + hi) / 2; radii = (hi - lo) / 2
  frontsel = sel & (c[:, 2] < J['Head'][2] - .03) & (np.abs(c[:, 0]) < .04)
  chin = float(c[frontsel][:, 1].min())
  facesel = sel & (np.abs(c[:, 0]) < .025) & (c[:, 1] > chin + .04) & (c[:, 1] < hi[1] - .06)
  nose = c[facesel][np.argmin(c[facesel][:, 2])]   # the most forward face vertex is the nose tip
  eyeY = float(nose[1] + .05); skull = sel & (c[:, 1] > eyeY + .02); sk = c[skull]
  centre = [float(centre[0]), float(centre[1]), float((sk[:, 2].max() + sk[:, 2].min()) / 2)]
  radii = [float((sk[:, 0].max() - sk[:, 0].min()) / 2), float(radii[1]), float((sk[:, 2].max() - sk[:, 2].min()) / 2)]
  return {'centre': centre, 'radii': radii, 'chin': chin, 'eyeY': eyeY, 'faceZ': float(nose[2]), 'noseY': float(nose[1]), 'top': float(hi[1])}

def measure_ground(body, J):
  c = coords(body); w = weights(body, 'knR')
  sole = (w > .5) & (c[:, 1] < .05) & (c[:, 0] > 0)
  s = c[sole]; lo, hi = s.min(0), s.max(0); centre = (lo + hi) / 2
  knee = J['RightLeg']
  return {'root': J['Hips'][1], 'hipDrop': J['Hips'][1] - J['RightUpLeg'][1], 'hipX': J['RightUpLeg'][0], 'thigh': J['RightUpLeg'][1] - J['RightLeg'][1],
          'sole': [0, -knee[1], float(centre[2] - knee[2])], 'soleRadii': [float((hi[0] - lo[0]) / 2), .012, float((hi[2] - lo[2]) / 2)]}

def measure_chest(body, J):
  y = J['neck'][1] - .17; c = coords(body); band = (np.abs(c[:, 0]) < .08) & (np.abs(c[:, 1] - y) < .06)   # wide: the decimated torso is sparse
  z = [float(-c[band][:, 2].min()), float(c[band][:, 2].max())] if band.any() else [.13, .13]
  return {'chestZ': z, 'chestY': float(y)}

def wrist_radius(body, J):
  # only the vertices around the hand joint: the thigh sits at the same height and used to triple the ring
  h = J['RightHand']; c = coords(body)
  band = (np.abs(c[:, 1] - h[1] - .012) < .008) & (np.abs(c[:, 0] - h[0]) < .045) & (np.abs(c[:, 2] - h[2]) < .06)
  s = c[band]; r = float(max(s[:, 0].max() - s[:, 0].min(), s[:, 2].max() - s[:, 2].min()) / 2) if len(s) else .032
  return min(max(r, .025), .045)

# ---------- hair + headwear + glasses: grown from the measured skull ----------
# A copy of the head is decimated, smoothed until ears, nose and baked hair melt into a skull, pushed out along
# its normals and cut at the hairline; that shell hugs the real head at any offset without sphere fitting.
HEAD_C = HEAD_R = None; EYE_Y = 0; TOP_Y = 0; FACE_Z = 0; M = {}; SEG = {}
HAIR_OUT = .026   # dome offset: with the .008 push the inner surface clears the .032 outer surface of every everyday hair shell
def H(p):   # v2 head-space coordinates (centre (0,1.635,0), radii (.138,.15,.142)) -> this skull
  return (p[0] / .138 * HEAD_R[0] + HEAD_C[0], (p[1] - 1.635) / .15 * HEAD_R[1] + HEAD_C[1], p[2] / .142 * HEAD_R[2] + HEAD_C[2])
def HR(r): return (r[0] / .138 * HEAD_R[0], r[1] / .15 * HEAD_R[1], r[2] / .142 * HEAD_R[2])

def ring_radii(body, y, offset=.012):
  """Half-width and half-depth of the head at height y (metres) plus an offset, for bands and brims."""
  c = coords(body); band = (np.abs(c[:, 1] - y) < .012) & (c[:, 1] > EYE_Y - .12)
  s = c[band]; return (s[:, 0].max() - s[:, 0].min()) / 2 + offset, (s[:, 2].max() - s[:, 2].min()) / 2 + offset, (s[:, 2].max() + s[:, 2].min()) / 2

def band(name, body, y, minor=.012, offset=.012, mat=None, squash=1):
  rx, rz, cz = ring_radii(body, y, offset)
  o = torus(name, (0, y, cz), rz, minor, mat or M['headwear'], major=SEG['ring'], minor=8, squash=squash)
  o.scale = (rx / rz, 1, 1); bpy.ops.object.transform_apply(scale=True); return o

def cap(name, body, mat, offset, keep, thickness, target):
  o = body.copy(); o.data = body.data.copy(); o.name = name; bpy.context.collection.objects.link(o)
  o.data.materials.clear(); o.data.materials.append(mat)
  for vg in list(o.vertex_groups): o.vertex_groups.remove(vg)
  cut(o, lambda p: p[1] > EYE_Y - .13); decimate_to(o, target)
  bm = bmesh.new(); bm.from_mesh(o.data)
  for _ in range(4): bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
  bm.normal_update()
  for v in bm.verts: v.co += v.normal * (offset + .008)   # smoothing pulls the copy inward; push it back out
  bm.to_mesh(o.data); bm.free(); smooth(o)
  cut(o, keep); solidify(o, thickness)
  # the inner surface sits on the head and is never seen: drop every face whose normal points at the skull centre
  centre = Vector(xyz(HEAD_C)); bm = bmesh.new(); bm.from_mesh(o.data); bm.normal_update()
  bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.dot((f.calc_center_median() - centre).normalized()) < -.2], context='FACES')
  bm.to_mesh(o.data); bm.free(); return o

def on_skull(body, pos, r, sink=.45):
  """Blob centre for a v2 head-space position: the nearest skull point, pushed out so the blob half-shows."""
  hp = H(pos); ok, loc, nrm, idx = body.closest_point_on_mesh(Vector(xyz((hp[0], hp[1] + .03, hp[2]))))   # this skull's hairline sits higher than the v2 sphere's
  return game(loc + nrm * (min(HR(r)) * sink))

def hair_shell(name, body, front=.052, back=-.095, thickness=.012, offset=.012):
  def keep(p):   # hairline: high on the forehead, low on the nape (forward is -z)
    t = (p[2] - HEAD_C[2] + HEAD_R[2]) / (2 * HEAD_R[2]); line = front + (back - front) * max(0.0, min(1.0, t))
    return p[1] - EYE_Y > line
  return cap(name, body, M['hair'], offset, keep, thickness, SEG['cap'])

def build_hair(body):
  sp = SEG['sphere']; styles = {}
  def finish(name, objs):
    o = join(objs, 'hair_' + name); o['variant'] = 'hair'; styles[name] = o
  def blob(n, pos, r, rot=(0, 0, 0), s=0, seated=True): return ell(n, on_skull(body, pos, r) if seated else H(pos), HR(r), M['hair'], sp + s, max(4, (sp + s) // 2), rot)
  # 'short' has no shell: it is the scan's own hair, recoloured through the hair mask (the most natural option)
  finish('buzz', [hair_shell('b', body, thickness=.006, offset=.006)])
  finish('curly', [hair_shell('c', body, offset=.018)] + [blob(f'curl{i}', (math.cos(i * math.tau / 9) * .112, 1.735 + (i % 2) * .02, math.sin(i * math.tau / 9) * .117), (.046, .04, .046), s=-4) for i in range(9)] + [blob('curltop', (0, 1.795, 0), (.078, .042, .078), s=-4)])
  finish('long', [hair_shell('l', body, back=-.17), blob('drape', (0, 1.46, .128), (.118, .17, .046), seated=False), blob('drapeL', (-.127, 1.52, .04), (.03, .13, .078), s=-4, seated=False), blob('drapeR', (.127, 1.52, .04), (.03, .13, .078), s=-4, seated=False)])
  finish('bun', [hair_shell('bn', body), blob('bun', (0, 1.765, .128), (.06, .054, .054), s=-2)])
  finish('ponytail', [hair_shell('p', body), blob('tie', (0, 1.68, .158), (.036, .03, .03), s=-6), blob('tail', (0, 1.55, .205), (.044, .155, .038), rot=(.4, 0, 0), s=-2, seated=False)])
  finish('sidepart', [hair_shell('sp', body), blob('sweep', (.055, 1.735, -.11), (.105, .03, .062), rot=(0, 0, -.28))])
  finish('mohawk', [hair_shell('m', body, thickness=.005, offset=.006), blob('ridge', (0, 1.80, -.01), (.022, .078, .138), s=-4)])
  finish('afro', [hair_shell('af', body, front=.038, back=-.1, thickness=.04, offset=.045)])
  finish('braids', [hair_shell('br', body)] + [capsule(f'braid{i}', H((x, 1.61, .135)), H((x * 1.3, 1.38, .115 + abs(x))), .019, .015, M['hair'], max(6, sp - 6)) for i, x in enumerate((-.078, 0, .078))])
  finish('wavy', [hair_shell('w', body, offset=.02, back=-.11)] + [blob(f'wave{i}', (x, 1.73 - abs(x) * .3, -.122), (.046, .03, .04), s=-4) for i, x in enumerate((-.088, 0, .088))])
  return styles

def build_headwear(body):
  sp = SEG['sphere']; styles = {}
  def finish(name, objs):
    o = join(objs, 'headwear_' + name); o['variant'] = 'headwear'; styles[name] = o
  # domes clear HAIR_OUT so short, wavy and curly hair sit under a hat instead of through it; bands ride over the hair
  def dome(n, offset=HAIR_OUT, cut_y=.03): return cap(n, body, M['headwear'], offset, lambda p: p[1] - EYE_Y > cut_y, .006, SEG['cap'])
  def brim(n, y, back=False):
    rx, rz, cz = ring_radii(body, y, .012); z = cz + (rz + .058) * (1 if back else -1)
    return ell(n, (0, y, z), (rx * 1.02, .008, .088), M['headwear'], sp + 6, 8)
  top = TOP_Y; dome_top = top + HAIR_OUT + .008
  finish('cap', [dome('capdome'), band('capband', body, EYE_Y + .038, .012, .02), brim('capbrim', EYE_Y + .042), ell('button', (0, dome_top + .004, HEAD_C[2]), (.012, .008, .012), M['headwear'], 8, 4)])
  finish('backcap', [dome('bcdome'), band('bcband', body, EYE_Y + .038, .012, .02), brim('bcbrim', EYE_Y + .042, True)])
  finish('beanie', [dome('bdome', HAIR_OUT + .002, .0), band('fold', body, EYE_Y + .022, .022, .022), ell('pom', (0, dome_top + .026, HEAD_C[2]), (.033, .033, .033), M['headwear'], sp - 4, sp // 2)])
  finish('visor', [band('vband', body, EYE_Y + .044, .013, .02), brim('vbrim', EYE_Y + .046)])
  finish('bucket', [dome('bkdome', HAIR_OUT, .028), band('bkbrim', body, EYE_Y + .032, .034, .034, squash=.35)])
  finish('headband', [band('hb', body, EYE_Y + .048, .014, .02)])
  return styles

def build_glasses(body):
  """Real frames instead of a decal: lens rims on the measured eye line, a bridge and temples back to the ears."""
  styles = {}
  def finish(name, objs):
    o = join(objs, 'glasses_' + name); o['variant'] = 'glasses'; styles[name] = o
  ex = .034
  eyes = []
  for s in (-1, 1):
    ok, loc, nrm, idx = body.closest_point_on_mesh(Vector(xyz((s * ex, EYE_Y, FACE_Z)))); eyes.append(game(loc))
  lens_z = min(e[2] for e in eyes) - .011; ear = (HEAD_R[0] + .006, EYE_Y + .012, HEAD_C[2] + .008)
  def temples(tag, rz=.0022): return [capsule(f'temple{tag}{s}', (s * (ex + .022), EYE_Y + .004, lens_z + .003), (s * ear[0], ear[1], ear[2]), rz, rz, M['frame'], 8, 2) for s in (-1, 1)]
  def bridge(tag): return capsule('bridge' + tag, (-.015, EYE_Y + .005, lens_z + .002), (.015, EYE_Y + .005, lens_z + .002), .002, .002, M['frame'], 8, 2)
  finish('round', [torus(f'rim{s}', (s * ex, EYE_Y, lens_z), .0195, .0021, M['frame'], tilt=math.pi / 2, major=SEG['ring'], minor=6) for s in (-1, 1)] + [bridge('r')] + temples('r'))
  finish('square', [torus(f'rim{s}', (s * ex, EYE_Y, lens_z), .0195, .0021, M['frame'], tilt=math.pi / 2, major=SEG['ring'], minor=6, scale=(1.18, .86)) for s in (-1, 1)] + [bridge('s')] + temples('s'))
  shield = ell('shield', (0, EYE_Y - .003, lens_z + .014), (.072, .016, .048), M['lens'], SEG['ring'] + 12, 12)
  cut(shield, lambda p: p[2] < lens_z + .012); solidify(shield, .002)
  finish('sport', [shield] + temples('p', .0028))
  return styles

# ---------- rig ----------
def build_rig(objs, RIG, extras):
  rigdata = bpy.data.armatures.new('ChainsRig'); rig = bpy.data.objects.new('ChainsRig', rigdata); bpy.context.collection.objects.link(rig)
  select([rig]); bpy.ops.object.mode_set(mode='EDIT')
  for name in BONES:
    p = RIG[name]; b = rigdata.edit_bones.new(name); b.head = xyz(p); b.tail = xyz((p[0], p[1] + .12, p[2])); b.roll = 0
    if PARENTS[name]: b.parent = rigdata.edit_bones[PARENTS[name]]
  bpy.ops.object.mode_set(mode='OBJECT')
  for o in objs:
    mod = o.modifiers.new('ChainsRig', 'ARMATURE'); mod.object = rig; o.parent = rig
  rig['forward'] = '-Z'; rig['releasePhase'] = .62; rig['style'] = f'athlete v3 {VARIANT} (meshy photoreal)'
  for k, v in extras.items(): rig[k] = v
  return rig

def export_glb(path, lean=False):   # lean: the phone LOD made from the full body; 13-bit positions (.2 mm) and 8-bit normals (the runtime rebuilds hers) fit its byte budget
  bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', export_yup=True, export_animations=False, export_image_format='NONE',
    export_skins=True, export_all_influences=False, export_extras=True, export_texcoords=True, export_apply=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=10 if lean else 6, export_draco_position_quantization=13 if lean else 14,
    export_draco_normal_quantization=8 if lean else 10, export_draco_texcoord_quantization=12, export_draco_generic_quantization=12)

if '--lod-from-full' in argv:
  # The female scan keeps ~1000 holes, so decimating it to the phone budget stalls at ~9.7k triangles and folds the
  # surface into shards (the LOD looked shattered on phones). Her phone LOD is her full body instead (+2.7k triangles),
  # which also shares the full UV layout: pack-body-textures.py gives it the full atlas at half size.
  bpy.ops.wm.open_mainfile(filepath=str(SOURCE / f'golfer-v3{TAG}-source.blend'))
  export_glb(OUT / f'golfer{TAG}-lod.glb', lean=True); log('LOD_FROM_FULL', VARIANT, (OUT / f'golfer{TAG}-lod.glb').stat().st_size); sys.exit(0)

def export(name, budget):
  objs = meshes(); total = sum(tris(o) for o in objs)
  for o in objs:
    if not o.data.uv_layers: o.data.uv_layers.new(name='UVMap')
  REPORT[name] = {'triangles': total, 'meshCount': len(objs), 'perMesh': {o.name: tris(o) for o in objs}}
  log('TRIS', name, total, json.dumps(REPORT[name]['perMesh']))
  assert total < budget, (name, total)
  bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / (name + '.blend')), compress=True)
  export_glb(OUT / (name + '.glb'))
  REPORT[name]['bytes'] = (OUT / (name + '.glb')).stat().st_size
  log('EXPORT', name, json.dumps({k: v for k, v in REPORT[name].items() if k != 'perMesh'}))

def preview(tag):
  PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
  scene = bpy.context.scene; scene.render.engine = 'BLENDER_WORKBENCH'; scene.render.resolution_x = scene.render.resolution_y = 640
  scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'TEXTURE'; scene.display.shading.show_cavity = True
  scene.display.shading.show_shadows = True; scene.display_settings.display_device = 'sRGB'; scene.view_settings.view_transform = 'Standard'
  cam_data = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_data); bpy.context.collection.objects.link(cam); scene.camera = cam
  hand = xyz(REPORT.get('handR', (0.17, .8, -.03)))
  views = {'front': ((0, 3.1, 1.0), 60, (0, 0, .92)), 'quarter': ((2.1, 2.3, 1.15), 60, (0, 0, .92)), 'face': ((.6, 1.0, 1.66), 85, (0, 0, 1.66)), 'feet': ((1.0, 1.3, .35), 70, (0, 0, .18)),
           'hand': ((hand[0] + .5, hand[1] - .42, hand[2] + .12), 90, hand)}
  for view, (pos, lens, look) in views.items():
    cam_data.lens = lens; cam.location = pos
    cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = (Vector(look) - Vector(pos)).to_track_quat('-Z', 'Y')
    scene.render.filepath = str(PREVIEW_DIR / f'golfer-v3{TAG}-{tag}-{view}.png'); bpy.ops.render.render(write_still=True)
  bpy.data.objects.remove(cam); bpy.data.cameras.remove(cam_data)

def show_only(hair, headwear, accessories=False, glasses=None):
  for o in meshes():
    if o.name.startswith('hair_'): o.hide_render = o.name != 'hair_' + hair
    elif o.name.startswith('headwear_'): o.hide_render = o.name != 'headwear_' + str(headwear)
    elif o.name.startswith('glasses_'): o.hide_render = o.name != 'glasses_' + str(glasses)
    elif o.name.startswith('accessory_'): o.hide_render = not accessories

# ---------- build ----------
def build(lod, shared):
  global HEAD_C, HEAD_R, EYE_Y, TOP_Y, FACE_Z, M, SEG, TEX
  TEX = 1024 if lod else 2048
  SEG = {'hair': 10, 'sphere': 8, 'ring': 14, 'cap': 320} if lod else {'hair': 18, 'sphere': 14, 'ring': 32, 'cap': 640}
  arm, body = import_source(); body.name = 'body'
  # Everything texture-related happens in the scan's own A-pose, where the arms are clear of the torso: once the arms
  # hang straight they sit against the hips and bake rays from a forearm start inside the shirt.
  Ja = {b.name: game(arm.matrix_world @ b.head) for b in arm.pose.bones}
  merge_seams(body)
  if VARIANT == 'm': unhook_flank(body, Ja)   # her build predates it and ships as is
  M = {k: material(k, c, r) for k, c, r in [('hair', (.16, .09, .05), .85), ('headwear', (.08, .09, .12), .8), ('trim', (1, 1, 1), .7), ('frame', (.05, .05, .06), .45), ('lens', (.08, .09, .11), .15)]}
  alb = max((i for i in bpy.data.images if i.size[0] >= 512), key=lambda i: i.size[0] * i.size[1])   # the Meshy albedo, whatever it is called
  hi = body.copy(); hi.data = body.data.copy(); hi.name = 'hi'; bpy.context.collection.objects.link(hi)
  hi.data.materials.clear(); hi.data.materials.append(emit_material('hi_emit', alb))
  bm = material('body', (1, 1, 1), .7); tex = bm.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = alb
  bm.node_tree.links.new(tex.outputs['Color'], bm.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
  body.data.materials.clear(); body.data.materials.append(bm)
  decimate_split(body, Ja, BUDGET['lod' if lod else 'full'])
  headshare = float((weights(body, 'head') > .5).mean()); log('head vertex share', headshare)
  unwrap(body)
  head = measure_head(body, Ja)
  region_lum, skin_mean = bake_textures(body, hi, Ja, head, lod)
  bpy.data.objects.remove(hi, do_unlink=True)
  J = straighten(arm); bake_pose(arm, body); remap_weights(body)   # the hands stay as scanned, half open: gltf-player.js hooks the disc hand round the rim with morphs
  RIG = {'root': J['Hips'], 'spine': J['Spine02'], 'head': J['neck'], 'shR': J['RightArm'], 'elR': J['RightForeArm'], 'shL': J['LeftArm'], 'elL': J['LeftForeArm'],
         'hipR': J['RightUpLeg'], 'knR': J['RightLeg'], 'hipL': J['LeftUpLeg'], 'knL': J['LeftLeg']}
  RIG = {k: [float(x) for x in v] for k, v in RIG.items()}
  fit = fit_shirt(body, RIG, shared.get('fit'), rewire=VARIANT == 'm')
  if not lod: shared['fit'] = fit
  head = measure_head(body, J); ground = measure_ground(body, J)
  if not lod: shared['ground'] = ground; shared['head'] = head
  HEAD_C, HEAD_R, EYE_Y, TOP_Y, FACE_Z = tuple(head['centre']), tuple(head['radii']), head['eyeY'], head['top'], head['faceZ']
  hand = [J['RightHand'][i] - J['RightForeArm'][i] + (0, -.075, -.012)[i] for i in range(3)]
  REPORT['handR'] = [float(x) for x in J['RightHand']]
  wr = wrist_radius(body, J)
  for s in (1, -1):
    pos = (s * J['RightHand'][0], J['RightHand'][1] + .012, J['RightHand'][2])
    wb = torus('accessory_wristband' + ('R' if s > 0 else 'L'), pos, wr + .002, .009, M['trim'], major=SEG['ring'] // 2 + 4, minor=6)
    wb['variant'] = 'accessory'; rigid(wb, 'el' + ('R' if s > 0 else 'L'))
  hair = build_hair(body); headwear = build_headwear(body); glasses = build_glasses(body)
  for o in list(hair.values()) + list(headwear.values()) + list(glasses.values()): rigid(o, 'head')
  chest = measure_chest(body, J)
  # clips were authored for the male rig's leg lengths; a shorter rig scales their hip drops by this ratio
  leg = float(J['RightUpLeg'][1]); ref = ROOT / 'tools/golfer-rig.json'
  leg_scale = 1.0 if VARIANT == 'm' or not ref.exists() else leg / float(json.loads(ref.read_text())['extras'].get('legLength', leg))
  extras = {'handOffset': hand, 'headCentre': list(HEAD_C), 'headRadii': list(HEAD_R), 'eyeY': head['eyeY'], 'faceZ': head['faceZ'], 'chinY': head['chin'],
            'chestZ': chest['chestZ'], 'chestY': chest['chestY'], 'regionLum': region_lum, 'skinMean': skin_mean, 'height': float(coords(body)[:, 1].max()), 'legLength': leg, 'legScale': leg_scale, 'figure': VARIANT,
            'sleeveHem': fit['hem'], 'shirtHem': round((RIG['hipR'][1] + RIG['hipL'][1]) / 2 + .055, 4)}   # the jersey ends at the hip: pack-body-textures.py turns the scan's tee below it into shorts
  if VARIANT == 'm': extras['hairCards'] = 0   # gltf-player.js: the m2 scan's hair is sculpted volume in locks; cards over it read as a curly helmet
  build_rig(meshes(), RIG, extras)
  if not lod: shared['rig'] = RIG; shared['hand'] = hand; shared['extras'] = extras
  return RIG

shared = {}
build(False, shared)
if PREVIEW:
  show_only('short', 'cap', glasses='square'); preview('cap')
  show_only('wavy', None, True, 'round'); preview('bare')
  show_only('afro', 'headband', glasses='sport'); preview('afro')
export(f'golfer-v3{TAG}-source', BUDGET['full'] + 20000)   # + hair, headwear and glasses variants (one of each draws)
build(True, shared)
if PREVIEW: show_only('short', 'cap'); preview('lod')
export(f'golfer-v3{TAG}-lod-source', BUDGET['lod'] + 14000)
for src, dst in ((f'golfer-v3{TAG}-source.glb', f'golfer{TAG}.glb'), (f'golfer-v3{TAG}-lod-source.glb', f'golfer{TAG}-lod.glb')):   # runtime names; the source copy lives with the blend files
  shutil.copyfile(OUT / src, OUT / dst); shutil.move(str(OUT / src), str(SOURCE / src))
(OUT / f'golfer{TAG}-build-report.json').write_text(json.dumps(REPORT, indent=2) + '\n')
(ROOT / f'tools/golfer{TAG}-rig.json').write_text(json.dumps({'rig': shared['rig'], 'hand': shared['hand'], 'head': {'centre': list(HEAD_C), 'radii': list(HEAD_R), **{k: shared['head'][k] for k in ('chin', 'eyeY', 'faceZ')}}, 'ground': shared['ground'], 'extras': shared['extras']}, indent=2) + '\n')
manifest = ROOT / 'assets/manifest.json'; doc = json.loads(manifest.read_text())
doc['models'][f'golfer{KEY}'] = f'models/golfer{TAG}.glb'; doc['models'][f'golfer{KEY}_lod'] = f'models/golfer{TAG}-lod.glb'
manifest.write_text(json.dumps(doc, indent=2) + '\n')
if VARIANT == 'f':   # her decimated LOD shatters: ship her full body as the phone LOD (same as --lod-from-full)
  bpy.ops.wm.open_mainfile(filepath=str(SOURCE / f'golfer-v3{TAG}-source.blend')); export_glb(OUT / f'golfer{TAG}-lod.glb', lean=True)
log('GOLFER_V3_DONE', VARIANT)
