# Fitted headwear for both athletes, built on each figure's real skull and hair in Blender.
#   blender --background --python tools/build-headwear.py -- [--out assets/models/headwear.glb] [--preview art/qa-headwear]
# For each figure (assets/models/golfer.glb, golfer-f.glb) the head's surface is ray-cast from a point inside the skull
# over a grid of directions; the radii are dilated (so sculpted hair locks never poke through) and blurred into an
# envelope, and every hat is grown from that envelope: a six-panel cap with a pre-curved bill, the same cap turned back,
# a visor, a cuffed rib-knit beanie, a bucket hat and a headband. Ambient occlusion against the head is baked into the
# vertex colours (plus the cap's panel seams and the beanie's ribs), so the runtime tints one material per hat. Meshes are
# named hw_<m|f>_<style> and sit in the body's bind space, the same space as src/player-headwear.js.
# Hat hair: his scan's hair is sculpted locks standing 1.5-3 cm off the scalp, and under a hat they stuck out at the temples,
# over the ears and at the nape as a ragged fringe as wide as the hat. tuck_field() finds, per direction from the skull
# centre, the base of his locks (the outer surface eroded and blurred where the mask says hair, the skin itself elsewhere);
# the covering hats are grown on the head with every lock pulled down onto it, and the field ships with the hats
# (node hw_m_tuck) so src/body-material.js pulls the same locks in while he wears one. Her hair is smooth sheets and a
# ponytail (which the tuck would fold into her skull), so she keeps her hair and her hats as they were.
import bpy, bmesh, sys, os, math, json, base64
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
arg = lambda k, d=None: argv[argv.index(k) + 1] if k in argv else d
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, arg('--out', 'assets/models/headwear.glb'))
PREVIEW = arg('--preview')
FIGURES = {'m': ('assets/models/golfer.glb', 'tools/golfer-rig.json', 'assets/textures/body/mask1.png'),
           'f': ('assets/models/golfer-f.glb', 'tools/golfer-f-rig.json', None)}   # no mask: no tuck
NPHI, NTH = 64, 22          # around the head, apex to rim (enough for a smooth crown at game distances)
DEG = math.pi / 180
TUCK_TH, TUCK_KEEP, TUCK_DEPTH = 151, .1, .006   # field rows (1 degree each, apex to 150), share of a lock kept, depth under the lock base

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
keep = []                   # finished hats, kept across figures

def rig_extras(path):
    j = json.load(open(os.path.join(ROOT, path)))
    e = j.get('extras', j.get('head', {}))
    return e

def skull_bvh(body, name='skull', moved=None):
    """A head-only copy of the body (head weight > .3), unskinned, as a BVH in world space; moved: new world positions."""
    me = body.data.copy(); ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob); ob.matrix_world = body.matrix_world
    if moved is not None:
        Mi = body.matrix_world.inverted()
        for v, p in zip(me.vertices, moved): v.co = Mi @ Vector(p)
    gi = body.vertex_groups['head'].index
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    dl = bm.verts.layers.deform.active
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[dl].get(gi, 0) < .3], context='VERTS')
    bm.to_mesh(me); bm.free()
    ob.modifiers.clear()
    dg = bpy.context.evaluated_depsgraph_get()
    return ob, BVHTree.FromObject(ob, dg)

def blur(A, sp, st):
    """Gaussian blur of a (phi, theta) grid: sp cells round the head (wrapping), st cells down it (edges held)."""
    g = lambda n, sd: (lambda x: np.exp(-.5 * (x / sd) ** 2) / np.exp(-.5 * (x / sd) ** 2).sum())(np.arange(-n, n + 1))
    n = int(3 * sp); A = sum(w * np.roll(A, k - n, 0) for k, w in enumerate(g(n, sp)))
    n = int(3 * st); P = np.pad(A, ((0, 0), (n, n)), 'edge'); kt = g(n, st)
    return np.stack([np.convolve(P[i], kt, 'valid') for i in range(A.shape[0])])

