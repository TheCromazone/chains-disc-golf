// Invite matches, client side: the GamePigeon-style mode. Start a match, send the link to the group chat, everyone plays
// their hole when they can, and the next player gets a push (or a one-tap Messages nudge). The server (api/match.js)
// keeps the scorecard and decides whose turn it is; this module keeps each seat's key on the device and draws the screens.
const API = 'api/match';   // relative: Chains also runs one level down, as Huck Yeah's disc golf (huckyeah.vercel.app/discgolf/)
const SEATS = 'chains.seats', PENDING = 'chains.pendingTurns';
const ID = /^[A-HJ-NP-Z2-9]{8}$/, SEAT = /^([A-HJ-NP-Z2-9]{8})\.(p[0-9a-f]{8})\.([A-Za-z0-9_-]{20,40})$/;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: this session only */ } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = v => v === 0 ? 'E' : v > 0 ? `+${v}` : `−${-v}`;
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const scoreWord = (s, par) => s === 1 ? 'an ace' : s - par <= -2 ? 'an eagle' : s - par === -1 ? 'a birdie' : s === par ? 'par' : s - par === 1 ? 'a bogey' : `+${s - par}`;
const link = id => new URL(`./?match=${id}`, location.href).href;

export function createMatches(d) {
  const $ = id => document.getElementById(id);
  let seats = read(SEATS, {}), current = null, matchCache = new Map(), poll = null, etag = '', justPlayed = null;
  const seatOf = id => seats[id];
  const saveSeat = (seat, name) => { seats[seat.id] = { pid: seat.pid, token: seat.token, name, at: Date.now() }; write(SEATS, seats); };

  async function call(body) {
    const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || `The match service answered ${r.status}.`); e.status = r.status; throw e; }
    return j;
  }
  async function fetchMatch(id, conditional = false, seq = 0) {
    const seat = seatOf(id), url = `${API}?id=${id}${seat ? `&pid=${seat.pid}` : ''}${seq ? `&seq=${seq}` : ''}`;
    const r = await fetch(url, { headers: { ...(seat ? { 'x-seat-token': seat.token } : {}), ...(conditional && etag ? { 'if-none-match': etag } : {}) }, cache: 'no-store' });
    if (r.status === 304) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Could not load the match.'); e.status = r.status; throw e; }
    if (conditional) etag = r.headers.get('etag') || '';
    matchCache.set(id, j.match); return j.match;
  }
  // Polls ask only "has anything changed?" (one number, cached by the CDN for every player in the match) and fetch the
  // whole match only when it has: each origin read of the match spends the Blob store's small monthly operation budget.
  async function fetchSeq(id) {
    const r = await fetch(`${API}?action=seq&id=${id}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Could not load the match.'); e.status = r.status; throw e; }
    return j;
  }
  async function freshMatch(id) {
    const s = await fetchSeq(id), was = matchCache.get(id);
    return was && was.seq >= s.seq ? was : fetchMatch(id, false, s.seq);
  }

  // ---- screens ----
  const panes = ['matchHome', 'matchJoin', 'matchView'];
  function showPane(id) { d.hideMenus(); $('matches').classList.remove('hidden'); for (const p of panes) $(p).classList.toggle('hidden', p !== id); if (id !== 'matchView') stopPoll(); }
  function close() { stopPoll(); current = null; $('matches').classList.add('hidden'); d.showMenu(); refreshBadge(); }
  const error = (el, msg) => { $(el).textContent = msg || ''; $(el).classList.toggle('hidden', !msg); };

  async function openHome() {
    showPane('matchHome'); error('matchHomeError');
    const course = d.course(); $('matchNewSub').textContent = `${course.name} · ${d.holes()} holes · change both in the clubhouse`;
    const ids = Object.keys(seats).sort((a, b) => (seats[b].at || 0) - (seats[a].at || 0)).slice(0, 20), list = $('matchList');
    list.replaceChildren(...ids.map(id => item(id, matchCache.get(id))));
    await Promise.all(ids.map(async id => { try { const m = await freshMatch(id); list.querySelector(`[data-id="${id}"]`)?.replaceWith(item(id, m)); } catch (e) { if (e.status === 404) { delete seats[id]; write(SEATS, seats); list.querySelector(`[data-id="${id}"]`)?.remove(); } } }));
  }
  function item(id, m) {
    const b = document.createElement('button'); b.className = 'match-item'; b.dataset.id = id; b.onclick = () => openMatch(id);
    if (!m) { b.innerHTML = `<span class="mi-copy"><b>Match ${esc(id)}</b><span>Loading…</span></span>`; return b; }
    const s = summary(m); b.classList.toggle('yours', s.yours);
    b.innerHTML = `<span class="mi-copy"><b>${esc(m.courseName)} · ${m.holeCount} holes</b><span>${esc(s.line)}</span></span><span class="mi-tag">${esc(s.tag)}</span>`;
    return b;
  }
  function summary(m) {
    const me = m.players.find(p => p.id === m.you), up = m.players.find(p => p.id === m.turn?.pid), names = m.players.map(p => p.name).join(', ');
    if (m.finished) { const lead = standings(m)[0]; return { yours: false, tag: 'Final', line: lead ? `${lead.p.id === m.you ? 'You' : lead.p.name} won at ${fmt(lead.toPar)} · ${names}` : names }; }
    if (up && up.id === m.you) return { yours: true, tag: 'Your turn', line: `Hole ${up.scores.length + 1} · with ${names}` };
    return { yours: false, tag: me?.away ? 'Skipped' : 'Waiting', line: up ? `${up.name} is up · ${names}` : names };
  }
  function standings(m) {
    return m.players.map(p => ({ p, total: p.scores.reduce((s, v) => s + v, 0), toPar: p.scores.reduce((s, v, i) => s + v - (m.pars[i] || 3), 0), played: p.scores.length }))
      .sort((a, b) => b.played - a.played || a.toPar - b.toPar);
  }

  async function openMatch(id, { fresh = false } = {}) {
    current = id; etag = ''; justPlayed = fresh ? justPlayed : null; showPane('matchView'); error('matchError');
    const cached = matchCache.get(id); if (cached) render(cached);
    try { render(await fetchMatch(id, true) || matchCache.get(id)); }
    catch (e) { error('matchError', e.message); if (e.status === 404) { delete seats[id]; write(SEATS, seats); } }
    startPoll(); seatManifest(id);
  }
  function render(m) {
    if (!m || m.id !== current) return;
    const me = m.players.find(p => p.id === m.you), up = m.players.find(p => p.id === m.turn?.pid), mine = !!me && up?.id === me.id;
    $('matchCourse').textContent = `${m.courseName} · ${m.holeCount} holes · ${m.players.length} player${m.players.length > 1 ? 's' : ''}`;
    $('matchTitle').textContent = m.finished ? 'Final results' : !me ? 'Spectating' : mine ? 'Your turn' : up ? `${up.name} is up` : 'Waiting';
    const status = $('matchStatus'); status.classList.toggle('yours', mine && !m.finished);
    let html;
    if (m.finished) { const lead = standings(m)[0]; html = `<b>${esc(lead.p.id === m.you ? 'You win' : `${lead.p.name} wins`)}</b> at ${fmt(lead.toPar)}. Start a rematch from New match.`; }
    else if (!me) html = 'You are not in this match on this device.';
    else if (me.away) html = 'The group moved on while you were away. Tap <b>I’m back</b> to get your turns again.';
    else if (mine && m.players.length === 1) { const h = me.scores.length; html = `Send the link to your group chat: friends who join catch up from hole 1. Or play on: hole <b>${h + 1}</b> of ${m.holeCount}, par ${m.pars[h] || 3}.`; }
    else if (mine) { const h = me.scores.length; html = `Hole <b>${h + 1}</b> of ${m.holeCount} · par ${m.pars[h] || 3}. Play it whenever you like: one turn is your whole hole.`; }
    else if (up) html = `Waiting on <b>${esc(up.name)}</b> for hole ${up.scores.length + 1} · up since ${ago(m.turn.since)}.${up.alerts ? ' They have alerts on.' : ' They don’t have alerts on, so send them a nudge.'}`;
    else html = 'Waiting for players.';
    if (justPlayed && !m.finished) html = `${justPlayed} ` + html;
    status.innerHTML = html;
    const solo = mine && m.players.length === 1 && !m.finished;   // alone in the match: inviting is the main thing to do, playing on the second
    $('btnMatchPlay').classList.toggle('hidden', !mine || m.finished || me?.away); $('btnMatchPlay').classList.toggle('primary', !solo);
    $('matchPlayLabel').textContent = me ? `Play hole ${me.scores.length + 1}` : 'Play';
    const showSend = !!justPlayed && !!up && !mine && !m.finished; $('btnMatchSend').classList.toggle('hidden', !showSend && !solo);
    $('btnMatchSend').dataset.kind = solo ? 'invite' : 'turn';
    $('matchSendLabel').textContent = solo ? 'Invite friends to play' : up ? `Tell ${up.name} it’s their turn` : 'Send the link';
    if (solo) $('btnMatchSend').after($('btnMatchPlay')); else $('btnMatchPlay').after($('btnMatchSend'));
    $('matchWaitActions').classList.toggle('hidden', !me || mine || m.finished || !up || showSend);
    $('btnMatchSkip').disabled = !m.turn || Date.now() - m.turn.since < 30 * 60 * 1000;
    $('btnMatchSkip').title = $('btnMatchSkip').disabled ? 'You can skip a turn after 30 minutes' : '';
    $('btnMatchBack2').classList.toggle('hidden', !me?.away);
    $('btnMatchInvite').classList.toggle('hidden', m.finished);
    // scorecard
    const holes = Array.from({ length: m.holeCount }, (_, i) => i), cur = me ? me.scores.length : -1;
    let t = `<tr><th>Hole<small>Par</small></th>${holes.map(i => `<th${i === cur ? ' class="cur"' : ''}>${i + 1}<small>${m.pars[i] || 3}</small></th>`).join('')}<th>Tot</th></tr>`;
    for (const { p, total, toPar } of standings(m)) {
      const cls = [p.id === m.turn?.pid ? 'up' : '', p.away ? 'away' : ''].join(' ').trim();
      t += `<tr${cls ? ` class="${cls}"` : ''}><td class="name"><i class="dot" style="background:${/^#[0-9a-f]{6}$/i.test(p.avatar?.jersey || '') ? p.avatar.jersey : '#8aa'}"></i>${esc(p.id === m.you ? `${p.name} (you)` : p.name)}</td>${holes.map(i => { const s = p.scores[i]; return s == null ? '<td></td>' : `<td class="s${Math.max(-3, Math.min(4, s - (m.pars[i] || 3)))}">${s}</td>`; }).join('')}<td class="tot">${p.scores.length ? total : '–'}<small>${p.scores.length ? fmt(toPar) : ''}</small></td></tr>`;
    }
    $('matchTable').innerHTML = t;
    const byId = Object.fromEntries(m.players.map(p => [p.id, p]));
    $('matchFeed').innerHTML = [...m.log].reverse().slice(0, 5).map(e => `<li><b>${esc(byId[e.pid]?.name || 'Someone')}</b> made ${scoreWord(e.strokes, m.pars[e.hole] || 3)} on hole ${e.hole + 1} · ${ago(e.at)}</li>`).join('');
    alertsButton(m, me);
  }
  function alertsButton(m, me) {
    const btn = $('btnMatchAlerts'), label = $('matchAlertsLabel'), on = !!me?.alerts && typeof Notification !== 'undefined' && Notification.permission === 'granted';
    btn.classList.toggle('hidden', !me || m.finished); btn.disabled = on;
    label.textContent = on ? 'Turn alerts are on' : isIOS && !standalone() ? 'Get turn alerts on iPhone' : 'Turn on turn alerts';
    $('matchInstall').classList.add('hidden');
  }

  // ---- polling while the match is on screen ----
  // Every 5 s while the match keeps moving, easing to 12 s and then 30 s once it has sat still for 3 and 10 minutes
  // (turn alerts and coming back to the tab bring it straight back).
  let lastChange = 0, pollGen = 0;   // pollGen: a newer poll chain (reopened match, tab shown again) retires the older one
  function startPoll() { stopPoll(); lastChange = Date.now(); schedulePoll(pollGen); }
  function schedulePoll(gen) { const idle = Date.now() - lastChange; poll = setTimeout(() => pollOnce(gen), idle < 180000 ? 5000 : idle < 600000 ? 12000 : 30000); }
  async function pollOnce(gen) {
    const id = current; if (!id || gen !== pollGen) return;
    if (!document.hidden) try {
      const was = matchCache.get(id), s = await fetchSeq(id);
      if (current === id && (!was || s.seq > was.seq)) {
        const m = await fetchMatch(id, false, s.seq); lastChange = Date.now();
        if (current === id) { if (m.turn?.pid === m.you && was?.turn?.pid !== m.you) { d.toast('Your turn!', `Hole ${(m.players.find(p => p.id === m.you)?.scores.length || 0) + 1} is ready`, 2200); d.buzz?.([40, 60, 40]); } render(m); }
      }
    } catch { /* offline for a moment */ }
    if (current === id && gen === pollGen) schedulePoll(gen);
  }
  function stopPoll() { clearTimeout(poll); poll = null; pollGen++; }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && current && poll) { stopPoll(); lastChange = Date.now(); poll = -1; pollOnce(pollGen); } });

  // ---- actions ----
  async function newMatch() {
    error('matchHomeError'); const btn = $('btnMatchNew'); btn.disabled = true;
    try {
      const me = d.me(), course = d.course();
      const { match, seat } = await call({ action: 'create', name: me.name, avatar: me.avatar, courseId: course.id, courseName: course.name, holeCount: d.holes(), pars: d.pars(course.id) });
      saveSeat(seat, me.name); matchCache.set(match.id, match); await attachPush(match.id);
      openMatch(match.id);
    } catch (e) { error('matchHomeError', `Could not start a match: ${e.message}`); }
    finally { btn.disabled = false; }
  }
  async function showJoin(id) {
    showPane('matchJoin'); error('matchJoinError'); $('matchJoin').dataset.id = id;
    if (!$('matchName').value && d.me().name !== 'You') $('matchName').value = d.me().name;   // never prefill the default 'You' $('matchJoinApp').classList.toggle('hidden', !(isIOS && !standalone()));
    $('matchJoinTitle').textContent = 'Join the match'; $('matchJoinSub').textContent = 'Loading the invite…'; $('btnMatchJoin').disabled = true;
    try {
      const m = await fetchMatch(id), host = m.players.find(p => p.id === m.hostId);
      $('matchJoinTitle').textContent = `${host?.name || 'A friend'} invited you`;
      $('matchJoinSub').textContent = m.finished ? 'This match has finished.' : `${m.holeCount} holes at ${m.courseName} with ${m.players.map(p => p.name).join(', ')}. You'll take your turns when it suits you.`;
      $('btnMatchJoin').disabled = m.finished;
    } catch (e) { $('matchJoinSub').textContent = ''; error('matchJoinError', e.message); }
  }
  async function join() {
    const id = $('matchJoin').dataset.id, name = $('matchName').value.trim() || d.me().name; error('matchJoinError'); $('btnMatchJoin').disabled = true;
    try { const { match, seat } = await call({ action: 'join', id, name, avatar: { ...d.me().avatar, name } }); saveSeat(seat, name); matchCache.set(id, match); await attachPush(id); openMatch(id); }
    catch (e) { error('matchJoinError', e.message); }
    finally { $('btnMatchJoin').disabled = false; }
  }
  function play() {
    const m = matchCache.get(current), seat = seatOf(current), me = m?.players.find(p => p.id === m.you);
    if (!m || !seat || !me) return;
    stopPoll(); $('matches').classList.add('hidden');
    d.startTurn({ matchId: m.id, courseId: m.courseId, holeCount: m.holeCount, hole: me.scores.length });
  }
  // The hole is done (main.js calls this from endHole): record it, keep it on the device until the server has it.
  async function holeDone({ matchId, hole, strokes, throws }) {
    const pending = read(PENDING, []).filter(p => !(p.matchId === matchId && p.hole === hole));
    pending.push({ matchId, hole, strokes, throws, at: Date.now() }); write(PENDING, pending);
    const m = matchCache.get(matchId), par = m?.pars[hole] || 3;
    justPlayed = `You made <b>${scoreWord(strokes, par)}</b> on hole ${hole + 1}.`;
    current = matchId; showPane('matchView'); error('matchError');
    const view = $('matchView'); view.dataset.busy = '1';   // the card shows only "saving" until the server has the score
    for (const b of ['btnMatchPlay', 'btnMatchSend', 'matchWaitActions']) $(b).classList.add('hidden');
    $('matchTitle').textContent = 'Saving your score…'; $('matchStatus').innerHTML = justPlayed;
    try { await flushPending(matchId); } finally { delete view.dataset.busy; }
    await openMatch(matchId, { fresh: true });
  }
  async function flushPending(only = null) {
    let pending = read(PENDING, []);
    for (const p of [...pending]) {
      if (only && p.matchId !== only) continue;
      const seat = seatOf(p.matchId); if (!seat) { pending = pending.filter(x => x !== p); continue; }
      try { const { match } = await call({ action: 'turn', id: p.matchId, pid: seat.pid, token: seat.token, hole: p.hole, strokes: p.strokes, throws: p.throws }); matchCache.set(p.matchId, match); pending = pending.filter(x => x !== p); }
      catch (e) { if (e.status === 409 || e.status === 403 || e.status === 404 || e.status === 400) pending = pending.filter(x => x !== p); else { error('matchError', `Your score is saved on this phone and will send when you're back online. (${e.message})`); } }
    }
    write(PENDING, pending);
  }
  async function share(kind) {
    const m = matchCache.get(current); if (!m) return;
    const up = m.players.find(p => p.id === m.turn?.pid), me = m.players.find(p => p.id === m.you), last = m.log.filter(e => e.pid === m.you).at(-1);
    const text = kind === 'turn' && up ? `Your turn, ${up.name}! ${last ? `I made ${scoreWord(last.strokes, m.pars[last.hole] || 3)} on hole ${last.hole + 1}. ` : ''}⛳ Chains disc golf`
      : `Join my disc golf match: ${m.holeCount} holes at ${m.courseName}${me ? ` with ${m.players.map(p => p.name).join(', ')}` : ''}. Take your turn when you can ⛳`;
    const url = link(m.id);
    try { if (navigator.share) { await navigator.share({ title: 'Chains — Disc Golf', text, url }); if (kind === 'turn') { justPlayed = null; render(m); } return; } }
    catch (e) { if (e?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(`${text} ${url}`); d.toast('Link copied', 'Paste it into your group chat', 1800); if (kind === 'turn') { justPlayed = null; render(m); } }
    catch { prompt('Copy this link:', url); }
  }
  async function act(action, extra = {}) {
    const seat = seatOf(current); if (!seat) return; error('matchError');
    try { const r = await call({ action, id: current, pid: seat.pid, token: seat.token, ...extra }); matchCache.set(current, r.match); render(r.match); return r; }
    catch (e) { error('matchError', e.message); }
  }

  // ---- alerts ----
  const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
  async function subscription(prompt) {
    if (!canPush()) return null;
    if (Notification.permission === 'denied') throw new Error('Notifications are blocked for this site. Turn them on in your browser settings.');
    if (Notification.permission !== 'granted') { if (!prompt) return null; if (await Notification.requestPermission() !== 'granted') throw new Error('Alerts stay off. You can still nudge friends through Messages.'); }
    const reg = await navigator.serviceWorker.ready, existing = await reg.pushManager.getSubscription(); if (existing) return existing;
    const { key } = await (await fetch(`${API}?action=vapid`)).json();
    if (!key) throw new Error("Turn alerts aren't switched on for this server yet. Use the Messages nudge for now.");
    return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
  }
  async function attachPush(id, prompt = false) {
    try { const sub = await subscription(prompt); if (!sub) return false; const seat = seatOf(id); if (!seat) return false; const r = await call({ action: 'push', id, pid: seat.pid, token: seat.token, subscription: sub.toJSON() }); matchCache.set(id, r.match); return true; }
    catch (e) { if (prompt) throw e; return false; }
  }
  async function enableAlerts() {
    error('matchError');
    if (isIOS && !standalone()) { $('matchInstall').classList.toggle('hidden'); return; }
    if (!canPush()) { error('matchError', "This browser can't show game alerts. Use the Messages nudge, or open Chains in Chrome or Safari."); return; }
    try { $('btnMatchAlerts').disabled = true; await attachPush(current, true); for (const id of Object.keys(seats)) if (id !== current) await attachPush(id); d.toast('Turn alerts on', "You'll get a ping when it's your turn", 1800); render(matchCache.get(current)); }
    catch (e) { error('matchError', e.message); $('btnMatchAlerts').disabled = false; }
  }
  // An iPhone Home Screen app keeps its own storage: the manifest it is installed from carries this device's seats.
  function seatManifest(id) {
    if (!isIOS || standalone()) return;
    const list = [id, ...Object.keys(seats).filter(x => x !== id)].slice(0, 8).map(x => seatOf(x) && `${x}.${seatOf(x).pid}.${seatOf(x).token}`).filter(Boolean);
    const linkEl = document.querySelector('link[rel="manifest"]'); if (linkEl && list.length) linkEl.href = `${API}?action=manifest&base=${encodeURIComponent(new URL('./', location.href).pathname)}&seat=${encodeURIComponent(list[0])}&seats=${encodeURIComponent(list.join(','))}`;
  }

  async function refreshBadge() {
    const badge = $('matchBadge'), ids = Object.keys(seats); if (!badge) return;
    if (!ids.length) { badge.classList.add('hidden'); return; }
    let n = 0; await Promise.all(ids.slice(0, 12).map(async id => { try { const s = await fetchSeq(id); if (!s.finished && s.turn && s.turn === seatOf(id)?.pid) n++; } catch { /* skip */ } }));
    badge.textContent = String(n); badge.classList.toggle('hidden', !n);
  }

  // ---- links that open the game: ?match=ID (invite or alert), #seat=/#seats= (installed app), a pasted link ----
  function route(raw) {
    let url; try { url = new URL(raw, location.origin); } catch { return false; }
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const seatList = (hash.get('seats') || hash.get('seat') || '').split(',').map(s => s.match(SEAT)).filter(Boolean);
    for (const [, id, pid, token] of seatList) if (!seats[id]) saveSeat({ id, pid, token }, d.me().name);
    const id = (url.searchParams.get('match') || url.searchParams.get('join') || seatList[0]?.[1] || '').toUpperCase();
    if (!ID.test(id)) return false;
    if (seatOf(id)) openMatch(id); else showJoin(id);
    return true;
  }
  function boot() {
    const opened = route(location.href);
    if (opened || /[?&](match|join)=|#seats?=/.test(location.href)) history.replaceState(null, '', location.pathname);
    flushPending().then(refreshBadge);
    navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.type !== 'open' || !e.data.url) return; if (d.inRound?.()) { d.toast('Your turn in a match', 'Open Friends when this round ends', 2600); return; } route(e.data.url); });   // an alert tapped mid-round never covers the game
    return opened;
  }

  // wiring
  $('btnMatchNew').onclick = newMatch;
  $('btnMatchesBack').onclick = close;
  $('btnLive').onclick = () => { $('matches').classList.add('hidden'); d.openLive(); };
  $('btnMatchPaste').onclick = () => { const v = $('matchPaste').value.trim(); if (!route(v)) error('matchHomeError', 'That doesn’t look like a Chains invite link.'); else $('matchPaste').value = ''; };
  $('btnMatchJoin').onclick = join;
  $('btnMatchJoinBack').onclick = () => openHome();
  $('btnMatchPlay').onclick = play;
  $('btnMatchSend').onclick = () => share($('btnMatchSend').dataset.kind || 'turn');
  $('btnMatchInvite').onclick = () => share('invite');
  $('btnMatchNudge').onclick = async () => { const r = await act('nudge'); if (r) d.toast(r.nudged ? 'Reminder sent' : 'Reminded recently', r.nudged ? 'They’ll get a ping if alerts are on' : 'Try the Messages nudge instead', 1800); if (r && !r.nudged) share('turn'); };
  $('btnMatchSkip').onclick = () => { const m = matchCache.get(current); if (m?.turn) act('away', { target: m.turn.pid }); };
  $('btnMatchBack2').onclick = () => act('back');
  $('btnMatchAlerts').onclick = enableAlerts;
  $('btnMatchBack').onclick = () => openHome();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* no alerts on this browser */ });

  return { open: openHome, openMatch, boot, holeDone, refreshBadge, isOpen: () => !$('matches').classList.contains('hidden') };
}
