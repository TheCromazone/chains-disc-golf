# The tone step at the 3D/impostor swap, from tools/qa/crown-probe.mjs --ring pairs: the foliage pixels (hue 35-170 deg with some
# chroma) in the crown box of each pair's two stills, as coverage, hue, saturation and value, and the far card's difference.
#   python3 tools/qa/swap-tone.py <probe dir> [...]
import sys, json, colorsys
from PIL import Image

def tone(path):
    im = Image.open(path).convert('RGB'); w, h = im.size
    box = im.crop((int(w * .34), int(h * .15), int(w * .66), int(h * .75))).resize((96, 240), Image.BILINEAR)
    n = 0; H = S = V = 0.
    for r, g, b in box.getdata():
        hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if 35 <= hh * 360 <= 170 and ss > .15: n += 1; H += hh * 360; S += ss; V += vv
    n = max(n, 1); return n / (96 * 240), H / n, S / n, V / n

for d in sys.argv[1:]:
    probe = json.load(open(f'{d}/probe.json')); rows = []
    print(f"{d.rstrip('/').split('/')[-1]}: {probe.get('course')} {probe.get('quality')}")
    print('  pair kind    sun   3D cov  hue   sat  val  |  far cov  hue   sat  val  |  d cov   d hue  d sat  d val')
    for r in probe['ring']:
        a, b = tone(f"{d}/ring-{r['pair']}-3d.png"), tone(f"{d}/ring-{r['pair']}-far.png"); rows.append([b[i] - a[i] for i in range(4)])
        print(f"  {r['pair']}   {r['kind']:7s} {r['sun']:3d}   {a[0]:.2f}  {a[1]:5.1f}  {a[2]:.2f} {a[3]:.2f}  |   {b[0]:.2f}  {b[1]:5.1f}  {b[2]:.2f} {b[3]:.2f}  |  {b[0] - a[0]:+.2f}  {b[1] - a[1]:+6.1f}  {b[2] - a[2]:+.2f}  {b[3] - a[3]:+.2f}")
    if rows:
        m = [sum(r[i] for r in rows) / len(rows) for i in range(4)]; ab = [sum(abs(r[i]) for r in rows) / len(rows) for i in range(4)]
        print(f"  mean step   cov {m[0]:+.2f}  hue {m[1]:+.1f}  sat {m[2]:+.2f}  val {m[3]:+.2f}   mean |step|   cov {ab[0]:.2f}  hue {ab[1]:.1f}  sat {ab[2]:.2f}  val {ab[3]:.2f}")
