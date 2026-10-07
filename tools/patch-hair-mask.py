"""Hairline fixes on the shipped male body masks (assets/textures/body/mask1[_lod].png), in place.
Run: python tools/patch-hair-mask.py   (numpy, scipy, Pillow; Blender for the texel dump, BLENDER overrides its path)

pack-body-textures.py --clean writes these masks from the Blender bakes (art/blender/golfer-v3-textures), which live on
the PC that baked them; this patches its output with the same texel maps (each texel's bind-pose position, bone weights
and face normal, from pack-body-textures.py --dump). Its rules also stand in clean() there, so a fresh pack keeps them.

Sideburns: clean() made dark head texels hair above the brow line in front of the ears (z more than 4 cm ahead of the
head centre) and above a line 11 cm lower behind it. His sideburns sit across that split at eye level, so their dark
texels stayed skin and kept the scan's near-black: under light hair a ragged dark wedge between the hair and the eye,
reading as a jagged hairline in front of the ear. Here the dark side-facing texels of that wedge become hair, soft by
darkness (the scan's own sideburn edge), so the hair colour runs down into a sideburn.

Ear specks: the same rule's lower line behind the brow (11 cm under it) took the dark creases inside his ears as hair, so
light hair dotted the ear with gold. Hair texels on the side of the head that are wholly enclosed by skin in the atlas
(the ear's skin round its creases) go back to skin.
"""
import json, os, subprocess, sys, tempfile
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BLENDER = os.environ.get('BLENDER', '/Applications/Blender.app/Contents/MacOS/Blender' if sys.platform == 'darwin' else 'blender')
HAIR_DARK = .1   # linear luminance under which a head texel is the scan's hair (clean()'s threshold)

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

def sideburns(P, H, Nn, hit, lum, head):
  """Hair share to add per texel: dark, side-facing head texels from 6 cm under the brow line to 4.5 cm over it, between
  1.2 cm (the front of the ear) and 8.5 cm ahead of the head centre and more than 5 cm out to the side (the brows and eye
  corners are nearer the middle and face forward), full under clean()'s darkness and fading out by half as bright again
  (the sideburn's half-dark edge texels otherwise drew a dark outline round the new hair)."""
  c, eye = head['centre'], head['eyeY']; x, y, z = P[..., 0] - c[0], P[..., 1] - eye, P[..., 2] - c[2]
  zone = hit & (H > .3) & (z > -.085) & (z < -.012) & (y > -.06) & (y < .045) & (np.abs(x) > .05) & (np.abs(Nn[..., 0]) > .25)
  return np.where(zone, np.clip((HAIR_DARK * 1.5 - lum) / (HAIR_DARK * .5), 0, 1), 0.)

def ear_specks(m1, P, H, hit, head):
  """Hair texels on the side of the head (5 cm out, from 9 cm under the brow line to 5 cm over it) wholly enclosed by
  skin in the atlas."""
  from scipy import ndimage
  c, eye = head['centre'], head['eyeY']; x, y = P[..., 0] - c[0], P[..., 1] - eye
  side = hit & (H > .3) & (np.abs(x) > .05) & (y > -.09) & (y < .05); skin = side & (m1[..., 0] > .5)
  return ndimage.binary_fill_holes(skin) & ~skin & side & (m1[..., 3] > .1)

if __name__ == '__main__':
  head = json.loads((ROOT / 'tools/golfer-rig.json').read_text())['head']
  for sfx, glb in (('', 'golfer.glb'), ('_lod', 'golfer-lod.glb')):
    # the masks hold 16 levels per channel (multiples of 16, pack-body-textures.py save()): the patch moves whole levels
    # between skin and hair, so their sum holds and a second run changes nothing
    mpath = ROOT / f'assets/textures/body/mask1{sfx}.png'; lv = np.asarray(Image.open(mpath).convert('RGBA')).astype(np.int32) // 16; N = lv.shape[0]
    alb = np.asarray(Image.open(ROOT / f'assets/textures/body/albedo{sfx}.webp').convert('RGB').resize((N, N), Image.BOX)).astype(np.float32) / 255
    lum = np.where(alb <= .04045, alb / 12.92, ((alb + .055) / 1.055) ** 2.4) @ np.array([.2126, .7152, .0722], np.float32)
    P, H, Nn, hit = texel_maps(ROOT / 'assets/models' / glb, N)
    speck = ear_specks(lv * 16 / 255, P, H, hit, head)
    want = np.round(sideburns(P, H, Nn, hit, lum, head) * 15).astype(np.int32)   # the sideburn's hair share, in levels
    add = np.minimum(np.maximum(want - lv[..., 3], 0), lv[..., 0]) - np.where(speck, lv[..., 3], 0)   # skin up to it; specks back to skin
    # gutters copy their nearest island texel in clean(): those beside a changed texel take the same change (mips stay on the island)
    from scipy import ndimage
    idx = ndimage.distance_transform_edt(~hit, return_distances=False, return_indices=True); add[~hit] = add[idx[0], idx[1]][~hit]
    add = np.clip(add, -lv[..., 3], lv[..., 0]); lv[..., 3] += add; lv[..., 0] -= add
    Image.fromarray((np.minimum(lv, 15) * 16).astype(np.uint8), 'RGBA').save(mpath, 'PNG', optimize=True)   # a speck whose skin and hair overlapped is full skin, not 256
    print(f'mask1{sfx}.png: {(hit & (add > 0)).sum()} texels to hair at the sideburns, {(hit & (add < 0)).sum()} ear specks to skin, {mpath.stat().st_size} bytes')
