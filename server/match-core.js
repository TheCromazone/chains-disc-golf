// Invite matches: turn-based disc golf played on everyone's own time, like a GamePigeon game in Messages.
// A turn is one player's whole hole. Pure rules and validation only (no storage, no network), shared by
// api/match.js and the Node tests, so the turn order is decided in exactly one place.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const MATCH_MAX_PLAYERS = 12;
export const MATCH_VERSION = 1;
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const THROW_TYPES = new Set(['backhand', 'backhand_io', 'backhand_oi', 'forehand', 'forehand_io', 'forehand_oi', 'tomahawk', 'scoober', 'hammer', 'blade', 'putt']);
const DISC_IDS = new Set(['driver', 'fairway', 'mid', 'putter']);
const COURSE_IDS = new Set(['pine', 'meadow', 'lake', 'gull']);
const MAX_STROKES = 12;   // par 5 + pick-up at par + 5 caps a hole at 11; one spare

export class MatchError extends Error { constructor(status, message) { super(message); this.status = status; } }

export const newMatchId = () => [...randomBytes(8)].map(b => ID_CHARS[b % ID_CHARS.length]).join('');
export const newToken = () => randomBytes(18).toString('base64url');
export const hashToken = t => createHash('sha256').update(String(t)).digest('hex');
const newPlayerId = () => 'p' + randomBytes(4).toString('hex');

