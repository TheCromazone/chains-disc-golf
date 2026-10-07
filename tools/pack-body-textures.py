"""Runtime body textures from the Blender masters (tools/build-golfer-v3.py writes art/blender/golfer-v3[-f]-textures/).
Run: python tools/pack-body-textures.py [--variant f] [--src DIR] [--clean]
Full tier: 2048 albedo (WebP, AO folded in), 2048 tangent normal (WebP), 1024 region masks (PNG, RGBA).
Lite tier: the LOD body's own 1024 albedo and 512 masks (its UV layout differs), no normal map. The female phone LOD is
her full body (build-golfer-v3.py --lod-from-full), so her Lite set is the full set at half size.
Prints the byte sizes the asset test budgets against and registers the files in assets/manifest.json.

--clean re-classifies the garment regions before packing (needs Blender for one dump per body, plus numpy and scipy).
The bake's colour classifier leaked: white bake misses on the shorts became jersey islands, the scan's white hem, sleeve
cuffs and collar fell between classes and showed as torn white bands, and Meshy's pale smears read as skin. Here every
texel gets its bind-pose position and dominant bone (Blender dumps the runtime GLB's body, numpy rasterises it into the
atlas), and the cloth boundaries become smooth garment lines (hem, both shorts cuffs, both sleeves, the neckline), each
found per angle round its limb as the height that best splits the scan's own colours. Texels whose colour disagrees with
their new region are refilled from their nearest trusted 3D neighbours, the near-black shorts and the jersey are
smoothed toward a centimetre-scale mean (sensor noise and stitching streaks, not folds), the scan's own hair becomes the
hair region, and every empty gutter texel copies its nearest island so mips never fade a region into nothing. The LOD
reuses the full body's garment lines.
"""
from pathlib import Path
import json, os, subprocess, sys, tempfile

