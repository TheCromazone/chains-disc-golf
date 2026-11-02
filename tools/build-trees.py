"""Course trees for Chains (Blender 5.2): birches, broadleaves, spruces, Scots pines and bushes, built the way shipped games
build them. A tapering trunk with a root flare and a few dead stubs; birch and broadleaf crowns gather their leaf-spray cards
into lobes (big leafy masses with gaps between; a third of the outermost clumps dropped, so the outline is ragged), each lobe fed
by its own limb from the leader plus short branches inside it; spruces are whorls of branches clothed in short needle sprays;
Scots pines carry needle pads (flattened clouds of small needle-tuft sprays) on spreading branches, on stems that differ in
girth, taper, lean and bow. Mature proportions: birches ~17-19 m with the crown in the top 64%, broadleaves ~14-15 m, spruces
~18-20 m, pines ~19-21 m bare to ~40%.
Leaves get the triangles: limbs are 4 segments, no twig under 1.3 m (the card's own drawn twig covers it); each variant draws
< 2.6k tris, and each conifer also carries a 0.45-1k shadow proxy (its crown as the large cards it was built from: ghost()).
Run: blender -b -P tools/build-trees.py [-- --preview art/qa/trees-preview] [--models-only] (needs tools/build-foliage.py's atlas first),
then python3 tools/dilate-foliage.py impostors. --models-only writes the GLBs alone (for iterating on the 3D trees in the game).

Lighting data baked per vertex, read by src/course.js:
- normals: every leaf vertex points away from its lobe (or pad) centre, blended with its own clump and the crown axis (and a
  little up), so each mass has a lit side and a shaded side and the crown still reads as one volume; wood keeps tube normals.
- colour: sky visibility from 40 rays per vertex through the tree's own leaves and wood. A ray that hits a card samples the atlas
  alpha at the hit and passes through transparent texels, so a clump behind a sparse spray is only partly occluded. Interior
  leaves fall to ~0.2, the sunlit rim stays ~1; clumps carry a slight hue and brightness jitter; birch trunks darken at the base,
  pine stems go fox-orange up in the crown.
Writes assets/models/deciduous.glb (birch0, birch1, broad0, broad1), pine.glb (spruce0, spruce1, scots0-2, each with its
'-shadow' proxy), bush.glb (bush0, bush1): one mesh per variant with two materials, 'bark' or 'bark_birch' (tubes, UV u around, v along in bark tiles) and
'leaves' (cards mapped to the atlas cells of assets/textures/foliage/leaves.webp); the impostor atlas (see impostors()); and
src/impostors.js with the card extents and each species' collider (trunk radius and height, crown centre and radius), measured
off the built models so the physics records match what is drawn.
"""
from pathlib import Path
import sys, math, random, json
import bpy
import numpy as np
import OpenImageIO as oiio
from mathutils import Vector, Quaternion, geometry
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]; OUT = ROOT / 'assets/models'; TEX = ROOT / 'assets/textures/foliage'
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = Path(argv[argv.index('--preview') + 1]) if '--preview' in argv else None
if PREVIEW and not PREVIEW.is_absolute(): PREVIEW = ROOT / PREVIEW
MODELS_ONLY = '--models-only' in argv
REPORT, DIMS, SHADOWS = {}, {}, {}
def log(*a): print('CHAINS', *a, flush=True)
Z = Vector((0, 0, 1)); TAU = math.tau

CELL = {'broad': 0, 'dense': 1, 'birch': 2, 'pine': 3, 'tuft': 4}   # atlas cells, Blender UV space (v up): column i % 3, row i // 3
BARK_V = 11.4   # metres per bark-v unit: the runtime shares assets/textures/bark.jpg at repeat 1 x 3, so one tile spans 3.8 m, square texels on a 0.3 m trunk
def read_rgba(path):
  cfg = oiio.ImageSpec(); cfg.attribute('oiio:UnassociatedAlpha', 1)
  img = oiio.ImageInput.open(str(path), cfg); a = img.read_image('float'); img.close(); return a
ALPHA = read_rgba(TEX / 'leaves.webp')[::-1, :, 3].copy()   # rows flipped so [v, u] follows Blender UVs
AH, AW = ALPHA.shape
def alpha_at(u, v): return ALPHA[min(AH - 1, max(0, int(v * AH))), min(AW - 1, max(0, int(u * AW)))]

def unit(rng):
  while True:
    v = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)))
    if .05 < v.length <= 1: return v.normalized()

def grow(rng, start, d, length, segs, rise=0., droop=0., jitter=.08, flatten=0.):
  """Polyline from start: each step bends up by `rise` early and down by `droop` late (gravitropism, weeping tips),
  `flatten` pulls it toward horizontal (a spreading limb), plus a little random wander."""
  pts = [Vector(start)]; d = Vector(d).normalized()
  for i in range(segs):
    f = i / max(1, segs - 1)
    d = d + Z * (rise * (1 - f) - droop * f) + unit(rng) * jitter
    if flatten: d.z *= 1 - flatten * f
    d.normalize(); pts.append(pts[-1] + d * length / segs)
  return pts

def fit(p, up, size, lim, keep=1.):
  """The largest size (up to `size`) a card reaching `keep` of its size from p along `up` can take before its far end passes
  `lim` metres from the stem (the z axis): a spruce branch's sprays stay round it instead of floating clear of the crown."""
  u = up.normalized(); bd = p.x * u.x + p.y * u.y; dd = u.x * u.x + u.y * u.y; c = p.x * p.x + p.y * p.y - lim * lim
  return size if dd < 1e-6 else min(size, max(0., -bd + math.sqrt(max(0., bd * bd - dd * c))) / dd / keep)

def shade(h, l):
  """A foliage tint: h -1 a cool, greyer blue-green, +1 a warm olive-yellow; l its value. Lobe to lobe and clump to clump (g20 trees
  2/4: "uniformly saturated yellow-green clumps of the same sprite"): the old +-5% hue and +-13% value read as one tint at frame size."""
  return (l * (1 + .2 * h), l * (1 + .03 * h), l * (1 - .42 * h))

def along(pts, s):
  L = [(pts[i + 1] - pts[i]).length for i in range(len(pts) - 1)]; x = s * sum(L)
  for i, l in enumerate(L):
    if x <= l or i == len(L) - 1:
      f = min(1, x / (l + 1e-9)); return pts[i].lerp(pts[i + 1], f), (pts[i + 1] - pts[i]).normalized()
    x -= l

