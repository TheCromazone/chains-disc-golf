"""Course trees for Chains: branching trunks with leaf-card crowns, the way most shipped games build them.
Run: blender -b -P tools/build-trees.py [-- --preview docs/qa/r7]
Each species is one Draco GLB with two meshes: 'wood' (material 'bark', tapered branch tubes) and 'leaves'
(material 'leaf_deciduous' or 'leaf_pine', crossed cards that the runtime draws alpha-tested with the keyed
photo clusters in assets/textures/foliage). Variants live in one file as separate nodes ('pine0', 'pine1', ...).
The runtime instances one variant per tree spot and tints it per instance, so a forest never repeats exactly.
Writes assets/models/pine.glb, deciduous.glb, bush.glb.
"""
from pathlib import Path
import sys, math, random, json
import bpy, bmesh
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]; OUT = ROOT / 'assets/models'
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = '--preview' in argv
PREVIEW_DIR = Path(argv[argv.index('--preview') + 1]) if PREVIEW else ROOT / 'docs/qa/r7'
if not PREVIEW_DIR.is_absolute(): PREVIEW_DIR = ROOT / PREVIEW_DIR
REPORT = {}
def log(*a): print('CHAINS', *a, flush=True)

def material(name, color):
  m = bpy.data.materials.new(name); m.use_nodes = True
  m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*color, 1); m.diffuse_color = (*color, 1); return m

class Builder:
  """Accumulates tube and card geometry for one tree into two meshes."""
  def __init__(self, rng):
    self.rng = rng; self.wv = []; self.wf = []; self.wuv = []; self.lv = []; self.lf = []; self.luv = []; self.lc = []
  def tube(self, a, b, r1, r2, seg=6):
    A, B = Vector(a), Vector(b); n = (B - A).normalized()
    up = Vector((0, 0, 1)) if abs(n.z) < .9 else Vector((1, 0, 0)); u = n.cross(up).normalized(); v = n.cross(u)
    base = len(self.wv)
    for j, (c, r) in enumerate(((A, r1), (B, r2))):
      for i in range(seg):
        ang = i * math.tau / seg; self.wv.append(c + (u * math.cos(ang) + v * math.sin(ang)) * r)
    for i in range(seg):
      p, q = base + i, base + (i + 1) % seg; self.wf.append((p, q, q + seg, p + seg))
      self.wuv.append([(i / seg, 0), ((i + 1) / seg, 0), ((i + 1) / seg, 1), (i / seg, 1)])
  def card(self, centre, size, normal, roll, shade, aspect=1.0, cross=True):
    """One or two crossed quads facing `normal`, bottom edge at the branch, tinted by vertex colour."""
    n = Vector(normal).normalized(); up = Vector((0, 0, 1)) if abs(n.z) < .95 else Vector((0, 1, 0))
    for k in range(2 if cross else 1):
      m = Matrix.Rotation(roll + k * math.pi / 2, 4, n)
      u = (m @ up.cross(n)).normalized() * size * .5 * aspect; w = (m @ up).normalized() * size
      c = Vector(centre); base = len(self.lv)
      self.lv += [c - u, c + u, c + u + w, c - u + w]
      self.lf.append((base, base + 1, base + 2, base + 3)); self.luv.append([(0, 0), (1, 0), (1, 1), (0, 1)])
      self.lc += [shade] * 4
  def finish(self, name, mats):
    objs = []
    for tag, verts, faces, uvs, cols, mat in (('wood', self.wv, self.wf, self.wuv, None, mats[0]), ('leaves', self.lv, self.lf, self.luv, self.lc, mats[1])):
      me = bpy.data.meshes.new(f'{name}_{tag}'); me.from_pydata([tuple(v) for v in verts], [], faces); me.update()
      layer = me.uv_layers.new(name='UVMap')
      for poly, corners in zip(me.polygons, uvs):
        for li, uv in zip(poly.loop_indices, corners): layer.data[li].uv = uv
      if cols:
        ca = me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
        for i, c in enumerate(cols): ca.data[i].color = (c, c, c, 1)
      me.materials.append(mat)
      for p in me.polygons: p.use_smooth = True
      o = bpy.data.objects.new(f'{name}_{tag}', me); bpy.context.collection.objects.link(o); objs.append(o)
    bpy.ops.object.select_all(action='DESELECT')   # earlier trees stay selected otherwise and would be joined in
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join(); o = objs[0]; o.name = name
    return o

