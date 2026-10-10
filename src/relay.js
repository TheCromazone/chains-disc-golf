// Live-room fallback for the pairs WebRTC cannot connect: the same messages through a public MQTT-over-WebSocket broker.
// A phone on cellular (carrier-grade NAT) and a host on Wi-Fi often cannot open a data channel without a TURN server, and this
// deployment has none unless /api/ice is given credentials. So when a guest's PeerJS connection fails, net.js asks the host here.
// Every message is AES-GCM encrypted with a key derived from the room code (PBKDF2), and the topic is a hash of the code: the
// broker sees neither. Ported from SfUltiMobile's src/net/relay.js (huckyeah), which has carried its online matches since 2026-09.
//   <prefix>/h            every relay guest -> the host
//   <prefix>/p/<guestId>  the host -> one guest
// A frame is JSON {k, from, s, n, ...}: 'hello' (the guest's metadata), 'welcome', 'd' (one game message) or 'bye'; s names the
// sending link and n counts its frames, so a QoS 1 redelivery after a reconnect is dropped instead of handled twice.
// Chains' messages are turn-sized (a throw's replay at most), so one reliable stream per pair is all it needs: JSON over QoS 1.
// A locked phone drops its socket. Frames sent meanwhile wait in mqtt.js and go out, in order, on its reconnect; the host's
// sessions are persistent, so the broker also holds what guests send it while the host is away; and a guest whose own socket
// drops ends its room link, so net.js reconnects and the host answers with a snapshot.
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
// persist: the broker keeps this client's subscription and holds QoS 1 frames for it while it is offline (emqx and HiveMQ do;
// the client id stays the same across mqtt.js's own reconnects).
async function connectBroker(mqtt, url, ms, persist = false) {
  return new Promise((res, rej) => {
    const c = mqtt.connect(url, { clientId: `chdg_${hex(crypto.getRandomValues(new Uint8Array(6)))}`, clean: !persist, reconnectPeriod: 2000, connectTimeout: ms, keepalive: 30, resubscribe: true });
    let settled = false;
    const fail = e => { if (settled) return; settled = true; clearTimeout(t); c.end(true); rej(e); };
    const t = setTimeout(() => fail(new Error(`${url}: no answer`)), ms);
    c.once('connect', () => { if (settled) return; settled = true; clearTimeout(t); res(c); });
    c.on('error', fail);   // stays attached: a later error (mqtt.js reconnects by itself) must neither end the client nor go unheard and throw
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
  const clients = [], conns = new Map(), unsent = new Set();   // unsent: frames the broker has not acknowledged yet
  // Publish even while the socket is down: mqtt.js keeps QoS 1 frames and sends them once it reconnects (the old guard dropped them).
  // The callback takes any error, so a publish on a closed client never surfaces as an unheard 'error' event.
  const poster = (client, topic) => {
    const s = hex(crypto.getRandomValues(new Uint8Array(4))); let n = 0, chain = Promise.resolve();
    return obj => {
      const frame = { ...obj, from: selfId, s, n: ++n }; let done; const sent = new Promise(r => done = r); unsent.add(sent); sent.then(() => unsent.delete(sent));
      chain = chain.then(() => seal(key, frame)).then(b => client.publish(topic, b, { qos: 1 }, () => done())).catch(() => done());
    };
  };
  const seen = new Map();   // `${from}/${link}` -> the last frame number handled
  const fresh = m => { if (typeof m.s !== 'string' || !Number.isInteger(m.n)) return true; const k = `${m.from}/${m.s}`; if (m.n <= (seen.get(k) || 0)) return false; seen.set(k, m.n); return true; };
  let rx = Promise.resolve();   // decryption is asynchronous; keep each pair's messages in the order they arrived
  const listen = (client, handle) => client.on('message', (_topic, payload) => {
    rx = rx.then(async () => { const m = await unseal(key, payload); if (m && m.from !== selfId && fresh(m)) handle(client, m); })
      .catch(e => console.error('Relay message failed:', e));   // one failure must not stop every message after it
  });
  if (role === 'host') {
    const ok = (await Promise.allSettled(brokers.slice(0, 2).map(u => connectBroker(mqtt, u, connectTimeoutMs, true)))).filter(r => r.status === 'fulfilled').map(r => r.value);
    if (!ok.length) throw new Error('no relay broker answered');
    for (const c of ok) {
      clients.push(c);
      listen(c, (client, m) => {
        let conn = conns.get(m.from);
        if (m.k === 'hello') {
          if (conn?.open) conn._end();   // a guest saying hello again has reconnected: a fresh connection, as PeerJS would give
          const post = poster(client, peerTopic(m.from));
          conn = relayConn(m.from, m.meta || {}, post); conn.link = m.s; conns.set(m.from, conn);
          post({ k: 'welcome' }); onConn(conn); return;
        }
        if (!conn?.open || m.s !== conn.link) return;   // a straggler from a link this guest has since replaced (its 'bye' must not end the new one)
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
    client.on('close', () => { for (const c of conns.values()) c._end(); });   // the socket dropped: end the room link so net.js reconnects and resyncs
  }
  return {
    // guest: hello the host and wait for its welcome
    connect: (meta, ms = 8000) => new Promise((res, rej) => {
      const client = clients[0], post = poster(client, hostTopic), conn = relayConn(null, {}, post);
      const t = setTimeout(() => rej(new Error('The host did not answer through the relay.')), ms);
      listen(client, (_c, m) => {
        if (m.k === 'welcome') { if (conn.link) return; clearTimeout(t); conn.peer = m.from; conn.link = m.s; conns.set(m.from, conn); res(conn); }   // the host's own id: messages are trusted by it
        else if (!conn.link || m.s !== conn.link) return;   // the host's frames for an earlier link of this guest
        else if (m.k === 'd') conn._data(m.d); else if (m.k === 'bye') conn._end();
      });
      post({ k: 'hello', meta });
    }),
    // A last message (the host's 'closed', a guest's 'bye') was still being encrypted when the page left the room, and end() at
    // once dropped it: the other side only noticed a minute later. Queued frames get up to 1.5 s to reach the broker.
    close: async () => {
      for (const c of conns.values()) c.close(); conns.clear();
      const ending = clients.splice(0);
      if (unsent.size) await Promise.race([Promise.all([...unsent]), new Promise(r => setTimeout(r, 1500))]);
      for (const c of ending) try { c.end(); } catch { /* already closed */ }
    },
  };
}
