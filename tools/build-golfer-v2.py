"""Chains athlete v2: a Switch-Sports-grade stylised golfer authored in Blender.
Run: blender -b -P tools/build-golfer-v2.py [-- --preview <dir>]
Writes art/blender/golfer-v2-source.blend + golfer-v2-lod-source.blend and the runtime files
assets/models/golfer.glb (body, all wardrobe variants) and assets/models/golfer-lod.glb.
Every surface is a lofted cross-section profile (no remesh, no sculpt data): the torso, limbs,
head, jersey, shorts, socks and shoes are swept rings so silhouettes stay clean under the three-tone
toon ramp. The rig keeps the eleven-joint ChainsRig contract (bone names, +Y tails, roll 0) so the
authored clips still drive it; bone positions moved to athletic proportions and the clip authoring
script grounds feet using tools/golfer-rig.json written here.
"""
from pathlib import Path
import sys, json, math
import bpy, bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/models'
SOURCE = ROOT / 'art/blender'
PREVIEW = '--preview' in sys.argv
PREVIEW_DIR = Path(sys.argv[sys.argv.index('--preview') + 1]) if PREVIEW and len(sys.argv) > sys.argv.index('--preview') + 1 else ROOT / 'docs/qa/r5'
REPORT = {}
LOD = False
SEG = {}
def segs(lod):
  return {'torso': 8, 'jersey': 12, 'limb': 8, 'hand': 5, 'hair': 8, 'sphere': 6, 'ring': 10, 'shoe': 8, 'sub': 0} if lod else {'torso': 16, 'jersey': 24, 'limb': 16, 'hand': 8, 'hair': 16, 'sphere': 12, 'ring': 24, 'shoe': 16, 'sub': 1}

# ---------- proportions (game units: metres, y up, -z forward, x right) ----------
AX = .225                        # arm axis x
RIG = {  # bone heads; every bone's tail is +.12 y with roll 0 exactly like round three
  'root': (0, .92, 0), 'spine': (0, 1.02, 0), 'head': (0, 1.47, 0),
  'shR': (AX, 1.43, 0), 'elR': (AX, 1.16, 0), 'shL': (-AX, 1.43, 0), 'elL': (-AX, 1.16, 0),
  'hipR': (.10, .90, 0), 'knR': (.10, .48, 0), 'hipL': (-.10, .90, 0), 'knL': (-.10, .48, 0),
}
HAND = (0, -.30, -.035)          # disc socket offset from the elbow bone: palm centre
HEAD_C = (0, 1.635, 0); HEAD_R = (.138, .15, .142)
GROUND = { 'root': .92, 'hipDrop': .02, 'hipX': .10, 'thigh': .42, 'sole': [0, -.455, -.055], 'soleRadii': [.05, .025, .14] }

def xyz(p): return (p[0], -p[2], p[1])

def reset():
  bpy.ops.wm.read_factory_settings(use_empty=True)
  for a in list(bpy.data.actions): bpy.data.actions.remove(a)

def material(name, color, rough=.8):
  m = bpy.data.materials.new(name); m.use_nodes = True
  bs = m.node_tree.nodes.get('Principled BSDF')
  bs.inputs['Base Color'].default_value = (*color, 1); bs.inputs['Roughness'].default_value = rough
  m.diffuse_color = (*color, 1)   # Workbench previews read the viewport colour
  return m

def new_object(name, verts, faces, mat=None, uvs=None):
  """uvs: per-face list of per-corner (u, v) pairs, parallel to faces."""
  me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
  o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
  if mat is not None: me.materials.append(mat)
  for p in me.polygons: p.use_smooth = True
  if uvs is not None:
    layer = me.uv_layers.new(name='UVMap')
    for poly, corners in zip(me.polygons, uvs):
      for li, uv in zip(poly.loop_indices, corners): layer.data[li].uv = uv
  return o

