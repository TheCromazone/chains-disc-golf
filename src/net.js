import { PROTOCOL_VERSION, safeName } from './protocol.js';
// One reliable connection per guest. Host owns scores and sends the authoritative replay.
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomId = code => `chains-dg-${code}`;

export function createNet() {
  const net = { peer: null, conns: new Map(), isHost: false, code: null, name: '', onEvent: () => {}, locked: false };
  let generation = 0, closing = false, retry = null, heartbeat = null, lastHost = Date.now(), joining = false;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const options = () => ({ debug: 0, ...(globalThis.CHAINS_PEER_CONFIG || {}) });
  const ready = () => new Promise((res, rej) => {
    if (!window.Peer) return rej(new Error('PeerJS failed to load'));
    const peer = net.peer, gen = generation;
    const timer = later(() => rej(new Error('The room service did not respond. Check your connection and try again.')), 12000);
    peer.once('open', id => { clearTimeout(timer); timers.delete(timer); if (gen === generation) res(id); });
    peer.on('error', e => { if (gen !== generation || closing) return; clearTimeout(timer); timers.delete(timer); rej(e); net.onEvent({ type: 'error', err: e }); });
    peer.on('disconnected', () => { if (gen !== generation || closing) return; later(() => { if (peer.disconnected && !peer.destroyed) peer.reconnect(); }, 1000); });
  });
  const wire = (conn, meta) => {
    const old = net.conns.get(conn.peer); net.conns.set(conn.peer, conn); old?.close();
    const gen = generation;
    conn.on('data', d => {
      if (gen !== generation || closing || !d || typeof d !== 'object') return;
      if (d.t === '_ping') { conn.send({ t: '_pong' }); return; }
      if (d.t === '_pong') { lastHost = Date.now(); return; }
      if (!net.isHost) lastHost = Date.now();
      net.onEvent({ type: 'msg', from: conn.peer, data: d });
    });
    conn.on('close', () => {
      if (closing || gen !== generation || net.conns.get(conn.peer) !== conn) return;
      net.conns.delete(conn.peer); net.onEvent({ type: 'leave', id: conn.peer });
      if (!net.isHost && !joining) scheduleReconnect();
    });
    conn.on('error', e => net.onEvent({ type: 'error', err: e }));
    if (meta) net.onEvent({ type: 'join', id: conn.peer, name: safeName(meta.name), avatar: meta.avatar, token: meta.token, version: meta.version });
  };
  function scheduleReconnect() {
    if (retry || closing) return;
    retry = later(async () => { retry = null; if (closing || net.peer?.destroyed) return;
      try { await connectHost(); net.onEvent({ type: 'reconnected' }); } catch { scheduleReconnect(); }
    }, 1500);
  }
  const connectHost = () => new Promise((res, rej) => {
    joining = true;
    const conn = net.peer.connect(roomId(net.code), { reliable: true, serialization: 'json', metadata: { name: net.name, avatar: net.avatar, token: net.token, version: PROTOCOL_VERSION } });
    const t = later(() => { joining = false; conn.close(); rej(new Error('Room not reachable. Check the code and network, then try again.')); }, 12000);
    conn.once('open', () => { clearTimeout(t); timers.delete(t); joining = false; lastHost = Date.now(); wire(conn); res(); });
    conn.once('error', e => { clearTimeout(t); timers.delete(t); joining = false; rej(e); });
  });
  function startHeartbeat() {
    heartbeat = setInterval(() => {
      if (net.isHost || closing || document.hidden) return;
      const c = net.conns.values().next().value;
      if (c?.open) { c.send({ t: '_ping' }); if (Date.now() - lastHost > 20000) c.close(); }
      else scheduleReconnect();
    }, 4000);
  }
  net.host = async (name, onEvent) => {
    net.onEvent = onEvent; net.isHost = true; net.name = safeName(name); closing = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      let code = ''; const bytes = crypto.getRandomValues(new Uint32Array(4)); for (const b of bytes) code += CHARS[b % CHARS.length];
      net.code = code; generation++;
      net.peer = new window.Peer(roomId(code), options());
      // Listen before readiness so the first guest cannot arrive between callbacks.
      net.peer.on('connection', conn => { conn.once('open', () => wire(conn, conn.metadata || {})); });
      try { await ready(); return code; } catch (e) { net.peer.destroy(); if (e.type !== 'unavailable-id' || attempt === 3) throw e; }
    }
  };
  net.join = async (code, name, onEvent, avatar = null) => {
    net.onEvent = onEvent; net.isHost = false; net.name = safeName(name); net.code = code.toUpperCase().trim(); net.avatar = avatar; closing = false; generation++;
    if (!/^[A-Z2-9]{4}$/.test(net.code)) throw new Error('Enter a four-character room code.');
    const tokenKey = `chains.room.${net.code}`; net.token = crypto.randomUUID();
    try { net.token = sessionStorage.getItem(tokenKey) || net.token; sessionStorage.setItem(tokenKey, net.token); } catch {}
    net.peer = new window.Peer(options());
    await ready();
    await connectHost(); startHeartbeat();
  };
  net.send = (id, data) => { const c = net.conns.get(id); if (c && c.open) c.send(data); };
  net.broadcast = (data, except = null) => { for (const [id, c] of net.conns) if (id !== except && c.open) c.send(data); };
  net.toHost = data => { for (const c of net.conns.values()) if (c.open) c.send(data); };
  net.disconnect = id => later(() => net.conns.get(id)?.close(), 250);
  net.close = () => { closing = true; generation++; for (const t of timers) clearTimeout(t); timers.clear(); clearInterval(heartbeat); retry = null; try { net.peer?.destroy(); } catch {} net.conns.clear(); net.peer = null; };
  net.id = () => net.peer?.id;
  return net;
}
