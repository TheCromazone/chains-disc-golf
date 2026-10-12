"""Blind A/B pairs for the gauntlet critics: our captures against Disc Golf Masters' 1080p frames.

  python tools/gauntlet/prep.py <label> <capture_dir> [--pieces all|stills|motion|a,b,c] [--k 2] [--start 0]

<capture_dir> holds phone/ (capture.mjs --size 960x540 --dpr 2 --mobile --quality low), desktop/ (--size 1920x1080
--quality high) and motion/ (capture-motion.mjs) - see tools/gauntlet/BRIEF.md. Reference frames come from
tools/gauntlet/refs.py; motion strips are cut straight from the 1080p60 video at the events in tools/gauntlet/dgm-events.json.
Writes art/qa/judge/<label>/<piece>-<i>/{prompt.md, A.jpg, B.jpg} and prints the key as JSON on stdout
({piece: [{"prompt": path, "ours": "A"|"B"}]}). The key never touches disk next to the images, so a critic cannot read it.
Vote i puts ours in slot A when (start + i) is even and B when odd: critics favour one slot per piece, so a piece is
always judged in order-swapped pairs.
"""
import argparse, json, pathlib, subprocess, sys
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
def _main_checkout():   # art/reference is gitignored, so a builder's worktree reads the frames from the main checkout
    git = subprocess.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], capture_output=True, text=True, cwd=ROOT).stdout.strip()
    return pathlib.Path(git).parent if git else ROOT
REF = next(r / 'art/reference/dgm-1080' for r in (ROOT, _main_checkout()) if (r / 'art/reference/dgm-1080/frames').exists())
VIDEO = REF / 'beast-1080.mp4'
EVENTS = json.loads((ROOT / 'tools/gauntlet/dgm-events.json').read_text())   # seconds in the reference video, read off frame sheets

# piece: (our [tier/moment] list, reference frame list, what to judge, crop or None). Vote i uses ours[i % n] and refs[i % n].
STILLS = {
    'ground': (['phone/tee', 'phone/putt'], ['tee-hole1', 'putt-b', 'tee-hole2-b'],
               'the GROUND: turf and grass blades, dirt paths, leaf litter, gravel, the tee pad. Realism, detail near and mid distance, variation, how grass meets paths and objects.'),
    'light': (['phone/tee'], ['tee-hole1', 'tee-hole2', 'tee-hole3-b'],
              'SUNLIGHT AND SKY: the sun\'s direction and warmth, cast shadows, sunlit-versus-shade contrast, the sky and clouds, exposure and colour grade.'),
    'haze': (['phone/putt'], ['putt', 'putt-b'],
             'ATMOSPHERE AND SHADOWS: aerial perspective with distance, the shapes and softness of shadows under trees, how near, mid and far layers separate.'),
    'trees': (['phone/tee', 'phone/flyover'], ['tee-hole1', 'flyover-2', 'tee-hole2-b'],
              'TREES AND FOLIAGE: leaf density and translucency, branch structure, bark, silhouettes against the sky, variety, how the forest edge reads.'),
    'athlete': (['phone/tee'], ['tee-hole1', 'tee-hole1-b', 'tee-side'],
                'THE PLAYER CHARACTER: body proportions, face, skin, hair, clothing fabric, hands and grip on the disc, how natural the pose is.'),
    'props': (['phone/tee'], ['tee-hole1', 'tee-hole2', 'tee-hole3-b'],
              'SET DRESSING: banners, arch, signs, vehicles, tents, fences, bags. Materials, scale, and how grounded each object is (contact shadows).'),
    'camera': (['phone/putt'], ['putt', 'putt-b'],
               'CAMERA FRAMING of a putt: composition, lens, camera height, how readable the basket is, where the player sits in frame.'),
    'hud': (['phone/tee'], ['tee-hole1', 'tee-hole2-b'],
            'THE HUD: legibility, polish, hierarchy, how it sits on the image, how premium it feels. Ignore what the text says.'),
    'intro': (['phone/flyover'], ['flyover-1', 'flyover-a', 'flyover-b'],
              'A HOLE-INTRO FLYOVER frame: composition, typography, how cinematic it feels.'),
    'scorecard': (['phone/scorecard'], ['scorecard', 'scorecard-b'],
                  'THE SCORECARD SCREEN: layout, legibility, polish, how it sits over the backdrop. Ignore names and numbers.'),
    'menu': (['phone/menu'], ['menu'],
             'THE MAIN MENU: presentation of the character and options, typography, polish, premium feel. Ignore names and text content.'),
    'd-look': (['desktop/tee', 'desktop/putt'], ['tee-hole1', 'putt-b', 'tee-hole2'],
               'OVERALL REALISM AND PRODUCTION VALUE of the whole frame, as a player on a big monitor would see it.'),
}
STYLE = (' The two games have different art styles, one stylized and one realistic: do not reward or punish either style; '
         'judge how well each one executes its own.')
