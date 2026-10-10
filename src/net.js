import { PROTOCOL_VERSION, safeName } from './protocol.js';
import { openRelay, BROKERS } from './relay.js';
import { keepAwake } from './wake.js';
const SERIALIZATION = 'binary';   // PeerJS chunks binary messages; its JSON mode refuses anything over ~16 KB (a long throw's replay)
// One reliable connection per guest. Host owns scores and sends the authoritative replay.
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomId = code => `chains-dg-${code}`;
let brokerTurn = 0;   // which of the host's two brokers a relay guest says hello on first; moves on after a hello nobody answered

export function createNet() {
  const net = { peer: null, conns: new Map(), isHost: false, code: null, name: '', onEvent: () => {}, locked: false, myId: null };
  let generation = 0, closing = false, retry = null, heartbeat = null, lastHost = Date.now(), joining = false, lostSince = 0, relayTries = 0;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const options = () => ({ debug: 0, ...(net.ice ? { config: { iceServers: net.ice } } : {}), ...(globalThis.CHAINS_PEER_CONFIG || {}) });
  // Relay (TURN) servers from /api/ice when the deployment has credentials: phones on cellular can't always reach a peer on Wi-Fi directly.
  const loadIce = async () => { if (net.ice !== undefined) return; net.ice = null; try { const r = await fetch('api/ice', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); if (Array.isArray(j.iceServers) && j.iceServers.length) net.ice = j.iceServers; } } catch { /* static host or offline: PeerJS defaults */ } };
  const ready = () => new Promise((res, rej) => {
    if (!window.Peer) return rej(new Error('PeerJS failed to load'));
    const peer = net.peer, gen = generation;
    const timer = later(() => rej(new Error('The room service did not respond. Check your connection and try again.')), 12000);
    peer.on('open', id => { if (gen !== generation) return; net.myId = id; clearTimeout(timer); timers.delete(timer); res(id); });   // also after a signalling reconnect: the id survives the gap
    peer.on('error', e => { if (gen !== generation || closing) return; clearTimeout(timer); timers.delete(timer); rej(e); net.onEvent({ type: 'error', err: e }); });
    peer.on('disconnected', () => { if (gen !== generation || closing) return; later(() => { if (peer.disconnected && !peer.destroyed) peer.reconnect(); }, 1000); });
  });
  const GUEST_SILENT_MS = 25000;   // a guest pings every 4 s; this long without a word and the host lets them go
  // Forget a connection and report the leave now. A guest whose tab was closed or frozen (Safari, a locked phone) can leave
  // its data channel looking open for minutes, and the round sat waiting on that player's turn.
  const drop = conn => {
    if (net.conns.get(conn.peer) !== conn) return;
    net.conns.delete(conn.peer); net.onEvent({ type: 'leave', id: conn.peer });
    try { conn.close(); } catch { /* already gone */ }
  };
  const wire = (conn, meta) => {
    const old = net.conns.get(conn.peer); net.conns.set(conn.peer, conn); old?.close();
    const gen = generation; conn.lastSeen = Date.now();
    conn.on('data', d => {
      if (gen !== generation || closing || !d || typeof d !== 'object') return;
      conn.lastSeen = Date.now();
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
    if (!lostSince) lostSince = Date.now();
    if (Date.now() - lostSince > 45000) { net.onEvent({ type: 'lost' }); return; }   // the host is gone for good: stop retrying and say so
    retry = later(async () => {   // retry stays set until this attempt settles, so the heartbeat never starts a second one alongside
      if (closing || net.peer?.destroyed) { retry = null; return; }
      try { await connectHost(); retry = null; lostSince = 0; net.onEvent({ type: 'reconnected' }); } catch { retry = null; scheduleReconnect(); }
    }, 1500);
  }
  // A guest reaches the host directly when it can, and through the encrypted MQTT relay (relay.js) when it cannot: cellular
  // carrier NAT and strict Wi-Fi often block a data channel when there is no TURN server. A missing room is not retried there.
  // A reconnect starts where it last worked. A relay guest retries the relay alone, with a shorter wait for the host's answer, so it
  // gets five or six tries before the 45 s give-up instead of two (the direct attempt costs 10 s and could not open before);
  // every third try still checks the direct path too.
  const connectHost = async () => {
    if (net.via === 'relay') { try { await connectRelay(5000); return; } catch (e) { if (++relayTries % 3) throw e; } }
    try { await connectDirect(); }
    catch (e) { if (e.noRoom) throw e; try { await connectRelay(); } catch { throw e; } }   // the relay could not help either: say why direct failed
  };
  // The host listens on the first two brokers that answer it, a guest on the first that answers it: on a network that blocks
  // one of them the two never met and the join failed. A hello nobody answered is said again on the other broker.
  const connectRelay = async (ms = 8000) => {
    net.onStatus?.('relay');   // the join screen says so: this leg is what makes a cellular join take ~10 s
    let err;
    for (let k = 0; k < 2; k++) {
      net.relay?.close(); net.relay = null;
      const first = BROKERS[brokerTurn % 2], gen = generation;
      try {
        const relay = await openRelay({ code: net.code, role: 'guest', selfId: net.relayId, brokers: [first, ...BROKERS.filter(u => u !== first)] });
        if (gen !== generation || closing) { relay.close(); throw Object.assign(new Error('Left the room.'), { left: true }); }
        net.relay = relay;
        const conn = await relay.connect({ name: net.name, avatar: net.avatar, token: net.token, version: PROTOCOL_VERSION }, ms);
        lastHost = Date.now(); net.via = 'relay'; wire(conn); return;
      } catch (e) { if (e.left) throw e; err = e; brokerTurn++; }
    }
    throw err;
  };
  const connectDirect = () => new Promise((res, rej) => {
    const peer = net.peer;
    const conn = peer && !peer.disconnected ? peer.connect(roomId(net.code), { reliable: true, serialization: SERIALIZATION, metadata: { name: net.name, avatar: net.avatar, token: net.token, version: PROTOCOL_VERSION } }) : null;
    if (!conn) return rej(new Error('Still reaching the room service. Try again in a moment.'));   // connect() returns nothing while signalling is down
    joining = true;
    let settled = false;
    const done = (err) => { if (settled) return; settled = true; clearTimeout(t); timers.delete(t); peer.off('error', onPeerError); joining = false; if (err) { try { conn.close(); } catch {} rej(err); } else { lastHost = Date.now(); net.via = 'direct'; wire(conn); res(); } };
    const onPeerError = e => { if (e?.type === 'peer-unavailable') done(Object.assign(new Error('No room with that code. Check it, or ask the host to make a new room.'), { noRoom: true })); };
    peer.on('error', onPeerError);
    const t = later(() => done(new Error("Couldn't reach the host. Check the code and your connection, or start an invite match.")), 10000);
    conn.once('open', () => done());
    conn.once('error', e => done(e));
  });
  function startHeartbeat() {   // guest: keep pinging while hidden too, so a quick app switch doesn't trip the host's watch
    heartbeat = setInterval(() => {
      if (net.isHost || closing) return;
      const c = net.conns.values().next().value;
      if (c?.open) { c.send({ t: '_ping' }); if (!document.hidden && Date.now() - lastHost > 20000) c.close(); }
      else if (!document.hidden) scheduleReconnect();
    }, 4000);
  }
  function startHostWatch() {
    clearInterval(heartbeat);
    heartbeat = setInterval(() => {
      if (!net.isHost || closing) return;
      const now = Date.now();
      for (const c of [...net.conns.values()]) if (now - (c.lastSeen || now) > GUEST_SILENT_MS) drop(c);
    }, 5000);
  }
  net.host = async (name, onEvent) => {
    net.onEvent = onEvent; net.isHost = true; net.name = safeName(name); closing = false; await loadIce();
    for (let attempt = 0; attempt < 4; attempt++) {
      let code = ''; const bytes = crypto.getRandomValues(new Uint32Array(4)); for (const b of bytes) code += CHARS[b % CHARS.length];
      net.code = code; generation++;
      net.peer = new window.Peer(roomId(code), options());
      // Listen before readiness so the first guest cannot arrive between callbacks.
      net.peer.on('connection', conn => { conn.once('open', () => wire(conn, conn.metadata || {})); });
      try {
        await ready(); startHostWatch();
        // the relay side of the room, for guests whose data channel cannot open; the room plays without it if no broker answers
        // no broker answering now (a blip, a blocked port) used to leave the room without a relay for good: keep asking
        const gen = generation, listen = (tries = 0) => openRelay({ code, role: 'host', selfId: roomId(code), onConn: conn => { if (gen === generation && !closing) wire(conn, conn.metadata || {}); } })
          .then(r => { if (gen === generation && !closing) net.relay = r; else r.close(); }, () => { if (gen === generation && !closing && tries < 40) later(() => listen(tries + 1), 15000); });
        listen();
        keepAwake(true);
        return code;
      } catch (e) { net.peer.destroy(); if (e.type !== 'unavailable-id' || attempt === 3) throw e; }
    }
  };
  net.join = async (code, name, onEvent, avatar = null) => {
    net.onEvent = onEvent; net.isHost = false; net.name = safeName(name); net.code = code.toUpperCase().trim(); net.avatar = avatar; closing = false; generation++;
    if (!/^[A-Z2-9]{4}$/.test(net.code)) throw new Error('Enter a four-character room code.');
    const tokenKey = `chains.room.${net.code}`; net.token = crypto.randomUUID();
    try { net.token = sessionStorage.getItem(tokenKey) || net.token; sessionStorage.setItem(tokenKey, net.token); } catch {}
    net.relayId ||= `r-${crypto.randomUUID()}`;
    await loadIce(); net.peer = new window.Peer(options());
    let direct = true; try { await ready(); } catch { direct = false; }   // the room service is unreachable from here: the relay may not be
    await (direct ? connectHost() : connectRelay()); startHeartbeat(); keepAwake(true);
  };
  net.send = (id, data) => { const c = net.conns.get(id); if (c && c.open) c.send(data); };
  net.broadcast = (data, except = null) => { for (const [id, c] of net.conns) if (id !== except && c.open) c.send(data); };
  net.toHost = data => { for (const c of net.conns.values()) if (c.open) c.send(data); };
  net.disconnect = id => later(() => net.conns.get(id)?.close(), 250);
  net.close = () => { closing = true; generation++; keepAwake(false); for (const t of timers) clearTimeout(t); timers.clear(); clearInterval(heartbeat); retry = null; try { net.peer?.destroy(); } catch {} try { net.relay?.close(); } catch {} net.relay = null; net.conns.clear(); net.peer = null; };
  // the cached id: during a signalling reconnect peer.id reads null and every turn looked like someone else's. Through the relay
  // the host knows this guest by its relay id, so that is who it is.
  net.id = () => (!net.isHost && net.via === 'relay' ? net.relayId : net.peer?.id || net.myId);
  return net;
}
