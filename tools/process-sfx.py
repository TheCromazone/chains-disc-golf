"""Slice a generated foley clip (several takes separated by silence) into game-ready samples.

    python3 tools/process-sfx.py <name> <input audio or video> [--max 4] [--min 0.2] [--peak -6] [--tail 0.12] [--at 1.0-1.6,4.0-4.5]

Finds the takes with ffmpeg's silencedetect (or takes the exact --at ranges, for a clip without gaps such as the sound of
a generated video), trims each with a short pre-roll, high-passes rumble away, fades the edges,
peak-normalises to --peak dBFS, and writes mono 96 kbps MP3s to assets/sfx/<name>_<n>.mp3 (MP3 decodes everywhere,
Safari included). Prints the manifest entry; src/audio.js plays a random take per event.
"""
import json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
args = sys.argv[1:]
opt = lambda k, d: type(d)(args[args.index(k) + 1]) if k in args else d
name, src = args[0], Path(args[1])
MAX, MIN, PEAK, TAIL = opt('--max', 4), opt('--min', .2), opt('--peak', -6.0), opt('--tail', .12)
out = ROOT / 'assets' / 'sfx'; out.mkdir(parents=True, exist_ok=True)

def ff(*a): return subprocess.run(['ffmpeg', '-hide_banner', '-nostats', *a], capture_output=True, text=True)
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(src)], capture_output=True, text=True).stdout)
log = ff('-i', str(src), '-af', 'silencedetect=noise=-42dB:d=0.3', '-f', 'null', '-').stderr
starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', log)]
ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', log)]
# sound runs between one silence's end and the next silence's start
edges = [0.] + ends; stops = starts + [dur]
if starts and starts[0] < .05: edges, stops = ends, starts[1:] + [dur]
takes = [(a, b) for a, b in zip(edges, stops) if b - a >= MIN]
# loudest takes first (a quiet stray noise between takes is not a take)
def peak(a, b):
    m = re.search(r'max_volume: (-?[\d.]+) dB', ff('-ss', f'{a}', '-to', f'{b}', '-i', str(src), '-af', 'volumedetect', '-f', 'null', '-').stderr)
    return float(m.group(1)) if m else -99.
ranked = sorted(takes, key=lambda t: peak(*t), reverse=True)[:MAX]
if '--at' in args:   # exact ranges, kept in the given order
    ranked = [tuple(float(v) for v in r.split('-')) for r in args[args.index('--at') + 1].split(',')]; TAIL = 0.
files = []
for k, (a, b) in enumerate(ranked if '--at' in args else sorted(ranked)):
    a0, b0 = (a, b) if '--at' in args else (max(0., a - .03), min(dur, b + TAIL)); length = b0 - a0
    gain = PEAK - peak(a0, b0)
    target = out / f'{name}_{k + 1}.mp3'
    r = ff('-y', '-ss', f'{a0:.3f}', '-to', f'{b0:.3f}', '-i', str(src), '-af',
           f'highpass=f=45,afade=t=in:st=0:d=0.006,afade=t=out:st={max(0., length - .09):.3f}:d=0.09,volume={gain:.2f}dB',
           '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', str(target))
    if r.returncode: raise SystemExit(r.stderr[-400:])
    files.append(f'sfx/{target.name}'); print(f'{target.name}: {a0:.2f}-{b0:.2f}s, {length:.2f}s, gain {gain:+.1f} dB')
print(json.dumps({name: files}))
