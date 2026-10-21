"""Modelled athlete hands (assets/models/grip-hand.glb): the backhand grip round a 21 cm disc and the free hand at rest.

  blender -b -P tools/build-grip-hand.py -- [--out assets/models/grip-hand.glb] [--preview art/qa/hand]

The procedural tube hand (src/gltf-player.js gripHand) lost every tee verdict as "a mitten", "a clay lump", "a fist": tubes
pushed into an ellipse have no webbing, no thenar, no knuckle heads, so at 120 px they fuse. This builds one closed surface
instead: a signed distance field of palm (cupped, arched across the metacarpals), thenar and hypothenar pads, knuckle heads,
four three-phalanx fingers (round cones with slimmer shafts than joints) and a thumb, each digit blended into the palm
(webbing) but never into its neighbour (a crease stays between them). Surface nets mesh it at 0.8 mm, Blender's collapse
decimates it to ~2.6k / ~0.9k triangles, and the field itself gives the vertex occlusion (with the disc as an occluder for
the grip), knuckle creases and nails. The grip also carries an "open" morph (the fingers hinged out to the rest curls) so the
hand can let go after release with the same vertices.

Frame: gripHand's hand-local metres for a 19 cm hand (the game scales by the body's own hand length): wrist joint at the
origin, fingers along -y, palm facing -x, thumb toward -z, right hand. The disc sits where gltf-player.js seats it (GRIP
rim/tilt/press) less main.js's GRIP_SINK, so the fingers wrap the rim the tee camera actually sees.
"""
import bpy, numpy as np, sys, os, json, struct, math

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
arg = lambda k, d=None: argv[argv.index(k) + 1] if k in argv else d
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, arg('--out', 'assets/models/grip-hand.glb'))
PREVIEW = arg('--preview'); PREVIEW = PREVIEW and os.path.join(ROOT, PREVIEW)
VOX = float(arg('--vox', '.0008'))

# ---- the disc, as gltf-player.js seats it -----------------------------------------------------------------------------------
TILT = .6; C = np.array([-.015, -.092, 0.])
EO = np.array([math.cos(TILT), -math.sin(TILT), 0.])     # in the plate, from the disc centre out to the gripped rim
NRM = np.array([math.sin(TILT), math.cos(TILT), 0.])     # the plate's top
ZZ = np.array([0., 0., 1.])
D = C - (.105 - .003) * EO + np.array([0, 0, -.006]) - .012 * NRM   # seat, then sunk 1.2 cm (main.js GRIP_SINK)
P = lambda u, h, z=0.: D + u * EO + h * NRM + z * ZZ
# tools/build-disc.py: the top from the centre out over the wing, then under the rim
TOP = [(0, .0192), (.024, .0189), (.048, .0180), (.058, .0173), (.068, .0162), (.078, .0147), (.084, .0132), (.090, .0110),
       (.095, .0082), (.099, .0052), (.1025, .0018), (.1045, -.0022), (.1050, -.0065)]
UNDER = [(.1050, -.0065), (.1042, -.0105), (.1018, -.0138), (.0982, -.0158), (.0940, -.0164), (.0895, -.0155), (.0862, -.0132),
         (.0842, -.0098), (.0832, -.0058), (.0830, -.0015), (.0836, .0022), (.0700, .0048), (.0500, .0062), (.0300, .0070), (0, .0074)]
htop = lambda u: float(np.interp(u, [a for a, _ in TOP], [b for _, b in TOP]))

# ---- poses -----------------------------------------------------------------------------------------------------------------
# fingers: knuckle (MCP centre), phalanx lengths, radii at MCP / PIP / DIP / tip (gltf-player.js GRIP, a touch fuller)
FINGERS = [([.002, -.098, -.028], [.042, .025, .020], [.0095, .0088, .0078, .0066]),
           ([.002, -.100, -.009], [.046, .028, .021], [.0099, .0092, .0081, .0069]),
           ([.002, -.098, .0095], [.043, .026, .021], [.0094, .0087, .0077, .0065]),
           ([.001, -.091, .0265], [.035, .021, .018], [.0083, .0076, .0068, .0058])]
