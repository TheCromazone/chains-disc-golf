import * as THREE from 'three';
import { buildCourse, makeRng, COURSES, courseById, courseLayout } from './course.js';
import { DISCS, THROWS, discById, launch, step, DT, isDone, resultOf, simulate, speedFor } from './physics.js';
import { createCharacter, DEFAULT_AVATAR, AVATAR_OPTIONS, randomAvatar } from './player.js';
import { loadManifest, asset } from './assets.js';
import { createDiscMesh, setDiscPose } from './disc.js';
import { setupInput } from './input.js';
import { planBotThrow } from './bot.js';
import { createNet } from './net.js';
import * as UI from './ui.js';
import { unlock, sfx, setMuted, isMuted } from './audio.js';

const $ = UI.$;
const COLORS = ['#ff4d3d', '#2f80ff', '#ffd23f', '#38d47a', '#ff7ad9', '#9b6bff'];
const BOT_NAMES = ['Ricky', 'Paige', 'Simon', 'Eagle', 'Calvin', 'Kristin'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;

const G = {
  phase: 'menu', mode: 'solo', players: [], holeIdx: 0, holeCount: 9, cur: -1, seed: 7,
  aim: { yaw: 0, pitch: 0 }, throwType: 'backhand', discId: 'driver', overview: false,
  flight: null, pending: null, releaseT: 0, tween: null, introT: 0,
  settings: { holes: '9', difficulty: 'medium', quality: isMobile ? 'low' : 'high' },
  net: null, lobby: [], gesture: { power: 0, lateral: 0 }, previewDirty: true, lastPreview: 0, inbox: [],
  avatar: { ...DEFAULT_AVATAR }, courseId: 'pine',
};
try { Object.assign(G.avatar, JSON.parse(localStorage.getItem('chains.avatar') || '{}')); G.courseId = localStorage.getItem('chains.course') || 'pine'; } catch { /* private mode */ }
const saveLocal = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* ignore */ } };
const strHash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

// ---------- renderer / scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.66;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.2, 1600);
const resize = () => { renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, G.settings.quality === 'low' ? 1.5 : 2)); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 74 : camera.aspect < 1.2 ? 66 : 58; camera.updateProjectionMatrix(); };
addEventListener('resize', resize); resize();

