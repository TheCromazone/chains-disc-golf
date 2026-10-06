# python3 tools/qa/trailer-cut.py (from the folder with rec-pine, rec-lake, rec-meadow, rec-bluff and trailer/) —
# cut the recorded screencasts into a ~30 s trailer: variable-timestamp frames -> 30 fps segments with caption overlays.
import json, subprocess, os
os.makedirs('trailer/seg', exist_ok=True)
def phases(rec):
    fr = json.load(open(f'{rec}/frames.json')); t0 = fr[0]['t']
    return [(x['t'] - t0, x['st']) for x in json.load(open(f'{rec}/phases.json'))]
def pick_round(rec):
    P = phases(rec)
    intro = next(t for t, s in P if s['ph'] == 'intro')
    wind0 = next(t for t, s in P if s['ph'] == 'windup' and s['cur'] == 0)
    res0 = next(t for t, s in P if s['ph'] == 'result' and s['cur'] == 0)
    holes = []   # (player, flight start, result time) for each holing throw
    for i, (t, s) in enumerate(P):
        if s['ph'] != 'flight': continue
        res = next(((u, r) for u, r in P[i + 1:] if r['ph'] == 'result'), None)
        if res and res[1]['done'][s['cur']] and not s['done'][s['cur']]: holes.append((s['cur'], t, res[0]))
    me = next((h for h in holes if h[0] == 0), holes[0]); other = next((h for h in holes if h is not me), None)
    segs = [(rec, intro + .8, intro + 6.0, 'title'), (rec, wind0 - .2, wind0 + 2.5, 'swipe'), (rec, res0 - 1.6, res0 + .6, None),
            (rec, me[1] - 1.1, me[2] + 1.6, 'chains')]
    return segs, (rec, other[1] - .8, other[2] + .9, 'friends') if other else None
round_segs, friends = pick_round('rec-pine')
SEGS = round_segs + [('rec-lake', .8, 3.0, 'lake'), ('rec-meadow', .8, 3.0, 'meadow'), ('rec-bluff', .8, 3.0, 'bluff')] + ([friends] if friends else [])
for x in SEGS: print('seg', x[0], round(x[1], 2), round(x[2], 2), x[3])
def run(*a): subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *a], check=True)
parts = []
for k, (rec, a, b, ov) in enumerate(SEGS):
    fr = json.load(open(f'{rec}/frames.json')); t0 = fr[0]['t']
    sel = [f for f in fr if a <= f['t'] - t0 <= b]
    lst = f'trailer/seg/{k}.txt'
    with open(lst, 'w') as fh:
        fh.write('ffconcat version 1.0\n')
        for i, f in enumerate(sel):
            d = (sel[i + 1]['t'] - f['t']) if i + 1 < len(sel) else 1 / 30
            fh.write(f"file '{os.path.abspath(rec)}/{f['f']}'\nduration {d:.5f}\n")
    dur = sel[-1]['t'] - sel[0]['t']; out = f'trailer/seg/{k}.mp4'
    base = '[0:v]fps=30,scale=1280:720,setsar=1,format=yuv420p'
    if ov:
        run('-f', 'concat', '-safe', '0', '-i', lst, '-loop', '1', '-i', f'trailer/ov-{ov}.png', '-filter_complex',
            f"{base}[b];[1:v]format=rgba,fade=in:st=0.15:d=0.35:alpha=1,fade=out:st={max(.5, dur - .45):.2f}:d=0.35:alpha=1[o];[b][o]overlay=shortest=1,format=yuv420p",
            '-t', f'{dur:.3f}', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', out)
    else:
        run('-f', 'concat', '-safe', '0', '-i', lst, '-vf', base[5:], '-t', f'{dur:.3f}', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', out)
    parts.append(out); print(k, rec, round(dur, 2), 's', len(sel), 'frames')
# end card: 3.5 s, fades up from the last gameplay shot via xfade below
run('-loop', '1', '-i', 'trailer/endcard.png', '-vf', 'fps=30,scale=1280:720,setsar=1,format=yuv420p', '-t', '3.6', '-c:v', 'libx264', '-crf', '18', 'trailer/seg/end.mp4')
# hard cuts between gameplay shots, a 0.5 s dissolve into the end card
with open('trailer/seg/all.txt', 'w') as fh:
    for p in parts: fh.write(f"file '{os.path.abspath(p)}'\n")
run('-f', 'concat', '-safe', '0', '-i', 'trailer/seg/all.txt', '-c', 'copy', 'trailer/seg/body.mp4')
bd = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'trailer/seg/body.mp4'], capture_output=True, text=True).stdout)
run('-i', 'trailer/seg/body.mp4', '-i', 'trailer/seg/end.mp4', '-filter_complex', f'[0:v][1:v]xfade=transition=fade:duration=0.5:offset={bd - .5:.3f},format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', 'trailer/chains-trailer.mp4')
print('trailer', round(bd + 3.1, 1), 's')
