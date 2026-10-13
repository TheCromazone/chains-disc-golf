# Unreal sky panoramas (art/unreal/sky-render.sh -> ~/Documents/ChainsUnreal/Saved/Sky/<id>.hdr, a 2:1 equirect) to the
# game's dome textures: the upper hemisphere only, rows spaced by sin(elevation) (v = dir.y, so the shader needs no asin and
# the horizon, where the sky is mostly seen, gets ~1.6x the rows of a plain equirect), columns u = .5 - azimuth / 360
# (hole 1's direction in the middle, read as seen from inside). Stored in the game's own linear scene units over HEADROOM,
# sRGB-encoded, so the dome multiplies by HEADROOM and the frame's own tone mapping (ACES at .74 on Desktop, Mobile's
# CustomToneMapping grade) treats the clouds exactly like the rest of the scene; the grade below is set against what those
# produce. Alpha is the cloud mask (from the <id>-clear.hdr pass) the dome hides its sun disc behind.
#   python tools/sky-webp.py [pine meadow lake bluff]   -> assets/skies/<id>.webp (4096x1024), <id>-mobile.webp (2048x512),
#                                                          previews in art/qa/sky-pano/ (game tone map, for eyeballing)
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
    """Highest quality (<= 92) that fits the byte budget."""
    im, best = Image.fromarray(rgb8, "RGBA"), None
    for q in range(92, 30, -4):
        b = io.BytesIO(); im.save(b, "WEBP", quality=q, method=6, alpha_quality=60)
        best = (b.getvalue(), q)
        if b.tell() <= budget:
            break
    return best


def main(ids):
    prev = os.path.join(ROOT, "art", "qa", "sky-pano"); os.makedirs(prev, exist_ok=True)
    for cid in ids:
        src = read_hdr(os.path.join(SRC, cid + ".hdr"))
        lin = resample(src, 4096, YAW.get(cid, 0.))
        lum = lin @ np.array([.2126, .7152, .0722], np.float32)
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
        clear = clear_rgb @ np.array([.2126, .7152, .0722], np.float32)
        t = np.clip((np.abs(lum * gain - clear) / np.maximum(clear, 1e-4) - .04) / .26, 0, 1)
        alpha = 1 - .5 * t * t * (3 - 2 * t)
        # Heaps toward the sun came out as dark grey blobs with gold rims (the engine's multiple scattering is thin): a
        # cloud darker than the sky behind it gets back LIFT of the luminance difference, as neutral grey (the sky's own
        # blue made the cores look see-through), so backlit cores read silver-grey.
        lin += (t * LIFT * np.maximum(clear - lum * gain, 0))[..., None]
        lin *= TINT + (1 - TINT) * (2 - 2 * alpha)[..., None]
        y = (lin @ np.array([.2126, .7152, .0722], np.float32))[..., None]
        lin = np.maximum(y + (lin - y) * (SAT + (CLOUD_SAT - SAT) * t)[..., None], 0)   # the sky bluer, the clouds' low-sun gold rims calmer
        print(f"  cloud cover above 7 deg: {float((t[v > .12] > .5).mean()) * 100:.0f}%")
        enc = np.clip(np.dstack([srgb(np.clip(lin / HEADROOM, 0, 1)), alpha]) * 255 + .5, 0, 255).astype(np.uint8)
        for suf, (W, budget) in SIZES.items():
            img = enc if W == 4096 else np.asarray(Image.fromarray(enc, "RGBA").resize((W, W // 4), Image.LANCZOS))
            data, q = webp(img, budget)
            with open(os.path.join(ROOT, "assets", "skies", f"{cid}{suf}.webp"), "wb") as f:
                f.write(data)
            print(f"  assets/skies/{cid}{suf}.webp {W}x{W // 4} q{q} {len(data) / 1000:.0f} KB")
        Image.fromarray((srgb(aces(lin)) * 255 + .5).astype(np.uint8)).save(os.path.join(prev, f"{cid}-aces.jpg"), quality=90)


if __name__ == "__main__":
    main(sys.argv[1:] or ["pine", "meadow", "lake", "bluff"])
