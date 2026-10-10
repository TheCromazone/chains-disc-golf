import { THROWS } from './physics.js';
import { icon } from './icons.js';

// First-round coach for the two-thumb touch controls: aim, throw, then both at once. Ghost thumbs act out each move and a
// step is learned only by doing it, so a player who already knows a move never sees it. Progress survives reloads; the
// field guide can replay it. It never takes input: the cards and ghosts let every touch through except the Skip button.
const STEPS = ['aim', 'throw', 'both'], KEY = 'chains.coach';
const COPY = {
  aim: () => ['Drag to aim', 'Slide a thumb across the view. Up or down tilts the launch.'],
  throw: (t, held, wide) => held ? ['Let go to throw', 'Longer swipe, more power'] : [`Swipe ${THROWS[t].hint.split('·')[0].replace('swipe ', '').trim()} to throw`, `Start ${wide ? 'on the right side' : 'in the lower pad'}. Longer swipe, more power.`],
  both: (t, held) => held ? ['Now steer with your other thumb', 'Let go of the swipe to throw'] : ['Use both thumbs', 'Start a swipe and hold it. Your other thumb keeps aiming.'],
};

export function createCoach({ hud, pad }) {
  let learned = new Set();
  try { learned = new Set(JSON.parse(localStorage.getItem(KEY) || '[]').filter(s => STEPS.includes(s))); } catch { /* private mode */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...learned])); } catch { /* private mode */ } };
  const coarse = matchMedia('(pointer: coarse)');
  const el = document.createElement('div');
  el.id = 'coach'; el.hidden = true;
  el.innerHTML = `<div class="ghost g-aim"><i class="thumb"></i></div><div class="ghost g-pad"><i class="trail"></i><i class="thumb"></i></div>
    <div class="coach-card" role="status"><div class="coach-top"><span class="coach-dots"><i></i><i></i><i></i></span><span class="coach-step"></span><button type="button" class="coach-skip">Skip</button></div>
    <b class="coach-title"></b><span class="coach-sub"></span></div>`;
  hud.appendChild(el);
  const $ = s => el.querySelector(s), card = $('.coach-card');
  let shown = null, wait = 0, doneT = 0, aimPx = 0, bothPx = 0, key = '', held = false, throwType = 'backhand', unaimed = 0;
  $('.coach-skip').onclick = () => { for (const s of STEPS) learned.add(s); save(); hide(); };

  const next = () => STEPS.find(s => !learned.has(s)) || null;
  function learn(...steps) {
    const before = shown && !learned.has(shown);
    for (const s of steps) learned.add(s);
    save();
    if (before && learned.has(shown)) { doneT = .9; el.classList.add('done'); $('.coach-title').innerHTML = `${icon('check')}Nice!`; $('.coach-sub').textContent = next() ? 'Next up…' : 'That\'s everything. Have a great round.'; }
  }
  function hide() { if (!shown && el.hidden) return; shown = null; el.hidden = true; doneT = 0; el.classList.remove('done'); document.body.classList.remove('coaching'); delete document.body.dataset.coach; key = ''; }
  function render() {
    const i = STEPS.indexOf(shown), [title, sub] = COPY[shown](throwType, held, pad.getBoundingClientRect().left > innerWidth * .2);
    el.dataset.step = document.body.dataset.coach = shown; el.classList.toggle('held', held); el.classList.remove('done');
    $('.coach-step').textContent = `${i + 1} of ${STEPS.length}`;
    el.querySelectorAll('.coach-dots i').forEach((d, j) => d.classList.toggle('on', j <= i));
    $('.coach-title').textContent = title; $('.coach-sub').textContent = sub;
  }
  // Where the moves happen: the swipe is acted out in the pad's open area (above the power ring), the aim on the view
  // above the pad (portrait) or beside it (landscape). The card takes the first side of its ghost (above, below, right,
  // left) that clears both the ghost and the HUD plates along the top and bottom edges.
  const edge = (ids, side) => ids.map(id => document.getElementById(id)?.getBoundingClientRect()).filter(b => b?.height).map(b => b[side]);
  function layout() {
    const r = pad.getBoundingClientRect(), wide = r.left > innerWidth * .2, w = card.offsetWidth, h = card.offsetHeight;
    const ceiling = Math.max(0, ...edge(['top', 'utilities', 'shotPlan'], 'bottom')) + 8, floor = Math.min(innerHeight, ...edge(['conditions', 'controls', 'power'], 'top')) - 8;
    const open = r.height - (parseFloat(getComputedStyle(pad).paddingBottom) || 0), [sx, sy] = THROWS[throwType].swipe;
    const len = Math.max(80, Math.min(150, r.width * .42, open * .7)), half = Math.abs(sy) * len / 2, room = ceiling + h + 44;   // room: the highest a ghost can sit with the card above it
    const cx = r.left + r.width / 2, cy = wide ? Math.min(Math.max(r.top + open / 2, room + half), r.top + open - 26 - half) : r.top + open / 2;
    const ax = wide ? r.left / 2 : innerWidth / 2, ay = wide ? Math.min(Math.max(innerHeight * .45, room), floor - 34) : Math.max(room, r.top - Math.min(150, r.top * .3));
    const x0 = cx - sx * len / 2, y0 = cy - sy * len / 2, x1 = x0 + sx * len, y1 = y0 + sy * len, swing = Math.min(64, innerWidth * .14);
    $('.g-pad').style.cssText = `left:${x0}px;top:${y0}px;--dx:${sx * len}px;--dy:${sy * len}px;--len:${len}px;--rot:${Math.atan2(sy, sx)}rad`;
    $('.g-aim').style.cssText = `left:${ax}px;top:${ay}px;--dx:${swing}px`;
    const [bl, bt, br, bb] = shown === 'throw' ? [Math.min(x0, x1) - 30, Math.min(y0, y1) - 30, Math.max(x0, x1) + 30, Math.max(y0, y1) + 30] : [ax - swing - 30, ay - 30, ax + swing + 30, ay + 30];
    const fit = ([x, y]) => [Math.max(12, Math.min(innerWidth - 12 - w, x)), Math.max(ceiling, Math.min(floor - h, y))];
    const clear = ([x, y]) => x + w <= bl || x >= br || y + h <= bt || y >= bb;
    // the swipe step's card stays off the pad (a stroke starting on Skip skipped the tutorial): over the view above it, or on the aim side
    const offPad = shown === 'throw' ? [wide ? [(r.left - w) / 2, (bt + bb - h) / 2] : [(innerWidth - w) / 2, r.top - h - 12]] : [];
    const spots = [...offPad, [(bl + br - w) / 2, bt - 10 - h], [(bl + br - w) / 2, bb + 10], [br + 10, (bt + bb - h) / 2], [bl - 10 - w, (bt + bb - h) / 2]].map(fit);
    const [x, y] = spots.find(clear) || spots[0];
    card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  return {
    // on: it is this device's turn to aim, on the aim camera, with nothing open over the course.
    update(dt, { on, throwType: t, windup }) {
      const step = on && coarse.matches ? (doneT > 0 ? shown : next()) : null;
      if (!step) { wait = 0; hide(); return; }
      if (doneT > 0) { doneT -= dt; if (doneT <= 0) { hide(); wait = .35; } return; }
      if (step !== shown) {
        if ((wait += dt) < .6) return;   // let the turn's camera cut settle before anything appears
        shown = step; el.hidden = false; document.body.classList.add('coaching'); key = '';
      }
      const k = `${step}|${t}|${windup}|${innerWidth}x${innerHeight}`;
      if (k !== key) { key = k; throwType = t; held = windup; render(); layout(); }
    },
    aimed(px, windup) {
      aimPx += px; if (windup) bothPx += px;
      if (bothPx >= 40 && !learned.has('both')) learn('aim', 'both'); else if (aimPx >= 80 && !learned.has('aim')) learn('aim');
    },
    thrown() { const skipAim = !learned.has('aim') && ++unaimed >= 2; learn(...(shown === 'both' ? ['throw', 'both'] : skipAim ? ['aim', 'throw'] : ['throw'])); },   // two throws without aiming: stop asking, move on
    replay() { learned.clear(); save(); aimPx = bothPx = unaimed = 0; hide(); },
  };
}