let course, world, holes;
const cam = { pos: new THREE.Vector3(0, 10, 30), look: new THREE.Vector3(), tPos: new THREE.Vector3(), tLook: new THREE.Vector3(), mode: 'menu', lastHv: new THREE.Vector3(0, 0, -1) };
const preview = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.7, gapSize: 0.45, transparent: true, opacity: 0.8, depthTest: false }));
preview.frustumCulled = false; preview.renderOrder = 5; preview.visible = false; scene.add(preview);
const circleRing = new THREE.Mesh(new THREE.RingGeometry(9.9, 10.1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
scene.add(circleRing);

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const aimDir = () => [Math.cos(G.aim.yaw), Math.sin(G.aim.yaw)];
const rightOf = d => [-d[1], d[0]];
const curP = () => G.players[G.cur];
const basketPos = () => holes[G.holeIdx].basket;
const distToBasket = (x, z) => Math.hypot(basketPos()[0] - x, basketPos()[1] - z);
const isMine = p => G.mode !== 'online' ? !p.isBot : p.peerId === G.net?.id();
const iControl = p => p.isBot ? (G.mode !== 'online' || G.net.isHost) : isMine(p);
const netSend = msg => { if (G.mode !== 'online' || !G.net) return; G.net.isHost ? G.net.broadcast(msg) : G.net.toHost(msg); };

// ---------- players ----------
function createPlayer({ name, color, isBot = false, difficulty = 'medium', peerId = null, avatar = null }, i) {
  // bots and unnamed humans get a deterministic random look (same on every online client) in their player colour
  const char = createCharacter(avatar ? { ...avatar, jersey: color } : randomAvatar(makeRng(strHash(name) + i * 97), { jersey: color, name }));
  scene.add(char.group);
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.27, 0.4, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
  marker.visible = false; scene.add(marker);
  return { name, color, isBot, difficulty, peerId, scores: [], strokes: 0, done: false, lie: [0, 0, 0], lieDist: 0, char, marker, discMesh: null, discId: null };
}
function ensureDisc(p, discId) {
  if (p.discId === discId && p.discMesh) return;
  if (p.discMesh) scene.remove(p.discMesh);
  p.discMesh = createDiscMesh(discById(discId)); p.discId = discId; scene.add(p.discMesh);
}
function clearPlayers() { for (const p of G.players) { scene.remove(p.char.group); scene.remove(p.marker); if (p.discMesh) scene.remove(p.discMesh); p.char.dispose(); } G.players = []; }

// ---------- course + hero (menu avatar) ----------
let hero = null;
const LAYOUTS = COURSES.map(courseLayout);
function placeHero() {
  const h = holes[0], d = [h.basket[0] - h.tee[0], h.basket[1] - h.tee[1]], L = Math.hypot(d[0], d[1]);
  hero.group.position.set(h.tee[0], h.teeY + 0.07, h.tee[1]); hero.faceDir(d[0] / L, d[1] / L); hero.setPhase(null);
}
function makeHero() { if (hero) { scene.remove(hero.group); hero.dispose(); } hero = createCharacter(G.avatar); scene.add(hero.group); const dm = createDiscMesh(discById('driver')); dm.position.set(0, -0.035, -0.02); dm.rotation.set(0.5, 0, 0); hero.hand.add(dm); placeHero(); }
function updateHub() { const i = COURSES.findIndex(c => c.id === G.courseId); UI.setHub({ name: G.avatar.name, jersey: G.avatar.jersey, course: COURSES[i], holes: LAYOUTS[i], img: asset('courses', G.courseId) }); }
async function loadCourse(id) {
  const def = courseById(id); if (course && course.def.id === def.id) return;
  const first = !course; if (!first) { UI.fade(true); await sleep(340); }
  course?.dispose();
  course = buildCourse(scene, renderer, { course: def, quality: G.settings.quality });
  world = course.world; holes = course.holes; course.setHole(0);
  G.courseId = def.id; saveLocal('chains.course', def.id); updateHub();
  if (hero) placeHero();
  if (G.phase === 'menu' && hero) updateCamera(10);   // snap the menu camera to the new course
  if (window.__chains) Object.assign(window.__chains, { course, world, holes });
  if (!first) UI.fade(false);
}

// ---------- game flow ----------
async function startGame(config) {
  clearPlayers(); await loadCourse(config.courseId || G.courseId); hero.group.visible = false;
  G.seed = course.def.seed; G.holeCount = config.holeCount; G.holeIdx = 0; G.mode = config.mode;
  G.players = config.players.map((p, i) => createPlayer({ ...p, color: p.color || p.avatar?.jersey || COLORS[i % COLORS.length] }, i));
  for (const id of ['menu', 'setup', 'online', 'score', 'help', 'courses', 'locker']) UI.hide(id);
  UI.show('hud'); UI.selectThrow(G.throwType); UI.selectDisc(G.discId);
  startHole();
}
function startHole() {
  const h = holes[G.holeIdx]; course.setHole(G.holeIdx);
  const rng = makeRng(G.seed * 31 + G.holeIdx * 7 + 1);
  const ws = rng() * 3.5 * course.def.wind, wa = rng() * Math.PI * 2; world.wind = [Math.cos(wa) * ws, Math.sin(wa) * ws];
  const d = [h.basket[0] - h.tee[0], h.basket[1] - h.tee[1]], L = Math.hypot(d[0], d[1]); d[0] /= L; d[1] /= L;
  const r = rightOf(d);
  G.players.forEach((p, i) => {
    p.strokes = 0; p.done = false; p.lie = [h.tee[0], h.teeY, h.tee[1]]; p.lieDist = h.len; p.marker.visible = false;
    const sx = h.tee[0] - d[0] * (1.2 + i * 1.3) - r[0] * 2.8, sz = h.tee[1] - d[1] * (1.2 + i * 1.3) - r[1] * 2.8;   // waiting players stand left of the pad
    p.char.group.position.set(sx, world.height(sx, sz), sz);
    p.char.faceDir(d[0], d[1]); p.char.setPhase(null);
    ensureDisc(p, p.discId || 'driver'); p.discMesh.visible = false;
  });
  circleRing.position.set(h.basket[0], h.basketY + 0.05, h.basket[1]);
  UI.setHud({ hole: G.holeIdx + 1, par: h.par, len: h.len, dist: h.len, throwNo: 'Tee', playerName: '' });
  UI.setControlsEnabled(false); UI.waiting(null); preview.visible = false;
  G.phase = 'intro'; G.introT = 0; cam.mode = 'intro'; G.overview = false;
  UI.toast(`Hole ${G.holeIdx + 1}`, `Par ${h.par} · ${Math.round(h.len)} m${h.pondKind ? ' · water in play' : ''}`, 2600);
}
function updateWindHud() {
  const [wx, wz] = world.wind, ws = Math.hypot(wx, wz);
  UI.setHud({ windText: ws < 0.3 ? 'calm' : `${ws.toFixed(1)} m/s`, windDeg: (Math.atan2(wz, wx) - G.aim.yaw) * 180 / Math.PI - 90 });
}
function honorsOrder() {
  const prev = G.holeIdx - 1;
  return [...G.players].map((p, i) => ({ p, i })).sort((a, b) => (prev >= 0 ? (a.p.scores[prev] ?? 99) - (b.p.scores[prev] ?? 99) : 0) || a.i - b.i).map(o => o.p);
}
function nextTurn() {
  if (G.phase === 'menu') return;
  const alive = G.players.filter(p => !p.done);
  if (!alive.length) return endHole();
  let next = honorsOrder().find(p => !p.done && p.strokes === 0);
  if (!next) next = alive.reduce((a, b) => (b.lieDist > a.lieDist ? b : a));
  setupTurn(G.players.indexOf(next));
}
function setupTurn(idx) {
  const p = G.players[idx]; G.cur = idx;
  const lie = p.lie, dist = distToBasket(lie[0], lie[2]);
  G.aim.yaw = Math.atan2(basketPos()[1] - lie[2], basketPos()[0] - lie[0]); G.aim.pitch = 0;
  p.char.group.position.set(lie[0], world.height(lie[0], lie[2]), lie[2]);
  p.char.setPhase(null);
  p.marker.position.set(lie[0], world.height(lie[0], lie[2]) + 0.04, lie[2]); p.marker.visible = p.strokes > 0;
  // sensible default club for the distance (players can change it)
  if (dist > 62) { G.throwType = 'backhand'; G.discId = 'driver'; } else if (dist > 34) { G.throwType = 'backhand'; G.discId = 'fairway'; } else if (dist > 15) { G.throwType = 'backhand'; G.discId = 'mid'; } else { G.throwType = 'putt'; G.discId = 'putter'; }
  UI.selectThrow(G.throwType); UI.selectDisc(G.discId); ensureDisc(p, G.discId); p.discMesh.visible = true;
  UI.setHud({ dist, circle: dist <= 10, playerName: p.name, throwNo: p.strokes === 0 ? 'Tee shot' : `Throw ${p.strokes + 1}` });
  updateWindHud();
  UI.setPower(0); G.gesture = { power: 0, lateral: 0 }; G.previewDirty = true;
  G.phase = 'aim'; cam.mode = 'aim'; G.overview = false; $('btnOverview').classList.remove('on');
  if (p.isBot) { UI.setControlsEnabled(false); preview.visible = false; if (iControl(p)) botTurn(p); else UI.waiting(`${p.name} is throwing…`); }
  else if (isMine(p)) { UI.setControlsEnabled(true); UI.waiting(null); preview.visible = true; if (G.mode === 'local' && G.players.filter(q => !q.isBot).length > 1) UI.toast(`${p.name}'s throw`, `${Math.round(dist)} m to the basket`, 1600); }
  else { UI.setControlsEnabled(false); preview.visible = false; UI.waiting(`${p.name} is throwing…`); }
}
async function botTurn(p) {
  UI.waiting(`${p.name} is thinking…`);
  await sleep(700); if (curP() !== p || G.phase !== 'aim') return;
  const plan = await planBotThrow({ pos: p.lie, world, difficulty: p.difficulty });
  if (curP() !== p || G.phase !== 'aim') return;
  G.throwType = plan.throwType; G.discId = plan.discId; UI.selectThrow(G.throwType); UI.selectDisc(G.discId); ensureDisc(p, G.discId); p.discMesh.visible = true;
  G.aim.yaw = Math.atan2(plan.dir[1], plan.dir[0]);
  UI.waiting(`${p.name} · ${THROWS[plan.throwType].name}, ${discById(plan.discId).type.toLowerCase()}`);
  G.phase = 'windup'; p.char.setThrow(G.throwType);
  G.tween = { t: 0, dur: 0.9, fn: u => { p.char.setPhase(u * 0.5); UI.setPower(plan.power * u); }, done: () => doThrow(G.cur, { power: plan.power, hyzer: plan.hyzer, yawOffset: plan.yawOffset, launchOffset: 0 }) };
}
function doThrow(pi, o, sim = null) {
  const p = G.players[pi];
  G.phase = 'release'; G.releaseT = 0; G.pending = { pi, o, sim, fired: false };
  p.char.setThrow(G.throwType); UI.setControlsEnabled(false); preview.visible = false;
}
function runSim(params) {
  const s = launch({ ...params, disc: discById(params.discId) });
  const traj = [], events = []; let i = 0, le = 0;
  const rnd = v => Math.round(v * 1000) / 1000;
  while (!isDone(s) && s.t < 25) {
    step(s, world, DT);
    if (i++ % 4 === 0) traj.push([rnd(s.p[0]), rnd(s.p[1]), rnd(s.p[2]), rnd(s.n[0]), rnd(s.n[1]), rnd(s.n[2])]);
    for (; le < s.events.length; le++) events.push([rnd(s.t), s.events[le]]);
  }
  if (!isDone(s)) s.mode = 'rest';
  traj.push([rnd(s.p[0]), rnd(s.p[1]), rnd(s.p[2]), rnd(s.n[0]), rnd(s.n[1]), rnd(s.n[2])]);
  return { traj, events, result: resultOf(s, world) };
}
function launchNow() {
  const { pi, o, sim: given } = G.pending; const p = G.players[pi];
  let params, sim;
  if (given) { params = given.params; sim = given; }
  else {
    const d = aimDir(), pos = [p.lie[0] + d[0] * 0.4, world.height(p.lie[0], p.lie[2]) + 1.15, p.lie[2] + d[1] * 0.4];   // same release point the preview and bots plan from
    params = { throwType: G.throwType, discId: G.discId, power: o.power, hyzer: o.hyzer || 0, yawOffset: o.yawOffset || 0, launchOffset: o.launchOffset ?? G.aim.pitch, dir: d, pos };
    sim = runSim(params);
    netSend({ t: 'throw', pi, params, traj: sim.traj, events: sim.events, result: sim.result });
  }
  ensureDisc(p, params.discId); p.discMesh.visible = true;
  G.flight = { pi, params, traj: sim.traj, events: sim.events, result: sim.result, t: 0, ei: 0, spin: 0, spinRate: 4 + speedFor(params.throwType, params.power) * 3 };
  G.phase = 'flight'; cam.mode = 'flight'; sfx.whoosh(params.power);
  UI.setHud({ throwNo: `Throw ${p.strokes + 1}` });
}
function updateFlight(dt) {
  const f = G.flight, p = G.players[f.pi], n = f.traj.length;
  f.t += dt;
  const fi = f.t * 60, i = Math.min(Math.floor(fi), n - 1), a = f.traj[i], b = f.traj[Math.min(i + 1, n - 1)], u = Math.min(1, fi - i);
  const pos = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  const nn = [a[3] + (b[3] - a[3]) * u, a[4] + (b[4] - a[4]) * u, a[5] + (b[5] - a[5]) * u];
  f.spin += f.spinRate * dt; f.spinRate *= (1 - 0.12 * dt);
  setDiscPose(p.discMesh, pos, nn, f.spin * THROWS[f.params.throwType].spin);
  f.pos = pos; f.hv = [b[0] - a[0], 0, b[2] - a[2]];
  while (f.ei < f.events.length && f.events[f.ei][0] <= f.t) { onFlightEvent(f.events[f.ei][1]); f.ei++; }
  UI.setHud({ dist: Math.hypot(basketPos()[0] - pos[0], basketPos()[1] - pos[2]) });
  if (i >= n - 1 && f.t > n / 60 + 0.6) { G.flight = null; resolveThrow(f.pi, f.result); }
}
function onFlightEvent(e) {
  const m = { land: () => sfx.thud(), skip: () => sfx.skip(), tree: () => { sfx.tree(); UI.toast('Tree!', '', 900); }, branch: () => { sfx.leaves(); UI.toast('Kicked by a branch', '', 900); }, chains: () => sfx.chains(), drop: () => sfx.drop(), chainout: () => { sfx.chainout(); UI.toast('Chain out!', 'too hard', 1200); }, band: () => { sfx.band(); UI.toast('Off the band', '', 900); }, pole: () => sfx.pole(), rim: () => { sfx.band(); UI.toast('Off the rim', '', 900); }, splash: () => sfx.splash(), roll: () => sfx.roll(), flop: () => sfx.thud(0.5), ob: () => sfx.bad() };
  m[e]?.();
}
function resolveThrow(pi, r) {
  const p = G.players[pi], h = holes[G.holeIdx];
  p.strokes++;
  let title, sub;
  if (r.holed) {
    p.done = true; p.scores[G.holeIdx] = p.strokes;
    title = UI.scoreName(p.strokes, h.par); sub = `${p.name} · ${p.strokes} throw${p.strokes > 1 ? 's' : ''}`;
    sfx.fanfare(p.strokes === 1 ? 'ace' : p.strokes - h.par <= -2 ? 'eagle' : p.strokes - h.par === -1 ? 'birdie' : 'par');
  } else if (r.ob) { p.strokes++; p.lie = r.lie; title = 'Out of bounds'; sub = '+1 penalty · play from where it went out'; }
  else { p.lie = r.rest; title = r.thrown < 1 ? 'Dropped it' : `${Math.round(r.thrown)} m`; sub = `${r.dist.toFixed(r.dist < 20 ? 1 : 0)} m to the basket`; }
  if (!p.done && p.strokes >= h.par + 5) { p.done = true; p.scores[G.holeIdx] = p.strokes + 1; title = 'Picked up'; sub = 'max score for the hole'; }
  p.lieDist = distToBasket(p.lie[0], p.lie[2]);
  p.marker.position.set(p.lie[0], world.height(p.lie[0], p.lie[2]) + 0.04, p.lie[2]); p.marker.visible = !p.done;
  if (p.done) setTimeout(() => { if (p.done) p.discMesh.visible = false; }, 2500);
  UI.toast(title, sub, 2000); UI.setHud({ dist: p.lieDist });
  G.phase = 'result'; cam.mode = 'result';
  setTimeout(() => { if (G.phase === 'result') { UI.fade(true); setTimeout(() => { nextTurn(); UI.fade(false); }, 320); } }, 2000);
}
function endHole() {
  G.phase = 'holeEnd'; preview.visible = false; UI.setControlsEnabled(false);
  UI.renderScorecard({ players: G.players, holes: holes.slice(0, G.holeCount), holeIdx: G.holeIdx, final: G.holeIdx >= G.holeCount - 1, isHost: G.net?.isHost, online: G.mode === 'online' });
}
function advanceHole() {
  UI.hide('score'); UI.show('hud');
  if (G.holeIdx >= G.holeCount - 1) { for (const p of G.players) p.scores = []; G.holeIdx = 0; } else G.holeIdx++;
  startHole();
}
function applyRemoteThrow(m) {   // only called when this client is idle in 'aim' (or still in the intro)
  if (G.cur !== m.pi) setupTurn(m.pi);
  G.throwType = m.params.throwType; G.discId = m.params.discId; UI.selectThrow(G.throwType); UI.selectDisc(G.discId);
  G.aim.yaw = Math.atan2(m.params.dir[1], m.params.dir[0]);
  const p = G.players[m.pi]; ensureDisc(p, G.discId); p.discMesh.visible = true; UI.waiting(null); preview.visible = false;
  G.tween = { t: 0, dur: 0.7, fn: u => p.char.setPhase(u * 0.5), done: () => doThrow(m.pi, {}, { traj: m.traj, events: m.events, result: m.result, params: m.params }) };
  G.phase = 'windup'; p.char.setThrow(G.throwType); cam.mode = 'aim';
}
function toMenu() {
  G.phase = 'menu'; G.flight = null; G.pending = null; G.tween = null; cam.mode = 'menu'; G.inbox = [];
  clearPlayers(); preview.visible = false; for (const id of ['hud', 'score', 'online', 'setup', 'courses', 'locker']) UI.hide(id); UI.show('menu');
  hero.group.visible = true; placeHero(); course.setHole(0);
  if (G.net) { G.net.close(); G.net = null; }
}

// ---------- gestures ----------
function onAim({ dx, dy }) {
  if (G.phase !== 'aim' || !isMine(curP()) || curP().isBot) return;
  G.aim.yaw += dx * (G.overview ? 0.0025 : 0.0038);
  G.aim.pitch = Math.max(-6, Math.min(16, G.aim.pitch - dy * 0.06));
  G.previewDirty = true; updateWindHud();
}
function onGesture(g) {
  const p = curP(); if (!p || p.isBot || !isMine(p)) return;
  if (g.state === 'start') { if (G.phase !== 'aim') return; G.phase = 'windup'; p.char.setThrow(G.throwType); p.char.setPhase(0); UI.setHint(G.throwType, 'release to throw'); return; }
  if (G.phase !== 'windup') return;
  if (g.state === 'move') {
    if (!g.valid) { p.char.setPhase(0); UI.setPower(0); G.gesture.power = 0; UI.setHint(G.throwType, `Wrong way — ${THROWS[G.throwType].hint}`); return; }
    G.gesture.power = g.progress; G.gesture.lateral = g.lateral; G.previewDirty = true;
    p.char.setPhase(g.progress * 0.5); UI.setPower(g.progress);
    const th = THROWS[G.throwType];
    UI.setHint(G.throwType, th.latMode === 'hyzer' ? (g.lateral > 0.08 ? 'hyzer' : g.lateral < -0.08 ? 'anhyzer' : 'flat') : (Math.abs(g.lateral) > 0.08 ? (g.lateral > 0 ? 'aim right' : 'aim left') : 'straight'));
    return;
  }
  if (g.state === 'cancel' || !g.valid) { G.phase = 'aim'; p.char.setPhase(null); UI.setPower(0); G.gesture.power = 0; G.previewDirty = true; if (g.state !== 'cancel') UI.badSwipe(G.throwType); else UI.setHint(G.throwType, 'swipe further for power · drag the view to aim'); return; }
  // fire
  const th = THROWS[G.throwType], wob = Math.min(1, g.wobble * 1.5);
  const o = { power: g.progress, hyzer: 0, yawOffset: (Math.random() - 0.5) * 6 * wob, launchOffset: G.aim.pitch };
  if (th.latMode === 'hyzer') o.hyzer = Math.max(-35, Math.min(35, g.lateral * 80)); else o.yawOffset += Math.max(-25, Math.min(25, g.lateral * 50));
  UI.setHint(G.throwType, 'swipe further for power · drag the view to aim');
  doThrow(G.cur, o);
}
function gestureParams(power, lateral) {
  const th = THROWS[G.throwType], p = curP();
  const o = { throwType: G.throwType, discId: G.discId, disc: discById(G.discId), power, hyzer: 0, yawOffset: 0, launchOffset: G.aim.pitch, dir: aimDir(), pos: [p.lie[0] + aimDir()[0] * 0.4, world.height(p.lie[0], p.lie[2]) + 1.15, p.lie[2] + aimDir()[1] * 0.4] };
  if (th.latMode === 'hyzer') o.hyzer = Math.max(-35, Math.min(35, lateral * 80)); else o.yawOffset = Math.max(-25, Math.min(25, lateral * 50));
  return o;
}
const previewWorld = () => ({ ...world, treesNear: () => [], basket: world.basket });
function updatePreview() {
  if (!preview.visible) return;
  const now = performance.now(); if (!G.previewDirty || now - G.lastPreview < 70) return;
  G.previewDirty = false; G.lastPreview = now;
  const pw = G.phase === 'windup' && G.gesture.power > 0.1 ? G.gesture.power : 0.72;
  const o = gestureParams(pw, G.phase === 'windup' ? G.gesture.lateral : 0);
  const r = simulate(o, previewWorld(), { record: true, every: 6, maxT: 12 });
  const pts = r.traj.slice(0, Math.max(2, Math.floor(r.traj.length * 0.7)));
  const arr = new Float32Array(pts.length * 3); pts.forEach((q, i) => { arr[i * 3] = q[0]; arr[i * 3 + 1] = q[1]; arr[i * 3 + 2] = q[2]; });
  preview.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3)); preview.geometry.setDrawRange(0, pts.length); preview.computeLineDistances();
  preview.material.color.set(pw > 0.72 ? '#ffd23f' : '#ffffff');
}

