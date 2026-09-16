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
  const angles = { backhand: 0, backhand_io: 0, backhand_oi: 0, forehand: 180, forehand_io: 180, forehand_oi: 180, blade: 135, tomahawk: 90, scoober: -135, hammer: 45, putt: -90 };
  $('hintArrow').innerHTML = icon('arrow'); $('hintArrow').style.transform = `rotate(${angles[throwType]}deg)`;
  $('pad').classList.remove('bad'); $('hintText').textContent = `${t.hint[0].toUpperCase()}${t.hint.slice(1)} to throw`;
  if (sub !== undefined) $('hintSub').textContent = sub;
}
export function badSwipe(throwType) { const p = $('pad'); p.classList.remove('bad'); void p.offsetWidth; p.classList.add('bad'); $('hintSub').textContent = `Wrong direction — ${THROWS[throwType].name}: ${THROWS[throwType].hint}`; }
export function setHud({ hole, par, len, dist, playerName, throwNo, windText, windDeg, circle }) {
  if (hole !== undefined) $('holeLabel').textContent = `HOLE ${hole}`;
  if (par !== undefined) $('holePar').textContent = `Par ${par} · ${Math.round(len)} m`;
  if (dist !== undefined) { const label = dist < 1 ? 'In the basket' : `${dist.toFixed(dist < 20 ? 1 : 0)} m${circle ? ' · C1' : ''}`; $('dist').textContent = label; $('dist').setAttribute('aria-label', dist < 1 ? label : `${label} to basket`); }
  if (playerName !== undefined) $('playerName').textContent = playerName;
  if (throwNo !== undefined) $('throwNo').textContent = throwNo;
  if (windText !== undefined) $('windText').textContent = windText;
  if (windDeg !== undefined) $('windArrow').style.transform = `rotate(${windDeg}deg)`;
}
const equipmentPickers = { throwRow: 'btnThrowPicker', discRow: 'btnDiscPicker' };
let openEquipment = null;
function closeUtilities(returnFocus = false) {
  const wasOpen = $('btnUtilities').getAttribute('aria-expanded') === 'true';
  $('sideBtns').classList.add('hidden'); $('btnUtilities').setAttribute('aria-expanded', 'false');
  if (returnFocus && wasOpen) $('btnUtilities').focus();
}
$('btnUtilities').onclick = () => {
  const wasOpen = $('btnUtilities').getAttribute('aria-expanded') === 'true'; closeUtilities(); closeEquipment();
  if (!wasOpen) { $('sideBtns').classList.remove('hidden'); $('btnUtilities').setAttribute('aria-expanded', 'true'); $('btnTarget').focus(); }
};
$('sideBtns').addEventListener('click', e => { if (e.target.closest('button')) closeUtilities(e.target.closest('button').id !== 'btnMenu'); });
$('sideBtns').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault(); const buttons = [...$('sideBtns').querySelectorAll('button')], i = buttons.indexOf(document.activeElement);
  const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowUp' ? -2 : e.key === 'ArrowDown' ? 2 : 1;
  buttons[e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (i + step + buttons.length) % buttons.length]?.focus();
});
function closeEquipment(returnFocus = false) {
  const previous = openEquipment; openEquipment = null;
  for (const [row, button] of Object.entries(equipmentPickers)) { $(row).classList.add('hidden'); $(button).setAttribute('aria-expanded', 'false'); }
  $('hud').classList.remove('equipment-open');
  if (returnFocus && previous) $(equipmentPickers[previous]).focus();
}
for (const [row, button] of Object.entries(equipmentPickers)) {
  $(button).onclick = () => {
    const wasOpen = openEquipment === row; closeEquipment(); closeUtilities();
    if (wasOpen) return;
    openEquipment = row; $(row).classList.remove('hidden'); $(button).setAttribute('aria-expanded', 'true'); $('hud').classList.add('equipment-open');
    ($(row).querySelector('.on') || $(row).querySelector('button'))?.focus();
  };
  $(row).onkeydown = e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault(); const buttons = [...$(row).querySelectorAll('button')], i = buttons.indexOf(document.activeElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (openEquipment) { e.preventDefault(); closeEquipment(true); } else if ($('btnUtilities').getAttribute('aria-expanded') === 'true') { e.preventDefault(); closeUtilities(true); } } });
