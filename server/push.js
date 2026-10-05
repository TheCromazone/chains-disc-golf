// "Your turn" alerts over Web Push (VAPID). Keys come from the deployment's environment; without them pushes are skipped and
// the game still offers the one-tap Messages nudge. Dead subscriptions (404/410) are returned so the caller can drop them.
let configured = null;
async function client() {
  if (configured !== null) return configured;
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: subject } = process.env;
  if (!pub || !priv) return (configured = false);
  const webpush = (await import('web-push')).default;
  webpush.setVapidDetails(subject || 'https://chains-disc-golf.vercel.app', pub, priv);
  return (configured = webpush);
}
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;

export async function notify(player, payload) {
  const webpush = await client(); if (!webpush || !player?.push?.length) return { sent: 0, dead: [] };
  const body = JSON.stringify(payload), dead = []; let sent = 0;
  await Promise.all(player.push.map(async sub => {
    try { await webpush.sendNotification(sub, body, { TTL: 24 * 3600, urgency: 'high', topic: payload.tag?.slice(0, 32) }); sent++; }
    catch (e) { if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(sub.endpoint); else console.warn('push failed', e?.statusCode, String(e?.body || e?.message).slice(0, 120)); }
  }));
  return { sent, dead };
}