def loft(name, rings, mat=None, seg=24, axis='y', cap_start=True, cap_end=True):
  """Sweep elliptical rings along an axis. ring = (pos, rA, rB, offA, offB): for axis y the ring
  lies in xz with rA=x radius, rB=z radius, offA=x centre, offB=z centre; for axis z the ring lies
  in xy (rA=x, rB=y). Returns a closed or open tube with smooth shading."""
  verts, faces, uvs = [], [], []
  span = abs(rings[-1][0] - rings[0][0]) or 1
  for (t, ra, rb, oa, ob) in rings:
    for i in range(seg):
      a = i * math.tau / seg
      if axis == 'y': p = (oa + math.cos(a) * ra, t, ob + math.sin(a) * rb)
      else: p = (oa + math.cos(a) * ra, ob + math.sin(a) * rb, t)
      verts.append(xyz(p))
  vof = lambda j: abs(rings[j][0] - rings[0][0]) / span * 1.6   # v in metres-ish so the weave tiles evenly along the body
  for j in range(len(rings) - 1):
    for i in range(seg):
      a, b = j * seg + i, j * seg + (i + 1) % seg
      faces.append((a, b, b + seg, a + seg)); u0, u1 = i / seg, (i + 1) / seg
      uvs.append([(u0, vof(j)), (u1, vof(j)), (u1, vof(j + 1)), (u0, vof(j + 1))])
  if cap_start:
    t, ra, rb, oa, ob = rings[0]; c = len(verts); verts.append(xyz((oa, t, ob) if axis == 'y' else (oa, ob, t)))
    for i in range(seg): faces.append((c, (i + 1) % seg, i)); uvs.append([(.5, 0), ((i + 1) / seg, 0), (i / seg, 0)])
  if cap_end:
    t, ra, rb, oa, ob = rings[-1]; c = len(verts); base = (len(rings) - 1) * seg
    verts.append(xyz((oa, t, ob) if axis == 'y' else (oa, ob, t)))
    for i in range(seg): faces.append((c, base + i, base + (i + 1) % seg)); uvs.append([(.5, 1.6), (i / seg, 1.6), ((i + 1) / seg, 1.6)])
  return new_object(name, verts, faces, mat, uvs)

def ell(name, pos, r, mat=None, seg=20, rings=12, rot=(0, 0, 0)):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=xyz(pos), calc_uvs=True)
  o = bpy.context.object; o.name = name; o.scale = (r[0], r[2], r[1]); o.rotation_euler = rot
  bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
  if mat is not None: o.data.materials.append(mat)
  for p in o.data.polygons: p.use_smooth = True
  return o

def capsule(name, a, b, r1, r2, mat=None, seg=12, steps=4):
  """Tapered round-ended tube between two game-space points, as one mesh."""
  A, B = Vector(a), Vector(b); d = B - A; L = d.length; n = d / L
  up = Vector((0, 0, 1)) if abs(n.y) > .9 else Vector((0, 1, 0))
  u = n.cross(up).normalized(); v = n.cross(u)
  verts, faces = [], []
  ring_pos = []
  for k in range(steps + 1):   # hemispherical start
    ang = math.pi / 2 * (1 - k / steps); ring_pos.append((A - n * r1 * math.sin(ang), r1 * math.cos(ang)))
  for k in range(steps + 1):
    ang = math.pi / 2 * (k / steps); ring_pos.append((B + n * r2 * math.sin(ang), r2 * math.cos(ang)))
  uvs = []
  for c, r in ring_pos:
    for i in range(seg):
      a = i * math.tau / seg; p = c + u * math.cos(a) * r + v * math.sin(a) * r; verts.append(xyz(p))
  for j in range(len(ring_pos) - 1):
    for i in range(seg):
      a, b2 = j * seg + i, j * seg + (i + 1) % seg; faces.append((a, b2, b2 + seg, a + seg))
      uvs.append([(i / seg, j / len(ring_pos)), ((i + 1) / seg, j / len(ring_pos)), ((i + 1) / seg, (j + 1) / len(ring_pos)), (i / seg, (j + 1) / len(ring_pos))])
  return new_object(name, verts, faces, mat, uvs)

def box(name, pos, size, mat=None, bevel=0, segments=3):
  bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(pos), calc_uvs=True); o = bpy.context.object; o.name = name
  o.scale = (size[0], size[2], size[1]); bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
  if mat is not None: o.data.materials.append(mat)
  if bevel:
    mod = o.modifiers.new('bevel', 'BEVEL'); mod.width = bevel; mod.segments = segments; apply_mod(o, mod)
  for p in o.data.polygons: p.use_smooth = True
  return o

