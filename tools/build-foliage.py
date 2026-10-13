"""Leaf-spray card atlas and birch bark for the Chains trees (Blender 5.2, Cycles on the GPU).
Run: blender -b -P tools/build-foliage.py
Writes assets/textures/foliage/leaves.webp (albedo + alpha), leaves_n.webp (normal) and bark_birch.webp.

A card used to be one photo of a dense leaf cluster, so every crown read as a pile of green discs. Each 512 px cell of the
atlas is now one twig spray rendered from above: real leaf meshes (folded along the midrib, arched, serrated, 3-10 cm) on a
tapering twig with side shoots, so a card reads as twig + separate leaves + sky between them. Three renders per cell (albedo,
camera-space normal, ambient occlusion) are combined in numpy at 4x supersampling: the albedo carries the occlusion (a leaf
under a leaf darkens), the normal map carries every leaf's own tilt so the runtime lights leaves one by one, and the colour
bleeds past the alpha edge so mip levels do not pull a dark fringe in. Cells (card size in metres), 3 across and 2 up in a
1536 x 1024 atlas: 0 broadleaf branch tip (1.8), 1 denser broadleaf branch tip (1.6), 2 weeping birch branch tip with small
double-serrate leaves (1.6), 3 spruce frond (2.0): the pine-sprig photo of the previous rounds repeated along a twig, 4 Scots pine
branch end (2.0): the same photo as separate tufts at the tips of forking shoots; 5 is spare.
"""
from pathlib import Path
import math, random, sys
import bpy
import numpy as np
import OpenImageIO as oiio

ROOT = Path(__file__).resolve().parents[1]; OUT = ROOT / 'assets/textures/foliage'
TMP = ROOT / 'art/qa/foliage-build'; TMP.mkdir(parents=True, exist_ok=True)
CELL, SS = 512, 4   # final cell size, supersampling
def log(*a): print('CHAINS', *a, flush=True)

def srgb_to_lin(c): return tuple(((x / 255) / 12.92) if x / 255 <= .04045 else (((x / 255) + .055) / 1.055) ** 2.4 for x in c)
def hsv(h, s, v):
  i = int(h * 6) % 6; f = h * 6 - int(h * 6); p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
  r, g, b = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i]; return srgb_to_lin((r * 255, g * 255, b * 255))