document.addEventListener('pointerdown', e => { if (openEquipment && !$('controls').contains(e.target)) closeEquipment(); if (!$('utilities').contains(e.target)) closeUtilities(); });
export function setResultMode(on) { document.body.classList.toggle('result-mode', on); if (on) { closeEquipment(); closeUtilities(); } }
export function buildThrowButtons(onPick) {
  const row = $('throwRow'); row.innerHTML = '';
  for (const [id, t] of Object.entries(THROWS)) { const b = document.createElement('button'); b.dataset.id = id; b.innerHTML = `${icon(id)}<span>${t.name}</span>`; b.title = `${t.name}: ${t.hint}`; b.onclick = () => { onPick(id); closeEquipment(true); }; row.appendChild(b); }
}
export function buildDiscChips(onPick) {
  const row = $('discRow'); row.innerHTML = '';
  for (const d of DISCS) { const b = document.createElement('button'); b.dataset.id = d.id; b.innerHTML = `<i class="dot" style="background:${d.color}"></i>${d.id === 'driver' ? 'Driver' : d.id === 'fairway' ? 'Fairway' : d.id === 'mid' ? 'Midrange' : 'Putter'} <span class="muted">${d.speed}|${d.glide}|${d.turn}|${d.fade}</span>`; b.onclick = () => { onPick(d.id); closeEquipment(true); }; row.appendChild(b); }
}
export function selectThrow(id) { for (const b of $('throwRow').children) pressed(b, b.dataset.id === id); setHint(id); $('currentThrow').textContent = THROWS[id].name; $('currentThrowIcon').innerHTML = icon(id); $('btnThrowPicker').setAttribute('aria-label', `Choose throw, current: ${THROWS[id].name}`); }
export function selectDisc(id) { for (const b of $('discRow').children) pressed(b, b.dataset.id === id); const d = DISCS.find(d => d.id === id); const name = id === 'mid' ? 'Midrange' : id[0].toUpperCase() + id.slice(1); $('currentDisc').textContent = name; $('currentDiscDot').style.background = d?.color || '#fff'; $('btnDiscPicker').setAttribute('aria-label', `Choose disc, current: ${name}`); }
export function setControlsEnabled(on) { if (!on) closeEquipment(); $('controls').style.opacity = on ? 1 : 0.35; $('controls').style.pointerEvents = on ? 'auto' : 'none'; for (const b of $('controls').querySelectorAll('button')) b.disabled = !on; $('pad').style.opacity = on ? 1 : 0.5; }
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
const AV_LABELS = { skin: 'Skin tone', hair: 'Hair shape', hairColor: 'Hair colour', headwear: 'Headwear', headwearColor: 'Headwear colour', jersey: 'Shirt', jerseyStyle: 'Shirt style', accent: 'Trim', number: 'Number', shorts: 'Shorts', socks: 'Socks', shoes: 'Shoes', wristband: 'Wristband', build: 'Build', height: 'Height', shades: 'Shades', eyes: 'Eyes', eyeColor: 'Eye colour', brows: 'Brows', nose: 'Nose', mouth: 'Mouth', facialHair: 'Facial hair', glasses: 'Glasses', hand: 'Throwing hand' };
const AV_GROUPS = { face: ['eyeColor', 'facialHair', 'glasses'], hair: ['hair', 'hairColor', 'headwear', 'headwearColor'], outfit: ['jersey', 'jerseyStyle', 'accent', 'number', 'shorts', 'socks', 'shoes', 'wristband'], body: ['skin', 'build', 'height', 'hand'] };
let lockerCategory = 'face', faceCategory = 'eyeColor';
// Small visual choice cards echo the decal vocabulary. The live 3D figure is the authority.
function faceChoice(key, value, index) {
  const n = index % 4;
  const eye = n === 2 ? '<path d="M12 23q4-7 8 0m10 0q4-7 8 0"/>' : `<ellipse cx="16" cy="22" rx="${n === 3 ? 4 : 2.5}" ry="${n === 1 ? 5 : 3}" fill="currentColor"/><ellipse cx="34" cy="22" rx="${n === 3 ? 4 : 2.5}" ry="${n === 1 ? 5 : 3}" fill="currentColor"/>`;
  const parts = {
    eyes: eye,
    brows: `<path d="M11 ${n === 2 ? 21 : 18}q5 ${n === 2 ? -7 : n === 0 ? -3 : 0} 10 0m8 0q5 ${n === 2 ? -7 : n === 0 ? -3 : 0} 10 0" stroke-width="${n === 3 ? 4 : 2.5}"/>`,
    nose: n === 0 ? '<circle cx="25" cy="25" r="3" fill="currentColor"/>' : n === 2 ? '<path d="m27 17-6 13h8"/>' : `<ellipse cx="25" cy="25" rx="${n === 1 ? 5 : 7}" ry="5"/>`,
    mouth: n === 3 ? '<ellipse cx="25" cy="28" rx="5" ry="7"/>' : `<path d="M15 25q10 ${n === 2 ? 0 : n === 1 ? 15 : 9} 20 0${n === 1 ? 'z' : ''}"/>`,
    facialHair: ['<path d="m15 15 20 20m0-20L15 35" opacity=".4"/>', '<path d="M14 24q11 14 22 0" stroke-dasharray="2 3"/>', '<path d="M20 30q5 8 10 0v-6h-10z" fill="currentColor"/>', '<path d="M15 22q10-6 20 0-10 4-20 0z" fill="currentColor"/>', '<path d="M12 18q1 18 13 18t13-18q-6 8-13 6-7 2-13-6z" fill="currentColor"/>'][index],
    glasses: n === 0 ? '<path d="m15 15 20 20m0-20L15 35" opacity=".4"/>' : `<${n === 1 ? 'circle cx="15" cy="24" r="8"' : 'rect x="7" y="17" width="16" height="13" rx="3"'}/><${n === 1 ? 'circle cx="35" cy="24" r="8"' : 'rect x="27" y="17" width="16" height="13" rx="3"'}/><path d="M23 22h4"/>`
  };
  return `<svg class="face-choice" viewBox="0 0 50 44" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${parts[key] || ''}</svg><span>${escapeText(value[0].toUpperCase() + value.slice(1))}</span>`;
}
export function renderLocker(avatar, opts, onChange) {
  const box = $('avOpts'); box.innerHTML = ''; $('avName').value = avatar.name;
  $('avName').oninput = e => onChange('name', e.target.value);
  const tabs = document.createElement('div'); tabs.className = 'locker-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Appearance categories');
  const content = document.createElement('div'); content.id = 'lockerParts'; content.className = 'locker-parts'; content.setAttribute('role', 'tabpanel');
  box.append(tabs, content);
  const row = (key, inner) => { const d = document.createElement('div'); d.className = 'opt'; d.innerHTML = `<span>${AV_LABELS[key]}</span>`; d.appendChild(inner); content.appendChild(d); };
  function draw() {
    content.innerHTML = ''; content.setAttribute('aria-labelledby', `locker-tab-${lockerCategory}`);
    for (const b of tabs.children) { const selected = b.dataset.category === lockerCategory; b.classList.toggle('on', selected); b.setAttribute('aria-selected', String(selected)); b.tabIndex = selected ? 0 : -1; }
    let keys = AV_GROUPS[lockerCategory];
    if (lockerCategory === 'face') {
      const parts = document.createElement('div'); parts.className = 'face-tabs'; parts.setAttribute('role', 'group'); parts.setAttribute('aria-label', 'Face parts');
      keys.filter(k => opts[k]).forEach(k => { const b = document.createElement('button'); b.textContent = AV_LABELS[k]; pressed(b, faceCategory === k); b.onclick = () => { faceCategory = k; draw(); }; parts.append(b); });
      content.append(parts); keys = [faceCategory];
    }
    for (const key of keys) {
      if (key === 'number') { const inp = document.createElement('input'); inp.type = 'number'; inp.setAttribute('aria-label', 'Jersey number'); inp.min = 0; inp.max = 99; inp.value = avatar.number; inp.oninput = e => { avatar.number = Math.max(0, Math.min(99, +e.target.value || 0)); onChange('number', avatar.number); }; row(key, inp); continue; }
      const vals = opts[key]; if (!vals?.length) continue;
      const colors = typeof vals[0] === 'string' && vals[0][0] === '#';
      const wrap = document.createElement('div'); wrap.className = colors ? 'sw-row' : 'choice-grid'; wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', AV_LABELS[key]);
      vals.forEach((v, index) => {
        const b = document.createElement('button'); pressed(b, avatar[key] === v);
        const label = `${AV_LABELS[key]}: ${v}`; b.title = label; b.setAttribute('aria-label', label);
        if (colors) b.style.setProperty('--swatch', v);
        else if (['eyes', 'brows', 'nose', 'mouth', 'glasses', 'facialHair'].includes(key)) b.innerHTML = faceChoice(key, v, index);
        else b.textContent = v[0].toUpperCase() + v.slice(1);
        b.onclick = () => { for (const c of wrap.children) pressed(c, c === b); avatar[key] = v; onChange(key, v); };
        wrap.appendChild(b);
      });
      row(key, wrap);
    }
  }
  for (const [category, title] of Object.entries({ face: 'Face', hair: 'Hair', outfit: 'Outfit', body: 'Body' })) {
    const b = document.createElement('button'); b.id = `locker-tab-${category}`; b.dataset.category = category; b.textContent = title; b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', 'lockerParts'); b.onclick = () => { lockerCategory = category; draw(); }; tabs.append(b);
    b.onkeydown = e => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return; e.preventDefault(); const list = [...tabs.children], i = list.indexOf(b); const next = e.key === 'Home' ? list[0] : e.key === 'End' ? list.at(-1) : list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length]; next.click(); next.focus(); };
  }
  draw();
}

export const scoreName = (strokes, par) => {
  if (strokes === 1) return 'ACE!'; const d = strokes - par;
  return d <= -3 ? 'Albatross!' : d === -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double bogey' : d === 3 ? 'Triple bogey' : `+${d}`;
};
export function renderScorecard({ players, holes, holeIdx, final, isHost, online, best = null }) {
  const played = holes.slice(0, holeIdx + 1);
  const fmt = v => v === 0 ? 'E' : v > 0 ? `+${v}` : String(v);
  $('scoreBest').classList.toggle('hidden', !best);
  if (best) $('scoreBest').textContent = !best.isNew ? `Personal best here: ${fmt(best.prev)}` : best.prev == null ? `Your first round here: ${fmt(best.toPar)}` : `New personal best: ${fmt(best.toPar)} (was ${fmt(best.prev)})`;
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
