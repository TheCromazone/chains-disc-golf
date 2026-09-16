"""Runtime body textures from the Blender masters (tools/build-golfer-v3.py writes art/blender/golfer-v3[-f]-textures/).
Run: python tools/pack-body-textures.py [--variant f]
Full tier: 2048 albedo (WebP, AO folded in), 2048 tangent normal (WebP), 1024 region masks (PNG, RGBA).
Lite tier: the LOD body's own 1024 albedo and 512 masks (its UV layout differs), no normal map.
Prints the byte sizes the asset test budgets against and registers the files in assets/manifest.json.
"""
from pathlib import Path
from PIL import Image, ImageOps
import json, sys
ROOT = Path(__file__).resolve().parents[1]
VARIANT = sys.argv[sys.argv.index('--variant') + 1] if '--variant' in sys.argv else 'm'
TAG = '' if VARIANT == 'm' else '-' + VARIANT; KEY = 'body_' if VARIANT == 'm' else f'body_{VARIANT}_'
SRC = ROOT / f'art/blender/golfer-v3{TAG}-textures'; OUT = ROOT / f'assets/textures/body{TAG}'; OUT.mkdir(parents=True, exist_ok=True)
sizes = {}
def save(img, name, size, fmt, **kw):
  # masks are four independent channels: Pillow resamples RGBA through premultiplied alpha, which would erase RGB where alpha is 0
  im = img if img.size[0] == size else Image.merge(img.mode, [ch.resize((size, size), Image.LANCZOS) for ch in img.split()])
  if fmt == 'PNG': im = Image.merge(im.mode, [ImageOps.posterize(ch, 6 if name.startswith('mask2') and i == 3 else 4) for i, ch in enumerate(im.split())])   # soft masks survive 16 levels (PNG shrinks 2-3x); the beard channel keeps 64 for its zone id + feather
  path = OUT / name; im.save(path, fmt, **kw); sizes[name] = path.stat().st_size; return path
save(Image.open(SRC / 'albedo.png').convert('RGB'), 'albedo.webp', 2048, 'WEBP', quality=78, method=5)
save(Image.open(SRC / 'albedo_lod.png').convert('RGB'), 'albedo_lod.webp', 1024, 'WEBP', quality=76, method=5)
save(Image.open(SRC / 'normal.png').convert('RGB'), 'normal.webp', 2048, 'WEBP', quality=80, method=5)
for name in ('mask1', 'mask2'):
  save(Image.open(SRC / f'{name}.png').convert('RGBA'), name + '.png', 1024, 'PNG', optimize=True)
  save(Image.open(SRC / f'{name}_lod.png').convert('RGBA'), name + '_lod.png', 512, 'PNG', optimize=True)
manifest = ROOT / 'assets/manifest.json'; doc = json.loads(manifest.read_text())
for key, file in (('albedo', 'albedo.webp'), ('albedo_lod', 'albedo_lod.webp'), ('normal', 'normal.webp'), ('mask1', 'mask1.png'), ('mask2', 'mask2.png'), ('mask1_lod', 'mask1_lod.png'), ('mask2_lod', 'mask2_lod.png')):
  doc['textures'][KEY + key] = f'textures/body{TAG}/' + file
manifest.write_text(json.dumps(doc, indent=2) + '\n')
print(json.dumps(sizes, indent=1)); print('total', sum(sizes.values()))