# curls (degrees toward the palm at MCP, PIP, DIP): the proximal phalanx runs down outside the rim's wing, the middle one turns
# in under the rim, the distal one rises into the cavity under the flight plate (worked in the disc's own section)
GRIP_CURL = [[50, 86, 58], [53, 84, 60], [56, 84, 60], [60, 86, 60]]
REST_CURL = [[26, 40, 20], [30, 46, 24], [34, 52, 28], [38, 58, 30]]   # gltf-player.js REST
REST_FALL = .22
THUMB_R = [.0135, .0122, .0112, .0100, .0086]
def grip_thumb():   # CMC and MCP inside the thenar as before, then the pad laid along the top of the plate toward its centre
  mcp = np.array([-.013, -.058, -.043]); ip = P(.060, htop(.060) + .0092, -.034); tip = P(.037, htop(.037) + .0082, -.026)
  return [np.array([-.003, -.012, -.022]), np.array([-.007, -.030, -.033]), mcp, ip, tip]
REST_THUMB = [np.array(v) for v in [[-.003, -.012, -.022], [-.007, -.03, -.033], [-.013, -.058, -.043], [-.016, -.079, -.045], [-.019, -.103, -.04]]]

def finger_pts(f, curl, fall=0.):
  kn, ln, r = FINGERS[f]; mcp = np.array(kn, float); pts = [mcp + [0, .018, 0], mcp.copy()]; ang = 0.; at = mcp.copy()
  for j in range(3):
    ang += math.radians(curl[j]); at = at + np.array([-math.sin(ang), -math.cos(ang), 0]) * (ln[j] - (r[3] if j == 2 else 0)); pts.append(at.copy())
  for j in range(2, 5): pts[j][2] *= 1 - fall * (j - 1) / 3
  return pts, [r[0], r[0], r[1], r[2], r[3]]

def pose(kind):
  curl, fall = (GRIP_CURL, 0.) if kind == 'grip' else (REST_CURL, REST_FALL)
  fingers = [finger_pts(f, curl[f], fall) for f in range(4)]
  if kind == 'grip':   # fingertips gather a little toward the middle finger round the curved rim
    for pts, _ in fingers:
      for j in range(2, 5): pts[j][2] = pts[j][2] * (1 - .05 * (j - 1)) - .002 * (j - 1)
  return fingers, (grip_thumb() if kind == 'grip' else [v.copy() for v in REST_THUMB])

# ---- signed distance pieces (vectorised over (n, 3) points) ----------------------------------------------------------------
def smin(a, b, k):
  h = np.maximum(k - np.abs(a - b), 0) / k; return np.minimum(a, b) - h * h * k * .25
