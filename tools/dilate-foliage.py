"""Refill the colour under the transparent texels of the foliage atlases (leaves, impostors, impostors_n), cell by cell.
Run: python3 tools/dilate-foliage.py   (after tools/build-foliage.py or tools/build-trees.py; Pillow + numpy)

The builds bleed each leaf's colour 24 texels past its edge, but the lossy WebP encoder then rewrote every fully transparent
8 x 8 block ("cleanup transparent area": it copies the block to its left), so the atlases carried horizontal streaks of
whatever touched the cell's edge: the spruce and Scots pine cells' tan, pink and orange twig and sprig colours, the birch
impostors' white bark. A crown's coverage edge is where the mip chain averages those texels in, so on a phone (whose leaves
read 1.5 mips softer) every card wore a pale cream rim, a cut-out's outline (gauntlet r4), and an impostor's normals and
crown depth bent at its silhouette. A push-pull fill (coverage-weighted means down a pyramid, laid back under each level's
holes) gives every hidden texel the colour of the leaves nearest it at every scale, and the file keeps it (exact=True).
The coverage fringe leans to the same fill: under alpha .75 the pine sprig photo's keyed edge is grey-tan with pink flecks
(104, 102, 85 at alpha .25-.5 against the frond's 72, 83, 52), and alpha-to-coverage draws that band as the card's outline.
impostors_n's alpha is the leaf mask, not coverage: its rgb is refilled under impostors.webp's coverage and its alpha kept.
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]; DIR = ROOT / 'assets/textures/foliage'
lin = lambda x: np.where(x <= .04045, x / 12.92, ((x + .055) / 1.055) ** 2.4)
srgb = lambda x: np.where(x <= .0031308, x * 12.92, 1.055 * np.power(np.clip(x, 0, 1), 1 / 2.4) - .055)
ramp = lambda a, lo, hi: np.clip((a - lo) / (hi - lo), 0, 1) ** 2 * (3 - 2 * np.clip((a - lo) / (hi - lo), 0, 1))
box = lambda a: (a[0::2, 0::2] + a[1::2, 0::2] + a[0::2, 1::2] + a[1::2, 1::2]) / 4

def pushpull(rgb, w):
  """rgb (h, w, c), weights w (h, w) in 0..1, h and w powers of two: the weighted colour everywhere."""
  P, W = [rgb * w[..., None]], [w]
  while min(W[-1].shape) > 1: P.append(box(P[-1])); W.append(box(W[-1]))
  C = P[-1] / np.maximum(W[-1], 1e-6)[..., None]
  for p, q in zip(P[-2::-1], W[-2::-1]):
    up = C.repeat(2, 0).repeat(2, 1)
    C = p + (1 - q)[..., None] * up   # the premultiplied mean where there are leaves, the coarser fill where they are missing
  return C

def refill(rgb, cov, cells, colour=True):
  out = rgb.copy(); h, w = cov.shape
  for y0 in range(0, h, cells[1]):
    for x0 in range(0, w, cells[0]):
      s = np.s_[y0:y0 + cells[1], x0:x0 + cells[0]]; a = cov[s]
      if not (a > 0).any(): continue
      src = lin(rgb[s]) if colour else rgb[s]
      fill = pushpull(src, ramp(a, .5, .9)); fill = srgb(fill) if colour else fill   # from the leaves' solid texels only
      k = ramp(a, .25, .75)[..., None]; out[s] = fill * (1 - k) + rgb[s] * k   # the fringe (alpha under .75) leans to it too
  return out

def load(name): return np.asarray(Image.open(DIR / name).convert('RGBA')).astype(np.float64) / 255

def save(name, arr):
  Image.fromarray(np.round(np.clip(arr, 0, 1) * 255).astype(np.uint8)).save(DIR / name, 'WEBP', quality=92, method=6, exact=True)

if __name__ == '__main__':
  leaves = load('leaves.webp'); leaves[..., :3] = refill(leaves[..., :3], leaves[..., 3], (512, 512)); save('leaves.webp', leaves)
  imp = load('impostors.webp'), load('impostors_n.webp')
  cov = imp[0][..., 3]; cell = (imp[0].shape[1] // 4, imp[0].shape[0] // 3)   # 4 across, IMPOSTOR_ROWS (3) up
  imp[0][..., :3] = refill(imp[0][..., :3], cov, cell); save('impostors.webp', imp[0])
  imp[1][..., :3] = refill(imp[1][..., :3], cov, cell, colour=False); save('impostors_n.webp', imp[1])
  print('refilled leaves.webp, impostors.webp, impostors_n.webp')
