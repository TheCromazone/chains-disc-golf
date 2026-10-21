"""Tileable birch bark for the Blender birches (assets/textures/foliage/bark_birch.webp), 512 around x 2048 along. The birch
wood UVs repeat every 2.5 m (build-trees.py's birch vscale); the runtime samples this tile at repeat 1 x .5 (course.js), so
it spans 5 m at the old 2.4 mm a texel and a 6 m stem shows about one repeat instead of three.
What the old tile did wrong (gauntlet r3 nature, trees 0/4, "birch bark reads as barcodes"): same-sized charcoal ellipses at
an even spacing, repeated every 2.5 m, so at 15-40 m a stem was white with evenly spaced black dashes. Disc Golf Masters'
birches are chalk white with grey-brown weathering, fine horizontal lenticels of every length and darkness that crowd in some
stretches and thin out in others, a few large black scars (old branch collars, fissure clusters) and long clean stretches.
So here: multi-scale lenticels whose density follows a slow field along the stem, dark marks clustered and of every size and
tone (most mid-grey, few black), and weathered grey bands.
  python tools/build-birch-bark.py assets/textures/foliage/bark_birch.webp [seed]"""
import sys, numpy as np
from PIL import Image
W, H = 512, 2048; rng = np.random.default_rng(int(sys.argv[2]) if len(sys.argv) > 2 else 11)
fy, fx = np.meshgrid(np.fft.fftfreq(H), np.fft.fftfreq(W), indexing='ij')
def field(sx, sy, p=2.):   # periodic band-limited noise, features ~sx x sy px, unit variance
  r = np.sqrt((fx * sx) ** 2 + (fy * sy) ** 2); n = np.fft.ifft2(np.fft.fft2(rng.standard_normal((H, W))) * np.exp(-r ** p * 4)).real
  return (n - n.mean()) / n.std()
low, mid, grain = field(300, 500), field(80, 30), field(5, 2)
img = np.array([.87, .86, .82])[None, None] * (1 + .04 * low[..., None] + .035 * mid[..., None] + .03 * grain[..., None])
band = np.clip(field(400, 14) * .8 + field(60, 8) * .4 - .7, 0, 1)[..., None]   # horizontal paper bands, peeling warm
img = img * (1 - .3 * band) + np.array([.78, .68, .58]) * .3 * band
grey = np.clip(field(220, 160) * .65 + field(50, 40) * .35 - .45, 0, 1)[..., None]   # weathered grey-green patches
img = img * (1 - .45 * grey) + np.array([.52, .53, .48]) * .45 * grey
crowd = field(400, 260)   # where marks gather along the stem: dense 30-80 cm stretches between clean ones
L = np.zeros((H, W)); C = np.zeros((H, W))   # mark strength, and how dark (0 grey-brown .. 1 black)
def dash(x, y, ln, th, a, dk):   # a horizontal lenticel, tapered at both ends, wrapping in x and y
  xs = (x + np.arange(ln)) % W; t = np.linspace(-1, 1, ln); k = a * (1 - t ** 6)
  for dy in range(th):
    yy = (y + dy) % H; kk = k * (1 - .5 * abs(dy - (th - 1) / 2) / max(th, 1))
    m = kk > L[yy, xs]; L[yy, xs[m]] = kk[m]; C[yy, xs[m]] = dk
for _ in range(3800):   # lenticels: 2-15 cm long, 2-10 mm thick, density and darkness both follow the crowd field
  x, y = int(rng.integers(0, W)), int(rng.integers(0, H)); c = crowd[y, x]
  if rng.random() > .06 + .94 / (1 + np.exp(-3.5 * (c - .35))): continue
  ln = int(rng.choice([rng.integers(6, 22), rng.integers(18, 64)], p=[.7, .3])); th = int(rng.choice([1, 2, 2, 3, 4]))
  dash(x, y, ln, th, rng.uniform(.2, .65), np.clip(rng.normal(.2 + .2 * c, .2), 0, 1))
S = np.zeros((H, W))
for _ in range(30):   # scars: dark chevrons and fissure clusters, 5-40 cm, black at the heart, gathered where the marks crowd
  for _ in range(20):
    x, y = int(rng.integers(0, W)), int(rng.integers(0, H))
    if crowd[y, x] > .1: break
  h = rng.uniform(4, 16); w = h * rng.uniform(2.5, 6); yy, xx = np.ogrid[:H, :W]
  dx = (xx - x + W / 2) % W - W / 2; dy = (yy - y + H / 2) % H - H / 2
  chev = rng.random() < .3   # a branch collar: the classic birch "eyebrow" arching over the scar
  e = (dx / w) ** 2 + ((dy + (np.abs(dx) * .18 if chev else 0)) / h) ** 2
  S = np.maximum(S, np.clip(1.25 - e, 0, 1) * rng.uniform(.55, 1.))
rough = field(10, 4) * .6 + field(30, 10) * .4
S = np.clip((S * (1 + .7 * rough) - .2) * 2., 0, 1)
dark = np.array([.17, .155, .14])[None, None] * (1 + .2 * field(6, 3)[..., None])   # charcoal with paler cracks
greybrown = np.array([.42, .37, .32])[None, None]
mark = greybrown * (1 - C[..., None]) + dark * C[..., None]
img = img * (1 - L[..., None]) + mark * L[..., None]
img = img * (1 - S[..., None]) + dark * S[..., None]
img = np.clip(img, 0, 1)
Image.fromarray((img * 255 + .5).astype(np.uint8)).save(sys.argv[1], quality=88, method=6)
print('mean', img.reshape(-1, 3).mean(0), 'marks', float((L > .3).mean()), 'scars', float((S > .5).mean()))
