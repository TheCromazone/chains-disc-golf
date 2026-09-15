import * as THREE from 'three';
import { buildCourse, makeRng, COURSES, courseById, courseLayout } from './course.js';
import { DISCS, THROWS, discById, launch, step, DT, isDone, resultOf, simulate, speedFor } from './physics.js';
import { createCharacter, DEFAULT_AVATAR, AVATAR_OPTIONS, randomAvatar } from './player.js';
import { loadManifest, asset } from './assets.js';
import { loadModels, modelStatus } from './models.js';
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
try { const saved=JSON.parse(localStorage.getItem('chains.avatar') || '{}');Object.assign(G.avatar,saved);if(saved.glasses==null&&saved.shades)G.avatar.glasses='sport'; G.courseId = localStorage.getItem('chains.course') || 'pine'; } catch { /* private mode */ }
const saveLocal = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* ignore */ } };
const strHash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

// ---------- renderer / scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.2, 1600);
let post = null, resolutionScale = 1, frameAverage = 1/60, frameSamples = 0, lastResolutionChange = 0;
const resize = () => { renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, G.settings.quality === 'low' || isMobile ? 1.5 : 2) * resolutionScale); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 74 : camera.aspect < 1.2 ? 66 : 58; camera.updateProjectionMatrix(); post?.resize(Math.round(innerWidth*renderer.getPixelRatio()),Math.round(innerHeight*renderer.getPixelRatio())); };
addEventListener('resize', resize); resize();

