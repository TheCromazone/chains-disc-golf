import { THROWS, DISCS } from './physics.js';

export const MAX_PLAYERS = 12;
export const PROTOCOL_VERSION = 3;   // 3: binary serialization (PeerJS chunks big messages; JSON mode silently dropped any over 16 KB)
export const safeName = value => String(value || 'Player').replace(/[\u0000-\u001f]/g, '').slice(0, 14).trim() || 'Player';
export const turnKey = g => `${g.sessionId}:${g.holeIdx}:${g.cur}:${g.players[g.cur]?.strokes ?? 0}`;
export const lobbyPublic = players => players.map(({ token, ...p }) => p);
export const safeColor = (c, fallback = '#ff4d3d') => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : fallback;
// A peer's avatar reaches every client's DOM and the host's messages: plain keys, short plain values, no markup or CSS.
export function sanitizeAvatar(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
  const out = {};
  for (const [k, v] of Object.entries(a).slice(0, 48)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,23}$/.test(k)) continue;
    if (k === 'name') out.name = safeName(v).replace(/[<>"'`&]/g, '');
    else if (typeof v === 'string' && v.length <= 24 && /^[\w #.-]*$/.test(v)) out[k] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(-1e4, Math.min(1e4, v));
    else if (typeof v === 'boolean') out[k] = v;
  }
  for (const k of ['jersey', 'accent', 'shorts', 'socks', 'shoes', 'skin', 'hairColor', 'headwearColor', 'eyeColor']) if (k in out && !/^#[0-9a-f]{6}$/i.test(out[k])) delete out[k];
  return out;
}
export function validateThrowRequest(m, g, from) {
  const p = g.players[g.cur], q = m?.params;
  if (m?.t !== 'throw-request' || m.turn !== turnKey(g) || !p || p.peerId !== from || p.isBot || !q) return false;
  if (!Object.hasOwn(THROWS, q.throwType) || !DISCS.some(d => d.id === q.discId)) return false;
  if (!Array.isArray(q.dir) || q.dir.length !== 2 || !q.dir.every(Number.isFinite) || Math.abs(Math.hypot(...q.dir) - 1) > .02) return false;
  return [['power', .1, 1], ['hyzer', -35, 35], ['yawOffset', -35, 35], ['launchOffset', -6, 16]]
    .every(([k, lo, hi]) => Number.isFinite(q[k]) && q[k] >= lo && q[k] <= hi);
}
