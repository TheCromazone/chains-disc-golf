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
args = ap.parse_args()
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
