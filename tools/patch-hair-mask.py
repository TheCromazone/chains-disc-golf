"""Hairline fixes on the shipped body masks (assets/textures/body[-f]/mask1[_lod].png), in place.
Run: python tools/patch-hair-mask.py [m] [f]   (both by default; numpy, scipy, Pillow; Blender for the texel dump, BLENDER
overrides its path)

pack-body-textures.py --clean writes these masks from the Blender bakes (art/blender/golfer-v3[-f]-textures), which live
on the PC that baked them; this patches its output with the same texel maps (each texel's bind-pose position, bone
weights and face normal, from pack-body-textures.py --dump). Its rules also stand in clean() there, so a fresh pack
keeps them. Dark hair hides all three faults; light hair (blond, grey) shows them.

Sideburns: clean() made dark head texels hair above the brow line in front of the ears (z more than 4 cm ahead of the
head centre) and above a line 11 cm lower behind it. The sideburns sit across that split at eye level, so their dark
texels stayed skin and kept the scan's near-black: under light hair a ragged dark wedge between the hair and the eye,
reading as a jagged hairline in front of the ear. Here the dark side-facing texels of that wedge become hair, soft by
darkness (the scan's own sideburn edge), so the hair colour runs down into a sideburn.

Ear specks: the same rule's lower line behind the brow (11 cm under it) took the dark creases inside the ears as hair, so
light hair dotted the ear with gold. Hair texels on the side of the head that are wholly enclosed by skin in the atlas
(the ear's skin round its creases) go back to skin.

Her ponytail: its tip hangs beside her collar, where clean()'s neck rules made it skin and jersey, so a blond ponytail
ended in a near-black, red-cast tuft. Dark texels behind her neck, clear of it, become hair.
"""
import json, os, subprocess, sys, tempfile
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BLENDER = os.environ.get('BLENDER', '/Applications/Blender.app/Contents/MacOS/Blender' if sys.platform == 'darwin' else 'blender')
HAIR_DARK = .1   # linear luminance under which a head texel is the scan's hair (clean()'s threshold)
# per scan: atlas folder, rig, full and Lite bodies, where the ear starts (metres ahead of the head centre) and whether a
# ponytail hangs from it
FIGURES = {'m': dict(dir='body', rig='golfer-rig.json', glbs=('golfer.glb', 'golfer-lod.glb'), ear=-.012, ponytail=False),
           'f': dict(dir='body-f', rig='golfer-f-rig.json', glbs=('golfer-f.glb', 'golfer-f-lod.glb'), ear=-.025, ponytail=True)}

