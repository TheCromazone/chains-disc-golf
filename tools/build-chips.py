"""Wood-chip mulch detail tile for the putting circle's litter, near the camera (src/materials.js, terrainSplat).

  python tools/build-chips.py   ->  assets/textures/chips.webp (albedo, cavities baked in) + chips_n.webp (normal, linear)

The litter photo (litter.jpg) is flat: no relief, no shadow between pieces, and at 2.3 m a tile it is magnified ~1.5x in
front of the putt lens, so the critics saw "a soft, blurry decal" against Disc Golf Masters' dense, sharp, lit mulch. This
tile is 1024 px over 0.7 m (~1450 px/m, a 3 cm chip ~40 px): ~9000 chips, bark flakes and twigs stacked with a z-buffer on dark
soil, each a tilted, slightly domed slab with wood grain along its length. The height field gives the normal map (the sun lights
one side of every chip and the shader's own light does the rest) and the cavities (soil and the gaps under chips go dark).
Seamless: every chip wraps. Deterministic (seeded). The shader divides the albedo by MEAN (printed) so the tile only adds
detail and the litter keeps its palette at every distance.
"""
import pathlib, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

N, ROOT = 1024, pathlib.Path(__file__).resolve().parents[1]
rng = np.random.default_rng(7)
H = np.zeros((N, N), np.float32)   # height in pixels
A = np.zeros((N, N, 3), np.float32)
soil = gaussian_filter(rng.random((N, N)).astype(np.float32), 2, mode='wrap')
A[:] = np.array([.055, .038, .026])   # dark damp soil between the pieces
A *=(.75 + .5 * (soil - soil.min()) / np.ptp(soil))[..., None]
H[:] = soil * 2.

# linear albedo: weathered tan, mid brown, grey-brown, reddish bark, fresh pale wood, damp dark; weights
PAL = [(.30, (.30, .21, .13)), (.24, (.20, .135, .08)), (.14, (.22, .19, .15)), (.12, (.15, .085, .05)), (.05, (.40, .30, .19)), (.10, (.09, .065, .045))]
pw = np.array([w for w, _ in PAL]); pw /= pw.sum(); pc = np.array([c for _, c in PAL])

def chip(cx, cy, L, W, ang, h0, col, kind):
    r = int(max(L, W) * .55) + 3
    xs = np.arange(int(cx) - r, int(cx) + r + 1); ys = np.arange(int(cy) - r, int(cy) + r + 1)
    X, Y = np.meshgrid(xs - cx, ys - cy)
    ca, sa = np.cos(ang), np.sin(ang)
    u, v = X * ca + Y * sa, -X * sa + Y * ca   # u along the chip
    sk = rng.uniform(-.35, .35); t = np.clip(2 * np.abs(u - sk * v) / L, 0, 1.5)   # sheared: splinters end in a slanted break
    fib = lambda q, step, amp: 1 + amp * np.interp(q, np.arange(-r - 4, r + 5, step), rng.normal(0, 1, len(np.arange(-r - 4, r + 5, step))))
    jag = fib(u, 3., .1) if kind != 'twig' else 1   # torn, fibrous edges, not a clean outline
    half = W / 2 * np.where(t < 1, np.clip(1 - t ** (1.6 if kind == 'chip' else 5), 0, 1) ** .5, 0) * jag
    m = np.abs(v) < half
    if not m.any(): return
    tilt = rng.normal(0, .25, 2)
    z = h0 + tilt[0] * u + tilt[1] * v + (W * .22 if kind != 'flake' else W * .08) * np.clip(1 - (v / np.maximum(half, 1e-3)) ** 2, 0, 1)
    gy, gx = np.ix_(ys % N, xs % N)
    hz = H[gy, gx]; up = m & (z > hz)
    if not up.any(): return
    grain = fib(v + .04 * u * rng.normal(), 1.6, .11) * fib(v, 4.5, .07)   # irregular fibres along the length
    edge = np.clip(1 - np.abs(v) / np.maximum(half, 1e-3), 0, 1)
    shade = grain * (.82 + .18 * np.sqrt(edge))   # a chip's torn rim a touch darker
    a = A[gy, gx]; a[up] = col * shade[up][:, None]; A[gy, gx] = a
    hz[up] = z[up]; H[gy, gx] = hz

order = []
for layer in range(4):   # bottom layers are older, darker, flatter; the top layer is fresh pale chips
    n = [1800, 2600, 2600, 1700][layer]
    for _ in range(n): order.append(layer)
for i, layer in enumerate(order):
    cx, cy = rng.uniform(0, N, 2); ang = rng.uniform(0, np.pi)
    k = rng.random()
    if k < .04: kind, L, W = 'twig', rng.uniform(90, 260), rng.uniform(3.5, 6)
    elif k < .16: kind, L, W = 'flake', rng.uniform(35, 85), rng.uniform(18, 40)   # bark flakes: broad, thin, dark
    else: kind, L, W = 'chip', rng.uniform(20, 70), 0
    if kind == 'chip': W = L * rng.uniform(.16, .38)
    col = pc[rng.choice(len(pc), p=pw)] * rng.uniform(.8, 1.18)
    if kind == 'flake': col = np.array([.11, .07, .045]) * rng.uniform(.7, 1.3)
    if kind == 'twig': col = np.array([.13, .09, .06]) * rng.uniform(.7, 1.2)
    col = col * (.72 + .1 * layer)   # buried pieces sit in the damp
    chip(cx, cy, L, W, ang, layer * 3.5 + rng.uniform(0, 3), col, kind)

# cavities: below the local mean height goes dark (soil and the undersides between pieces), two scales
ao = np.clip(1 + (H - gaussian_filter(H, 5, mode='wrap')) * .07, .35, 1.08) * np.clip(1 + (H - gaussian_filter(H, 18, mode='wrap')) * .025, .55, 1.06)
A *= ao[..., None]
# normals from the height field (wrapped central differences): x along +u (world +x), y along +v (world +z)
Hs = gaussian_filter(H, .7, mode='wrap')
dx = (np.roll(Hs, -1, 1) - np.roll(Hs, 1, 1)) * .5; dy = (np.roll(Hs, -1, 0) - np.roll(Hs, 1, 0)) * .5
n = np.dstack([-dx * .35, -dy * .35, np.ones_like(H)]); n /= np.linalg.norm(n, axis=2, keepdims=True)

mean = A.reshape(-1, 3).mean(0); print('MEAN', np.round(mean, 4).tolist())
srgb = np.where(A <= .0031308, A * 12.92, 1.055 * np.power(np.clip(A, 0, 1), 1 / 2.4) - .055)
out = ROOT / 'assets/textures'
Image.fromarray((np.clip(srgb, 0, 1) * 255 + .5).astype(np.uint8)).save(out / 'chips.webp', quality=90, method=6)
Image.fromarray((np.clip(n * .5 + .5, 0, 1) * 255 + .5).astype(np.uint8)).save(out / 'chips_n.webp', quality=92, method=6)
