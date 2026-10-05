import { THROWS, DISCS } from './physics.js';

export const MAX_PLAYERS = 12;
export const PROTOCOL_VERSION = 2;
export const safeName = value => String(value || 'Player').replace(/[\u0000-\u001f]/g, '').slice(0, 14).trim() || 'Player';
export const turnKey = g => `${g.sessionId}:${g.holeIdx}:${g.cur}:${g.players[g.cur]?.strokes ?? 0}`;
export const lobbyPublic = players => players.map(({ token, ...p }) => p);
export function validateThrowRequest(m, g, from) {
  const p = g.players[g.cur], q = m?.params;
  if (m?.t !== 'throw-request' || m.turn !== turnKey(g) || !p || p.peerId !== from || p.isBot || !q) return false;
  if (!Object.hasOwn(THROWS, q.throwType) || !DISCS.some(d => d.id === q.discId)) return false;
  if (!Array.isArray(q.dir) || q.dir.length !== 2 || !q.dir.every(Number.isFinite) || Math.abs(Math.hypot(...q.dir) - 1) > .02) return false;
  return [['power', .1, 1], ['hyzer', -35, 35], ['yawOffset', -35, 35], ['launchOffset', -6, 16]]
    .every(([k, lo, hi]) => Number.isFinite(q[k]) && q[k] >= lo && q[k] <= hi);
}