def texel_maps(glb, N):
  """Bind-pose position, head weight, face normal and coverage per texel (pack-body-textures.py texel_maps)."""
  with tempfile.TemporaryDirectory() as tmp:
    subprocess.run([BLENDER, '-b', '-P', str(ROOT / 'tools/pack-body-textures.py'), '--', '--dump', str(glb), tmp + '/d.npz'], check=True, capture_output=True)
    d = dict(np.load(tmp + '/d.npz'))
  pos, tri, tuv, W = d['pos'], d['tri'], d['tuv'], d['W'][:, [str(n) for n in d['names']].index('head')]
  fn = np.cross(pos[tri[:, 1]] - pos[tri[:, 0]], pos[tri[:, 2]] - pos[tri[:, 0]]); fn /= np.maximum(np.linalg.norm(fn, axis=1), 1e-12)[:, None]
  P = np.zeros((N, N, 3), np.float32); H = np.zeros((N, N), np.float32); Nn = np.zeros((N, N, 3), np.float32); hit = np.zeros((N, N), bool)
  for t in range(len(tri)):
    x = tuv[t, :, 0] * N - .5; y = (1 - tuv[t, :, 1]) * N - .5; i0, i1, i2 = tri[t]   # glTF v runs down the image
    for wa, wb, wc in ((1 / 3, 1 / 3, 1 / 3), (1, 0, 0), (0, 1, 0), (0, 0, 1)):
      sx, sy = (int(np.clip(np.floor(wa * c[0] + wb * c[1] + wc * c[2] + .5), 0, N - 1)) for c in (x, y))
      if not hit[sy, sx]: P[sy, sx] = wa * pos[i0] + wb * pos[i1] + wc * pos[i2]; H[sy, sx] = wa * W[i0] + wb * W[i1] + wc * W[i2]; Nn[sy, sx] = fn[t]; hit[sy, sx] = True
    x0, x1, y0, y1 = int(max(0, np.floor(x.min()))), int(min(N - 1, np.ceil(x.max()))), int(max(0, np.floor(y.min()))), int(min(N - 1, np.ceil(y.max())))
    den = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2])
    if x1 < x0 or y1 < y0 or abs(den) < 1e-12: continue
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
    a = ((y[1] - y[2]) * (gx - x[2]) + (x[2] - x[1]) * (gy - y[2])) / den; b = ((y[2] - y[0]) * (gx - x[2]) + (x[0] - x[2]) * (gy - y[2])) / den; c = 1 - a - b
    m = (a >= -.02) & (b >= -.02) & (c >= -.02)
    if not m.any(): continue
    iy, ix, wa, wb, wc = gy[m], gx[m], a[m], b[m], c[m]
    P[iy, ix] = wa[:, None] * pos[i0] + wb[:, None] * pos[i1] + wc[:, None] * pos[i2]; H[iy, ix] = wa * W[i0] + wb * W[i1] + wc * W[i2]; Nn[iy, ix] = fn[t]; hit[iy, ix] = True
  return P, H, Nn, hit

dark = lambda lum: np.clip((HAIR_DARK * 1.5 - lum) / (HAIR_DARK * .5), 0, 1)   # full under clean()'s darkness, gone by half as bright again

def sideburns(P, H, Nn, hit, lum, head, ear=-.012):
  """Hair share to add per texel: dark, side-facing head texels from 6 cm under the brow line to 4.5 cm over it, between
  the front of the ear and 8.5 cm ahead of the head centre and more than 5 cm out to the side (the brows and eye corners
  are nearer the middle and face forward), soft by darkness (half-dark edge texels otherwise drew a dark outline round
  the new hair)."""
  c, eye = head['centre'], head['eyeY']; x, y, z = P[..., 0] - c[0], P[..., 1] - eye, P[..., 2] - c[2]
  zone = hit & (H > .3) & (z > -.085) & (z < ear) & (y > -.06) & (y < .045) & (np.abs(x) > .05) & (np.abs(Nn[..., 0]) > .25)
  return np.where(zone, dark(lum), 0.)

def ponytail(P, hit, lum, head, skin):
  """Hair share to add per texel: dark texels from 6 to 23 cm under the brow line, behind her neck and more than 7.2 cm
  from its axis (the neck is ~6.3 cm round it; the tip hangs from 7.7 cm out) and within 5 cm of the middle of her back.
  The axis is the mean of her light neck skin 13-20 cm under the brow line."""
  c, eye = head['centre'], head['eyeY']; x, y, z = P[..., 0] - c[0], P[..., 1] - eye, P[..., 2] - c[2]
  neck = hit & (skin > .5) & (y < -.13) & (y > -.2) & (lum > HAIR_DARK) & (np.abs(x) < .07); nx, nz = x[neck].mean(), z[neck].mean()
  zone = hit & (y > -.23) & (y < -.06) & (z > nz + .03) & (np.hypot(x - nx, z - nz) > .072) & (np.abs(x - nx) < .05)
  return np.where(zone, dark(lum), 0.)