class Spray:
  """Accumulates twig tubes and leaf blades (with per-corner colour) for one card."""
  def __init__(self, rng, size):
    self.rng, self.S, self.v, self.f, self.c = rng, size, [], [], []
  def inside(self, p, m=.02):
    return abs(p[0]) < self.S * (.5 - m) and self.S * .005 < p[1] < self.S * (1 - m)
  def tube(self, pts, r0, r1, col, seg=6):
    n = len(pts)
    for i in range(n - 1):
      a, b = pts[i], pts[i + 1]; ra = r0 + (r1 - r0) * i / (n - 1); rb = r0 + (r1 - r0) * (i + 1) / (n - 1)
      d = np.subtract(b, a); d = d / (np.linalg.norm(d) + 1e-9); u = np.cross(d, (0, 0, 1)); u = u / (np.linalg.norm(u) + 1e-9); w = np.cross(d, u)
      base = len(self.v)
      for c, r in ((a, ra), (b, rb)):
        for k in range(seg):
          ang = k * math.tau / seg; self.v.append(tuple(np.add(c, (u * math.cos(ang) + w * math.sin(ang)) * r)))
      for k in range(seg):
        p, q = base + k, base + (k + 1) % seg; self.f.append((p, q, q + seg, p + seg)); self.c.append([col] * 4)
  def leaf(self, base, direction, length, width, col, shape='ovate', fold=.35, arch=.12, roll=0., droop=0., serr=.05, teeth=9):
    """Blade along `direction` (unit 3-vector) from `base`: midrib points plus two edges, folded up along the midrib (V section),
    arched along its length, rolled about the midrib; half-width profile by `shape`; saw-toothed edge."""
    d = np.array(direction, float); d /= np.linalg.norm(d)
    side = np.cross((0, 0, 1), d); side = side / (np.linalg.norm(side) + 1e-9); up = np.cross(d, side)
    cr, sr = math.cos(roll), math.sin(roll); side, up = side * cr + up * sr, -side * sr + up * cr
    cd, sd = math.cos(droop), math.sin(droop); d, up = d * cd - up * sd, d * sd + up * cd
    N = 9; rib, left, right = [], [], []
    for i in range(N + 1):
      t = i / N
      if shape == 'birch': w = (t ** .45) * ((1 - t) ** 1.25) * 2.15   # widest low, long acuminate tip
      elif shape == 'broad': w = (math.sin(math.pi * t ** .8) ** .8) * 1.0
      else: w = (math.sin(math.pi * t ** .7) ** .9) * .95   # ovate
      tooth = 1 + serr * (((i * teeth / N) % 1) - .5) * 2 if 0 < i < N else 1
      hw = w * width * .5 * tooth
      z = -arch * length * (t - .45) ** 2 * 2
      p = np.array(base) + d * (t * length) + up * z
      rib.append(p + up * hw * fold); left.append(p + side * hw); right.append(p - side * hw)
    pts = rib + left + right
    if not all(self.inside(p) for p in pts): return False
    b = len(self.v); self.v += [tuple(p) for p in pts]
    light = tuple(min(1, x * 1.18) for x in col); dark = tuple(x * .86 for x in col)
    for i in range(N):
      r0, r1, l0, l1, q0, q1 = b + i, b + i + 1, b + N + 1 + i, b + N + 2 + i, b + 2 * N + 2 + i, b + 2 * N + 3 + i
      self.f.append((r0, l0, l1, r1)); self.c.append([light, dark, dark, light])
      self.f.append((r0, r1, q1, q0)); self.c.append([light, light, dark, dark])
    return True

def curve(rng, a, direction, length, n, bend, lift=0.):
  """Polyline from a along a gently bending direction (2D bend, small z lift)."""
  pts = [np.array(a, float)]; d = np.array(direction, float); d /= np.linalg.norm(d); step = length / n
  for i in range(n):
    ang = rng.uniform(-bend, bend); c, s = math.cos(ang), math.sin(ang)
    d = np.array((d[0] * c - d[1] * s, d[0] * s + d[1] * c, d[2] + lift / n)); d /= np.linalg.norm(d)
    pts.append(pts[-1] + d * step)
  return pts

def along(pts, t):
  seg = [np.linalg.norm(np.subtract(pts[i + 1], pts[i])) for i in range(len(pts) - 1)]; L = sum(seg); s = t * L
  for i, l in enumerate(seg):
    if s <= l or i == len(seg) - 1:
      f = min(1, s / (l + 1e-9)); p = np.add(pts[i], np.subtract(pts[i + 1], pts[i]) * f); d = np.subtract(pts[i + 1], pts[i]); return p, d / (np.linalg.norm(d) + 1e-9)
    s -= l

def rot2(d, ang):
  c, s = math.cos(ang), math.sin(ang); v = np.array((d[0] * c - d[1] * s, d[0] * s + d[1] * c, d[2])); return v / np.linalg.norm(v)

def leaf_colour(rng, kind):
  if kind == 'birch': h, s, v = rng.uniform(.215, .27), rng.uniform(.62, .78), rng.uniform(.36, .52)
  else: h, s, v = rng.uniform(.22, .29), rng.uniform(.58, .76), rng.uniform(.3, .47)
  if rng.random() < .14: h, v = rng.uniform(.17, .21), v * 1.2   # an older yellowing leaf
  if rng.random() < .12: v *= .72                                 # a shaded, darker leaf
  return hsv(h, s, v)

