// Online rooms over PeerJS (public signalling server). Host owns the lobby and relays messages;
// the game itself is turn-based so peers only exchange throw params + trajectories.
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomId = code => `chains-dg-${code}`;

export function createNet() {
  const net = { peer: null, conns: new Map(), isHost: false, code: null, name: '', onEvent: () => {} };
  const ready = () => new Promise((res, rej) => {
    if (!window.Peer) return rej(new Error('PeerJS failed to load'));
    net.peer.on('open', id => res(id)); net.peer.on('error', e => rej(e));
  });
  const wire = (conn, meta) => {
    net.conns.set(conn.peer, conn);
    conn.on('data', d => net.onEvent({ type: 'msg', from: conn.peer, data: d }));
    conn.on('close', () => { net.conns.delete(conn.peer); net.onEvent({ type: 'leave', id: conn.peer }); });
    conn.on('error', e => net.onEvent({ type: 'error', err: e }));
    if (meta) net.onEvent({ type: 'join', id: conn.peer, name: meta.name, avatar: meta.avatar });
  };
  net.host = async (name, onEvent) => {
    net.onEvent = onEvent; net.isHost = true; net.name = name;
    let code = ''; for (let i = 0; i < 4; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
    net.code = code;
    net.peer = new window.Peer(roomId(code), { debug: 1 });
    await ready();
    net.peer.on('connection', conn => { conn.on('open', () => wire(conn, conn.metadata)); });
    return code;
  };
  net.join = async (code, name, onEvent, avatar = null) => {
    net.onEvent = onEvent; net.isHost = false; net.name = name; net.code = code.toUpperCase().trim();
    net.peer = new window.Peer({ debug: 1 });
    await ready();
    return new Promise((res, rej) => {
      const conn = net.peer.connect(roomId(net.code), { reliable: true, metadata: { name, avatar } });
      const t = setTimeout(() => rej(new Error('No room found with that code')), 9000);
      conn.on('open', () => { clearTimeout(t); wire(conn, null); res(); });
      conn.on('error', e => { clearTimeout(t); rej(e); });
      net.peer.on('error', e => { clearTimeout(t); rej(e); });
    });
  };
  net.send = (id, data) => { const c = net.conns.get(id); if (c && c.open) c.send(data); };
  net.broadcast = (data, except = null) => { for (const [id, c] of net.conns) if (id !== except && c.open) c.send(data); };
  net.toHost = data => { for (const c of net.conns.values()) if (c.open) c.send(data); };
  net.close = () => { try { net.peer?.destroy(); } catch {} net.conns.clear(); net.peer = null; };
  net.id = () => net.peer?.id;
  return net;
}