def tuck_field(body, bvh, C, mask_path):
    """T(phi, theta): the radius his locks are pulled down to. Where the outer surface is hair, the base of the locks (a
    min filter over ~17 degrees round and 10 down, wide enough to reach the skin past a fringe or a sideburn flap, blurred)
    6 mm deeper; where it is skin (face, ears, neck), the skin."""
    img = bpy.data.images.load(os.path.join(ROOT, mask_path)); W, H = img.size
    hair = np.array(img.pixels[:], np.float32).reshape(H, W, 4)[:, :, 3]; bpy.data.images.remove(img)
    hair = hair.reshape(H // 8, 8, W // 8, 8).mean((1, 3))   # a far mip's share: the mask's ragged edge is not the head's shape
    me, M = body.data, body.matrix_world; uv = me.uv_layers.active.data; hw = np.zeros(len(me.vertices))
    for li, l in enumerate(me.loops):
        u, v = uv[li].uv; hw[l.vertex_index] = max(hw[l.vertex_index], hair[min(H // 8 - 1, max(0, int(v * H / 8))), min(W // 8 - 1, max(0, int(u * W / 8)))])
    kd = KDTree(len(me.vertices))
    for v in me.vertices: kd.insert(M @ v.co, v.index)
    kd.balance()
    phis = np.linspace(0, 2 * math.pi, NPHI, endpoint=False); R = np.full((NPHI, TUCK_TH), np.nan); Hc = np.zeros((NPHI, TUCK_TH))
    for i, ph in enumerate(phis):
        for j in range(TUCK_TH):
            d = Envelope.dir(ph, j * DEG); hit = bvh.ray_cast(C + d * .5, -d, .5)
            if hit[0] is not None: R[i, j] = (hit[0] - C).length; Hc[i, j] = hw[kd.find(hit[0])[1]]
    for row in R:
        good = ~np.isnan(row); row[~good] = np.interp(np.flatnonzero(~good), np.flatnonzero(good), row[good])
    E = R.copy()
    for _ in range(3): E = np.minimum(E, np.minimum(np.roll(E, 1, 0), np.roll(E, -1, 0)))
    for _ in range(10): E = np.minimum(E, np.minimum(np.pad(E[:, 1:], ((0, 0), (0, 1)), 'edge'), np.pad(E[:, :-1], ((0, 0), (1, 0)), 'edge')))
    E = blur(E, 1.5, 4.)
    share = (Hc > .3).astype(float)   # every hair hit, the fringe's own edge too (a soft share left the flaps half-raised)
    return np.minimum(R, blur(np.minimum(R, R * (1 - share) + (E - TUCK_DEPTH) * share), 1., 2.))

def tuck_lookup(T, ph, th):
    i = (ph % (2 * math.pi)) / (2 * math.pi) * NPHI; i0 = int(i) % NPHI; i1 = (i0 + 1) % NPHI; fi = i - int(i)
    j = min(max(th / DEG, 0), TUCK_TH - 1.001); j0 = int(j); fj = j - j0
    return (T[i0, j0] * (1 - fi) + T[i1, j0] * fi) * (1 - fj) + (T[i0, j0 + 1] * (1 - fi) + T[i1, j0 + 1] * fi) * fj

def tucked(body, C, T):
    """World positions of the body with his locks pulled down onto T: along each ray from C, so overlapping scan layers keep
    their order (a per-vertex mask weight tore them into flakes). The same sum as the vertex shader in body-material.js."""
    gi = body.vertex_groups['head'].index; out = []
    for v in body.data.vertices:
        p = body.matrix_world @ v.co; w = min(1., next((g.weight for g in v.groups if g.group == gi), 0.) / .5)
        d = p - C; r = d.length; th = math.acos(max(-1., min(1., d.z / r))) if r > 0 else 0.
        if w > 0 and th < (TUCK_TH - 1) * DEG:
            t = tuck_lookup(T, math.atan2(d.y, d.x), th)
            if r > t: p = C + d / r * (r + (t + (r - t) * TUCK_KEEP - r) * w)
        out.append(tuple(p))
    return out

def tuck_node(fig, C, T):
    """The field for the runtime, as extras on an empty: glTF-space centre, rows of NPHI radii in units of 10 microns."""
    ob = bpy.data.objects.new(f'hw_{fig}_tuck', None); scene.collection.objects.link(ob)
    ob['tuck'] = json.dumps({'c': [round(C.x, 5), round(C.z, 5), round(-C.y, 5)], 'nphi': NPHI, 'nth': TUCK_TH, 'keep': TUCK_KEEP,
                             'r': base64.b64encode(np.round(T.T * 1e5).astype('<u2').tobytes()).decode()})
    return ob

class Envelope:
    """Radii r(phi, theta) of the head surface seen from C, dilated over hair locks and blurred."""
    def __init__(self, bvh, C):
        self.C = C
        self.phis = np.linspace(0, 2 * math.pi, NPHI, endpoint=False)
        self.ths = np.linspace(0, 150 * DEG, 151)
        R = np.zeros((NPHI, len(self.ths)))
        for i, ph in enumerate(self.phis):
            for j, th in enumerate(self.ths):
                d = self.dir(ph, th); hit = bvh.ray_cast(C + d * .5, -d, .5)
                R[i, j] = (hit[0] - C).length if hit[0] is not None else np.nan
        # holes (the neck opening, gaps in the scan): fill from neighbours along theta
        for i in range(NPHI):
            row = R[i]; good = ~np.isnan(row)
            row[~good] = np.interp(np.flatnonzero(~good), np.flatnonzero(good), row[good]) if good.any() else .1
        # dilate (3 cells round, 5 down the slope), then a wide Gaussian: one smooth envelope that rides over the locks,
        # never more than 3 mm inside the raw surface
        D = R.copy()
        for _ in range(3): D = np.maximum(D, np.maximum(np.roll(D, 1, 0), np.roll(D, -1, 0)))
        for _ in range(5): D = np.maximum(D, np.maximum(np.pad(D[:, 1:], ((0, 0), (0, 1)), 'edge'), np.pad(D[:, :-1], ((0, 0), (1, 0)), 'edge')))
        g = lambda n, sd: (lambda x: np.exp(-.5 * (x / sd) ** 2) / np.exp(-.5 * (x / sd) ** 2).sum())(np.arange(-n, n + 1))
        kp = g(9, 3.); D = sum(w * np.roll(D, k - 9, 0) for k, w in enumerate(kp))
        kt = g(21, 7.); P = np.pad(D, ((0, 0), (21, 21)), 'edge'); D = np.stack([np.convolve(P[i], kt, 'valid') for i in range(NPHI)])
        D = np.maximum(D, R - .003)
        self.R = D
    @staticmethod
    def dir(ph, th):   # phi = 90 deg faces +Y (the face); theta from straight up
        return Vector((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)))
    def radius(self, ph, th):
        i = (ph % (2 * math.pi)) / (2 * math.pi) * NPHI; i0 = int(i) % NPHI; i1 = (i0 + 1) % NPHI; fi = i - int(i)
        j = np.clip(th / (150 * DEG) * 150, 0, 149.999); j0 = int(j); fj = j - j0
        R = self.R
        return (R[i0, j0] * (1 - fi) + R[i1, j0] * fi) * (1 - fj) + (R[i0, j0 + 1] * (1 - fi) + R[i1, j0 + 1] * fi) * fj
    def point(self, ph, th, off=0.):
        d = self.dir(ph, th); return self.C + d * (self.radius(ph, th) + off)
    def theta_at(self, ph, z, off=0.):
        """theta where the offset surface crosses height z (walking down from the apex)."""
        prev = 0.
        for k in range(1, 1500):
            th = k * .1 * DEG
            if self.point(ph, th, off).z < z:
                a, b = prev, th
                for _ in range(20):
                    m = (a + b) / 2
                    if self.point(ph, m, off).z < z: b = m
                    else: a = m
                return (a + b) / 2
            prev = th
        return prev

def mesh_from_grid(name, rows, close_u=True, cols=None):
    """rows: list of rings (lists of Vectors), all the same length; quads between consecutive rings."""
    me = bpy.data.meshes.new(name); verts = [p for r in rows for p in r]; n = len(rows[0]); faces = []
    for j in range(len(rows) - 1):
        for i in range(n if close_u else n - 1):
            a = j * n + i; b = j * n + (i + 1) % n; c = (j + 1) * n + (i + 1) % n; d = (j + 1) * n + i
            faces.append((a, b, c, d))
    me.from_pydata([tuple(v) for v in verts], [], faces); me.update()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    if cols is not None:
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        for k, c in enumerate(cols): ca.data[k].color = (c, c, c, 1)
    for p in me.polygons: p.use_smooth = True
    return ob

def solidify(ob, t):
    m = ob.modifiers.new('solid', 'SOLIDIFY'); m.thickness = t; m.offset = -1; m.use_even_offset = True; m.use_quality_normals = True

def join(name, parts):
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    for p in parts:
        bpy.context.view_layer.objects.active = p
        for m in list(p.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join(); ob = bpy.context.active_object; ob.name = name; ob.data.name = name
    return ob

def base_height(ph, front, back):
    c = math.sin(ph)              # +1 at the face, -1 at the nape
    return back + (front - back) * (c + 1) / 2

def crown(env, name, front, back, off, *, lift=0., seams=0, ribs=0, flat_top=None, turn=0.):
    """Dome from the apex down to a rim at base_height(phi), offset off from the envelope."""
    rows, cols = [], []
    ths = [env.theta_at(ph, base_height(ph - turn, front, back), off) for ph in env.phis]
    for j in range(NTH + 1):
        t = j / NTH; ring = []
        for i, ph in enumerate(env.phis):
            th = ths[i] * t; p = env.point(ph, th, off + lift * 4 * t * (1 - t) * max(0, math.sin(ph - turn)))   # structured front panels stand a little proud
            if flat_top is not None and p.z > flat_top: p.z = flat_top + (p.z - flat_top) * .15
            ring.append(p)
            shade = 1.
            if seams:   # panel seams: a dark stitch line every 360/seams degrees, fading out at the apex button
                d = abs(((ph - turn - math.pi / 2 + math.pi / seams) % (2 * math.pi / seams)) - math.pi / seams)   # 0 on a seam (one runs up the centre front)
                shade *= 1 - .28 * math.exp(-(d * 40) ** 2) * min(1, t * 4)
            if ribs: shade *= .8 + .2 * (.5 + .5 * math.cos(ph * ribs))
            cols.append(shade)
        rows.append(ring)
    return mesh_from_grid(name, rows, cols=cols), ths

def band(env, name, lo_front, lo_back, height, off, ribs=0, shade=1.):
    rows, cols = [], []
    for k in range(5):
        ring = []
        for ph in env.phis:
            z = base_height(ph, lo_front, lo_back) + height * k / 4
            th = env.theta_at(ph, z, off); ring.append(env.point(ph, th, off))
            cols.append(shade * ((.8 + .2 * (.5 + .5 * math.cos(ph * ribs))) if ribs else 1))
        rows.append(ring)
    return mesh_from_grid(name, rows, cols=cols)

def bill(env, name, ths, front, back, off, length, curve, tilt, turn=0.):
    """Pre-curved bill from the crown rim, spanning +-78 degrees around the face (or the nape, turned)."""
    span = 78 * DEG; nu, nv = 33, 8; rows, cols = [], []
    fwd = Vector((math.cos(math.pi / 2 + turn), math.sin(math.pi / 2 + turn), 0))
    rim = lambda ph: env.point(ph, env.theta_at(ph, base_height(ph - turn, front, back), off), off)
    for v in range(nv + 1):
        s = v / nv; ring = []
        for u in range(nu):
            w = -1 + 2 * u / (nu - 1); ph = math.pi / 2 + turn + w * span
            p = rim(ph).copy(); L = length * math.sqrt(max(0., 1 - .72 * w * w))
            p += fwd * (L * s); p.x += (p.x - env.C.x) * .06 * s
            p.z += -curve * w * w * s - math.tan(tilt) * L * s
            ring.append(p); cols.append(1 - .25 * (1 - s) * .5)
        rows.append(ring)
    return mesh_from_grid(name, rows, close_u=False, cols=cols)

def button(env, name, r=.009):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1, location=env.point(0, 0, .016))
    ob = bpy.context.active_object; ob.name = name; ob.scale = (r, r, r * .45); bpy.ops.object.transform_apply(scale=True)
    ca = ob.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for d in ca.data: d.color = (.85, .85, .85, 1)
    return ob

def bake_ao(hats, skull):
    """Cycles AO against the head and the hat itself, multiplied into the existing vertex shade."""
    for o in bpy.data.objects: o.hide_render = not (o is skull or o in hats)   # the file's old hats and hair must not shade the new ones
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 64
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'METAL'; prefs.get_devices()
        for d in prefs.devices: d.use = True
        scene.cycles.device = 'GPU'
    except Exception: pass
    for ob in hats:
        me = ob.data; base = [c.color[0] for c in me.color_attributes['Col'].data]
        ao = me.color_attributes.new('AO', 'FLOAT_COLOR', 'POINT'); me.color_attributes.active_color = ao
        mat = bpy.data.materials.new('bake'); mat.use_nodes = True; me.materials.clear(); me.materials.append(mat)
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        scene.render.bake.target = 'VERTEX_COLORS'
        bpy.ops.object.bake(type='AO')
        col = me.color_attributes['Col']
        for k, d in enumerate(ao.data):
            a = .45 + .55 * d.color[0]; col.data[k].color = (base[k] * a,) * 3 + (1,)
        me.color_attributes.remove(me.color_attributes['AO']); me.color_attributes.active_color = me.color_attributes['Col']
        me.materials.clear()

for fig, (glb, rigjson, mask) in FIGURES.items():
    for ob in list(bpy.data.objects):
        if ob.name.startswith('hw_'): continue
        bpy.data.objects.remove(ob, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, glb))
    body = bpy.data.objects['body']
    ex = rig_extras(rigjson); eye = ex['eyeY']; hc = ex['headCentre']
    skull, bvh = skull_bvh(body)
    C = Vector((0., -hc[2], eye - .015))       # glTF (x, y, z) -> Blender (x, -z, y); the face looks down +Y, centred on x = 0
    env = Envelope(bvh, C)
    print(fig, 'crown radius', round(env.radius(0, 0), 4), 'front radius at eye', round(env.radius(math.pi / 2, 90 * DEG), 4))
    # covering hats sit on hat hair (his locks tucked); the visor and headband leave the top showing, so they keep the locks
    hat_env, hat_skull, hat_body = env, skull, body.data
    if mask:
        T = tuck_field(body, bvh, C, mask); moved = tucked(body, C, T)
        hat_skull, hat_bvh = skull_bvh(body, 'hat_skull', moved); hat_skull.hide_render = True
        hat_env = Envelope(hat_bvh, C); keep.append(tuck_node(fig, C, T))
        hat_body = body.data.copy(); Mi = body.matrix_world.inverted()   # for the preview: the body as he wears a covering hat
        for v, p in zip(hat_body.vertices, moved): v.co = Mi @ Vector(p)
        print(fig, 'tucked: side radius at eye', round(hat_env.radius(0, 90 * DEG), 4), 'was', round(env.radius(0, 90 * DEG), 4),
              '| nape', round(hat_env.radius(-math.pi / 2, 100 * DEG), 4), 'was', round(env.radius(-math.pi / 2, 100 * DEG), 4))
    made = []
    # six-panel cap: rim 5 cm over the eyes at the brow, at the nape just under eye level; structured front panels
    cf, cb = eye + .052, eye - .006
    for style, turn in (('cap', 0.), ('backcap', math.pi)):
        cr, ths = crown(hat_env, f'{style}_crown', cf, cb, .011, lift=.012, seams=6, turn=turn); solidify(cr, .0035)
        bl = bill(hat_env, f'{style}_bill', ths, cf, cb, .011, .075, .014, 9 * DEG, turn=turn); solidify(bl, .0045)
        bt = button(hat_env, f'{style}_button')
        made.append(join(f'hw_{fig}_{style}', [cr, bl, bt]))
    # visor: a sweatband and the bill
    vb = band(env, 'visor_band', eye + .040, eye + .012, .03, .009); solidify(vb, .004)
    vbl = bill(env, 'visor_bill', None, eye + .040, eye + .012, .009, .078, .012, 10 * DEG); solidify(vbl, .0045)
    made.append(join(f'hw_{fig}_visor', [vb, vbl]))
    # beanie: rib knit down to the brow and over the ears' tops, a little slouch, a folded cuff
    bf, bb = eye + .028, eye - .052
    bc, _ = crown(hat_env, 'beanie_crown', bf, bb, .012, lift=0, ribs=32); solidify(bc, .004)
    for v in bc.data.vertices:   # slouch: the top sits 1.5 cm proud of the skull
        h = max(0., (v.co.z - (eye + .02)) / .1); v.co.z += .015 * h * h
    cuff = band(hat_env, 'beanie_cuff', bf - .002, bb - .002, .036, .018, ribs=32, shade=.9); solidify(cuff, .006)
    made.append(join(f'hw_{fig}_beanie', [bc, cuff]))
    # bucket: a soft crown flattened on top, a brim sloping down all round
    uf, ub = eye + .045, eye + .005
    uc, uths = crown(hat_env, 'bucket_crown', uf, ub, .013, flat_top=hat_env.point(0, 0, .013).z - .004); solidify(uc, .004)
    rim_rows, rim_cols = [], []
    for k in range(6):
        s = k / 5; ring = []
        for i, ph in enumerate(env.phis):
            p = hat_env.point(ph, uths[i], .013); d = Vector((p.x - C.x, p.y - C.y, 0)).normalized()
            ring.append(p + d * .055 * s + Vector((0, 0, -.022 * s - .006 * s * s))); rim_cols.append(.95 - .15 * (1 - s))
        rim_rows.append(ring)
    ur = mesh_from_grid('bucket_brim', rim_rows, cols=rim_cols); solidify(ur, .004)
    made.append(join(f'hw_{fig}_bucket', [uc, ur]))
    # headband: terry sweatband across the forehead, level-ish round the back
    hb = band(env, 'headband', eye + .036, eye + .004, .032, .008); solidify(hb, .005)
    made.append(join(f'hw_{fig}_headband', [hb]))
    covering = [o for o in made if o.name.rsplit('_', 1)[1] in ('cap', 'backcap', 'beanie', 'bucket')]
    bake_ao(covering, hat_skull); bake_ao([o for o in made if o not in covering], skull)
    for ob in made: ob.parent = None
    keep.extend(made)
    print(fig, 'hats', [o.name for o in made], 'tris', sum(len(o.data.polygons) for o in made) * 2)

    if PREVIEW:   # a turntable-ish contact sheet: each hat on the head, front and back
        os.makedirs(os.path.join(ROOT, PREVIEW), exist_ok=True)
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam; cam.data.lens = 85
        sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; scene.collection.objects.link(sun); sun.rotation_euler = (50 * DEG, 0, 30 * DEG)
        scene.world = bpy.data.worlds.new('w'); scene.world.use_nodes = True; scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
        scene.render.engine = 'BLENDER_EEVEE'; scene.render.resolution_x = scene.render.resolution_y = 420
        vc = bpy.data.materials.new('vc'); vc.use_nodes = True; nt = vc.node_tree; attr = nt.nodes.new('ShaderNodeAttribute'); attr.attribute_name = 'Col'
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1; mix.inputs['A'].default_value = (.9, .15, .1, 1)
        nt.links.new(attr.outputs['Color'], mix.inputs['B']); nt.links.new(mix.outputs['Result'], nt.nodes['Principled BSDF'].inputs['Base Color'])
        for ob in made: ob.data.materials.clear(); ob.data.materials.append(vc); ob.hide_render = True
        for o in bpy.data.objects:
            if o.name.startswith(('hair_', 'headwear_', 'glasses_', 'accessory_')): o.hide_render = True
        skull.hide_render = True; body.hide_render = False
        skin = bpy.data.materials.new('skin'); skin.use_nodes = True; skin.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.62, .45, .36, 1)
        bare = body.data
        for me in {bare, hat_body}: me.materials.clear(); me.materials.append(skin)
        for ob in made:
            ob.hide_render = False; body.data = hat_body if ob in covering else bare
            for side, (dx, dy) in {'front': (.35, .95), 'back': (-.35, -.95)}.items():
                cam.location = C + Vector((dx, dy, .12)); cam.rotation_euler = (C + Vector((0, 0, .03)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
                scene.render.filepath = os.path.join(ROOT, PREVIEW, f'{ob.name}-{side}.png'); bpy.ops.render.render(write_still=True)
            ob.hide_render = True
        for ob in made: ob.data.materials.clear()
        body.data = bare
        for o in (cam, sun): bpy.data.objects.remove(o, do_unlink=True)

for ob in list(bpy.data.objects):
    if not ob.name.startswith('hw_'): bpy.data.objects.remove(ob, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for ob in keep: ob.select_set(True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, use_selection=True, export_format='GLB', export_apply=True, export_materials='NONE',
                          export_vertex_color='ACTIVE', export_normals=True, export_texcoords=False, export_extras=True,
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
print('headwear ->', OUT, os.path.getsize(OUT), 'bytes')
