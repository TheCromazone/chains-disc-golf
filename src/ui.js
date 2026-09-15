// Thin DOM helpers for the HUD and menus.
import { DISCS, THROWS } from './physics.js';
import { icon } from './icons.js';

for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);
const pressed = (button, on) => { button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on)); };
const escapeText = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = id => document.getElementById(id);
export const show = id => $(id).classList.remove('hidden');
export const hide = id => $(id).classList.add('hidden');
export function confirmLeave() {
  const dialog = $('leaveDialog');
  if (dialog.open) return Promise.resolve(false);
  return new Promise(resolve => { dialog.returnValue = 'cancel'; dialog.addEventListener('close', () => resolve(dialog.returnValue === 'leave'), { once: true }); dialog.showModal(); });
}
export function onlineError(text = '') { $('onlineError').textContent = text; $('onlineError').classList.toggle('hidden', !text); }
export function setConnecting(id, busy) {
  const b = $(id), label = b.querySelector('span:last-child');
  b.disabled = busy; b.setAttribute('aria-busy', String(busy));
  label.textContent = busy ? 'Connecting…' : id === 'btnCreate' ? 'Create a room' : 'Join';
}

let toastTimer = null;
export function toast(title, sub = '', ms = 1800) {
  $('toastTitle').textContent = title; $('toastSub').textContent = sub;
  $('toast').classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), ms);
}
export function fade(on) { $('fade').classList.toggle('on', on); }

export function setPower(p) { $('powerFill').style.transform = `scaleY(${Math.max(0, Math.min(1, p)).toFixed(3)})`; $('powerLabel').textContent = p > 0 ? `${Math.round(p * 100)}%` : 'POWER'; }
export function setHint(throwType, sub) {
  const t = THROWS[throwType];
  const angles = { backhand: 0, forehand: 180, tomahawk: 90, scoober: -135, putt: -90 };
  $('hintArrow').innerHTML = icon('arrow'); $('hintArrow').style.transform = `rotate(${angles[throwType]}deg)`;
  $('hintText').textContent = `${t.name.toUpperCase()} · ${t.hint}`;
  if (sub !== undefined) $('hintSub').textContent = sub;
}
export function badSwipe(throwType) { const p = $('pad'); p.classList.remove('bad'); void p.offsetWidth; p.classList.add('bad'); $('hintSub').textContent = `Wrong direction — ${THROWS[throwType].name}: ${THROWS[throwType].hint}`; }
export function setHud({ hole, par, len, dist, playerName, throwNo, windText, windDeg, circle }) {
  if (hole !== undefined) $('holeLabel').textContent = `HOLE ${hole}`;
  if (par !== undefined) $('holePar').textContent = `Par ${par} · ${Math.round(len)} m`;
  if (dist !== undefined) $('dist').textContent = dist < 1 ? 'In the basket' : `${dist.toFixed(dist < 20 ? 1 : 0)} m${circle ? ' · C1' : ''}`;
  if (playerName !== undefined) $('playerName').textContent = playerName;
  if (throwNo !== undefined) $('throwNo').textContent = throwNo;
  if (windText !== undefined) $('windText').textContent = windText;
  if (windDeg !== undefined) $('windArrow').style.transform = `rotate(${windDeg}deg)`;
}
export function buildThrowButtons(onPick) {
  const row = $('throwRow'); row.innerHTML = '';
  for (const [id, t] of Object.entries(THROWS)) { const b = document.createElement('button'); b.dataset.id = id; b.innerHTML = `${icon(id)}<span>${t.name}</span>`; b.title = `${t.name}: ${t.hint}`; b.onclick = () => onPick(id); row.appendChild(b); }
}
export function buildDiscChips(onPick) {
  const row = $('discRow'); row.innerHTML = '';
  for (const d of DISCS) { const b = document.createElement('button'); b.dataset.id = d.id; b.innerHTML = `<i class="dot" style="background:${d.color}"></i>${d.id === 'driver' ? 'Driver' : d.id === 'fairway' ? 'Fairway' : d.id === 'mid' ? 'Midrange' : 'Putter'} <span class="muted">${d.speed}|${d.glide}|${d.turn}|${d.fade}</span>`; b.onclick = () => onPick(d.id); row.appendChild(b); }
}
export function selectThrow(id) { for (const b of $('throwRow').children) pressed(b, b.dataset.id === id); setHint(id); }
export function selectDisc(id) { for (const b of $('discRow').children) pressed(b, b.dataset.id === id); }
export function setControlsEnabled(on) { $('controls').style.opacity = on ? 1 : 0.35; $('controls').style.pointerEvents = on ? 'auto' : 'none'; for (const b of $('controls').querySelectorAll('button')) b.disabled = !on; $('pad').style.opacity = on ? 1 : 0.5; }
export function setSoundMuted(muted) { const b = $('btnMute'); b.classList.toggle('muted-sound', muted); b.setAttribute('aria-pressed', String(muted)); b.title = muted ? 'Unmute sound' : 'Mute sound'; b.setAttribute('aria-label', b.title); }
export function waiting(text) { if (text) { $('waiting').textContent = text; show('waiting'); } else hide('waiting'); }
export function seg(id, onChange) { const el = $(id); for (const b of el.children) { pressed(b, b.classList.contains('on')); b.onclick = () => { for (const c of el.children) pressed(c, c === b); onChange(b.dataset.v); }; } return el.querySelector('.on').dataset.v; }

