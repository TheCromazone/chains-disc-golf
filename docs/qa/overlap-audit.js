const C = window.__chains; const $ = id => document.getElementById(id);
const idOf = e => e.id || (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : e.tagName) + ':' + (e.textContent || '').trim().slice(0, 12);
const audit = name => {
  const sel = 'button, input, .panel, #pad, #power, #powerLabel, #waiting, .brand';
  const vis = e => { let n = e; while (n && n !== document.body) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; n = n.parentElement; } return true; };
  const els = [...document.querySelectorAll(sel)].filter(e => vis(e) && e.getBoundingClientRect().width > 0);
  const R = e => e.getBoundingClientRect(); const out = [], off = [];
  for (let i = 0; i < els.length; i++) { const a = els[i], ra = R(a);
    if (!a.closest('.overlay .panel') && (ra.left < -1 || ra.top < -1 || ra.right > innerWidth + 1 || ra.bottom > innerHeight + 1)) off.push(idOf(a));
    for (let j = i + 1; j < els.length; j++) { const b = els[j]; if (a.contains(b) || b.contains(a)) continue; const rb = R(b);
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 2 && oy > 2) out.push(`${idOf(a)} x ${idOf(b)} (${Math.round(ox)}x${Math.round(oy)})`); } }
  return { name, n: els.length, overlaps: out, offscreen: off };
};
const res = [];
res.push(audit('hub'));
$('btnCourses').click(); res.push(audit('courses')); $('btnCoursesBack').click();
$('btnLocker').click(); res.push(audit('locker')); $('btnLockerDone').click();
$('btnLocal').click(); res.push(audit('setup')); $('btnSetupBack').click();
$('btnOnline').click(); res.push(audit('online')); $('btnOnlineBack').click();
$('btnHelp').click(); res.push(audit('help')); $('btnHelpClose').click();
C.G.maxDt = 0.7; C.startGame({ mode: 'solo', holeCount: 3, players: [{ name: 'You' }, { name: 'Ricky', isBot: true }, { name: 'Paige', isBot: true }] });
await new Promise(r => setTimeout(r, 300)); C.G.introT = 10;
for (let i = 0; i < 40 && C.G.phase !== 'aim'; i++) await new Promise(r => setTimeout(r, 100));
$('waiting').textContent = 'Ricky is thinking…'; $('waiting').classList.remove('hidden');
res.push(audit('hud')); $('waiting').classList.add('hidden');
const UI = await import('/src/ui.js'); UI.renderScorecard({ players: C.G.players, holes: C.holes.slice(0, 3), holeIdx: 0, final: false, isHost: true, online: false }); res.push(audit('score'));
JSON.stringify({ vw: innerWidth, vh: innerHeight, res: res.map(r => `${r.name}[${r.n}] ov:${r.overlaps.join('; ') || '-'} off:${r.offscreen.join(',') || '-'}`) }, null, 1)
