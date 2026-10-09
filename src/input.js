import { THROWS } from './physics.js';

// Two hands: one finger can aim (drag the view) while another swipes the throw, in either order. A finger that lands in
// the throw pad starts the swipe; any other finger (on the view, or a second finger in the pad mid-swipe) aims.
// Snapshot the dimensions and axis. Browser cancellation must never fire a disc.
export function setupInput({ sceneEl, padEl, getThrow, onAim, onGesture, onTapScene,
  canAim = () => true, canThrow = () => true, onTrace = () => {}, onShortcut = () => {} }) {
  let swipe = null, aim = null, charge = null;
  const keys = new Set(), removers = [];
  const st = { enabled: true, aimEnabled: true, throwEnabled: true };
  const listen = (el, type, fn, options) => { el.addEventListener(type, fn, options); removers.push(() => el.removeEventListener(type, fn, options)); };
  const aimOK = () => st.enabled && st.aimEnabled && canAim();
  const throwOK = () => st.enabled && st.throwEnabled && canThrow();
  const analyze = a => {
    const dx = a.x - a.x0, dy = a.y - a.y0, d = Math.hypot(dx, dy);
    const along = dx * a.th.swipe[0] + dy * a.th.swipe[1];
    return { progress: Math.max(0, Math.min(1, along / a.length)), lateral: (dx * a.th.lat[0] + dy * a.th.lat[1]) / a.base,   // hyzer reads against the full stroke, not the shortened one near an edge
      valid: d < 18 || along / d > .62, dist: d, dir: [dx / (d || 1), dy / (d || 1)] };
  };
  // Full power is one comfortable thumb stroke, and always reachable from wherever the stroke starts: the length shrinks to
  // the room left between the start and the screen edge in the swipe direction (a backhand begun mid-screen on a phone used
  // to run out of glass at ~80%). Touch strokes are shorter than mouse ones.
  function swipeLength(e, th, r) {
    const touch = e.pointerType !== 'mouse';
    const diag = Math.abs(th.swipe[0]) > .5 && Math.abs(th.swipe[1]) > .5;
    const span = diag ? Math.min(r.width, r.height) : Math.abs(th.swipe[0]) > Math.abs(th.swipe[1]) ? r.width : r.height;
    const base = touch ? Math.max(96, Math.min(span * .42, 190)) : Math.max(120, Math.min(span * .6, 320));
    const edge = 6, room = Math.min(...[[th.swipe[0], e.clientX, innerWidth], [th.swipe[1], e.clientY, innerHeight]]
      .filter(([s]) => Math.abs(s) > .05).map(([s, p, max]) => (s > 0 ? max - edge - p : p - edge) / Math.abs(s)));
    return [Math.max(40, Math.min(base, room * .94)), base];
  }
  function release(a) { if (a) { try { a.el.releasePointerCapture?.(a.id); } catch {} } }
  function cancelSwipe() {
    const a = swipe; swipe = null;
    if (a || charge) onGesture({ state: 'cancel', progress: 0, lateral: 0, valid: true });
    charge = null; onTrace(null); release(a);
  }
  function cancelAim() { const a = aim; aim = null; release(a); }
  function cancel() { cancelSwipe(); cancelAim(); keys.clear(); }
  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (swipe?.id === e.pointerId || aim?.id === e.pointerId) return;
    const inPad = padEl.contains(e.target);
    if (inPad && !swipe && !charge && throwOK()) {
      const r = padEl.getBoundingClientRect(), th = THROWS[getThrow()], [length, base] = swipeLength(e, th, r);
      swipe = { id: e.pointerId, el: padEl, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, lastLat: 0, wobble: 0,
        t0: performance.now(), th, length, base, r, trace: [[e.clientX - r.left, e.clientY - r.top]] };
      try { padEl.setPointerCapture?.(e.pointerId); } catch {}
      onGesture({ state: 'start', progress: 0, lateral: 0, valid: true }); onTrace({ points: swipe.trace, valid: true });
    } else if (!aim && aimOK() && (!inPad || swipe || charge)) {
      const el = inPad ? padEl : sceneEl;
      aim = { id: e.pointerId, el, x: e.clientX, y: e.clientY, moved: 0, t: e.timeStamp, touch: e.pointerType !== 'mouse' };
      try { el.setPointerCapture?.(e.pointerId); } catch {}
    } else return;
    e.preventDefault();
  }
  function sample(e, emit = true) {
    if (aim && e.pointerId === aim.id) {
      const dx = e.clientX - aim.x, dy = e.clientY - aim.y, dt = Math.max(1, e.timeStamp - aim.t);
      aim.x = e.clientX; aim.y = e.clientY; aim.t = e.timeStamp; aim.moved += Math.hypot(dx, dy);
      if ((dx || dy) && aimOK()) onAim({ dx, dy, speed: Math.hypot(dx, dy) / dt, touch: aim.touch });
      return;
    }
    const a = swipe; if (!a || e.pointerId !== a.id) return;
    const dx = e.clientX - a.x, dy = e.clientY - a.y;
    a.x = e.clientX; a.y = e.clientY;
    const g = analyze(a);
    if (Math.hypot(dx, dy) > 2) { a.wobble += Math.abs(g.lateral - a.lastLat); a.lastLat = g.lateral; }
    a.trace.push([a.x - a.r.left, a.y - a.r.top]); if (a.trace.length > 32) a.trace.splice(1, 1);
    if (emit) { onGesture({ state: 'move', ...g, wobble: a.wobble }); onTrace({ points: a.trace, valid: g.valid }); }
  }
  function move(e) {
    if (swipe?.id !== e.pointerId && aim?.id !== e.pointerId) return;
    if (swipe?.id === e.pointerId) for (const s of e.getCoalescedEvents?.() || []) sample(s, false);
    sample(e); e.preventDefault();
  }
  function up(e) {
    if (aim?.id === e.pointerId) { sample(e); const a = aim; aim = null; release(a); if (a.moved < 6) onTapScene?.(e); return; }
    if (swipe?.id !== e.pointerId) return;
    sample(e, false); const a = swipe, g = analyze(a); swipe = null;
    release(a); onTrace(null);
    onGesture({ state: g.progress < .1 || !throwOK() ? 'cancel' : 'end', ...g, wobble: a.wobble, duration: (performance.now() - a.t0) / 1000 });
  }
  function lost(e) { if (swipe?.id === e.pointerId) cancelSwipe(); else if (aim?.id === e.pointerId) cancelAim(); }
  const editing = e => e.target?.closest?.('input,textarea,select,button,[contenteditable="true"],dialog[open]');
  function keydown(e) {
    if (e.key === 'Escape' && (swipe || charge)) { e.preventDefault(); cancelSwipe(); return; }
    if (editing(e) || e.ctrlKey || e.metaKey || e.altKey || !aimOK()) return;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD'].includes(e.code)) { keys.add(e.code); e.preventDefault(); }
    if (e.code === 'Space' && throwOK()) {
      e.preventDefault(); if (e.repeat || charge || swipe) return;
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
    listen(el, 'pointerup', up); listen(el, 'pointercancel', lost); listen(el, 'lostpointercapture', lost);
    listen(el, 'contextmenu', e => e.preventDefault());
  }
  // A real rotation ends a gesture; the browser bars sliding in and out (a few dozen px) do not.
  let size = [innerWidth, innerHeight];
  const resized = () => { const [w, h] = size; size = [innerWidth, innerHeight]; if ((w > h) !== (innerWidth > innerHeight) || Math.abs(w - innerWidth) > 120) cancel(); };
  listen(window, 'keydown', keydown); listen(window, 'keyup', keyup); listen(window, 'blur', cancel); listen(window, 'resize', resized);
  listen(document, 'visibilitychange', () => { if (document.hidden) cancel(); });
  return Object.assign(st, { cancel, update(dt) {
    if (charge) { if (!throwOK()) return cancelSwipe(); charge.power = Math.min(1, charge.power + dt * .8); onGesture({ state: 'move', progress: charge.power, lateral: 0, valid: true, wobble: 0 }); }
    if (keys.size && aimOK()) {
      const x = Number(keys.has('ArrowRight') || keys.has('KeyD')) - Number(keys.has('ArrowLeft') || keys.has('KeyA'));
      const y = Number(keys.has('ArrowDown') || keys.has('KeyS')) - Number(keys.has('ArrowUp') || keys.has('KeyW'));
      if (x || y) onAim({ dx: x * dt * 180, dy: y * dt * 90 });
    }
  }, dispose() { cancel(); removers.forEach(fn => fn()); } });
}