export const cleanName = v => String(v ?? '').replace(/[\u0000-\u001f<>"'`&]/g, '').trim().slice(0, 14) || 'Player';
const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u001f<>"'`&]/g, '').trim().slice(0, max);
// The same rule as src/protocol.js sanitizeAvatar: plain keys, short plain values, colours as #rrggbb.
export function cleanAvatar(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
  const out = {};
  for (const [k, v] of Object.entries(a).slice(0, 48)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,23}$/.test(k)) continue;
    if (k === 'name') out.name = cleanName(v);
    else if (typeof v === 'string' && v.length <= 24 && /^[\w #.-]*$/.test(v)) out[k] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(-1e4, Math.min(1e4, v));
    else if (typeof v === 'boolean') out[k] = v;
  }
  for (const k of ['jersey', 'accent', 'shorts', 'socks', 'shoes', 'skin', 'hairColor', 'headwearColor', 'eyeColor']) if (k in out && !/^#[0-9a-f]{6}$/i.test(out[k])) delete out[k];
  return out;
}

export function createMatch({ name, avatar, courseId, courseName, holeCount, pars }, now = Date.now()) {
  if (!COURSE_IDS.has(courseId)) throw new MatchError(400, 'Unknown course.');
  const holes = Number(holeCount);
  if (holes !== 3 && holes !== 9) throw new MatchError(400, 'Play 3 or 9 holes.');
  const token = newToken(), host = player(name, avatar, token, now);
  const match = { v: MATCH_VERSION, id: newMatchId(), createdAt: now, updatedAt: now, seq: 1, courseId, courseName: cleanText(courseName, 24) || courseId,
    holeCount: holes, pars: cleanPars(pars, holes), hostId: host.id, players: [host], turn: null, last: null, log: [] };
  match.turn = { pid: host.id, since: now };
  return { match, seat: { id: match.id, pid: host.id, token } };
}
function cleanPars(pars, n) { return Array.from({ length: n }, (_, i) => { const p = Math.round(Number(pars?.[i])); return p >= 2 && p <= 6 ? p : 3; }); }
function player(name, avatar, token, now) {
  return { id: newPlayerId(), name: cleanName(name), avatar: cleanAvatar(avatar), tokenHash: hashToken(token), joinedAt: now, scores: [], away: false, push: [] };
}

export function joinMatch(match, { name, avatar }, now = Date.now()) {
  if (isFinished(match)) throw new MatchError(409, 'This match has finished. Start a new one!');
  if (match.players.length >= MATCH_MAX_PLAYERS) throw new MatchError(409, `This match is full (${MATCH_MAX_PLAYERS} players).`);
  const token = newToken(), p = player(name, avatar, token, now);
  match.players.push(p);
  if (!match.turn) match.turn = nextTurn(match, now);   // never null mid-match, but a match whose players were all away wakes up here
  touch(match, now);
  return { seat: { id: match.id, pid: p.id, token }, player: p };
}

export function seatPlayer(match, pid, token) {
  const p = match.players.find(q => q.id === pid);
  if (!p || typeof token !== 'string' || !token) throw new MatchError(403, 'That seat link is not valid for this match.');
  const a = Buffer.from(p.tokenHash, 'hex'), b = Buffer.from(hashToken(token), 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new MatchError(403, 'That seat link is not valid for this match.');
  return p;
}

// Whose turn: whoever has played the fewest holes (a late joiner catches up first, so nobody waits on them at the end);
// among them, honours: best score on the previous hole, then the best total so far, then who joined first.
export function nextTurn(match, now = Date.now()) {
  const active = match.players.filter(p => !p.away && p.scores.length < match.holeCount);
  if (!active.length) return null;
  const k = Math.min(...active.map(p => p.scores.length));
  const total = p => p.scores.slice(0, k).reduce((s, v) => s + v, 0);
  const pick = active.filter(p => p.scores.length === k).sort((a, b) =>
    (k ? a.scores[k - 1] - b.scores[k - 1] : 0) || (total(a) - total(b)) || (match.players.indexOf(a) - match.players.indexOf(b)))[0];
  return { pid: pick.id, since: now };
}

export const isFinished = match => match.players.length > 0 && match.players.every(p => p.away || p.scores.length >= match.holeCount) && match.players.some(p => p.scores.length >= match.holeCount);

export function playTurn(match, p, { hole, strokes, throws }, now = Date.now()) {
  if (match.turn?.pid !== p.id) throw new MatchError(409, "It isn't your turn any more. Refreshing the match.");
  if (hole !== p.scores.length) throw new MatchError(409, 'That hole was already recorded. Refreshing the match.');
  const s = Math.round(Number(strokes));
  if (!(s >= 1 && s <= MAX_STROKES)) throw new MatchError(400, 'That score is not possible.');
  const list = Array.isArray(throws) ? throws.slice(0, 20).map(cleanThrow) : [];
  p.scores.push(s); p.away = false;
  const entry = { pid: p.id, hole, strokes: s, throws: list, at: now };
  match.log.push(entry); if (match.log.length > 240) match.log.splice(0, match.log.length - 240);
  match.last = { pid: p.id, hole, strokes: s, at: now };
  match.turn = nextTurn(match, now);
  touch(match, now);
  return entry;
}
function cleanThrow(t) {
  const n = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.round(Math.max(lo, Math.min(hi, x)) * 10) / 10 : 0; };
  return { t: THROW_TYPES.has(t?.t) ? t.t : 'backhand', d: DISC_IDS.has(t?.d) ? t.d : 'driver', m: n(t?.m, 0, 400), left: n(t?.left, 0, 600), ob: !!t?.ob, holed: !!t?.holed };
}

// Anyone in the match can step past a player who has sat on their turn; they come back by playing (or tapping "I'm back").
export const AWAY_AFTER_MS = 30 * 60 * 1000;
export function markAway(match, actor, targetId, now = Date.now()) {
  if (match.turn?.pid !== targetId) throw new MatchError(409, 'That player is not up.');
  if (actor.id !== targetId && now - match.turn.since < AWAY_AFTER_MS) throw new MatchError(409, 'Give them a little longer: you can skip a turn after 30 minutes.');
  const target = match.players.find(q => q.id === targetId); target.away = true;
  match.turn = nextTurn(match, now); touch(match, now);
  return target;
}
export function markBack(match, p, now = Date.now()) {
  if (!p.away) return;
  p.away = false;
  if (!match.turn) match.turn = nextTurn(match, now);
  touch(match, now);
}

export function addPush(p, sub) {
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > 1000) throw new MatchError(400, 'That notification subscription is not valid.');
  const keys = sub.keys || {};
  if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || keys.p256dh.length > 200 || keys.auth.length > 100) throw new MatchError(400, 'That notification subscription is not valid.');
  p.push = [{ endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, ...(p.push || []).filter(s => s.endpoint !== sub.endpoint)].slice(0, 3);
}

const touch = (match, now) => { match.updatedAt = now; match.seq = (match.seq || 0) + 1; };

// What a client may see: no token hashes, no push endpoints. `you` marks the caller's own seat.
export function publicMatch(match, you = null) {
  return { v: match.v, id: match.id, seq: match.seq, createdAt: match.createdAt, updatedAt: match.updatedAt, courseId: match.courseId, courseName: match.courseName,
    holeCount: match.holeCount, pars: match.pars, hostId: match.hostId, turn: match.turn, last: match.last, finished: isFinished(match),
    players: match.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, scores: p.scores, away: p.away, joinedAt: p.joinedAt, alerts: (p.push || []).length > 0 })),
    log: match.log.slice(-60), you: you ? you.id : null };
}
