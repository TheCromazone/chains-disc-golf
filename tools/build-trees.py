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
    self.rng = rng; self.wv = []; self.wf = []; self.wuv = []; self.lv = []; self.lf = []; self.luv = []; self.lc = []; self.ao = lambda v, g: (g, g, g)
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
  def card(self, centre, size, normal, roll, shade=1.0, aspect=1.0, cross=True):
    """One or two crossed quads facing `normal`, bottom edge at the branch; every vertex takes the crown's baked occlusion."""
    n = Vector(normal).normalized(); up = Vector((0, 0, 1)) if abs(n.z) < .95 else Vector((0, 1, 0))
    for k in range(2 if cross else 1):
      m = Matrix.Rotation(roll + k * math.pi / 2, 4, n)
      u = (m @ up.cross(n)).normalized() * size * .5 * aspect; w = (m @ up).normalized() * size
      c = Vector(centre); base = len(self.lv)
      for v in (c - u, c + u, c + u + w, c - u + w): self.lv.append(v); self.lc.append(self.ao(v, shade))
      self.lf.append((base, base + 1, base + 2, base + 3)); self.luv.append([(0, 0), (1, 0), (1, 1), (0, 1)])
  def crown(self, z0, z1, radius_at):
    """Hemispherical occlusion baked into leaf vertex colour: lit at the top rim, dark at the crown core and underside.
    radius_at(up) is the crown's radius at that height fraction, so a cone and a globe both shade against their own outline."""
    def ao(v, gain):
      up = min(1, max(0, (v.z - z0) / (z1 - z0))); r = min(1, math.hypot(v.x, v.y) / radius_at(up))
      sky = min(1, max(0, .4 * r + .6 * up)) ** 1.8 * gain
      return (.12 + .78 * sky, .15 + .75 * sky, .15 + .72 * sky)   # the shade leans cool, the light warm
    self.ao = ao
  def finish(self, name, mats):
    objs = []
    for tag, verts, faces, uvs, cols, mat in (('wood', self.wv, self.wf, self.wuv, None, mats[0]), ('leaves', self.lv, self.lf, self.luv, self.lc, mats[1])):
      me = bpy.data.meshes.new(f'{name}_{tag}'); me.from_pydata([tuple(v) for v in verts], [], faces); me.update()
      layer = me.uv_layers.new(name='UVMap')
      for poly, corners in zip(me.polygons, uvs):
        for li, uv in zip(poly.loop_indices, corners): layer.data[li].uv = uv
      if cols:
        ca = me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
        for i, c in enumerate(cols): ca.data[i].color = (*c, 1)
      me.materials.append(mat)
      for p in me.polygons: p.use_smooth = True
      o = bpy.data.objects.new(f'{name}_{tag}', me); bpy.context.collection.objects.link(o); objs.append(o)
    bpy.ops.object.select_all(action='DESELECT')   # earlier trees stay selected otherwise and would be joined in
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join(); o = objs[0]; o.name = name
    return o

def deciduous(rng, name, mats, height=7.5, spread=1.0, lean=0.0, bare=.5):
  """Bare trunk for `bare` of the height, a leader through the crown, few limbs each forking once. Leaf clusters sit at the
  limb ends only, big and irregular, and a fifth of the tips stay bare, so sky shows through and the skeleton reads."""
  b = Builder(rng); h = height * rng.uniform(.9, 1.1); R = h * .4 * spread
  b.crown(h * bare * .8, h * 1.05, lambda up: R * (.55 + .45 * math.sin(up * math.pi)))
  p = Vector((0, 0, 0)); d = Vector((lean * .4, 0, 1)).normalized(); r = .2 * h / 7.5; tips = []
  segs = 5
  for i in range(segs):
    d = (d + Vector((rng.uniform(-.1, .1) + lean * .05, rng.uniform(-.1, .1), 0))).normalized()
    q = p + d * (h * bare / segs); b.tube(p, q, r, r * .84); p, r = q, r * .84
  top = p
  lead = top + Vector((rng.uniform(-.08, .08) * h, rng.uniform(-.08, .08) * h, h * (1 - bare) * .75))
  b.tube(top, lead, r, r * .2); tips.append((lead, Vector((0, 0, 1)), h * .2))
  count = rng.randint(4, 6)
  for i in range(count):
    ang = i * math.tau / count + rng.uniform(-.35, .35); tilt = rng.uniform(.3, .8)
    start = top - Vector((0, 0, rng.uniform(0, h * .12)))
    dirn = Vector((math.cos(ang) * math.cos(tilt), math.sin(ang) * math.cos(tilt), math.sin(tilt))).normalized()
    L = h * rng.uniform(.3, .45) * spread; end = start + dirn * L; b.tube(start, end, r * .8, r * .3)
    tips.append((end, dirn, L))
    side = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(.4, 1))).normalized()
    f = (dirn * .5 + side * .6).normalized(); mid = start + dirn * L * rng.uniform(.4, .65); fe = mid + f * L * rng.uniform(.5, .75)
    b.tube(mid, fe, r * .3, r * .1); tips.append((fe, f, L * .6))
  for end, dirn, L in tips:
    if rng.random() < .2: continue   # bare tip: a gap in the crown
    for j in range(rng.randint(3, 4)):
      c = end - dirn * L * rng.uniform(0, .25) + Vector((rng.uniform(-.45, .45), rng.uniform(-.45, .45), rng.uniform(-.3, .3)))
      size = h * rng.uniform(.2, .3) * spread   # cards stay under ~2.5 m so the photo leaves keep a believable scale
      out = Vector((c.x, c.y, 0)).normalized() if c.xy.length > .5 else Vector((1, 0, 0))
      b.card(c - Vector((0, 0, size * .4)), size, out + Vector((rng.uniform(-.6, .6), rng.uniform(-.6, .6), rng.uniform(-.3, .3))), rng.uniform(0, math.pi))
  return b.finish(name, mats)

