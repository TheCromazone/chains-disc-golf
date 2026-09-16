"""Runtime body textures from the Blender masters (tools/build-golfer-v3.py writes art/blender/golfer-v3-textures/).
Run: python tools/pack-body-textures.py
Full tier: 2048 albedo (WebP, AO folded in), 2048 tangent normal (WebP), 1024 region masks (PNG, RGBA).
Lite tier: 1024 albedo, 512 masks, no normal map. Prints the byte sizes the asset test budgets against.
"""
from pathlib import Path
from PIL import Image, ImageOps
import json
ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'art/blender/golfer-v3-textures'; OUT = ROOT / 'assets/textures/body'; OUT.mkdir(parents=True, exist_ok=True)
sizes = {}
def save(img, name, size, fmt, **kw):
  # masks are four independent channels: Pillow resamples RGBA through premultiplied alpha, which would erase RGB where alpha is 0
  im = img if img.size[0] == size else Image.merge(img.mode, [ch.resize((size, size), Image.LANCZOS) for ch in img.split()])
  if fmt == 'PNG': im = Image.merge(im.mode, [ImageOps.posterize(ch, 4) for ch in im.split()])   # soft masks survive 16 levels; PNG shrinks 2-3x
  path = OUT / name; im.save(path, fmt, **kw); sizes[name] = path.stat().st_size; return path
alb = Image.open(SRC / 'albedo.png').convert('RGB'); nrm = Image.open(SRC / 'normal.png').convert('RGB')
m1 = Image.open(SRC / 'mask1.png').convert('RGBA'); m2 = Image.open(SRC / 'mask2.png').convert('RGBA')
save(alb, 'albedo.webp', 2048, 'WEBP', quality=78, method=5)
save(alb, 'albedo_lod.webp', 1024, 'WEBP', quality=76, method=5)
save(nrm, 'normal.webp', 2048, 'WEBP', quality=80, method=5)
for name, im in (('mask1', m1), ('mask2', m2)):
  save(im, name + '.png', 1024, 'PNG', optimize=True); save(im, name + '_lod.png', 512, 'PNG', optimize=True)
manifest = ROOT / 'assets/manifest.json'; doc = json.loads(manifest.read_text())
for key, file in (('body_albedo', 'albedo.webp'), ('body_albedo_lod', 'albedo_lod.webp'), ('body_normal', 'normal.webp'), ('body_mask1', 'mask1.png'), ('body_mask2', 'mask2.png'), ('body_mask1_lod', 'mask1_lod.png'), ('body_mask2_lod', 'mask2_lod.png')):
  doc['textures'][key] = 'textures/body/' + file
manifest.write_text(json.dumps(doc, indent=2) + '\n')
print(json.dumps(sizes, indent=1)); print('total', sum(sizes.values()))
