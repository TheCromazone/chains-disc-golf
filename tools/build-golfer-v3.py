"""Chains athlete v3: the photoreal Meshy body from the ultimate frisbee project, re-rigged on ChainsRig.
Run: blender -b -P tools/build-golfer-v3.py -- [--source <athlete-v2.glb>] [--preview <dir>]
Reads the 108k-triangle Meshy 7 image-to-3D athlete (24-joint auto-rig, 2048 baked albedo), straightens
its A-pose into the ChainsRig rest (arms and legs vertical), merges the 24 joint weights into the eleven
ChainsRig bones, decimates to a game body and a phone LOD, then bakes from the untouched high-res copy:
tangent normals, ambient occlusion, and a world-position map that classifies every albedo texel into
recolourable regions (skin, shirt, shorts, hair, socks, shoes, iris, beard zones). The masks let the
locker keep every colour option while the surface keeps Meshy's photographic skin and cloth.
Hair and headwear variants are shrinkwrapped onto the real skull. Writes:
  art/blender/golfer-v3-source.blend, golfer-v3-lod-source.blend, golfer-v3-textures/*.png (masters)
  assets/models/golfer.glb, golfer-lod.glb, golfer-build-report.json, tools/golfer-rig.json
then run: python tools/pack-body-textures.py (JPEG/PNG runtime textures at two sizes).
"""
from pathlib import Path
import sys, json, math
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/models'; SOURCE = ROOT / 'art/blender'; TEXSRC = SOURCE / 'golfer-v3-textures'
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = '--preview' in argv
PREVIEW_DIR = Path(argv[argv.index('--preview') + 1]) if PREVIEW else ROOT / 'docs/qa/r6'
if not PREVIEW_DIR.is_absolute(): PREVIEW_DIR = ROOT / PREVIEW_DIR   # Blender resolves bare relative render paths against the drive root
MESHY = Path(argv[argv.index('--source') + 1]) if '--source' in argv else Path(r'C:\Users\matth\OneDrive\Documents\ultimate frisbee game\assets\figures\athlete-v2.glb')
BUDGET = {'full': 12400, 'lod': 6200}   # body triangles; hair and headwear variants ride on top
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

# ---------- generic helpers (shared with build-golfer-v2.py) ----------
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

def torus(name, pos, R, r, mat=None, tilt=0, major=28, minor=8, squash=1):
  bpy.ops.mesh.primitive_torus_add(major_segments=major, minor_segments=minor, location=xyz(pos), major_radius=R, minor_radius=r, generate_uvs=True)
  o = bpy.context.object; o.name = name; o.rotation_euler = (tilt, 0, 0); o.scale = (1, 1, squash)
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

def decimate_to(o, target):
  n = tris(o)
  if n <= target: return o
  m = o.modifiers.new('decimate', 'DECIMATE'); m.ratio = target / n; m.use_collapse_triangulate = True; apply_mod(o, m); smooth(o); return o

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

def bake_pose(arm, body):
  mod = next(m for m in body.modifiers if m.type == 'ARMATURE'); apply_mod(body, mod)
  select([body]); bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
  bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
  bpy.data.objects.remove(arm, do_unlink=True)
  bm = bmesh.new(); bm.from_mesh(body.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(body.data); bm.free()

def remap_weights(body):
  names = [vg.name for vg in body.vertex_groups]; acc = {b: {} for b in BONES}
  for v in body.data.vertices:
    for g in v.groups:
      t = MAP.get(names[g.group])
      if t and g.weight > 1e-4: acc[t][v.index] = acc[t].get(v.index, 0.0) + g.weight
  for vg in list(body.vertex_groups): body.vertex_groups.remove(vg)
  for b in BONES:
    vg = body.vertex_groups.new(name=b)
    for i, w in acc[b].items(): vg.add([i], w, 'REPLACE')

def weights(body, bone):
  vg = body.vertex_groups[bone]; out = np.zeros(len(body.data.vertices), np.float32)
  for v in body.data.vertices:
    for g in v.groups:
      if g.group == vg.index: out[v.index] = g.weight
  return out

def coords(body):
  n = len(body.data.vertices); buf = np.empty(n * 3, np.float32); body.data.vertices.foreach_get('co', buf)
  b = buf.reshape(n, 3); return np.stack([b[:, 0], b[:, 2], -b[:, 1]], 1)   # game coords

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
  sc.render.bake.margin = 6; sc.render.bake.use_clear = True

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

def srgb_to_linear(c): return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)