let course, world, holes, effects = null;
const cam = { pos: new THREE.Vector3(0, 10, 30), look: new THREE.Vector3(), tPos: new THREE.Vector3(), tLook: new THREE.Vector3(), mode: 'menu', lastHv: new THREE.Vector3(0, 0, -1) };
const preview = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.7, gapSize: 0.45, transparent: true, opacity: 0.8, depthTest: false }));
preview.frustumCulled = false; preview.renderOrder = 5; preview.visible = false; scene.add(preview);
const circleRing = new THREE.Mesh(new THREE.RingGeometry(9.9, 10.1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
scene.add(circleRing);
// Soft projected contact shadow, only Full draws it.
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;
const shadowInk=shadowCanvas.getContext('2d'), shadowGrad=shadowInk.createRadialGradient(32,32,2,32,32,32);
shadowGrad.addColorStop(0,'rgba(0,0,0,.5)');shadowGrad.addColorStop(1,'rgba(0,0,0,0)');shadowInk.fillStyle=shadowGrad;shadowInk.fillRect(0,0,64,64);
const contactShadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
contactShadow.visible=false;scene.add(contactShadow);

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
  const appearance = avatar ? { ...avatar, jersey: color } : randomAvatar(makeRng(strHash(name) + i * 97), { jersey: color, name });
  const char = createCharacter({ ...appearance, lod: i > 0 });
  scene.add(char.group);
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.27, 0.4, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
  marker.visible = false; scene.add(marker);
  return { name, color, isBot, difficulty, peerId, appearance, lod: i > 0, scores: [], strokes: 0, done: false, lie: [0, 0, 0], lieDist: 0, char, marker, discMesh: null, discId: null };
}
function setPlayerDetail(p, lod) {
  if (p.lod === lod || G.settings.quality === 'low') return;
  const next = createCharacter({ ...p.appearance, lod });
  next.group.position.copy(p.char.group.position); next.group.rotation.copy(p.char.group.rotation);
  scene.remove(p.char.group); p.char.dispose(); p.char = next; p.lod = lod; scene.add(next.group);
}
function ensureDisc(p, discId) {
  if (p.discId === discId && p.discMesh) return;
  if (p.discMesh) { scene.remove(p.discMesh); p.discMesh.userData.dispose?.(); }
  p.discMesh = createDiscMesh(discById(discId)); p.discId = discId; scene.add(p.discMesh);
}
function clearPlayers() { for (const p of G.players) { scene.remove(p.char.group); scene.remove(p.marker); p.marker.geometry.dispose(); p.marker.material.dispose(); if (p.discMesh) { scene.remove(p.discMesh); p.discMesh.userData.dispose?.(); } p.char.dispose(); } G.players = []; }

// ---------- course + hero (menu avatar) ----------
let hero = null;
// A calm creator stage uses the same actor, camera and renderer as the course.
const stageCanvas=document.createElement('canvas');stageCanvas.width=4;stageCanvas.height=256;
const stageInk=stageCanvas.getContext('2d'),stageGradient=stageInk.createLinearGradient(0,0,0,256);
stageGradient.addColorStop(0,'#bcecf3');stageGradient.addColorStop(.6,'#e8faf7');stageGradient.addColorStop(1,'#c9eae4');stageInk.fillStyle=stageGradient;stageInk.fillRect(0,0,4,256);
const stageBackground=new THREE.CanvasTexture(stageCanvas);stageBackground.colorSpace=THREE.SRGBColorSpace;
const stage=new THREE.Group(); scene.add(stage); stage.visible=false;
const podium=new THREE.Mesh(new THREE.CylinderGeometry(.92,1.04,.07,64),new THREE.MeshToonMaterial({color:'#ffffff'}));stage.add(podium);
const podiumRing=new THREE.Mesh(new THREE.TorusGeometry(1.04,.025,8,64).rotateX(Math.PI/2),new THREE.MeshBasicMaterial({color:'#55c5d5'}));podiumRing.position.y=.005;stage.add(podiumRing);
const heroBlob=new THREE.Mesh(new THREE.PlaneGeometry(1.4,1.4).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:contactShadow.material.map,transparent:true,depthWrite:false,opacity:.5}));heroBlob.position.y=.038;stage.add(heroBlob);
const studioFill=new THREE.HemisphereLight('#ffffff','#d0e8df',1.5);scene.add(studioFill);studioFill.visible=false;
let cameraOffset=null;
function frameInterface() {
  const staged=cam.mode==='menu'||cam.mode==='locker';
  stage.visible=staged;studioFill.visible=staged;
  course.group.visible=!staged;if(course.sky)course.sky.visible=!staged;
  scene.background=staged?stageBackground:null;
  if(staged&&hero)stage.position.copy(hero.group.position).add(new THREE.Vector3(0,-.04,0));
  let offset=0;
  if(camera.aspect<1.2){
    const panel=staged?document.querySelector(cam.mode==='locker'?'#locker .panel':'#menu .panel'):document.getElementById('controls');
    const bottom=panel?.getBoundingClientRect().top||innerHeight;
    if(bottom>80&&bottom<innerHeight)offset=(innerHeight-bottom-80)/2;
  }
  const key=`${innerWidth}:${innerHeight}:${offset}`;
  if(cameraOffset!==key){cameraOffset=key;if(offset)camera.setViewOffset(innerWidth,innerHeight,0,offset,innerWidth,innerHeight);else camera.clearViewOffset();}
}
const LAYOUTS = COURSES.map(courseLayout);
function placeHero() {
  const h = holes[0], d = [h.basket[0] - h.tee[0], h.basket[1] - h.tee[1]], L = Math.hypot(d[0], d[1]);
  hero.group.position.set(h.tee[0], h.teeY + 0.07, h.tee[1]); hero.faceDir(d[0] / L, d[1] / L); hero.setPhase(null);
}
function makeHero() { if (hero) { scene.remove(hero.group); hero.hand.children.forEach(o=>o.userData.dispose?.()); hero.dispose(); } hero = createCharacter(G.avatar); scene.add(hero.group); const dm = createDiscMesh(discById('driver')); dm.position.set(0, -0.035, -0.02); dm.rotation.set(0.5, 0, 0); hero.hand.add(dm); placeHero(); }
function updateHub() { const i = COURSES.findIndex(c => c.id === G.courseId); UI.setHub({ name: G.avatar.name, jersey: G.avatar.jersey, course: COURSES[i], holes: LAYOUTS[i], img: asset('courses', G.courseId) }); }
let courseQueue=Promise.resolve();
function loadCourse(id){courseQueue=courseQueue.catch(()=>{}).then(()=>applyCourse(id));return courseQueue;}
async function applyCourse(id) {
  const def = courseById(id); if (course && course.def.id === def.id && course.quality === G.settings.quality) return;
  const first = !course; if (!first) { UI.fade(true); await sleep(340); }
  course?.dispose(); post?.dispose(); post = null;
  // Authored toon palette is the default in both qualities. Legacy effects stay available offline.
  effects = null;
  const hdri = null;
  course = buildCourse(scene, renderer, { course: def, quality: G.settings.quality, effects, hdri });
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
// Everyone who has thrown stands at their own lie while they wait; nobody shares a spot with the thrower.
function parkOthers(idx) {
  const [bx, bz] = basketPos(), taken = [[G.players[idx].lie[0], G.players[idx].lie[2]]];
  G.players.forEach((q, i) => {
    if (i === idx || (q.strokes === 0 && !q.done)) return;   // players still to tee off keep their spot beside the pad
    const d = [bx - q.lie[0], bz - q.lie[2]], L = Math.hypot(d[0], d[1]) || 1; d[0] /= L; d[1] /= L;
    const r = rightOf(d);
    let x = q.lie[0], z = q.lie[2];
    // step out of the thrower's line: anyone standing within 1.6 m of the lie→basket segment moves to its side
    const [ax, az] = taken[0], ex = bx - ax, ez = bz - az, EL = Math.hypot(ex, ez) || 1, rn = rightOf([ex / EL, ez / EL]);
    const along = ((x - ax) * ex + (z - az) * ez) / EL, across = (x - ax) * rn[0] + (z - az) * rn[1];
    if (along > -1 && along < EL + 1.5 && Math.abs(across) < 1.6) { const push = (across < 0 ? -1.8 : 1.8) - across; x += rn[0] * push; z += rn[1] * push; }
    const x0 = x, z0 = z;
    for (let k = 1; k < 8 && taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 1.1); k++) { x = x0 + r[0] * 1.3 * k; z = z0 + r[1] * 1.3 * k; }
    taken.push([x, z]);
    q.char.group.position.set(x, world.height(x, z), z); q.char.faceDir(d[0], d[1]); q.char.setPhase(null);
  });
}
function setupTurn(idx) {
  G.players.forEach((p,i)=>setPlayerDetail(p,i!==idx));
  const p = G.players[idx]; G.cur = idx;
  const lie = p.lie, dist = distToBasket(lie[0], lie[2]);
  G.aim.yaw = Math.atan2(basketPos()[1] - lie[2], basketPos()[0] - lie[0]); G.aim.pitch = 0;
  p.char.group.position.set(lie[0], world.height(lie[0], lie[2]), lie[2]);
  p.char.setPhase(null);
  parkOthers(idx);
  p.marker.position.set(lie[0], world.height(lie[0], lie[2]) + 0.04, lie[2]); p.marker.visible = p.strokes > 0;
  // sensible default club for the distance (players can change it)
  if (dist > 62) { G.throwType = 'backhand'; G.discId = 'driver'; } else if (dist > 34) { G.throwType = 'backhand'; G.discId = 'fairway'; } else if (dist > 15) { G.throwType = 'backhand'; G.discId = 'mid'; } else { G.throwType = 'putt'; G.discId = 'putter'; }
  UI.selectThrow(G.throwType); UI.selectDisc(G.discId); ensureDisc(p, G.discId); p.discMesh.visible = true;
  UI.setHud({ dist, circle: dist <= 10, playerName: p.name, throwNo: p.strokes === 0 ? 'Tee shot' : `Throw ${p.strokes + 1}` });
  updateWindHud();
  UI.setPower(0); G.gesture = { power: 0, lateral: 0 }; G.previewDirty = true;
  G.phase = 'aim'; cam.mode = 'aim'; G.overview = false; $('btnOverview').classList.remove('on'); $('btnOverview').setAttribute('aria-pressed', 'false');
  if (p.isBot) { UI.setControlsEnabled(false); preview.visible = false; if (iControl(p)) botTurn(p); else UI.waiting(`${p.name} is throwing…`); }
  else if (isMine(p)) { UI.setControlsEnabled(true); UI.waiting(null); preview.visible = true; if (G.mode === 'local' && G.players.filter(q => !q.isBot).length > 1) UI.toast(`${p.name}'s throw`, `${Math.round(dist)} m to the basket`, 1600); }
  else { UI.setControlsEnabled(false); preview.visible = false; UI.waiting(`${p.name} is throwing…`); }
}
async function botTurn(p) {
  UI.waiting(`${p.name} is thinking…`);
  await sleep(700); if (curP() !== p || G.phase !== 'aim') return;
  const plan = await planBotThrow({ pos: p.lie, world, difficulty: p.difficulty, lefty: p.appearance?.hand === 'left' });
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
    params = { throwType: G.throwType, discId: G.discId, power: o.power, hyzer: o.hyzer || 0, yawOffset: o.yawOffset || 0, launchOffset: o.launchOffset ?? G.aim.pitch, dir: d, pos, lefty: p.appearance?.hand === 'left' };
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
  const chainAt=f.events.find(e=>e[1]==='chains')?.[0];
  f.playbackRate=chainAt!==undefined && f.t>chainAt-.15 && f.t<chainAt+.40 ? .28 : 1;
  dt*=f.playbackRate; f.t += dt;
  const fi = f.t * 60, i = Math.min(Math.floor(fi), n - 1), a = f.traj[i], b = f.traj[Math.min(i + 1, n - 1)], u = Math.min(1, fi - i);
  const pos = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  const nn = [a[3] + (b[3] - a[3]) * u, a[4] + (b[4] - a[4]) * u, a[5] + (b[5] - a[5]) * u];
  f.spin += f.spinRate * dt; f.spinRate *= (1 - 0.12 * dt);
  setDiscPose(p.discMesh, pos, nn, f.spin * THROWS[f.params.throwType].spin * (f.params.lefty ? -1 : 1));
  f.pos = pos; f.hv = [b[0] - a[0], 0, b[2] - a[2]];
  while (f.ei < f.events.length && f.events[f.ei][0] <= f.t) { onFlightEvent(f.events[f.ei][1]); f.ei++; }
  UI.setHud({ dist: Math.hypot(basketPos()[0] - pos[0], basketPos()[1] - pos[2]) });
  if (i >= n - 1 && f.t > n / 60 + 0.6) { G.flight = null; resolveThrow(f.pi, f.result); }
}
function onFlightEvent(e) {
  if (e === 'chains' || e === 'drop') { sfx[e === 'drop' ? 'drop' : 'chains'](G.flight?.params.power ?? .6); UI.toast('Chains!', 'Right in the heart!', 1600); return; }
  if ((e === 'chainout' || e === 'band' || e === 'rim') && !G.flight?.result.holed && !G.flight?.missReaction) { if(G.flight)G.flight.missReaction=true;sfx.ohh(); }
  const m = { land: () => sfx.thud(), skip: () => sfx.skip(), tree: () => { sfx.tree(); UI.toast('Tree!', '', 900); }, branch: () => { sfx.leaves(); UI.toast('Kicked by a branch', '', 900); }, chains: () => sfx.chains(), drop: () => sfx.drop(), chainout: () => { sfx.chainout(); UI.toast('Chain out!', 'too hard', 1200); }, band: () => { sfx.band(); UI.toast('Off the band', '', 900); }, pole: () => sfx.pole(), rim: () => { sfx.band(); UI.toast('Off the rim', '', 900); }, splash: () => sfx.splash(), roll: () => sfx.roll(), flop: () => sfx.thud(0.5), ob: () => sfx.bad() };
  m[e]?.();
}
function resolveThrow(pi, r) {
  const p = G.players[pi], h = holes[G.holeIdx];
  p.strokes++;
  let title, sub;
  if (r.holed) {
    p.done = true; p.scores[G.holeIdx] = p.strokes;
    p.char.react?.(p.strokes<h.par?'celebrate':p.strokes>h.par?'slump':'idle_weight');
    title = UI.scoreName(p.strokes, h.par); sub = `${p.name} · ${p.strokes} throw${p.strokes > 1 ? 's' : ''}`;
    sfx.fanfare(p.strokes === 1 ? 'ace' : p.strokes - h.par <= -2 ? 'eagle' : p.strokes - h.par === -1 ? 'birdie' : 'par');
    sfx.applause();
  } else if (r.ob) { p.strokes++; p.lie = r.lie; title = 'Out of bounds'; sub = '+1 penalty · play from where it went out'; }
  else { p.lie = r.rest; title = r.thrown < 1 ? 'Dropped it' : `${Math.round(r.thrown)} m`; sub = `${r.dist.toFixed(r.dist < 20 ? 1 : 0)} m to the basket`; }
  if (!r.holed && !r.ob && r.thrown > 8 && r.dist < Math.max(8, p.lieDist * .35)) { title = 'Nice shot!'; sfx.applause(); }
  if (!p.done && p.strokes >= h.par + 5) { p.done = true; p.scores[G.holeIdx] = p.strokes + 1; title = 'Picked up'; sub = 'max score for the hole'; }
  p.lieDist = distToBasket(p.lie[0], p.lie[2]);
  p.marker.position.set(p.lie[0], world.height(p.lie[0], p.lie[2]) + 0.04, p.lie[2]); p.marker.visible = !p.done;
  if (p.done) setTimeout(() => { if (p.done) p.discMesh.visible = false; }, 2500);
  UI.toast(title, sub, 2000); UI.setHud({ dist: p.lieDist });
  G.phase = 'result'; cam.mode = 'result';
  updateCamera(10); // Cut to the reaction so a short celebration never starts offscreen.
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
  const o = { throwType: G.throwType, discId: G.discId, disc: discById(G.discId), power, hyzer: 0, lefty: p.appearance?.hand === 'left', yawOffset: 0, launchOffset: G.aim.pitch, dir: aimDir(), pos: [p.lie[0] + aimDir()[0] * 0.4, world.height(p.lie[0], p.lie[2]) + 1.15, p.lie[2] + aimDir()[1] * 0.4] };
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
  if (document.body.dataset.phase !== G.phase) document.body.dataset.phase = G.phase;
  frameInterface();
  const h = holes[G.holeIdx] || holes[0];
  let k = 5;
  if (cam.mode === 'menu' || cam.mode === 'locker') {   // hero shot of the avatar on tee 1, slow sway
    const h0 = holes[0], t = performance.now() / 1000, d = [h0.basket[0] - h0.tee[0], h0.basket[1] - h0.tee[1]], L = Math.hypot(d[0], d[1]); d[0] /= L; d[1] /= L;
    const r = rightOf(d), p = hero.group.position, wide = camera.aspect > 1.2, locker = cam.mode === 'locker';
    const faceEdit=locker && document.querySelector('.locker-tabs [aria-selected="true"]')?.dataset.category==='face';
    const ang = Math.sin(t * 0.18) * 0.04 + (locker ? -.10 : -.26), dist = faceEdit ? 1.85 : 3.25;
    const fx = d[0] * Math.cos(ang) + r[0] * Math.sin(ang), fz = d[1] * Math.cos(ang) + r[1] * Math.sin(ang);   // direction from hero to camera, swept around his front
    const side = wide ? 1.25 : 0;   // desktop: menu panel sits on the left, so frame the hero right of centre
    cam.tPos.set(p.x + fx * dist + r[0] * side, p.y + (faceEdit ? 1.42 : 1.35), p.z + fz * dist + r[1] * side);
    cam.tLook.set(p.x + r[0] * side, p.y + (faceEdit ? 1.38 : .86), p.z + r[1] * side); k = 4;
  } else if (cam.mode === 'courses') {   // slow flyover of the whole course
    const t = performance.now() / 1000 * 0.06, cx = holes.reduce((a, h) => a + h.basket[0], 0) / holes.length, cz = holes.reduce((a, h) => a + h.basket[1], 0) / holes.length;
    cam.tPos.set(cx + Math.cos(t) * 170, world.height(cx, cz) + 95, cz + Math.sin(t) * 170); cam.tLook.set(cx, world.height(cx, cz), cz); k = 1.5;
  } else if (cam.mode === 'intro') {
    const d = [h.basket[0] - h.tee[0], h.basket[1] - h.tee[1]], L = Math.hypot(d[0], d[1]); d[0] /= L; d[1] /= L;
    const orbit=Math.min(1,G.introT/1.25), u=ease(Math.max(0,Math.min(1,(G.introT-1.25)/3.35)));
    const r=rightOf(d), angle=-.75+orbit*.9;
    const start=new THREE.Vector3(h.basket[0]+d[0]*Math.cos(angle)*7+r[0]*Math.sin(angle)*7,h.basketY+3.1,h.basket[1]+d[1]*Math.cos(angle)*7+r[1]*Math.sin(angle)*7);
    const end=new THREE.Vector3(h.tee[0]-d[0]*5.6,h.teeY+2.3,h.tee[1]-d[1]*5.6);
    cam.pos.lerpVectors(start,end,u); cam.pos.y+=Math.sin(u*Math.PI)*Math.min(14,L*.13);
    cam.pos.y=Math.max(cam.pos.y,world.height(cam.pos.x,cam.pos.z)+1.6);
    _v.set(h.basket[0],h.basketY+1.0,h.basket[1]);
    _v2.set(h.tee[0]+d[0]*16,h.teeY+.5,h.tee[1]+d[1]*16);
    cam.look.lerpVectors(_v,_v2,u);
    camera.position.copy(cam.pos); camera.lookAt(cam.look); return;
  } else if (cam.mode === 'aim' || (cam.mode === 'result' && !G.flight)) {
    const p = curP(); if (!p) return;
    const d = aimDir(), r = rightOf(d), lie = p.char.group.position;
    if (G.overview && cam.mode !== 'result') {
      const dist = Math.max(20, distToBasket(lie.x, lie.z));
      const mx = (lie.x + basketPos()[0]) / 2, mz = (lie.z + basketPos()[1]) / 2;
      cam.tPos.set(mx - d[0] * dist * 0.22, world.height(mx, mz) + Math.max(45, dist * 0.95), mz - d[1] * dist * 0.22); cam.tLook.set(mx, world.height(mx, mz), mz); k = 4;
    } else if (cam.mode === 'result') {
      const r=rightOf(d);cam.tPos.set(lie.x+d[0]*3.8+r[0]*.7,lie.y+1.45,lie.z+d[1]*3.8+r[1]*.7);
      cam.tLook.set(lie.x,lie.y+.92,lie.z); k=5;
    }
    else {
      const pitchLift = G.aim.pitch * 0.06;
      const back = camera.aspect < 0.8 ? 5.6 : 4.8;
      const portrait = camera.aspect < 1.2, ahead = portrait ? 10 : 16;
      cam.tPos.set(lie.x - d[0] * back + r[0] * 0.75, lie.y + (portrait ? 3.1 : 2.3) + pitchLift, lie.z - d[1] * back + r[1] * 0.75);
      cam.tLook.set(lie.x + d[0] * ahead, lie.y + (portrait ? -.3 : .4) + G.aim.pitch * .35, lie.z + d[1] * ahead);
    }
  } else if (cam.mode === 'flight' || cam.mode === 'result') {
    const f = G.flight;
    if (f && f.pos) {
      _v3.set(f.hv[0], 0, f.hv[2]); if (_v3.lengthSq() > 1e-6) cam.lastHv.copy(_v3.normalize());
      const hv = cam.lastHv, sp = Math.hypot(f.hv[0], f.hv[2]) * 60;
      const back = f.playbackRate<1 ? 2.1 : 5.5 + Math.min(4, sp * 0.12);
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
// Open the game with ?fps=1 on a phone to read the real frame rate; the only way to certify the mobile targets.
const fpsTag = new URLSearchParams(location.search).has('fps') ? document.body.appendChild(Object.assign(document.createElement('div'), { style: 'position:fixed;left:8px;bottom:8px;z-index:99;padding:4px 8px;border-radius:8px;background:rgba(0,0,0,.6);color:#fff;font:600 12px/1.4 system-ui;pointer-events:none' })) : null;
let fpsNext = 0;
function loop() {
  requestAnimationFrame(loop);
  const rawDt=clock.getDelta(), dt = Math.min(G.maxDt || 0.05, rawDt); time += dt;
  // Ignore background/paused frames; resolution changes never alter simulation time.
  if(fpsTag&&performance.now()>fpsNext){fpsNext=performance.now()+500;fpsTag.textContent=`${Math.round(1/frameAverage)} fps · ${G.settings.quality==='low'?'Lite':'Full'} · ${Math.round(renderer.getPixelRatio()*100)/100}x · ${innerWidth}×${innerHeight}`;}
  if(!document.hidden && rawDt>.004 && rawDt<.1){frameAverage=frameAverage*.96+rawDt*.04;frameSamples++;
    if(frameSamples>90 && time-lastResolutionChange>2){const budget=1/(G.settings.quality==='low'?60:45);const old=resolutionScale;
      if(frameAverage>budget*1.15)resolutionScale=Math.max(.65,resolutionScale-.08);
      else if(frameAverage<budget*.82)resolutionScale=Math.min(1,resolutionScale+.04);
      if(old!==resolutionScale){resize();lastResolutionChange=time;}
    }
  }
  if (!course) return;
  if (G.phase === 'intro') { G.introT += dt; if (G.introT > 4.7 || G.inbox.length) nextTurn(); }
  if (G.inbox.length && G.phase === 'aim' && G.mode === 'online') applyRemoteThrow(G.inbox.shift());
  if (G.tween) { const tw = G.tween; tw.t += dt; const u = Math.min(1, tw.t / tw.dur); tw.fn(u * u * (3 - 2 * u)); if (u >= 1) { G.tween = null; tw.done?.(); } }
  if (G.pending && (G.phase === 'release' || G.phase === 'flight' || G.phase === 'result')) {
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
  course.update(dt, time, focus, camera.position);
  contactShadow.visible=!!G.flight?.pos;
  if(contactShadow.visible){const a=G.flight.pos,y=world.height(a[0],a[2]),h=Math.max(0,a[1]-y);contactShadow.position.set(a[0],y+.025,a[2]);contactShadow.scale.setScalar(.35+h*.07);contactShadow.material.opacity=Math.max(.05,.7-h*.06);}
  if(post) post.render(); else renderer.render(scene, camera);
}

// ---------- HUD / menu wiring ----------
function pickThrow(id) { if (G.phase !== 'aim') return; G.throwType = id; UI.selectThrow(id); if (id === 'putt') { G.discId = 'putter'; UI.selectDisc('putter'); ensureDisc(curP(), 'putter'); curP().discMesh.visible = true; } G.previewDirty = true; sfx.click(); }
function pickDisc(id) { if (G.phase !== 'aim') return; G.discId = id; UI.selectDisc(id); ensureDisc(curP(), id); curP().discMesh.visible = true; G.previewDirty = true; sfx.click(); }
UI.buildThrowButtons(pickThrow); UI.buildDiscChips(pickDisc);
$('btnTarget').onclick = () => { if (G.phase === 'aim') { const l = curP().lie; G.aim.yaw = Math.atan2(basketPos()[1] - l[2], basketPos()[0] - l[0]); G.aim.pitch = 0; G.previewDirty = true; sfx.click(); } };
$('btnOverview').onclick = () => { if (G.phase !== 'aim') return; G.overview = !G.overview; $('btnOverview').classList.toggle('on', G.overview); $('btnOverview').setAttribute('aria-pressed', String(G.overview)); sfx.click(); };
$('btnMute').onclick = () => { setMuted(!isMuted()); UI.setSoundMuted(isMuted()); };
$('btnMenu').onclick = async () => { if (await UI.confirmLeave()) toMenu(); };
$('btnHelp').onclick = () => { UI.hide('menu'); UI.show('help'); }; $('btnHelpClose').onclick = () => { UI.hide('help'); UI.show('menu'); };
$('btnScoreNext').onclick = () => { netSend({ t: 'next' }); advanceHole(); };
$('btnScoreMenu').onclick = toMenu;
UI.seg('holesSeg', v => G.settings.holes = v); UI.seg('diffSeg', v => G.settings.difficulty = v);
$('qualSeg').querySelector(`[data-v="${G.settings.quality}"]`)?.classList.add('on'); $('qualSeg').querySelector(`[data-v="${G.settings.quality === 'low' ? 'high' : 'low'}"]`)?.classList.remove('on');
UI.seg('qualSeg', async v => { G.settings.quality = v; resize(); await loadModels(renderer, v); await loadCourse(G.courseId); makeHero(); });
document.addEventListener('pointerdown', unlock, { once: true, capture: true });

const me = () => ({ name: G.avatar.name.trim() || 'You', avatar: G.avatar });
$('btnSolo').onclick = () => startGame({ mode: 'solo', holeCount: +G.settings.holes, players: [me(), { name: BOT_NAMES[0], isBot: true, difficulty: G.settings.difficulty }, { name: BOT_NAMES[1], isBot: true, difficulty: G.settings.difficulty }] });

// courses + locker room
$('btnCourses').onclick = () => { UI.hide('menu'); UI.show('courses'); cam.mode = 'courses'; sfx.click(); UI.renderCourseCards(COURSES, LAYOUTS, G.courseId, async id => { sfx.click(); UI.hide('courses'); UI.show('menu'); cam.mode = 'menu'; await loadCourse(id); }, id => asset('courses', id)); };
$('btnCoursesBack').onclick = () => { UI.hide('courses'); UI.show('menu'); cam.mode = 'menu'; };
let heroTimer = null;
const onAvatarChange = (k, v) => { G.avatar[k] = v; saveLocal('chains.avatar', G.avatar); updateHub(); if (k === 'name') return; if (['eyes','brows','nose','mouth','glasses','shades'].includes(k)) { hero?.setFace?.(G.avatar); return; } clearTimeout(heroTimer); heroTimer = setTimeout(makeHero, 120); };
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
  UI.onlineError(); UI.setConnecting('btnCreate', true);
  try {
    G.net = createNet();
    const code = await G.net.host(name, onNet);
    G.lobby = [{ name, peerId: G.net.id(), host: true, avatar: { ...G.avatar, name } }]; $('roomCode').textContent = code; renderLobby();
    UI.hide('onlineChoice'); UI.show('lobby');
  } catch (e) { UI.onlineError('Could not create a room: ' + (e.message || e)); G.net = null; }
  UI.setConnecting('btnCreate', false);
};
$('btnJoin').onclick = async () => {
  const name = $('onlineName').value.trim() || 'Guest', code = $('joinCode').value.trim().toUpperCase();
  UI.onlineError();
  if (code.length !== 4) { UI.onlineError('Enter the four-letter room code to join your friends.'); $('joinCode').focus(); return; }
  UI.setConnecting('btnJoin', true);
  try {
    G.net = createNet();
    await G.net.join(code, name, onNet, { ...G.avatar, name });
    $('roomCode').textContent = code; G.lobby = []; renderLobby(); UI.hide('onlineChoice'); UI.show('lobby');
  } catch (e) { UI.onlineError('Could not join: ' + (e.message || e)); G.net?.close(); G.net = null; }
  UI.setConnecting('btnJoin', false);
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
  await loadModels(renderer, G.settings.quality);
  await loadCourse(G.courseId);
  makeHero(); updateHub(); updateCamera(10); cam.pos.copy(cam.tPos); cam.look.copy(cam.tLook);
  UI.hide('loading'); loop();
  window.__chains = { G, renderer, scene, camera, course, world, holes, cam, renderFrame: () => post ? post.render() : renderer.render(scene,camera), startGame, nextTurn, doThrow, runSim, resolveThrow, setupTurn, loadCourse, makeHero, THREE };  // debug hook (remote devtools)
}, 60);