def branchlet(rng, sp, kind, twig, main_len, n_side, side_len, sub, leaf_len, spacing, leaf_w, shape, hang=0.):
  """A branch tip filling the card: main axis, alternating side twigs (longer low, shorter toward the tip), sub-twigs on the
  long ones, leaves alternating along every twig with a terminal cluster; `hang` curls the side twigs back and down."""
  S = sp.S; main = curve(rng, (rng.uniform(-.02, .02), 0, 0), (rng.uniform(-.1, .1), 1, 0), S * main_len, 8, .08)
  sp.tube(main, S * .006, S * .0015, twig); twigs = [main]; t = .08; side = rng.choice((-1, 1))
  for i in range(n_side):
    t = .08 + .8 * i / n_side + rng.uniform(-.02, .02); p, d = along(main, t)
    L = S * side_len * (1 - .55 * t) * rng.uniform(.8, 1.15); ang = side * rng.uniform(.6, 1.0) * (1 + hang * .6)
    tw = curve(rng, p, rot2(d, ang), L, 5, .14 + hang * .1, lift=rng.uniform(-.04, .05))
    if hang:   # curl the tip back toward the main axis, as a weeping shoot does
      for k in range(2, len(tw)): tw[k] = tw[k] + np.array((-side * hang * S * .02 * (k - 1) ** 1.5, -hang * S * .015 * (k - 1) ** 1.5, 0))
    sp.tube(tw, S * .0032, S * .001, twig, 5); twigs.append(tw)
    if L > S * .22:
      for s in (.35, .65)[:sub]:
        p2, d2 = along(tw, s); L2 = L * rng.uniform(.35, .5); tw2 = curve(rng, p2, rot2(d2, rng.choice((-1, 1)) * rng.uniform(.5, .9)), L2, 3, .15)
        sp.tube(tw2, S * .002, S * .0008, twig, 4); twigs.append(tw2)
    side = -side
  count = 0
  for tw in twigs:
    L = sum(np.linalg.norm(np.subtract(tw[i + 1], tw[i])) for i in range(len(tw) - 1)); s = rng.uniform(.05, .15); ls = rng.choice((-1, 1))
    while s < 1:
      p, d = along(tw, s); size = S * leaf_len * rng.uniform(.8, 1.2) * (1.08 - .25 * s)
      pet = size * rng.uniform(.12, .25); dirn = rot2(d, ls * rng.uniform(.4, 1.15)); dirn[2] = rng.uniform(-.3, .35)
      q = p + dirn / np.linalg.norm(dirn) * pet; sp.tube([p, q], S * .0012, S * .0008, twig, 3)
      count += sp.leaf(q, dirn, size, size * leaf_w * rng.uniform(.9, 1.1), leaf_colour(rng, kind), shape, fold=rng.uniform(.15, .5), arch=rng.uniform(.04, .18),
        roll=rng.uniform(-.8, .8), droop=rng.uniform(-.25, .4), serr=.09 if kind == 'birch' else .05, teeth=14 if kind == 'birch' else 9)
      s += S * spacing * rng.uniform(.75, 1.25) / max(L, 1e-3); ls = -ls
    p, d = along(tw, 1.)
    for k in range(rng.randint(1, 3)):
      size = S * leaf_len * rng.uniform(.8, 1.05); count += sp.leaf(p, rot2(d, rng.uniform(-.6, .6)) + np.array((0, 0, rng.uniform(-.2, .2))), size, size * leaf_w, leaf_colour(rng, kind), shape, roll=rng.uniform(-.6, .6))
  return count

def broadleaf_spray(rng, dense):
  sp = Spray(rng, 1.6 if dense else 1.8); twig = srgb_to_lin((92, 76, 60))
  n = branchlet(rng, sp, 'broad', twig, .88, 12 if dense else 10, .5 if dense else .56, 2, .064 if dense else .06, .03 if dense else .036, .6, 'broad' if dense else 'ovate')
  log('leaves', n); return sp

