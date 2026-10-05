import { THROWS } from './physics.js';

// Snapshot the dimensions and axis. Browser cancellation must never fire a disc.
export function setupInput({ sceneEl, padEl, getThrow, onAim, onGesture, onTapScene,
  canAim = () => true, canThrow = () => true, onTrace = () => {}, onShortcut = () => {} }) {
  let active = null, charge = null;
  const keys = new Set(), removers = [];
  const st = { enabled: true, aimEnabled: true, throwEnabled: true };
  const listen = (el, type, fn, options) => { el.addEventListener(type, fn, options); removers.push(() => el.removeEventListener(type, fn, options)); };
  const aimOK = () => st.enabled && st.aimEnabled && canAim();
  const throwOK = () => st.enabled && st.throwEnabled && canThrow();
  const analyze = a => {
    const dx = a.x - a.x0, dy = a.y - a.y0, d = Math.hypot(dx, dy);
    const along = dx * a.th.swipe[0] + dy * a.th.swipe[1];
    return { progress: Math.max(0, Math.min(1, along / a.length)), lateral: (dx * a.th.lat[0] + dy * a.th.lat[1]) / a.length,
      valid: d < 18 || along / d > .62, dist: d, dir: [dx / (d || 1), dy / (d || 1)] };
  };
  function cancel() {
    const a = active; active = null;
    if (a?.kind === 'throw' || charge) onGesture({ state: 'cancel', progress: 0, lateral: 0, valid: true });
    charge = null; keys.clear(); onTrace(null);
    if (a) { try { a.el.releasePointerCapture?.(a.id); } catch {} }
  }
  function down(e) {
    if (active || charge || e.isPrimary === false || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const inPad = padEl.contains(e.target);
    if (inPad ? !throwOK() : !aimOK()) return;
    const r = padEl.getBoundingClientRect(), th = THROWS[getThrow()];
    const span = Math.abs(th.swipe[0]) > .5 && Math.abs(th.swipe[1]) > .5 ? Math.min(r.width, r.height)
      : Math.abs(th.swipe[0]) > Math.abs(th.swipe[1]) ? r.width : r.height;
    const length = Math.max(48, Math.min(span * .7, e.pointerType === 'touch' ? 240 : 360));
    active = { id: e.pointerId, kind: inPad ? 'throw' : 'aim', el: inPad ? padEl : sceneEl,
      x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, lastLat: 0, wobble: 0, moved: 0,
      t0: performance.now(), th, length, r, trace: [[e.clientX - r.left, e.clientY - r.top]] };
    try { active.el.setPointerCapture?.(e.pointerId); } catch {}
    if (inPad) { onGesture({ state: 'start', progress: 0, lateral: 0, valid: true }); onTrace({ points: active.trace, valid: true }); }
    e.preventDefault();
  }
  function sample(e, emit = true) {
    const a = active; if (!a || e.pointerId !== a.id) return;
    const dx = e.clientX - a.x, dy = e.clientY - a.y;
    a.x = e.clientX; a.y = e.clientY; a.moved += Math.hypot(dx, dy);
    if (a.kind === 'aim') { if (aimOK()) onAim({ dx, dy }); }
    else {
      const g = analyze(a);
      if (Math.hypot(dx, dy) > 2) { a.wobble += Math.abs(g.lateral - a.lastLat); a.lastLat = g.lateral; }
      a.trace.push([a.x - a.r.left, a.y - a.r.top]); if (a.trace.length > 32) a.trace.splice(1, 1);
      if (emit) { onGesture({ state: 'move', ...g, wobble: a.wobble }); onTrace({ points: a.trace, valid: g.valid }); }
    }
  }
  function move(e) {
    if (!active || e.pointerId !== active.id) return;
    for (const s of e.getCoalescedEvents?.() || []) sample(s, false);
    sample(e); e.preventDefault();
  }
  function up(e) {
    if (!active || e.pointerId !== active.id) return;
    sample(e, false); const a = active, g = analyze(a); active = null;
    try { a.el.releasePointerCapture?.(a.id); } catch {}
    onTrace(null);
    if (a.kind === 'aim') { if (a.moved < 6) onTapScene?.(e); return; }
    onGesture({ state: g.progress < .1 || !throwOK() ? 'cancel' : 'end', ...g, wobble: a.wobble, duration: (performance.now() - a.t0) / 1000 });
  }
  const editing = e => e.target?.closest?.('input,textarea,select,button,[contenteditable="true"],dialog[open]');
  function keydown(e) {
    if (e.key === 'Escape' && (active || charge)) { e.preventDefault(); cancel(); return; }
    if (editing(e) || e.ctrlKey || e.metaKey || e.altKey || !aimOK()) return;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD'].includes(e.code)) { keys.add(e.code); e.preventDefault(); }
    if (e.code === 'Space' && throwOK()) {
      e.preventDefault(); if (e.repeat || charge || active) return;
      charge = { power: .1 }; onGesture({ state: 'start', progress: 0, lateral: 0, valid: true });
    } else if (!e.repeat && ['Digit1','Digit2','Digit3','Digit4','KeyQ','KeyE','KeyT','KeyO','KeyM'].includes(e.code)) {
      e.preventDefault(); onShortcut(e.code);
    }
  }
  function keyup(e) {
    keys.delete(e.code);
    if (e.code === 'Space' && charge) {
      const power = charge.power; charge = null; e.preventDefault();
      onGesture({ state: throwOK() ? 'end' : 'cancel', progress: power, lateral: 0, valid: true, wobble: 0, duration: power });
    }
  }
  for (const el of [sceneEl, padEl]) {
    listen(el, 'pointerdown', down, { passive: false }); listen(el, 'pointermove', move, { passive: false });
    listen(el, 'pointerup', up); listen(el, 'pointercancel', e => { if (active?.id === e.pointerId) cancel(); }); listen(el, 'lostpointercapture', e => { if (active?.el === el && active.id === e.pointerId) cancel(); });
    listen(el, 'contextmenu', e => e.preventDefault());
  }
  listen(window, 'keydown', keydown); listen(window, 'keyup', keyup); listen(window, 'blur', cancel); listen(window, 'resize', cancel);
  listen(document, 'visibilitychange', () => { if (document.hidden) cancel(); });
  return Object.assign(st, { cancel, update(dt) {
    if (charge) { if (!throwOK()) return cancel(); charge.power = Math.min(1, charge.power + dt * .8); onGesture({ state: 'move', progress: charge.power, lateral: 0, valid: true, wobble: 0 }); }
    if (keys.size && aimOK()) {
      const x = Number(keys.has('ArrowRight') || keys.has('KeyD')) - Number(keys.has('ArrowLeft') || keys.has('KeyA'));
      const y = Number(keys.has('ArrowDown') || keys.has('KeyS')) - Number(keys.has('ArrowUp') || keys.has('KeyW'));
      if (x || y) onAim({ dx: x * dt * 180, dy: y * dt * 90 });
    }
  }, dispose() { cancel(); removers.forEach(fn => fn()); } });
}
