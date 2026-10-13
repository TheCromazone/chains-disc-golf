"""Package the original painted tiles as compact, neutral detail maps.

python tools/texture-pack.py --import-generated imports the image_gen outputs once.
python tools/texture-pack.py rebuilds runtime tiles from the checked-in authoring masters.
Only resizing / grayscale neutral-point normalization and JPEG encoding occur here;
the actual marks are image_gen art. Mid-grey128 leaves the shader palette unchanged.
"""
from pathlib import Path
import argparse, hashlib, json
from PIL import Image, ImageStat

root = Path(__file__).resolve().parents[1]
art = root / 'art/textures/r3'
out = root / 'assets/textures/r3'
out.mkdir(parents=True, exist_ok=True)
ap = argparse.ArgumentParser()
ap.add_argument('--import-generated', action='store_true')
ap.add_argument('--ground', action='store_true', help='rebuild the gravel and litter tiles + normals from art/textures/ground')
args = ap.parse_args()

# Ground tiles: Qwen-Image 2.1 photos (ComfyUI, prompts in art/textures/ground/prompts.json) made seamless and given a
# world-space normal map. Seams: blend each axis in turn with its half-offset copy, choosing per pebble by height
# (luminance) inside a noisy band, so a border never ghosts two half-pebbles over each other. Normal: R,G = the
# height's slope along world +x and +z (the tile is laid on the ground as texture2D(t, xz/s) with flipY), B = 1.
def ground_tiles():
    import numpy as np
    from scipy.ndimage import gaussian_filter
    src = root / 'art/textures/ground'
    for name, entry in json.loads((src / 'prompts.json').read_text())['tiles'].items():
        a = np.asarray(Image.open(src / entry['master']).convert('RGB').resize((1024, 1024), Image.Resampling.LANCZOS), np.float64) / 255
        n = a.shape[0]; rng = np.random.default_rng(7)
        h = lambda im: gaussian_filter(im.mean(2), 2)
        jitter = gaussian_filter(rng.standard_normal((n, n)), 18, mode='wrap'); jitter /= np.abs(jitter).max()
        d = np.minimum(np.arange(n), n - 1 - np.arange(n)) / n   # 0 at the border, .5 mid-tile
        for axis in (1, 0):
            b = np.roll(a, n // 2, axis); dd = d[None, :] if axis == 1 else d[:, None]
            w = np.clip((dd + jitter * .05 - .1) / .08, 0, 1)   # 1 = keep a (mid-tile), 0 = the copy whose seam sits mid-tile
            w = np.clip((w - .5) * 4 + (h(a) - h(b)) * 6 + .5, 0, 1)[..., None]   # whole pebbles/chips win, no ghosts
            a = a * w + b * (1 - w)
        a = np.clip(a.mean((0, 1)) + (a - a.mean((0, 1))) * entry.get('contrast', 1), 0, 1)   # pebbles read at 10 m only with dark gaps between them
        lin = a ** 2.2; lin *= np.array(entry['mean']) / lin.reshape(-1, 3).mean(0)   # the shader's albedo is the tile's linear mean
        Image.fromarray((np.clip(lin, 0, 1) ** (1 / 2.2) * 255 + .5).astype(np.uint8)).save(root / f'assets/textures/{name}.jpg', quality=88, optimize=True)
        ht = gaussian_filter(a.mean(2), 1.2, mode='wrap') * entry['relief']   # brighter = higher: pebble tops, chips over the dark gaps
        gx = (np.roll(ht, -1, 1) - np.roll(ht, 1, 1)) * n / 2; gy = (np.roll(ht, -1, 0) - np.roll(ht, 1, 0)) * n / 2
        nrm = np.stack([-gx, gy, np.ones_like(gx)], -1); nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)   # image down = world -z
        Image.fromarray((nrm * 127.5 + 127.5).astype(np.uint8)).resize((512, 512), Image.Resampling.LANCZOS).save(root / f'assets/textures/{name}_normal.jpg', quality=90)
        print(name, (lin.reshape(-1, 3).mean(0)).round(4), 'normal xy rms', np.sqrt((nrm[..., :2] ** 2).mean()).round(3))
if args.ground: ground_tiles(); raise SystemExit
provenance = json.loads((art / 'prompts.json').read_text())
report = []
for entry in provenance['tiles']:
    name = entry['name']
    master = art / f'{name}.jpg'
    if args.import_generated:
        source = Path(entry['generatedPath'])
        entry['generatedSha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
        with Image.open(source) as im:
            im.convert('L').resize((512,512), Image.Resampling.LANCZOS).save(master, quality=94, optimize=True)
    with Image.open(master) as im:
        tile = im.convert('L').resize((256,256), Image.Resampling.LANCZOS)
        neutral = ImageStat.Stat(tile).mean[0]
        tile = tile.point(lambda p: round(max(0, min(255, p-neutral+128))))
        tile.save(out / f'{name}.jpg', quality=86, optimize=True)
        stats = ImageStat.Stat(tile)
        report.append({'name':name, 'bytes':(out / f'{name}.jpg').stat().st_size,
                       'size':[256,256], 'mean':round(stats.mean[0],2), 'stddev':round(stats.stddev[0],2)})
if args.import_generated:
    (art / 'prompts.json').write_text(json.dumps(provenance, indent=2)+'\n')
(out / 'build-report.json').write_text(json.dumps({'tiles':report, 'totalBytes':sum(r['bytes'] for r in report)},indent=2)+'\n')
print(json.dumps(report,indent=2))
