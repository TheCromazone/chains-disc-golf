// ICE servers for the live room's WebRTC. A phone on a carrier network often can't reach a peer on Wi-Fi directly and needs a
// relay (TURN). Credentials stay on the server: Cloudflare Realtime TURN keys (short-lived credentials minted per request) or a
// static TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL set. With neither, the client keeps PeerJS's STUN-only defaults.
const STUN = { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] };
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function GET() {
  const { CLOUDFLARE_TURN_KEY_ID: keyId, CLOUDFLARE_TURN_KEY_API_TOKEN: keyToken, TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL } = process.env;
  if (keyId && keyToken) {
    try {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
        method: 'POST', headers: { authorization: `Bearer ${keyToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ ttl: 6 * 3600 }) });
      if (r.ok) { const j = await r.json(); const list = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : []; if (list.length) return json({ iceServers: [STUN, ...list], relay: true }); }
    } catch (e) { console.warn('turn credentials failed', String(e?.message || e).slice(0, 120)); }
  }
  if (TURN_URLS && TURN_USERNAME && TURN_CREDENTIAL) return json({ iceServers: [STUN, { urls: TURN_URLS.split(',').map(s => s.trim()).filter(Boolean), username: TURN_USERNAME, credential: TURN_CREDENTIAL }], relay: true });
  return json({ iceServers: [], relay: false });
}