// ---------- camera ----------
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
function updateCamera(dt) {
  const h = holes[G.holeIdx] || holes[0];
  let k = 5;
  if (cam.mode === 'menu' || cam.mode === 'locker') {   // hero shot of the avatar on tee 1, slow sway
    const h0 = holes[0], t = performance.now() / 1000, d = [h0.basket[0] - h0.tee[0], h0.basket[1] - h0.tee[1]], L = Math.hypot(d[0], d[1]); d[0] /= L; d[1] /= L;
    const r = rightOf(d), p = hero.group.position, wide = camera.aspect > 1.2, locker = cam.mode === 'locker';
    const ang = Math.sin(t * 0.25) * 0.35 + (locker ? 0.15 : 0.55), dist = locker ? 2.4 : 3.6;
    const fx = d[0] * Math.cos(ang) + r[0] * Math.sin(ang), fz = d[1] * Math.cos(ang) + r[1] * Math.sin(ang);   // direction from hero to camera, swept around his front
    const side = wide ? -0.9 : 0;   // desktop: menu panel sits on the left, so frame the hero right of centre
    cam.tPos.set(p.x + fx * dist + r[0] * side, p.y + (locker ? 1.25 : 1.35), p.z + fz * dist + r[1] * side);
    cam.tLook.set(p.x + r[0] * side, p.y + (locker ? (wide ? 0.95 : 0.55) : (wide ? 0.9 : 0.35)), p.z + r[1] * side); k = 2;
  } else if (cam.mode === 'courses') {   // slow flyover of the whole course
    const t = performance.now() / 1000 * 0.06, cx = holes.reduce((a, h) => a + h.basket[0], 0) / holes.length, cz = holes.reduce((a, h) => a + h.basket[1], 0) / holes.length;
    cam.tPos.set(cx + Math.cos(t) * 170, world.height(cx, cz) + 95, cz + Math.sin(t) * 170); cam.tLook.set(cx, world.height(cx, cz), cz); k = 1.5;
  } else if (cam.mode === 'intro') {
    const d = [h.basket[0] - h.tee[0], h.basket[1] - h.tee[1]], L = Math.hypot(d[0], d[1]); d[0] /= L; d[1] /= L;
    const u = ease(Math.min(1, G.introT / 3.4));
    _v.set(h.basket[0] - d[0] * 18, h.basketY + 26, h.basket[1] - d[1] * 18);   // start above, behind the basket looking back at the tee
    _v2.set(h.tee[0] - d[0] * 6, h.teeY + 3.2, h.tee[1] - d[1] * 6);
    cam.pos.lerpVectors(_v, _v2, u);
    _v.set(h.tee[0], h.teeY + 1, h.tee[1]); _v2.set(h.basket[0], h.basketY + 1, h.basket[1]);
    cam.look.lerpVectors(_v, _v2, u);
    camera.position.copy(cam.pos); camera.lookAt(cam.look); return;
  } else if (cam.mode === 'aim' || (cam.mode === 'result' && !G.flight)) {
    const p = curP(); if (!p) return;
    const d = aimDir(), r = rightOf(d), lie = p.char.group.position;
    if (G.overview) {
      const dist = Math.max(20, distToBasket(lie.x, lie.z));
      const mx = (lie.x + basketPos()[0]) / 2, mz = (lie.z + basketPos()[1]) / 2;
      cam.tPos.set(mx - d[0] * dist * 0.22, world.height(mx, mz) + Math.max(45, dist * 0.95), mz - d[1] * dist * 0.22); cam.tLook.set(mx, world.height(mx, mz), mz); k = 4;
    } else if (cam.mode === 'result') { k = 2.5; }
    else {
      const pitchLift = G.aim.pitch * 0.06;
      const back = camera.aspect < 0.8 ? 5.6 : 4.8;
      cam.tPos.set(lie.x - d[0] * back + r[0] * 0.75, lie.y + 2.3 + pitchLift, lie.z - d[1] * back + r[1] * 0.75);
      cam.tLook.set(lie.x + d[0] * 16, lie.y + 0.4 + G.aim.pitch * 0.35, lie.z + d[1] * 16);
    }
  } else if (cam.mode === 'flight' || cam.mode === 'result') {
    const f = G.flight;
    if (f && f.pos) {
      _v3.set(f.hv[0], 0, f.hv[2]); if (_v3.lengthSq() > 1e-6) cam.lastHv.copy(_v3.normalize());
      const hv = cam.lastHv, sp = Math.hypot(f.hv[0], f.hv[2]) * 60;
      const back = 5.5 + Math.min(4, sp * 0.12);
      cam.tPos.set(f.pos[0] - hv.x * back, f.pos[1] + 2.4, f.pos[2] - hv.z * back); cam.tLook.set(f.pos[0], f.pos[1] + 0.2, f.pos[2]); k = 6;
      cam.tPos.y = Math.max(cam.tPos.y, world.height(cam.tPos.x, cam.tPos.z) + 1.7);
    }
  }
  const a = 1 - Math.exp(-k * dt);
  cam.pos.lerp(cam.tPos, a); cam.look.lerp(cam.tLook, a);
  const gy = world.height(cam.pos.x, cam.pos.z) + 0.7; if (cam.pos.y < gy) cam.pos.y = gy;
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
}

