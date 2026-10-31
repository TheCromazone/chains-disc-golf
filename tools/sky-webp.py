# Unreal sky panoramas (art/unreal/sky-render.sh -> ~/Documents/ChainsUnreal/Saved/Sky/<id>.hdr, a 2:1 equirect) to the
# game's dome textures: the upper hemisphere only, rows spaced by sin(elevation) (v = dir.y, so the shader needs no asin and
# the horizon, where the sky is mostly seen, gets ~1.6x the rows of a plain equirect), columns u = .5 - azimuth / 360
# (hole 1's direction in the middle, read as seen from inside). Stored in the game's own linear scene units over HEADROOM,
# sRGB-encoded, so the dome multiplies by HEADROOM and the frame's own tone mapping (ACES at .74 on Desktop, Mobile's
# CustomToneMapping grade) treats the clouds exactly like the rest of the scene; the grade below is set against what those
# produce. Alpha is the cloud mask (from the <id>-clear.hdr pass) the dome hides its sun disc behind.
#   python tools/sky-webp.py [pine meadow lake bluff]   -> assets/skies/<id>.webp (4096x1024), <id>-mobile.webp (2048x512),
#                                                          previews in art/qa/sky-pano/ (game tone map, for eyeballing)
#   python tools/sky-webp.py --from-webp [ids]          -> the same, re-graded from the shipped 4096 WebPs (the HDRs live on the
#                                                          Windows box): only the cumulus step and the shoulder run, once (EXIF tag)
import io, math, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.expanduser("~"), "Documents", "ChainsUnreal", "Saved", "Sky")
HEADROOM = 2.5       # src/course.js skyDome() multiplies the texture by this; clips under .1% (the brightest silver linings)
# The grade: the clear sky's median luminance 15-40 deg up (game linear), a tint on clear sky only (not on clouds), and a
# saturation boost about luminance. Both tiers' grades warm and desaturate bright tones: at .45 and as rendered the sky came
# out a cream-grey (~205, 205, 190); now Mobile shows ~(152, 168, 182) 20 deg up away from the sun and ~(81, 106, 147) at
# 40 deg, the reference's pale blue-grey low sky (~158, 169, 186) deepening overhead.
TARGET, TINT, SAT, CLOUD_SAT, LIFT = .24, np.array([1., .92, 1.03], np.float32), 1.3, .75, .55
SIZES = {"": (4096, 600_000), "-mobile": (2048, 200_000)}   # suffix: width, byte budget
# Degrees the cloud field is turned against the render (the dome's drift swings it +-12 anyway): Pine Hollow's first tee
# sees only a small window of sky beside the disc, which the render filled with one flat backlit heap; 8 deg puts a
# heap's silver edge against the glowing sky there at the start of a round.
YAW = {"pine": 8.}
# The cumulus step (gauntlet r4): the render's heaps read as dark grey-brown blobs on phones. Their bodies sat at the clear sky's
# own luminance (cloud/sky .91-.99 from 5 to 30 deg up) in a neutral grey that both tiers' warm grades (Mobile's gain
# 1.13/1.08/1, the warm highlight split) turn tan, and a backlit heap's flat grey core filled the top of the phone's putt frame
# as a muddy smear. Each cloud now takes its luminance relative to the clear sky behind it through Y' = sky * A * (Y / sky)^G
# (the shade lifted a little over the sky's level, the bright faces kept, contrast eased by 1 - G), measured over the cloud's
# neighbourhood (BASE px), so a silver rim keeps its lead over the core it frames (lifted texel by texel the core caught up with
# it and the rim read as a dark pink outline), and its shade takes COOL of the sky's own blue, SAT more saturated (sky light
# fills a cloud's shade, so it reads blue-grey, not brown, through the warm grade); the rims keep their gold. Applied as the
# change the cloud's core takes, times the cloud mask, so a soft edge composites between the new body and the sky.
CUMULUS = dict(A=1.6, G=.6, COOL=.3, SAT=1.1, BASE=10.)
TAG = "chains sky: cumulus 1"   # EXIF ImageDescription on graded files: --from-webp refuses to grade a file twice
LUM = np.array([.2126, .7152, .0722], np.float32)


