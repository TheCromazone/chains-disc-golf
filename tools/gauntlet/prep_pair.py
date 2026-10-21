"""Regression pairs: the same moment from two builds of Chains, judged blind against each other (no reference game).

  python tools/gauntlet/prep_pair.py <label> <old_capture_dir> <new_capture_dir> [--pieces all|stills|motion|a,b] [--k 4]

Both capture dirs come from tools/gauntlet/capture-all.sh. Writes art/qa/judge/<label>/<piece>-<i>/{prompt.md, A.jpg, B.jpg}
and prints the key ({piece: [{"prompt", "new": "A"|"B"}]}). Vote i puts the new build in slot A when i is even. Far less noisy
than two separate comparisons with the reference: use it to decide whether a round made a piece better or worse.
"""
import argparse, json, pathlib, sys
from prep import STILLS, CRISP, MOTION, ROOT, fit, crop_native, strip, ours_motion
from PIL import Image

PROMPT = """You are a harsh critic comparing two screenshots of the same moment from two different builds of one 3D disc golf video game.
Praise is not useful. Judge only what you see.

Open these two images with the Read tool:
  Image A: {a}
  Image B: {b}
{extra}
Judge ONLY this: {what}

If you cannot see a meaningful difference on this point, still pick the one you would ship, and say MARGIN: narrow.
Answer in exactly this form:
WINNER: A or B
MARGIN: narrow, clear or decisive
WHY: one or two sentences naming the concrete visible differences and where they are.
LOSER_GAP: the single biggest thing that makes the losing image worse at this.
LOSER_FIX: what would most improve the losing image on this point.
WINNER_WEAKNESS: the winning image's most visible flaw on this point.
"""

def frame(cap, piece, i):
    if piece in STILLS:
        moments, _, what = STILLS[piece]; return fit(Image.open(cap / f'{moments[i % len(moments)]}.jpeg')), what, ''
    if piece in CRISP:
        moments = CRISP[piece][0]
        from prep import CRISP_TEXT
        return crop_native(Image.open(cap / f'{moments[i % len(moments)]}.jpeg')), CRISP_TEXT.replace(' Ignore video-compression artifacts (soft smearing, 8x8 macro-block patches) - one image is a frame of compressed video.', ''), 'Both are 1:1 crops at native screen resolution: look closely at edges.\n'
    clip, mode, what = MOTION[piece]
    return strip(ours_motion(cap, clip, mode)), what, 'Each image is a filmstrip of 8 frames from one moment of play, read left to right, then the second row.\n'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('label'); ap.add_argument('old'); ap.add_argument('new'); ap.add_argument('--pieces', default='all'); ap.add_argument('--k', type=int, default=4)
    a = ap.parse_args()
    old, new = (ROOT / a.old if not pathlib.Path(a.old).is_absolute() else pathlib.Path(a.old)), (ROOT / a.new if not pathlib.Path(a.new).is_absolute() else pathlib.Path(a.new))
    ours = [p for p in list(STILLS) + list(CRISP) + list(MOTION) if not p.startswith('fn-')]   # Fortnite pieces reuse the same frames
    pieces = {'all': ours, 'stills': [p for p in ours if not p.startswith('m-')], 'motion': [p for p in ours if p.startswith('m-')]}.get(a.pieces) or a.pieces.split(',')
    out = ROOT / 'art/qa/judge' / a.label; key = {}
    for piece in pieces:
        key[piece] = []
        for i in range(a.k):
            n_img, what, extra = frame(new, piece, i); o_img, _, _ = frame(old, piece, i)
            slot = 'A' if i % 2 == 0 else 'B'
            d = out / f'{piece}-{i}'; d.mkdir(parents=True, exist_ok=True)
            (n_img if slot == 'A' else o_img).save(d / 'A.jpg', quality=92); (o_img if slot == 'A' else n_img).save(d / 'B.jpg', quality=92)
            (d / 'prompt.md').write_text(PROMPT.format(a=d / 'A.jpg', b=d / 'B.jpg', extra=extra, what=what.replace('The cleaner, more filmic, more anti-aliased image wins.', 'The cleaner, more filmic, more anti-aliased image wins.')))
            key[piece].append({'prompt': str(d / 'prompt.md'), 'new': slot})
    print(json.dumps(key))

if __name__ == '__main__':
    sys.path.insert(0, str(pathlib.Path(__file__).parent))
    main()
