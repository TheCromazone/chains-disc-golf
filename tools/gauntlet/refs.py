"""Extract the Disc Golf Masters reference frames (1080p60 source) the gauntlet critics compare against.

  python tools/gauntlet/refs.py [--video art/reference/dgm-1080/beast-1080.mp4]

The video is YouTube 1oKuHnueZTI (Whackster, Nokia Beast), fetched with
  yt-dlp --js-runtimes node -f 299 --http-chunk-size 5M -o art/reference/dgm-1080/beast-1080.mp4 <url>
(--http-chunk-size dodges the 403 YouTube returns ~10% into an unchunked download). Copyrighted: art/reference/ is gitignored.
Writes art/reference/dgm-1080/frames/<name>.jpg at 1920x1080. Times are the old 768px frames' MMSS stamps plus the
flyover and motion events in art/qa/dgm-motion/events.json.
"""
import argparse, pathlib, subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
FRAMES = {   # name: seconds into the video
    'menu': 40.5, 'tee-hole1': 60.5, 'tee-side': 67.5, 'putt': 107.6, 'scorecard': 113.5, 'tee-hole2': 125.5,
    'flyover-1': 51.0, 'flyover-2': 54.0, 'flyover-3': 57.5, 'flyover-a': 206.5, 'flyover-b': 212.5, 'tee-hole3': 214.5,
    'tee-hole1-b': 299.5, 'putt-b': 319.5, 'putt-dark': 323.5, 'tee-hole2-b': 329.5, 'scorecard-b': 367.5, 'tee-hole3-b': 371.5,
}

ap = argparse.ArgumentParser(); ap.add_argument('--video', default='art/reference/dgm-1080/beast-1080.mp4'); a = ap.parse_args()
out = ROOT / 'art/reference/dgm-1080/frames'; out.mkdir(parents=True, exist_ok=True)
for name, t in FRAMES.items():
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', str(t), '-i', str(ROOT / a.video), '-frames:v', '1', '-q:v', '2', str(out / f'{name}.jpg')], check=True)
    print(name, t)