class Tree:
  def __init__(self, rng, name, bark='bark', vscale=2.5):
    self.rng, self.name, self.bark, self.vscale = rng, name, bark, vscale
    self.fine = random.Random(name)   # the conifers' spray-by-spray jitter: drawn apart from `rng`, so the layout stream (and every tree built after this one) stays put
    self.tone, self.tones = random.Random(name + '/tone'), {}   # each lobe's (or pad's, or branch's) own tint, drawn apart from `rng` too
    self.v, self.n, self.tint, self.clump, self.lobe, self.kind = [], [], [], [], [], []   # per vertex: position, normal, tint, clump centre, lobe centre, 0 wood / 1 leaf
    self.faces, self.fuv, self.fmat = [], [], []
    self.axis = lambda z: Vector((0, 0, z))   # crown axis for leaf normals
    self.base_dark = None                      # z -> darkening of the wood (birch base)
    self.cur_lobe = None                       # the lobe the next cards belong to (their mass's centre, for normals)
    self.trunk_h, self.r_base = 0., 0.         # top of the wood the disc can hit and trunk radius, for the physics record
    self.wood, self.tag = {}, 'trunk'
    self.tag_tint = {}                         # wood tint by part (a birch's white trunk and limbs, its dark twigs)
    self.lobe_mix = (.6, .35)                  # leaf normal weights: away from the lobe (or pad) centre, away from the crown axis
    self.gv, self.gf, self.guv = [], [], []    # the shadow proxy's cards (ghost())
  def tube(self, pts, r0, r1, sides, taper=1.):
    """Tapered tube along pts with parallel-transported rings (no twist); radius r0 -> r1 with `taper` exponent."""
    pts = [Vector(p) for p in pts]; n = len(pts)
    self.wood[self.tag] = self.wood.get(self.tag, 0) + 2 * sides * (n - 1)   # triangle budget by part, logged per tree
    tan = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
    ref = tan[0].cross(Z if abs(tan[0].z) < .95 else Vector((1, 0, 0))).normalized(); rings = []; acc = 0.
    for i in range(n):
      if i: ref = (tan[i - 1].rotation_difference(tan[i]) @ ref).normalized(); acc += (pts[i] - pts[i - 1]).length
      b = tan[i].cross(ref); r = r0 + (r1 - r0) * (i / (n - 1)) ** taper; ring = []
      for k in range(sides + 1):
        a = k / sides * TAU; radial = ref * math.cos(a) + b * math.sin(a)
        ring.append(len(self.v)); self.v.append(pts[i] + radial * r); self.n.append(radial); self.tint.append(self.tag_tint.get(self.tag, (1, 1, 1))); self.clump.append(None); self.lobe.append(None); self.kind.append(0)
      rings.append((ring, acc / self.vscale))
    for i in range(n - 1):
      (ra, va), (rb, vb) = rings[i], rings[i + 1]
      for k in range(sides):
        self.faces.append((ra[k], ra[k + 1], rb[k + 1], rb[k])); self.fmat.append(0)
        self.fuv.append([(k / sides, va), ((k + 1) / sides, va), ((k + 1) / sides, vb), (k / sides, vb)])
  def quad(self, base, up, facing, size, cell):
    """A card's corners and atlas uvs: bottom edge centred on `base`, growing along `up`, facing `facing`."""
    up = up.normalized(); f = facing - up * facing.dot(up)
    if f.length < 1e-4: f = unit(self.fine).cross(up)
    f.normalize(); side = up.cross(f) * size * .5; top = up * size
    u0, v0, du = (cell % 3) / 3, (cell // 3) * .5, 1 / 3; e = .002
    return (base - side, base + side, base + side + top, base - side + top), f, [(u0 + e, v0 + e), (u0 + du - e, v0 + e), (u0 + du - e, v0 + .5 - e), (u0 + e, v0 + .5 - e)]
  def card(self, base, up, facing, size, cell, centre, tint=(1, 1, 1)):
    """One spray card (quad() above)."""
    ps, f, uv = self.quad(base, up, facing, size, cell); i0 = len(self.v)
    for p in ps:
      self.v.append(p); self.n.append(f); self.tint.append(tint); self.clump.append(centre); self.lobe.append(self.cur_lobe); self.kind.append(1)
    self.faces.append((i0, i0 + 1, i0 + 2, i0 + 3)); self.fmat.append(1); self.fuv.append(uv)
  def ghost(self, base, up, facing, size, cell):
    """A shadow-proxy card (the variant's '-shadow' mesh, drawn only into the shadow maps): a conifer casts the few large cards
    its crown was built from before the sprays (gauntlet r4), so its shadow, what it costs and its physics record stay as they were."""
    ps, f, uv = self.quad(base, up, facing, size, cell); i0 = len(self.gv); self.gv += ps; self.gf.append((i0, i0 + 1, i0 + 2, i0 + 3)); self.guv.append(uv)
  def clump_at(self, tip, d, count, size, cell, hang=0., spread=.55, out_bias=.6, out=None):
    """A clump: `count` cards fanning from the twig tip along its direction (or hanging), each turned to face out of the crown
    (or out of its lobe, when `out` is given)."""
    rng = self.rng
    if out is None:
      axis = self.axis(tip.z); out = tip - axis; out.z = 0
      out = out.normalized() if out.length > 1e-3 else unit(rng)
    centre = tip + (d.normalized() * (1 - hang) - Z * hang).normalized() * size * .45
    hue = rng.uniform(-1, 1); lit = rng.uniform(.86, 1.12)   # drawn as before, so the layout stream stays put
    if self.cur_lobe is not None:   # a lobe is one tone (a mass in shade-grown blue-green, a sunlit one olive), its clumps jitter round it
      key = tuple(round(x, 3) for x in self.cur_lobe)
      if key not in self.tones: self.tones[key] = (self.tone.uniform(-1, 1), self.tone.uniform(.66, 1.12))
      lh, ll = self.tones[key]; hue = .75 * lh + .25 * hue; lit = ll * (.9 + .2 * (lit - .86) / .26)
    else: lit = .78 + .4 * (lit - .86) / .26
    tint = shade(hue, lit)
    for k in range(count):
      up = (d.normalized() * (1 - hang) - Z * hang + unit(rng) * spread).normalized()
      facing = (out * out_bias + unit(rng) * (1 - out_bias) + Z * .25)
      self.card(tip + unit(rng) * size * .08, up, facing, size * rng.uniform(.85, 1.12), cell, centre, tint)
    return centre

def finish(t, mats):
  """Crown normals, sky-visibility bake, mesh + custom normals + colour + UVs."""
  rng = t.rng; verts = t.v
  for i in range(len(verts)):   # leaf normals: away from the clump centre, blended with away from the crown axis, a little up
    if t.kind[i] != 1: continue
    p = verts[i]; c = t.clump[i]; a = p - t.axis(p.z); a.z *= .5
    own = (p - c).normalized() if (p - c).length > 1e-4 else Z; ax = a.normalized() if a.length > 1e-4 else Z
    lb = t.lobe[i]
    if lb is None: t.n[i] = (own * .55 + ax * .5 + Z * .3).normalized()
    else:   # a lobed crown: each mass of clumps rounds off as one volume, lit on its sun side and dark in its lee
      lo_ = (p - lb).normalized() if (p - lb).length > 1e-4 else own; wl, wa = t.lobe_mix
      t.n[i] = (own * .25 + lo_ * wl + ax * wa + Z * .25).normalized()
  # BVH over triangles; each triangle remembers its quad's uv and whether it is a card
  tris, tri_uv, tri_card = [], [], []
  for f, uv, m in zip(t.faces, t.fuv, t.fmat):
    for a, b, c in ((0, 1, 2), (0, 2, 3)):
      tris.append((f[a], f[b], f[c])); tri_uv.append((uv[a], uv[b], uv[c])); tri_card.append(m == 1)
  bvh = BVHTree.FromPolygons(verts, tris, all_triangles=True)
  dirs = []
  g = math.pi * (3 - math.sqrt(5))
  for k in range(40):   # cosine-weighted Fibonacci hemisphere around +Z
    zc = math.sqrt(1 - (k + .5) / 40); r = math.sqrt(1 - zc * zc); dirs.append(Vector((math.cos(k * g) * r, math.sin(k * g) * r, zc)))
  def visible(p, d):
    o = p + d * .02
    for hop in range(5):
      loc, nrm, idx, dist = bvh.ray_cast(o, d, 12.)
      if loc is None: return 1.
      if not tri_card[idx]: return 0.
      A, B, C = (verts[j] for j in tris[idx]); ua, ub, uc = (Vector((*x, 0)) for x in tri_uv[idx])
      uv = geometry.barycentric_transform(loc, A, B, C, ua, ub, uc)
      if alpha_at(uv.x, uv.y) > .45: return 0.
      o = loc + d * .01
    return 1.
  col = []
  for i, p in enumerate(verts):
    n = t.n[i]; q = Z.rotation_difference(n)
    vis = sum(visible(p, q @ d) for d in dirs) / len(dirs)
    if t.kind[i] == 1: c = .2 + .8 * vis ** 1.25
    else: c = .3 + .7 * vis
    tr, tg, tb = t.tint[i]; k = t.base_dark(p.z) if (t.kind[i] == 0 and t.base_dark) else 1.
    kr, kg, kb = k if isinstance(k, tuple) else (k, k, k)
    col.append((tr * kr, tg * kg, tb * kb, c))   # rgb tints the albedo; alpha is the sky visibility, which the runtime puts on ambient light only
  me = bpy.data.meshes.new(t.name); me.from_pydata([tuple(v) for v in verts], [], t.faces); me.update()
  for mat in mats: me.materials.append(mat)
  for p, m in zip(me.polygons, t.fmat): p.material_index = m; p.use_smooth = True
  uvl = me.uv_layers.new(name='UVMap')
  for p, uv in zip(me.polygons, t.fuv):
    for li, x in zip(p.loop_indices, uv): uvl.data[li].uv = x
  ca = me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
  for i, c in enumerate(col): ca.data[i].color = c
  me.color_attributes.active_color = ca; me.color_attributes.render_color_index = 0
  me.normals_split_custom_set_from_vertices([tuple(n) for n in t.n])
  o = bpy.data.objects.new(t.name, me); bpy.context.collection.objects.link(o)
  if t.gf:   # the shadow proxy: leaf cards only, no light data (the depth pass reads positions and the atlas alpha)
    gm = bpy.data.meshes.new(t.name + '-shadow'); gm.from_pydata([tuple(v) for v in t.gv], [], t.gf); gm.update(); gm.materials.append(mats[1]); gl = gm.uv_layers.new(name='UVMap')
    for p, uv in zip(gm.polygons, t.guv):
      for li, x in zip(p.loop_indices, uv): gl.data[li].uv = x
    SHADOWS[t.name] = go = bpy.data.objects.new(t.name + '-shadow', gm); bpy.context.collection.objects.link(go); log('SHADOW', t.name, 'cards', len(t.gf))
  leaves = sum(1 for m in t.fmat if m == 1); log('TREE', t.name, 'wood tris', 2 * (len(t.fmat) - leaves), t.wood, 'cards', leaves, 'aoMin %.2f' % min(c[3] for c in col))
  # The physics record at scale 1: trunk radius at ~1 m and the height the disc can hit it to, and the crown as a sphere at the
  # leaves' mean height whose radius splits the difference between the crown's half-width (85th percentile of the leaves' reach
  # from the axis) and its half-height (5th-95th percentile), so a disc meets leaves about where the drawn crown starts. A tree
  # with a shadow proxy is measured off it: the conifers' sprays draw the same crown finer, and finer must not move a collider.
  lv = t.gv or [p for p, k in zip(verts, t.kind) if k == 1]; fy = sum(p.z for p in lv) / len(lv)
  reach = sorted(math.hypot(p.x, p.y) for p in lv); zs = sorted(p.z for p in lv); q = lambda a, f: a[min(len(a) - 1, int(f * len(a)))]
  fr = (q(reach, .85) + (q(zs, .95) - q(zs, .05)) / 2) / 2
  DIMS[t.name] = [round(t.r_base, 3), round(t.trunk_h, 2), round(fy, 2), round(fr, 2)]; log('DIMS', t.name, DIMS[t.name])
  return o

def trunk_pts(rng, H, top, lean=0., wave=.035, segs=12, base=-.3, sweep=0., sweep_az=math.pi / 2):
  """`sweep` bows the stem toward `sweep_az` (default across its lean), one way low and back high, so a trunk is a grown bow rather
  than a pole (the impostor sees x, the Scots pines' default y bow only from the 3D side)."""
  sw = Vector((math.cos(sweep_az), math.sin(sweep_az), 0)) * sweep
  pts, d, p = [], Vector((lean, 0, 1)).normalized(), Vector((0, 0, base))
  for i in range(segs + 1):
    pts.append(p.copy()); d = (d + Vector((rng.uniform(-wave, wave), rng.uniform(-wave, wave), 0)) + sw * math.cos(math.pi * i / segs)).normalized(); p = p + d * (H * top - base) / segs
  return pts

def radius_along(pts, r0, r1, flare=.35, flare_h=1.2):
  L = [0.]
  for i in range(1, len(pts)): L.append(L[-1] + (pts[i] - pts[i - 1]).length)
  return [(r0 + (r1 - r0) * (l / L[-1]) ** .85) * (1 + flare * max(0, 1 - l / flare_h) ** 2) for l in L]

def ring_tube(t, pts, radii, sides):   # tube with an explicit radius per point (trunks with a root flare)
  n0 = len(t.faces); t.tube(pts, 1, 1, sides)
  per = sides + 1; start = len(t.v) - per * len(pts)
  for i, r in enumerate(radii):
    for k in range(per):
      j = start + i * per + k; t.v[j] = pts[i] + t.n[j] * r

def shell_points(rng, n, sample, min_d):
  """Dart throwing: up to n points from sample() at least min_d apart."""
  pts = []
  for _ in range(n * 60):
    p = sample()
    if p is not None and all((p - q).length >= min_d for q in pts): pts.append(p)
    if len(pts) >= n: break
  return pts

def bezier(a, b, c, n):
  return [a * (1 - s) ** 2 + b * 2 * s * (1 - s) + c * s * s for s in (i / n for i in range(n + 1))]

def crown(t, rng, tp, rads, H, lo, hi, W, n_limbs, n_clumps, min_d, cells, card, hang=0., limb_elev=(.35, .95), limb_r=.6, sides=6, count=(3, 4), lobes=0, lobe_r=1.5, lobe_br=3, ragged=0., lobe_sep=1.25):
  """Envelope-guided crown: limbs leave the leader between lo*H and hi*H and arc up and out toward the envelope (an ellipsoid
  W wide from lo*H to H). With `lobes`, the clumps gather round that many dart-thrown lobe centres just inside the envelope
  (each clump on the lobe's surface, its cards facing out of the lobe), so the crown reads as a few big leafy masses, each lit
  on its sun side with a shaded core and lee, and deep gaps between them; each lobe then gets its own limb from the leader
  below it plus three short branches spreading inside it, so the wood follows the masses and the clumps sit close to it.
  Without, limbs go out at random and clump points fill the envelope's outer shell. Each clump hangs on a twig from the
  nearest limb point below it; wood is kept lean (4-segment limbs, no twig under 1.3 m, where the card's own drawn twig
  covers it) so the triangles go to leaves."""
  zc, rz = (lo + 1) * H / 2, (1 - lo) * H / 2
  def trunk_at(z):
    s = min(1, max(0, (z + .3) / (tp[-1].z + .3))); i = min(len(rads) - 1, int(s * (len(rads) - 1))); return along(tp, s)[0], rads[i]
  limbs = [tp[i:] for i in range(len(tp)) if tp[i].z > lo * H][:1]   # the leader through the crown is a limb too
  if lobes:
    def lobe_sample():
      u = unit(rng); u.z *= .8; s = rng.uniform(.45, .8); p = Vector((u.x * W * s, u.y * W * s, zc + u.z * rz * s))
      return p if p.z > lo * H + lobe_r * .6 else None
    top = along(limbs[0], 1.)[0] if limbs else Vector((0, 0, H))
    centres = [top - Z * lobe_r * .55] + shell_points(rng, lobes - 1, lobe_sample, lobe_r * lobe_sep)   # one caps the leader, so no bare tip sticks out; lobe_sep > 1.25 leaves sky between the masses
    for c in centres[1:]:
      base, r = trunk_at(min(max(lo * H + .3, c.z - rng.uniform(1.2, 2.8) - hang * 1.2), top.z - 1.5)); d = c - base
      side = d.cross(Z).normalized() * d.length * rng.uniform(-.12, .12) if abs(d.normalized().z) < .98 else Vector((0, 0, 0))
      limb = bezier(base, base + d * .4 + Z * d.length * (.22 - hang * .2) + side, c, 4)
      for k in range(1, len(limb) - 1): limb[k] = limb[k] + unit(rng) * d.length * .04   # sinuous, not a spoke
      t.tag = 'limb'; t.tube(limb, r * limb_r, .03, sides, .85); limbs.append(limb)
      out = Vector((d.x, d.y, 0)).normalized() if Vector((d.x, d.y, 0)).length > 1e-3 else unit(rng)
      t.tag = 'lobe'
      for j in range(lobe_br):   # the lobe's own branches, out, round and down from its heart, so every clump has wood near it
        e = c + (unit(rng) + out * .6 - Z * (.15 + hang * .4)).normalized() * lobe_r * rng.uniform(.55, .8)
        sub = bezier(c, c.lerp(e, .5) + Z * lobe_r * (.08 - hang * .15) + unit(rng) * .1, e, 2); t.tube(sub, .035, .01, 3, .85); limbs.append(sub)
  else:
    centres = []
  az = rng.uniform(0, TAU)
  for i in range(0 if lobes else n_limbs):
    az += TAU * .382 + rng.uniform(-.4, .4); z = H * (lo + (hi - lo) * (i + rng.uniform(0, 1)) / n_limbs); base, r = trunk_at(z)
    elev = rng.uniform(*limb_elev); reach = W * rng.uniform(.7, .92) * math.sqrt(max(.15, 1 - ((z - zc) / rz) ** 2))
    end = base + Vector((math.cos(az) * reach, math.sin(az) * reach, reach * math.tan(elev) * .6 + 1.))
    if hang: end.z -= reach * hang * .6   # birch limbs arch over and their tips weep
    side = Vector((-math.sin(az), math.cos(az), 0)) * reach * rng.uniform(-.2, .2)
    limb = bezier(base, base + Vector((math.cos(az) * reach * .25, math.sin(az) * reach * .25, reach * .55)) + side, end, 4)
    for k in range(1, len(limb) - 1): limb[k] = limb[k] + unit(rng) * reach * .05   # sinuous, not a spoke
    t.tag = 'limb'; t.tube(limb, r * limb_r, .03, sides, .85); limbs.append(limb); t.tag = 'fork'
    if reach > 2.2:   # the limb forks once toward a neighbouring part of the envelope
      p, d = along(limb, rng.uniform(.4, .6)); a2 = az + rng.choice((-1, 1)) * rng.uniform(.45, .85); rr = reach * rng.uniform(.75, .95)
      end2 = Vector((math.cos(a2) * rr, math.sin(a2) * rr, 0)) + Vector((0, 0, p.z + rng.uniform(.4, 1.6) - hang * rr * .4))
      sub = bezier(p, p.lerp(end2, .4) + Z * rr * .2, end2, 3)
      for k in range(1, len(sub) - 1): sub[k] = sub[k] + unit(rng) * rr * .05
      t.tube(sub, r * limb_r * .5, .02, 3, .85); limbs.append(sub)
  def inside(p, k=1.): return (p.x / W) ** 2 + (p.y / W) ** 2 + ((p.z - zc) / rz) ** 2 <= k * k and p.z > lo * H + .6
  def sample():
    u = unit(rng); s = rng.uniform(.62, 1.) ** .5
    p = Vector((u.x * W * s, u.y * W * s, zc + u.z * rz * s))
    return p if p.z > lo * H + .6 else None
  if lobes:
    def sample():   # on a lobe's surface, most on its outer half, never outside the envelope
      c = rng.choice(centres); out = c - Vector((0, 0, c.z)); out = out.normalized() if out.length > 1e-3 else unit(rng)
      d = (unit(rng) + out * .6 + Z * .15).normalized(); p = c + d * lobe_r * rng.uniform(.55, 1.)
      return p if inside(p, 1.08) else None
  pts = []   # attachment points every ~0.4 m along every limb, so twigs leave all along it instead of in stars from its joints
  for l in limbs:
    n = max(2, int(sum((q - p).length for p, q in zip(l, l[1:])) / .4)); pts += [along(l, i / n)[0] for i in range(n + 1)]
  dropped = 0
  for c in shell_points(rng, n_clumps, sample, min_d):
    # a ragged outline: `ragged` of the clumps in the envelope's outer shell never grew, so the silhouette breaks up and sky
    # shows through the edge of the crown instead of it closing into one smooth wall of cards
    if ragged and ((c.x / W) ** 2 + (c.y / W) ** 2 + ((c.z - zc) / rz) ** 2) ** .5 > .85 and rng.random() < ragged: dropped += 1; continue
    a = min(pts, key=lambda p: (p - c).length + max(0, p.z - c.z + .5) * (.6 if lobes else 2))   # attach below or level (in a lobe a clump may hang from above)
    d = c - a; t.tag = 'twig'
    if d.length > 1.6: t.tube([a, a.lerp(c, .5) + Z * d.length * (.12 - hang * .3) + unit(rng) * .2, c], .022, .006, 3)   # long twigs bow (a straight one reads as a wire against the sky)
    elif d.length > 1.3: t.tube([a, c], .02, .007, 3)
    lb = min(centres, key=lambda q: (q - c).length) if centres else None; t.cur_lobe = lb
    out = (c - lb).normalized() if lb is not None and (c - lb).length > 1e-3 else None
    t.clump_at(c, d if d.length > .1 else c - Vector((0, 0, c.z - 1)), rng.randint(*count), card * rng.uniform(.88, 1.1), rng.choice(cells), hang=hang, out=out, out_bias=.7 if out else .6)
  t.cur_lobe = None
  if ragged: log('RAGGED', t.name, 'dropped', dropped, 'of', n_clumps)
  return limbs

def stubs(t, rng, tp, rads, z0, z1, n, reach=(.1, .26)):
  """Dead branch stubs on the bare trunk (a forest tree self-prunes its shaded lower limbs): short, thin, drooping, so a trunk
  reads as a grown stem rather than a turned pole; a longer `reach` leaves dead branches that still show from the tee."""
  t.tag = 'stub'
  for _ in range(n):
    s = rng.uniform(z0, z1) / tp[-1].z; p, _d = along(tp, s); r = rads[min(len(rads) - 1, int(s * (len(rads) - 1)))]
    a = rng.uniform(0, TAU); d = Vector((math.cos(a), math.sin(a), rng.uniform(-.3, .1))).normalized()
    t.tube([p + d * r * .6, p + d * (r + rng.uniform(*reach))], rng.uniform(.04, .06), .025, 3)   # blunt: a snapped-off limb, not a thorn

def base_r(tp, rads, z=1.):   # trunk radius at about 1 m, for the physics record
  return rads[min(range(len(tp)), key=lambda i: abs(tp[i].z - z))]

def birch(rng, name, H=17., lean=0., girth=.2, sweep=0., sweep_az=0.):
  t = Tree(rng, name, 'bark_birch', vscale=2.5)
  tp = trunk_pts(rng, H, .95, lean, .03, 10, sweep=sweep, sweep_az=sweep_az); rads = radius_along(tp, girth, .045, .4, 1.4)
  ring_tube(t, tp, rads, 8); t.trunk_h, t.r_base = H * .9, base_r(tp, rads)
  t.axis = lambda z: along(tp, min(1, max(0, (z + .3) / (H * .95 + .3))))[0]
  t.base_dark = lambda z: .36 + .64 * min(1, max(0, (z - .3) / 2.2)) ** .7   # the black fissured foot of a birch
  # limbs as white as the stem where they leave it, the thin wood out in the leaves near black, so the branches read against
  # the foliage (and the sky between it) where the trunk runs up into the crown; the limbs are thick enough to show at 40 m
  t.tag_tint = {'limb': (.84, .82, .8), 'lobe': (.34, .3, .28), 'twig': (.3, .27, .25), 'stub': (.3, .28, .27)}
  crown(t, rng, tp, rads, H, .36, .88, 3.1, rng.randint(11, 13), 112, .72, [CELL['birch']], 1.75, hang=.45, limb_elev=(.7, 1.1), limb_r=.58, sides=4, count=(3, 3), lobes=15, lobe_r=1.15, lobe_br=2, ragged=.6, lobe_sep=1.6)
  stubs(t, rng, tp, rads, 2.5, H * .34, 4)
  return t

def broadleaf(rng, name, H=15., W=5., lo=.38, girth=.34, sweep=0., sweep_az=0.):
  t = Tree(rng, name, 'bark', vscale=BARK_V)
  tp = trunk_pts(rng, H, .84, rng.uniform(-.04, .04), .04, 9, sweep=sweep, sweep_az=sweep_az); rads = radius_along(tp, girth, .09, .45, 1.2)
  ring_tube(t, tp, rads, 8); t.axis = lambda z: Vector((0, 0, z)); t.trunk_h, t.r_base = H * .6, base_r(tp, rads)
  crown(t, rng, tp, rads, H, lo, .7, W, rng.randint(5, 7), 142, .9, [CELL['broad'], CELL['broad'], CELL['dense']], 1.85, limb_elev=(.3, .85), limb_r=.7, sides=4, count=(3, 4), lobes=9, lobe_r=1.8, ragged=.6, lobe_sep=1.9)   # g20: lobes apart, so sky shows between the masses
  stubs(t, rng, tp, rads, 1.8, H * lo * .9, 3)
  return t

def spruce(rng, name, H=20., R0=3.4, zb=.1, lop=(0., 0.)):
  """Whorls of 4-5 branches that dip and turn up at the tip, each clothed in short needle sprays: small frond cards (0.4-1.3 m)
  leaving it every ~0.4 m on alternate sides from the stem out, about half lying open and drooping, more on the long low branches
  (seen from above and below), half on edge, hanging or turned up (seen from the side), a heart by the stem, a leading shoot
  along the tip and one to three branchlets hanging under it, turned half across the branch (the comb seen from the ground and
  from the side). No spray reaches past 1.1 L from the stem and the short upper branches' sprays hug them, with two more hugging
  the stem above each whorl of the top: a spire, not sprays floating round a bare leader. So a whorl reads as layered sprays with
  sky between them, joined to their branch: one 1-2.6 m frond card per branch (and its crossing card and curtain) had merged its
  needle tufts into one lobed paper cut-out (gauntlet r4). The sprays keep the old cards' places and tilts, so the cone and its
  collider stay where they were, and the old cards themselves are the shadow proxy (ghost()). The layout draws from `rng` in
  the old order (the pines and bushes built after a spruce keep their shapes); each spray's own jitter comes from `t.fine`."""
  t = Tree(rng, name, 'bark', vscale=BARK_V); fn = t.fine
  # `lop` (g20 trees: "near-identical flat cards with repeating tiers in uniform rows"): a crown grown out toward the light on one
  # side (branches up to lop[0] longer toward lop[1], shorter away), so each variant and its mirror stand as different
  # silhouettes; whorl spacing varies -20..+35% and more branches are missing, so the tiers do not stack as a regular ladder
  tp = trunk_pts(rng, H, .98, 0, .015, 10); rads = radius_along(tp, .44, .03, .3, 1.)
  ring_tube(t, tp, rads, 7); t.axis = lambda z: Vector((0, 0, z - 1.)); t.trunk_h, t.r_base = H * .85, base_r(tp, rads)
  P = CELL['pine']; jit = lambda v, k: v + unit(fn) * k
  z = H * zb
  while z < H * .95:
    f = (z - H * zb) / (H * (.95 - zb)); R = R0 * (1 - f) ** .9 + .45; n = rng.randint(4, 5); az = rng.uniform(0, TAU)
    for i in range(n):
      if rng.random() < .16 + .3 * (1 - f) ** 3: continue   # missing branches, most low down: sky through the skirt and gaps in the tiers
      a = az + i * TAU / n + rng.uniform(-.4, .4); L = R * rng.uniform(.8, 1.12) * (1 + lop[0] * math.cos(a - lop[1])); out = Vector((math.cos(a), math.sin(a), 0))
      d = out + Z * (-.28 + .18 * f)
      br = grow(rng, Vector((0, 0, z)), d, L, 2, rise=.2, jitter=.04)
      t.tube([br[0], along(br, .55 if L > 1.4 else .75)[0]], .012 + .03 * L / R0, .006, 3)   # the wood stops inside the sprays: from outside a spruce shows needles, not sticks (on the short upper branches it carries them most of the way)
      size = min(2.6, max(1.1, L * 1.05)); ctr = Vector((0, 0, z - .8)); g = shade(t.tone.uniform(-1, .3) * .7 - .3, .72 + .26 * (rng.uniform(.88, 1.05) - .88) / .17)   # branch to branch, dark blue-green to a lighter green: a spruce reads darker and cooler than the broadleaves round it (g20 trees: the near sprays read as the same yellow-green as every crown)
      dip = rng.uniform(.05, .3); lie = Z * .75 + out * .55 + unit(rng) * .35   # the old frond's dip and facing (open, from above)
      tilt = rng.uniform(-.25, .15); edge = out.cross(Z) + Z * rng.uniform(-.2, .5) + unit(rng) * .35   # the crossing card's (on edge, from the side)
      hang = (rng.uniform(.4, .7), unit(rng), unit(rng)) if L > .8 else None   # the curtain's place and tilts
      t.ghost(br[0] + out * .15, br[-1] - br[0] - Z * dip, lie, size, P); t.ghost(br[0] + out * .25, br[-1] - br[0] + Z * tilt, edge, size * .9, P)
      if hang: p, dd = along(br, hang[0]); t.ghost(p, -Z + dd * .6 + hang[1] * .2, out + hang[2] * .35, min(1.9, L * .7), P)
      k = max(2, round(L / .42)); side = fn.choice((-1, 1)); reach = min(1., .7 + L / 3.5)   # short upper branches carry fewer, smaller sprays
      # and none reaches past `lim` from the stem, fanning out less on the short ones (`wide`), so each hugs its branch: ~1 m sprays
      # on the 0.6-1.2 m branches of the top third had stood up to 2 m out at up to 48 deg, flecks floating beside the leader (r4 verify)
      lim, wide, sag = 1.1 * L + .1, min(1., L / 2.), .15 + .45 * (1 - f) + dip * .4 + tilt * .3   # sag: the sprays' mean droop
      if L > 1.4: t.card(br[0] + out * .1, along(br, .5)[0] - br[0] - Z * dip, jit(lie, .2), min(1.5, .4 + L * .4), P, ctr, g)   # a dense heart by the stem, under the sprays
      else: t.card(br[0], br[-1] - br[0] - Z * dip, jit(lie.normalized() + edge.normalized(), .2), .7 * L, P, ctr, g)   # a short branch's: from the stem along it, half on edge, so its sprays never stand off the stem
      for j in range(k):   # a feather of sprays on alternate sides from the stem out, every other one on edge (seen from the side)
        s = .03 + .9 * (j + fn.uniform(.1, .6)) / k; p, dd = along(br, s); side = -side   # from the stem out, so a short branch's two or three sprays join it to the stem (started a third of the way out, they stood off it)
        lat = dd.cross(Z); lat = lat.normalized() * side if lat.length > 1e-3 else unit(fn)
        sz = min((1.12 - .35 * s) * reach * fn.uniform(.8, 1.15), .65 * L); droop = (.15 + .45 * (1 - f)) * fn.uniform(.6, 1.4) + dip * .4 + tilt * .3
        if (j + (fn.random() < .2)) % 2: up = dd + lat * fn.uniform(.5, 1.1) * wide - Z * droop; face = jit(lie - Z * .3, .3)   # open, drooping
        else: up = dd * .7 + lat * fn.uniform(.3, .8) * wide + Z * (fn.uniform(-.9, .35) - droop * .5); face = jit(up.cross(Z) * side + Z * edge.z, .3)   # on edge, some hanging, some turned up: the branch's foliage a layer deep, as the crossing card stood
        sz = fit(p, up, sz, lim, .9); t.card(p - up.normalized() * sz * .1, up, face, sz, P, ctr, g)
      # the leading shoot, along the sprays (turned up off them, it stood clear of the drooping feather as a separate fleck) and half
      # on edge (lying open, it was a sliver from the side)
      tip, td = along(br, 1.); b = tip - td * min(.6 * reach, .45 * L); up = td - Z * sag * .6; t.card(b, up, jit(lie.normalized() + edge.normalized(), .25), fit(b, up, min(.75 * reach, .55 * L) * fn.uniform(.9, 1.1), lim), P, ctr, g)
      if hang:
        s0, u0, u1 = hang
        for q in range(1 + (L > 1.6) + (L > 2.8)):
          p, dd = along(br, min(.9, s0 - .15 + q * .22)); up = -Z + dd * .7 + u0 * .2 + unit(fn) * .15   # turned ~40 deg across the branch, one way then the other: facing straight out they were slivers seen from the side
          t.card(p, up, out + out.cross(Z) * (q % 2 * 2 - 1) * .8 + u1 * .35, fit(p, up, min(.95, .35 + L * .2) * fn.uniform(.85, 1.1), lim), P, Vector((0, 0, p.z - .6)), g)
    if f < .8:   # a short shoot between whorls, so the layers do not stack as shelves
      a = rng.uniform(0, TAU); out = Vector((math.cos(a), math.sin(a), 0)); zz = z + rng.uniform(.25, .45); face = Z + unit(rng) * .5; sz = min(1., R * .4 + .3)
      t.ghost(Vector((0, 0, zz)) + out * .1, out - Z * .15, face, min(2., R * .8 + .5), P)
      for q in range(2): t.card(Vector((0, 0, zz)) + out * (.1 + q * sz * .7), jit(out - Z * (.15 + .2 * q), .2), jit(face, .2), sz * (1 - .2 * q), P, Vector((0, 0, zz - .8)))
    if f > .7:   # the top: two sprays hugging the stem above each whorl, so it reads as one narrow spire rather than sprays round a bare pole
      for q in range(2): o = Vector((math.cos(az + q * 3.1), math.sin(az + q * 3.1), 0)); t.card(Vector((0, 0, z + q * .25)) + o * .05, Z + o * fn.uniform(.25, .45) + unit(fn) * .1, o + unit(fn) * .3, (.55 + .4 * (1 - f)) * fn.uniform(.9, 1.15), P, Vector((0, 0, z - .8)))
    z += rng.uniform(.6, .85) * fn.uniform(.8, 1.35)
  for k in range(3):   # the leader: a spire of small sprays
    up = Z + unit(rng) * .15; face = unit(rng); t.ghost(Vector((0, 0, H * .9)), up, face, 1.6, P)
    for q in range(3): t.card(Vector((0, 0, H * .9 + q * .6)) + unit(fn) * .05, jit(up, .1), jit(face, .2), (.95 - .22 * q) * fn.uniform(.9, 1.1), P, Vector((0, 0, H * .85)))   # up past the stem's tip
  return t

def pad(t, c, r, n, ax=None):
  """A needle pad: n tuft cards (forking shoots with needles only at their tips, so sky shows through a pad and its edge is ragged)
  radiating from two or three sub-centres strung along the branch (`ax`), in every direction
  round the horizontal (tilted up more than down, so it is dome-topped and flat-bottomed), half standing on edge and half lying
  open, the ones along the branch longest, sizes varied: from the side an irregular, elongated cloud about 2r across with a
  ragged edge, not a repeated oval or a spray of flat slivers: the sub-centres spread most of r along the branch and the cards
  keep near the horizontal, so a pad is a flat, drawn-out tuft rather than a ball. Its cards face out of a centre just below c,
  so it lights on top and falls dark underneath, and the clump tint varies pad to pad. Each card is drawn as a spray of up to five
  smaller tufts along its place (below) and casts as itself (the shadow proxy, ghost())."""
  rng, fn = t.rng, t.fine; hue = rng.uniform(-1, 1); lit = rng.uniform(.82, 1.14); tint = shade(hue * .6 - .3, .72 + .36 * (lit - .82) / .32)   # pad to pad, grey blue-green to green, a step darker or lighter: Scots pine needles are bluer than the broadleaves
  ax = Vector((ax.x, ax.y, 0)).normalized() if ax is not None and Vector((ax.x, ax.y, 0)).length > 1e-3 else unit(rng).cross(Z).normalized()
  subs = [c + ax * r * rng.uniform(-.8, .8) + ax.cross(Z) * r * rng.uniform(-.35, .35) + Z * r * rng.uniform(-.15, .15) for _ in range(rng.randint(2, 3))]
  t.cur_lobe = c - Z * r * .35
  for k in range(n):
    a = rng.uniform(0, TAU); out = Vector((math.cos(a), math.sin(a), rng.uniform(-.15, .3))).normalized(); s = subs[k % len(subs)]
    size = r * rng.uniform(.8, 1.35) * (1 + .4 * abs(out.dot(ax)))
    face = (out.cross(Z) * rng.choice((-1, 1)) + Z * rng.uniform(-.3, .3) + unit(rng) * .3) if k % 2 else (Z + unit(rng) * .55)
    b = s - out * size * rng.uniform(.3, .5) + Z * r * rng.uniform(-.2, .15); t.ghost(b, out, face, size, CELL['tuft'])
    # the tuft's place drawn as a spray of tufts 1-1.6 m long over the old card's plane with sky between, so the pad keeps its
    # outline from every side: one 2-5 m tuft card read as a lobed paper cut-out (gauntlet r4). Each tuft's needles land inside
    # the old card's own (its cell's opaque part: .15-.73 along, -.17..+.34 across, narrow at the stem): scattered over the
    # whole card, the 2-5 m cards' clear corners included, and 0.9-1.3 m long, they had stood off the pads as separate flecks
    # (side on, 74-77 pieces apart from the crown; now 20-38, the old cards 9-13). The layout draws above stay in their old
    # order; the spray's come from t.fine
    sz = min(size, .9 + .25 * r); m = 1 if size < sz * 1.2 else min(5, round(1 + (size / sz - 1) * 1.2)); room = size - sz
    lat = out.cross(face - out * face.dot(out)); lat = lat.normalized() if lat.length > 1e-3 else unit(fn)   # across the old card, in its plane
    for q in range(m):
      w = (q + fn.uniform(.15, .85)) / m; o = b + out * room * (.15 + .58 * w) + lat * room * (.085 + fn.uniform(-.15, .15) * (.4 + .6 * w)) * (m > 1)
      t.card(o, out + lat * fn.uniform(-.25, .25), face + unit(fn) * .3, sz * fn.uniform(.85, 1.1), CELL['tuft'], c, tint)
  t.cur_lobe = None

def scots(rng, name, H=21., lo=.5, girth=.34, lean=.05, sweep=0., top=.08):
  """Scots pine: a stem, grey-brown and fissured low, orange-red and smooth up in the crown, bare (bar dead stubs and a few dead
  branches) to about half its height under an irregular dome of needle pads: 10-12 branches leave the upper stem, the low ones
  reaching furthest and spreading flat, the high ones climbing, each carrying one or two dense pads, with a rounded cluster on the
  leader, so the crown reads as a mass of green clouds, lit on top and dark under, with sky only in the gaps between them. The
  variants differ in girth, taper (`top`, the stem's radius under the crown's top), lean and `sweep` (an S-bowed stem), so a
  stand of them is not a row of identical poles."""
  t = Tree(rng, name, 'bark', vscale=BARK_V)
  t.lobe_mix = (.3, .6)   # pads shade with the whole crown (its sun side lit, its far side dark), not each as its own lit ball
  tp = trunk_pts(rng, H, .9, lean, .045, 9, sweep=sweep); rads = radius_along(tp, girth, top, .35, 1.)
  ring_tube(t, tp, rads, 7); t.axis = lambda z: along(tp, min(1, max(0, (z + .3) / (H * .9 + .3))))[0] - Z * 1.5
  t.trunk_h, t.r_base = H * .82, base_r(tp, rads)
  t.base_dark = lambda z: (lambda f: (.74 + .56 * f, .74 + .3 * f, .74 + .06 * f))(min(1, max(0, (z - H * .42) / (H * .25))))   # grey foot, fox-orange upper stem
  stubs(t, rng, tp, rads, 2.2, H * lo * .95, 7); stubs(t, rng, tp, rads, H * lo * .5, H * lo * .95, 3, (.5, 1.1))
  n = rng.randint(11, 13); az = rng.uniform(0, TAU); t.tag = 'limb'   # an open crown: the sun and sky show between the pads
  for i in range(n):
    f = (i + rng.uniform(.1, .9)) / n; z = H * (lo + (.86 - lo) * f); base, _ = along(tp, min(1, (z + .3) / (H * .9 + .3)))
    az += TAU * .382 + rng.uniform(-.5, .5); elev = rng.uniform(.12, .38) + .5 * f
    L = H * (.27 - .14 * f) * rng.uniform(.82, 1.12); d = Vector((math.cos(az) * math.cos(elev), math.sin(az) * math.cos(elev), math.sin(elev)))
    br = grow(rng, base, d, L, 3, rise=.1, flatten=.45, jitter=.1); t.tube(br, .14 - .05 * f, .03, 5)   # thick enough to show at 60 m holding its pad up
    r = rng.uniform(.9, 2.8); p, dd = along(br, 1.); pad(t, p + Z * .3, r, round(7 + 5 * r), d)   # pads of very different sizes, cards in proportion
    if L > 3.1:   # the longest branches carry a second pad part-way out, so the low tiers join into one crown
      r = rng.uniform(.8, 2.); p, dd = along(br, rng.uniform(.42, .6)); pad(t, p + Z * .4, r, round(5 + 5 * r), d)
    for s_ in (rng.uniform(.26, .4), rng.uniform(.62, .8)):   # small tufts clothe the branch between stem and pad, so the pads run together into one ragged crown, not pom-poms on bare sticks
      p, dd = along(br, s_); pad(t, p + Z * .15, rng.uniform(.6, 1.), rng.randint(4, 5), d)
  p, dd = along(tp, 1.)
  pad(t, p + Z * .1, 1.9, 18); pad(t, p - Z * 1.6 + unit(rng) * .6, 1.7, 15)
  return t

def bush(rng, name, R=1.3, Hb=1.5):
  """A dome of clumps: dart-thrown points over a squashed hemisphere, each on a straight stem from the root, so the bush is a
  rounded mass with gaps instead of a fan of sprays."""
  t = Tree(rng, name, 'bark', vscale=1.); t.axis = lambda z: Vector((0, 0, -.2))
  def sample():
    u = unit(rng); u.z = abs(u.z) * .9 + .1; s = rng.uniform(.55, 1.) ** .5; return Vector((u.x * R * s, u.y * R * s, u.z * Hb * s))
  for c in shell_points(rng, 16, sample, .55):
    root = Vector((rng.uniform(-.12, .12), rng.uniform(-.12, .12), -.1)); t.tube([root, c], .018, .006, 3)
    low = c.z < Hb * .45   # low clumps spill outward and down to the ground, so the stems never show as a fan under the bush
    t.clump_at(c, c - root + Z * (.1 if low else .4), rng.randint(2, 3), rng.uniform(1.05, 1.3), CELL['dense'], hang=.45 if low else 0., out_bias=.75)
  return t

def export(species, objs):
  bpy.ops.object.select_all(action='DESELECT')
  for o in objs: o.select_set(True)
  total = 0
  for o in objs: o.data.calc_loop_triangles(); total += len(o.data.loop_triangles)
  path = OUT / f'{species}.glb'
  bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', export_yup=True, use_selection=True, export_animations=False, export_image_format='NONE', export_extras=True,
    export_texcoords=True, export_normals=True, export_vertex_color='ACTIVE', export_apply=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_draco_position_quantization=13, export_draco_normal_quantization=10,
    export_draco_texcoord_quantization=14, export_draco_color_quantization=10)
  REPORT[species] = {'variants': [o.name for o in objs], 'triangles': total, 'bytes': path.stat().st_size}
  log('EXPORT', species, json.dumps(REPORT[species]))