def round_cone(p, a, b, r1, r2, waist=0.):   # iq's exact round cone, plus a slimmer shaft between the joints
  ba = b - a; l2 = ba @ ba; rr = r1 - r2; a2 = l2 - rr * rr; il2 = 1 / l2
  pa = p - a; y = pa @ ba; z = y - l2
  x2 = ((pa * l2 - np.outer(y, ba)) ** 2).sum(1); y2 = y * y * l2; z2 = z * z * l2; k = np.sign(rr) * rr * rr * x2
  d = np.where(np.sign(z) * a2 * z2 > k, np.sqrt(x2 + z2) * il2 - r2,
      np.where(np.sign(y) * a2 * y2 < k, np.sqrt(x2 + y2) * il2 - r1, (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1))
  if waist: d = d + waist * np.sin(np.pi * np.clip(y * il2, 0, 1))
  return d
def chain(p, pts, radii, waist):
  d = None
  for i in range(1, len(pts)):
    s = round_cone(p, pts[i - 1], pts[i], radii[i - 1], radii[i], waist if i > 1 else 0)
    d = s if d is None else smin(d, s, .0025)
  return d
def ellipsoid(p, c, r):
  q = (p - c) / r; k0 = np.linalg.norm(q, axis=1); k1 = np.linalg.norm(q / r, axis=1); return k0 * (k0 - 1) / np.maximum(k1, 1e-9)
def rbox2(x, z, b, a, r):   # rounded rectangle, half sizes b (x) and a (z), corner radius r
  qx = np.abs(x) - (b - r); qz = np.abs(z) - (a - r)
  return np.hypot(np.maximum(qx, 0), np.maximum(qz, 0)) + np.minimum(np.maximum(qx, qz), 0) - r
# the palm: (y, half width along z, half thickness along x), cupped (its sides lean palmward) and arched across the metacarpals
PALM = [(.012, .027, .0185), (0, .0285, .0185), (-.025, .0335, .0180), (-.055, .0380, .0163), (-.080, .0405, .0153), (-.096, .0405, .0148)]
WRIST = (.0265, .0190)   # the stub's half sizes (z, x) at k = 1; the game refits them to the measured forearm
def palmish(p, fingers):
  x, y, z = p[:, 0], p[:, 1], p[:, 2]; ys = [v[0] for v in PALM][::-1]
  a = np.interp(y, ys, [v[1] for v in PALM][::-1]); b = np.interp(y, ys, [v[2] for v in PALM][::-1])
  cz = np.interp(y, [-.1, -.03, .0], [-.0015, -.001, 0]); zz = z - cz
  xx = x + 5.5 * zz * zz * np.clip(-y / .06, 0, 1)
  d2 = rbox2(xx, zz, b, a, .8 * b)
  kz = [FINGERS[f][0][2] for f in range(4)]; ky = [FINGERS[f][0][1] for f in range(4)]
  yend = np.interp(z, kz, ky) + .002
  wy = np.maximum(yend - y, y - .03)
  d = np.minimum(np.maximum(d2, wy), 0) + np.hypot(np.maximum(d2, 0), np.maximum(wy, 0))
  # the wrist: an oval stub up into the forearm
  ws = np.maximum(np.sqrt((x / WRIST[1]) ** 2 + (z / WRIST[0]) ** 2) - 1, -1) * min(WRIST)
  d = smin(d, np.maximum(ws, np.maximum(-.012 - y, y - .045)), .012)
  d = smin(d, ellipsoid(p, np.array([-.011, -.040, -.026]), np.array([.0115, .026, .0155])), .010)   # thenar
  d = smin(d, ellipsoid(p, np.array([-.008, -.055, .027]), np.array([.0095, .030, .0105])), .010)   # hypothenar
  for f in range(4):   # knuckle heads on the back of the hand
    kn = np.array(FINGERS[f][0]); d = smin(d, np.linalg.norm(p - (kn + [.0045, .002, 0]), axis=1) - FINGERS[f][2][0] * .92, .006)
  return d
def parts(p, kind):
  fingers, thumb = pose(kind)
  base = palmish(p, fingers)
  fs = [chain(p, pts, [r * .95 for r in radii], .0007) for pts, radii in fingers]
  th = chain(p, thumb, THUMB_R, .0006)
  return base, fs, th, fingers, thumb
def field(p, kind):
  base, fs, th, _, _ = parts(p, kind)
  d = smin(base, th, .009)
  for s in fs: d = np.minimum(d, smin(base, s, .007))   # each digit webs into the palm, never into its neighbour
  return d

def disc_sdf(p):   # the disc as an occluder: the plate and the rim's section, revolved
  q = p - D; h = q @ NRM; u = np.linalg.norm(q - np.outer(h, NRM), axis=1)
  def box(u0, u1, h0, h1):
    du = np.maximum(u0 - u, u - u1); dh = np.maximum(h0 - h, h - h1)
    return np.minimum(np.maximum(du, dh), 0) + np.hypot(np.maximum(du, 0), np.maximum(dh, 0))
  return np.minimum(box(0, .084, .005, np.interp(u, [a for a, _ in TOP], [b for _, b in TOP])), box(.083, .105, -.0164, .006)) - .0015

# ---- surface nets ----------------------------------------------------------------------------------------------------------
def mesh_field(kind):
  lo, hi = np.array([-.08, -.17, -.08]), np.array([.045, .05, .06])
  n = np.ceil((hi - lo) / VOX).astype(int) + 1
  gx, gy, gz = [lo[i] + np.arange(n[i]) * VOX for i in range(3)]
  F = np.empty(n, np.float32)
  for i in range(n[0]):   # slab by slab keeps the temporaries small
    yy, zz = np.meshgrid(gy, gz, indexing='ij'); pts = np.stack([np.full(yy.size, gx[i]), yy.ravel(), zz.ravel()], 1)
    F[i] = field(pts, kind).reshape(yy.shape)
  s = F < 0
  cells = tuple(n - 1)
  corners = [(i, j, k) for i in (0, 1) for j in (0, 1) for k in (0, 1)]
  cv = [F[i:i + cells[0], j:j + cells[1], k:k + cells[2]] for i, j, k in corners]
  cs = [c < 0 for c in cv]
  anyin = np.logical_or.reduce(cs); allin = np.logical_and.reduce(cs); active = anyin & ~allin
  acc = np.zeros(cells + (3,), np.float32); cnt = np.zeros(cells, np.float32)
  for a in range(8):
    for b in range(a + 1, 8):
      if sum(abs(corners[a][t] - corners[b][t]) for t in range(3)) != 1: continue
      fa, fb = cv[a], cv[b]; cr = (fa < 0) != (fb < 0)
      t = np.where(cr, fa / np.where(cr, fa - fb, 1), 0)
      for ax in range(3): acc[..., ax] += np.where(cr, corners[a][ax] + t * (corners[b][ax] - corners[a][ax]), 0)
      cnt += cr
  idx = np.argwhere(active); vid = -np.ones(cells, np.int64); vid[active] = np.arange(len(idx))
  verts = lo + (idx + acc[active] / cnt[active][:, None]) * VOX
  quads = []
  for d, (e1, e2) in enumerate([(1, 2), (2, 0), (0, 1)]):
    sl = [slice(None)] * 3; sl[d] = slice(0, n[d] - 1); a = s[tuple(sl)]
    sl[d] = slice(1, n[d]); b = s[tuple(sl)]
    ch = a != b
    lim = [slice(None)] * 3; lim[e1] = slice(1, n[e1] - 1); lim[e2] = slice(1, n[e2] - 1)
    m = np.zeros_like(ch); m[tuple(lim)] = ch[tuple(lim)]
    E = np.argwhere(m); q = []
    for o1, o2 in ((1, 1), (0, 1), (0, 0), (1, 0)):
      c = E.copy(); c[:, e1] -= o1; c[:, e2] -= o2; q.append(vid[c[:, 0], c[:, 1], c[:, 2]])
    q = np.stack(q, 1); flip = ~a[E[:, 0], E[:, 1], E[:, 2]]
    q[flip] = q[flip][:, ::-1]   # inside at the low end: the face looks along +d
    quads.append(q)
  quads = np.concatenate(quads)
  # pull each vertex onto the zero set (two Newton steps on the field)
  for _ in range(2):
    e = 2e-4; f0 = field(verts, kind)
    g = np.stack([(field(verts + np.eye(3)[i] * e, kind) - f0) / e for i in range(3)], 1)
    verts = verts - (f0 / np.maximum((g * g).sum(1), 1e-6))[:, None] * g
  return verts, quads

# ---- Blender: decimate -----------------------------------------------------------------------------------------------------
def decimate(verts, quads, tris, name):
  me = bpy.data.meshes.new(name); me.from_pydata(verts.tolist(), [], quads.tolist()); me.validate()
  ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
  for o in bpy.context.scene.objects: o.select_set(False)
  bpy.context.view_layer.objects.active = ob; ob.select_set(True)
  mod = ob.modifiers.new('tri', 'TRIANGULATE')
  bpy.ops.object.modifier_apply(modifier=mod.name)
  have = len(ob.data.polygons)
  mod = ob.modifiers.new('dec', 'DECIMATE'); mod.ratio = tris / have; mod.use_collapse_triangulate = True
  bpy.ops.object.modifier_apply(modifier=mod.name)
  mod = ob.modifiers.new('tri', 'TRIANGULATE'); bpy.ops.object.modifier_apply(modifier=mod.name)
  me = ob.data; v = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', v)
  f = np.empty(len(me.polygons) * 3, np.int64); me.polygons.foreach_get('vertices', f)
  return ob, v.reshape(-1, 3), f.reshape(-1, 3)

def normals(v, f):
  n = np.zeros_like(v); fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
  for k in range(3): np.add.at(n, f[:, k], fn)
  return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)