// ---------- main loop ----------
const clock = new THREE.Clock(); let time = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(G.maxDt || 0.05, clock.getDelta()); time += dt;
  if (!course) return;
  if (G.phase === 'intro') { G.introT += dt; if (G.introT > 3.5 || G.inbox.length) nextTurn(); }
  if (G.inbox.length && G.phase === 'aim' && G.mode === 'online') applyRemoteThrow(G.inbox.shift());
  if (G.tween) { const tw = G.tween; tw.t += dt; const u = Math.min(1, tw.t / tw.dur); tw.fn(u * u * (3 - 2 * u)); if (u >= 1) { G.tween = null; tw.done?.(); } }
  if (G.phase === 'release' && G.pending) {
    G.releaseT += dt; const p = G.players[G.pending.pi];
    const ph = 0.5 + Math.min(0.5, G.releaseT / 0.7 * 0.5); p.char.setPhase(ph);
    if (!G.pending.fired && ph >= 0.62) { G.pending.fired = true; launchNow(); }
    if (ph >= 1) { G.pending = null; setTimeout(() => p.char.setPhase(null), 350); }
  }
  if (G.flight) updateFlight(dt);
  for (const p of G.players) p.char.update(dt);
  if (hero?.group.visible) hero.update(dt);
  const p = curP();
  if (p && (G.phase === 'aim' || G.phase === 'windup' || (G.phase === 'release' && G.pending && !G.pending.fired))) {
    const d = aimDir(); p.char.faceDir(d[0], d[1]);
    // disc in hand, oriented like the release
    p.char.hand.getWorldPosition(_v);
    const lat = G.phase === 'windup' ? G.gesture.lateral : 0;
    const s0 = launch(gestureParams(0.5, lat));
    setDiscPose(p.discMesh, [_v.x, _v.y - 0.02, _v.z], s0.n, time * 0.4);
    updatePreview();
  }
  updateCamera(dt);
  const focus = G.flight?.pos ? _v2.set(G.flight.pos[0], G.flight.pos[1], G.flight.pos[2]) : p ? p.char.group.position : cam.look;
  course.update(dt, time, focus);
  renderer.render(scene, camera);
}