def impostors(objs):
  """Far LOD and Lite trees: every variant rendered side-on (camera on -Y looking +Y, orthographic) into a 256 x 512 cell of
  impostors.webp (albedo, alpha; 4 cells across, as many rows as needed) and impostors_n.webp: the crown normals in the view
  frame (x right, y up; z is rebuilt) with each leaf card's own facing mixed in, crown depth (sky visibility times how thin the
  crown is along the view ray, from a pass that counts leaf layers) and a leaf mask. So a billboard lights like the 3D tree:
  dark into the sun at its heart, glowing where the crown is thin, broken up card by card. Each cell frames the tree's own
  extent at 1:2 with the trunk at the centre; the extents land in the build report and src/impostors.js. impostors_s.webp
  (grey, half size: the shadow maps' texels are 6-12 cm, its 8) is what the card casts: the coverage of a conifer's wood and its
  '-shadow' proxy (the old cards its 3D crown casts within the swap, ghost()), the crown's own coverage for the rest, so a far
  tree's shadow keeps the near one's shape and the open ground the dapples it had."""
  sc = bpy.context.scene; sc.render.engine = 'CYCLES'
  prefs = bpy.context.preferences.addons['cycles'].preferences
  try:
    prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
    for d in prefs.devices: d.use = d.type == 'OPTIX'
    sc.cycles.device = 'GPU'
  except Exception: pass
  sc.cycles.samples = 32; sc.cycles.use_denoising = False; sc.cycles.max_bounces = 0; sc.cycles.transparent_max_bounces = 128
  sc.render.film_transparent = True; sc.render.resolution_x, sc.render.resolution_y = 512, 1024; sc.render.filter_size = 1.
  sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '16'
  sc.world = None
  def emit(name, mode, image=None, alpha=False, vscale=1.):
    m = bpy.data.materials.new(name); nt = node_tree(m); nt.nodes.clear(); out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = image
    if vscale != 1.:
      uv = nt.nodes.new('ShaderNodeUVMap'); mp = nt.nodes.new('ShaderNodeVectorMath'); mp.operation = 'MULTIPLY'; mp.inputs[1].default_value = (1, vscale, 1)
      nt.links.new(uv.outputs['UV'], mp.inputs[0]); nt.links.new(mp.outputs['Vector'], tx.inputs['Vector'])
    if mode == 'albedo':
      vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; mul = nt.nodes.new('ShaderNodeVectorMath'); mul.operation = 'MULTIPLY'
      nt.links.new(tx.outputs['Color'], mul.inputs[0]); nt.links.new(vc.outputs['Color'], mul.inputs[1]); nt.links.new(mul.outputs['Vector'], em.inputs['Color'])
    elif mode == 'mask':   # leaves 1, wood .2 (not 0: WebP rewrites the colour under zero alpha)
      em.inputs['Color'].default_value = (1, 1, 1, 1) if alpha else (.2, .2, .2, 1)
    elif mode == 'ao':     # the baked sky visibility (vertex colour alpha)
      vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Alpha'], em.inputs['Color'])
    elif mode == 'thick':  # crown thickness along the view ray: every leaf layer passes the ray on and adds .08; wood stops it at .6
      em.inputs['Strength'].default_value = .08 if alpha else .6
      if alpha:
        tr0 = nt.nodes.new('ShaderNodeBsdfTransparent'); add = nt.nodes.new('ShaderNodeAddShader'); nt.links.new(tr0.outputs['BSDF'], add.inputs[0]); nt.links.new(em.outputs['Emission'], add.inputs[1]); em = add
    else:   # the true (unflipped) normal in the camera frame: (x, z, -y), 0.5-biased
      g = nt.nodes.new('ShaderNodeNewGeometry'); flip = nt.nodes.new('ShaderNodeMath'); flip.operation = 'MULTIPLY_ADD'; flip.inputs[1].default_value = -2; flip.inputs[2].default_value = 1
      nt.links.new(g.outputs['Backfacing'], flip.inputs[0]); sc_ = nt.nodes.new('ShaderNodeVectorMath'); sc_.operation = 'SCALE'
      nt.links.new(g.outputs['Normal'], sc_.inputs[0]); nt.links.new(flip.outputs['Value'], sc_.inputs['Scale'])
      if alpha:   # leaves: each card's own facing mixed into the crown normal, so the billboard's light breaks up card by card (dapple)
        tn = nt.nodes.new('ShaderNodeVectorMath'); tn.operation = 'SCALE'; nt.links.new(g.outputs['True Normal'], tn.inputs[0]); nt.links.new(flip.outputs['Value'], tn.inputs['Scale'])
        k = nt.nodes.new('ShaderNodeVectorMath'); k.operation = 'MULTIPLY_ADD'; nt.links.new(tn.outputs['Vector'], k.inputs[0]); k.inputs[1].default_value = (.45, .45, .45); nt.links.new(sc_.outputs['Vector'], k.inputs[2])
        nz = nt.nodes.new('ShaderNodeVectorMath'); nz.operation = 'NORMALIZE'; nt.links.new(k.outputs['Vector'], nz.inputs[0]); sc_ = nz
      sep = nt.nodes.new('ShaderNodeSeparateXYZ'); comb = nt.nodes.new('ShaderNodeCombineXYZ'); neg = nt.nodes.new('ShaderNodeMath'); neg.operation = 'MULTIPLY'; neg.inputs[1].default_value = -1
      nt.links.new(sc_.outputs['Vector'], sep.inputs[0]); nt.links.new(sep.outputs['X'], comb.inputs['X']); nt.links.new(sep.outputs['Z'], comb.inputs['Y'])
      nt.links.new(sep.outputs['Y'], neg.inputs[0]); nt.links.new(neg.outputs['Value'], comb.inputs['Z'])
      bias = nt.nodes.new('ShaderNodeVectorMath'); bias.operation = 'MULTIPLY_ADD'; bias.inputs[1].default_value = (.5, .5, .5); bias.inputs[2].default_value = (.5, .5, .5)
      nt.links.new(comb.outputs['Vector'], bias.inputs[0]); nt.links.new(bias.outputs['Vector'], em.inputs['Color'])
    if alpha:
      tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader'); lt = nt.nodes.new('ShaderNodeMath'); lt.operation = 'GREATER_THAN'; lt.inputs[1].default_value = .5
      nt.links.new(tx.outputs['Alpha'], lt.inputs[0]); nt.links.new(lt.outputs['Value'], mx.inputs['Fac'])   # the runtime alpha-tests at .5
      nt.links.new(tr.outputs['BSDF'], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs['Shader'], out.inputs['Surface'])
    else: nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m
  imgs = {n: bpy.data.images.load(str(TEX / f if (TEX / f).exists() else ROOT / 'assets/textures' / f)) for n, f in (('bark', 'bark.jpg'), ('bark_birch', 'bark_birch.webp'), ('leaves', 'leaves.webp'))}
  MODES = ('albedo', 'normal', 'mask', 'ao', 'thick')
  mats = {(mode, n): emit(f'imp_{mode}_{n}', mode, imgs[n], n == 'leaves', 3. if n == 'bark' else 1.) for mode in MODES for n in imgs}
  hide = bpy.data.materials.new('imp_hide'); nt = node_tree(hide); nt.nodes.clear(); nt.links.new(nt.nodes.new('ShaderNodeBsdfTransparent').outputs['BSDF'], nt.nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])   # a conifer's own cards, out of its cast render
  cd = bpy.data.cameras.new('impcam'); cd.type = 'ORTHO'; cam = bpy.data.objects.new('impcam', cd); bpy.context.collection.objects.link(cam); sc.camera = cam
  cam.rotation_euler = (math.pi / 2, 0, 0); cd.clip_end = 200
  rows = (len(objs) + 3) // 4; atlas = np.zeros((512 * rows, 1024, 4)); atlas_n = np.zeros((512 * rows, 1024, 4)); atlas_s = np.zeros((512 * rows, 1024)); dims = {}
  lin = lambda x: np.where(x <= .04045, x / 12.92, ((x + .055) / 1.055) ** 2.4)
  srgb = lambda x: np.where(x <= .0031308, x * 12.92, 1.055 * np.power(np.clip(x, 0, 1), 1 / 2.4) - .055)
  box = lambda x: x.reshape(512, 2, 256, 2, x.shape[2]).mean(axis=(1, 3))
  for i, o in enumerate(objs):
    for ob in bpy.context.scene.objects:
      if ob.type == 'MESH': ob.hide_render = ob is not o
    xs = [abs(v.co.x) for v in o.data.vertices]; zs = [v.co.z for v in o.data.vertices]
    z0, z1 = min(zs) - .1, max(zs) + .1; Hc = z1 - z0; Wc = 2 * max(xs) + .2; Rx = max(64, round(1024 * Wc / Hc))
    sc.render.resolution_x = Rx; cd.ortho_scale = max(Wc, Hc)   # square pixels over the tree's own extent; squeezed to 512 wide below
    cam.location = (0, -60, z0 + Hc / 2); dims[o.name] = [round(Wc, 3), round(Hc, 3), round(z0, 3), i]
    res = {}; names = [s.material.name.split('.')[0] for s in o.material_slots]
    for mode in MODES:
      for k, n in enumerate(names): o.data.materials[k] = mats[(mode, n)]
      sc.view_settings.view_transform = 'Standard' if mode == 'albedo' else 'Raw'; sc.render.film_transparent = mode != 'thick'   # thickness adds up over black
      path = ROOT / 'art/qa/foliage-build' / f'imp_{o.name}_{mode}.png'; path.parent.mkdir(parents=True, exist_ok=True); sc.render.filepath = str(path); bpy.ops.render.render(write_still=True)
      res[mode] = read_rgba(path)
    a = res['albedo'][..., 3:4]; sq = lambda x: box(area_x(x, 512))
    A = sq(a); alb = sq(lin(res['albedo'][..., :3]) * a) / np.maximum(A, 1e-5); nrm = sq((res['normal'][..., :3] * 2 - 1) * a) / np.maximum(A, 1e-5)
    msk = sq(res['mask'][..., :1] * a) / np.maximum(A, 1e-5); ao = sq(res['ao'][..., :1] * a) / np.maximum(A, 1e-5)
    # Crown depth for the billboard, which gets no shadow map: the sky visibility times how thin the crown is along the view
    # ray (leaf layers counted by the 'thick' pass), so a rim reads ~0.8-1 and the heart of a crown ~0.2-0.3; the runtime
    # darkens light by it and lets thin foliage glow when back-lit. Wood keeps its sky visibility.
    thin = np.exp(-sq(res['thick'][..., :1] * a) / np.maximum(A, 1e-5) / .08 / 2.6)
    ao = np.where(msk > .6, ao * (.28 + .72 * thin), ao)
    nrm = nrm / np.maximum(np.linalg.norm(nrm, axis=2, keepdims=True), 1e-5); A = A[..., 0]
    alb = bleed(alb, A); nrm = bleed(nrm, A); msk = bleed(msk, A); ao = bleed(ao, A); nrm[A < .02] = (0, 0, 1)
    cast = A
    if o.name in SHADOWS:   # the far card casts the old cards too: cast from the sprays, the far conifers' shadows had thinned (the phone Pine tee's ground +3.4 luma) and changed shape at the swap
      gp = SHADOWS[o.name]; gp.data.materials[0] = mats[('mask', 'leaves')]; o.data.materials[0], o.data.materials[1] = mats[('mask', names[0])], hide; gp.hide_render = False   # its wood and the proxy's cards
      sc.view_settings.view_transform = 'Raw'; sc.render.film_transparent = True; path = ROOT / 'art/qa/foliage-build' / f'imp_{o.name}_cast.png'; sc.render.filepath = str(path)
      bpy.ops.render.render(write_still=True); cast = sq(read_rgba(path)[..., 3:4])[..., 0]; gp.hide_render = True
    col, row = i % 4, i // 4; ys, xs_ = row * 512, col * 256   # normal atlas: x, y (z rebuilt: the crown faces the camera), crown depth, leaf mask
    atlas_s[ys:ys + 512, xs_:xs_ + 256] = cast
    atlas[ys:ys + 512, xs_:xs_ + 256] = np.concatenate([srgb(alb), A[..., None]], 2); atlas_n[ys:ys + 512, xs_:xs_ + 256] = np.concatenate([nrm[..., :2] * .5 + .5, ao, np.clip(msk, .2, 1)], 2)
    log('IMPOSTOR', o.name, dims[o.name], 'depth p10/p50/p90 %.2f %.2f %.2f' % tuple(np.percentile(ao[(A > .5) & (msk[..., 0] > .6)], [10, 50, 90])))
  write(TEX / 'impostors.webp', atlas); write(TEX / 'impostors_n.webp', atlas_n); write(TEX / 'impostors_s.webp', np.repeat(atlas_s.reshape(256 * rows, 2, 512, 2).mean(axis=(1, 3))[..., None], 3, 2))   # normal xyz + leaf mask in alpha; what the card casts, in grey (lossy alpha would cost 4x)
  write(ROOT / 'art/qa/foliage-build/impostors_preview.png', np.concatenate([atlas[..., :3] * atlas[..., 3:] + np.array((.55, .7, .9)) * (1 - atlas[..., 3:]), np.ones_like(atlas[..., :1])], 2))
  REPORT['impostors'] = dims
  kinds = {}
  for name, d in DIMS.items():
    if not name.startswith('bush'): kinds.setdefault(name.rstrip('0123456789'), []).append(d)
  tree_dims = {k: [round(sum(d[i] for d in v) / len(v), 2) for i in range(4)] for k, v in kinds.items()}; REPORT['dims'] = tree_dims
  (ROOT / 'src/impostors.js').write_text('// Generated by tools/build-trees.py: impostor card per variant, [width, height, bottom] in metres at scale 1, atlas cell\n'
    f'// (256 x 512 cells of assets/textures/foliage/impostors.webp, 4 across, {rows} rows, row 0 at the top).\nexport const IMPOSTOR = ' + json.dumps(dims, separators=(', ', ': ')) + f';\nexport const IMPOSTOR_ROWS = {rows};\n'
    '// Physics record per species at scale 1, averaged over its variants: trunk radius at ~1 m, the height the disc can hit the trunk\n'
    '// to, crown centre height (the leaves\' mean height) and crown radius (between the crown\'s half-width and half-height).\nexport const TREE_DIMS = ' + json.dumps(tree_dims, separators=(', ', ': ')) + ';\n')

