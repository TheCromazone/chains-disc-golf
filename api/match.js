// Invite matches API: create, join, play a turn, alerts, and the seat-aware app manifest. Vercel Function (Node), web-standard handlers.
import { createMatch, joinMatch, seatPlayer, playTurn, markAway, markBack, addPush, publicMatch, isFinished, MatchError } from '../server/match-core.js';
import { loadMatch, saveMatch, updateMatch } from '../server/store.js';
import { notify, vapidPublicKey } from '../server/push.js';

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const idOk = id => typeof id === 'string' && /^[A-HJ-NP-Z2-9]{8}$/.test(id);
const NOT_FOUND = { error: 'No match found for that link. It may have been mistyped.' };
const holeWord = n => `hole ${n + 1}`;

export async function GET(request) {
  const url = new URL(request.url), action = url.searchParams.get('action');
  if (action === 'vapid') return json({ key: vapidPublicKey() });
  if (action === 'manifest') return manifest(url);
  const id = url.searchParams.get('id');
  if (!idOk(id)) return json(NOT_FOUND, 404);
  const cur = await loadMatch(id); if (!cur) return json(NOT_FOUND, 404);
  let you = null; const pid = url.searchParams.get('pid'), token = request.headers.get('x-seat-token');
  if (pid && token) try { you = seatPlayer(cur.data, pid, token); } catch { /* a stale seat reads as a spectator */ }
  const etag = `W/"${cur.data.seq}-${you?.id || ''}"`;
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag, 'cache-control': 'no-store' } });
  return json({ match: publicMatch(cur.data, you) }, 200, { etag });
}

export async function POST(request) {
  const text = await request.text();
  if (text.length > 24000) return json({ error: 'That request is too large.' }, 413);
  let body; try { body = JSON.parse(text); } catch { return json({ error: 'Bad request.' }, 400); }
  const origin = new URL(request.url).origin, id = body?.id;
  try {
    switch (body?.action) {
      case 'create': {
        const { match, seat } = createMatch(body);
        await saveMatch(match.id, match, null);
        return json({ match: publicMatch(match, match.players[0]), seat });
      }
      case 'join': {
        if (!idOk(id)) return json(NOT_FOUND, 404);
        const r = await updateMatch(id, m => joinMatch(m, body)); if (!r) return json(NOT_FOUND, 404);
        const { seat, player } = r.result, host = r.match.players.find(p => p.id === r.match.hostId);
        if (host && host.id !== player.id) await alert(id, host, { title: `${player.name} joined your match`, body: `${r.match.players.length} players at ${r.match.courseName}. Turns go in order — you'll get a ping when you're up.`, url: link(origin, id), tag: `chains-${id}-join` });
        return json({ match: publicMatch(r.match, player), seat });
      }
      case 'turn': {
        if (!idOk(id)) return json(NOT_FOUND, 404);
        const r = await updateMatch(id, m => { const p = seatPlayer(m, body.pid, body.token); return { p, entry: playTurn(m, p, { hole: body.hole, strokes: body.strokes, throws: body.throws }) }; });
        if (!r) return json(NOT_FOUND, 404);
        await afterTurn(origin, r.match, r.result.p, r.result.entry);
        return json({ match: publicMatch(r.match, r.result.p) });
      }
      case 'away': case 'back': {
        if (!idOk(id)) return json(NOT_FOUND, 404);
        const r = await updateMatch(id, m => { const actor = seatPlayer(m, body.pid, body.token); if (body.action === 'away') markAway(m, actor, body.target); else markBack(m, actor); return actor; });
        if (!r) return json(NOT_FOUND, 404);
        if (body.action === 'away') await pingTurn(origin, r.match, `It moved on to you while another player was away.`);
        return json({ match: publicMatch(r.match, r.result) });
      }
      case 'nudge': {   // "Remind them": one push to whoever is up, at most every 10 minutes
        if (!idOk(id)) return json(NOT_FOUND, 404);
        let ok = false;
        const r = await updateMatch(id, m => { const actor = seatPlayer(m, body.pid, body.token); ok = false;
          if (m.turn && m.turn.pid !== actor.id && Date.now() - (m.turn.nudgedAt || 0) > 10 * 60 * 1000) { m.turn.nudgedAt = Date.now(); ok = true; } return actor; });
        if (!r) return json(NOT_FOUND, 404);
        if (ok) await pingTurn(origin, r.match, `${r.result.name} is waiting on you.`);
        return json({ match: publicMatch(r.match, r.result), nudged: ok });
      }
      case 'push': {
        if (!idOk(id)) return json(NOT_FOUND, 404);
        const r = await updateMatch(id, m => { const p = seatPlayer(m, body.pid, body.token); addPush(p, body.subscription); return p; });
        if (!r) return json(NOT_FOUND, 404);
        return json({ match: publicMatch(r.match, r.result), alerts: true });
      }
      default: return json({ error: 'Unknown action.' }, 400);
    }
  } catch (e) {
    if (e instanceof MatchError) return json({ error: e.message }, e.status);
    console.error('match api', e);
    return json({ error: 'Something went wrong on our side. Try again in a moment.' }, 500);
  }
}

