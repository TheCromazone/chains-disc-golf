"""Export image-model originals to the explicitly requested runtime sizes/formats."""
import json
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
rows = json.loads((ROOT / 'docs/qa/image-sources.json').read_text())
manifest = {'textures': {}, 'courses': {}, 'discs': {}, 'portraits': {}, 'ui': {}, 'sfx': {}}
for row in rows:
    dest = ROOT / 'assets' / row['file']
    dest.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(row['source']).resize((row['width'], row['height']), Image.Resampling.LANCZOS)
    if dest.suffix == '.jpg':
        im.convert('RGB').save(dest, quality=85, optimize=True)
    else:
        im.save(dest, optimize=True)
        if dest.stat().st_size >= 1_000_000:
            im.quantize(colors=256).save(dest, optimize=True)
    assert dest.stat().st_size < 1_000_000, dest
    manifest[row['group']][row['key']] = row['file']
    print(row['file'], im.size, im.mode, dest.stat().st_size)
(ROOT / 'assets/manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
