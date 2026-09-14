// Pointer input: drag on the scene = aim (yaw/pitch); swipe in the pad = throw gesture whose
// direction must match the selected throw type. Power = swipe length along the throw axis.
import { THROWS } from './physics.js';

export function setupInput({ sceneEl, padEl, getThrow, onAim, onGesture, onTapScene }) {
  let active = null;         // { id, kind:'aim'|'throw', x0, y0, x, y, lastLat, wobble, moved }
  const st = { enabled: true, aimEnabled: true, throwEnabled: true };
  const rect = () => padEl.getBoundingClientRect();

  const analyze = a => {
    const th = THROWS[getThrow()], r = rect();
    const dx = a.x - a.x0, dy = a.y - a.y0, d = Math.hypot(dx, dy);
    const axis = th.swipe, along = dx * axis[0] + dy * axis[1];
    const latAxis = th.lat, lat = dx * latAxis[0] + dy * latAxis[1];
    const horizontal = Math.abs(axis[0]) > Math.abs(axis[1]) ? r.width : r.height;
    const padLen = (Math.abs(axis[0]) > 0.5 && Math.abs(axis[1]) > 0.5 ? Math.min(r.width, r.height) : horizontal) * 0.8;
    const progress = Math.min(1, Math.max(0, along / padLen));
    const valid = d < 18 ? true : along / d > 0.62;      // within ~52° of the required direction
    return { progress, lateral: lat / padLen, valid, dir: [dx / (d || 1), dy / (d || 1)], dist: d };
  };

  const down = e => {
    if (!st.enabled || active) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const inPad = padEl.contains(e.target);
    if (inPad && !st.throwEnabled) return;
    if (!inPad && !st.aimEnabled) return;
    active = { id: e.pointerId, kind: inPad ? 'throw' : 'aim', x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, lastLat: 0, wobble: 0, moved: 0, t0: performance.now() };
    (inPad ? padEl : sceneEl).setPointerCapture?.(e.pointerId);
    if (inPad) onGesture({ state: 'start', progress: 0, lateral: 0, valid: true });
    e.preventDefault();
  };
  const move = e => {
    if (!active || e.pointerId !== active.id) return;
    const px = active.x, py = active.y; active.x = e.clientX; active.y = e.clientY;
    active.moved += Math.hypot(active.x - px, active.y - py);
    if (active.kind === 'aim') onAim({ dx: active.x - px, dy: active.y - py });
    else { const a = analyze(active); active.wobble += Math.abs(a.lateral - active.lastLat); active.lastLat = a.lateral; onGesture({ state: 'move', ...a, wobble: active.wobble }); }
    e.preventDefault();
  };
  const up = e => {
    if (!active || e.pointerId !== active.id) return;
    const a = active; active = null;
    if (a.kind === 'aim') { if (a.moved < 6 && onTapScene) onTapScene(e); return; }
    const r = analyze(a);
    const dur = (performance.now() - a.t0) / 1000;
    onGesture({ state: r.progress < 0.1 ? 'cancel' : 'end', ...r, wobble: a.wobble, duration: dur });
  };
  for (const el of [sceneEl, padEl]) {
    el.addEventListener('pointerdown', down, { passive: false });
    el.addEventListener('pointermove', move, { passive: false });
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  return st;
}