def read_hdr(path):
    """Radiance RGBE (RLE scanlines) -> float32 HxWx3."""
    data = open(path, "rb").read()
    i = data.index(b"\n\n") + 2
    j = data.index(b"\n", i)
    _, h, _, w = data[i:j].split()
    h, w = int(h), int(w)
    buf = np.frombuffer(data, np.uint8, offset=j + 1)
    out = np.empty((h, w, 4), np.uint8)
    p = 0
    for y in range(h):
        if buf[p] == 2 and buf[p + 1] == 2:
            p += 4
            for c in range(4):
                row, x = out[y, :, c], 0
                while x < w:
                    n = int(buf[p]); p += 1
                    if n > 128:
                        n -= 128; row[x:x + n] = buf[p]; p += 1
                    else:
                        row[x:x + n] = buf[p:p + n]; p += n
                    x += n
        else:
            out[y] = buf[p:p + w * 4].reshape(w, 4); p += w * 4
    e = out[..., 3].astype(np.int32)
    return out[..., :3].astype(np.float32) * np.where(e > 0, np.ldexp(1.0, e - 136), 0.).astype(np.float32)[..., None]


def bilinear(im, x, y):
    h, w, _ = im.shape
    x0, y0 = np.floor(x).astype(int), np.clip(np.floor(y).astype(int), 0, h - 2)
    fx, fy = (x - x0)[..., None], np.clip(y - y0, 0, 1)[..., None]
    x0 %= w; x1 = (x0 + 1) % w
    return (im[y0, x0] * (1 - fx) + im[y0, x1] * fx) * (1 - fy) + (im[y0 + 1, x0] * (1 - fx) + im[y0 + 1, x1] * fx) * fy


def resample(src, W, yaw=0.):
    """Equirect (u = .75 - az/360, row 0 = zenith) -> W x W/4 dome texture, 3x3 supersampled."""
    H = W // 4
    hs, ws, _ = src.shape
    acc = np.zeros((H, W, 3), np.float32)
    for sy in (-1 / 3, 0, 1 / 3):
        for sx in (-1 / 3, 0, 1 / 3):
            u = (np.arange(W) + .5 + sx) / W
            v = 1 - (np.arange(H) + .5 + sy) / H
            az = (.5 - u) * 360. + yaw
            el = np.degrees(np.arcsin(np.clip(v, 0, 1)))
            xs = ((.75 - az / 360.) % 1.) * ws - .5
            ys = (90. - el) / 180. * hs - .5
            acc += bilinear(src, *np.meshgrid(xs, ys))
    return acc / 9.


def aces(c, exposure=.74):   # three.js ACESFilmicToneMapping
    c = c * exposure / .6
    c = c @ np.array([[.59719, .07600, .02840], [.35458, .90834, .13383], [.04823, .01566, .83777]], np.float32)
    c = (c * (c + .0245786) - .000090537) / (c * (.983729 * c + .4329510) + .238081)
    c = c @ np.array([[1.60475, -.10208, -.00327], [-.53108, 1.10813, -.07276], [-.07367, -.00605, 1.07602]], np.float32)
    return np.clip(c, 0, 1)


def srgb(c):
    return np.where(c <= .0031308, c * 12.92, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - .055)


def webp(rgb8, budget):
    """Highest quality (<= 92) that fits the byte budget, tagged as graded (TAG)."""
    im, best, exif = Image.fromarray(rgb8, "RGBA"), None, Image.Exif()
    exif[0x010e] = TAG
    for q in range(92, 30, -4):
        b = io.BytesIO(); im.save(b, "WEBP", quality=q, method=6, alpha_quality=60, exif=exif.tobytes())
        best = (b.getvalue(), q)
        if b.tell() <= budget:
            break
    return best


def box(a, r, axis):
    """Box filter of radius r px: columns wrap (azimuth), rows clamp."""
    n = a.shape[axis]
    p = np.concatenate([a[:, -r - 1:], a, a[:, :r]], 1) if axis == 1 else np.concatenate([np.repeat(a[:1], r + 1, 0), a, np.repeat(a[-1:], r, 0)], 0)
    c = np.cumsum(p, axis, dtype=np.float64)
    return ((np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis) - np.take(c, np.arange(n), axis)) / (2 * r + 1)).astype(np.float32)


def blur(a, s):   # three box passes ~ a Gaussian of sigma s px
    r = max(1, int(round((math.sqrt(4 * s * s + 1) - 1) / 2)))
    for _ in range(3):
        a = box(box(a, r, 1), r, 0)
    return a