def blur3(m):
  p = np.pad(m, 1, mode='edge'); return sum(p[1 + dy:TEX + 1 + dy, 1 + dx:TEX + 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)) / 9

def bake_textures(body, hi, J, head):
  """Normal + AO from the high-res copy, a position map from the body itself, then the region masks."""
  TEXSRC.mkdir(parents=True, exist_ok=True); cycles_gpu()
  alb = next(i for i in bpy.data.images if i.name.startswith('texture'))
  alb.filepath_raw = str(TEXSRC / 'albedo-src.png'); alb.file_format = 'PNG'; alb.save()
  raw = bpy.data.images.load(str(TEXSRC / 'albedo-src.png')); raw.colorspace_settings.name = 'Non-Color'
  col = srgb_to_linear(pixels(raw)[:, :, :3]); bpy.data.images.remove(raw)
  # world position (encoded 0..1) baked from the game body's own surface
  keep_mat = body.data.materials[0]
  pm = bpy.data.materials.new('posbake'); pm.use_nodes = True; nt = pm.node_tree; nt.nodes.clear()
  outn = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); geo = nt.nodes.new('ShaderNodeNewGeometry')
  mul = nt.nodes.new('ShaderNodeVectorMath'); mul.operation = 'MULTIPLY_ADD'; mul.inputs[1].default_value = (.5, .5, .5); mul.inputs[2].default_value = (.5, .5, .0)
  nt.links.new(geo.outputs['Position'], mul.inputs[0]); nt.links.new(mul.outputs[0], em.inputs['Color']); nt.links.new(em.outputs[0], outn.inputs['Surface'])
  body.data.materials[0] = pm
  pos_img = float_image('pos', True); bake(body, None, 'EMIT', pos_img)
  P = pixels(pos_img); body.data.materials[0] = keep_mat; bpy.data.materials.remove(pm)
  hit = P[:, :, :3].sum(2) > 1e-6
  px = (P[:, :, 0] - .5) * 2; py = (P[:, :, 2]) * 2; pz = -(P[:, :, 1] - .5) * 2   # Blender xyz -> game x, y, z
  # high-res -> game body: tangent normals and occlusion
  nrm_img = float_image('nrm', True); bake(body, hi, 'NORMAL', nrm_img, normal_space='TANGENT', cage_extrusion=.02, max_ray_distance=.06)
  N = pixels(nrm_img); miss = N[:, :, 2] < .55; N[miss] = (.5, .5, 1, 1)
  bpy.context.scene.cycles.samples = 48
  ao_img = float_image('ao', True); bake(body, hi, 'AO', ao_img, cage_extrusion=.02, max_ray_distance=.06)
  AO = pixels(ao_img)[:, :, 0]
  # ---- classify ----
  lum = .2126 * col[:, :, 0] + .7152 * col[:, :, 1] + .0722 * col[:, :, 2]
  mx = col.max(2); mn = col.min(2); sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
  warm = (col[:, :, 0] >= col[:, :, 1]) & (col[:, :, 1] >= col[:, :, 2] * .95)
  eyeY, headZ, faceZ = head['eyeY'], J['Head'][2], head['faceZ']
  neckY, hipY, kneeY, ankleY = J['neck'][1], J['RightUpLeg'][1], J['RightLeg'][1], J['RightFoot'][1]
  chinY = head['chin']
  headzone = hit & (py > neckY + .02)
  front = pz < headZ - .04
  dark = hit & (lum < .045) & ((sat < .5) | (lum < .012))
  light = hit & (sat < .22) & (lum > .045)
  skin = hit & (sat > .3) & warm & (lum > .012) & ~dark
  hair = headzone & dark & ((front & (py > eyeY + .052)) | (~front & (py > eyeY - .095)))
  iris = headzone & (pz < faceZ + .05) & (lum < .1) & (np.abs(py - eyeY) < .024) & (np.abs(px) > .014) & (np.abs(px) < .056)
  brows = headzone & front & dark & (np.abs(py - (eyeY + .034)) < .014) & (np.abs(px) > .008) & (np.abs(px) < .065)
  hair = (hair | brows) & ~iris
  jersey = ~headzone & light & (py > hipY - .07) & (py < neckY + .03)
  shorts = ~headzone & dark & ~skin & (py > kneeY - .03) & (py < hipY + .09)
  socks = light & (py < ankleY + .21) & (py > ankleY - .04)
  shoes = dark & (py < ankleY + .03)
  skin &= ~(hair | iris | shoes)
  # beard zones over skin: mustache .25, chin .5, jaw .75 (the runtime picks strengths per style)
  fz = front & skin & (pz < headZ)
  mustache = fz & (py < eyeY - .055) & (py > eyeY - .085) & (np.abs(px) < .036)
  chin = fz & (py < eyeY - .095) & (py > chinY - .005) & (np.abs(px) < .048)
  jaw = fz & (py < eyeY - .05) & (py > chinY - .002) & (np.abs(px) >= .036) & (np.abs(px) < .095) & ~mustache & ~chin
  beard = mustache * .25 + chin * .5 + jaw * .75
  masks = [skin, jersey, shorts, hair, socks, shoes, iris]
  soft = [blur3(m.astype(np.float32)) for m in masks]
  mask1 = np.stack(soft[:4], -1); mask2 = np.stack(soft[4:] + [blur3(beard.astype(np.float32))], -1)
  region_lum = [float(lum[m].mean()) if m.any() else .5 for m in masks]
  cover = {r: float(m.mean()) for r, m in zip(REGIONS, masks)}
  # occlusion folded into the albedo so the baked lighting and the real shadows agree
  out = col * (1 - .55 * (1 - AO[:, :, None]) * hit[:, :, None])
  save_png('albedo', np.concatenate([out, np.ones((TEX, TEX, 1), np.float32)], 2))
  save_png('mask1', mask1, True); save_png('mask2', mask2, True)
  save_png('normal', np.concatenate([N[:, :, :3], np.ones((TEX, TEX, 1), np.float32)], 2), True)
  for i in (pos_img, nrm_img, ao_img): bpy.data.images.remove(i)
  nodes = keep_mat.node_tree.nodes; nodes.remove(nodes['bake']); nodes.active = next(n for n in nodes if n.type == 'TEX_IMAGE')
  REPORT['textures'] = {'regionLum': dict(zip(REGIONS, region_lum)), 'coverage': cover, 'hit': float(hit.mean())}
  log('regions', json.dumps(REPORT['textures']))
  return region_lum