def pine(rng, name, mats, height=11, bare=.35, density=.85):
  """Bare trunk to `bare` of the height, then loose tiers of unequal branches with a sprig standing at each tip and one mid-branch;
  missing branches (1 - density) and the tier spacing leave sky gaps between the dark masses, as in the reference pines."""
  b = Builder(rng); h = height * rng.uniform(.9, 1.1); r = .24 * h / 11; R = h * .3
  b.crown(h * bare, h, lambda up: R * (1 - .75 * up) + .3)
  p = Vector((0, 0, 0)); segs = 6
  for i in range(segs):
    q = p + Vector((rng.uniform(-.05, .05), rng.uniform(-.05, .05), h / segs)); b.tube(p, q, r, r * .78); p, r = q, r * .78
  z = h * bare
  while z < h * .92:
    t = (z - h * bare) / (h * (.92 - bare)); L = h * .27 * (1 - t) ** .7 + .6; n = rng.randint(3, 5)
    for i in range(n):
      if rng.random() > density + t * (1 - density): continue   # gaps low in the crown; the top stays full so trunks do not read as poles
      ang = i * math.tau / n + rng.uniform(-.5, .5); droop = -.08 - .12 * (1 - t) + rng.uniform(-.08, .08)
      Li = L * rng.uniform(.6, 1.15); dirn = Vector((math.cos(ang), math.sin(ang), droop)).normalized(); start = Vector((0, 0, z)); end = start + dirn * Li
      b.tube(start, end, .045 * Li + .02, .012)
      for frac, k in ((1.0, 1.0), (.5, .75)):
        if frac < 1 and Li < 1.6: continue
        c = start + dirn * Li * frac; size = min(2.4, Li * .7 + .5) * k
        b.card(c - Vector((0, 0, size * .5)), size, (dirn.x, dirn.y, .25), rng.uniform(-.35, .35), aspect=.7)
    z += h * rng.uniform(.09, .13)
  b.card(Vector((0, 0, h - .7)), 1.6, (1, 0, 0), rng.uniform(0, 1), aspect=.7)   # crown spike, standing
  return b.finish(name, mats)

def bush(rng, name, mats):
  b = Builder(rng); b.crown(0, 1.3, lambda up: 1.1)
  for i in range(rng.randint(8, 11)):
    ang = rng.uniform(0, math.tau); rad = rng.uniform(0, .6); c = Vector((math.cos(ang) * rad, math.sin(ang) * rad, rng.uniform(.15, .8)))
    b.tube(Vector((0, 0, 0)), c, .03, .01, 5)
    b.card(c - Vector((0, 0, .5)), rng.uniform(1.1, 1.6), (math.cos(ang), math.sin(ang), rng.uniform(-.2, .5)), rng.uniform(0, math.pi))
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
# three distinct skeletons per species: upright, broad-and-tall, narrow-and-leaning / tall-sparse, short-full
dec = [deciduous(rng, f'deciduous{i}', (mats['bark'], mats['leaf_deciduous']), height=h, spread=s, lean=l, bare=bare) for i, (h, s, l, bare) in enumerate(((7.5, 1.0, 0, .5), (8.8, 1.2, .15, .55), (6.5, .85, -.12, .45)))]
pin = [pine(rng, f'pine{i}', (mats['bark'], mats['leaf_pine']), height=h, bare=bare, density=d) for i, (h, bare, d) in enumerate(((11, .35, .85), (13.5, .45, .7), (9, .3, 1.0)))]
bsh = [bush(rng, f'bush{i}', (mats['bark'], mats['leaf_deciduous'])) for i in range(2)]
if PREVIEW: preview(dec, 'deciduous'); preview(pin, 'pine'); preview(bsh, 'bush')
export('deciduous', dec); export('pine', pin); export('bush', bsh)
(OUT / 'trees-build-report.json').write_text(json.dumps(REPORT, indent=2) + '\n')
log('TREES_DONE')