def pushpull(c, w):
    """c (HxWx3) where the weight w is 1, filled elsewhere from its weighted neighbourhood, coarse to fine."""
    levels = [(c * w[..., None], w)]
    while min(levels[-1][1].shape) > 4:
        cs, ws = levels[-1]; h, ww = ws.shape[0] // 2 * 2, ws.shape[1] // 2 * 2
        levels.append((cs[:h, :ww].reshape(h // 2, 2, ww // 2, 2, 3).sum((1, 3)), ws[:h, :ww].reshape(h // 2, 2, ww // 2, 2).sum((1, 3))))
    est = levels[-1][0] / np.maximum(levels[-1][1], 1e-6)[..., None]
    for cs, ws in reversed(levels[:-1]):
        h, ww = ws.shape
        up = np.dstack([np.asarray(Image.fromarray(est[..., k].astype(np.float32)).resize((ww, h), Image.BILINEAR)) for k in range(3)])
        k = np.clip(ws, 0, 1)[..., None]
        est = cs / np.maximum(ws, 1e-6)[..., None] * k + up * (1 - k)
    return est


def extreme(a, r, f):
    """A max (f = np.maximum) or min filter over a (2r + 1)^2 box: columns wrap, rows clamp."""
    for _ in range(r):
        p = np.pad(a, ((1, 1), (0, 0)), mode="edge")
        a = f(f(p[:-2], p[2:]), a); a = f(f(np.roll(a, 1, 1), np.roll(a, -1, 1)), a)
    return a


def cumulus(lin, alpha):
    """The cumulus step (CUMULUS above) on the graded linear sky and its alpha."""
    y2 = np.clip(2 * (1 - alpha), 0, 1)
    t = .5 - np.sin(np.arcsin(np.clip(1 - 2 * y2, -1, 1)) / 3)   # the cloud mask: alpha = 1 - .5 * smoothstep(t), inverted
    # The mask measures how far a texel departs from the clear sky, so it drops to 0 along the line inside a heap where its gold
    # rim fades through the sky's brightness into the grey core: a grey closing (4 px) fills those lines without making a faint
    # cirrus streak solid (a hard one turned every streak into an opaque cut-out).
    t = np.maximum(t, blur(extreme(extreme(t, 4, np.maximum), 4, np.minimum), 1.5)).astype(np.float32)
    sky, lum, v = blur(t, 4) < .01, lin @ LUM, np.arange(lin.shape[0])   # clear texels, a few px off any cloud
    # The clear sky's luminance by elevation, the median of each band of 25 rows (filled outward from the clear texels, one dark
    # gap in a zenith deck spread over the whole deck and printed a dark stripe on it); its colour, for the shade's blue, from
    # the clear texels round each cloud.
    band = lambda i: slice(max(0, i - 12), i + 13)
    med = np.array([np.median(lum[band(i)][sky[band(i)]]) if sky[band(i)].sum() > 200 else np.nan for i in v])
    med = np.interp(v, v[~np.isnan(med)], med[~np.isnan(med)])
    clear = pushpull(lin, sky.astype(np.float32)); clear = np.dstack([blur(clear[..., k], 48) for k in range(3)])
    # Each soft edge takes the colour just inside its cloud, weighted by how much cloud a texel is: a thin cirrus streak that
    # never reaches a solid core keeps its own colour instead of a heap's from a distance.
    core = pushpull(lin, np.clip((t - .2) / .7, 0, 1).astype(np.float32))
    y = np.maximum(core @ LUM, 1e-5); r = y / np.maximum(med, 1e-4)[:, None]
    lift = CUMULUS["A"] * np.exp((CUMULUS["G"] - 1) * blur(np.log(r), CUMULUS["BASE"]))   # Y'/Y over the neighbourhood
    lit = np.clip((r - .9) / 1.7, 0, 1); lit = (lit * lit * (3 - 2 * lit))[..., None]   # 0 in the shade, 1 on the bright faces and rims
    hue = core / y[..., None]
    hue = hue + (clear / np.maximum(clear @ LUM, 1e-4)[..., None] - hue) * CUMULUS["COOL"] * (1 - lit)
    hy = (hue @ LUM)[..., None]; hue = hy + (hue - hy) * (1 + (CUMULUS["SAT"] - 1) * (1 - lit)); hue /= np.maximum(hue @ LUM, 1e-5)[..., None]
    new = np.maximum(hue * (y * lift)[..., None], 0)
    w = t * t * (3 - 2 * t)   # the change by how much cloud: a heap's body takes all of it, its soft edge composites into the sky
    return np.maximum(lin + (new - core) * w[..., None], 0)


def shoulder(lin, inverse=False):
    """A soft shoulder over .9: silver linings by the disc stay the brightest thing in the sky without the dome's own
    aureole on top blowing them out to a flat cream blob (blind critic, Pine's first tee). inverse: undo it (--from-webp)."""
    y = (lin @ LUM)[..., None]
    o = np.maximum(y - .9, 0)
    o = o / np.maximum(1 - o / .5, .02) if inverse else o / (1 + o / .5)
    return lin * (np.minimum(y, .9) + o) / np.maximum(y, 1e-6)


def grade(cid):
    """The Unreal render (SRC) to the graded linear sky and its cloud alpha."""
    src = read_hdr(os.path.join(SRC, cid + ".hdr"))
    lin = resample(src, 4096, YAW.get(cid, 0.))
    lum = lin @ LUM
    v = 1 - (np.arange(lin.shape[0]) + .5) / lin.shape[0]
    band = (v > math.sin(math.radians(15))) & (v < math.sin(math.radians(40)))
    gain = TARGET / float(np.median(lum[band]))
    lin *= gain
    p999 = float(np.percentile(lin, 99.9))
    print(f"{cid}: gain {gain:.4g}, 99.9th pct {p999:.3f} (headroom {HEADROOM}), clipped {float((lin > HEADROOM).mean()) * 100:.3f}%")
    # Alpha: 1 in clear sky, .5 under cloud (the dome hides its disc there), from how far the render departs from the
    # same sky rendered clear. Never below .5, so a browser that round-trips the image through premultiplied alpha
    # costs the clouds at most one bit and leaves the clear sky exact.
    clear_rgb = resample(read_hdr(os.path.join(SRC, cid + "-clear.hdr")), 4096, YAW.get(cid, 0.)) * gain
    clear = clear_rgb @ LUM
    t = np.clip((np.abs(lum * gain - clear) / np.maximum(clear, 1e-4) - .04) / .26, 0, 1)
    alpha = 1 - .5 * t * t * (3 - 2 * t)
    # Heaps toward the sun came out as dark grey blobs with gold rims (the engine's multiple scattering is thin): a
    # cloud darker than the sky behind it gets back LIFT of the luminance difference, as neutral grey (the sky's own
    # blue made the cores look see-through), so backlit cores read silver-grey.
    lin += (t * LIFT * np.maximum(clear - lum * gain, 0))[..., None]
    lin *= TINT + (1 - TINT) * (2 - 2 * alpha)[..., None]
    y = (lin @ LUM)[..., None]
    lin = np.maximum(y + (lin - y) * (SAT + (CLOUD_SAT - SAT) * t)[..., None], 0)   # the sky bluer, the clouds' low-sun gold rims calmer
    print(f"  cloud cover above 7 deg: {float((t[v > .12] > .5).mean()) * 100:.0f}%")
    return lin, alpha


def from_webp(cid):
    """The shipped 4096 WebP back to the graded linear sky (shoulder undone) and its alpha."""
    im = Image.open(os.path.join(ROOT, "assets", "skies", cid + ".webp"))
    if im.getexif().get(0x010e) == TAG:
        sys.exit(f"{cid}.webp already carries the cumulus step ({TAG}): re-render, or check out the file from before it")
    a = np.asarray(im.convert("RGBA")).astype(np.float32) / 255
    s = a[..., :3]
    lin = np.where(s <= .04045, s / 12.92, ((s + .055) / 1.055) ** 2.4).astype(np.float32) * HEADROOM
    return shoulder(lin, inverse=True), a[..., 3]


def main(ids, from_shipped=False):
    prev = os.path.join(ROOT, "art", "qa", "sky-pano"); os.makedirs(prev, exist_ok=True)
    for cid in ids:
        lin, alpha = from_webp(cid) if from_shipped else grade(cid)
        lin = shoulder(cumulus(lin, alpha))
        enc = np.clip(np.dstack([srgb(np.clip(lin / HEADROOM, 0, 1)), alpha]) * 255 + .5, 0, 255).astype(np.uint8)
        for suf, (W, budget) in SIZES.items():
            img = enc if W == 4096 else np.asarray(Image.fromarray(enc, "RGBA").resize((W, W // 4), Image.LANCZOS))
            data, q = webp(img, budget)
            with open(os.path.join(ROOT, "assets", "skies", f"{cid}{suf}.webp"), "wb") as f:
                f.write(data)
            print(f"  assets/skies/{cid}{suf}.webp {W}x{W // 4} q{q} {len(data) / 1000:.0f} KB")
        Image.fromarray((srgb(aces(lin)) * 255 + .5).astype(np.uint8)).save(os.path.join(prev, f"{cid}-aces.jpg"), quality=90)


if __name__ == "__main__":
    ids = [a for a in sys.argv[1:] if not a.startswith("--")]
    main(ids or ["pine", "meadow", "lake", "bluff"], "--from-webp" in sys.argv)