def area_x(a, w):
  """Exact box resample along x to width w (cumulative sums), for premultiplied data."""
  h, W0, c = a.shape; cs = np.concatenate([np.zeros((h, 1, c)), np.cumsum(a, axis=1)], 1)
  e = np.arange(w + 1) * W0 / w; i = np.minimum(np.floor(e).astype(int), W0); f = (e - i)[None, :, None]
  C = cs[:, i] + f * a[:, np.minimum(i, W0 - 1)] * (i < W0)[None, :, None]
  return (C[:, 1:] - C[:, :-1]) * (w / W0)

def bleed(rgb, alpha, iters=24):
  """Grow colour outward from covered texels so bilinear taps and mips outside the silhouette sample tree colour, not black."""
  rgb = rgb.copy(); filled = alpha > .02
  for _ in range(iters):
    acc = np.zeros_like(rgb); cnt = np.zeros(alpha.shape)
    for dy in (-1, 0, 1):
      for dx in (-1, 0, 1):
        if dx == dy == 0: continue
        m = np.roll(np.roll(filled, dy, 0), dx, 1); acc += np.roll(np.roll(rgb, dy, 0), dx, 1) * m[..., None]; cnt += m
    grow_ = (~filled) & (cnt > 0); rgb[grow_] = acc[grow_] / cnt[grow_][:, None]; filled = filled | grow_
    if filled.all(): break
  if filled.any(): rgb[~filled] = rgb[filled].mean(axis=0)
  return rgb