// ---------- HUD / menu wiring ----------
function pickThrow(id) { if (G.phase !== 'aim') return; G.throwType = id; UI.selectThrow(id); if (id === 'putt') { G.discId = 'putter'; UI.selectDisc('putter'); ensureDisc(curP(), 'putter'); curP().discMesh.visible = true; } G.previewDirty = true; sfx.click(); }
function pickDisc(id) { if (G.phase !== 'aim') return; G.discId = id; UI.selectDisc(id); ensureDisc(curP(), id); curP().discMesh.visible = true; G.previewDirty = true; sfx.click(); }
UI.buildThrowButtons(pickThrow); UI.buildDiscChips(pickDisc);
$('btnTarget').onclick = () => { if (G.phase === 'aim') { const l = curP().lie; G.aim.yaw = Math.atan2(basketPos()[1] - l[2], basketPos()[0] - l[0]); G.aim.pitch = 0; G.previewDirty = true; sfx.click(); } };
$('btnOverview').onclick = () => { if (G.phase !== 'aim') return; G.overview = !G.overview; $('btnOverview').classList.toggle('on', G.overview); sfx.click(); };
$('btnMute').onclick = () => { setMuted(!isMuted()); $('btnMute').textContent = isMuted() ? '🔇' : '🔊'; };
$('btnMenu').onclick = () => { if (confirm('Leave this round?')) toMenu(); };
$('btnHelp').onclick = () => { UI.hide('menu'); UI.show('help'); }; $('btnHelpClose').onclick = () => { UI.hide('help'); UI.show('menu'); };
$('btnScoreNext').onclick = () => { netSend({ t: 'next' }); advanceHole(); };
$('btnScoreMenu').onclick = toMenu;
UI.seg('holesSeg', v => G.settings.holes = v); UI.seg('diffSeg', v => G.settings.difficulty = v);
$('qualSeg').querySelector(`[data-v="${G.settings.quality}"]`)?.classList.add('on'); $('qualSeg').querySelector(`[data-v="${G.settings.quality === 'low' ? 'high' : 'low'}"]`)?.classList.remove('on');
UI.seg('qualSeg', v => { G.settings.quality = v; resize(); });
document.addEventListener('pointerdown', unlock, { once: true, capture: true });