const link = (origin, id) => `${origin}/?match=${id}`;
async function afterTurn(origin, match, p, entry) {
  const name = p.name, par = match.pars[entry.hole] || 3, word = scoreWord(entry.strokes, par);
  if (isFinished(match)) {
    const board = [...match.players].filter(q => q.scores.length).map(q => ({ q, t: q.scores.reduce((s, v, i) => s + v - (match.pars[i] || 3), 0) })).sort((a, b) => a.t - b.t);
    const lead = board[0], text = lead ? `${lead.q.name} wins at ${fmt(lead.t)}.` : 'Final scores are in.';
    for (const q of match.players) if (q.id !== p.id) await alert(match.id, q, { title: 'Match over ⛳', body: `${text} Tap for the final scorecard.`, url: link(origin, match.id), tag: `chains-${match.id}` });
    return;
  }
  if (match.turn && match.turn.pid !== p.id) await pingTurn(origin, match, `${name} made ${word} on ${holeWord(entry.hole)}.`);
}
async function pingTurn(origin, match, why) {
  const next = match.players.find(q => q.id === match.turn?.pid); if (!next) return;
  await alert(match.id, next, { title: 'Your turn in Chains ⛳', body: `${why} You're up on ${holeWord(next.scores.length)} at ${match.courseName}.`, url: link(origin, match.id), tag: `chains-${match.id}` });
}
async function alert(id, player, payload) {
  try {
    const { dead } = await notify(player, payload);
    if (dead.length) await updateMatch(id, m => { const q = m.players.find(x => x.id === player.id); if (q) q.push = (q.push || []).filter(s => !dead.includes(s.endpoint)); });
  } catch (e) { console.warn('alert failed', String(e?.message || e).slice(0, 160)); }
}
const fmt = v => v === 0 ? 'even' : v > 0 ? `+${v}` : String(v);
function scoreWord(s, par) {
  if (s === 1) return 'an ace'; const d = s - par;
  return d <= -2 ? 'an eagle' : d === -1 ? 'a birdie' : d === 0 ? 'par' : d === 1 ? 'a bogey' : `a ${d > 0 ? '+' : ''}${d}`;
}

// The installed app's start page carries the seat: an iPhone Home Screen app keeps its own storage, apart from Safari's,
// so without this the app would open not knowing which player you are.
function manifest(url) {
  const SEAT = /^[A-HJ-NP-Z2-9]{8}\.p[0-9a-f]{8}\.[A-Za-z0-9_-]{20,40}$/;
  const seats = (url.searchParams.get('seats') || url.searchParams.get('seat') || '').split(',').filter(s => SEAT.test(s)).slice(0, 8);
  const start = seats.length ? `/#seats=${seats.join(',')}` : '/';
  return new Response(JSON.stringify({ name: 'Chains — Disc Golf', short_name: 'Chains', id: '/', start_url: start, scope: '/', display: 'standalone', orientation: 'any',
    background_color: '#0e2a1f', theme_color: '#65c8ee', description: 'Find your line. Play 3D disc golf with friends on your phone or desktop.',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }, { src: '/assets/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] }),
  { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'no-store' } });
}
