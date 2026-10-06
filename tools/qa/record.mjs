// Record a bot-played hole (or a course's hole-1 intro) as a screencast: frames + timestamps + phase log.
//   node tools/qa/record.mjs <outdir> <course> <seconds> [round|intro]   (dev server on :8093; every seat played by the hard bot)
import { launch, pause } from './cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const [out, course = 'pine', secs = '75', mode = 'round'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const b = await launch({ port: 9811 + Math.floor(Math.random() * 50) }); const p = await b.newPage();
await p.device({ width: 1280, height: 720, dpr: 1 });
await p.goto('http://localhost:8093/'); await p.waitFor('!!window.__chains', 90000); await pause(3000);
await p.eval(`__chains.loadCourse('${course}').then(()=>{__chains.G.courseId='${course}'; return 1})`, 120000); await pause(1500);
await p.eval(`(()=>{Object.assign(__chains.G.avatar,{name:'You',headwear:'backcap',headwearColor:'#2f80ff'}); __chains.makeHero(); return 1})()`); await pause(800);
await p.eval(`(()=>{const s=document.createElement('style'); s.textContent='#top,#controls,#conditions,#utilities,#pad,#power,#powerLabel,#pin{visibility:hidden!important}'; document.head.appendChild(s); return 1})()`);
const frames = [], phases = []; let n = 0;
p.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  const f = `${String(++n).padStart(5, '0')}.jpg`; writeFileSync(`${out}/${f}`, Buffer.from(data, 'base64')); frames.push({ f, t: metadata.timestamp });
  p.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await p.eval(`document.querySelector('#holesSeg [data-v="3"]').click(); document.querySelector('#diffSeg [data-v="hard"]').click(); 1`);
await p.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
await p.eval(`document.getElementById('btnSolo').click(); 1`);
const t0 = Date.now(); let last = '';
while (Date.now() - t0 < +secs * 1000) {
  const st = await p.eval(`(()=>{const G=__chains.G; if(G.players[0]&&!G.players[0].isBot){G.players[0].isBot=true;G.players[0].difficulty='hard';} return JSON.stringify({ph:G.phase,cur:G.cur,hole:G.holeIdx,strokes:G.players.map(p=>p.strokes),done:G.players.map(p=>p.done?1:0)})})()`).catch(() => '');
  if (st && st !== last) { phases.push({ t: Date.now() / 1000, st: JSON.parse(st) }); last = st; }
  if (mode === 'intro' && phases.length && JSON.parse(st || '{}').ph === 'aim') break;
  if (mode === 'round' && st && JSON.parse(st).hole > 0) { await pause(1500); break; }
  await pause(100);
}
await p.send('Page.stopScreencast'); await pause(300);
writeFileSync(`${out}/frames.json`, JSON.stringify(frames)); writeFileSync(`${out}/phases.json`, JSON.stringify(phases, null, 0));
console.log('frames', frames.length, 'fps', (frames.length / ((frames.at(-1).t - frames[0].t) || 1)).toFixed(1), 'errors', p.errors.slice(0, 3));
b.close(); process.exit(0);
