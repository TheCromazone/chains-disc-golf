// Keeps the screen on while a live room is open. A phone that auto-locks suspends the page: a host stops answering its guests and
// a guest misses its turns. The browser drops the lock whenever the page is hidden, so it is asked for again on the way back.
// Unsupported or refused (older Safari, Low Power Mode, a Home Screen app before iOS 18.4) changes nothing.
let wanted = false, sentinel = null, asking = false;

async function ask() {
  if (!wanted || sentinel || asking || document.hidden || !navigator.wakeLock?.request) return;
  asking = true;
  try {
    const s = await navigator.wakeLock.request('screen');
    if (!wanted) { drop(s); return; }
    sentinel = s;
    s.addEventListener?.('release', () => { if (sentinel === s) sentinel = null; });
  } catch { /* refused or unsupported: the room plays on without it */ }
  finally { asking = false; }
}
function drop(s) { try { s?.release?.()?.catch?.(() => {}); } catch { /* already released */ } }

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) ask(); });

export function keepAwake(on) {
  wanted = !!on;
  if (wanted) { ask(); return; }
  const s = sentinel; sentinel = null; drop(s);
}