def deciduous(rng, name, mats, height=7.5, spread=1.0):
  b = Builder(rng); h = height * rng.uniform(.85, 1.15)
  # trunk: a gently bending stack of tubes
  p = Vector((0, 0, 0)); d = Vector((0, 0, 1)); r = .22 * h / 7.5; tips = []
  segs = 5
  for i in range(segs):
    d = (d + Vector((rng.uniform(-.12, .12), rng.uniform(-.12, .12), 0))).normalized()
    q = p + d * (h * .45 / segs); b.tube(p, q, r, r * .82); p, r = q, r * .82
  top = p
  # primary branches from the upper trunk, each with two forks; every fork end and mid-point gets a leaf card
  count = rng.randint(6, 8)
  for i in range(count):
    ang = i * math.tau / count + rng.uniform(-.3, .3); tilt = rng.uniform(.35, .75)
    start = top - Vector((0, 0, rng.uniform(0, h * .2)))
    dirn = Vector((math.cos(ang) * math.cos(tilt), math.sin(ang) * math.cos(tilt), math.sin(tilt))).normalized()
    L = h * rng.uniform(.32, .46) * spread; end = start + dirn * L; b.tube(start, end, r * .9, r * .35)
    tips.append((end, dirn, L))
    for k in range(2):
      side = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(.2, .9))).normalized()
      f = (dirn * .6 + side * .5).normalized(); mid = start + dirn * L * rng.uniform(.45, .8); fe = mid + f * L * rng.uniform(.45, .7)
      b.tube(mid, fe, r * .3, r * .12); tips.append((fe, f, L * .55))
  for end, dirn, L in tips:
    for j in range(3):
      c = end - dirn * L * rng.uniform(0, .45) + Vector((rng.uniform(-.4, .4), rng.uniform(-.4, .4), rng.uniform(-.2, .3)))
      size = h * rng.uniform(.22, .3) * spread
      shade = .55 + .45 * min(1, max(0, (c.z - h * .35) / (h * .55)))   # darker low in the crown
      b.card(c - Vector((0, 0, size * .4)), size, (rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-.3, .3)), rng.uniform(0, math.pi), shade)
  return b.finish(name, mats)

def pine(rng, name, mats, height=11):
  b = Builder(rng); h = height * rng.uniform(.85, 1.15); r = .26 * h / 11
  p = Vector((0, 0, 0)); segs = 6
  for i in range(segs):
    q = p + Vector((rng.uniform(-.05, .05), rng.uniform(-.05, .05), h / segs)); b.tube(p, q, r, r * .78); p, r = q, r * .78
  # whorls of branches, shorter toward the top; needle cards hang along each branch
  z = h * .28
  while z < h * .95:
    t = (z - h * .28) / (h * .67); L = h * .3 * (1 - t) ** .8 + .5; n = rng.randint(4, 6)
    for i in range(n):
      ang = i * math.tau / n + rng.uniform(-.4, .4); droop = -.12 + rng.uniform(-.1, .1)
      dirn = Vector((math.cos(ang), math.sin(ang), droop)).normalized(); start = Vector((0, 0, z)); end = start + dirn * L
      b.tube(start, end, .05 * L + .02, .015)
      cards = max(1, int(L / 1.1))
      for k in range(cards):
        c = start + dirn * L * (k + .7) / cards; size = min(1.6, L * .9 / cards + .6)
        b.card(c - Vector((0, 0, size * .55)), size, (dirn.x, dirn.y, .35), rng.uniform(-.4, .4), .5 + .5 * (1 - t) * .8, aspect=.75)
    z += h * .11
  b.card(Vector((0, 0, h - .6)), 1.4, (0, 0, 1), rng.uniform(0, 1), 1.0, aspect=.7)   # crown spike
  return b.finish(name, mats)