def write(path, arr):
  h, w, c = arr.shape; spec = oiio.ImageSpec(w, h, c, 'uint8'); spec.attribute('oiio:UnassociatedAlpha', 1)
  if str(path).endswith('.webp'): spec.attribute('compression', 'webp:92')
  o = oiio.ImageOutput.create(str(path)); assert o, oiio.geterror(); assert o.open(str(path), spec), o.geterror()
  o.write_image(np.ascontiguousarray(np.clip(arr, 0, 1).astype(np.float32))); o.close()

def preview(objs, tag, mats):
  """Cycles lineup on a ground plane under a low sun behind the trees (the tee shot's light), for eyeballing structure."""
  PREVIEW.mkdir(parents=True, exist_ok=True); sc = bpy.context.scene; sc.render.engine = 'CYCLES'
  prefs = bpy.context.preferences.addons['cycles'].preferences
  try:
    prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
    for d in prefs.devices: d.use = d.type == 'OPTIX'
    sc.cycles.device = 'GPU'
  except Exception: pass
  sc.cycles.samples = 48; sc.cycles.use_denoising = True; sc.render.resolution_x = 1600; sc.render.resolution_y = 800; sc.view_settings.view_transform = 'AgX'
  w = bpy.data.worlds.new('sky'); sc.world = w; wt = node_tree(w)
  bg = wt.nodes.get('Background') or wt.nodes.new('ShaderNodeBackground')
  if not bg.outputs['Background'].links: wt.links.new(bg.outputs['Background'], (wt.nodes.get('World Output') or wt.nodes.new('ShaderNodeOutputWorld')).inputs['Surface'])
  bg.inputs['Color'].default_value = (.45, .6, .85, 1); bg.inputs['Strength'].default_value = .8
  for side, az in (('back', 0.), ('side', 1.6)):
    sun_d = bpy.data.lights.new('sun', 'SUN'); sun_d.energy = 4.5; sun_d.angle = .03; sun = bpy.data.objects.new('sun', sun_d); bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(90 - 19), 0, math.pi + az)   # 19 deg elevation; 'back' puts it behind the trees
    g = bpy.data.meshes.new('ground'); g.from_pydata([(-80, -60, 0), (80, -60, 0), (80, 80, 0), (-80, 80, 0)], [], [(0, 1, 2, 3)]); go = bpy.data.objects.new('ground', g); bpy.context.collection.objects.link(go)
    gm = bpy.data.materials.new('groundm'); node_tree(gm).nodes['Principled BSDF'].inputs['Base Color'].default_value = (.12, .15, .06, 1); g.materials.append(gm)
    for o in bpy.context.scene.objects:
      if o.type == 'MESH' and o.name != 'ground': o.hide_render = o not in objs
    for i, o in enumerate(objs): o.location = (i * 13 - 13 * (len(objs) - 1) / 2, 0, 0)
    cd = bpy.data.cameras.new('cam'); cd.lens = 32; cam = bpy.data.objects.new('cam', cd); bpy.context.collection.objects.link(cam); sc.camera = cam
    cam.location = (0, -48, 2.2); cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = (Vector((0, 0, 9)) - cam.location).to_track_quat('-Z', 'Y')
    sc.render.filepath = str(PREVIEW / f'trees-{tag}-{side}.png'); bpy.ops.render.render(write_still=True)
    for ob in (sun, go, cam): bpy.data.objects.remove(ob)
  for o in objs: o.location = (0, 0, 0)