def ear_specks(m1, P, H, hit, head):
  """Hair texels on the side of the head (5 cm out, from 9 cm under the brow line to 5 cm over it) wholly enclosed by
  skin in the atlas, or with three quarters of the surface within 6 mm of them skin (a speck on an atlas seam, like the
  crescent on the rim of her ear canal, touches the gutter and is never enclosed)."""
  from scipy import ndimage
  from scipy.spatial import cKDTree
  c, eye = head['centre'], head['eyeY']; x, y = P[..., 0] - c[0], P[..., 1] - eye
  side = hit & (H > .3) & (np.abs(x) > .05) & (y > -.09) & (y < .05); skin = side & (m1[..., 0] > .5); hair = side & (m1[..., 3] > .1)
  pts = P[side]; near = cKDTree(pts).query_ball_point(P[hair], .006); sk = skin[side]
  lonely = np.zeros(side.shape, bool); lonely[hair] = [sk[n].mean() > .75 for n in near]
  return (ndimage.binary_fill_holes(skin) & ~skin | lonely) & hair

if __name__ == '__main__':
  from scipy import ndimage
  for fig in [a for a in sys.argv[1:] if a in FIGURES] or list(FIGURES):
    F = FIGURES[fig]; head = json.loads((ROOT / 'tools' / F['rig']).read_text())['head']
    for sfx, glb in zip(('', '_lod'), F['glbs']):
      # the masks hold 16 levels per channel (multiples of 16, pack-body-textures.py save()): the patch moves whole levels
      # between regions, so their sum holds and a second run changes nothing
      mpath = ROOT / f'assets/textures/{F["dir"]}/mask1{sfx}.png'; lv = np.asarray(Image.open(mpath).convert('RGBA')).astype(np.int32) // 16; N = lv.shape[0]
      alb = np.asarray(Image.open(ROOT / f'assets/textures/{F["dir"]}/albedo{sfx}.webp').convert('RGB').resize((N, N), Image.BOX)).astype(np.float32) / 255
      lum = np.where(alb <= .04045, alb / 12.92, ((alb + .055) / 1.055) ** 2.4) @ np.array([.2126, .7152, .0722], np.float32)
      P, H, Nn, hit = texel_maps(ROOT / 'assets/models' / glb, N); lv0 = lv.copy()
      tail = np.round(ponytail(P, hit, lum, head, lv[..., 0] / 15) * 15).astype(np.int32) if F['ponytail'] else np.zeros(lv.shape[:2], np.int32)
      want = np.maximum(np.round(sideburns(P, H, Nn, hit, lum, head, F['ear']) * 15).astype(np.int32), tail)   # hair share, in levels
      for _ in range(8):   # specks back to skin (the sideburn's own texels stay hair), until a pass finds none: each one gone changes its neighbours' share
        speck = ear_specks(lv * 16 / 255, P, H, hit, head) & (want == 0)
        if not speck.any(): break
        lv[speck, 0] += lv[speck, 3]; lv[speck, 3] = 0
      skin = np.minimum(np.maximum(want - lv[..., 3], 0), lv[..., 0]); lv[..., 3] += skin; lv[..., 0] -= skin   # skin up to the share
      shirt = np.minimum(np.maximum(tail - lv[..., 3], 0), lv[..., 1]); lv[..., 3] += shirt; lv[..., 1] -= shirt   # then the ponytail's jersey
      # gutters copy their nearest island texel in clean(): those beside a changed texel take the same change (mips stay on the island)
      idx = ndimage.distance_transform_edt(~hit, return_distances=False, return_indices=True); d = (lv - lv0)[idx[0], idx[1]]
      lv[~hit] = np.clip(lv0[~hit] + d[~hit], 0, 15)
      Image.fromarray((np.minimum(lv, 15) * 16).astype(np.uint8), 'RGBA').save(mpath, 'PNG', optimize=True)   # a speck whose skin and hair overlapped is full skin, not 256
      ch = (lv - lv0)[hit]
      print(f'{F["dir"]}/mask1{sfx}.png: {(ch[:, 0] < 0).sum()} skin and {(ch[:, 1] < 0).sum()} jersey texels to hair, '
            f'{((ch[:, 3] < 0)).sum()} ear specks to skin, {mpath.stat().st_size} bytes')