def frond(rng):
  """Spruce frond for conifer cards: a brown axis with the pine-sprig photo repeated along it as side sprigs (alternating,
  45-70 deg, shorter toward the tip) plus a terminal sprig, all tilted a little, so one card is a whole needled branch."""
  S = 2.0; sp = Spray(rng, S); twig = srgb_to_lin((84, 62, 44)); main = curve(rng, (0, 0, 0), (rng.uniform(-.05, .05), 1, 0), S * .9, 8, .06)
  sp.tube(main, S * .007, S * .002, twig); quads = []
  t = .03
  while t < .9:   # sprigs on both sides at irregular spacing, angles, lengths and rolls, plus strays across the axis: no herringbone
    p, d = along(main, t)
    for side in (-1, 1):
      if rng.random() < .15: continue
      L = S * (.3 - .17 * t) * rng.uniform(.7, 1.25); dirn = rot2(d, side * rng.uniform(.55, 1.35)); dirn[2] = rng.uniform(-.25, .25)
      quads.append((p + np.array((rng.uniform(-.02, .02), 0, 0)), dirn, L, rng.uniform(-.8, .8)))
    if rng.random() < .35: quads.append((p, rot2(d, rng.uniform(-.35, .35)), S * rng.uniform(.12, .2), rng.uniform(-1, 1)))
    t += rng.uniform(.04, .075)
  p, d = along(main, 1.); quads.append((p - d * S * .06, d, S * .22, 0))
  return sp, quads

def tufts(rng):
  """Scots pine branch end for the pine pads: a forking brown shoot system with its needles only in tufts at the shoot tips (the
  pine-sprig photo, 30-45 cm, pointing along each shoot, a smaller one of last year's needles behind some), so a card is a few
  separate brushes with bare twig and sky between them instead of one solid frond: a pad of them reads as ragged needle tufts,
  not a cotton ball, and keeps its holes down the mip chain."""
  S = 2.0; sp = Spray(rng, S); twig = srgb_to_lin((88, 62, 42)); quads = []
  main = curve(rng, (0, 0, 0), (rng.uniform(-.08, .08), 1, 0), S * .6, 6, .08)
  sp.tube(main, S * .008, S * .003, twig); shoots = [main]; t = .22; side = rng.choice((-1, 1))
  while t < .9:
    p, d = along(main, t); L = S * rng.uniform(.2, .3) * (1.1 - .4 * t)
    sh = curve(rng, p, rot2(d, side * rng.uniform(.55, .95)), L, 4, .12, lift=rng.uniform(-.05, .05)); sp.tube(sh, S * .005, S * .0025, twig, 5); shoots.append(sh)
    if L > S * .22 and rng.random() < .6:   # the long shoots fork once
      p2, d2 = along(sh, rng.uniform(.45, .65)); sh2 = curve(rng, p2, rot2(d2, -side * rng.uniform(.4, .8)), L * rng.uniform(.5, .7), 3, .12)
      sp.tube(sh2, S * .0035, S * .002, twig, 4); shoots.append(sh2)
    t += rng.uniform(.14, .22); side = -side
  for sh in shoots:
    p, d = along(sh, 1.); L = S * rng.uniform(.16, .23) * (1.2 if sh is main else 1.)
    quads.append((p - d * L * .4, rot2(d, rng.uniform(-.15, .15)), L, rng.uniform(-.8, .8)))
    if rng.random() < .6:
      p2, d2 = along(sh, rng.uniform(.55, .75)); quads.append((p2 - d2 * S * .03, rot2(d2, rng.choice((-1, 1)) * rng.uniform(.3, .7)), L * .7, rng.uniform(-.8, .8)))
  for k in range(rng.randint(3, 4)):   # needles along the upper main axis too: the branch end has a dense heart and ragged tips
    p, d = along(main, rng.uniform(.35, .85)); quads.append((p, rot2(d, rng.choice((-1, 1)) * rng.uniform(.35, .8)), S * rng.uniform(.14, .2), rng.uniform(-.8, .8)))
  return sp, quads