def node_tree(idb):   # materials and worlds always carry nodes in Blender 5; older builds need use_nodes
  try: idb.use_nodes = True
  except Exception: pass
  return idb.node_tree

def materials():
  def img(name):
    p = TEX / name if (TEX / name).exists() else ROOT / 'assets/textures' / name
    return bpy.data.images.load(str(p))
  out = {}
  for name, file in (('bark', 'bark.jpg'), ('bark_birch', 'bark_birch.webp'), ('leaves', 'leaves.webp')):
    m = bpy.data.materials.new(name); nt = node_tree(m); bsdf = nt.nodes['Principled BSDF']
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img(file); vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    mul = nt.nodes.new('ShaderNodeVectorMath'); mul.operation = 'MULTIPLY'; occ = nt.nodes.new('ShaderNodeVectorMath'); occ.operation = 'SCALE'
    nt.links.new(tx.outputs['Color'], mul.inputs[0]); nt.links.new(vc.outputs['Color'], mul.inputs[1]); nt.links.new(mul.outputs['Vector'], occ.inputs[0])
    nt.links.new(vc.outputs['Alpha'], occ.inputs['Scale']); nt.links.new(occ.outputs['Vector'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = .8
    if name == 'leaves': nt.links.new(tx.outputs['Alpha'], bsdf.inputs['Alpha'])
    out[name] = m
  return out

bpy.ops.wm.read_factory_settings(use_empty=True)
M = materials(); rng = random.Random(7)
W = lambda t: (M[t.bark], M['leaves'])
# stems bow and differ in girth variant to variant (g20 trees: "repeated identical straight trunks" behind the arch); the spruces
# are a tall narrow spire and a squat broad cone ("conifers near-identical copies in uniform rows")
dec = [finish(t, W(t)) for t in (birch(rng, 'birch0', 17., 0., .23, .045, .25), birch(rng, 'birch1', 18.5, .05, .32, -.055, -.2), broadleaf(rng, 'broad0', 15., 5.2, .34, .5, .035, .3), broadleaf(rng, 'broad1', 13.5, 5.8, .3, .6, -.04, -.4))]
pin = [finish(t, W(t)) for t in (spruce(rng, 'spruce0', 21.5, 3.1, lop=(.22, .4)), spruce(rng, 'spruce1', 16., 3.6, .14, lop=(.3, 2.6)), scots(rng, 'scots0', 21., .41, .4, .05, .035, .06), scots(rng, 'scots1', 19., .38, .5, .09, -.05, .08), scots(rng, 'scots2', 22.5, .44, .64, .02, .06, .12))]
bsh = [finish(t, W(t)) for t in (bush(rng, 'bush0'), bush(rng, 'bush1'))]
if PREVIEW: preview(dec, 'deciduous', M); preview(pin, 'pine', M); preview(bsh, 'bush', M)
export('deciduous', dec); export('pine', pin + [SHADOWS[o.name] for o in pin if o.name in SHADOWS]); export('bush', bsh)
if not MODELS_ONLY: impostors(dec + pin + bsh[:1])   # cells 0-9: birch0 birch1 broad0 broad1 spruce0 spruce1 scots0 scots1 scots2 bush0
if not MODELS_ONLY: (OUT / 'trees-build-report.json').write_text(json.dumps(REPORT, indent=2) + '\n')
log('TREES_DONE')
