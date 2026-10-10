import { THROWS, DISCS } from './physics.js';

export const MAX_PLAYERS = 12;
export const PROTOCOL_VERSION = 4;   // 3: binary serialization (PeerJS chunks big messages; JSON mode silently dropped any over 16 KB); 4: waiting room (ready, look, room settings, turn order)
export const safeName = value => String(value || 'Player').replace(/[\u0000-\u001f]/g, '').slice(0, 14).trim() || 'Player';
// Four friends who never changed the default name all arrive as "You": number the repeats ("You 2") so the lobby,
// the scorecard and whose-turn toasts can tell them apart.
export const uniqueName = (value, taken) => {
  const base = safeName(value), used = new Set([...taken].map(n => String(n).toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) { const tag = ` ${i}`, name = base.slice(0, 14 - tag.length).trim() + tag; if (!used.has(name.toLowerCase())) return name; }
};
export const turnKey = g => `${g.sessionId}:${g.holeIdx}:${g.cur}:${g.players[g.cur]?.strokes ?? 0}`;
// Turn order. 'away': a real round, honours on the tee, then whoever lies farthest from the basket. 'through': each player
// plays out the whole hole before the next one tees off (the honours order still sets who goes first).
export const ORDERS = ['away', 'through'];
export const safeOrder = v => ORDERS.includes(v) ? v : 'away';
// A guest's public tag: a short hash of its session token, so a phone can find its own card in the waiting room (names are
// renumbered by the host and peer ids differ on the relay) without the token itself, which reclaims a seat, leaving the host.
export const tokenTag = token => { let h = 0x811c9dc5; for (const c of String(token || '')) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193); return (h >>> 0).toString(36); };
export const lobbyPublic = players => players.map(({ token, ...p }) => token ? { ...p, tag: tokenTag(token) } : p);
// The host's round settings as the waiting room shows them; a guest renders whatever arrives, so keep it to known values.
export const safeRoom = (r, courseIds) => ({ courseId: courseIds.includes(r?.courseId) ? r.courseId : courseIds[0], holes: r?.holes === 3 ? 3 : 9, order: safeOrder(r?.order) });
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