def sprig_object(quads, S):
  """Textured quads for the frond sprigs (square photo, stem at the bottom centre)."""
  v, f, uv = [], [], []
  for p, d, L, roll in quads:
    d = np.array(d, float); d /= np.linalg.norm(d); side = np.cross((0, 0, 1), d); side /= np.linalg.norm(side)
    up = np.cross(d, side); c, s = math.cos(roll), math.sin(roll); side = side * c + up * s
    b = len(v); v += [tuple(p - side * L / 2), tuple(p + side * L / 2), tuple(p + side * L / 2 + d * L), tuple(p - side * L / 2 + d * L)]
    f.append((b, b + 1, b + 2, b + 3)); uv.append([(0, 0), (1, 0), (1, 1), (0, 1)])
  me = bpy.data.meshes.new('sprigs'); me.from_pydata(v, [], f); me.update(); lay = me.uv_layers.new(name='UVMap')
  for poly, c in zip(me.polygons, uv):
    for li, x in zip(poly.loop_indices, c): lay.data[li].uv = x
  o = bpy.data.objects.new('sprigs', me); bpy.context.collection.objects.link(o); return o

def birch_spray(rng):
  """A weeping birch branch tip: many thin side twigs that splay and curl back, set with small double-serrate leaves."""
  sp = Spray(rng, 1.6); twig = srgb_to_lin((74, 48, 40))
  n = branchlet(rng, sp, 'birch', twig, .9, 13, .46, 2, .042, .024, .72, 'birch', hang=.35); log('leaves', n); return sp

def build_object(sp, name):
  me = bpy.data.meshes.new(name); me.from_pydata(sp.v, [], sp.f); me.update()
  ca = me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='CORNER')
  for poly, cols in zip(me.polygons, sp.c):
    for li, c in zip(poly.loop_indices, cols): ca.data[li].color = (*c, 1)
  o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); return o

def material(mode, image=None):
  """Emission-only render materials: 'albedo' (corner colour, or the image's colour), 'normal' (camera-frame normal, raw), 'ao'
  (Cycles AO, or white for image quads, whose transparent texels the AO rays would count as solid). With an image, its alpha
  mixes in a transparent BSDF, so textured quads cut out."""
  m = bpy.data.materials.new(mode + ('_tex' if image else ''))
  try: m.use_nodes = True
  except Exception: pass
  nt = m.node_tree; nt.nodes.clear(); out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
  if image:
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = image; tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(tx.outputs['Alpha'], mx.inputs['Fac']); nt.links.new(tr.outputs['BSDF'], mx.inputs[1]); nt.links.new(em.outputs['Emission'], mx.inputs[2]); nt.links.new(mx.outputs['Shader'], out.inputs['Surface'])
    if mode == 'albedo': nt.links.new(tx.outputs['Color'], em.inputs['Color']); return m
    if mode == 'ao': em.inputs['Color'].default_value = (1, 1, 1, 1); return m
  else: nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
  if mode == 'albedo':   # corner colour times a fine mottle (about +-10%), so a blade is not one flat swatch
    a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_name = 'Col'
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 90; nz.inputs['Detail'].default_value = 4
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = .86; mr.inputs['To Max'].default_value = 1.12
    mix = nt.nodes.new('ShaderNodeVectorMath'); mix.operation = 'MULTIPLY'
    nt.links.new(nz.outputs['Fac'], mr.inputs['Value']); nt.links.new(a.outputs['Color'], mix.inputs[0]); nt.links.new(mr.outputs['Result'], mix.inputs[1])
    nt.links.new(mix.outputs['Vector'], em.inputs['Color'])
  elif mode == 'normal':   # camera looks down -Z, so world XYZ is the image's right/up/toward-camera frame
    g = nt.nodes.new('ShaderNodeNewGeometry'); vm = nt.nodes.new('ShaderNodeVectorMath'); vm.operation = 'MULTIPLY_ADD'
    vm.inputs[1].default_value = (.5, .5, .5); vm.inputs[2].default_value = (.5, .5, .5)
    nt.links.new(g.outputs['Normal'], vm.inputs[0]); nt.links.new(vm.outputs['Vector'], em.inputs['Color'])
  else:
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.samples = 32; ao.inputs['Distance'].default_value = .05
    nt.links.new(ao.outputs['AO'], em.inputs['Color'])
  return m