# Fortnite, the second bar: reference names starting "fn/" come from art/reference/fortnite/frames (tools/gauntlet/refs.py).
STILLS.update({
    'fn-look': (['phone/tee', 'phone/putt'], ['fn/ip-1', 'fn/ip-2', 'fn/ip-3', 'fn/ip-4'],
                'RENDERING POLISH AND PRODUCTION VALUE of a phone game: richness of the lighting (sun, sky light, bounce light), '
                'material quality, depth, cleanliness, how premium and finished the frame looks. Ignore the HUD and touch buttons.' + STYLE),
    'fn-d-look': (['desktop/tee', 'desktop/putt'], ['fn/pc-1', 'fn/pc-2', 'fn/pc-3', 'fn/pc-4'],
                  'RENDERING POLISH AND PRODUCTION VALUE on a desktop PC: richness of the lighting (sun, sky light, bounce light), '
                  'material quality, depth, foliage, cleanliness, how premium and finished the frame looks. Ignore HUD and overlays.' + STYLE),
    'fn-athlete': (['phone/tee'], ['fn/ip-ath', 'fn/pc-ath', 'fn/pc-4'],
                   "THE PLAYER CHARACTER'S RENDERING: shading, materials, hair, cloth, silhouette and how natural the pose is." + STYLE),
})
CRISP = {   # judged on 1:1 native-resolution crops, not the whole frame
    'crisp': (['phone/tee', 'phone/putt'], ['tee-hole1', 'putt-b'], 'phone'),
    'd-crisp': (['desktop/tee', 'desktop/putt'], ['tee-hole1', 'putt-b'], 'desktop'),
    'fn-crisp': (['phone/tee', 'phone/putt'], ['fn/ip-1', 'fn/ip-3'], 'phone'),
}
CRISP_TEXT = ('IMAGE QUALITY AT NATIVE RESOLUTION, nothing else: stair-stepped (jaggy) edges, pixelation, blocky or blurry-upscaled '
              'texture, hard one-pixel cut-out edges on leaves, grass and hair, thin lines that break into dots, shadow edges that '
              'step. The cleaner, more filmic, more anti-aliased image wins. Ignore video-compression artifacts (soft smearing, '
              '8x8 macro-block patches) - one image is a frame of compressed video. Ignore art direction, colour and content.')
MOTION = {   # piece: (clip, reference event span, how ours is sampled, what to judge)
    'm-throw': ('drive', 'throw', 'THE THROWING ANIMATION, read left to right then top to bottom at fixed 0.15 s steps: the reach-back, the hip-led pull-through, the arm wrapping across the body, the release and the follow-through. Body mechanics and naturalness, not graphics.'),
    'm-flight': ('drive', 'flight', 'DISC FLIGHT AND THE FOLLOW CAMERA, sampled evenly from release to landing: is the disc visible and readable, does the camera follow smoothly without clipping into scenery, does the landing read.'),
    'm-putt': ('putt', 'putt', 'THE PUTT, at 0.3 s steps from just before release: the stroke along the target line, the camera holding one clear shot behind the thrower, the disc reaching the basket.'),
    'm-intro': ('flyover', 'intro', 'THE HOLE-INTRO CAMERA MOVE, sampled evenly over the flyover: does it show the hole from tee to basket, is the path smooth and cinematic, does it avoid clipping into trees.'),
}
ALL = list(STILLS) + list(CRISP) + list(MOTION)

PROMPT = """You are a harsh critic judging two screenshots from two different 3D disc golf video games.
Praise is not useful. Do not assume either is the better or more expensive game; judge only what you see.

Open these two images with the Read tool:
  Image A: {a}
  Image B: {b}
{extra}
Judge ONLY this: {what}

Ignore everything else, including names, logos, sponsors, which course it is, and the language of any text.
Decide which image is better at this one thing. Then answer in exactly this form:
WINNER: A or B
MARGIN: narrow, clear or decisive
WHY: one or two sentences naming concrete visible differences, with where in the frame they are.
LOSER_GAP: the single biggest thing that makes the losing image worse at this, specific and visible.
LOSER_FIX: what would most improve the losing image on this point, concretely.
WINNER_WEAKNESS: the winning image's most visible flaw on this point.
"""

def fit(im, size=(1280, 720)):
    return im.convert('RGB').resize(size, Image.LANCZOS)

def ref_frame(name):
    if name.startswith('fn/'): return Image.open(REF.parent / 'fortnite/frames' / f'{name[3:]}.jpg')
    return Image.open(REF / 'frames' / f'{name}.jpg')