if '--dump' in sys.argv:   # inside Blender: the runtime body's bind pose, triangle UVs and bone weights
  import bpy, numpy as np
  glb, dst = sys.argv[sys.argv.index('--dump') + 1:][:2]
  bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=glb)
  body = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.data.materials and o.data.materials[0].name.startswith('body'))
  for arm in (o for o in bpy.context.scene.objects if o.type == 'ARMATURE'):
    for pb in arm.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)
  me = body.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh(); me.calc_loop_triangles()
  co = np.zeros(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); M = np.array(body.matrix_world)
  co = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]; pos = np.stack([co[:, 0], co[:, 2], -co[:, 1]], 1)   # Blender -> game
  tri = np.zeros(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get('vertices', tri)
  lt = np.zeros(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get('loops', lt)
  uv = np.zeros(len(me.uv_layers.active.data) * 2, np.float32); me.uv_layers.active.data.foreach_get('uv', uv)
  names = [g.name for g in body.vertex_groups]; W = np.zeros((len(me.vertices), len(names)), np.float32)
  for v in me.vertices:
    for g in v.groups: W[v.index, g.group] = g.weight
  np.savez(dst, pos=pos, tri=tri.reshape(-1, 3), tuv=uv.reshape(-1, 2)[lt.reshape(-1, 3)], W=W, names=np.array(names)); sys.exit(0)

from PIL import Image, ImageOps
ROOT = Path(__file__).resolve().parents[1]
VARIANT = sys.argv[sys.argv.index('--variant') + 1] if '--variant' in sys.argv else 'm'
TAG = '' if VARIANT == 'm' else '-' + VARIANT; KEY = 'body_' if VARIANT == 'm' else f'body_{VARIANT}_'
SRC = Path(sys.argv[sys.argv.index('--src') + 1]) if '--src' in sys.argv else ROOT / f'art/blender/golfer-v3{TAG}-textures'; OUT = ROOT / f'assets/textures/body{TAG}'; OUT.mkdir(parents=True, exist_ok=True)
BLENDER = os.environ.get('BLENDER', r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe')
SKIN, JERSEY, SHORTS, HAIR, SOCKS, SHOES, IRIS = range(7)
ARM_KEEP = {'m': (.65, .05, .55, .65)}   # per scan, arm skin: share of detail kept round a 5 cm mean, cell, pull to the median hue, brightness floor
COLLAR = {'m': .016}   # the collar rides this far up the neck (metres): the m2 tee's low scoop left a long pale column of neck at the tee

def texel_maps(glb, N):
  """Bind-pose position, bone weights, face normal and coverage per texel of the body's atlas."""
  import numpy as np
  with tempfile.TemporaryDirectory() as tmp:
    subprocess.run([BLENDER, '-b', '-P', __file__, '--', '--dump', str(glb), tmp + '/d.npz'], check=True, capture_output=True)
    d = dict(np.load(tmp + '/d.npz'))
  pos, tri, tuv, W = d['pos'], d['tri'], d['tuv'], d['W']
  fn = np.cross(pos[tri[:, 1]] - pos[tri[:, 0]], pos[tri[:, 2]] - pos[tri[:, 0]]); fn /= np.maximum(np.linalg.norm(fn, axis=1), 1e-12)[:, None]
  P = np.zeros((N, N, 3), np.float32); B = np.zeros((N, N, W.shape[1]), np.float32); Nn = np.zeros((N, N, 3), np.float32); hit = np.zeros((N, N), bool)
  for t in range(len(tri)):
    x = tuv[t, :, 0] * N - .5; y = (1 - tuv[t, :, 1]) * N - .5; i0, i1, i2 = tri[t]   # glTF v runs down the image
    # sub-texel and sliver triangles (the female decimation leaves hundreds) still own the texel they sample
    for wa, wb, wc in ((1 / 3, 1 / 3, 1 / 3), (1, 0, 0), (0, 1, 0), (0, 0, 1)):
      sx, sy = (int(np.clip(np.floor(wa * c[0] + wb * c[1] + wc * c[2] + .5), 0, N - 1)) for c in (x, y))
      if not hit[sy, sx]: P[sy, sx] = wa * pos[i0] + wb * pos[i1] + wc * pos[i2]; B[sy, sx] = wa * W[i0] + wb * W[i1] + wc * W[i2]; Nn[sy, sx] = fn[t]; hit[sy, sx] = True
    x0, x1, y0, y1 = int(max(0, np.floor(x.min()))), int(min(N - 1, np.ceil(x.max()))), int(max(0, np.floor(y.min()))), int(min(N - 1, np.ceil(y.max())))
    den = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2])
    if x1 < x0 or y1 < y0 or abs(den) < 1e-12: continue
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
    a = ((y[1] - y[2]) * (gx - x[2]) + (x[2] - x[1]) * (gy - y[2])) / den; b = ((y[2] - y[0]) * (gx - x[2]) + (x[0] - x[2]) * (gy - y[2])) / den; c = 1 - a - b
    m = (a >= -.02) & (b >= -.02) & (c >= -.02)
    if not m.any(): continue
    iy, ix, wa, wb, wc = gy[m], gx[m], a[m, None], b[m, None], c[m, None]
    P[iy, ix] = wa * pos[i0] + wb * pos[i1] + wc * pos[i2]; B[iy, ix] = wa * W[i0] + wb * W[i1] + wc * W[i2]; Nn[iy, ix] = fn[t]; hit[iy, ix] = True
  return P, B, hit, [str(n) for n in d['names']], Nn

def clean(alb, m1, m2, maps, rig, lines):
  """Re-classified masks and repaired albedo (float arrays 0..1, albedo sRGB). lines: the full body's garment lines, filled in on first use."""
  import numpy as np
  from scipy.spatial import cKDTree
  from scipy import ndimage
  P, B, hit, names, Nn = maps; J, head = rig['rig'], rig['head']; bi = {n: i for i, n in enumerate(names)}
  W7 = np.concatenate([m1, m2[..., :3]], -1); C0 = np.where(W7.max(-1) > .35, W7.argmax(-1), -1)
  lum = np.where(alb <= .04045, alb / 12.92, ((alb + .055) / 1.055) ** 2.4) @ np.array([.2126, .7152, .0722], np.float32)
  mx, mn = alb.max(-1), alb.min(-1); sat = np.where(mx > 1e-3, (mx - mn) / np.maximum(mx, 1e-3), 0)
  warm = (alb[..., 0] >= alb[..., 1]) & (alb[..., 1] >= alb[..., 2] * .95)
  white = (lum > .3) & (sat < .22); dark = lum < .05; skinc = warm & (sat > .18) & (lum > .02) & (lum < .7) & ~white
  x, y, z = P[..., 0], P[..., 1], P[..., 2]; dom = np.where(hit, B.argmax(-1), -1)
  part = lambda *bs: np.isin(dom, [bi[b] for b in bs])
  torso, thighR, thighL, shin, headp = part('root', 'spine'), part('hipR'), part('hipL'), part('knR', 'knL'), part('head')
  elY = (J['elR'][1] + J['elL'][1]) / 2; hipY = (J['hipR'][1] + J['hipL'][1]) / 2; knY = (J['knR'][1] + J['knL'][1]) / 2; shY = (J['shR'][1] + J['shL'][1]) / 2; chinY = head['chin']
  upR, upL = part('shR') | part('elR') & (y > elY + .02), part('shL') | part('elL') & (y > elY + .02); fore = part('elR', 'elL') & ~upR & ~upL
  hips = torso | thighR | thighL
  def axis(sel, lo, hi, name):
    if name not in lines: m = sel & (y > lo) & (y < hi); lines[name] = [float(x[m].mean()), float(z[m].mean())]
    return lines[name]
  def angle(name): ax, az = lines[name]; return np.arctan2(x - ax, -(z - az))
  def line(name, sel, ang, above, below, lo, hi, tol=.035, bins=48):
    """Height round a limb that best splits `above` texels from `below` ones: per-angle optimal split, held within tol of the median, smoothed round the loop."""
    if name not in lines:
      a = ((ang + np.pi) / (2 * np.pi) * bins).astype(int) % bins; hs = np.full(bins, np.nan); band = sel & (y > lo) & (y < hi)
      for k in range(bins):
        m = band & (a == k); ya, yb = np.sort(y[m & above]), np.sort(y[m & below])
        if len(ya) + len(yb) < 30: continue
        cand = np.sort(np.concatenate([ya, yb, [lo, hi]])); cost = np.searchsorted(ya, cand) + len(yb) - np.searchsorted(yb, cand); hs[k] = cand[cost == cost.min()].mean()
      ok = ~np.isnan(hs); idx = np.arange(bins); hs = np.interp(idx, idx[ok], hs[ok], period=bins); hs = np.clip(hs, np.median(hs) - tol, np.median(hs) + tol)
      med = np.array([np.median(np.take(hs, range(i - 3, i + 4), mode='wrap')) for i in idx])
      lines[name] = [round(float(np.take(med, range(i - 2, i + 3), mode='wrap').mean()), 4) for i in idx]
    sm = np.array(lines[name]); return np.interp((ang + np.pi) / (2 * np.pi) * bins - .5, np.arange(-1, bins + 1), np.concatenate([[sm[-1]], sm, [sm[0]]]))
  axis(hips, hipY - .1, hipY + .08, 'axisT'); angT = angle('axisT')
  hem = line('hem', hips, angT, white, dark, hipY - .12, hipY + .1); above_hem = y > np.maximum(hem, rig['extras'].get('shirtHem', 0))   # the fitted jersey ends at the hip (build-golfer-v3.py), the scan's tee hung to the thigh
  C1 = C0.copy(); C1[hit & (hips | upR | upL)] = JERSEY; C1[~above_hem & torso] = SHORTS
  for side, th in (('R', thighR), ('L', thighL)):
    axis(th, knY + .05, hipY - .05, 'axisC' + side); ang = angle('axisC' + side)
    cuff = line('cuff' + side, th, ang, dark, skinc, knY + .02, hipY - .03); C1[~above_hem & th] = np.where(y[~above_hem & th] < cuff[~above_hem & th], SKIN, SHORTS)
  # an arm texel's normal leaves its arm's axis; the torso side under the armpit faces the arm instead. The scan skins
  # that side to the arm bones, so without this test it turned to skin: a wedge on the back beside the elbow.
  arm_side = lambda s: (x - lines['axisS' + s][0]) * Nn[..., 0] + (z - lines['axisS' + s][1]) * Nn[..., 2] > -.005
  hems = rig['extras'].get('sleeveHem', {})   # build-golfer-v3.py fits the sleeve onto the arm and ends it here; the scan's longer sleeve below is arm
  old = {}
  for side, up in (('R', upR), ('L', upL)):
    axis(up, elY + .03, shY - .03, 'axisS' + side); old[side] = sleeve = line('sleeve' + side, up, angle('axisS' + side), white, skinc, elY + .02, shY + .02); C1[up & (y < np.maximum(sleeve, hems.get(side, 0))) & arm_side(side)] = SKIN
  fore &= np.where(x > 0, arm_side('R'), arm_side('L'))
  axis(headp | torso, chinY - .06, chinY - .01, 'axisN'); angN = angle('axisN'); nx, nz = lines['axisN']
  neckzone = (torso | headp | upR | upL) & (np.hypot(x - nx, z - nz) < .11) & (y < chinY + .01) & (y > shY - .1)
  necky = neckzone & (y > line('neck', neckzone, angN, skinc, white, shY - .1, chinY + .01, tol=.05) + COLLAR.get(VARIANT, 0))
  C1[necky] = np.where(C0[necky] == HAIR, HAIR, SKIN); C1[neckzone & headp & ~necky] = JERSEY   # collar texels skinned to the head bone
  C1[headp & ~neckzone & np.isin(C0, [JERSEY, SHORTS])] = SKIN; C1[(fore | shin) & np.isin(C0, [JERSEY, SHORTS])] = SKIN
  C1[hit & (C1 == -1) & ~headp] = SKIN   # unclassified head texels are the eye whites: raw albedo on purpose
  hfront = z < head['centre'][2] - .04   # the scan's own hair and brows: dark head texels above the hairline
  C1[headp & ~neckzone & (lum < .1) & ((hfront & (y > head['eyeY'] + .018)) | (~hfront & (y > head['eyeY'] - .11))) & (C0 != IRIS)] = HAIR
  C1[~hit] = -1
  # albedo: texels whose colour disagrees with their new region take their nearest trusted 3D neighbours
  jmed = float(np.median(lum[hit & (C0 == JERSEY)])); smed = float(np.median(lum[hit & (C0 == SKIN) & skinc & ~headp]))
  hemband = hips & above_hem & (y < hem + .05)   # the scan's hem stitching and fold shadow
  shoe = hit & (C0 == SHOES); shoemax = max(.08, 2.5 * float(np.median(lum[shoe]))) if shoe.any() else .08   # black shoes trust their dark texels; grey ones (m2) all of theirs but the white trim
  trusted = {SKIN: headp & ~neckzone | skinc & (lum < 2.2 * smed) & (lum > .3 * smed), JERSEY: (lum > np.where(hemband, .7, .52) * jmed) & (sat < .3), SHORTS: lum < .06, SOCKS: (lum > .12) & (sat < .3), SHOES: lum < shoemax}   # the face keeps every texel; the neck under the collar must look like skin (the white trim frayed it)
  out = alb.copy()
  for k, ok in trusted.items():
    cls = hit & (C1 == k); trust = cls & (C0 == k) & ok; bad = cls & ~trust
    if not bad.any() or trust.sum() < 50: continue
    d, i = cKDTree(P[trust]).query(P[bad], k=8); w = 1 / (d + .004); out[bad] = (alb[trust][i] * w[..., None]).sum(1) / w.sum(1)[:, None]
  def voxel_mean(sel, size):   # two offset grids so the average has no block edges
    acc = 0
    for off in (0, .5):
      _, inv = np.unique(np.floor(P[sel] / size + off).astype(np.int64), axis=0, return_inverse=True); inv = inv.ravel()
      s = np.zeros((inv.max() + 1, 3)); np.add.at(s, inv, out[sel]); acc = acc + s[inv] / np.bincount(inv)[inv, None]
    return acc / 2
  for k, keep, size in ((SHORTS, .4, .015), (JERSEY, .45, .012)):   # near-black shorts carry sensor noise; the jersey keeps its folds, loses its streaks
    sel = hit & (C1 == k)
    if sel.sum() > 50: out[sel] = keep * out[sel] + (1 - keep) * voxel_mean(sel, size)
  # hands and forearms: the scan's arms carry brown blotches a few centimetres across that the skin shader deepens, so arm
  # texels keep a third of their deviation from a 5 cm mean. The hands rest open as scanned (the grip is a runtime morph),
  # so their finger-gap shadow and knuckle creases match the geometry and are what separates the fingers at game distance:
  # hand texels keep most of theirs (at a third, and lifted to 85 % of the median, the hands read as fused mittens). Then
  # every texel takes the limb's median hue at its own brightness (most of the way).
  # The m2 scan's arms are clean (no blotches) and their shading is the muscle (deltoid, biceps, forearm): flattened to a
  # third, they read as the "thin plastic arm" the critics named, so they keep most of it
  wristY = J['elR'][1] + rig['hand'][1] + .075; arms = hit & (C1 == SKIN) & part('elR', 'elL', 'shR', 'shL'); handT = arms & (y < wristY + .02)
  for sel, keep, size, hue, floor in ((handT, .75, .015, .8, .55), (arms & ~handT, *ARM_KEEP.get(VARIANT, (.35, .05, .75, .85)))):
    if sel.sum() < 50: continue
    m = voxel_mean(sel, size); v = m + keep * (out[sel] - m); L = v @ np.array([.2126, .7152, .0722], np.float32)
    M = np.median(v, 0); ML = float(M @ np.array([.2126, .7152, .0722])); v = (1 - hue) * v + hue * M[None] * np.clip(L / ML, floor, 1.25)[:, None]
    out[sel] = v
  # the scan's white collar and sleeve trims sit right against the skin, and the masks' soft edge (resampling, filtering)
  # blends some skin weight over them: a pale fringe. Jersey texels within 8 mm of skin take the skin's colour, darkened
  # a little like a seam, so either side of the edge shades plausibly.
  # A seam joins surface that carries on (normals agree): where the hanging arm touches the ribs in the bind pose, the flank
  # took the facing arm's skin and the jersey shader turned it into a dark 'M' stain.
  sk, edge = hit & (C1 == SKIN), hit & (C1 == JERSEY) & (y > shY - .3)
  d, i = cKDTree(P[sk]).query(P[edge], distance_upper_bound=.008); near = np.isfinite(d)
  near[near] = (Nn[edge][near] * Nn[sk][i[near]]).sum(-1) > .3
  flat = out.reshape(-1, 3); flat[np.flatnonzero(edge)[near]] = out[sk][i[near]] * .8
  W = np.stack([(C1 == k).astype(np.float32) for k in range(7)], -1); keep = headp & (C1 == C0) & ~neckzone; W[keep] = W7[keep]   # the face keeps its soft iris and brow edges
  # the fitted sleeve: its hem is a level cut round the arm, so the texel grid staircased it; blend the two regions over
  # ±4 mm of height instead. Below it the scan's own sleeve became arm: its cloth folds and the ridge of its old cuff leave
  # the normal map, fading in over 3 cm under the old cuff so no ring shows round the upper arm. The sleeve itself was
  # pulled onto the arm, so the loose folds baked into it crumpled like paper once the arm rose: it keeps a third of them.
  bare = np.zeros(C1.shape, np.float32); ss = lambda a, b, t: (lambda u: u * u * (3 - 2 * u))(np.clip((t - a) / (b - a), 0, 1))
  for side, up in (('R', upR), ('L', upL)):
    h = hems.get(side)
    if h is None: continue
    arm = hit & up & arm_side(side) & np.isin(C1, [SKIN, JERSEY])
    band = arm & (np.abs(y - h) < .006); jw = ss(h - .004, h + .004, y[band]); W[band, JERSEY] = jw; W[band, SKIN] = 1 - jw
    lo = old[side] - .06; aw = B[..., bi['sh' + side]] + B[..., bi['el' + side]]   # by skin weight, so the fold strength fades out across the shoulder rather than stepping at the bone boundary
    bared = hit & arm_side(side) & np.isin(C1, [SKIN, JERSEY]) & (y > lo) & (aw > .2); lb = lo[bared]
    bare[bared] = np.maximum(bare[bared], ss(lb, lb + .03, y[bared]) * ss(.2, .8, aw[bared]) * (1 - .33 * ss(h - .002, h + .006, y[bared])))
  if VARIANT == 'm':   # his sideburns to hair and his ear creases back to skin: tools/patch-hair-mask.py (which says why)
    import importlib.util; spec = importlib.util.spec_from_file_location('patch_hair_mask', ROOT / 'tools/patch-hair-mask.py'); hm = importlib.util.module_from_spec(spec); spec.loader.exec_module(hm)
    Hh = B[..., bi['head']]; speck = hm.ear_specks(W[..., :4], P, Hh, hit, head)
    add = np.minimum(np.maximum(hm.sideburns(P, Hh, Nn, hit, lum, head) - W[..., HAIR], 0), W[..., SKIN]) - np.where(speck, W[..., HAIR], 0); W[..., HAIR] += add; W[..., SKIN] -= add
  idx = ndimage.distance_transform_edt(~hit, return_distances=False, return_indices=True)   # gutters copy their nearest island texel
  out, W, beard, bare = out[idx[0], idx[1]], W[idx[0], idx[1]], m2[..., 3][idx[0], idx[1]], bare[idx[0], idx[1]]
  return out, np.concatenate([W[..., :4]], -1), np.concatenate([W[..., 4:], beard[..., None]], -1), bare

sizes = {}
def save(img, name, size, fmt, **kw):
  # masks are four independent channels: Pillow resamples RGBA through premultiplied alpha, which would erase RGB where alpha is 0
  im = img if img.size[0] == size else Image.merge(img.mode, [ch.resize((size, size), Image.LANCZOS) for ch in img.split()])
  if fmt == 'PNG': im = Image.merge(im.mode, [ImageOps.posterize(ch, 6 if name.startswith('mask2') and i == 3 else 4) for i, ch in enumerate(im.split())])   # soft masks survive 16 levels (PNG shrinks 2-3x); the beard channel keeps 64 for its zone id + feather
  path = OUT / name; im.save(path, fmt, **kw); sizes[name] = path.stat().st_size; return path
SHARED_LOD = {'f'}   # the phone LOD is the full body (build-golfer-v3.py --lod-from-full): same UVs, so the same atlas at half size
lines, full, bare = {}, None, None
for sfx in ('', '_lod'):
  if sfx and VARIANT in SHARED_LOD: alb, m1, m2 = full
  else: alb, m1, m2 = Image.open(SRC / f'albedo{sfx}.png').convert('RGB'), Image.open(SRC / f'mask1{sfx}.png').convert('RGBA'), Image.open(SRC / f'mask2{sfx}.png').convert('RGBA')
  if '--clean' in sys.argv and not (sfx and VARIANT in SHARED_LOD):
    import numpy as np
    N = alb.size[0]; f = lambda im: np.asarray(im if im.size[0] == N else Image.merge(im.mode, [c.resize((N, N), Image.LANCZOS) for c in im.split()])).astype(np.float32) / 255
    maps = texel_maps(ROOT / f'assets/models/golfer{TAG}{sfx.replace("_", "-")}.glb', N)
    a, k1, k2, b = clean(f(alb), f(m1), f(m2), maps, json.loads((ROOT / f'tools/golfer{TAG}-rig.json').read_text()), lines)
    u8 = lambda v, mode: Image.fromarray((np.clip(v, 0, 1) * 255 + .5).astype(np.uint8), mode)
    alb, m1, m2 = u8(a, 'RGB'), u8(k1, 'RGBA'), u8(k2, 'RGBA'); bare = b if not sfx else bare
  full = full or (alb, m1, m2)
  save(alb, f'albedo{sfx}.webp', 1024 if sfx else 2048, 'WEBP', quality=76 if sfx else 78, method=5)
  save(m1, f'mask1{sfx}.png', 512 if sfx else 1024, 'PNG', optimize=True); save(m2, f'mask2{sfx}.png', 512 if sfx else 1024, 'PNG', optimize=True)
nrm = Image.open(SRC / 'normal.png').convert('RGB')
if bare is not None and bare.any():   # bared arm (clean(): already feathered in 3D): flat normals
  from scipy import ndimage
  w = np.clip(ndimage.gaussian_filter(bare, 1.5), 0, 1)[..., None]; n = np.asarray(nrm).astype(np.float32)
  nrm = Image.fromarray((n * (1 - w) + np.array([128, 128, 255], np.float32) * w + .5).astype(np.uint8), 'RGB')
save(nrm, 'normal.webp', 2048, 'WEBP', quality=80, method=5)
manifest = ROOT / 'assets/manifest.json'; doc = json.loads(manifest.read_text())
for key, file in (('albedo', 'albedo.webp'), ('albedo_lod', 'albedo_lod.webp'), ('normal', 'normal.webp'), ('mask1', 'mask1.png'), ('mask2', 'mask2.png'), ('mask1_lod', 'mask1_lod.png'), ('mask2_lod', 'mask2_lod.png')):
  doc['textures'][KEY + key] = f'textures/body{TAG}/' + file
manifest.write_text(json.dumps(doc, indent=2) + '\n')
print(json.dumps(sizes, indent=1)); print('total', sum(sizes.values()))
if lines: print('garment lines', json.dumps({k: (v if len(v) < 3 else [min(v), max(v)]) for k, v in lines.items()}))
