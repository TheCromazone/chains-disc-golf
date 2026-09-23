import * as THREE from 'three';
import { buildCourse, makeRng, COURSES, courseById, courseLayout } from './course.js';
import { DISCS, THROWS, discById, launch, step, DT, isDone, resultOf, simulate, speedFor } from './physics.js';
import { createCharacter, DEFAULT_AVATAR, AVATAR_OPTIONS, randomAvatar } from './player.js';
import { loadManifest, asset } from './assets.js';
import { loadModels, modelStatus } from './models.js';
import { createDiscMesh, setDiscPose } from './disc.js';
import { createPuffs } from './puffs.js';
import { createWindFx } from './wind.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
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
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .74;   // sunlit turf lands mid-high and shade keeps a real dark; ACES rolls the sun's haze and aureole off instead of clipping them
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;   // 17-tap PCF honours shadow.radius: a visible penumbra under the canopies (PCFSoft ignores it)
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.2, 1600);
let post = null, resolutionScale = 1, frameAverage = 1/60, frameSamples = 0, lastResolutionChange = 0;
const lineMats = [];   // screen-space line materials that need the framebuffer size
const resize = () => { renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, G.settings.quality === 'low' || isMobile ? 1.5 : 2) * resolutionScale); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 74 : camera.aspect < 1.2 ? 66 : 58; camera.updateProjectionMatrix(); post?.resize(Math.round(innerWidth*renderer.getPixelRatio()),Math.round(innerHeight*renderer.getPixelRatio())); for (const m of lineMats) m.resolution.set(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio()); };
addEventListener('resize', resize); resize();