// ---- hub menu: course cards with a mini map, locker room editor ----
export function courseMapSVG(def, holes) {
  const pts = holes.flatMap(h => [h.tee, h.basket, ...h.way]);
  const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]), m = 14;
  const x0 = Math.min(...xs) - m, z0 = Math.min(...zs) - m, w = Math.max(...xs) - x0 + m, hh = Math.max(...zs) - z0 + m;
  let s = `<svg viewBox="${x0} ${z0} ${w} ${hh}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><rect x="${x0}" y="${z0}" width="${w}" height="${hh}" fill="${def.grass[2]}"/>`;
  for (const h of holes) {
    s += `<polyline points="${h.way.map(p => p.join(',')).join(' ')}" fill="none" stroke="${def.grass[0]}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
    for (const p of h.ponds) s += `<ellipse cx="${p.x}" cy="${p.z}" rx="${p.rx}" ry="${p.rz}" fill="${def.water}" opacity="0.95"/>`;
  }
  for (const h of holes) s += `<rect x="${h.tee[0] - 2.5}" y="${h.tee[1] - 2.5}" width="5" height="5" fill="#fff"/><circle cx="${h.basket[0]}" cy="${h.basket[1]}" r="3" fill="#ffd23f" stroke="#1a1a1a" stroke-width="0.8"/>`;
  return s + '</svg>';
}
export const courseStats = holes => ({ par: holes.reduce((a, h) => a + h.par, 0), len: Math.round(holes.reduce((a, h) => a + h.len, 0)) });
export function renderCourseCards(courses, layouts, selectedId, onPick, imgFor) {
  const list = $('courseList'); list.innerHTML = '';
  courses.forEach((c, i) => {
    const st = courseStats(layouts[i]), b = document.createElement('button'); b.className = 'ccard' + (c.id === selectedId ? ' on' : '');
    const img = imgFor?.(c.id);
    pressed(b, c.id === selectedId);
    b.innerHTML = `<div class="cmap">${img ? `<img src="${img}" alt="">` : courseMapSVG(c, layouts[i])}</div><div class="cinfo"><span class="eyebrow">${c.tag}</span><b>${c.name}</b><span class="muted">Par ${st.par} · ${st.len} m · wind ×${c.wind}</span></div><span class="chev">${icon(c.id === selectedId ? 'check' : 'chevron')}</span>`;
    b.onclick = () => onPick(c.id); list.appendChild(b);
  });
}
export function setHub({ name, jersey, course, holes, img }) {
  if (name !== undefined) $('hubName').textContent = name;
  if (jersey) $('hubSwatch').style.background = `linear-gradient(160deg, ${jersey}, ${jersey} 60%, rgba(0,0,0,0.35))`;
  if (course) { const st = courseStats(holes); $('hubCourse').textContent = course.name; $('hubCourseSub').textContent = `Par ${st.par} · ${st.len} m · ${course.tag.toLowerCase()}`; $('hubMap').innerHTML = img ? `<img src="${img}" alt="">` : courseMapSVG(course, holes); }
}
const AV_LABELS = { skin: 'Skin', hair: 'Hair', hairColor: 'Hair colour', headwear: 'Headwear', headwearColor: 'Headwear colour', jersey: 'Jersey', accent: 'Trim', number: 'Number', shorts: 'Shorts', shoes: 'Shoes', build: 'Build', shades: 'Shades' };
export function renderLocker(avatar, opts, onChange) {
  const box = $('avOpts'); box.innerHTML = ''; $('avName').value = avatar.name;
  $('avName').oninput = e => onChange('name', e.target.value);
  const row = (key, inner) => { const d = document.createElement('div'); d.className = 'opt'; d.innerHTML = `<span>${AV_LABELS[key]}</span>`; d.appendChild(inner); box.appendChild(d); };
  for (const key of ['skin', 'hair', 'hairColor', 'headwear', 'headwearColor', 'jersey', 'accent', 'number', 'shorts', 'shoes', 'build', 'shades']) {
    if (key === 'number') { const inp = document.createElement('input'); inp.type = 'number'; inp.setAttribute('aria-label', 'Jersey number'); inp.min = 0; inp.max = 99; inp.value = avatar.number; inp.oninput = e => onChange('number', Math.max(0, Math.min(99, +e.target.value || 0))); row(key, inp); continue; }
    const vals = key === 'shades' ? [true, false] : opts[key], colors = typeof vals[0] === 'string' && vals[0][0] === '#';
    const wrap = document.createElement('div'); wrap.className = colors ? 'sw-row' : 'seg';
    for (const v of vals) {
      const b = document.createElement('button'); pressed(b, avatar[key] === v);
      if (colors) { b.style.background = v; b.title = `${AV_LABELS[key]} ${v}`; b.setAttribute('aria-label', b.title); } else { b.textContent = key === 'shades' ? (v ? 'On' : 'Off') : v[0].toUpperCase() + v.slice(1); b.setAttribute('aria-label', `${AV_LABELS[key]}: ${b.textContent}`); }
      b.onclick = () => { for (const c of wrap.children) pressed(c, c === b); onChange(key, v); };
      wrap.appendChild(b);
    }
    row(key, wrap);
  }
}

export const scoreName = (strokes, par) => {
  if (strokes === 1) return 'ACE!'; const d = strokes - par;
  return d <= -3 ? 'Albatross!' : d === -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double bogey' : d === 3 ? 'Triple bogey' : `+${d}`;
};
export function renderScorecard({ players, holes, holeIdx, final, isHost, online }) {
  const played = holes.slice(0, holeIdx + 1);
  const totals = players.map(p => { let s = 0, par = 0; played.forEach((h, i) => { if (p.scores[i] != null) { s += p.scores[i]; par += h.par; } }); return { p, s, toPar: s - par }; });
  const sorted = [...totals].sort((a, b) => a.toPar - b.toPar);
  $('scoreTitle').textContent = final ? 'Final results' : `Hole ${holeIdx + 1} complete`;
  $('scoreStand').innerHTML = sorted.map((t, i) => `<div class="stand ${final && i === 0 ? 'win' : ''}"><span class="standing-name"><span class="rank">${final && i === 0 ? icon('trophy') : String(i + 1).padStart(2, '0')}</span><span>${escapeText(t.p.name)}${t.p.isBot ? ' <span class="muted">bot</span>' : ''}</span></span><b>${t.s} <span class="muted">(${t.toPar > 0 ? '+' : ''}${t.toPar})</span></b></div>`).join('');
  let html = `<tr><th></th>${holes.map((h, i) => `<th>${i + 1}<div class="muted">${h.par}</div></th>`).join('')}<th>Tot</th></tr>`;
  for (const t of totals) html += `<tr><td class="name" style="color:${t.p.color}">${t.p.name}</td>${holes.map((h, i) => { const s = t.p.scores[i]; return s == null ? `<td>–</td>` : `<td class="s${Math.max(-3, Math.min(4, s - h.par))} ${i === holeIdx ? 'cur' : ''}">${s}</td>`; }).join('')}<td><b>${t.s}</b></td></tr>`;
  $('scoreTable').innerHTML = html;
  $('btnScoreNext').innerHTML = `${final ? 'Play again' : 'Next hole'}${icon('arrow')}`;
  const hostOk = !online || isHost;
  $('btnScoreNext').classList.toggle('hidden', !hostOk); $('scoreWait').classList.toggle('hidden', hostOk);
  hide('hud'); show('score');   // the card replaces the live HUD instead of stacking on it
}
