// node tools/qa/trailer-overlays.mjs — transparent 1280x720 caption overlays and the end card, in the game's own type (Barlow Condensed).
import { launch, pause } from './cdp.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..'), out = './trailer';   // run from the folder holding the recordings mkdirSync(out, { recursive: true });
const f8 = readFileSync(root + '/assets/fonts/barlow-condensed-800.woff2').toString('base64');
const f7 = readFileSync(root + '/assets/fonts/barlow-condensed-700.woff2').toString('base64');
const key = readFileSync(root + '/art/keyart/chatgpt-keyart-wide.jpg').toString('base64');
const icon = readFileSync(root + '/assets/icons/icon-192.png').toString('base64');
const css = `@font-face{font-family:B;font-weight:800;src:url(data:font/woff2;base64,${f8})}@font-face{font-family:B;font-weight:700;src:url(data:font/woff2;base64,${f7})}
html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:transparent;font-family:B,sans-serif;color:#fff}
.tl{position:absolute;left:64px;top:52px}.bl{position:absolute;left:64px;bottom:64px}
.eyebrow{font-weight:700;font-size:22px;letter-spacing:7px;text-transform:uppercase;color:#ffe1a3;text-shadow:0 2px 12px #000a}
.big{font-weight:800;font-size:150px;line-height:.86;letter-spacing:3px;text-transform:uppercase;text-shadow:0 6px 30px #0009}
.bar{width:100px;height:8px;background:#5cf0a8;border-radius:4px;margin:16px 0 0;transform:skewX(-24deg)}
.cap{font-weight:800;font-size:54px;line-height:.95;letter-spacing:1.5px;text-transform:uppercase;text-shadow:0 4px 22px #000c}
.cap small{display:block;font-weight:700;font-size:24px;letter-spacing:4px;color:#ffe1a3;margin-bottom:8px}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,#0007,transparent 34%)}.shadeb{position:absolute;inset:0;background:linear-gradient(0deg,#0008,transparent 40%)}`;
const cards = {
  title: `<div class="shade"></div><div class="tl"><div class="eyebrow">Disc golf club</div><div class="big">Chains</div><div class="bar"></div></div>`,
  swipe: `<div class="shade"></div><div class="tl cap"><small>Phone or desktop</small>Swipe to throw</div>`,
  chains: `<div class="shade"></div><div class="tl cap"><small>Real flight physics</small>Hit the chains</div>`,
  lake: `<div class="shade"></div><div class="tl cap"><small>Water on five holes</small>Lakeshore Links</div>`,
  meadow: `<div class="shade"></div><div class="tl cap"><small>Open · long · windy</small>Cedar Meadows</div>`,
  bluff: `<div class="shade"></div><div class="tl cap"><small>Coastal · exposed · gusty</small>Gull Point Bluffs</div>`,
  friends: `<div class="shade"></div><div class="tl cap"><small>Live rooms or on your own time</small>Play with up to 12 friends</div>`,
};
const b = await launch({ port: 9871 }); const p = await b.newPage();
await p.device({ width: 1280, height: 720, dpr: 1 });
await p.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const [name, body] of Object.entries(cards)) {
  writeFileSync(`${out}/${name}.html`, `<!doctype html><meta charset="utf-8"><style>${css}</style>${body}`);
  await p.goto(`file://${process.cwd()}/${out}/${name}.html`); await p.eval('document.fonts.ready.then(()=>1)'); await pause(300);
  await p.shot(`${out}/ov-${name}.png`);
}
// end card: opaque, the ChatGPT key art with the wordmark and the link
writeFileSync(`${out}/end.html`, `<!doctype html><meta charset="utf-8"><style>${css}
.bg{position:absolute;inset:0;background:url(data:image/jpeg;base64,${key}) 65% center/cover}.sh{position:absolute;inset:0;background:linear-gradient(90deg,#06120ef2,#06120ec0 34%,#06120e30 58%,transparent 72%)}
.c{position:absolute;left:72px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center}.c img{width:64px;height:64px;border-radius:14px;margin-bottom:18px}
.url{margin-top:26px;font-weight:700;font-size:30px;letter-spacing:1px;color:#fff;background:#ff4d3d;padding:12px 20px;border-radius:12px;align-self:flex-start}
.sub{margin-top:18px;font-weight:700;font-size:30px;letter-spacing:2px;text-transform:uppercase;color:#cfe3da}</style>
<div class="bg"></div><div class="sh"></div><div class="c"><img src="data:image/png;base64,${icon}"><div class="eyebrow">Disc golf club</div><div class="big">Chains</div><div class="bar"></div><div class="sub">Free in your browser · phone or desktop</div><div class="url">chains-disc-golf.vercel.app</div></div>`);
await p.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 12, g: 17, b: 20, a: 1 } });
await p.goto(`file://${process.cwd()}/${out}/end.html`); await p.eval('document.fonts.ready.then(()=>1)'); await pause(400);
await p.shot(`${out}/endcard.png`);
console.log('ok'); b.close(); process.exit(0);