# ---------- head measurements ----------
def measure_head(body, J):
  w = weights(body, 'head'); c = coords(body)
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

def measure_chest(body):
  c = coords(body); band = (np.abs(c[:, 0]) < .05) & (c[:, 1] > 1.27) & (c[:, 1] < 1.33)
  return [float(-c[band][:, 2].min()), float(c[band][:, 2].max())]

def wrist_radius(body, J):
  c = coords(body); band = (np.abs(c[:, 1] - J['RightHand'][1] - .012) < .008) & (c[:, 0] > 0)
  s = c[band]; return float(max(s[:, 0].max() - s[:, 0].min(), s[:, 2].max() - s[:, 2].min()) / 2) if len(s) else .04

# ---------- hair + headwear: caps grown from the skull itself ----------
# A copy of the head is decimated, smoothed until ears, nose and baked hair melt into a skull, pushed out along
# its normals and cut at the hairline; that shell hugs the real head at any offset without sphere fitting.
HEAD_C = HEAD_R = None; EYE_Y = 0; TOP_Y = 0; M = {}; SEG = {}
def H(p):   # v2 head-space coordinates (centre (0,1.635,0), radii (.138,.15,.142)) -> this skull
  return (p[0] / .138 * HEAD_R[0] + HEAD_C[0], (p[1] - 1.635) / .15 * HEAD_R[1] + HEAD_C[1], p[2] / .142 * HEAD_R[2] + HEAD_C[2])
def HR(r): return (r[0] / .138 * HEAD_R[0], r[1] / .15 * HEAD_R[1], r[2] / .142 * HEAD_R[2])

def ring_radii(body, y, offset=.012):
  """Half-width and half-depth of the head at height y (metres) plus an offset, for bands and brims."""
  c = coords(body); band = (np.abs(c[:, 1] - y) < .012) & (c[:, 1] > EYE_Y - .12)
  s = c[band]; return (s[:, 0].max() - s[:, 0].min()) / 2 + offset, (s[:, 2].max() - s[:, 2].min()) / 2 + offset, (s[:, 2].max() + s[:, 2].min()) / 2