const me = () => ({ name: G.avatar.name.trim() || 'You', avatar: G.avatar });
$('btnSolo').onclick = () => startGame({ mode: 'solo', holeCount: +G.settings.holes, players: [me(), { name: BOT_NAMES[0], isBot: true, difficulty: G.settings.difficulty }, { name: BOT_NAMES[1], isBot: true, difficulty: G.settings.difficulty }] });

// courses + locker room
$('btnCourses').onclick = () => { UI.hide('menu'); UI.show('courses'); cam.mode = 'courses'; sfx.click(); UI.renderCourseCards(COURSES, LAYOUTS, G.courseId, async id => { sfx.click(); UI.hide('courses'); UI.show('menu'); cam.mode = 'menu'; await loadCourse(id); }, id => asset('courses', id)); };
$('btnCoursesBack').onclick = () => { UI.hide('courses'); UI.show('menu'); cam.mode = 'menu'; };
let heroTimer = null;
const onAvatarChange = (k, v) => { G.avatar[k] = v; saveLocal('chains.avatar', G.avatar); updateHub(); if (k === 'name') return; clearTimeout(heroTimer); heroTimer = setTimeout(makeHero, 120); };
const openLocker = () => { UI.hide('menu'); UI.show('locker'); cam.mode = 'locker'; sfx.click(); UI.renderLocker(G.avatar, AVATAR_OPTIONS, onAvatarChange); };
$('btnLocker').onclick = openLocker;
$('btnRandomAvatar').onclick = () => { G.avatar = randomAvatar(Math.random, { name: G.avatar.name }); saveLocal('chains.avatar', G.avatar); makeHero(); updateHub(); UI.renderLocker(G.avatar, AVATAR_OPTIONS, onAvatarChange); sfx.click(); };
$('btnLockerDone').onclick = () => { UI.hide('locker'); UI.show('menu'); cam.mode = 'menu'; sfx.click(); };