def video_frame(t):
    p = subprocess.run(['ffmpeg', '-loglevel', 'error', '-ss', f'{t:.3f}', '-i', str(VIDEO), '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True, check=True)
    from io import BytesIO
    return Image.open(BytesIO(p.stdout))

def strip(frames):   # 8 frames, 4x2 at 480x270 each
    s = Image.new('RGB', (480 * 4, 270 * 2))
    for i, im in enumerate(frames): s.paste(fit(im, (480, 270)), ((i % 4) * 480, (i // 4) * 270))
    return s

def crop_native(im):   # the middle-upper 960x540 of a 1920x1080 frame, at 1:1: foliage, arch and athlete edges
    im = im.convert('RGB')
    if im.size != (1920, 1080): im = im.resize((1920, 1080), Image.LANCZOS)
    return im.crop((480, 140, 1440, 680))

def ours_motion(cap, clip, mode):
    meta = json.loads((cap / 'motion' / f'{clip}.json').read_text())
    ev = {e['name']: e['frame'] for e in meta['events']}
    fps = meta['fps']; n = meta['frames']
    if mode == 'throw': idx = [ev['launch'] + round((-0.6 + 0.15 * i) * fps) for i in range(8)]
    elif mode == 'putt': idx = [ev['launch'] + round((-0.6 + 0.3 * i) * fps) for i in range(8)]
    elif mode == 'flight': a, b = ev['launch'], min(n - 1, ev.get('land', ev.get('rest', n - 1)) + round(0.6 * fps)); idx = [round(a + (b - a) * i / 7) for i in range(8)]
    else: a, b = ev['intro-start'], ev.get('intro-end', n - 1); idx = [round(a + (b - a) * i / 7) for i in range(8)]
    return [Image.open(cap / 'motion' / clip / 'frames' / f'{max(0, min(n - 1, i)):04d}.jpg') for i in idx]

def ref_motion(mode):
    d, p, f = EVENTS['drive'], EVENTS['putt'], EVENTS['flyover']
    if mode == 'throw': ts = [d['release'] - 0.6 + 0.15 * i for i in range(8)]
    elif mode == 'putt': ts = [p['release'] - 0.6 + 0.3 * i for i in range(8)]
    elif mode == 'flight': ts = [d['release'] + (d['landing'] + 0.6 - d['release']) * i / 7 for i in range(8)]
    else: ts = [f['start'] + (f['end'] - f['start']) * i / 7 for i in range(8)]
    return [video_frame(t) for t in ts]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('label'); ap.add_argument('cap'); ap.add_argument('--pieces', default='all'); ap.add_argument('--k', type=int, default=2); ap.add_argument('--start', type=int, default=0)
    a = ap.parse_args()
    cap = (ROOT / a.cap).resolve() if not pathlib.Path(a.cap).is_absolute() else pathlib.Path(a.cap)
    pieces = {'all': ALL, 'stills': list(STILLS) + list(CRISP), 'motion': list(MOTION)}.get(a.pieces) or a.pieces.split(',')
    out = ROOT / 'art/qa/judge' / a.label; key = {}; refstrip = {}
    for piece in pieces:
        if piece not in ALL: sys.exit(f'unknown piece {piece}; pieces: {", ".join(ALL)}')
        key[piece] = []
        for i in range(a.k):
            slot = 'A' if (a.start + i) % 2 == 0 else 'B'; extra = ''
            if piece in STILLS:
                ours_list, refs, what = STILLS[piece]
                ours, ref = fit(Image.open(cap / f'{ours_list[i % len(ours_list)]}.jpeg')), fit(ref_frame(refs[i % len(refs)]))
            elif piece in CRISP:
                ours_list, refs, _ = CRISP[piece]; what = CRISP_TEXT
                ours, ref = crop_native(Image.open(cap / f'{ours_list[i % len(ours_list)]}.jpeg')), crop_native(ref_frame(refs[i % len(refs)]))
                extra = 'Both are 1:1 crops at native screen resolution: look closely at edges.\n'
            else:
                clip, mode, what = MOTION[piece]
                ours = strip(ours_motion(cap, clip, mode)); ref = refstrip.get(mode) or refstrip.setdefault(mode, strip(ref_motion(mode)))
                extra = 'Each image is a filmstrip of 8 frames from one moment of play, read left to right, then the second row.\n'
            d = out / f'{piece}-{a.start + i}'; d.mkdir(parents=True, exist_ok=True)
            (ours if slot == 'A' else ref).save(d / 'A.jpg', quality=92); (ref if slot == 'A' else ours).save(d / 'B.jpg', quality=92)
            (d / 'prompt.md').write_text(PROMPT.format(a=d / 'A.jpg', b=d / 'B.jpg', extra=extra, what=what))
            key[piece].append({'prompt': str(d / 'prompt.md'), 'ours': slot})
    print(json.dumps(key))

if __name__ == '__main__':
    main()
