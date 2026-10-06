// Scales art/icon/icon-render.png (tools/render-icon.py) into the web icon set with ffmpeg:
// apple-touch (180, opaque), PWA 192/512 (any + maskable: the basket sits inside the 80% safe circle) and favicons.
//   node tools/pack-icons.mjs
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..'), src = resolve(root, 'art/icon/icon-render.png');
const sizes = { 'assets/icons/apple-touch-icon.png': 180, 'assets/icons/icon-192.png': 192, 'assets/icons/icon-512.png': 512, 'assets/icons/favicon-32.png': 32, 'assets/icons/favicon-64.png': 64 };
execFileSync('mkdir', ['-p', resolve(root, 'assets/icons')]);
for (const [out, s] of Object.entries(sizes)) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', `scale=${s}:${s}:flags=lanczos`, '-pred', 'mixed', resolve(root, out)]);
  console.log(out, s);
}