def seg_proj(p, pts):   # nearest point on a polyline: arc length, foot, segment index
  cum = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
  best = np.full(len(p), 1e9); arc = np.zeros(len(p)); foot = np.zeros_like(p); seg = np.zeros(len(p), int)
  for s in range(1, len(pts)):
    ab = pts[s] - pts[s - 1]; t = np.clip(((p - pts[s - 1]) @ ab) / (ab @ ab), 0, 1); c = pts[s - 1] + np.outer(t, ab)
    d = np.linalg.norm(p - c, axis=1); m = d < best
    best[m] = d[m]; arc[m] = cum[s - 1] + t[m] * np.linalg.norm(ab); foot[m] = c[m]; seg[m] = s
  return arc, foot, seg, cum

def shade(v, f, kind):
  """Vertex occlusion from the field (and the disc, for the grip), knuckle creases, nails: 1 open skin, < 1 occluded
  (the shader reddens creases), 1.16 a nail."""
  n = normals(v, f)
  occ = (lambda q: np.minimum(field(q, kind), disc_sdf(q))) if kind == 'grip' else (lambda q: field(q, kind))
  ao = np.zeros(len(v))
  for i, (dd, w) in enumerate([(.0015, 1.), (.003, .8), (.0055, .6), (.009, .45), (.014, .3), (.02, .2)]):
    ao += w * np.maximum(dd - occ(v + n * dd), 0) / dd
  ao = np.clip(1 - .55 * ao, .3, 1)
  base, fs, th, fingers, thumb = parts(v, kind)
  owner = np.argmin(np.stack([base + .002] + fs + [th], 1), 1)   # 0 palm, 1..4 fingers, 5 thumb
  for fi, (pts, radii) in enumerate(fingers):
    m = owner == fi + 1; P_ = np.array(pts)
    arc, foot, seg, cum = seg_proj(v[m], P_)
    crease = np.zeros(m.sum())
    for j, wdt, amt in [(2, .0032, 1.), (3, .0028, 1.), (1, .004, .6)]:
      crease = np.maximum(crease, amt * np.exp(-((arc - cum[j]) / wdt) ** 2))
    a = ao[m] * (1 - .30 * crease)
    T = P_[-1] - P_[-2]; T /= np.linalg.norm(T); Dv = np.array([-T[1], T[0], 0]); Dv /= np.linalg.norm(Dv)
    rel = v[m] - foot; rel /= np.maximum(np.linalg.norm(rel, axis=1, keepdims=True), 1e-9)
    nail = (arc > cum[3] + .35 * (cum[4] - cum[3])) & (rel @ Dv > .35)
    a[nail] = np.maximum(a[nail], 1.16); ao[m] = a
  m = owner == 5; P_ = np.array(thumb); arc, foot, seg, cum = seg_proj(v[m], P_)
  a = ao[m] * (1 - .28 * np.exp(-((arc - cum[3]) / .0032) ** 2))
  dors = NRM if kind == 'grip' else np.array([.45, 0, -.9])
  T = P_[-1] - P_[-2]; T /= np.linalg.norm(T); Dv = dors - T * (dors @ T); Dv /= np.linalg.norm(Dv)
  rel = v[m] - foot; rel /= np.maximum(np.linalg.norm(rel, axis=1, keepdims=True), 1e-9)
  nail = (arc > cum[3] + .45 * (cum[4] - cum[3])) & (rel @ Dv > .3); a[nail] = np.maximum(a[nail], 1.16); ao[m] = a
  return ao, owner