def setup():
  bpy.ops.wm.read_factory_settings(use_empty=True)
  sc = bpy.context.scene; sc.render.engine = 'CYCLES'
  prefs = bpy.context.preferences.addons['cycles'].preferences
  try:
    prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
    for d in prefs.devices: d.use = d.type == 'OPTIX'
    sc.cycles.device = 'GPU'
  except Exception as e: log('cpu render', e)
  sc.cycles.samples = 24; sc.cycles.use_denoising = False; sc.cycles.max_bounces = 0
  sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = CELL * SS; sc.render.resolution_percentage = 100
  sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '16'
  sc.render.filter_size = 1.0
  w = bpy.data.worlds.new('w'); sc.world = w
  cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'; cam = bpy.data.objects.new('cam', cam_data); bpy.context.collection.objects.link(cam); sc.camera = cam
  return sc, cam

def render(sc, cam, objs, S, tag):
  """objs: [(object, material suffix)]; '' for corner-coloured geometry, '_tex' for image quads."""
  cam.data.ortho_scale = S; cam.location = (0, S / 2, 5); cam.rotation_euler = (0, 0, 0); cam.data.clip_end = 20
  res = {}
  for mode in ('albedo', 'normal', 'ao'):
    for obj, suffix in objs: obj.data.materials.clear(); obj.data.materials.append(bpy.data.materials[mode + suffix])
    sc.view_settings.view_transform = 'Standard' if mode == 'albedo' else 'Raw'
    sc.cycles.samples = 64 if mode == 'ao' else 16
    path = TMP / f'{tag}_{mode}.png'; sc.render.filepath = str(path); bpy.ops.render.render(write_still=True)
    res[mode] = read(path)
  return res

def read(path):   # straight alpha as stored: OIIO would premultiply on read otherwise
  cfg = oiio.ImageSpec(); cfg.attribute('oiio:UnassociatedAlpha', 1)
  img = oiio.ImageInput.open(str(path), cfg); a = img.read_image('float'); img.close(); return a