def torus(name, pos, R, r, mat=None, tilt=0, major=28, minor=8, squash=1):
  """Ring lying flat (axis y) unless tilted about x."""
  bpy.ops.mesh.primitive_torus_add(major_segments=major, minor_segments=minor, location=xyz(pos), major_radius=R, minor_radius=r, generate_uvs=True)
  o = bpy.context.object; o.name = name; o.rotation_euler = (tilt, 0, 0); o.scale = (1, 1, squash)
  bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
  if mat is not None: o.data.materials.append(mat)
  for p in o.data.polygons: p.use_smooth = True
  return o

def select(objs):
  bpy.ops.object.select_all(action='DESELECT')
  for o in objs: o.select_set(True)
  bpy.context.view_layer.objects.active = objs[0]

def join(objs, name):
  objs = [o for o in objs if o is not None]
  select(objs)
  if len(objs) > 1: bpy.ops.object.join()
  o = objs[0]; o.name = name
  bpy.ops.object.transform_apply(location=True, rotation=True, scale=True); return o

def apply_mod(o, mod):
  select([o]); bpy.ops.object.modifier_apply(modifier=mod.name)

def subdivide(o, levels=1):
  if levels < 1: return o
  m = o.modifiers.new('smooth', 'SUBSURF'); m.levels = levels; m.render_levels = levels; apply_mod(o, m)
  for p in o.data.polygons: p.use_smooth = True
  return o

def solidify(o, thickness, rim=None):
  if rim is not None: o.data.materials.append(rim)
  m = o.modifiers.new('cloth', 'SOLIDIFY'); m.thickness = thickness; m.offset = 1; m.use_rim = True
  m.material_offset_rim = len(o.data.materials) - 1 if rim is not None else 0; apply_mod(o, m)
  for p in o.data.polygons: p.use_smooth = True
  return o

def tris(o):
  o.data.calc_loop_triangles(); return len(o.data.loop_triangles)

def decimate_to(o, target):
  n = tris(o)
  if n <= target: return o
  m = o.modifiers.new('decimate', 'DECIMATE'); m.ratio = target / n; apply_mod(o, m)
  for p in o.data.polygons: p.use_smooth = True
  return o

def cut(o, keep):
  """Delete faces whose world-space centre (game coords) fails keep()."""
  mw = o.matrix_world
  bm = bmesh.new(); bm.from_mesh(o.data)
  bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(game(mw @ f.calc_center_median()))], context='FACES')
  bm.to_mesh(o.data); bm.free()

def meshes(): return [o for o in bpy.context.scene.objects if o.type == 'MESH']

def game(v): return (v.x, v.z, -v.y)

# ---------- weights: each swept part knows its own bone chain; joints blend softly ----------
def smooth01(x): x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)
def blend(y, at, span=.05):   # 1 below the joint, 0 above, soft across +-span
  return smooth01((at + span - y) / (2 * span))

def w_torso(x, y, z):
  if y >= 1.40: k = blend(y, 1.485, .04); return {'spine': k, 'head': 1 - k}
  k = blend(y, 1.0, .06); return {'root': k, 'spine': 1 - k}
def w_arm(side):
  def f(x, y, z):
    if y > 1.40: k = blend(y, 1.47, .035); return {'sh' + side: .5 + .5 * k, 'spine': .5 - .5 * k}
    k = blend(y, RIG['elR'][1], .045); return {'el' + side: k, 'sh' + side: 1 - k}
  return f
def w_hand(side): return lambda x, y, z: {'el' + side: 1.0}
def w_leg(side):
  def f(x, y, z):
    kk = blend(y, RIG['knR'][1], .045); hk = blend(y, .90, .035)
    return {'kn' + side: kk * hk, 'hip' + side: (1 - kk) * hk, 'root': 1 - hk}
  return f
def w_pelvis(x, y, z):   # shorts waist: the band follows the pelvis, the lower sides follow each thigh
  side = 'R' if x >= 0 else 'L'; hk = blend(y, .90, .035) * smooth01((abs(x) - .03) / .06)
  return {'hip' + side: hk, 'root': 1 - hk}

def tag(o, fn):
  """Assign bone weights from fn(x, y, z) in game coordinates. Vertex groups merge by name on join."""
  groups = {}
  for i, v in enumerate(o.data.vertices):
    for bone, w in fn(*game(o.matrix_world @ v.co)).items():
      if w <= 1e-4: continue
      groups.setdefault(bone, o.vertex_groups.new(name=bone)).add([i], w, 'REPLACE')
  return o