def rot_z(p, o, ang):   # ang: one angle per point
  c, s = np.cos(ang), np.sin(ang); q = p - o
  return o + np.stack([q[:, 0] * c - q[:, 1] * s, q[:, 0] * s + q[:, 1] * c, q[:, 2]], 1)
def smoothstep(a, b, x):
  t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def open_shape(v, owner):
  """The grip's fingers hinged out to the rest curls (distal joints first, each blended over 8 mm) and the thumb swung off
  the plate along the index: the hand letting go after release, same vertices."""
  out = v.copy(); fingers, thumb = pose('grip')
  for fi, (pts, _) in enumerate(fingers):
    m = owner == fi + 1; q = out[m]; P_ = np.array(pts)
    arc, _, _, cum = seg_proj(v[m], P_)
    for j in (3, 2, 1):   # DIP, PIP, MCP: pts index j is the joint
      d = math.radians(REST_CURL[fi][j - 1] - GRIP_CURL[fi][j - 1])
      q = rot_z(q, P_[j], -d * smoothstep(cum[j] - .008, cum[j] + .008, arc))
    out[m] = q
  m = owner == 5
  if m.any():
    P_ = np.array(thumb); arc, _, _, cum = seg_proj(v[m], P_); mcp = P_[2]
    a = P_[4] - mcp; a /= np.linalg.norm(a); b = REST_THUMB[4] - REST_THUMB[2]; b /= np.linalg.norm(b)
    ax = np.cross(a, b); s = np.linalg.norm(ax); ang = math.atan2(s, a @ b); ax = ax / max(s, 1e-9)
    t = ang * smoothstep(cum[2] - .01, cum[2] + .01, arc); q = v[m] - mcp; c, sn = np.cos(t)[:, None], np.sin(t)[:, None]
    out[m] = mcp + q * c + np.cross(ax, q) * sn + np.outer(q @ ax, ax) * (1 - c)   # Rodrigues about ax
  return out