def down(a):   # box filter by SS
  h, w, c = a.shape; return a.reshape(h // SS, SS, w // SS, SS, c).mean(axis=(1, 3))

def bleed(rgb, alpha, iters=24):
  """Grow colour outward from covered texels so bilinear taps and mips outside the leaf edge sample leaf colour, not black."""
  rgb = rgb.copy(); filled = alpha > .02
  for _ in range(iters):
    acc = np.zeros_like(rgb); cnt = np.zeros(alpha.shape)
    for dy in (-1, 0, 1):
      for dx in (-1, 0, 1):
        if dx == dy == 0: continue
        m = np.roll(np.roll(filled, dy, 0), dx, 1); acc += np.roll(np.roll(rgb, dy, 0), dx, 1) * m[..., None]; cnt += m
    grow = (~filled) & (cnt > 0); rgb[grow] = acc[grow] / cnt[grow][:, None]; filled = filled | grow
    if filled.all(): break
  rgb[~filled] = rgb[filled].mean(axis=0); return rgb

def compose(res):
  a = res['albedo'][..., 3:4]
  lin = lambda x: np.where(x <= .04045, x / 12.92, ((x + .055) / 1.055) ** 2.4)
  srgb = lambda x: np.where(x <= .0031308, x * 12.92, 1.055 * np.power(np.clip(x, 0, 1), 1 / 2.4) - .055)
  alb = lin(res['albedo'][..., :3]); ao = res['ao'][..., :1]
  alb = alb * (.3 + .7 * np.clip(ao, 0, 1) ** 1.3)   # a leaf beneath others in the spray is darker
  n = res['normal'][..., :3] * 2 - 1; n = n * np.where(n[..., 2:3] < 0, -1, 1)   # both faces of a blade: keep the camera-facing one
  # premultiplied box filter, then un-premultiply
  A = down(a); alb_d = down(alb * a) / np.maximum(A, 1e-5); n_d = down(n * a) / np.maximum(A, 1e-5)
  n_d = n_d / np.maximum(np.linalg.norm(n_d, axis=2, keepdims=True), 1e-5)
  A = A[..., 0]
  alb_d = bleed(alb_d, A); n_d = bleed(n_d, A); n_d[A < .02] = (0, 0, 1)
  return np.concatenate([srgb(alb_d), A[..., None]], 2), np.concatenate([n_d * .5 + .5, np.ones_like(A)[..., None]], 2)

def write(path, arr):
  h, w, c = arr.shape; spec = oiio.ImageSpec(w, h, c, 'uint8'); spec.attribute('oiio:UnassociatedAlpha', 1)
  if str(path).endswith('.webp'): spec.attribute('compression', 'webp:92')
  o = oiio.ImageOutput.create(str(path)); assert o, oiio.geterror(); assert o.open(str(path), spec), o.geterror()
  o.write_image(np.ascontiguousarray(np.clip(arr, 0, 1).astype(np.float32))); o.close()


def birch_bark(rng):
  """White birch bark, 512 x 1024 (u around the trunk, v up it; 1 texel ~ 1.5 cm on a 0.25 m trunk): chalky white with grey
  mottling, thin horizontal dark lenticels, and black chevron scars where branches fell. Seamless in u and v."""
  W, H = 512, 1024; y, x = np.mgrid[0:H, 0:W]
  def noise(freq, seed):
    r = np.random.default_rng(seed); g = r.random((freq[1] + 1, freq[0] + 1)); g[-1, :] = g[0, :]; g[:, -1] = g[:, 0]
    fx = x / W * freq[0]; fy = y / H * freq[1]; ix = fx.astype(int); iy = fy.astype(int); tx = fx - ix; ty = fy - iy
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty)
    return (g[iy, ix] * (1 - tx) + g[iy, ix + 1] * tx) * (1 - ty) + (g[iy + 1, ix] * (1 - tx) + g[iy + 1, ix + 1] * tx) * ty
  mott = noise((6, 12), 1) * .5 + noise((16, 32), 2) * .3 + noise((48, 96), 3) * .2
  base = np.stack([np.full((H, W), .95), np.full((H, W), .93), np.full((H, W), .89)], 2) * (.8 + .26 * mott[..., None])
  base[..., 2] -= .06 * noise((8, 16), 4); base[..., 1] -= .02 * noise((8, 16), 4)   # faint warm patches where the outer layer peeled
  band = noise((3, 40), 5); base *= (.93 + .09 * band[..., None])   # horizontal peel bands
  img = base.copy(); rough = noise((40, 80), 6)
  for _ in range(520):   # lenticels: short dark horizontal dashes, some in rows
    cx, cy = rng.uniform(0, W), rng.uniform(0, H); L = rng.uniform(5, 34); th = rng.uniform(1, 2.8); dark = rng.uniform(.18, .6)
    m = (np.abs(((x - cx + W / 2) % W) - W / 2) < L / 2) & (np.abs(((y - cy + H / 2) % H) - H / 2) < th / 2 * (.6 + rough))
    img[m] *= dark
  for _ in range(14):   # black scars: ragged horizontal blotches where branches fell or the bark cracked
    cx, cy = rng.uniform(0, W), rng.uniform(0, H); sx, sy = rng.uniform(14, 60), rng.uniform(4, 16)
    dx = (((x - cx + W / 2) % W) - W / 2) / sx; dy = (((y - cy + H / 2) % H) - H / 2) / sy
    scar = dx * dx + dy * dy + (rough - .5) * 1.4 < 1
    img[scar] = img[scar] * .1 + .03
  # w3 verdicts: at 20-40 m (a pixel is ~15 cm of trunk at 640 px) every mark above is sub-pixel and the birches read as plain
  # white poles. A mature birch carries big black bands and diamonds, 15-35 cm tall and a third of the way round: those stay
  # a pixel or two, so a trunk reads black-barred white at any range
  for _ in range(9):
    cx, cy = rng.uniform(0, W), rng.uniform(0, H); sx, sy = rng.uniform(60, 170), rng.uniform(18, 38)
    dx = (((x - cx + W / 2) % W) - W / 2) / sx; dy = (((y - cy + H / 2) % H) - H / 2) / sy
    scar = np.abs(dx) ** 1.4 + dy * dy + (rough - .5) * 1.1 < 1
    img[scar] = img[scar] * .08 + .03
  grain = noise((128, 256), 7); img *= (.93 + .1 * grain[..., None])
  return np.concatenate([np.clip(img, 0, 1), np.ones((H, W, 1))], 2)