def band(name, body, y, minor=.012, offset=.012, mat=None, squash=1):
  rx, rz, cz = ring_radii(body, y, offset)
  o = torus(name, (0, y, cz), rz, minor, mat or M['headwear'], major=SEG['ring'], minor=6, squash=squash)
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
  finish('short', [hair_shell('s', body), blob('fringe', (-.03, 1.72, -.13), (.095, .03, .05))])
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
  def dome(n, offset=.02, cut_y=.03): return cap(n, body, M['headwear'], offset, lambda p: p[1] - EYE_Y > cut_y, .006, SEG['cap'])
  def brim(n, y, back=False):
    rx, rz, cz = ring_radii(body, y, .01); z = cz + (rz + .055) * (1 if back else -1)
    return ell(n, (0, y, z), (rx * 1.02, .008, .085), M['headwear'], sp + 4, 6)
  top = TOP_Y
  finish('cap', [dome('capdome'), band('capband', body, EYE_Y + .038), brim('capbrim', EYE_Y + .042), ell('button', (0, top + .022, HEAD_C[2]), (.012, .008, .012), M['headwear'], 8, 4)])
  finish('backcap', [dome('bcdome'), band('bcband', body, EYE_Y + .038), brim('bcbrim', EYE_Y + .042, True)])
  finish('beanie', [dome('bdome', .026, .0), band('fold', body, EYE_Y + .022, .024, .014), ell('pom', (0, top + .04, HEAD_C[2]), (.033, .033, .033), M['headwear'], sp - 6, sp // 2 - 2)])
  finish('visor', [band('vband', body, EYE_Y + .044, .013, .01), brim('vbrim', EYE_Y + .046)])
  finish('bucket', [dome('bkdome', .022, .028), band('bkbrim', body, EYE_Y + .032, .034, .036, squash=.35)])
  finish('headband', [band('hb', body, EYE_Y + .048, .014, .008)])
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
  rig['forward'] = '-Z'; rig['releasePhase'] = .62; rig['style'] = 'athlete v3 (meshy photoreal)'
  for k, v in extras.items(): rig[k] = v
  return rig

def export(name, budget):
  objs = meshes(); total = sum(tris(o) for o in objs)
  for o in objs:
    if not o.data.uv_layers: o.data.uv_layers.new(name='UVMap')
  REPORT[name] = {'triangles': total, 'meshCount': len(objs), 'perMesh': {o.name: tris(o) for o in objs}}
  log('TRIS', name, total, json.dumps(REPORT[name]['perMesh']))
  assert total < budget, (name, total)
  bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / (name + '.blend')), compress=True)
  bpy.ops.export_scene.gltf(filepath=str(OUT / (name + '.glb')), export_format='GLB', export_yup=True, export_animations=False, export_image_format='NONE',
    export_skins=True, export_all_influences=False, export_extras=True, export_texcoords=True, export_apply=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12, export_draco_generic_quantization=12)
  REPORT[name]['bytes'] = (OUT / (name + '.glb')).stat().st_size
  log('EXPORT', name, json.dumps({k: v for k, v in REPORT[name].items() if k != 'perMesh'}))

def preview(tag):
  PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
  scene = bpy.context.scene; scene.render.engine = 'BLENDER_WORKBENCH'; scene.render.resolution_x = scene.render.resolution_y = 640
  scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'TEXTURE'; scene.display.shading.show_cavity = True
  scene.display.shading.show_shadows = True; scene.display_settings.display_device = 'sRGB'; scene.view_settings.view_transform = 'Standard'
  cam_data = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_data); bpy.context.collection.objects.link(cam); scene.camera = cam
  views = {'front': ((0, 3.1, 1.0), 60), 'quarter': ((2.1, 2.3, 1.15), 60), 'face': ((.6, 1.0, 1.66), 85), 'feet': ((1.0, 1.3, .35), 70)}
  for view, (pos, lens) in views.items():
    cam_data.lens = lens; cam.location = pos; look = Vector((0, 0, 1.66 if view == 'face' else .18 if view == 'feet' else .92))
    cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = (look - Vector(pos)).to_track_quat('-Z', 'Y')
    scene.render.filepath = str(PREVIEW_DIR / f'golfer-v3-{tag}-{view}.png'); bpy.ops.render.render(write_still=True)
  bpy.data.objects.remove(cam); bpy.data.cameras.remove(cam_data)

def show_only(hair, headwear, accessories=False):
  for o in meshes():
    if o.name.startswith('hair_'): o.hide_render = o.name != 'hair_' + hair
    elif o.name.startswith('headwear_'): o.hide_render = o.name != 'headwear_' + str(headwear)
    elif o.name.startswith('accessory_'): o.hide_render = not accessories

