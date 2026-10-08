// Live-room fallback for the pairs WebRTC cannot connect: the same messages through a public MQTT-over-WebSocket broker.
// A phone on cellular (carrier-grade NAT) and a host on Wi-Fi often cannot open a data channel without a TURN server, and this
// deployment has none unless /api/ice is given credentials. So when a guest's PeerJS connection fails, net.js asks the host here.
// Every message is AES-GCM encrypted with a key derived from the room code (PBKDF2), and the topic is a hash of the code: the
// broker sees neither. Ported from SfUltiMobile's src/net/relay.js (huckyeah), which has carried its online matches since 2026-09.
//   <prefix>/h            every relay guest -> the host
//   <prefix>/p/<guestId>  the host -> one guest
// A frame is JSON {k, from, ...}: 'hello' (the guest's metadata), 'welcome', 'd' (one game message) or 'bye'.
// Chains' messages are turn-sized (a throw's replay at most), so one reliable stream per pair is all it needs: JSON over QoS 1.
export const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const SALT = 'chains/relay/v1', enc = new TextEncoder(), dec = new TextDecoder();
const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');

async function secrets(code) {
  const subtle = crypto.subtle, base = await subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode(SALT), iterations: 20000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { key, prefix: `chdg/${hex(await subtle.digest('SHA-256', enc.encode(`${SALT}/topic/${code}`))).slice(0, 32)}` };
}
async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out;
}
async function unseal(key, bytes) {   // null for anything that is not ours
  try { const u = new Uint8Array(bytes); if (u.length < 29) return null; return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.subarray(0, 12) }, key, u.subarray(12)))); }
  catch { return null; }
}
async function connectBroker(mqtt, url, ms) {
  return new Promise((res, rej) => {
    const c = mqtt.connect(url, { clientId: `chdg_${hex(crypto.getRandomValues(new Uint8Array(6)))}`, clean: true, reconnectPeriod: 2000, connectTimeout: ms, keepalive: 30, resubscribe: true });
    const t = setTimeout(() => { c.end(true); rej(new Error(`${url}: no answer`)); }, ms);
    c.once('connect', () => { clearTimeout(t); res(c); });
    c.once('error', e => { clearTimeout(t); c.end(true); rej(e); });
  });
}

// A connection shaped like a PeerJS DataConnection (peer, open, metadata, send, close, on/once/off), so net.js wires both alike.
function relayConn(peer, metadata, post) {
  const hs = {}, conn = { peer, metadata, open: true, kind: 'relay', lastSeen: Date.now() };
  const fire = (e, ...a) => { for (const f of [...(hs[e] || [])]) f(...a); };
  conn.on = (e, f) => { (hs[e] ||= []).push(f); return conn; };
  conn.off = (e, f) => { hs[e] = (hs[e] || []).filter(g => g !== f && g.orig !== f); return conn; };
  conn.once = (e, f) => { const g = (...a) => { conn.off(e, g); f(...a); }; g.orig = f; return conn.on(e, g); };
  conn.send = d => { if (conn.open) post({ k: 'd', d }); };
  conn.close = () => { if (!conn.open) return; post({ k: 'bye' }); conn._end(); };
  conn._data = d => { if (conn.open) fire('data', d); };
  conn._end = () => { if (!conn.open) return; conn.open = false; fire('close'); };
  return conn;
}

// host: subscribes on up to two brokers and hands every new relay guest to onConn, already open. guest: connect() resolves with
// a connection once the host says welcome. A broker never reports a peer leaving: net.js's heartbeat and silence watch do that.
export async function openRelay({ code, role, selfId, onConn = () => {}, brokers = BROKERS, connectTimeoutMs = 6000 }) {
  const [mod, { key, prefix }] = await Promise.all([import('mqtt'), secrets(code)]);
  const mqtt = mod?.connect ? mod : mod?.default ?? mod, hostTopic = `${prefix}/h`, peerTopic = id => `${prefix}/p/${id}`;
  const clients = [], conns = new Map();
  const poster = (client, topic) => { let chain = Promise.resolve(); return obj => { chain = chain.then(() => seal(key, { ...obj, from: selfId })).then(b => { if (client.connected) client.publish(topic, b, { qos: 1 }); }).catch(() => {}); }; };
  let rx = Promise.resolve();   // decryption is asynchronous; keep each pair's messages in the order they arrived
  const listen = (client, handle) => client.on('message', (_topic, payload) => { rx = rx.then(async () => { const m = await unseal(key, payload); if (m && m.from !== selfId) handle(client, m); }); });
  if (role === 'host') {
    const ok = (await Promise.allSettled(brokers.slice(0, 2).map(u => connectBroker(mqtt, u, connectTimeoutMs)))).filter(r => r.status === 'fulfilled').map(r => r.value);
    if (!ok.length) throw new Error('no relay broker answered');
    for (const c of ok) {
      clients.push(c);
      listen(c, (client, m) => {
        let conn = conns.get(m.from);
        if (m.k === 'hello') {
          if (conn?.open) conn._end();   // a guest saying hello again has reconnected: a fresh connection, as PeerJS would give
          const post = poster(client, peerTopic(m.from));
          conn = relayConn(m.from, m.meta || {}, post); conns.set(m.from, conn);
          post({ k: 'welcome' }); onConn(conn); return;
        }
        if (!conn?.open) return;
        if (m.k === 'd') conn._data(m.d); else if (m.k === 'bye') { conns.delete(m.from); conn._end(); }
      });
      await c.subscribeAsync(hostTopic, { qos: 1 });
    }
  } else {
    let client = null, last = null;
    for (const u of brokers) { try { client = await connectBroker(mqtt, u, connectTimeoutMs); break; } catch (e) { last = e; } }
    if (!client) throw new Error(`no relay broker answered (${last?.message ?? last})`);
    clients.push(client);
    await client.subscribeAsync(peerTopic(selfId), { qos: 1 });
  }
  return {
    // guest: hello the host and wait for its welcome
    connect: (meta, ms = 8000) => new Promise((res, rej) => {
      const client = clients[0], post = poster(client, hostTopic), conn = relayConn(null, {}, post);
      const t = setTimeout(() => rej(new Error('The host did not answer through the relay.')), ms);
      listen(client, (_c, m) => {
        if (m.k === 'welcome') { clearTimeout(t); conn.peer = m.from; conns.set(m.from, conn); res(conn); }   // the host's own id: messages are trusted by it
        else if (m.k === 'd') conn._data(m.d); else if (m.k === 'bye') conn._end();
      });
      post({ k: 'hello', meta });
    }),
    close: () => { for (const c of conns.values()) c.close(); conns.clear(); for (const c of clients) try { c.end(); } catch { /* already closed */ } clients.length = 0; },
  };
}