if __name__ == '__main__':
  sc, cam = setup(); rng = random.Random(11); sc.cycles.transparent_max_bounces = 64
  sprig = bpy.data.images.load(str(OUT / 'leaf_pine.webp'))   # the keyed pine-sprig photo of the previous rounds
  for mode in ('albedo', 'normal', 'ao'): material(mode); material(mode, sprig)
  cells = []
  for i, (make, tag) in enumerate(((lambda: broadleaf_spray(rng, False), 'broad_open'), (lambda: broadleaf_spray(rng, True), 'broad_dense'), (lambda: birch_spray(rng), 'birch'))):
    sp = make(); o = build_object(sp, tag); log('SPRAY', tag, 'faces', len(sp.f))
    cells.append(compose(render(sc, cam, [(o, '')], sp.S, tag))); bpy.data.objects.remove(o)
  for make, tag in ((frond, 'frond'), (tufts, 'tufts')):
    sp, quads = make(rng); o = build_object(sp, tag); q = sprig_object(quads, sp.S)
    cells.append(compose(render(sc, cam, [(o, ''), (q, '_tex')], sp.S, tag))); bpy.data.objects.remove(o); bpy.data.objects.remove(q)
  atlas = np.zeros((CELL * 2, CELL * 3, 4)); atlas[..., :3] = cells[3][0][..., :3].mean(axis=(0, 1)); atlas_n = np.ones((CELL * 2, CELL * 3, 4)) * (.5, .5, 1, 1)   # the spare cell: leaf colour under zero alpha, a flat normal
  for i, (alb, nrm) in enumerate(cells):   # cell i at (col i % 3, row i // 3) counted from the bottom, as Blender UVs count
    c, r = i % 3, i // 3; y0 = (1 - r) * CELL   # image rows run top-down
    atlas[y0:y0 + CELL, c * CELL:(c + 1) * CELL] = alb; atlas_n[y0:y0 + CELL, c * CELL:(c + 1) * CELL] = nrm
  write(OUT / 'leaves.webp', atlas); write(OUT / 'leaves_n.webp', atlas_n[..., :3])
  write(TMP / 'leaves_preview.png', np.concatenate([atlas[..., :3] * atlas[..., 3:] + np.array((1, 0, 1)) * (1 - atlas[..., 3:]), np.ones(atlas[..., :1].shape)], 2))
  write(OUT / 'bark_birch.webp', birch_bark(random.Random(5)))
  log('FOLIAGE_DONE')