def bush(rng, name, mats):
  b = Builder(rng)
  for i in range(rng.randint(10, 14)):
    ang = rng.uniform(0, math.tau); rad = rng.uniform(0, .6); c = Vector((math.cos(ang) * rad, math.sin(ang) * rad, rng.uniform(.15, .8)))
    b.tube(Vector((0, 0, 0)), c, .03, .01, 5)
    b.card(c - Vector((0, 0, .5)), rng.uniform(1.0, 1.4), (math.cos(ang), math.sin(ang), rng.uniform(-.2, .5)), rng.uniform(0, math.pi), .6 + .4 * c.z)
  return b.finish(name, mats)

def export(species, objs):
  bpy.ops.object.select_all(action='DESELECT')
  for o in objs: o.select_set(True)
  total = 0
  for o in objs: o.data.calc_loop_triangles(); total += len(o.data.loop_triangles)
  path = OUT / f'{species}.glb'
  bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', export_yup=True, use_selection=True, export_animations=False, export_image_format='NONE', export_extras=True,
    export_texcoords=True, export_vertex_color='ACTIVE', export_apply=True,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_draco_position_quantization=12, export_draco_normal_quantization=8, export_draco_texcoord_quantization=10)
  REPORT[species] = {'variants': [o.name for o in objs], 'triangles': total, 'bytes': path.stat().st_size}
  log('EXPORT', species, json.dumps(REPORT[species]))

def preview(objs, tag):
  PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
  scene = bpy.context.scene; scene.render.engine = 'BLENDER_WORKBENCH'; scene.render.resolution_x = 900; scene.render.resolution_y = 600
  scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'MATERIAL'; scene.display.shading.show_shadows = True
  for o in bpy.context.scene.objects:
    if o.type == 'MESH': o.hide_render = o not in objs
  for i, o in enumerate(objs): o.location = (i * 9 - 9 * (len(objs) - 1) / 2, 0, 0)
  cam_data = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_data); bpy.context.collection.objects.link(cam); scene.camera = cam
  cam_data.lens = 40; cam.location = (0, -34, 9); cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = (Vector((0, 0, 5)) - Vector(cam.location)).to_track_quat('-Z', 'Y')
  scene.render.filepath = str(PREVIEW_DIR / f'trees-{tag}.png'); bpy.ops.render.render(write_still=True)
  bpy.data.objects.remove(cam); bpy.data.cameras.remove(cam_data)
  for o in objs: o.location = (0, 0, 0)

bpy.ops.wm.read_factory_settings(use_empty=True)
mats = {'bark': material('bark', (.36, .25, .16)), 'leaf_deciduous': material('leaf_deciduous', (.3, .55, .2)), 'leaf_pine': material('leaf_pine', (.15, .35, .18))}
rng = random.Random(7)
dec = [deciduous(rng, f'deciduous{i}', (mats['bark'], mats['leaf_deciduous']), spread=(1.0, 1.15, .9)[i]) for i in range(3)]
pin = [pine(rng, f'pine{i}', (mats['bark'], mats['leaf_pine'])) for i in range(3)]
bsh = [bush(rng, f'bush{i}', (mats['bark'], mats['leaf_deciduous'])) for i in range(2)]
if PREVIEW: preview(dec, 'deciduous'); preview(pin, 'pine'); preview(bsh, 'bush')
export('deciduous', dec); export('pine', pin); export('bush', bsh)
(OUT / 'trees-build-report.json').write_text(json.dumps(REPORT, indent=2) + '\n')
log('TREES_DONE')