// pass & play setup
let setupPlayers = [];
function renderSetup() {
  $('playerList').innerHTML = '';
  setupPlayers.forEach((p, i) => {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<i class="dot" style="background:${COLORS[i % COLORS.length]};width:16px;height:16px"></i><input value="${p.name}" maxlength="14" style="flex:1"><span class="muted">${p.isBot ? 'bot' : 'player'}</span><button data-x="${i}">✕</button>`;
    row.querySelector('input').oninput = e => p.name = e.target.value;
    row.querySelector('button').onclick = () => { setupPlayers.splice(i, 1); renderSetup(); };
    $('playerList').appendChild(row);
  });
}
$('btnLocal').onclick = () => { setupPlayers = [{ name: 'Player 1' }, { name: 'Player 2' }]; renderSetup(); UI.hide('menu'); UI.show('setup'); };
$('btnAddHuman').onclick = () => { if (setupPlayers.length < 6) { setupPlayers.push({ name: `Player ${setupPlayers.length + 1}` }); renderSetup(); } };
$('btnAddBot').onclick = () => { if (setupPlayers.length < 6) { setupPlayers.push({ name: BOT_NAMES[setupPlayers.filter(p => p.isBot).length % BOT_NAMES.length], isBot: true, difficulty: G.settings.difficulty }); renderSetup(); } };
$('btnSetupBack').onclick = () => { UI.hide('setup'); UI.show('menu'); };
$('btnSetupStart').onclick = () => { if (!setupPlayers.length) return; let mine = false; startGame({ mode: 'local', holeCount: +G.settings.holes, players: setupPlayers.map(p => { const first = !p.isBot && !mine; if (first) mine = true; return { ...p, name: p.name.trim() || 'Player', avatar: first ? { ...G.avatar } : null }; }) }); };

// online
$('btnOnline').onclick = () => { UI.hide('menu'); UI.show('online'); UI.show('onlineChoice'); UI.hide('lobby'); $('onlineName').value ||= G.avatar.name || 'Player'; };
$('btnOnlineBack').onclick = () => { UI.hide('online'); UI.show('menu'); };
$('btnLeave').onclick = toMenu;
function renderLobby() {
  $('lobbyList').innerHTML = G.lobby.map(p => `<li><span>${p.name}${p.isBot ? ' <span class="muted">bot</span>' : ''}</span><span class="muted">${p.host ? 'host' : ''}</span></li>`).join('');
  $('hostControls').classList.toggle('hidden', !G.net?.isHost); $('guestWait').classList.toggle('hidden', !!G.net?.isHost);
}
function onNet(ev) {
  if (ev.type === 'join') { G.lobby.push({ name: ev.name || 'Guest', peerId: ev.id, avatar: ev.avatar || null }); renderLobby(); G.net.broadcast({ t: 'lobby', players: G.lobby, code: G.net.code }); sfx.click(); }
  else if (ev.type === 'leave') {
    if (G.net.isHost) {
      const li = G.lobby.findIndex(p => p.peerId === ev.id); if (li >= 0) G.lobby.splice(li, 1); renderLobby();
      const gp = G.players.find(p => p.peerId === ev.id);
      if (gp && G.phase !== 'menu') { gp.isBot = true; gp.difficulty = 'medium'; gp.peerId = null; UI.toast(`${gp.name} left`, 'a bot takes over', 2500); G.net.broadcast({ t: 'botify', name: gp.name }); if (curP() === gp && G.phase === 'aim') botTurn(gp); }
      else G.net.broadcast({ t: 'lobby', players: G.lobby, code: G.net.code });
    } else { UI.toast('Host disconnected', '', 3000); setTimeout(toMenu, 1500); }
  }
  else if (ev.type === 'msg') {
    const m = ev.data;
    if (m.t === 'lobby') { G.lobby = m.players; $('roomCode').textContent = m.code; renderLobby(); }
    else if (m.t === 'start') { startGame(m.config); }
    else if (m.t === 'throw') { if (G.net.isHost) G.net.broadcast(m, ev.from); G.inbox.push(m); }
    else if (m.t === 'next') advanceHole();
    else if (m.t === 'botify') { const gp = G.players.find(p => p.name === m.name); if (gp) { gp.isBot = true; gp.peerId = null; UI.toast(`${gp.name} left`, 'a bot takes over', 2500); } }
  }
  else if (ev.type === 'error') { console.warn(ev.err); }
}
$('btnCreate').onclick = async () => {
  const name = $('onlineName').value.trim() || 'Host';
  try {
    G.net = createNet(); $('btnCreate').textContent = 'Connecting…';
    const code = await G.net.host(name, onNet);
    G.lobby = [{ name, peerId: G.net.id(), host: true, avatar: { ...G.avatar, name } }]; $('roomCode').textContent = code; renderLobby();
    UI.hide('onlineChoice'); UI.show('lobby');
  } catch (e) { alert('Could not create a room: ' + (e.message || e)); G.net = null; }
  $('btnCreate').textContent = 'Create a room';
};
$('btnJoin').onclick = async () => {
  const name = $('onlineName').value.trim() || 'Guest', code = $('joinCode').value.trim().toUpperCase();
  if (code.length !== 4) return alert('Enter the 4-letter room code');
  try {
    G.net = createNet(); $('btnJoin').textContent = '…';
    await G.net.join(code, name, onNet, { ...G.avatar, name });
    $('roomCode').textContent = code; G.lobby = []; renderLobby(); UI.hide('onlineChoice'); UI.show('lobby');
  } catch (e) { alert('Could not join: ' + (e.message || e)); G.net?.close(); G.net = null; }
  $('btnJoin').textContent = 'Join';
};
$('btnLobbyBot').onclick = () => { if (G.lobby.length < 6) { G.lobby.push({ name: BOT_NAMES[G.lobby.filter(p => p.isBot).length % BOT_NAMES.length], isBot: true }); renderLobby(); G.net.broadcast({ t: 'lobby', players: G.lobby, code: G.net.code }); } };
$('btnLobbyStart').onclick = () => {
  const config = { mode: 'online', courseId: G.courseId, holeCount: +G.settings.holes, players: G.lobby.map((p, i) => ({ name: p.name, isBot: !!p.isBot, difficulty: G.settings.difficulty, peerId: p.peerId || null, avatar: p.avatar || null, color: p.avatar?.jersey || COLORS[i % COLORS.length] })) };
  G.net.broadcast({ t: 'start', config }); startGame(config);
};

// ---------- boot ----------
setupInput({ sceneEl: canvas, padEl: $('pad'), getThrow: () => G.throwType, onAim, onGesture });
setTimeout(async () => {
  await loadManifest();
  await loadCourse(G.courseId);
  makeHero(); updateHub(); updateCamera(10); cam.pos.copy(cam.tPos); cam.look.copy(cam.tLook);
  UI.hide('loading'); loop();
  window.__chains = { G, renderer, scene, camera, course, world, holes, cam, startGame, nextTurn, doThrow, runSim, resolveThrow, setupTurn, loadCourse, makeHero, THREE };  // debug hook (remote devtools)
}, 60);