let course, world, holes, effects = null;
const cam = { pos: new THREE.Vector3(0, 10, 30), look: new THREE.Vector3(), tPos: new THREE.Vector3(), tLook: new THREE.Vector3(), mode: 'menu', lastHv: new THREE.Vector3(0, 0, -1), fov: 58 };
// Flight preview: a screen-space dashed ribbon (readable at any pixel ratio) over a dark outline, and a ground
// arrow at the lie that turns with the aim. The dashes flow toward the basket so the direction reads at a glance.
const previewMat = new LineMaterial({ color: 0xffffff, linewidth: 3.2, dashed: true, dashSize: .7, gapSize: .38, transparent: true, opacity: .96, depthTest: false, depthWrite: false });
const previewEdge = new LineMaterial({ color: 0x06140c, linewidth: 6.4, dashed: true, dashSize: .7, gapSize: .38, transparent: true, opacity: .42, depthTest: false, depthWrite: false });
const preview = new THREE.Group(); preview.visible = false; scene.add(preview); lineMats.push(previewMat, previewEdge); resize();
const previewLines = [previewEdge, previewMat].map((m, i) => { const l = new Line2(new LineGeometry(), m); l.frustumCulled = false; l.renderOrder = 5 + i; preview.add(l); return l; });
const aimArrow = (() => {
  const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(.34, -.42); shape.lineTo(.12, -.36); shape.lineTo(.12, -1.15); shape.lineTo(-.12, -1.15); shape.lineTo(-.12, -.36); shape.lineTo(-.34, -.42); shape.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .82, depthTest: false, depthWrite: false }));
  m.renderOrder = 4; m.frustumCulled = false; preview.add(m); return m;
})();
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
const buzz = pattern => { try { navigator.vibrate?.(pattern); } catch { /* no haptics */ } };   // Android only; iOS Safari ignores it

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
let hero = null, windFx = null;
const puffs = createPuffs(scene);
// A calm creator stage uses the same actor, camera and renderer as the course.
const stageCanvas=document.createElement('canvas');stageCanvas.width=4;stageCanvas.height=256;
const stageInk=stageCanvas.getContext('2d'),stageGradient=stageInk.createLinearGradient(0,0,0,256);
stageGradient.addColorStop(0,'#8fd3e6');stageGradient.addColorStop(.6,'#cfeef0');stageGradient.addColorStop(1,'#a9d6d2');stageInk.fillStyle=stageGradient;stageInk.fillRect(0,0,4,256);
const stageBackground=new THREE.CanvasTexture(stageCanvas);stageBackground.colorSpace=THREE.SRGBColorSpace;
const stage=new THREE.Group(); scene.add(stage); stage.visible=false;
const podium=new THREE.Mesh(new THREE.CylinderGeometry(.92,1.04,.07,64),new THREE.MeshStandardMaterial({color:'#e9eef0',roughness:.45}));stage.add(podium);
const podiumRing=new THREE.Mesh(new THREE.TorusGeometry(1.04,.025,8,64).rotateX(Math.PI/2),new THREE.MeshBasicMaterial({color:'#55c5d5'}));podiumRing.position.y=.005;stage.add(podiumRing);
const heroBlob=new THREE.Mesh(new THREE.PlaneGeometry(1.4,1.4).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:contactShadow.material.map,transparent:true,depthWrite:false,opacity:.5}));heroBlob.position.y=.038;stage.add(heroBlob);
const studioFill=new THREE.HemisphereLight('#ffffff','#d0e8df',.9);scene.add(studioFill);studioFill.visible=false;
let cameraOffset=null,panelOffset=0;
function frameInterface() {
  const staged=cam.mode==='locker';   // the locker keeps its calm creator stage; the clubhouse hero stands on a real green
  stage.visible=staged;studioFill.visible=staged;
  course.group.visible=!staged;if(course.sky)course.sky.visible=!staged;
  scene.background=staged?stageBackground:null;
  if(staged&&hero)stage.position.copy(hero.group.position).add(new THREE.Vector3(0,-.04,0));
  menuBlob.visible=cam.mode==='menu'&&!!hero?.group.visible;
  heroKick.value.w=cam.mode==='menu'?MENU.kick:0;scrim.visible=menuBlob.visible&&camera.aspect>1.2;   // portrait sees the ground where the sheet stands
  panelOffset=0;
  if(camera.aspect<1.2){
    const panel=document.querySelector(staged?'#locker .panel':cam.mode==='menu'?'#menu .panel':'#controls');   // portrait: centre the shot in the view above the panel
    const bottom=panel?.getBoundingClientRect().top||innerHeight;
    if(bottom>80&&bottom<innerHeight)panelOffset=(innerHeight-bottom-80)/2;
  }
}
function applyViewOffset() {   // the portrait panel's offset plus the putt's lens shift (cam.shift, half-frames), once the pose is final
  const offset=Math.round((panelOffset+cam.shift*innerHeight/2)*2)/2,key=`${innerWidth}:${innerHeight}:${offset}`;
  if(cameraOffset!==key){cameraOffset=key;if(offset)camera.setViewOffset(innerWidth,innerHeight,0,offset,innerWidth,innerHeight);else camera.clearViewOffset();}
}
const LAYOUTS = COURSES.map(courseLayout);
// Clubhouse stage (the DGM title screen): the athlete on the approach to a green, its basket a few metres behind his
// off-shoulder and the woods past it closing the top of the frame. Trees inside ~25 m keep 95% of their contrast
// through the haze, so staging close is what clears the fog. Of the greens whose approach runs away from the sun (the
// low key then lights his face and the woods instead of haloing him) the one with the most trees past it wins.
const MENU = { short: 5, lat: 1.25, face: .2, kick: 40, haze: 1.6, wide: { back: 3.3, up: 1.3, aim: 1.37, x: .5, fov: 23 }, portrait: { back: 3.2, up: 1.2, aim: 1.2, x: .6, fov: 50 } };
const menuStage = { d: [0, 1], r: [-1, 0] };
// Contact shade under the clubhouse hero: the key light sits behind the lens, so his own shadow falls out of sight behind him.
const blobCanvas = document.createElement('canvas'); blobCanvas.width = blobCanvas.height = 64; const blobInk = blobCanvas.getContext('2d'), blobGrad = blobInk.createRadialGradient(32, 32, 0, 32, 32, 32);
blobGrad.addColorStop(0, 'rgba(0,0,0,.72)'); blobGrad.addColorStop(.38, 'rgba(0,0,0,.42)'); blobGrad.addColorStop(1, 'rgba(0,0,0,0)'); blobInk.fillStyle = blobGrad; blobInk.fillRect(0, 0, 64, 64);
const menuBlob = new THREE.Mesh(heroBlob.geometry, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blobCanvas), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); menuBlob.scale.setScalar(.62); menuBlob.visible = false; scene.add(menuBlob);
// Key art: a kicker raking the hero's far edge and a sheet of haze standing just behind him, so he poses in front of the woods
// instead of being pasted on them. The kicker is patched into the hero's own materials (a scene light would recompile every
// course material on the way in and out of the clubhouse); the haze is depth tested, so it veils only what stands behind him.
// Both are off outside the clubhouse, where the hero is hidden anyway.
const heroKick = { value: new THREE.Vector4(1, .84, .64, 0) }, heroKickDir = { value: new THREE.Vector3(.8, .25, -.55).normalize() };   // view space: from behind him, high on the frame's right; the strength is grazing-weighted in the shader
function kickLight(root) {
  root.traverse(o => { for (const m of [].concat(o.material || [])) {
    if (!m.isMeshStandardMaterial || m.userData.kick) continue;
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey; m.userData.kick = true;
    m.onBeforeCompile = (s, r) => { prev.call(m, s, r); Object.assign(s.uniforms, { heroKick, heroKickDir });
      s.fragmentShader = 'uniform vec4 heroKick; uniform vec3 heroKickDir;\n' + s.fragmentShader.replace('#include <lights_fragment_end>', '{ IncidentLight kick = IncidentLight(heroKick.rgb * heroKick.a * pow(1. - saturate(dot(geometryNormal, geometryViewDir)), 2.5), heroKickDir, true); RE_Direct(kick, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight); }\n#include <lights_fragment_end>'); };
    m.customProgramCacheKey = () => prevKey.call(m) + '|kick'; m.needsUpdate = true;
  } });
}
const hazeMat = new THREE.MeshBasicMaterial({ color: '#c3d5d4', transparent: true, opacity: .28, depthWrite: false, fog: false }), scrim = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), hazeMat); scrim.visible = false; scene.add(scrim);
// Full: the sheet shows the woods themselves, defocused: a quarter-res snapshot of this frame with the hero hidden (no shadow
// pass), read through a 12-tap golden-angle disc between its first two mips, the cheap shallow depth of field of a long lens:
// soft enough to sit behind him, sharp enough that the basket and banners still read (a heavier blur read as a smeared photo).
// Lite keeps the plain haze.
const backdrop = { rt: null, mat: new THREE.ShaderMaterial({ uniforms: { map: { value: null }, texel: { value: new THREE.Vector2() }, blur: { value: .8 }, lod: { value: .7 } }, transparent: true, depthWrite: false,
  vertexShader: 'varying vec4 vClip; void main() { gl_Position = vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `uniform sampler2D map; uniform vec2 texel; uniform float blur, lod; varying vec4 vClip;
    void main() { vec2 uv = vClip.xy / vClip.w * .5 + .5; vec3 c = vec3(0.);
      for (int i = 0; i < 12; i++) { float r = sqrt((float(i) + .5) / 12.) * blur, a = float(i) * 2.39996; c += textureLod(map, uv + vec2(cos(a), sin(a)) * r * texel, lod).rgb; }
      gl_FragColor = vec4(c / 12., 1.); }` }) };   // the blur's radius is in snapshot texels (4 px each)
function snapBackdrop() {
  const s = renderer.getDrawingBufferSize(new THREE.Vector2()), w = Math.max(32, s.x >> 2), h = Math.max(18, s.y >> 2);
  if (!backdrop.rt) backdrop.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });   // linear HDR, like the scene pass it lands in; MSAA so chains and twigs don't alias into blocks
  else if (backdrop.rt.width !== w || backdrop.rt.height !== h) backdrop.rt.setSize(w, h);
  backdrop.mat.uniforms.map.value = backdrop.rt.texture; backdrop.mat.uniforms.texel.value.set(1 / w, 1 / h);
  const shown = [hero.group, heroDisc, scrim, menuBlob].map(o => [o, o.visible]), auto = renderer.shadowMap.autoUpdate;
  for (const [o] of shown) o.visible = false; renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(backdrop.rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
  for (const [o, v] of shown) o.visible = v; renderer.shadowMap.autoUpdate = auto;
}
function placeHero() {
  hero.setPhase(null);
  if (cam.mode === 'locker') { const h = holes[0], d = [h.basket[0] - h.tee[0], h.basket[1] - h.tee[1]], L = Math.hypot(d[0], d[1]); hero.group.position.set(h.tee[0], h.teeY + 0.07, h.tee[1]); hero.faceDir(d[0] / L, d[1] / L); }   // locker: on the pad, down the fairway
  else stageClubhouse();
  if (G.phase === 'menu') updateCamera(10);   // the locker pad and the clubhouse green are ~200 m apart: cut between them, don't fly
}
function stageClubhouse() {
  const sun = course.sunDir, S = MENU; let best = null;
  for (const h of holes) for (const turn of [-.5, -.25, 0, .25, .5]) {   // the approach line, or swung round the basket to find level ground
    const a = h.way[h.way.length - 2], D = [h.basket[0] - a[0], h.basket[1] - a[1]], L = Math.hypot(D[0], D[1]), c = Math.cos(turn) / L, s = Math.sin(turn) / L;
    const d = [D[0] * c - D[1] * s, D[0] * s + D[1] * c], r = rightOf(d), x = h.basket[0] - d[0] * S.short + r[0] * S.lat, z = h.basket[1] - d[1] * S.short + r[1] * S.lat, cx = x - d[0] * S.wide.back, cz = z - d[1] * S.wide.back;
    const bx = h.basket[0] + d[0] * 12, bz = h.basket[1] + d[1] * 12, woods = world.treesNear(bx, bz).reduce((n, t) => n + Math.max(0, 1 - Math.hypot(t.x - bx, t.z - bz) / 12), 0);
    const score = (d[0] * sun.x + d[1] * sun.z < -.3 ? 100 : 0) + woods - Math.abs(world.height(cx, cz) - world.height(x, z)) * 3 - (world.inWater(x, z) || world.inWater(cx, cz) ? 1e3 : 0);   // dry feet, then the sun at the lens's back, then close woods on level ground
    if (!best || score > best.score) best = { score, d, r, x, z };
  }
  const { d, r, x, z } = best; menuStage.d = d; menuStage.r = r;
  const y = world.height(x, z), a = Math.PI + S.face;   // square to the lens (eye contact, like a title screen), a touch toward the panel
  hero.group.position.set(x, y, z);
  hero.faceDir(d[0] * Math.cos(a) + r[0] * Math.sin(a), d[1] * Math.cos(a) + r[1] * Math.sin(a));   // once: steering faceDir every frame reads as aiming and coils the stance
  const n = world.normal(x, z); menuBlob.position.set(x, y + .03, z); menuBlob.quaternion.setFromUnitVectors(UP, _v.set(n[0], n[1], n[2]));
}
let heroDisc = null;
function makeHero() { if (hero) { scene.remove(hero.group); hero.dispose(); } if (heroDisc) { scene.remove(heroDisc); heroDisc.userData.dispose?.(); } hero = createCharacter(G.avatar); kickLight(hero.group); scene.add(hero.group); heroDisc = createDiscMesh(discById('driver')); scene.add(heroDisc); placeHero(); }
// Disc in the hand. Idle: carried by the rim at the thigh, plate hanging beside the leg. Throwing: gripped so the
// plate rides the wrist through the windup and is exactly level with the planned release normal at phase .62.
const _qh = new THREE.Quaternion(), _qg = new THREE.Quaternion(), _off = new THREE.Vector3(), _nrm = new THREE.Vector3(), _gp = new THREE.Vector3(), _gn = new THREE.Vector3();
const CARRY_N = new THREE.Vector3(0, .35, -1).normalize(), CARRY_OFF = new THREE.Vector3(0, -.095, -.02);
function holdDisc(char, mesh, n, spin, throwType) {
  char.hand.getWorldPosition(_v); char.hand.getWorldQuaternion(_qh); if (!throwType) char.carry?.();   // a disc on show outside a throw: the cover-shot pose, not a bystander's idle
  const rel = throwType && char.getPhase() !== null ? char.releaseFrame?.(throwType) : null;
  if (rel) {
    _qg.copy(char.group.quaternion).invert();
    _nrm.set(n[0], n[1], n[2]).applyQuaternion(_qg).applyQuaternion(rel.qInv).applyQuaternion(_qh);
    _off.copy(rel.dir).multiplyScalar(.075).y -= .015; _off.applyQuaternion(rel.qInv).applyQuaternion(_qh);
  } else if (char.heroWeight > .5) { char.group.getWorldDirection(_nrm).multiplyScalar(-.3); _nrm.x += Math.sin(spin * 3) * .06; _nrm.z += Math.cos(spin * 3) * .06; _nrm.y = 1; _off.set(0, -.08, 0).applyQuaternion(_qh); spin *= 40; }   // cover shot: spun like a trick on the raised hand, face tipped a little to the lens
  else { _nrm.copy(CARRY_N).applyQuaternion(_qh); _off.copy(CARRY_OFF).applyQuaternion(_qh); spin = 0; }
  _v.add(_off);
  // backhand set-up: the rim seated in the gripping hand, handed over to the release frame through the windup (level at .62)
  const w = rel ? char.gripPose?.(_gp, _gn) || 0 : 0;
  if (w > 0) { _v.lerp(_gp, w); _nrm.normalize().lerp(_gn, w); spin *= 1 - w; }
  setDiscPose(mesh, [_v.x, _v.y, _v.z], [_nrm.x, _nrm.y, _nrm.z], spin);
}
function updateHub() { const i = COURSES.findIndex(c => c.id === G.courseId); UI.setHub({ name: G.avatar.name, jersey: G.avatar.jersey, course: COURSES[i], holes: LAYOUTS[i], img: asset('courses', G.courseId) }); }
let courseQueue=Promise.resolve();
function loadCourse(id){courseQueue=courseQueue.catch(()=>{}).then(()=>applyCourse(id));return courseQueue;}
async function applyCourse(id) {
  const def = courseById(id); if (course && course.def.id === def.id && course.quality === G.settings.quality) return;
  const first = !course; if (!first) { UI.fade(true); await sleep(340); }
  course?.dispose(); post?.dispose(); post = null;
  // Full: HDRI ambient, reflective water and a bloom + grade pass. Lite: same textures, no render targets.
  effects = G.settings.quality === 'high' ? await import('./effects.js') : null;
  const hdri = effects ? await effects.loadSky(renderer, asset('skies', def.id) || asset('skies', 'lake')) : null;
  course = buildCourse(scene, renderer, { course: def, quality: G.settings.quality, effects, hdri });
  if (effects) { post = effects.postprocessing(renderer, scene, camera, { photographic: true }); resize(); }
  windFx?.dispose(); windFx = createWindFx(scene, course.holes, course.world.height);
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
  UI.setHud({ hole: G.holeIdx + 1, par: h.par, len: h.len, dist: h.len, throwNo: 'Tee', playerName: '' });
  UI.setControlsEnabled(false); UI.waiting(null); preview.visible = false;
  G.phase = 'intro'; G.introT = 0; G.aim.pitch = 0; cam.mode = 'intro'; G.overview = false;   // pitch reset: the intro lands on the tee's aim frame
  // Broadcast-style title over the flyover (the HUD is hidden while data-phase is 'intro'; set it now so the HUD never flashes).
  const title = $('holeTitle'); if (title) { title.firstElementChild.textContent = `Hole ${G.holeIdx + 1}`; title.lastElementChild.textContent = `Par ${h.par} · ${Math.round(h.len)} m`; }
  document.body.dataset.phase = 'intro';
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
  UI.setHud({ dist, circle: dist <= 10, playerName: p.name, throwNo: p.strokes === 0 ? 'Tee shot' : `Throw ${p.strokes + 1}`, elev: holes[G.holeIdx].basketY - lie[1], toPar: p.scores.reduce((s, v, i) => v == null ? s : s + v - holes[i].par, 0) });
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
    if (i++ % 4 === 0) traj.push([rnd(s.p[0]), rnd(s.p[1]), rnd(s.p[2]), rnd(s.n[0]), rnd(s.n[1]), rnd(s.n[2]), rnd(s.spinRate)]);
    for (; le < s.events.length; le++) events.push([rnd(s.t), s.events[le]]);
  }
  if (!isDone(s)) s.mode = 'rest';
  traj.push([rnd(s.p[0]), rnd(s.p[1]), rnd(s.p[2]), rnd(s.n[0]), rnd(s.n[1]), rnd(s.n[2]), rnd(s.spinRate)]);
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
  if (a.length > 6) f.spinRate = a[6] + (b[6] - a[6]) * u; else f.spinRate *= (1 - 0.12 * dt);   // older peers send six-wide records
  f.spin += f.spinRate * dt;
  setDiscPose(p.discMesh, pos, nn, f.spin * THROWS[f.params.throwType].spin * (f.params.lefty ? -1 : 1));
  f.pos = pos; f.hv = [b[0] - a[0], 0, b[2] - a[2]];
  while (f.ei < f.events.length && f.events[f.ei][0] <= f.t) { onFlightEvent(f.events[f.ei][1]); f.ei++; }
  UI.setHud({ dist: Math.hypot(basketPos()[0] - pos[0], basketPos()[1] - pos[2]) });
  if (i >= n - 1 && f.t > n / 60 + 0.6) { G.flight = null; resolveThrow(f.pi, f.result); }
}
const SURFACE_AT = p => world.inWater(p[0], p[2]) ? 'water' : world.rough(p[0], p[2]) > 0.5 ? 'dirt' : 'grass';
function onFlightEvent(e) {
  const f = G.flight, at = f?.pos, strength = f?.hv ? Math.min(2, Math.hypot(f.hv[0], f.hv[2]) * 60 / 12) : 1;
  if (at && ['land', 'skip', 'flop', 'roll', 'splash'].includes(e)) puffs.burst(at, e, strength, e === 'splash' ? 'water' : SURFACE_AT(at));
  if (e === 'chains' || e === 'drop') { sfx[e === 'drop' ? 'drop' : 'chains'](G.flight?.params.power ?? .6); UI.toast('Chains!', 'Right in the heart!', 1600); return; }
  if ((e === 'chainout' || e === 'band' || e === 'rim') && !G.flight?.result.holed && !G.flight?.missReaction) { if(G.flight)G.flight.missReaction=true;sfx.ohh(); }
  const m = { land: () => sfx.thud(), skip: () => sfx.skip(), tree: () => { sfx.tree(); UI.toast('Tree!', '', 900); }, branch: () => { sfx.leaves(); UI.toast('Kicked by a branch', '', 900); }, chains: () => sfx.chains(), drop: () => sfx.drop(), chainout: () => { sfx.chainout(); UI.toast('Chain out!', 'too hard', 1200); }, band: () => { sfx.band(); UI.toast('Off the band', '', 900); }, pole: () => sfx.pole(), arch: () => { sfx.pole(); UI.toast('Off the arch', '', 900); }, rim:() => { sfx.band(); UI.toast('Off the rim', '', 900); }, splash: () => sfx.splash(), roll: () => sfx.roll(), flop: () => sfx.thud(0.5), ob: () => sfx.bad() };
  m[e]?.();
}
function resolveThrow(pi, r) {
  const p = G.players[pi], h = holes[G.holeIdx];
  p.strokes++;
  let title, sub;
  if (r.holed) {
    p.done = true; p.scores[G.holeIdx] = p.strokes;
    if (isMine(p)) buzz([30, 40, 60]);
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
  const final = G.holeIdx >= G.holeCount - 1;
  UI.renderScorecard({ players: G.players, holes: holes.slice(0, G.holeCount), holeIdx: G.holeIdx, final, isHost: G.net?.isHost, online: G.mode === 'online', best: final ? personalBest() : null });
}
// Personal best per course and hole count for the one human on this phone (solo and online rounds; pass & play has several).
function personalBest() {
  const humans = G.players.filter(p => !p.isBot && isMine(p));
  if (humans.length !== 1) return null;
  const p = humans[0], played = holes.slice(0, G.holeCount);
  if (played.some((h, i) => p.scores[i] == null)) return null;
  const toPar = played.reduce((s, h, i) => s + p.scores[i] - h.par, 0), key = `chains.best.${G.courseId}.${G.holeCount}`;
  let prev = null; try { prev = JSON.parse(localStorage.getItem(key)); } catch { /* private mode */ }
  const isNew = prev == null || toPar < prev.toPar;
  if (isNew) saveLocal(key, { toPar, date: Date.now() });
  return { toPar, prev: prev?.toPar ?? null, isNew };
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
  hero.group.visible = true; course.setHole(0); placeHero();
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
  buzz(15);
  doThrow(G.cur, o);
  document.body.classList.add('thrown');   // the swipe hint fades after the first real throw (ui.css)
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
  const lie = curP().lie, pts = r.traj.slice(0, Math.max(2, Math.floor(r.traj.length * 0.7))).filter((q, i, a) => i >= a.length - 2 || Math.hypot(q[0] - lie[0], q[2] - lie[2]) > 1.5);   // the ribbon starts at the thrower's shoulder instead of slashing across his back
  const arr = new Float32Array(pts.length * 3); pts.forEach((q, i) => { arr[i * 3] = q[0]; arr[i * 3 + 1] = q[1]; arr[i * 3 + 2] = q[2]; });
  for (const l of previewLines) { const old = l.geometry; l.geometry = new LineGeometry(); l.geometry.setPositions(arr); l.computeLineDistances(); old.dispose(); }
  previewMat.color.set(pw > 0.72 ? '#ffd23f' : '#ffffff');
  const p = curP(), d = aimDir(); aimArrow.position.set(p.lie[0] + d[0] * 1.7, world.height(p.lie[0] + d[0] * 1.7, p.lie[2] + d[1] * 1.7) + .05, p.lie[2] + d[1] * 1.7); aimArrow.rotation.y = Math.atan2(-d[0], -d[1]); aimArrow.material.color.copy(previewMat.color);   // tip 1.7 m out, pointing down the aim (it used to point back at the player)
}

// ---------- camera ----------
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const baseFov = () => camera.aspect < 0.8 ? 74 : camera.aspect < 1.2 ? 66 : 58;   // mirrors resize(); narrower lenses below are per camera mode
const DEG = Math.PI / 180;
cam.shift = cam.tShift = 0;   // vertical lens shift in half-frames (a putt's level camera looking down onto the green), eased like the pose
// Over-the-left-shoulder aim frame (the Disc Golf Masters broadcast lens): a chest-high camera ~2 m behind the athlete's left
// shoulder, near level, so he fills the right third cropped at the thigh. Drives: axis a few degrees right of the aim, pin
// left of centre, horizon just under the middle, head ~18% from the top. Putts: a 29° (tall) lens 2.7 m from the athlete and
// ~24° round his left side, so the frame reads in three depths: he stands on the right third cut at the upper thigh (the
// reference's own crop: his back x 0.68-0.92, head top ~12%), the putting hand and disc clear of his body, the whole basket (flag
// to base plate) on the midline at the reference's size, the banners and trunks behind it small. A normal-to-long lens, not a
// wide one: at 36° from 2.4 m he was cut at the knee and the basket read small; a 22-26° lens from 2.4-2.8 m blew the banners up
// as tall as the athlete (as a 40° wide lens from 3.5 m flattened everything into one crowded layer); square behind him he was a
// slab of jersey hiding the disc. From 1.9 m at 21° his hair sat ~8% from the top edge and the basket ~80% down, pinched between
// the banners and his disc hand. At 32° from 2.3 m (eyes 22%, band 42%) the critics called the lower third empty dirt and the
// far ground line at mid-frame flat: the slightly longer lens from 0.4 m further back puts the cage centre at ~47% and the field
// line ~60% down, like the reference's lower chest-high camera, with the dirt in front of the basket down to the bottom quarter.
// That rig still cut him at mid-thigh, a small figure beside the basket, with a bench sliced by the left edge: 2.15 m back
// (P.x pans the pin 3% left of centre) he stands cut at the hip like the reference, eyes 19%, cage centre ~45%, and the
// frame's left edge clears the green-side bench. But from ~1.7 m up (band just over the midline) it still looked down on a
// downhill green: the far ground line cut the frame in half, the cage stood against the dark crown behind it and the two
// banners crowded its left side. Now the camera sits ~1.5 m up, chest height and level (band 54%, base plate 84%, the far
// ground line ~65% down as in the reference, the canopy's haze opening the top half); P.x pans the pin to 39%, so its base
// plate stands clear left of the swipe pill, the banners drop to the left edge's framing and the bench leaves frame; and 1.2 m
// to his side (27°) the pin's parallax opens ~100 px (at 640) between it and the banners, his back still on the right third.
// The camera stays level and slides its lens
// instead (cam.shift, applyViewOffset), so a green below the lie drops into frame without tipping the trunks inward (pitched
// down onto the tray, it read as looking into a pit). It takes the height (lo-hi) that sets the athlete's eyes at P.eye and the
// basket band at P.band (half-frame units above centre: 19% and 54% from the top), so uphill, flat and downhill greens frame
// alike; a short putt's bigger basket lifts the band until its base plate stays over P.base (86%, a phone's 82%). On the
// course's downhill putts (every green sits ~1 m under a 6.5 m lie) that puts the lens ~1.5 m up. A short phone (puttS) holds
// the pin at 38% and the band at the midline: its 29° lens is set by the swipe ring, not hfov.
// Out of the lo-hi range the band wins until the eyes would pass P.eye. A lateral nudge of up to P.nudge clears trunks from
// behind the basket (puttDodge). Portrait keeps its lift rule. Wide screens hold the horizontal lens (hfov), a 2:1 phone
// widening past it rather than cropping under P.vmin tall (29° on a short phone, whose swipe ring takes the frame's lower
// third); portrait holds the vertical one. Shared by the aim camera and the hole intro's landing. Writes pos/look, returns the
// vertical fov.
const AIM = { drive: { back: 2.3, side: .75, up: 1.42, pitch: 2, yaw: 4.8, hfov: 55 }, putt: { back: 2.3, side: 1.2, lo: .9, hi: 1.9, eye: .62, band: -.08, base: -.72, x: .22, nudge: [-.05, .15], hfov: 50, vmin: 10 },
  tall: { drive: { back: 2.9, side: .5, up: 1.5, pitch: 5, yaw: 2.6, fov: 60 }, putt: { back: 2.3, side: .6, up: 1.4, lift: .3, eye: .58, band: .1, fov: 56 } } };
AIM.puttS = { ...AIM.putt, eye: .6, band: -.02, base: -.64, x: .24 };   // a short phone: the swipe pill and ring fill the lower third's middle, so the pin stands further left (38%) with its base plate beside them
function aimFrame(lie, d, putt, pos, look) {
  const h = holes[G.holeIdx], r = rightOf(d), portrait = camera.aspect < 1.2, P = portrait ? AIM.tall[putt ? 'putt' : 'drive'] : putt ? innerHeight > 520 ? AIM.putt : AIM.puttS : AIM.drive;
  const vt = portrait ? Math.tan(P.fov * DEG / 2) : Math.max(Math.tan((innerHeight > 520 && P.vmin || 14.5) * DEG), Math.tan(P.hfov * DEG / 2) / camera.aspect);   // tangent of the vertical half-angle; 29° at least on a short phone, so it keeps headroom
  const side = P.side + (putt && P.nudge ? puttDodge(lie, P) : 0), rho = Math.hypot(P.back, side);
  pos.set(lie.x - d[0] * P.back - r[0] * side, lie.y, lie.z - d[1] * P.back - r[1] * side);
  const bd = Math.hypot(h.basket[0] - pos.x, h.basket[1] - pos.z), bh = h.basketY - lie.y + 1.4, eye = putt && Math.atan(P.eye * vt), band = putt && Math.atan(P.band * vt);   // bh: band centre over the lie
  const B = putt && P.lo ? Math.max(P.band, P.base + 1.4 / bd / vt) : P.band;   // a short putt's basket looms: lift the band until its base plate (1.4 m under it) stays over P.base
  const eh = (curP()?.char.headY || 1.72) - .09;   // eyes in the putting stance, which sinks them ~9 cm
  let up = P.up + (putt && P.lift ? Math.max(-.5, Math.min(.5, P.lift * (lie.y - h.basketY))) : 0);
  if (putt && P.lo) for (let lo = P.lo, hi = P.hi, i = 0; i < 12; i++) { up = (lo + hi) / 2; if ((eh - up) / rho - (bh - up) / bd > (P.eye - B) * vt) lo = up; else hi = up; }   // level lens: the eyes-to-band gap on screen falls as the camera rises
  pos.y += up;
  if (putt && P.lo) cam.tShift = Math.max(-.3, Math.min(1, Math.min(B - (bh - up) / bd / vt, P.eye - (eh - up) / rho / vt)));   // slide the lens, don't tip it: the green drops into frame and the trunks stay upright
  const pitch = (putt ? P.lo ? 0 : Math.max(-4, Math.min(14, Math.min(band - Math.atan2(bh - up, bd), eye - Math.atan2(eh - up, rho)) / DEG)) : P.pitch) - G.aim.pitch;   // drag up = look up
  const yaw = putt ? Math.atan2(side, bd) + Math.atan((P.x || 0) * vt * camera.aspect) : P.yaw * DEG, fx = d[0] * Math.cos(yaw) + r[0] * Math.sin(yaw), fz = d[1] * Math.cos(yaw) + r[1] * Math.sin(yaw);
  look.set(pos.x + fx * 14, pos.y - Math.tan(pitch * DEG) * 14, pos.z + fz * 14);
  return 2 * Math.atan(vt) / DEG;
}
// Putt background: a trunk standing behind the basket's band and flag reads as a pole growing out of the target. Each lie
// scores the camera's lateral nudges (5 cm steps across P.nudge; + swings the athlete toward the frame edge, - toward the pin)
// by the trunk behind that window (the band's left rim to the flag's free end, band foot to flag top): angular overlap x
// trunk width x share of the window's height, fading with the haze past the pin. The cheapest wins, a small nudge preferred;
// the rig then eases there. Once per lie, measured down the lie's line to the pin, so aiming never swims.
const dodge = { key: '', ds: 0 };
// Hole intro's opening drone: back/side/up from the pad, eyes on the ground `ahead` m down the line (+lift). Low and near level,
// so the establishing shot has sky over the tree line and the fairway running from the pad to the target up the middle
// (from 13 m up, looking ~30° down an uphill hole, the frame was all turf with the gantry and pin pinned under its top edge).
const INTRO = { back: 20, side: 1.5, up: 7, ahead: 40, lift: 1.5 };   // far enough back that the group waiting by the pad stands whole in frame
function puttDodge(lie, P) {
  const h = holes[G.holeIdx], key = `${G.holeIdx}:${lie.x.toFixed(2)}:${lie.z.toFixed(2)}`;
  if (dodge.key === key) return dodge.ds;
  const [bx, bz] = h.basket, L = Math.hypot(bx - lie.x, bz - lie.z) || 1, d = [(bx - lie.x) / L, (bz - lie.z) / L], r = rightOf(d), cy = lie.y + 1.6;
  const trees = new Set([0, 12, 24, 36].flatMap(k => world.treesNear(bx + d[0] * k, bz + d[1] * k)));   // 3x3 cells of 12 m round each: 45 m past the pin
  let best = Infinity; dodge.ds = 0;
  for (let ds = P.nudge[0]; ds <= P.nudge[1] + 1e-3; ds += .05) {
    const cx = lie.x - d[0] * P.back - r[0] * (P.side + ds), cz = lie.z - d[1] * P.back - r[1] * (P.side + ds), D = Math.hypot(bx - cx, bz - cz), ux = (bx - cx) / D, uz = (bz - cz) / D;
    const wl = -Math.atan2(.3, D) - .004, wr = Math.atan2(.42, D) + .004, w0 = Math.atan2(h.basketY + 1.3 - cy, D), w1 = Math.atan2(h.basketY + 2.07 - cy, D);   // the flag flies right of the mast
    let cost = ds * ds * 3e-3;   // a 5 cm nudge is nearly free; the full 15 cm (the athlete ~5% nearer the pin) must clear a trunk's worth
    for (const t of trees) {
      const tx = t.x - cx, tz = t.z - cz, along = tx * ux + tz * uz; if (along < D + 1 || along > D + 45) continue;
      const a = Math.atan2(tz * ux - tx * uz, along), w = Math.atan2(t.r, along), ov = Math.min(wr, a + w) - Math.max(wl, a - w); if (ov <= 0) continue;
      const v = Math.min(w1, Math.atan2(t.y + t.h - cy, along)) - Math.max(w0, Math.atan2(t.y - cy, along));   // the trunk runs on up through the crown
      if (v > 0) cost += ov * w * v / (w1 - w0) * Math.exp((D - along) / 60);
    }
    if (cost < best - 1e-9) { best = cost; dodge.ds = ds; }
  }
  dodge.key = key; return dodge.ds;
}
function updateCamera(dt) {
  if (document.body.dataset.phase !== G.phase) document.body.dataset.phase = G.phase;
  frameInterface();
  const h = holes[G.holeIdx] || holes[0];
  let k = 5, fov = baseFov(); cam.tShift = 0;   // only a landscape putt's aimFrame slides the lens
  if (cam.mode === 'menu') {   // clubhouse: a low portrait of the athlete cut at mid-thigh (key art's crop: never at a joint), basket over his off-shoulder, woods closing the top
    const { d, r } = menuStage, t = performance.now() / 1000, p = hero.group.position, wide = camera.aspect > 1.2, S = wide ? MENU.wide : MENU.portrait, sway = Math.sin(t * 0.18) * 0.06;
    // wide: the athlete centred in the view right of the panel (whatever its width); the axis swings left to put him there
    const right = wide ? (document.querySelector('#menu .panel')?.getBoundingClientRect().right || 0) / innerWidth : 0, sx = wide ? right + (1 - right) * S.x - .5 : S.x - .5;
    const yaw = -Math.atan(sx * 2 * Math.tan(S.fov * DEG / 2) * camera.aspect) + sway * .02, fx = d[0] * Math.cos(yaw) + r[0] * Math.sin(yaw), fz = d[1] * Math.cos(yaw) + r[1] * Math.sin(yaw);
    cam.tPos.set(p.x - d[0] * S.back - r[0] * sway, p.y + S.up, p.z - d[1] * S.back - r[1] * sway);
    cam.tLook.set(cam.tPos.x + fx * S.back * 2, 2 * (p.y + S.aim) - cam.tPos.y, cam.tPos.z + fz * S.back * 2); k = 4; fov = S.fov;   // the axis meets the athlete's S.aim height, so his framing holds on any slope; aimed twice as far so the lie-focused tufts gather round the basket, not the lens
    _v.set(p.x - cam.tPos.x, 0, p.z - cam.tPos.z).normalize(); scrim.position.set(p.x + _v.x * MENU.haze, p.y + 1.5, p.z + _v.z * MENU.haze); scrim.lookAt(cam.tPos.x, p.y + 1.5, cam.tPos.z); scrim.scale.set(16, 10, 1);   // the haze sheet, square to the lens, wider than any sway
  } else if (cam.mode === 'locker') {   // creator stage: orbit the avatar's front, slow sway
    const h0 = holes[0], t = performance.now() / 1000, d = [h0.basket[0] - h0.tee[0], h0.basket[1] - h0.tee[1]], L = Math.hypot(d[0], d[1]); d[0] /= L; d[1] /= L;
    const r = rightOf(d), p = hero.group.position, wide = camera.aspect > 1.2;
    const faceEdit=document.querySelector('.locker-tabs [aria-selected="true"]')?.dataset.category==='face';
    const hy = hero.headY || 1.39;   // frame whichever rig loaded: the athlete's face sits higher than the Mii's
    const ang = Math.sin(t * 0.18) * 0.04 - .10, dist = faceEdit ? Math.max(.95, hy * .62) : 3.25;
    const fx = d[0] * Math.cos(ang) + r[0] * Math.sin(ang), fz = d[1] * Math.cos(ang) + r[1] * Math.sin(ang);   // direction from hero to camera, swept around his front
    const side = wide ? (faceEdit ? .45 : 1.25) : 0;   // desktop: the panel sits on the left, so frame the hero right of centre
    cam.tPos.set(p.x + fx * dist + r[0] * side, p.y + (faceEdit ? hy + .03 : hy * .97), p.z + fz * dist + r[1] * side);
    cam.tLook.set(p.x + r[0] * side, p.y + (faceEdit ? hy - .01 : hy * .62), p.z + r[1] * side); k = 4;
  } else if (cam.mode === 'courses') {   // slow flyover of the whole course
    const t = performance.now() / 1000 * 0.06, cx = holes.reduce((a, h) => a + h.basket[0], 0) / holes.length, cz = holes.reduce((a, h) => a + h.basket[1], 0) / holes.length;
    cam.tPos.set(cx + Math.cos(t) * 170, world.height(cx, cz) + 95, cz + Math.sin(t) * 170); cam.tLook.set(cx, world.height(cx, cz), cz); k = 1.5;
  } else if (cam.mode === 'intro') {   // flyover: a drone low behind the pad looking down the fairway (INTRO), easing forward and down into the tee's aim frame
    const d = [h.basket[0] - h.tee[0], h.basket[1] - h.tee[1]], L = Math.hypot(d[0], d[1]); d[0] /= L; d[1] /= L;
    const r = rightOf(d), u = ease(Math.min(1, G.introT / 4.7));
    _v.set(h.tee[0], h.teeY, h.tee[1]); const aimFov = aimFrame(_v, d, false, _v2, _v3);   // landing = the aim camera on the tee, so the hand-off is seamless
    const I = INTRO; _v.set(h.tee[0] - d[0] * I.back - r[0] * I.side, h.teeY + I.up, h.tee[1] - d[1] * I.back - r[1] * I.side); cam.tPos.lerpVectors(_v, _v2, u);
    const ax = h.tee[0] + d[0] * I.ahead, az = h.tee[1] + d[1] * I.ahead; _v.set(ax, world.height(ax, az) + I.lift, az); cam.tLook.lerpVectors(_v, _v3, u);
    cam.tPos.y = Math.max(cam.tPos.y, world.height(cam.tPos.x, cam.tPos.z) + 1.6); k = 1e3;   // no smoothing: the eased path is the motion
    fov += (aimFov - fov) * u;
  } else if (cam.mode === 'aim' || (cam.mode === 'result' && !G.flight)) {
    const p = curP(); if (!p) return;
    const d = aimDir(), lie = p.char.group.position;
    if (G.overview && cam.mode !== 'result') {
      const dist = Math.max(20, distToBasket(lie.x, lie.z));
      const mx = (lie.x + basketPos()[0]) / 2, mz = (lie.z + basketPos()[1]) / 2;
      cam.tPos.set(mx - d[0] * dist * 0.22, world.height(mx, mz) + Math.max(45, dist * 0.95), mz - d[1] * dist * 0.22); cam.tLook.set(mx, world.height(mx, mz), mz); k = 4;
    } else if (cam.mode === 'result') {
      const r=rightOf(d);cam.tPos.set(lie.x+d[0]*3.8+r[0]*.7,lie.y+1.45,lie.z+d[1]*3.8+r[1]*.7);
      cam.tLook.set(lie.x,lie.y+.92,lie.z); k=5;
    }
    else fov = aimFrame(lie, d, G.throwType === 'putt', cam.tPos, cam.tLook);
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
  cam.pos.lerp(cam.tPos, a); cam.look.lerp(cam.tLook, a); cam.fov += (fov - cam.fov) * a; cam.shift += (cam.tShift - cam.shift) * a;
  const gy = world.height(cam.pos.x, cam.pos.z) + 0.7; if (cam.pos.y < gy) cam.pos.y = gy;
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
  if (Math.abs(camera.fov - cam.fov) > .01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }   // resize() resets fov by aspect; this re-applies the mode's lens every frame
  applyViewOffset();
  scrim.material = post ? backdrop.mat : hazeMat; if (scrim.visible && post) snapBackdrop(); else if (backdrop.rt) { backdrop.rt.dispose(); backdrop.rt = null; }   // the snapshot's target lives only while the clubhouse shows
  // Target tag (ui.css #pin): the basket's distance on a hairline just over the flag while a hole is in play; it bows out as
  // the camera closes inside ~20 m, where the basket itself is the target. This frame's matrices, so it never trails the drone.
  if (/^(intro|aim|windup|release|flight)$/.test(G.phase)) { camera.updateMatrixWorld(); _v.set(h.basket[0], h.basketY + 2.3, h.basket[1]); const fade = THREE.MathUtils.smoothstep(_v.distanceTo(camera.position), 14, 22); _v.project(camera); UI.placePin((_v.x + 1) / 2 * innerWidth, (1 - _v.y) / 2 * innerHeight, _v.z < 1 ? fade : 0); }
  else UI.placePin(0, 0, 0);
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
  if (hero?.group.visible) { hero.update(dt); if (heroDisc) { heroDisc.visible = true; hero.group.getWorldDirection(_v2); holdDisc(hero, heroDisc, [_v2.x * .25, 1, _v2.z * .25], time * .3); } } else if (heroDisc) heroDisc.visible = false;
  const p = curP();
  if (p && (G.phase === 'aim' || G.phase === 'windup' || (G.phase === 'release' && G.pending && !G.pending.fired))) {
    const d = aimDir(); p.char.faceDir(d[0], d[1]);
    // disc in hand, oriented like the release
    const lat = G.phase === 'windup' ? G.gesture.lateral : 0;
    const s0 = launch(gestureParams(0.5, lat));
    holdDisc(p.char, p.discMesh, s0.n, time * 0.4, G.throwType);
    updatePreview();
  }
  updateCamera(dt);
  const focus = G.flight?.pos ? _v2.set(G.flight.pos[0], G.flight.pos[1], G.flight.pos[2]) : p ? p.char.group.position : cam.look;
  course.update(dt, time, focus, camera.position);
  puffs.update(dt); windFx?.update(time, dt, world.wind, focus, camera);
  previewMat.dashOffset -= dt * 1.6; previewEdge.dashOffset = previewMat.dashOffset;
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
const onAvatarChange = (k, v) => { G.avatar[k] = v; saveLocal('chains.avatar', G.avatar); updateHub(); if (k === 'name') return; if (['eyes','eyeColor','brows','nose','mouth','facialHair','glasses','shades'].includes(k)) { hero?.setFace?.(G.avatar); return; } clearTimeout(heroTimer); heroTimer = setTimeout(makeHero, 120); };
const openLocker = () => { UI.hide('menu'); UI.show('locker'); cam.mode = 'locker'; placeHero(); sfx.click(); UI.renderLocker(G.avatar, AVATAR_OPTIONS, onAvatarChange); };
$('btnLocker').onclick = openLocker;
$('btnRandomAvatar').onclick = () => { G.avatar = randomAvatar(Math.random, { name: G.avatar.name }); saveLocal('chains.avatar', G.avatar); makeHero(); updateHub(); UI.renderLocker(G.avatar, AVATAR_OPTIONS, onAvatarChange); sfx.click(); };
$('btnLockerDone').onclick = () => { UI.hide('locker'); UI.show('menu'); cam.mode = 'menu'; placeHero(); sfx.click(); };

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
  window.__chains = { G, renderer, scene, camera, course, world, holes, cam, get hero() { return hero; }, puffs, get windFx() { return windFx; }, renderFrame: () => post ? post.render() : renderer.render(scene,camera), startGame, nextTurn, doThrow, runSim, resolveThrow, setupTurn, loadCourse, makeHero, THREE };  // debug hook (remote devtools)
}, 60);