# ---- glb ---------------------------------------------------------------------------------------------------------------------
def write_glb(path, meshes):
  bin_ = bytearray(); views, accs, gm, nodes = [], [], [], []
  def add(arr, comp, typ, target=None, minmax=False):
    data = arr.tobytes(); off = len(bin_); bin_.extend(data); bin_.extend(b'\0' * (-len(bin_) % 4))
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data), **({'target': target} if target else {})})
    acc = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(arr), 'type': typ}
    if minmax: acc['min'] = arr.min(0).tolist(); acc['max'] = arr.max(0).tolist()
    accs.append(acc); return len(accs) - 1
  for name, m in meshes.items():
    prim = {'attributes': {'POSITION': add(m['p'].astype(np.float32), 5126, 'VEC3', 34962, True),
                           'COLOR_0': add(np.repeat((m['ao'] / 1.2)[:, None], 3, 1).astype(np.float32), 5126, 'VEC3', 34962)},
            'indices': add(m['i'].astype(np.uint16 if len(m['p']) < 65536 else np.uint32).ravel(), 5123 if len(m['p']) < 65536 else 5125, 'SCALAR', 34963)}
    mesh = {'name': name, 'primitives': [prim]}
    if 'open' in m:
      prim['targets'] = [{'POSITION': add((m['open'] - m['p']).astype(np.float32), 5126, 'VEC3', None, True)}]; mesh['weights'] = [0]
      mesh['extras'] = {'targetNames': ['open']}
    gm.append(mesh); nodes.append({'name': name, 'mesh': len(gm) - 1})
  doc = {'asset': {'version': '2.0', 'generator': 'tools/build-grip-hand.py'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}],
         'nodes': nodes, 'meshes': gm, 'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}]}
  js = json.dumps(doc, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
  with open(path, 'wb') as fh:
    fh.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
    fh.write(struct.pack('<II', len(js), 0x4E4F534A)); fh.write(js); fh.write(struct.pack('<II', len(bin_), 0x004E4942)); fh.write(bin_)

# ---- preview -----------------------------------------------------------------------------------------------------------------
def preview(obs, folder):
  os.makedirs(folder, exist_ok=True)
  sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'VERTEX'
  sc.render.resolution_x = sc.render.resolution_y = 520; sc.render.film_transparent = False
  # the disc, lathed
  prof = TOP + UNDER[1:]; seg = 72; vs, fs = [], []
  for (r, h) in prof:
    for i in range(seg):
      a = i * math.tau / seg; e1 = EO; e2 = np.cross(NRM, EO)
      vs.append((D + r * (math.cos(a) * e1 + math.sin(a) * e2) + h * NRM).tolist())
  for k in range(len(prof) - 1):
    for i in range(seg): fs.append([k * seg + i, k * seg + (i + 1) % seg, (k + 1) * seg + (i + 1) % seg, (k + 1) * seg + i])
  me = bpy.data.meshes.new('disc'); me.from_pydata(vs, [], fs); disc = bpy.data.objects.new('disc', me); sc.collection.objects.link(disc)
  cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 85
  target = np.array([-.02, -.085, -.004])
  views = {'outside': EO * .30 + NRM * .12 + ZZ * .05, 'back': np.array([.30, .02, .06]), 'thumb': np.array([.02, .10, -.30]), 'above': NRM * .32 + EO * .05, 'under': -NRM * .28 + EO * .12}
  for ob in obs:
    for o in obs: o.hide_render = o is not ob
    disc.hide_render = not ob.name.startswith('grip')
    for vname, off in views.items():
      pos = target + off; cam.location = pos.tolist()
      d = target - pos; cam.rotation_mode = 'QUATERNION'
      from mathutils import Vector
      cam.rotation_quaternion = Vector(d.tolist()).to_track_quat('-Z', 'Y')
      sc.render.filepath = os.path.join(folder, f'{ob.name}-{vname}.png'); bpy.ops.render.render(write_still=True)

# ---- build -------------------------------------------------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
meshes, obs = {}, []
for kind in ('grip', 'rest'):
  verts, quads = mesh_field(kind); print(kind, 'surface nets', len(verts), 'verts', len(quads), 'quads')
  for suffix, tris in (('', 2600), ('_lod', 900)):
    ob, v, f = decimate(verts, quads, tris, kind + suffix)
    ao, owner = shade(v, f, kind)
    m = {'p': v, 'i': f, 'ao': ao}
    if kind == 'grip': m['open'] = open_shape(v, owner)
    meshes[kind + suffix] = m; print(kind + suffix, len(v), 'verts', len(f), 'tris')
    col = ob.data.color_attributes.new('ao', 'FLOAT_COLOR', 'POINT')
    col.data.foreach_set('color', np.concatenate([np.clip(ao, 0, 1)[:, None].repeat(3, 1), np.ones((len(ao), 1))], 1).ravel())
    obs.append(ob)
write_glb(OUT, meshes); print('wrote', OUT, os.path.getsize(OUT), 'bytes')
if PREVIEW: preview([o for o in obs if not o.name.endswith('_lod')] + [o for o in obs if o.name == 'grip_lod'], PREVIEW)
