const C = window.__chains; const $ = id => document.getElementById(id);
const idOf = e => e.id || (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : e.tagName) + ':' + (e.textContent || '').trim().slice(0, 12);
const audit = name => {
  const sel = 'button, input, .panel, #pad, #power, #powerLabel, #waiting, .brand';
  const vis = e => { let n = e; while (n && n !== document.body) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; n = n.parentElement; } return true; };
  // Compare painted bounds: scroll-panel children outside its clip are not visible controls.
  const R = e => { const b=e.getBoundingClientRect(),r={left:b.left,right:b.right,top:b.top,bottom:b.bottom};
    for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();
      if(/auto|scroll|hidden|clip/.test(s.overflowX)){r.left=Math.max(r.left,b.left);r.right=Math.min(r.right,b.right);}
      if(/auto|scroll|hidden|clip/.test(s.overflowY)){r.top=Math.max(r.top,b.top);r.bottom=Math.min(r.bottom,b.bottom);}}
    r.width=Math.max(0,r.right-r.left);r.height=Math.max(0,r.bottom-r.top);return r; };
  const modal = document.querySelector('dialog[open]');
  const els = [...document.querySelectorAll(sel)].filter(e => (!modal || modal.contains(e)) && vis(e) && R(e).width > 0 && R(e).height > 0);
  const out = [], off = [];
  for (let i = 0; i < els.length; i++) { const a = els[i], ra = R(a);
    if (!a.closest('.overlay .panel') && (ra.left < -1 || ra.top < -1 || ra.right > innerWidth + 1 || ra.bottom > innerHeight + 1)) off.push(idOf(a));
    for (let j = i + 1; j < els.length; j++) { const b = els[j]; if (a.contains(b) || b.contains(a)) continue; const rb = R(b);
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 2 && oy > 2) out.push(`${idOf(a)} x ${idOf(b)} (${Math.round(ox)}x${Math.round(oy)})`); } }
  return { name, n: els.length, overlaps: out, offscreen: off, clippedLabels: els.filter(e=>e.tagName==='BUTTON' && (e.scrollHeight>e.clientHeight+2 || e.scrollWidth>e.clientWidth+2)).map(idOf) };
};
const res = [];
const sweep=(name,id)=>{res.push(audit(name));const panel=$(id).querySelector('.panel');if(panel&&panel.scrollHeight>panel.clientHeight+2){panel.scrollTop=panel.scrollHeight;res.push(audit(name+'-bottom'));panel.scrollTop=0;}};
sweep('hub','menu');
$('btnCourses').click(); sweep('courses','courses'); $('btnCoursesBack').click();
$('btnLocker').click(); sweep('locker','locker'); $('btnLockerDone').click();
$('btnLocal').click(); sweep('setup','setup'); $('btnSetupBack').click();
$('btnOnline').click(); sweep('online','online'); $('btnOnlineBack').click();
$('btnHelp').click(); sweep('help','help'); $('btnHelpClose').click();
C.G.maxDt = 0.7; C.startGame({ mode: 'solo', holeCount: 3, players: [{ name: 'You' }, { name: 'Ricky', isBot: true }, { name: 'Paige', isBot: true }] });
await new Promise(r => setTimeout(r, 300)); C.G.introT = 10;
for (let i = 0; i < 40 && C.G.phase !== 'aim'; i++) await new Promise(r => setTimeout(r, 100));
$('waiting').textContent = 'Ricky is thinking…'; $('waiting').classList.remove('hidden');
res.push(audit('hud')); $('waiting').classList.add('hidden');
const throws = [...$('throwRow').querySelectorAll('button')];
if(throws.length !== 11) throw new Error(`Expected eleven throw choices, got ${throws.length}`);
$('btnThrowPicker').click(); res.push(audit("eleven-throw-sheet"));
if($('throwRow').classList.contains('hidden')) throw new Error('Throw sheet did not open');
$('btnThrowPicker').click();
if ($('leaveDialog')) { $('leaveDialog').showModal(); res.push(audit('leave-dialog')); $('leaveDialog').close(); }
const UI = await import('/src/ui.js'); UI.renderScorecard({ players: C.G.players, holes: C.holes.slice(0, 3), holeIdx: 0, final: false, isHost: true, online: false }); sweep('score','score');
JSON.stringify({ vw: innerWidth, vh: innerHeight, res: res.map(r => `${r.name}[${r.n}] ov:${r.overlaps.join('; ') || '-'} off:${r.offscreen.join(',') || '-'} clipped:${r.clippedLabels.join(',') || '-'}`) }, null, 1)