def rigid(o, bone):
  vg = o.vertex_groups.new(name=bone); vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')

# ---------- materials ----------
reset()
M = {k: material(k, c, r) for k, c, r in [
  ('skin', (.86, .58, .42), .75), ('hair', (.16, .09, .05), .85), ('jersey', (.95, .27, .22), .8), ('trim', (1, 1, 1), .7),
  ('shorts', (.12, .14, .18), .85), ('shoes', (.94, .94, .94), .6), ('headwear', (.08, .09, .12), .8),
  ('socks', (.97, .97, .97), .8), ('sole', (.66, .77, .80), .5), ('laces', (.97, .97, .97), .7)]}

# ---------- body ----------
def build_body():
  S = SEG
  torso = loft('torso', [
    (.71, .115, .085, 0, .0), (.78, .165, .11, 0, .01), (.88, .18, .12, 0, .015), (.98, .168, .112, 0, .012),
    (1.08, .158, .104, 0, .0), (1.20, .172, .112, 0, -.006), (1.31, .185, .118, 0, -.012), (1.39, .18, .112, 0, -.012),
    (1.445, .13, .09, 0, -.008), (1.468, .075, .062, 0, -.008), (1.50, .05, .047, 0, -.01), (1.55, .046, .044, 0, -.014)], M['skin'], S['torso'])
  tag(torso, w_torso)
  parts = [torso]
  for s in (1, -1):
    x = s * AX
    arm = loft(f'arm{s}', [(1.485, .052, .052, x - s * .01, -.004), (1.45, .066, .064, x - s * .004, -.004), (1.38, .06, .058, x, -.004), (1.27, .054, .052, x, -.002),
      (1.16, .05, .05, x, 0), (1.06, .05, .046, x, -.006), (.975, .042, .038, x, -.018), (.935, .038, .033, x, -.026)], M['skin'], S['limb'])
    palm = loft(f'palm{s}', [(.935, .04, .03, x, -.032), (.90, .052, .03, x, -.037), (.86, .056, .028, x, -.041), (.82, .05, .024, x, -.043)], M['skin'], S['hand'], cap_start=False)
    fingers = [capsule(f'f{s}{i}', (x + s * dx, .825, -.043 + dz), (x + s * dx, .825 - ln, -.047 + dz), .0145, .012, M['skin'], S['hand'], 2)
               for i, (dx, dz, ln) in enumerate([(-.037, .002, .06), (-.012, -.002, .072), (.012, -.002, .068), (.036, .002, .056)])]
    thumb = capsule(f'thumb{s}', (x - s * .046, .885, -.052), (x - s * .066, .84, -.076), .016, .013, M['skin'], S['hand'], 2)
    leg = loft(f'leg{s}', [(.93, .085, .088, s * .10, .01), (.86, .092, .098, s * .10, .012), (.74, .086, .094, s * .10, .004), (.60, .072, .078, s * .10, -.004),
      (.50, .064, .066, s * .10, -.006), (.44, .061, .067, s * .10, -.002), (.35, .06, .075, s * .10, .014), (.24, .05, .058, s * .10, .008),
      (.14, .043, .046, s * .10, .002), (.075, .04, .042, s * .10, 0)], M['skin'], S['limb'])
    sd = 'R' if s > 0 else 'L'
    tag(arm, w_arm(sd)); tag(leg, w_leg(sd))
    for o in [palm, thumb] + fingers: tag(o, w_hand(sd))
    parts += [arm, palm, thumb, leg] + fingers
  body = join(parts, 'golfer_body')
  # only what shows survives: neck, arms below the sleeve, legs below the hem (with a margin under every edge)
  cut(body, lambda p: p[1] > 1.43 or (abs(p[0]) > .17 and p[1] < 1.36) or p[1] < .78 or (abs(p[0]) <= .17 and .70 < p[1] < 1.02))
  return body

