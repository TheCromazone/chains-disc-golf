"""Reverse-engineer the reference look as numbers: the same statistics for Disc Golf Masters' 1080p frames and ours.

  python tools/gauntlet/forensics.py <capture_dir> [--json out.json]

Per moment (tee, putt) it prints, for the reference frames and for our phone/ and desktop/ captures: luma percentiles,
share of deep shadow and of clipped highlights, mean saturation, foliage hue and saturation, highlight-vs-shadow colour
temperature (split tone), local contrast (std of luma in 32 px blocks), fine detail (variance of the Laplacian) and
edge density. The HUD regions (top 14 %, bottom 22 %) are masked out of every frame so UI does not count as image.
"""
import argparse, json, pathlib, subprocess
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
def _main_checkout():
    git = subprocess.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], capture_output=True, text=True, cwd=ROOT).stdout.strip()
    return pathlib.Path(git).parent if git else ROOT
FRAMES = next(r / 'art/reference/dgm-1080/frames' for r in (ROOT, _main_checkout()) if (r / 'art/reference/dgm-1080/frames').exists())
REFS = {'tee': ['tee-hole1', 'tee-hole2', 'tee-hole1-b', 'tee-hole2-b', 'tee-hole3-b'], 'putt': ['putt', 'putt-b']}

def stats(path):
    im = np.asarray(Image.open(path).convert('RGB').resize((1920, 1080)), dtype=np.float32) / 255
    im = im[int(1080 * .14):int(1080 * .78)]   # drop the HUD bands
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    lum = .2126 * r + .7152 * g + .0722 * b
    mx, mn = im.max(-1), im.min(-1); sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    hue = np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) % 360
    foliage = (g > r) & (g > b) & (sat > .15) & (lum > .05)
    hi, lo = lum > np.percentile(lum, 85), lum < np.percentile(lum, 15)
    temp = lambda m: float((r[m].mean() + 1e-3) / (b[m].mean() + 1e-3))
    h, w = lum.shape; blocks = lum[:h // 32 * 32, :w // 32 * 32].reshape(h // 32, 32, w // 32, 32)
    lap = lum[1:-1, 1:-1] * 4 - lum[:-2, 1:-1] - lum[2:, 1:-1] - lum[1:-1, :-2] - lum[1:-1, 2:]
    gx, gy = np.abs(np.diff(lum, axis=1))[:-1], np.abs(np.diff(lum, axis=0))[:, :-1]
    return {
        'p5': np.percentile(lum, 5), 'p50': np.percentile(lum, 50), 'p95': np.percentile(lum, 95),
        'shadow%': (lum < .12).mean() * 100, 'clip%': (mx > .98).mean() * 100, 'sat': sat.mean(),
        'fol_hue': hue[foliage].mean() if foliage.any() else 0, 'fol_sat': sat[foliage].mean() if foliage.any() else 0, 'fol%': foliage.mean() * 100,
        'warm_hi': temp(hi), 'warm_lo': temp(lo), 'loc_con': blocks.std(axis=(1, 3)).mean(), 'detail': lap.var() * 1e3, 'edges%': ((gx + gy) > .12).mean() * 100,
    }

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('cap'); ap.add_argument('--json'); a = ap.parse_args()
    cap = pathlib.Path(a.cap) if pathlib.Path(a.cap).is_absolute() else ROOT / a.cap
    out = {}
    for moment, refs in REFS.items():
        rows = {'DGM (mean of %d)' % len(refs): {k: float(np.mean([stats(FRAMES / f'{n}.jpg')[k] for n in refs])) for k in stats(FRAMES / f'{refs[0]}.jpg')}}
        for tier in ('phone', 'desktop'):
            p = cap / tier / f'{moment}.jpeg'
            if p.exists(): rows[f'ours {tier}'] = {k: float(v) for k, v in stats(p).items()}
        out[moment] = rows
        keys = list(next(iter(rows.values())))
        print(f'\n{moment.upper():<20}' + ''.join(f'{k:>9}' for k in keys))
        for name, s in rows.items(): print(f'{name:<20}' + ''.join(f'{s[k]:9.2f}' if abs(s[k]) < 1000 else f'{s[k]:9.0f}' for k in keys))
    if a.json: pathlib.Path(a.json).write_text(json.dumps(out, indent=1))

if __name__ == '__main__':
    main()