# ---------- build ----------
def build(lod, shared):
  global HEAD_C, HEAD_R, EYE_Y, TOP_Y, M, SEG
  SEG = {'hair': 10, 'sphere': 8, 'ring': 12, 'cap': 300} if lod else {'hair': 18, 'sphere': 12, 'ring': 24, 'cap': 420}
  arm, body = import_source()
  J = straighten(arm); bake_pose(arm, body); remap_weights(body); body.name = 'body'
  M = {k: material(k, c, r) for k, c, r in [('hair', (.16, .09, .05), .85), ('headwear', (.08, .09, .12), .8), ('trim', (1, 1, 1), .7)]}
  alb = next(i for i in bpy.data.images if i.name.startswith('texture'))
  bm = material('body', (1, 1, 1), .7); tex = bm.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = alb
  bm.node_tree.links.new(tex.outputs['Color'], bm.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
  body.data.materials.clear(); body.data.materials.append(bm)
  hi = body.copy(); hi.data = body.data.copy(); hi.name = 'hi'; bpy.context.collection.objects.link(hi)
  decimate_to(body, BUDGET['lod' if lod else 'full'])
  head = measure_head(body, J); ground = measure_ground(body, J)
  if not lod:
    shared['regionLum'] = bake_textures(body, hi, J, head)
    shared['ground'] = ground; shared['head'] = head
  bpy.data.objects.remove(hi, do_unlink=True)
  HEAD_C, HEAD_R, EYE_Y, TOP_Y = tuple(head['centre']), tuple(head['radii']), head['eyeY'], head['top']
  RIG = {'root': J['Hips'], 'spine': J['Spine02'], 'head': J['neck'], 'shR': J['RightArm'], 'elR': J['RightForeArm'], 'shL': J['LeftArm'], 'elL': J['LeftForeArm'],
         'hipR': J['RightUpLeg'], 'knR': J['RightLeg'], 'hipL': J['LeftUpLeg'], 'knL': J['LeftLeg']}
  RIG = {k: [float(x) for x in v] for k, v in RIG.items()}
  hand = [J['RightHand'][i] - J['RightForeArm'][i] + (0, -.075, -.012)[i] for i in range(3)]
  wr = wrist_radius(body, J)
  for s in (1, -1):
    pos = (s * J['RightHand'][0], J['RightHand'][1] + .012, J['RightHand'][2])
    wb = torus('accessory_wristband' + ('R' if s > 0 else 'L'), pos, wr + .006, .011, M['trim'], major=SEG['ring'] // 2 + 2, minor=6)
    wb['variant'] = 'accessory'; rigid(wb, 'el' + ('R' if s > 0 else 'L'))
  hair = build_hair(body); headwear = build_headwear(body)
  for o in list(hair.values()) + list(headwear.values()): rigid(o, 'head')
  extras = {'handOffset': hand, 'headCentre': list(HEAD_C), 'headRadii': list(HEAD_R), 'eyeY': head['eyeY'], 'faceZ': head['faceZ'], 'chinY': head['chin'],
            'chestZ': measure_chest(body), 'regionLum': shared['regionLum'], 'height': float(coords(body)[:, 1].max())}
  build_rig(meshes(), RIG, extras)
  shared['rig'] = RIG; shared['hand'] = hand; shared['extras'] = extras
  return RIG

shared = {}
build(False, shared)
if PREVIEW:
  show_only('short', 'cap'); preview('cap')
  show_only('wavy', None, True); preview('bare')
  show_only('afro', 'headband'); preview('afro')
export('golfer-v3-source', BUDGET['full'] + 12000)   # + hair and headwear variants (one of each draws)
build(True, shared)
if PREVIEW: show_only('short', 'cap'); preview('lod')
export('golfer-v3-lod-source', BUDGET['lod'] + 9000)
import shutil
for src, dst in (('golfer-v3-source.glb', 'golfer.glb'), ('golfer-v3-lod-source.glb', 'golfer-lod.glb')):   # runtime names; the source copy lives with the blend files
  shutil.copyfile(OUT / src, OUT / dst); shutil.move(str(OUT / src), str(SOURCE / src))
(OUT / 'golfer-build-report.json').write_text(json.dumps(REPORT, indent=2) + '\n')
(ROOT / 'tools/golfer-rig.json').write_text(json.dumps({'rig': shared['rig'], 'hand': shared['hand'], 'head': {'centre': list(HEAD_C), 'radii': list(HEAD_R), **{k: shared['head'][k] for k in ('chin', 'eyeY', 'faceZ')}}, 'ground': shared['ground'], 'extras': shared['extras']}, indent=2) + '\n')
log('GOLFER_V3_DONE')