def build_head():
  S = SEG
  skull = loft('skull', [(1.487, .042, .042, 0, -.025), (1.505, .08, .08, 0, -.022), (1.545, .114, .114, 0, -.012), (1.595, .135, .136, 0, -.004),
    (1.645, .139, .142, 0, 0), (1.70, .134, .14, 0, .004), (1.745, .114, .125, 0, .008), (1.775, .074, .086, 0, .01), (1.79, .03, .04, 0, .01)], M['skin'], S['ring'], cap_start=False)   # open at the neck: the torso's neck tube fills it
  subdivide(skull, S['sub'])
  ears = [ell(f'ear{s}', (s * .139, 1.64, .012), (.017, .036, .028), M['skin'], S['sphere'], S['sphere'] // 2) for s in (1, -1)]
  return join([skull] + ears, 'head_mesh')

def build_outfit():
  S = SEG
  jersey = loft('jersey', [(.99, .184, .126, 0, .012), (1.03, .178, .12, 0, .008), (1.08, .174, .117, 0, .002), (1.14, .178, .119, 0, -.002), (1.20, .186, .122, 0, -.006), (1.26, .193, .127, 0, -.009), (1.31, .198, .13, 0, -.012),
    (1.36, .198, .128, 0, -.012), (1.40, .196, .123, 0, -.012), (1.43, .182, .114, 0, -.01), (1.455, .135, .096, 0, -.008), (1.475, .078, .07, 0, -.008)], M['jersey'], S['jersey'], cap_start=False, cap_end=False)
  solidify(jersey, .009, M['trim']); tag(jersey, w_torso)
  sleeves = []
  for s in (1, -1):
    x = s * AX
    sl = loft(f'sleeve{s}', [(1.45, .045, .05, x - s * .075, -.006), (1.455, .066, .066, x - s * .03, -.005), (1.43, .073, .07, x - s * .006, -.004), (1.38, .072, .068, x, -.004), (1.33, .069, .066, x, -.004), (1.295, .068, .064, x, -.004)], M['jersey'], S['limb'] - 2, cap_start=True, cap_end=False)
    solidify(sl, .009, M['trim']); tag(sl, w_arm('R' if s > 0 else 'L')); sleeves.append(sl)
  jersey = join([jersey] + sleeves, 'jersey')
  waist = loft('waist', [(1.0, .17, .116, 0, .012), (.965, .178, .122, 0, .013), (.93, .186, .127, 0, .014), (.90, .196, .13, 0, .014), (.87, .205, .132, 0, .012), (.85, .206, .132, 0, .01)], M['shorts'], S['jersey'], cap_start=False, cap_end=False)
  legs = []
  for s in (1, -1):
    legs.append(tag(loft(f'shortleg{s}', [(.90, .092, .105, s * .10, .01), (.85, .10, .114, s * .102, .008), (.80, .104, .116, s * .104, .006), (.74, .103, .114, s * .106, .004)], M['shorts'], S['limb'] - 2, cap_start=True, cap_end=False), w_leg('R' if s > 0 else 'L')))
  legs.append(tag(ell('crotch', (0, .79, .0), (.065, .055, .075), M['shorts'], S['sphere'], S['sphere'] // 2), lambda x, y, z: {'root': 1.0}))
  for o in [waist] + legs: solidify(o, .009, M['trim'])
  tag(waist, w_pelvis)
  shorts = join([waist] + legs, 'shorts')
  return jersey, shorts

def build_socks_shoes():
  S = SEG; out = []
  for s in (1, -1):
    x = s * .10
    sock = loft(f'sock{s}', [(.26, .055, .063, x, .009), (.20, .05, .055, x, .006), (.14, .046, .049, x, .002), (.09, .045, .05, x, .002)], M['socks'], S['limb'] - 2, cap_start=True, cap_end=False)
    out.append((sock, s))
    upper = loft(f'upper{s}', [(.095, .04, .04, x, .062), (.07, .052, .056, x, .068), (.02, .056, .062, x, .07), (-.04, .058, .058, x, .066), (-.10, .058, .05, x, .06),
      (-.15, .056, .044, x, .052), (-.19, .05, .036, x, .044), (-.22, .038, .026, x, .036), (-.235, .018, .014, x, .034)], M['shoes'], S['shoe'], axis='z')
    collar = None
    tongue = loft(f'tongue{s}', [(-.01, .034, .014, x, .104), (-.07, .034, .012, x, .102), (-.13, .03, .01, x, .088), (-.17, .02, .008, x, .07)], M['trim'], S['hand'], axis='z')
    shoe = join([upper, collar, tongue], f'shoe{s}')
    sole = loft(f'sole{s}', [(.11, .05, .016, x, .018), (.07, .058, .019, x, .018), (0, .063, .021, x, .019), (-.08, .063, .021, x, .019), (-.16, .06, .019, x, .018), (-.21, .045, .014, x, .02), (-.24, .022, .008, x, .026)], M['sole'], S['hand'] + 2, axis='z')
    laces = join([box(f'lace{s}{i}', (x, .118 - i * .011, -.04 - i * .03), (.05, .007, .012), M['laces'], .002, 1) for i in range(4)], f'laces{s}')
    out += [(shoe, s), (sole, s), (laces, s)]
  return out

# ---------- hair + headwear (rigid, head bone) ----------
def shell_r(p): return math.sqrt(((p[0] - HEAD_C[0]) / HEAD_R[0]) ** 2 + ((p[1] - HEAD_C[1]) / HEAD_R[1]) ** 2 + ((p[2] - HEAD_C[2]) / HEAD_R[2]) ** 2)

def hair_shell(name, grow=1.06, front=.085, back=-.09, thickness=.012):
  S = SEG
  o = ell(name, HEAD_C, (HEAD_R[0] * grow, HEAD_R[1] * grow, HEAD_R[2] * grow), M['hair'], S['hair'], S['hair'] // 2 + 1)
  def keep(p):   # hairline: high on the forehead, low on the nape (forward is -z)
    t = (p[2] + HEAD_R[2]) / (2 * HEAD_R[2]); line = front + (back - front) * max(0.0, min(1.0, t))
    return p[1] - HEAD_C[1] > line
  cut(o, keep)
  solidify(o, thickness)
  cut(o, lambda p: shell_r(p) > 1 + thickness * .3 / HEAD_R[1])   # the inner face sits inside the head: never seen
  return o

def build_hair():
  S = SEG; sp = S['sphere']; styles = {}
  def finish(name, objs):
    o = join(objs, 'hair_' + name); o['variant'] = 'hair'; styles[name] = o
  finish('short', [hair_shell('s', 1.06, .075, -.08), ell('fringe', (-.03, 1.72, -.13), (.095, .03, .05), M['hair'], sp, sp // 2)])
  finish('buzz', [hair_shell('b', 1.03, .07, -.09, .006)])
  finish('curly', [hair_shell('c', 1.07, .075, -.08)] + [ell(f'curl{i}', (math.cos(i * math.tau / 9) * .112, 1.735 + (i % 2) * .02, math.sin(i * math.tau / 9) * .117), (.046, .04, .046), M['hair'], sp - 4, sp // 2 - 1) for i in range(9)] + [ell('curltop', (0, 1.795, 0), (.078, .042, .078), M['hair'], sp - 4, sp // 2 - 1)])
  finish('long', [hair_shell('l', 1.06, .075, -.17), ell('drape', (0, 1.46, .128), (.118, .17, .046), M['hair'], sp, sp // 2), ell('drapeL', (-.127, 1.52, .04), (.03, .13, .078), M['hair'], sp - 4, sp // 2), ell('drapeR', (.127, 1.52, .04), (.03, .13, .078), M['hair'], sp - 4, sp // 2)])
  finish('bun', [hair_shell('bn', 1.045, .075, -.08), ell('bun', (0, 1.765, .128), (.06, .054, .054), M['hair'], sp - 2, sp // 2)])
  finish('ponytail', [hair_shell('p', 1.05, .075, -.08), ell('tie', (0, 1.68, .158), (.036, .03, .03), M['hair'], sp - 6, sp // 2 - 2), ell('tail', (0, 1.55, .205), (.044, .155, .038), M['hair'], sp - 2, sp // 2, rot=(.4, 0, 0))])
  finish('sidepart', [hair_shell('sp', 1.06, .08, -.08), ell('sweep', (.055, 1.735, -.11), (.105, .03, .062), M['hair'], sp, sp // 2, rot=(0, 0, -.28))])
  finish('mohawk', [hair_shell('m', 1.025, .07, -.09, .005), ell('ridge', (0, 1.80, -.01), (.022, .078, .138), M['hair'], sp - 4, sp // 2)])
  finish('afro', [ell('afro', (0, 1.675, .012), (.198, .192, .198), M['hair'], S['hair'], S['hair'] // 2 + 2)])
  finish('braids', [hair_shell('br', 1.045, .08, -.08)] + [capsule(f'braid{i}', (x, 1.61, .135), (x * 1.3, 1.38, .115 + abs(x)), .019, .015, M['hair'], max(6, sp - 6)) for i, x in enumerate((-.078, 0, .078))])
  finish('wavy', [hair_shell('w', 1.08, .065, -.11)] + [ell(f'wave{i}', (x, 1.72 - abs(x) * .3, -.122), (.054, .034, .046), M['hair'], sp - 4, sp // 2) for i, x in enumerate((-.088, 0, .088))])
  return styles

def build_headwear():
  S = SEG; sp = S['sphere']; styles = {}
  def finish(name, objs):
    o = join(objs, 'headwear_' + name); o['variant'] = 'headwear'; styles[name] = o
  def dome(n, grow=1.10, cut_y=.0):
    o = ell(n, (0, HEAD_C[1] + .01, 0), (HEAD_R[0] * grow, HEAD_R[1] * grow, HEAD_R[2] * grow), M['headwear'], S['hair'], S['hair'] // 2 + 1)
    cut(o, lambda p: p[1] - HEAD_C[1] > cut_y); solidify(o, .006); cut(o, lambda p: shell_r(p) > grow + .001); return o
  band = lambda n, y=1.645, r=.153: torus(n, (0, y, 0), r, .012, M['headwear'], major=S['ring'], minor=6)
  brim = lambda n, z: ell(n, (0, 1.65, z), (.136, .008, .082), M['headwear'], sp + 4, 6)
  finish('cap', [dome('capdome'), band('capband'), brim('capbrim', -.165), ell('button', (0, 1.802, .0), (.012, .008, .012), M['headwear'], 8, 4)])
  finish('backcap', [dome('bcdome'), band('bcband'), brim('bcbrim', .165)])
  finish('beanie', [dome('bdome', 1.12, -.02), torus('fold', (0, 1.615, 0), .159, .024, M['headwear'], major=S['ring'], minor=6), ell('pom', (0, 1.82, .01), (.033, .033, .033), M['headwear'], sp - 6, sp // 2 - 2)])
  finish('visor', [band('vband', 1.655, .155), brim('vbrim', -.165)])
  finish('bucket', [dome('bkdome', 1.09, .015), torus('bkbrim', (0, 1.625, 0), .178, .034, M['headwear'], major=S['ring'], minor=6, squash=.35)])
  finish('headband', [torus('hb', (0, 1.67, 0), .154, .014, M['headwear'], major=S['ring'], minor=6)])
  return styles

# ---------- rig ----------
def build_rig(objs):
  rigdata = bpy.data.armatures.new('ChainsRig'); rig = bpy.data.objects.new('ChainsRig', rigdata); bpy.context.collection.objects.link(rig)
  select([rig]); bpy.ops.object.mode_set(mode='EDIT')
  parents = {'root': None, 'spine': 'root', 'head': 'spine', 'shR': 'spine', 'elR': 'shR', 'shL': 'spine', 'elL': 'shL', 'hipR': 'root', 'knR': 'hipR', 'hipL': 'root', 'knL': 'hipL'}
  for name, p in RIG.items():
    b = rigdata.edit_bones.new(name); b.head = xyz(p); b.tail = xyz((p[0], p[1] + .12, p[2])); b.roll = 0
    if parents[name]: b.parent = rigdata.edit_bones[parents[name]]
  bpy.ops.object.mode_set(mode='OBJECT')
  for o in objs:
    mod = o.modifiers.new('ChainsRig', 'ARMATURE'); mod.object = rig; o.parent = rig
  rig['forward'] = '-Z'; rig['releasePhase'] = .62; rig['style'] = 'athlete v2'
  rig['handOffset'] = list(HAND); rig['headCentre'] = list(HEAD_C); rig['headRadii'] = list(HEAD_R)
  return rig

# ---------- export ----------
def export(name, budget):
  objs = meshes(); total = sum(tris(o) for o in objs)
  for o in objs:
    if not o.data.uv_layers: o.data.uv_layers.new(name='UVMap')   # every mesh carries a UV set (solidify rims, joins)
  REPORT[name] = {'triangles': total, 'meshCount': len(objs), 'perMesh': {o.name: tris(o) for o in objs}}
  print('CHAINS_TRIS', name, total, json.dumps(REPORT[name]['perMesh']), flush=True)
  assert total < budget, (name, total)
  bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / (name + '.blend')), compress=True)
  bpy.ops.export_scene.gltf(filepath=str(OUT / (name + '.glb')), export_format='GLB', export_yup=True, export_animations=False,
    export_skins=True, export_all_influences=False, export_extras=True, export_texcoords=True, export_apply=False)
  REPORT[name]['bytes'] = (OUT / (name + '.glb')).stat().st_size
  print('CHAINS_EXPORT', name, json.dumps({k: v for k, v in REPORT[name].items() if k != 'perMesh'}), flush=True)

def preview(tag):
  """Workbench turnaround so the build can be judged without opening Blender."""
  PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
  scene = bpy.context.scene; scene.render.engine = 'BLENDER_WORKBENCH'; scene.render.resolution_x = scene.render.resolution_y = 640
  scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'MATERIAL'; scene.display.shading.show_cavity = True
  scene.display.shading.show_shadows = True; scene.display.shading.show_object_outline = True
  scene.display_settings.display_device = 'sRGB'; scene.view_settings.view_transform = 'Standard'
  cam_data = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_data); bpy.context.collection.objects.link(cam); scene.camera = cam
  views = {'front': ((0, -3.1, 1.0), 60), 'quarter': ((2.1, -2.3, 1.15), 60), 'back': ((0, 3.1, 1.0), 60), 'face': ((.6, -1.0, 1.66), 85), 'feet': ((1.0, -1.3, .35), 70)}
  for view, (pos, lens) in views.items():
    cam_data.lens = lens; cam.location = pos; look = Vector((0, 0, 1.63 if view == 'face' else .18 if view == 'feet' else .92))
    cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = (look - Vector(pos)).to_track_quat('-Z', 'Y')
    scene.render.filepath = str(PREVIEW_DIR / f'golfer-v2-{tag}-{view}.png'); bpy.ops.render.render(write_still=True)
  bpy.data.objects.remove(cam); bpy.data.cameras.remove(cam_data)

def show_only(hair, headwear, accessories=False):
  for o in meshes():
    if o.name.startswith('hair_'): o.hide_render = o.name != 'hair_' + hair
    elif o.name.startswith('headwear_'): o.hide_render = o.name != 'headwear_' + str(headwear)
    elif o.name.startswith('accessory_'): o.hide_render = not accessories

# ---------- build ----------
def build(lod):
  global SEG
  SEG = segs(lod)
  for o in list(bpy.data.objects): bpy.data.objects.remove(o)
  body = build_body(); head = build_head(); jersey, shorts = build_outfit()
  rigid(head, 'head')
  for o, s in build_socks_shoes(): rigid(o, 'kn' + ('R' if s > 0 else 'L'))
  for s in (1, -1):
    wb = torus('accessory_wristband' + ('R' if s > 0 else 'L'), (s * AX, .955, -.02), .046, .012, M['trim'], major=SEG['ring'] // 2, minor=6)
    wb['variant'] = 'accessory'; rigid(wb, 'el' + ('R' if s > 0 else 'L'))
  hair = build_hair(); headwear = build_headwear()
  for o in list(hair.values()) + list(headwear.values()): rigid(o, 'head')
  return build_rig(meshes())

build(False)
if PREVIEW:
  show_only('short', 'cap'); preview('cap')
  show_only('wavy', None, True); preview('bare')
  show_only('afro', 'headband'); preview('afro')
export('golfer-v2-source', 18000)
build(True)
if PREVIEW: show_only('short', 'cap'); preview('lod')
export('golfer-v2-lod-source', 6400)
(OUT / 'golfer-build-report.json').write_text(json.dumps(REPORT, indent=2) + '\n')
(ROOT / 'tools/golfer-rig.json').write_text(json.dumps({'rig': RIG, 'hand': HAND, 'head': {'centre': HEAD_C, 'radii': HEAD_R}, 'ground': GROUND}, indent=2) + '\n')
print('CHAINS_GOLFER_V2_DONE', flush=True)
