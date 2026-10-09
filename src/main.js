import * as THREE from 'three';
import { buildCourse, makeRng, COURSES, courseById, courseLayout } from './course.js';
import { DISCS, THROWS, discById, launch, step, DT, isDone, resultOf, simulate, speedFor, releasePos } from './physics.js';
import { createCharacter, DEFAULT_AVATAR, AVATAR_OPTIONS, randomAvatar } from './player.js';
import { loadManifest, asset } from './assets.js';
import { loadModels, modelStatus } from './models.js';
import { createDiscMesh, setDiscPose } from './disc.js';
import { clearFraction } from './cam-collide.js';
import { createPuffs } from './puffs.js';
import { createCelebration } from './celebration.js';
import { createWindFx } from './wind.js';
import { createShotGuide } from './shot-guide.js';
import { suggestPower } from './shot-planning.js';
import { createFlightTrail } from './flight-trail.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { setupInput } from './input.js';
import { createCoach } from './coach.js';
import { planBotThrow } from './bot.js';
import { createNet } from './net.js';
import { MAX_PLAYERS, PROTOCOL_VERSION, safeName, uniqueName, turnKey, lobbyPublic, validateThrowRequest, sanitizeAvatar, safeColor } from './protocol.js';
import * as UI from './ui.js';
import { createMatches } from './match.js';
import { unlock, sfx, setMuted, isMuted } from './audio.js';

const $ = UI.$;
const COLORS = ['#ff4d3d', '#2f80ff', '#ffd23f', '#38d47a', '#ff7ad9', '#9b6bff'];
const BOT_NAMES = ['Ricky', 'Paige', 'Simon', 'Eagle', 'Calvin', 'Kristin'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Shader warm-up, bounded: compileAsync polls KHR_parallel_shader_compile, and on a busy GPU (several tabs, an old phone) a program
// can report incomplete forever and the game sat on its loading screen. After 6 s, carry on: the first frames compile what is left.
const warmShaders = () => Promise.race([renderer.compileAsync(scene, camera).catch(() => {}), sleep(6000)]);
const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const G = {
  phase: 'menu', mode: 'solo', players: [], holeIdx: 0, holeCount: 9, cur: -1, seed: 7,
  aim: { yaw: 0, pitch: 0 }, throwType: 'backhand', discId: 'driver', overview: false,
  flight: null, pending: null, releaseT: 0, tween: null, introT: 0,
  settings: { holes: '9', difficulty: 'medium', quality: isMobile ? 'low' : 'high' },
  net: null, lobby: [], gesture: { power: 0, lateral: 0 }, previewDirty: true, lastPreview: 0, inbox: [],
  avatar: { ...DEFAULT_AVATAR }, courseId: 'pine',
  sessionId: '', shotSeq: 0, lastShotSeq: 0, syncing: false,
};
try { const saved=JSON.parse(localStorage.getItem('chains.avatar') || '{}');Object.assign(G.avatar,saved);if(saved.glasses==null&&saved.shades)G.avatar.glasses='sport'; G.courseId = localStorage.getItem('chains.course') || 'pine'; } catch { /* private mode */ }
const saveLocal = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* ignore */ } };
const strHash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

// ---------- renderer / scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .74;   // sunlit turf lands mid-high and shade keeps a real dark; ACES rolls the sun's haze and aureole off instead of clipping them
// Mobile's finish: Desktop grades the frame in a full-screen pass after ACES (effects.js GRADE: gain and lift, a gentle
// S-curve, saturation about luma, greens toward olive, a cool-shade/warm-sun split tone, a cool veil in the deepest darks).
// Mobile folds the same grade, minus grain and vignette, into the tone-mapping step every material already runs, so the
// broadcast colour costs a few ALU ops a pixel and no render target; the vignette is a CSS layer (ui.css #vignette).
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace('vec3 CustomToneMapping( vec3 color ) { return color; }', `vec3 CustomToneMapping( vec3 color ) {
  vec3 c = sqrt( clamp( ACESFilmicToneMapping( color ), 0., 1. ) );   // a gamma-2 display space: sqrt and a square instead of two pows a pixel
  c = clamp( c * vec3( 1.13, 1.08, 1. ) + vec3( 0., .003, .01 ), 0., 1. );   // brighter and warmer than Desktop's gain: no bloom or sun shafts lift it
  c = mix( c, c * c * ( 3. - 2. * c ), .28 );
  float l = dot( c, vec3( .2126, .7152, .0722 ) ), lead = clamp( ( c.g - max( c.r, c.b ) ) * 3., 0., 1. );
  c = mix( vec3( l ), c, 1.04 ); c.r += ( c.g - c.r ) * lead * .25;
  c *= mix( vec3( .94, .99, 1.06 ), vec3( 1.04, 1., .92 ), smoothstep( .06, .5, l ) );
  c = mix( vec3( l ), c, mix( .9, 1., smoothstep( .04, .3, l ) ) ) + vec3( .018, .022, .03 ) * ( 1. - l ) * ( 1. - l ) * ( 1. - l );
  c = max( c, 0. ); return c * c; }`);
const toneFor = q => q === 'low' ? THREE.CustomToneMapping : THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;   // 17-tap PCF honours shadow.radius: a visible penumbra under the canopies (PCFSoft ignores it)
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.2, 1600);
let post = null, postEnabled = true, resolutionScale = 1, frameAverage = 1/60, frameSamples = 0, lastResolutionChange = 0, slowTime = 0;
const lineMats = [];   // screen-space line materials that need the framebuffer size
const resize = () => { if (!innerWidth || !innerHeight) return;   // a page opened in a background tab (or a hidden pane) reports 0x0: an aspect of 0/0 poisoned the camera with NaN for good
  renderer.setPixelRatio(Math.min(devicePixelRatio, G.settings.quality === 'low' || isMobile ? 1.5 : 2, Math.sqrt((isMobile ? 1800000 : 4500000) / (innerWidth * innerHeight))) * resolutionScale); renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 74 : camera.aspect < 1.2 ? 66 : 58; camera.updateProjectionMatrix(); post?.resize(Math.round(innerWidth*renderer.getPixelRatio()),Math.round(innerHeight*renderer.getPixelRatio())); for (const m of lineMats) m.resolution.set(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio()); };
addEventListener('resize', resize); resize();

let course, world, holes, effects = null;
const cam = { pos: new THREE.Vector3(0, 10, 30), look: new THREE.Vector3(), tPos: new THREE.Vector3(), tLook: new THREE.Vector3(), mode: 'menu', lastHv: new THREE.Vector3(0, 0, -1), fov: 58 };
// Flight preview: a screen-space dashed ribbon (readable at any pixel ratio) over a dark outline, and a ground
// arrow at the lie that turns with the aim. The dashes flow toward the basket so the direction reads at a glance.
const previewMat = new LineMaterial({ color: 0xffffff, linewidth: 3.2, dashed: true, dashSize: .7, gapSize: .38, transparent: true, opacity: .96, depthTest: false, depthWrite: false });
const previewEdge = new LineMaterial({ color: 0x06140c, linewidth: 6.4, dashed: true, dashSize: .7, gapSize: .38, transparent: true, opacity: .42, depthTest: false, depthWrite: false });
const preview = new THREE.Group(); preview.visible = false; scene.add(preview); lineMats.push(previewMat, previewEdge); resize();
const shotGuide = createShotGuide(preview);
const trail = createFlightTrail(scene);
const previewLines = [previewEdge, previewMat].map((m, i) => { const l = new Line2(new LineGeometry(), m); l.frustumCulled = false; l.renderOrder = 5 + i; preview.add(l); return l; });
const aimArrow = (() => {
  const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(.34, -.42); shape.lineTo(.12, -.36); shape.lineTo(.12, -1.15); shape.lineTo(-.12, -1.15); shape.lineTo(-.12, -.36); shape.lineTo(-.34, -.42); shape.closePath();
  // depth tested (the athlete's legs stand in front of it from the tee camera; drawn over everything it cut across his shorts), lifted off the turf by polygon offset
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  m.renderOrder = 4; m.frustumCulled = false; preview.add(m); return m;
})();
// Soft projected contact shadow, only Full draws it.
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;
const shadowInk=shadowCanvas.getContext('2d'), shadowGrad=shadowInk.createRadialGradient(32,32,2,32,32,32);
shadowGrad.addColorStop(0,'rgba(0,0,0,.5)');shadowGrad.addColorStop(1,'rgba(0,0,0,0)');shadowInk.fillStyle=shadowGrad;shadowInk.fillRect(0,0,64,64);
const contactShadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
contactShadow.visible=false;scene.add(contactShadow);

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), _q0 = new THREE.Quaternion();
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
function createPlayer({ name, color, isBot = false, difficulty = 'medium', peerId = null, avatar = null, hand }, i) {
  // bots and unnamed humans get a deterministic random look (same on every online client) in their player colour
  color = safeColor(color, COLORS[i % COLORS.length]); avatar = avatar && sanitizeAvatar(avatar); name = safeName(name);   // a room's config comes off the network
  const appearance = avatar ? { ...avatar, jersey: color } : randomAvatar(makeRng(strHash(name) + i * 97), { jersey: color, name, ...(hand ? { hand } : {}) });
  const char = createCharacter({ ...appearance, lod: i > 0 });
  char.setGround?.((x, z) => world.height(x, z));
  scene.add(char.group);
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.27, 0.4, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
  marker.visible = false; scene.add(marker);
  return { name, color, isBot, difficulty, peerId, appearance, lod: i > 0, scores: [], strokes: 0, done: false, lie: [0, 0, 0], lieDist: 0, char, marker, discMesh: null, discId: null };
}
function setPlayerDetail(p, lod) {
  if (p.lod === lod || G.settings.quality === 'low') return;
  const next = createCharacter({ ...p.appearance, lod });
  next.setGround?.((x, z) => world.height(x, z));
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
const celebration = createCelebration(scene);
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
const MENU = { short: 5, lat: 1.25, face: .2, kick: 8, haze: 1.6, wide: { back: 3.3, up: 1.3, aim: 1.37, x: .5, fov: 23 }, portrait: { back: 3.2, up: 1.2, aim: 1.2, x: .6, fov: 50 } };
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
function makeHero() { if (hero) { scene.remove(hero.group); hero.dispose(); } if (heroDisc) { scene.remove(heroDisc); heroDisc.userData.dispose?.(); } hero = createCharacter(G.avatar); hero.setGround?.((x, z) => world.height(x, z)); kickLight(hero.group); scene.add(hero.group); heroDisc = createDiscMesh(discById('driver')); scene.add(heroDisc); placeHero(); }
// Disc in the hand. Idle: carried by the rim at the thigh, plate hanging beside the leg. Throwing: gripped so the
// plate rides the wrist through the windup and is exactly level with the planned release normal at phase .62.
const _qh = new THREE.Quaternion(), _qg = new THREE.Quaternion(), _off = new THREE.Vector3(), _nrm = new THREE.Vector3(), _gp = new THREE.Vector3(), _gn = new THREE.Vector3();
const CARRY_N = new THREE.Vector3(0, .35, -1).normalize(), CARRY_OFF = new THREE.Vector3(0, -.095, -.02), GRIP_TIP = .16, GRIP_SINK = .012, _gh = new THREE.Vector3(), _gr = new THREE.Vector3(), _gt = new THREE.Vector3();
function holdDisc(char, mesh, n, spin, throwType) {
  char.hand.getWorldPosition(_v); char.hand.getWorldQuaternion(_qh); if (!throwType) char.carry?.();   // a disc on show outside a throw: the cover-shot pose, not a bystander's idle
  const rel = throwType && char.getPhase() !== null ? char.releaseFrame?.(throwType) : null;
  if (rel) {
    _qg.copy(char.group.quaternion).invert();
    _nrm.set(n[0], n[1], n[2]).applyQuaternion(_qg).applyQuaternion(rel.qInv).applyQuaternion(_qh);
    _off.copy(rel.dir).multiplyScalar(.075).y -= .015; _off.applyQuaternion(rel.qInv).applyQuaternion(_qh);
  } else { _nrm.copy(CARRY_N).applyQuaternion(_qh); _off.copy(CARRY_OFF).applyQuaternion(_qh); spin = 0; }
  _v.add(_off);
  // backhand set-up: the rim seated in the gripping hand, handed over to the release frame through the windup (level at .62)
  const w = rel ? char.gripPose?.(_gp, _gn) || 0 : 0;
  if (w > 0) { _v.lerp(_gp, w); _nrm.normalize().lerp(_gn, w); spin *= 1 - w;
    // tipped ~9° toward the lens about the rim in the palm (at ~14° critics saw "a serving plate"), and sunk ~1 cm into the hooked fingers (seated on the thumb, the fingers hung below the plate as a claw): dead level at chest height the tee camera saw the disc exactly
    // edge-on, "a thin hot-pink stick" with no plate or rim; tipped, the plate shows a lit ellipse above a darker rim
    char.hand.getWorldPosition(_gh).sub(_v); _nrm.normalize(); _gh.addScaledVector(_nrm, -_gh.dot(_nrm)).normalize();   // _gh: in-plane, centre to the gripped rim
    _gr.copy(_v).addScaledVector(_gh, .1); _nrm.addScaledVector(_gt.subVectors(camera.position, _v).normalize(), GRIP_TIP * w).normalize();
    _gt.set(1, 0, 0).applyQuaternion(camera.quaternion); _nrm.addScaledVector(_gt, -_nrm.dot(_gt) * w).normalize();   // and rolled about the view so its rim runs level across the frame: tipped sideways the plate read as a pink blade stabbing down past the hand
    _v.copy(_gr).addScaledVector(_gh.addScaledVector(_nrm, -_gh.dot(_nrm)).normalize(), -.1).addScaledVector(_nrm, -GRIP_SINK * w); }
  setDiscPose(mesh, [_v.x, _v.y, _v.z], [_nrm.x, _nrm.y, _nrm.z], spin);
}
function updateHub() { const i = COURSES.findIndex(c => c.id === G.courseId); UI.setHub({ name: G.avatar.name, jersey: G.avatar.jersey, course: COURSES[i], holes: LAYOUTS[i], img: asset('courses', G.courseId) }); }
let courseQueue=Promise.resolve(),wantedCourse=null;   // the last course asked for: Play pressed mid-load starts there, not on the one still showing
function loadCourse(id){wantedCourse=id;courseQueue=courseQueue.catch(()=>{}).then(()=>applyCourse(id));return courseQueue;}
async function applyCourse(id) {
  const def = courseById(id); if (course && course.def.id === def.id && course.quality === G.settings.quality) return;
  const first = !course; if (!first) { UI.fade(true); await sleep(340); }
  course?.dispose(); post?.dispose(); post = null; postEnabled = true; resolutionScale = 1; slowTime = 0; resize();
  renderer.toneMapping = toneFor(G.settings.quality); document.body.classList.toggle('gfx-mobile', G.settings.quality === 'low');
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
let startRun = 0;
async function startGame(config) {
  const run = ++startRun;
  G.phase = 'loading'; G.inbox = []; G.flight = null; G.remoteShot = null; G.pending = null; G.tween = null; G.cur = -1; cam.mode = 'courses';
  clearPlayers(); await loadCourse(config.courseId || wantedCourse || G.courseId);
  if (run !== startRun || G.phase !== 'loading') return false;   // left (or restarted) while the course loaded: no ghost round
  hero.group.visible = false;
  G.sessionId = config.sessionId || crypto.randomUUID(); G.shotSeq = 0; G.lastShotSeq = 0;
  G.seed = course.def.seed; G.holeCount = config.holeCount; G.holeIdx = 0; G.mode = config.mode; G.matchId = config.matchId || null; G.asyncThrows = [];
  G.players = config.players.map((p, i) => createPlayer({ ...p, color: p.color || p.avatar?.jersey || COLORS[i % COLORS.length] }, i));
  await warmShaders();
  if (run !== startRun || G.phase !== 'loading') { clearPlayers(); return false; }
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  for (const id of ['menu', 'setup', 'online', 'score', 'help', 'courses', 'locker', 'matches']) UI.hide(id);
  UI.show('hud'); UI.selectThrow(G.throwType); UI.selectDisc(G.discId);
  if (config.startHole) G.holeIdx = config.startHole;
  startHole();
  return true;
}
function startHole() {
  const h = holes[G.holeIdx]; course.setHole(G.holeIdx);
  const rng = makeRng(G.seed * 31 + G.holeIdx * 7 + 1);
  const ws = rng() * 3.5 * course.def.wind, wa = rng() * Math.PI * 2; world.wind = [Math.cos(wa) * ws, Math.sin(wa) * ws];
  const d = [h.basket[0] - h.tee[0], h.basket[1] - h.tee[1]], L = Math.hypot(d[0], d[1]); d[0] /= L; d[1] /= L;
  const r = rightOf(d);
  G.players.forEach((p, i) => {
    p.strokes = 0; p.done = false; p.lie = [h.tee[0], h.teeY, h.tee[1]]; p.lieDist = h.len; p.marker.visible = false;
    const row = Math.floor(i / 4), col = i % 4;
    const sx = h.tee[0] - d[0] * (1.2 + col * 1.3) - r[0] * (2.8 + row * 1.5), sz = h.tee[1] - d[1] * (1.2 + col * 1.3) - r[1] * (2.8 + row * 1.5);
    p.char.group.position.set(sx, world.height(sx, sz), sz);
    p.char.faceDir(d[0], d[1]); p.char.setPhase(null);
    ensureDisc(p, p.discId || 'driver'); p.discMesh.visible = false;
  });
  UI.setHud({ hole: G.holeIdx + 1, par: h.par, len: h.len, dist: h.len, throwNo: 'Tee', playerName: '' });
  UI.setControlsEnabled(false); UI.waiting(null); preview.visible = false;
  G.phase = 'intro'; G.introT = reducedMotion ? introDur(h) : 0; G.aim.pitch = 0; cam.mode = 'intro'; G.overview = false;
  // Broadcast-style title over the flyover (the HUD is hidden while data-phase is 'intro'; set it now so the HUD never flashes).
  const title = $('holeTitle'); if (title) { title.firstElementChild.textContent = `Hole ${G.holeIdx + 1}`; title.lastElementChild.textContent = `Par ${h.par} · ${Math.round(h.len)} m`; }
  document.body.dataset.phase = 'intro';
}
function updateWindHud() {
  const [wx, wz] = world.wind, ws = Math.hypot(wx, wz);
  UI.setHud({ windText: ws < 0.3 ? 'calm' : `${ws.toFixed(1)} m/s`, windDeg: (Math.atan2(wz, wx) - G.aim.yaw) * 180 / Math.PI - 90 });
}
function honorsOrder(hole = G.holeIdx) {   // best score on the previous hole tees first; a tie keeps that hole's own tee order
  const prev = hole - 1, before = prev >= 0 ? honorsOrder(prev) : G.players;
  return [...before].map((p, i) => ({ p, i })).sort((a, b) => (prev >= 0 ? (a.p.scores[prev] ?? 99) - (b.p.scores[prev] ?? 99) : 0) || a.i - b.i).map(o => o.p);
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
  UI.setPower(0); G.gesture = { power: 0, lateral: 0 }; G.previewDirty = true; G.previewPower = null; G.planDirty = false;
  G.phase = 'aim'; cam.mode = 'aim'; G.overview = false; $('btnOverview').classList.remove('on'); $('btnOverview').setAttribute('aria-pressed', 'false');
  if (p.isBot) { UI.setControlsEnabled(false); preview.visible = false; if (iControl(p)) botTurn(p); else UI.waiting(`${p.name} is throwing…`); }
  else if (isMine(p)) { UI.setControlsEnabled(true); UI.waiting(null); preview.visible = true; if (G.mode === 'local' && G.players.filter(q => !q.isBot).length > 1) UI.toast(`${p.name}'s throw`, `${Math.round(dist)} m to the basket`, 1600); }
  else { UI.setControlsEnabled(false); preview.visible = false; UI.waiting(`${p.name} is throwing…`); }
  if (G.mode === 'online' && G.net?.isHost) G.net.broadcast({ t: 'turn', sessionId: G.sessionId, turn: turnKey(G) });
}
async function botTurn(p) {
  const session = G.sessionId, hole = G.holeIdx, turn = turnKey(G);
  const stillBotTurn = () => p.isBot && iControl(p) && curP() === p && G.phase === 'aim' && G.sessionId === session && G.holeIdx === hole && turnKey(G) === turn;
  UI.waiting(`${p.name} is thinking…`);
  await sleep(700); if (!stillBotTurn()) return;
  const plan = await planBotThrow({ pos: p.lie, world, difficulty: p.difficulty, lefty: p.appearance?.hand === 'left' });
  if (!stillBotTurn()) return;
  G.throwType = plan.throwType; G.discId = plan.discId; UI.selectThrow(G.throwType); UI.selectDisc(G.discId); ensureDisc(p, G.discId); p.discMesh.visible = true;
  G.aim.yaw = Math.atan2(plan.dir[1], plan.dir[0]);
  UI.waiting(`${p.name} · ${THROWS[plan.throwType].name}, ${discById(plan.discId).type.toLowerCase()}`);
  G.phase = 'windup'; p.char.setThrow(G.throwType);
  G.tween = { t: 0, dur: 0.9, fn: u => { p.char.setPhase(u * 0.5); UI.setPower(plan.power * u); }, done: () => doThrow(G.cur, { power: plan.power, hyzer: plan.hyzer, yawOffset: plan.yawOffset, launchOffset: 0 }) };
}
function doThrow(pi, o, sim = null) {
  const p = G.players[pi];
  const startPhase = THREE.MathUtils.clamp(p.char.getPhase() ?? .5, 0, .5);
  G.phase = 'release'; G.releaseT = 0; G.pending = { pi, o, sim, fired: false, startPhase, leadIn: (.5 - startPhase) * .36 };
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
// A guest's throw request (or the host's replay of it) can be lost, e.g. over a relay link that dropped while a phone was locked,
// and the round then waited forever on "Confirming your throw…". Still waiting on the same turn after 7 s, the guest asks for a
// snapshot, which puts it back to aiming; it asks again every 12 s while the host is unreachable. A late confirmation cannot count
// twice: the host accepts one throw per turn key, and a replay older than the snapshot's shot number is ignored.
let confirmTimer = null;
function watchConfirm(turn, ms = 7000) {
  clearTimeout(confirmTimer);
  const room = G.net;
  confirmTimer = setTimeout(() => {
    if (G.net !== room || G.phase !== 'awaitThrow' || turnKey(G) !== turn || G.inbox.length) return;
    room.toHost({ t: 'sync-request' }); watchConfirm(turn, 12000);
  }, ms);
}
function launchNow() {
  G.remoteShot = null;
  const { pi, o, sim: given } = G.pending; const p = G.players[pi];
  let params, sim;
  if (given) { params = given.params; sim = given; }
  else {
    const d = aimDir(), pos = releasePos(world, p.lie, d);   // same release point the preview and bots plan from
    params = { throwType: G.throwType, discId: G.discId, power: o.power, hyzer: o.hyzer || 0, yawOffset: o.yawOffset || 0, launchOffset: o.launchOffset ?? G.aim.pitch, dir: d, pos, lefty: p.appearance?.hand === 'left' };
    if (G.mode === 'online' && !G.net.isHost) {
      G.net.toHost({ t: 'throw-request', turn: turnKey(G), params });
      G.phase = 'awaitThrow'; G.pending = null; UI.waiting('Confirming your throw…'); watchConfirm(turnKey(G)); return;
    }
    sim = runSim(params);
    const seq = ++G.shotSeq; G.lastShotSeq = seq;
    netSend({ t: 'throw', sessionId: G.sessionId, seq, turn: turnKey(G), pi, params, traj: sim.traj, events: sim.events, result: sim.result });
  }
  ensureDisc(p, params.discId); p.discMesh.visible = true; G.lastParams = params;
  G.flight = { pi, params, traj: sim.traj, events: sim.events, result: sim.result, t: 0, ei: 0, spin: 0, spinRate: 4 + speedFor(params.throwType, params.power) * 3 };
  G.flight.lock = params.throwType === 'putt' && staysInFrame(sim.traj);   // a putt holds its aim frame into the chains, unless it leaves that frame
  trail.start(discById(params.discId)?.color || "#ffffff");
  G.phase = 'flight'; cam.mode = 'flight'; sfx.whoosh(params.power);
  UI.setHud({ throwNo: `Throw ${p.strokes + 1}` });
}
// The putt's locked broadcast frame holds only while the disc stays inside it; a putt thrown long (a missed lag, a putt chosen
// from 25 m) used to sail out of the picture with the camera standing still. The aim camera is still in place at release.
function staysInFrame(traj) {
  camera.updateMatrixWorld();
  for (let i = 0; i < traj.length; i += 3) { const q = traj[i]; _v.set(q[0], q[1], q[2]).project(camera); if (_v.z > 1 || Math.abs(_v.x) > .88 || Math.abs(_v.y) > .9) return false; }
  const q = traj[traj.length - 1]; _v.set(q[0], q[1], q[2]).project(camera); return _v.z <= 1 && Math.abs(_v.x) <= .88 && Math.abs(_v.y) <= .9;
}
function updateFlight(dt) {
  const f = G.flight, p = G.players[f.pi], n = f.traj.length;
  const chainAt=f.events.find(e=>e[1]==='chains')?.[0];
  f.playbackRate=chainAt!==undefined && f.t>chainAt-.15 && f.t<chainAt+.40 ? .28 : f.params.throwType==='putt' ? 1 : CHASE.rate;
  dt*=f.playbackRate; f.t += dt;
  const fi = f.t * 60, i = Math.min(Math.floor(fi), n - 1), a = f.traj[i], b = f.traj[Math.min(i + 1, n - 1)], u = Math.min(1, fi - i);
  const pos = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  const nn = [a[3] + (b[3] - a[3]) * u, a[4] + (b[4] - a[4]) * u, a[5] + (b[5] - a[5]) * u];
  if (a.length > 6) f.spinRate = a[6] + (b[6] - a[6]) * u; else f.spinRate *= (1 - 0.12 * dt);   // older peers send six-wide records
  f.spin += f.spinRate * dt;
  setDiscPose(p.discMesh, pos, nn, f.spin * THROWS[f.params.throwType].spin * (f.params.lefty ? -1 : 1));
  f.pos = pos; f.hv = [b[0] - a[0], 0, b[2] - a[2]]; trail.push(pos, f.t);
  while (f.ei < f.events.length && f.events[f.ei][0] <= f.t) { onFlightEvent(f.events[f.ei][1]); f.ei++; }
  UI.setHud({ dist: Math.hypot(basketPos()[0] - pos[0], basketPos()[1] - pos[2]) });
  if (i >= n - 1 && f.t > n / 60 + 0.6) { G.flight = null; resolveThrow(f.pi, f.result, f); }
}
const SURFACE_AT = p => world.inWater(p[0], p[2]) ? 'water' : world.rough(p[0], p[2]) > 0.5 ? 'dirt' : 'grass';
function onFlightEvent(e) {
  if (document.hidden) return;
  const f = G.flight, at = f?.pos, strength = f?.hv ? Math.min(2, Math.hypot(f.hv[0], f.hv[2]) * 60 / 12) : 1;
  if (at && ['land', 'skip', 'flop', 'roll', 'splash'].includes(e)) puffs.burst(at, e, strength, e === 'splash' ? 'water' : SURFACE_AT(at));
  if (e === 'chains' || e === 'drop') { sfx[e === 'drop' ? 'drop' : 'chains'](G.flight?.params.power ?? .6); UI.toast('Chains!', 'Right in the heart!', 1600); return; }
  if ((e === 'chainout' || e === 'band' || e === 'rim') && !G.flight?.result.holed && !G.flight?.missReaction) { if(G.flight)G.flight.missReaction=true;sfx.ohh(); }
  const m = { land: () => sfx.thud(strength, at ? SURFACE_AT(at) : 'grass'), skip: () => sfx.skip(), tree: () => { sfx.tree(); UI.toast('Tree!', '', 900); }, branch: () => { sfx.leaves(); UI.toast('Kicked by a branch', '', 900); }, chains: () => sfx.chains(), drop: () => sfx.drop(), chainout: () => { sfx.chainout(); UI.toast('Chain out!', 'too hard', 1200); }, band: () => { sfx.band(); UI.toast('Off the band', '', 900); }, pole: () => sfx.pole(), arch: () => { sfx.pole(); UI.toast('Off the arch', '', 900); }, rim:() => { sfx.band(); UI.toast('Off the rim', '', 900); }, splash: () => sfx.splash(), roll: () => sfx.roll(), flop: () => sfx.thud(0.5), ob: () => {} };   // out of bounds: the womp plays with the verdict (resolveThrow)
  m[e]?.();
}
function resolveThrow(pi, r, f = null) {
  G.remoteShot = null;
  if (G.mode === 'async' && G.asyncThrows) G.asyncThrows.push({ t: G.lastParams?.throwType, d: G.lastParams?.discId, m: r.thrown, left: r.dist, ob: r.ob, holed: r.holed });
  const p = G.players[pi], h = holes[G.holeIdx];
  p.strokes++;
  let title, sub;
  if (r.holed) {
    p.done = true; p.scores[G.holeIdx] = p.strokes;
    if (isMine(p)) buzz([30, 40, 60]);
    p.char.react?.(p.strokes<h.par?'celebrate':p.strokes>h.par?'slump':'idle');
    title = UI.scoreName(p.strokes, h.par); sub = `${p.name} · ${p.strokes} throw${p.strokes > 1 ? 's' : ''}`;
    if (p.strokes <= h.par) { sfx.fanfare(p.strokes === 1 ? 'ace' : p.strokes - h.par <= -2 ? 'eagle' : p.strokes - h.par === -1 ? 'birdie' : 'par'); sfx.applause(); }
    if (!reducedMotion && p.strokes <= h.par) { const at = p.char.group.position; celebration.burst([at.x, at.y, at.z], p.strokes === 1 || p.strokes < h.par - 1); }
  } else if (r.ob) { p.strokes++; p.lie = r.lie; title = 'Out of bounds'; sub = '+1 penalty · play from where it went out'; }
  else { p.lie = r.rest; title = r.thrown < 1 ? 'Dropped it' : `${Math.round(r.thrown)} m · ${world.rough(r.rest[0], r.rest[2]) > .5 ? 'Rough' : 'Fairway'}`; sub = `${r.dist.toFixed(r.dist < 20 ? 1 : 0)} m to the basket${Number.isFinite(r.airTime) ? ` · ${r.airTime.toFixed(1)} s flight` : ''}`; }
  if (!r.holed && !r.ob && r.thrown > 8 && r.dist < Math.max(8, p.lieDist * .35)) { title = 'Nice shot!'; sfx.applause(); }
  // The gallery's verdict: a good throw gets the group clapping (on screen and the other players on the course), a bad one a
  // sad trombone and the thrower's slump. A chain-out already drew its "ohh" in flight.
  const bad = !r.holed && (r.ob || r.thrown < 1 || r.dist > p.lieDist + 2 || (p.lieDist > 12 && r.thrown < p.lieDist * .3) || (p.lieDist <= 5 && !f?.missReaction));
  const good = r.holed ? p.strokes <= h.par : title === 'Nice shot!';
  if (good) { UI.react('good'); for (const q of G.players) if (q !== p) q.char.react?.('clap'); }
  else if (bad) { UI.react('bad'); sfx.womp(); p.char.react?.('slump'); }
  else if (r.holed) sfx.claps();
  if (!p.done && p.strokes >= h.par + 5) { p.done = true; p.scores[G.holeIdx] = h.par + 6; title = 'Picked up'; sub = `max score for the hole (${h.par + 6})`; }   // a fixed cap, even when the last throw went out of bounds
  p.lieDist = distToBasket(p.lie[0], p.lie[2]);
  p.marker.position.set(p.lie[0], world.height(p.lie[0], p.lie[2]) + 0.04, p.lie[2]); p.marker.visible = !p.done;
  const session = G.sessionId, hole = G.holeIdx;
  if (p.done) setTimeout(() => { if (G.sessionId === session && G.holeIdx === hole && p.done && G.players.includes(p)) p.discMesh.visible = false; }, 2500);
  UI.toast(title, sub, r.holed ? 2400 : 2000); UI.setHud({ dist: p.lieDist, holed: r.holed });
  cam.hold = r.holed ? null : { fov: cam.fov, shift: cam.shift };   // a miss holds the landing shot (or the putt's locked frame); only a holed throw cuts to the reaction
  G.phase = 'result'; cam.mode = 'result';
  updateCamera(10); // Cut to the reaction so a short celebration never starts offscreen.
  setTimeout(() => { if (G.sessionId === session && G.holeIdx === hole && curP() === p && G.phase === 'result') { UI.fade(true); setTimeout(() => { if (G.sessionId === session && G.holeIdx === hole && G.phase === 'result') nextTurn(); UI.fade(false); }, 320); } }, 2400);
}
function endHole() {
  G.phase = 'holeEnd'; preview.visible = false; UI.setControlsEnabled(false);
  if (G.mode === 'async') {   // an invite match: one turn is one hole; the score goes to the match and the next player gets the ping
    const p = G.players[0], summary = { matchId: G.matchId, hole: G.holeIdx, strokes: p.scores[G.holeIdx], throws: G.asyncThrows.slice(0, 20) }, session = G.sessionId;
    setTimeout(() => { if (G.sessionId !== session) return; toMenu(); matches.holeDone(summary); }, 900);
    return;
  }
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
  const nextHole = G.holeIdx >= G.holeCount - 1 ? 0 : G.holeIdx + 1;   // a shot for the next hole that reached a lagging guest early is kept, not thrown away
  G.inbox = G.inbox.filter(m => m.sessionId === G.sessionId && m.turn?.split(':')[1] === String(nextHole)); G.flight = null; G.pending = null; G.tween = null;
  UI.hide('score'); UI.show('hud');
  if (G.holeIdx >= G.holeCount - 1) { for (const p of G.players) p.scores = []; G.holeIdx = 0; } else G.holeIdx++;
  startHole();
}
function applyRemoteThrow(m) {   // only called when this client is idle in 'aim' (or still in the intro)
  if (m.sessionId !== G.sessionId || !G.players[m.pi] || m.turn !== turnKey(G)) { G.net?.toHost({ t: 'sync-request' }); return; }
  G.remoteShot = m;
  if (G.cur !== m.pi) setupTurn(m.pi);
  G.throwType = m.params.throwType; G.discId = m.params.discId; UI.selectThrow(G.throwType); UI.selectDisc(G.discId);
  G.aim.yaw = Math.atan2(m.params.dir[1], m.params.dir[0]);
  const p = G.players[m.pi]; ensureDisc(p, G.discId); p.discMesh.visible = true; UI.waiting(null); preview.visible = false;
  G.tween = { t: 0, dur: 0.7, fn: u => p.char.setPhase(u * 0.5), done: () => doThrow(m.pi, {}, { traj: m.traj, events: m.events, result: m.result, params: m.params }) };
  G.phase = 'windup'; p.char.setThrow(G.throwType); cam.mode = 'aim';
}
function toMenu() {
  if (G.net?.isHost) try { G.net.broadcast({ t: 'closed' }); } catch { /* best effort */ }
  celebration.clear();
  input.cancel(); for (const t of disconnectTimers.values()) clearTimeout(t); disconnectTimers.clear(); deferredNet = [];
  G.sessionId = ''; G.cur = -1; G.nextRequested = null; G.syncing = false;
  G.phase = 'menu'; G.flight = null; G.pending = null; G.tween = null; cam.mode = 'menu'; G.inbox = [];
  clearPlayers(); preview.visible = false; for (const id of ['hud', 'score', 'online', 'setup', 'courses', 'locker']) UI.hide(id); UI.show('menu');
  hero.group.visible = true; course.setHole(0); placeHero();
  if (G.net) { G.net.close(); G.net = null; }
  G.mode = 'solo'; G.matchId = null; matches.refreshBadge();
}

// ---------- gestures ----------
function onAim({ dx, dy, speed = 0, touch = false }) {
  if ((G.phase !== 'aim' && G.phase !== 'windup') || !isMine(curP()) || curP().isBot) return;   // a second finger keeps aiming through the swipe
  // a thumb's slow drag is fine aim (~9° per 100 px), a quick one sweeps (~22°); mouse and keys keep the old rate
  const k = G.overview ? 0.0025 : touch ? .0016 + .0022 * Math.min(1, speed / 1.2) : 0.0038;
  G.aim.yaw += dx * k;
  G.aim.pitch = Math.max(-6, Math.min(16, G.aim.pitch - dy * (touch ? .045 : 0.06)));
  if (touch) coach.aimed(Math.hypot(dx, dy), G.phase === 'windup');
  G.planDirty = true; G.planChangedAt = performance.now();
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
  if (g.state === 'cancel' || !g.valid) { G.phase = 'aim'; p.char.setPhase(null); UI.setPower(0); G.gesture.power = 0; G.previewDirty = true; if (g.state !== 'cancel') UI.badSwipe(G.throwType); else UI.setHint(G.throwType, 'longer swipe = more power'); return; }
  // fire
  const th = THROWS[G.throwType], wob = Math.min(1, g.wobble * 1.5);
  const o = { power: g.progress, hyzer: 0, yawOffset: (Math.random() - 0.5) * 6 * wob, launchOffset: G.aim.pitch };
  if (th.latMode === 'hyzer') o.hyzer = Math.max(-35, Math.min(35, g.lateral * 80)); else o.yawOffset += Math.max(-25, Math.min(25, g.lateral * 50));
  UI.setHint(G.throwType, 'longer swipe = more power');
  buzz(15); coach.thrown();
  doThrow(G.cur, o);
  document.body.classList.add('thrown');   // the swipe hint fades after the first real throw (ui.css)
}
function gestureParams(power, lateral) {
  const th = THROWS[G.throwType], p = curP();
  const o = { throwType: G.throwType, discId: G.discId, disc: discById(G.discId), power, hyzer: 0, lefty: p.appearance?.hand === 'left', yawOffset: 0, launchOffset: G.aim.pitch, dir: aimDir(), pos: releasePos(world, p.lie, aimDir()) };
  if (th.latMode === 'hyzer') o.hyzer = Math.max(-35, Math.min(35, lateral * 80)); else o.yawOffset = Math.max(-25, Math.min(25, lateral * 50));
  return o;
}
const previewWorld = () => ({ ...world, treesNear: () => [], basket: world.basket });
function updatePreview() {
  if (!preview.visible) return;
  const now = performance.now();
  // Refresh the power search after aim settles, keeping swipe feedback cheap.
  if (G.planDirty && G.phase === 'aim' && now - G.planChangedAt > 200) { G.previewPower = null; G.previewDirty = true; G.planDirty = false; }
  if (!G.previewDirty || now - G.lastPreview < 70) return;
  G.previewDirty = false; G.lastPreview = now;
  // The landing guide plans the shot; it never solves the putt. Inside the circle, for putts, and once the swipe starts,
  // the ribbon stops at 70% of the flight and the ring, readout and power mark go away, so the player's swipe decides it.
  const charging = G.phase === 'windup', assist = G.throwType !== 'putt' && curP().lieDist > 10, guided = assist && !charging;
  if (G.previewPower == null) G.previewPower = assist ? suggestPower(gestureParams(.72, 0), previewWorld()) : .72;
  const pw = charging ? Math.max(.10, G.gesture.power) : G.previewPower;
  const o = gestureParams(pw, charging ? G.gesture.lateral : 0);
  const r = simulate(o, previewWorld(), { record: true, every: 6, maxT: 12 });
  const estimate = shotGuide.set(r.result, world, G.throwType === 'putt');
  shotGuide.group.visible = guided;
  UI.setShotPlan(guided ? { ...estimate, power: pw } : null, assist ? G.previewPower : null);
  G.shotPreview = { ...estimate, power: pw, rest: r.result.rest, guided };
  const lie = curP().lie, pts = (guided ? r.traj : r.traj.slice(0, Math.max(2, Math.floor(r.traj.length * 0.7)))).filter((q, i, a) => i >= a.length - 2 || Math.hypot(q[0] - lie[0], q[2] - lie[2]) > 1.5);   // the ribbon starts at the thrower's shoulder instead of slashing across his back
  const arr = new Float32Array(pts.length * 3); pts.forEach((q, i) => { arr[i * 3] = q[0]; arr[i * 3 + 1] = q[1]; arr[i * 3 + 2] = q[2]; });
  for (const l of previewLines) { const old = l.geometry; l.geometry = new LineGeometry(); l.geometry.setPositions(arr); l.computeLineDistances(); old.dispose(); }
  previewMat.color.set(guided && estimate.danger ? '#ff9275' : charging ? '#5cf0a8' : '#ffffff');
  const p = curP(), d = aimDir(), ax = p.lie[0] + d[0] * 1.15, az = p.lie[2] + d[1] * 1.15, n = world.normal ? world.normal(ax, az) : [0, 1, 0];
  aimArrow.position.set(p.lie[0] + d[0] * 1.7, world.height(p.lie[0] + d[0] * 1.7, p.lie[2] + d[1] * 1.7) + .04, p.lie[2] + d[1] * 1.7);
  aimArrow.quaternion.setFromUnitVectors(UP, _v.set(n[0], n[1], n[2]).normalize()).multiply(_q0.setFromAxisAngle(UP, Math.atan2(-d[0], -d[1]))); aimArrow.material.color.copy(previewMat.color);   // laid on the slope, so the depth test never buries its tail   // tip 1.7 m out, pointing down the aim (it used to point back at the player)
}

// ---------- camera ----------
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const baseFov = () => camera.aspect < 0.8 ? 74 : camera.aspect < 1.2 ? 66 : 58;   // mirrors resize(); narrower lenses below are per camera mode
const DEG = Math.PI / 180;
cam.shift = cam.tShift = 0;   // vertical lens shift in half-frames (a putt's level camera looking down onto the green), eased like the pose
// Over-the-left-shoulder aim frame (the Disc Golf Masters broadcast lens): a chest-high camera ~2 m behind the athlete's left
// shoulder, near level, so he fills the right third cropped at the thigh. Drives: axis a few degrees right of the aim, pin
// left of centre, horizon just under the middle, head ~18% from the top. Putts: a 24° (tall) lens 3.4 m from the athlete and
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
// That rig lost once the woods behind brightened: at 39% and 54% down the basket read as a small prop sunk in the lower left
// under the athlete's torso. Measured off the reference at 640x360 (its green sits 1 m *above* the lie; ours ~1 m under), the
// pin stands on the midline (flag 29%, lid 40%, band 45%, base ~72%), the far ground line ~60% down, his back x 0.72-0.92 with
// eyes ~20%. So the lens is a dolly-zoom longer (42° across, 24° tall) from 3.1 m back and 1.35 m aside: the athlete keeps his
// size and is pushed to the right edge, the pin grows ~15% and sits at 49%, band 45%, base ~78%, far ground ~60%.
// The camera stays level and slides its lens
// instead (cam.shift, applyViewOffset), so a green below the lie drops into frame without tipping the trunks inward (pitched
// down onto the tray, it read as looking into a pit). It takes the height (lo-hi) that sets the athlete's eyes at P.eye and the
// basket band at P.band (half-frame units above centre: 20% and 45% from the top), so uphill, flat and downhill greens frame
// alike; a short putt's bigger basket lifts the band until its base plate stays over P.base (86%, a phone's 82%). On the
// course's downhill putts (every green sits ~1 m under a 6.5 m lie) that puts the lens ~1.8 m up. A short phone (puttS) keeps
// the earlier 2.3 m rig, the pin at 38% and the band at the midline: its 29° lens is set by the swipe ring, not hfov.
// Out of the lo-hi range the band wins until the eyes would pass P.eye. A lateral nudge of up to P.nudge clears trunks from
// behind the basket (puttDodge). Portrait keeps its lift rule. Wide screens hold the horizontal lens (hfov), a 2:1 phone
// widening past it rather than cropping under P.vmin tall (29° on a short phone, whose swipe ring takes the frame's lower
// third); portrait holds the vertical one. Shared by the aim camera and the hole intro's landing. Writes pos/look, returns the
// vertical fov.
const AIM = { drive: { back: 2.3, side: .75, up: 1.42, pitch: 2, yaw: 4.8, hfov: 55 }, putt: { back: 3.1, side: 1.35, lo: .9, hi: 2.3, eye: .55, band: .16, base: -.72, x: .03, nudge: [-.05, .15], hfov: 42, vmin: 10 },
  tall: { drive: { back: 2.9, side: .5, up: 1.5, pitch: 5, yaw: 2.6, fov: 60 }, putt: { back: 2.3, side: .6, up: 1.4, lift: .3, eye: .58, band: .1, fov: 56 } } };
// w7-3 camera verdicts (won 4/4, narrow): "his head almost touches the top edge", "the basket sits a little low over empty dirt": eyes .6 -> .55 (head top ~12%) and band .1 -> .16 (the lid ~42% down, as in the reference), so the rig rises a little and the basket stands higher over less dirt.
AIM.puttS = { ...AIM.putt, back: 2.3, side: 1.2, hi: 1.9, hfov: 50, eye: .6, band: -.02, base: -.64, x: .24 };
// A phone on its side (playtest: "the player goes off the screen"): the broadcast drive lens cut the athlete at the hip and
// pushed his arm out of the right edge. Further back on a taller lens he stands whole, feet to head, in the right third over
// the swipe pad (ui.css landscape split), with the line and the pin left of centre.
AIM.driveS = { back: 3.4, side: .95, up: 1.55, pitch: 5, yaw: 0, vfov: 38 };   // a short phone: the swipe pill and ring fill the lower third's middle, so the pin stands further left (38%) with its base plate beside them
function aimFrame(lie, d, putt, pos, look) {
  const h = holes[G.holeIdx], r = rightOf(d), portrait = camera.aspect < 1.2, P = portrait ? AIM.tall[putt ? 'putt' : 'drive'] : putt ? innerHeight > 520 ? AIM.putt : AIM.puttS : innerHeight > 520 ? AIM.drive : AIM.driveS;
  const vt = portrait ? Math.tan(P.fov * DEG / 2) : P.vfov ? Math.tan(P.vfov * DEG / 2) : Math.max(Math.tan((innerHeight > 520 && P.vmin || 14.5) * DEG), Math.tan(P.hfov * DEG / 2) / camera.aspect);   // tangent of the vertical half-angle; 29° at least on a short phone, so it keeps headroom
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
// The hole flyover (the Disc Golf Masters intro flies the hole from the tee to the basket). It opens on that establishing
// drone, easing forward and down toward the tee exactly as before, so the frame at 1.7 s is unchanged; from there one line
// carries on out over the event arch's banner (never through it) and glides down the fairway (w12 critics: "plunges into the
// woods at ground level with the heading wandering", "lands against the side of a tree", "never lands on the basket"): a gentle
// descent from ~10 m over the arch to ~4 m over the turf, under the crowns, riding the ground's humps, the eyes locked on the basket from the
// arch on so the heading never swings, each key shifted off the line only where a crown blocks the leg in (and then kept
// near the last key's shift), to a basket-centred view 6.5 m short of it, held a beat; a white flash takes it back to the tee.
// One centripetal Catmull-Rom in space walked by arc length on one Hermite in time whose start speed is the push-in's at 1.7 s.
const INTRO_T1 = 1.7, INTRO_HOLD = 1.1, INTRO_FLASH = .16, introSpan = h => Math.min(4.6, Math.max(3.8, h.len / 19)), introDur = h => INTRO_T1 + introSpan(h) + INTRO_HOLD;
const intro = { key: '' };
const flashEl = document.body.appendChild(Object.assign(document.createElement('div'), { style: 'position:fixed;inset:0;z-index:19;background:#fff;opacity:0;pointer-events:none' })); let flashA = 0;
function wayAt(h, a) {   // the hole's own line (tee, dogleg, basket) a metres from the tee: [x, z, ux, uz]
  const w = h.way; let i = 0;
  for (; i < w.length - 2; i++) { const L = Math.hypot(w[i + 1][0] - w[i][0], w[i + 1][1] - w[i][1]); if (a <= L) break; a -= L; }
  const p = w[i], q = w[i + 1], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, ux = (q[0] - p[0]) / L, uz = (q[1] - p[1]) / L;
  return [p[0] + ux * a, p[1] + uz * a, ux, uz];
}
function introPath(h, t, pos, look) {
  const d = [h.basket[0] - h.tee[0], h.basket[1] - h.tee[1]], L = Math.hypot(d[0], d[1]); d[0] /= L; d[1] /= L;
  const r = rightOf(d), I = INTRO, f0 = baseFov(), u = ease(Math.min(t, INTRO_T1) / 4.7);
  _v.set(h.tee[0], h.teeY, h.tee[1]); const aimFov = aimFrame(_v, d, false, _v2, _v3);   // the old push-in's landing: the tee's aim camera
  const P0 = _v.set(h.tee[0] - d[0] * I.back - r[0] * I.side, h.teeY + I.up, h.tee[1] - d[1] * I.back - r[1] * I.side), ax = h.tee[0] + d[0] * I.ahead, az = h.tee[1] + d[1] * I.ahead;
  if (t <= INTRO_T1) {
    pos.lerpVectors(P0, _v2, u); look.set(ax, world.height(ax, az) + I.lift, az).lerp(_v3, u);
    pos.y = Math.max(pos.y, world.height(pos.x, pos.z) + 1.6); return f0 + (aimFov - f0) * u;
  }
  const key = `${G.holeIdx}:${h.tee}:${camera.aspect.toFixed(3)}:${innerHeight}`;
  if (intro.key !== key) {
    const P1 = new THREE.Vector3().lerpVectors(P0, _v2, u), L1 = new THREE.Vector3(ax, world.height(ax, az) + I.lift, az).lerp(_v3, u); P1.y = Math.max(P1.y, world.height(P1.x, P1.z) + 1.6);
    const v1 = 4 * INTRO_T1 / 4.7 ** 2 * P0.distanceTo(_v2);   // the push-in's speed at 1.7 s
    const Lw = h.way.reduce((s, q, i) => i ? s + Math.hypot(q[0] - h.way[i - 1][0], q[1] - h.way[i - 1][1]) : 0, 0);
    const gnd = (x, z) => Math.max(world.height(x, z), world.height(x + 5, z), world.height(x - 5, z), world.height(x, z + 5), world.height(x, z - 5));   // rides over humps, never into them
    const over = (x, y, z) => (world.capsules || []).reduce((m, c) => Math.min(Math.hypot(c.a[0] - x, c.a[2] - z), Math.hypot(c.b[0] - x, c.b[2] - z)) < 9 ? Math.max(m, c.a[1] + c.r + 3.5, c.b[1] + c.r + 3.5) : m, y);   // 3.5 m over the arch's beam (only near it: past it the line drops under the crowns)
    const B = new THREE.Vector3(h.basket[0], h.basketY + .9, h.basket[1]);
    let s0 = 0;
    const at = (a, up, from, g = gnd) => {   // over the line a m out: a clear leg in first, then room from the crowns beside it (w12: "a tree canopy covers the left 40% of the frame"), then the smallest move off the last key's shift
      let best = null, sc = -1e9, bs = 0;
      for (const side of [0, -1.5, 1.5, -3, 3, -4.5, 4.5]) for (const dy of [0, 1, 2, 4]) {
        const [x0, z0, wx, wz] = wayAt(h, a), x = x0 - wz * side, z = z0 + wx * side, y = over(x, g(x, z) + up + dy, z);
        const room = world.treesNear(x, z).reduce((m, t) => t.y + t.fy - t.fr < y + 3 ? Math.min(m, Math.hypot(t.x - x, t.z - z) - t.fr) : m, 5);   // metres to the nearest crown low enough to fill the frame's side
        const inside = world.treesNear(x, z).reduce((m, t) => Math.min(m, Math.hypot(t.x - x, t.z - z, y - t.y - t.fy) - t.fr * 1.2), 1);   // < 0: the key itself sits in a crown (the leg's cast only docks 5% for a hit at its far end)
        const q = clearFraction(world, from.x, from.y, from.z, x, y, z, .8, 0, 1.5) + Math.max(0, room) * .08 + Math.min(0, inside) - Math.abs(side - s0) * .03 - Math.abs(side) * .02 - dy * .04;
        if (q > sc + 1e-3) { sc = q; best = new THREE.Vector3(x, y, z); bs = side; }
      }
      s0 = bs; return best;
    };
    const a2 = Math.min(Math.max(14, Lw * .36), Lw * .6), aE = Lw - 6.5, n = Math.max(1, Math.round((aE - a2) / 12)), K = [P1, at(a2, 10, P1)];   // over the arch, then a key every ~12 m
    for (let i = 1; i < n; i++) K.push(at(a2 + (aE - a2) * i / n, 4, K[K.length - 1], world.height));
    const [, , ux, uz] = wayAt(h, Lw), rb = rightOf([ux, uz]); let P4 = null, best = -1;
    for (const sg of [0, 1.5, -1.5, 3, -3]) {   // the basket straight ahead, from wherever the woods leave the view open
      const x = h.basket[0] - ux * 6.5 + rb[0] * sg, z = h.basket[1] - uz * 6.5 + rb[1] * sg, y = Math.max(h.basketY + 1.9, world.height(x, z) + 1.7);
      const fr = clearFraction(world, B.x, B.y, B.z, x, y, z, .8) - Math.abs(sg) * .02; if (fr > best + .05) { best = fr; P4 = new THREE.Vector3(x, y, z); }
    }
    K.push(P4);
    intro.pos = new THREE.CatmullRomCurve3(K, false, 'centripetal'); intro.L1 = L1; intro.B = B;
    intro.look = h.way.length > 2 ? new THREE.CatmullRomCurve3([L1, ...Array.from({ length: n }, (_, i) => { const [x, z] = wayAt(h, Math.min(a2 + (aE - a2) * i / n + 25, Lw)); return new THREE.Vector3(x, world.height(x, z) + 1.5, z); }), B], false, 'centripetal') : null;   // a dogleg's eyes follow its bend (locked on the basket they would stare into the woods)
    intro.m0 = Math.min(1.5, v1 * introSpan(h) / intro.pos.getLength()); intro.key = key;
  }
  const s = Math.min(1, (t - INTRO_T1) / introSpan(h)), e = Math.min(1, (s * s * s - 2 * s * s + s) * intro.m0 + s * s * (3 - 2 * s));   // Hermite: leaves at the push-in's speed, settles to rest on the basket
  intro.pos.getPointAt(e, pos); if (intro.look) intro.look.getPointAt(e, look); else look.lerpVectors(intro.L1, intro.B, THREE.MathUtils.smoothstep(e, 0, .3));   // the eyes slide down the line on to the basket and stay there
  return f0 + (aimFov - f0) * u;
}
// Disc flight camera (the critics: "it flies itself into the scenery instead of following the disc"; it used to trail a
// fixed 9 m behind on a lagging lerp, so it rushed the tee arch and dived into the hill). It holds the aim frame for the
// follow-through, then blends (with a lift over the athlete's head) into a chase CHASE.back behind and CHASE.up over the disc,
// looking a little ahead of it along its heading so the disc sits in the frame's centre third. The chase is placed on the disc
// every frame (no lag); only the heading is smoothed. Each frame the segment from the disc out to the wanted spot is cast
// against trunks, crowns, the arch and the ground (cam-collide.js); a hit pulls the camera in fast and it lets out slowly.
// Around touchdown (known ahead: the flight is simulated before it plays) it eases into a raised three-quarter shot that
// frames where the disc comes to rest with the basket beyond it, and a miss holds that shot through the result.
// Under the event arch the chase ducks: near the beam it stays 3 m under the banner's lower edge (the disc passes ~4 m
// up, the banner's edge 6+), so the gate frames the fairway and the banner only grazes the top edge for an instant instead of
// filling it (the critics: "flies straight into the tee arch"). Never below `floor` (just over the disc).
function beamCeiling(x, z, floor) {
  let y = Infinity;
  for (const c of world.capsules || []) {
    if (Math.abs(c.a[1] - c.b[1]) > .5) continue;   // the beam; the legs are upright
    const ex = c.b[0] - c.a[0], ez = c.b[2] - c.a[2], s = Math.max(0, Math.min(1, ((x - c.a[0]) * ex + (z - c.a[2]) * ez) / (ex * ex + ez * ez || 1))), d = Math.hypot(x - c.a[0] - ex * s, z - c.a[2] - ez * s);
    if (d < 25) y = Math.min(y, c.a[1] - c.r - 3.2 + Math.max(0, d - 1) * .3);
  }
  return Math.max(y, floor);
}
const CHASE = { fov: 50, hold: .1, blend: .6, back: 4.5, up: 1.5, lead: 3, lift: .3, land: .45, rate: .75, track: 6 };   // rate: a drive plays at 3/4 speed, a 60 m drive hangs ~2.5 s as a real one does (the physics' 1.9 s read as a dolly shot)
function flightPlan(f) {
  const n = f.traj.length, R = f.traj[n - 1], S = f.traj[0], h = holes[G.holeIdx];
  // the landing shot takes over once the disc is nearly home: a roller runs on for seconds after it touches down (one ran 30 m
  // downhill through the woods while the camera already stood at its resting place), and the chase rides along until then
  const e = f.events.find(e => /^(land|splash|flop|roll)$/.test(e[1])); let k = n - 1;
  while (k > 0 && Math.hypot(f.traj[k - 1][0] - f.traj[n - 1][0], f.traj[k - 1][2] - f.traj[n - 1][2]) < 5) k--;
  const tLand = Math.max(e ? e[0] : n / 60, k / 60);
  const bx = h.basket[0] - R[0], bz = h.basket[1] - R[2], bd = Math.hypot(bx, bz), sd = Math.hypot(R[0] - S[0], R[2] - S[2]) || 1, fx = (R[0] - S[0]) / sd, fz = (R[2] - S[2]) / sd;
  let ux = bd > 2 ? bx / bd : fx, uz = bd > 2 ? bz / bd : fz; if (ux * fx + uz * fz < -.2) { ux = fx; uz = fz; }   // past the pin: keep looking the way it flew, never swing round
  const rs = rightOf([ux, uz]), ry = R[1] + .1;
  const pref = (S[0] - R[0]) * rs[0] + (S[2] - R[2]) * rs[1] > 0 ? 1 : -1, T = [h.basket[0], h.basketY + 1.3, h.basket[1]];
  // Behind the disc on the side it came from first, raised until the basket shows over the crest; in the woods (a roller that
  // ran in under the trees) swung round it, and in closer, until the line to the disc is clear. The camera stands where that
  // line is still clear: it used to be pushed out to at least 45% of the way, past a trunk the line hit sooner, and the whole
  // result shot was bark.
  // metres a spot stands inside a crown's leaf spread (the cards reach past the collider) or a trunk's berth
  const crowded = P => world.treesNear(P.x, P.z).reduce((m, t) => Math.max(m, t.fr * 1.3 - Math.hypot(t.x - P.x, t.y + t.fy - P.y, t.z - P.z), t.r + 1.2 - Math.hypot(t.x - P.x, t.z - P.z)), 0);
  let LP = null, best = -Infinity;
  for (const ang of [.35, -.35, .9, -.9, 1.5, -1.5, 2.3, -2.3]) for (const reach of [6.4, 3.8]) for (const up of [2.2, 3.4, 4.6, 6]) {   // 2.2: under a low canopy
    const ca = Math.cos(ang), sa = Math.sin(ang) * pref, dx = -ux * ca + rs[0] * sa, dz = -uz * ca + rs[1] * sa;
    const x = R[0] + dx * reach, z = R[2] + dz * reach, y = Math.max(world.height(x, z) + up * reach / 6.4 + .1, ry + up * reach / 6.4);
    const fr = clearFraction(world, R[0], ry, R[2], x, y, z, 1, 1.2, 1.05), P = new THREE.Vector3(R[0] + (x - R[0]) * fr, ry + (y - ry) * fr, R[2] + (z - R[2]) * fr), out = P.distanceTo(_v.set(R[0], ry, R[2]));
    const sight = bd > 2 && bd < 45 ? clearFraction(world, P.x, P.y, P.z, T[0], T[1], T[2], .2, .3, .7) : 1;
    const score = fr * 2 + sight - Math.abs(up - 3.4) * .06 - Math.abs(ang) * .12 - (reach < 6 ? .35 : 0) - (out < 2.2 ? 3 : 0) - crowded(P) * .8;
    if (score > best) { best = score; LP = P; }
  }
  if (LP.distanceTo(_v.set(R[0], ry, R[2])) < 2.2) LP.set(R[0] - ux * 1.2, ry + 2.6, R[2] - uz * 1.2);   // boxed in: look down on it from just over its head
  // aim between the disc at rest and the basket so both hold the frame (the disc low, the pin and the tree line beyond it, not a wall of hillside); a far pin: down the line
  const la = Math.min(bd * .45, 9), LL = new THREE.Vector3(R[0] + ux * la, ry + .25 + la * .06, R[2] + uz * la);
  if (bd > 2 && bd < 45) { _v.set(R[0], ry, R[2]).sub(LP).normalize(); _v2.set(...T).sub(LP).normalize();
    const pin = _v.dot(_v2) > .72 ? .5 : _v.dot(_v2) > .55 ? .3 : 0;   // the pin shares the frame only while it stands near the disc's bearing; the disc stays in it
    LL.copy(LP).addScaledVector(_v.multiplyScalar(1 - pin).addScaledVector(_v2, pin).normalize(), 10); }
  return { H: cam.pos.clone(), HL: cam.look.clone(), F0: cam.fov, S0: cam.shift, dir: new THREE.Vector3(f.params.dir[0], 0, f.params.dir[1]).normalize(), pull: 1, tLand, LP, LL };
}
function flightCam(f, dt) {
  const D = f.pos, c = f.cam || (f.cam = flightPlan(f)), S = THREE.MathUtils.smoothstep;
  _v3.set(f.hv[0], 0, f.hv[2]); if (_v3.lengthSq() > 1e-8) c.dir.lerp(_v3.normalize(), 1 - Math.exp(-4 * dt)).normalize();
  const hv = c.dir; let cx = D[0] - hv.x * CHASE.back, cy = D[1] + CHASE.up, cz = D[2] - hv.z * CHASE.back;
  const fr = clearFraction(world, D[0], D[1], D[2], cx, cy, cz, 1.2);   // wide of trunks and well under the arch's banner
  c.pull += (fr - c.pull) * (1 - Math.exp(-(fr < c.pull ? 7 : 2.5) * dt));   // in briskly past a trunk, out slowly; never a one-frame lurch
  const q = Math.max(.25, c.pull); cx = D[0] + (cx - D[0]) * q; cy = D[1] + (cy - D[1]) * q; cz = D[2] + (cz - D[2]) * q;
  const ceil = beamCeiling(cx, cz, D[1] + .2), lift = CHASE.lift * Math.max(0, Math.min(1, (ceil - D[1] - 1) / 2));   // under the arch: level with the disc, the banner out of the top of frame
  cy = Math.min(Math.max(cy, D[1] + 1), ceil); cy = Math.max(cy, world.height(cx, cz) + 1.5);
  const w = S(f.t, CHASE.hold, CHASE.hold + CHASE.blend), wl = S(f.t, CHASE.hold * .5, CHASE.hold + CHASE.blend * .8), wg = S(f.t, c.tLand - CHASE.land, c.tLand + CHASE.land * 1.4);
  const arc = Math.sin(Math.PI * w), rt = rightOf([hv.x, hv.z]); _v.set(cx - rt[0] * arc, cy + arc * 1.5, cz - rt[1] * arc);   // up and past the thrower's left shoulder (the aim camera's side), never through his head
  // A critically damped tracker on the chase spot, fed its velocity: the camera leaves the follow-through at rest and eases up
  // to the disc's speed. (Lerping from the fixed aim spot to a target running away at 25 m/s made it sit still, then race the
  // disc at twice its speed to catch a 14 m gap.) Zero lag once caught, no overshoot.
  if (!c.p) { c.p = c.H.clone(); c.pv = new THREE.Vector3(); c.T = _v.clone(); }
  if (dt > 0) {
    _v2.copy(_v).sub(c.T).divideScalar(dt); c.T.copy(_v);
    if (f.t > CHASE.hold) for (let i = 0, n = Math.ceil(dt / .008), h = dt / n, W = CHASE.track; i < n; i++) {
      c.pv.addScaledVector(_v3.copy(_v).sub(c.p), W * W * h).addScaledVector(_v3.copy(_v2).sub(c.pv), 2 * W * h); c.p.addScaledVector(c.pv, h);
    }
  }
  cam.tPos.copy(c.p);
  cam.tLook.lerpVectors(c.HL, _v2.set(D[0] + hv.x * CHASE.lead, D[1] + lift, D[2] + hv.z * CHASE.lead), wl);   // a little over the disc: the fairway ahead and the tree line, not a wall of hillside
  if (wg > 0) { cam.tPos.lerp(c.LP, wg); cam.tLook.lerp(c.LL, wg); }
  cam.tShift = (c.S0 || 0) * (1 - w);   // a long putt leaving its locked frame lets the lens shift go with the move, not in one frame
  return c.F0 + (CHASE.fov - c.F0) * w;   // the aim lens eases out with the move: no zoom-out snap at release
}
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
    const ox = cx + Math.cos(t) * 80, oz = cz + Math.sin(t) * 80;   // low and close: a higher orbit rose out of the sky dome and showed the world's edge
    cam.tPos.set(ox, Math.max(world.height(ox, oz), world.height(cx, cz)) + 30, oz); cam.tLook.set(cx, world.height(cx, cz), cz); k = 1.5;
  } else if (cam.mode === 'intro') {   // the hole flyover (introPath)
    fov = introPath(h, G.introT, cam.tPos, cam.tLook); k = 1e3;   // no smoothing: the eased path is the motion
  } else if (cam.mode === 'aim' || (cam.mode === 'result' && !G.flight && !cam.hold) || (cam.mode === 'flight' && G.flight?.lock)) {   // a putt keeps its aim frame locked from the stroke into the chains, as the broadcast holds it
    const p = curP(); if (!p) return;
    const d = aimDir(), lie = p.char.group.position;
    if (G.overview && cam.mode === 'aim') {
      const dist = Math.max(20, distToBasket(lie.x, lie.z));
      const mx = (lie.x + basketPos()[0]) / 2, mz = (lie.z + basketPos()[1]) / 2;
      cam.tPos.set(mx - d[0] * dist * 0.22, world.height(mx, mz) + Math.max(45, dist * 0.95), mz - d[1] * dist * 0.22); cam.tLook.set(mx, world.height(mx, mz), mz); k = 4;
    } else if (cam.mode === 'result') {
      const r=rightOf(d);cam.tPos.set(lie.x+d[0]*3.8+r[0]*.7,lie.y+1.45,lie.z+d[1]*3.8+r[1]*.7);
      cam.tLook.set(lie.x,lie.y+.92,lie.z); k=5; fov=camera.aspect<1.2?54:38;
    }
    else fov = aimFrame(lie, d, G.throwType === 'putt', cam.tPos, cam.tLook);
  } else if (cam.mode === 'flight' || cam.mode === 'result') {
    if (G.flight?.pos) { fov = flightCam(G.flight, dt); k = 1e3; }
    else if (cam.hold) { cam.tPos.copy(cam.pos); cam.tLook.copy(cam.look); fov = cam.hold.fov; cam.tShift = cam.hold.shift; }
  }
  const a = cam.snap ? 1 : 1 - Math.exp(-k * dt); cam.snap = false;
  cam.pos.lerp(cam.tPos, a); cam.look.lerp(cam.tLook, a); cam.fov += (fov - cam.fov) * a; cam.shift += (cam.tShift - cam.shift) * a;
  if (!Number.isFinite(cam.pos.x + cam.pos.y + cam.pos.z + cam.look.x + cam.look.y + cam.look.z + cam.fov + cam.shift)) {   // one bad frame must not blind the camera forever: lerp never recovers from NaN
    if (Number.isFinite(cam.tPos.x + cam.tPos.y + cam.tPos.z + cam.tLook.x + cam.tLook.y + cam.tLook.z)) { cam.pos.copy(cam.tPos); cam.look.copy(cam.tLook); } else { cam.pos.set(0, 30, 0); cam.look.set(0, 0, 1); }
    cam.fov = Number.isFinite(fov) ? fov : baseFov(); cam.shift = 0;
  }
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
const clock = new THREE.Clock(); let time = 0; const nearFocus = new THREE.Vector3();
const _gazeTarget = new THREE.Vector3();
// Open the game with ?fps=1 on a phone to read the real frame rate; the only way to certify the mobile targets.
const fpsTag = new URLSearchParams(location.search).has('fps') ? document.body.appendChild(Object.assign(document.createElement('div'), { style: 'position:fixed;left:8px;bottom:8px;z-index:99;padding:4px 8px;border-radius:8px;background:rgba(0,0,0,.6);color:#fff;font:600 12px/1.4 system-ui;pointer-events:none' })) : null;
let fpsNext = 0;
function loop(background = false) {
  // rAF passes a timestamp; only the explicit boolean true denotes a background tick.
  background = background === true;
  if (!background) requestAnimationFrame(loop);
  if (document.hidden && !background) return;
  const rawDt = clock.getDelta();
  // A hidden host's timer fires about once a second: replay all of it in 50 ms steps, or its flights ran at a quarter speed and guests outran it.
  if (background) { for (let left = Math.min(rawDt, 3); left > 1e-4; left -= .05) frame(Math.min(.05, left), rawDt, true); return; }
  frame(Math.min(G.maxDt || .05, rawDt), rawDt, false);
}
function frame(dt, rawDt, background) {
  if ((contextLost && !G.net?.isHost) || G.syncing || G.phase === 'loading') return;
  time += dt; input.update(dt);
  // Ignore background/paused frames; resolution changes never alter simulation time.
  if(fpsTag&&performance.now()>fpsNext){fpsNext=performance.now()+500;fpsTag.textContent=`${Math.round(1/frameAverage)} fps · ${G.settings.quality==='low'?'Mobile':'Desktop'} · ${Math.round(renderer.getPixelRatio()*100)/100}x · ${innerWidth}×${innerHeight}`;}
  if(!document.hidden && rawDt>.004 && rawDt<.25){frameAverage=frameAverage*.96+rawDt*.04;frameSamples++;
    if(frameSamples>90 && time-lastResolutionChange>2){const budget=1/60;const old=resolutionScale;
      if(frameAverage>budget*1.15)resolutionScale=Math.max(.5,resolutionScale-.08);
      else if(frameAverage<budget*.82)resolutionScale=Math.min(1,resolutionScale+.04);
      if(old!==resolutionScale){resize();lastResolutionChange=time;}
    }
    slowTime = frameAverage > 1/48 && resolutionScale <= .58 ? slowTime + dt : Math.max(0, slowTime - dt);
    if (slowTime > 6 && post && postEnabled) { postEnabled = false; slowTime = 0; UI.toast('Graphics adjusted', 'Keeping your round smooth', 1600); }
  }
  if (!course) return;
  coach.update(dt, { on: cam.mode === 'aim' && (G.phase === 'aim' || G.phase === 'windup') && !G.overview && playable() && !document.body.classList.contains('result-mode'), throwType: G.throwType, windup: G.phase === 'windup' });
  if (G.phase === 'intro') { G.introT += dt; if (G.introT > introDur(holes[G.holeIdx]) || G.inbox.length) { nextTurn(); cam.snap = true; } }   // the cut from the basket back to the tee, under the flash
  { const a = G.phase === 'intro' ? .7 * THREE.MathUtils.smoothstep(G.introT, introDur(holes[G.holeIdx]) - INTRO_FLASH, introDur(holes[G.holeIdx])) : Math.max(0, flashA - dt / .2);   // the broadcast's white flash: up over the held basket, down over the tee
    if (a !== flashA) flashEl.style.opacity = flashA = a; }
  if (G.inbox.length && (G.phase === 'aim' || G.phase === 'awaitThrow') && G.mode === 'online') applyRemoteThrow(G.inbox.shift());
  if (G.nextRequested && G.phase === 'holeEnd') { G.nextRequested = null; advanceHole(); }
  if (G.tween) { const tw = G.tween; tw.t += dt; const u = Math.min(1, tw.t / tw.dur); tw.fn(u * u * (3 - 2 * u)); if (u >= 1) { G.tween = null; tw.done?.(); } }
  if (G.pending && (G.phase === 'release' || G.phase === 'flight' || G.phase === 'result')) {
    G.releaseT += dt; const p = G.players[G.pending.pi];
    const leadIn = G.pending.leadIn || 0;
    const u = leadIn ? Math.min(1, G.releaseT / leadIn) : 1;
    const ph = G.releaseT < leadIn ? G.pending.startPhase + (.5 - G.pending.startPhase) * u * u * (3 - 2 * u) : .5 + Math.min(.5, (G.releaseT - leadIn) / .7 * .5); p.char.setPhase(ph);
    if (!G.pending.fired && ph >= 0.62) { G.pending.fired = true; launchNow(); }
    if (ph >= 1) { G.pending = null; const session = G.sessionId; setTimeout(() => { if (G.sessionId === session && G.players.includes(p) && p !== curP()) p.char.setPhase(null); else if (G.sessionId === session && G.phase === 'flight') p.char.setPhase(null); }, 350); }
  }
  if (G.flight) updateFlight(dt);
  if (background || contextLost) return; // Keep host authority alive without drawing an unavailable canvas.
  // Nearby spectators retain smooth motion; offscreen and distant players update at 15 Hz.
  for (const p of G.players) { p.animationDt = (p.animationDt || 0) + dt; if (p === curP() || (p.char.group.position.distanceToSquared(camera.position) < 25 * 25) || p.animationDt >= 1/15) {
    const b = world.basket, at = G.flight?.pos;
    if (b) p.char.lookAt?.(_gazeTarget.set(at ? at[0] : b.x, at ? at[1] : b.y + 1.35, at ? at[2] : b.z));
    p.char.update(p.animationDt); p.animationDt = 0;
  } }
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
  // Shadows follow what the camera shows: the disc in flight, the landing spot a miss holds on (the box used to snap back to
  // the thrower and a 70 m drive's landing lost its tree shadows), else the player. The near cascade (Desktop's crisp
  // shadows and sun flecks) stays where the throw began until the next turn: carried along at the disc's 25 m/s its
  // sharpness window and flecks slid across the turf ("the shadows move really fast"), and the far map alone holds still.
  const focus = G.flight?.pos ? _v2.set(G.flight.pos[0], G.flight.pos[1], G.flight.pos[2]) : G.phase === 'result' && cam.hold ? cam.look : p ? p.char.group.position : cam.look;
  if (!G.flight && G.phase !== 'result') nearFocus.copy(focus);
  course.update(dt, time, focus, camera.position, nearFocus);
  puffs.update(dt); celebration.update(dt); windFx?.update(time, dt, world.wind, focus, camera);
  previewMat.dashOffset -= dt * 1.6; previewEdge.dashOffset = previewMat.dashOffset;
  contactShadow.visible=!!G.flight?.pos;
  if(contactShadow.visible){const a=G.flight.pos,y=world.height(a[0],a[2]),h=Math.max(0,a[1]-y);contactShadow.position.set(a[0],y+.025,a[2]);contactShadow.scale.setScalar(.35+h*.07);contactShadow.material.opacity=Math.max(.05,.7-h*.06);}
  trail.update(camera, !!G.flight);
  if(post && postEnabled) post.render(); else renderer.render(scene, camera);
}

// ---------- HUD / menu wiring ----------
function pickThrow(id) { if (G.phase !== 'aim') return; G.throwType = id; UI.selectThrow(id); if (id === 'putt') { G.discId = 'putter'; UI.selectDisc('putter'); ensureDisc(curP(), 'putter'); curP().discMesh.visible = true; } G.previewDirty = true; G.previewPower = null; sfx.click(); }
function pickDisc(id) { if (G.phase !== 'aim') return; G.discId = id; ensureDisc(curP(), id); curP().discMesh.visible = true; UI.selectDisc(id); G.previewDirty = true; G.previewPower = null; sfx.click(); }
UI.buildThrowButtons(pickThrow); UI.buildDiscChips(pickDisc);
$('btnTarget').onclick = () => { if (G.phase === 'aim') { const l = curP().lie; G.aim.yaw = Math.atan2(basketPos()[1] - l[2], basketPos()[0] - l[0]); G.aim.pitch = 0; G.previewDirty = true; G.previewPower = null; G.planDirty = false; sfx.click(); } };
$('btnOverview').onclick = () => { if (G.phase !== 'aim') return; G.overview = !G.overview; $('btnOverview').classList.toggle('on', G.overview); $('btnOverview').setAttribute('aria-pressed', String(G.overview)); sfx.click(); };
// Full screen: Android and iPad browsers can hand the game the whole screen (the button in the course tools). An iPhone's
// Safari cannot; it plays full screen only from the Home Screen, so the first turn on its side there says how, once.
{
  const root = document.documentElement, standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const canFull = !standalone && !!(root.requestFullscreen || root.webkitRequestFullscreen) && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (canFull) {
    $('btnFull').classList.remove('hidden');
    $('btnFull').onclick = () => { try { if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else (root.requestFullscreen || root.webkitRequestFullscreen).call(root, { navigationUI: 'hide' })?.catch?.(() => {}); } catch { /* refused */ } sfx.click(); };
    for (const type of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(type, () => $('btnFull').setAttribute('aria-pressed', String(isFull())));
  } else if (!standalone && /iPhone|iPod/.test(navigator.userAgent)) {
    let told = false; try { told = sessionStorage.getItem('chains.fullTip') === '1'; } catch { /* private mode */ }
    addEventListener('resize', () => {
      if (told || innerWidth <= innerHeight || G.phase !== 'aim') return;   // not over the flyover: the HUD (and its toast) is hidden then
      told = true; try { sessionStorage.setItem('chains.fullTip', '1'); } catch { /* private mode */ }
      setTimeout(() => UI.toast('Want it full screen?', 'Safari: Share → Add to Home Screen, then play from the icon', 4200), 600);
    });
  }
}
$('btnMute').onclick = () => { setMuted(!isMuted()); UI.setSoundMuted(isMuted()); saveLocal('chains.muted', isMuted() ? '1' : '0'); };
// The mute choice persists; ?mute=1 starts silent for test browsers and simulators (it is not saved).
{ let m = new URLSearchParams(location.search).has('mute'); try { m ||= localStorage.getItem('chains.muted') === '1'; } catch { /* private mode */ } if (m) { setMuted(true); UI.setSoundMuted(true); } }
// Hosted: Huck Yeah serves Chains as its disc golf (huckyeah.vercel.app/discgolf/, opened with ?host=huckyeah). The clubhouse
// then wears the host's colours and offers the way back to its menu. The host is kept for the tab: invite links and reloads
// drop the query. `home` may name the host's menu on another of its origins (its GitHub Pages copy); anything else is ignored.
{
  const HOSTS = { huckyeah: { name: 'Huck Yeah', home: '../', origins: /^https:\/\/(huckyeah(-[a-z0-9-]+)?\.vercel\.app|thecromazone\.github\.io)$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ } };
  const q = new URLSearchParams(location.search), keep = (k, v) => { try { if (v) sessionStorage.setItem(k, v); else v = sessionStorage.getItem(k); } catch { /* private mode */ } return v; };
  const id = keep('chains.host', q.get('host')) || (location.pathname.startsWith('/discgolf/') ? 'huckyeah' : null), host = HOSTS[id];
  if (host) {
    let home = new URL(host.home, location.href); try { const h = new URL(keep('chains.hostHome', q.get('home')) || ''); if (host.origins.test(h.origin)) home = h; } catch { /* no home given */ }
    const named = keep('chains.hostName', q.get('name')), name = /^[\p{L}\p{N} .'-]{1,24}$/u.test(named || '') ? named : host.name;   // the host's current brand
    document.documentElement.dataset.host = id;
    $('hostName').textContent = name; $('brandSmall').textContent = `${name} · disc golf`;
    $('hostHome').href = home.href; $('hostHome').classList.remove('hidden');
  }
}
$('btnMenu').onclick = async () => { if (!(await UI.confirmLeave())) return; const match = G.mode === 'async' ? G.matchId : null; toMenu(); if (match) matches.openMatch(match); };   // leaving an invite turn returns to its scorecard; the hole is not recorded
$('btnHelp').onclick = () => { UI.hide('menu'); UI.show('help'); $('btnCoachReplay').disabled = false; $('btnCoachReplay').lastElementChild.textContent = 'Replay the thumb tutorial'; };
$('btnCoachReplay').onclick = e => { coach.replay(); e.currentTarget.disabled = true; e.currentTarget.lastElementChild.textContent = 'It starts on your next throw'; sfx.click(); }; $('btnHelpClose').onclick = () => { UI.hide('help'); UI.show('menu'); };
$('btnScoreNext').onclick = () => { if (G.mode === 'online' && !G.net?.isHost) return; netSend({ t: 'next', sessionId: G.sessionId, holeIdx: G.holeIdx }); advanceHole(); };
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
    row.innerHTML = `<i class="dot" style="background:${COLORS[i % COLORS.length]};width:16px;height:16px"></i><input value="${UI.escapeText(p.name)}" maxlength="14" style="flex:1"><span class="muted">${p.isBot ? 'bot' : 'player'}</span><button data-x="${i}">✕</button>`;
    row.querySelector('input').oninput = e => p.name = e.target.value;
    row.querySelector('button').onclick = () => { setupPlayers.splice(i, 1); renderSetup(); };
    $('playerList').appendChild(row);
  });
}
$('btnLocal').onclick = () => { setupPlayers = [{ name: 'Player 1' }, { name: 'Player 2' }]; renderSetup(); UI.hide('menu'); UI.show('setup'); };
$('btnAddHuman').onclick = () => { if (setupPlayers.length < MAX_PLAYERS) { setupPlayers.push({ name: `Player ${setupPlayers.length + 1}` }); renderSetup(); } };
$('btnAddBot').onclick = () => { if (setupPlayers.length < MAX_PLAYERS) { setupPlayers.push({ name: BOT_NAMES[setupPlayers.filter(p => p.isBot).length % BOT_NAMES.length], isBot: true, difficulty: G.settings.difficulty }); renderSetup(); } };
$('btnSetupBack').onclick = () => { UI.hide('setup'); UI.show('menu'); };
$('btnSetupStart').onclick = () => { if (!setupPlayers.length) return; let mine = false; startGame({ mode: 'local', holeCount: +G.settings.holes, players: setupPlayers.map(p => { const first = !p.isBot && !mine; if (first) mine = true; return { ...p, name: p.name.trim() || 'Player', avatar: first ? { ...G.avatar } : null, hand: p.isBot ? undefined : 'right' }; }) }); };   // a guest's random look never makes them silently left-handed

// online: the host validates commands, computes flight and owns membership.
const disconnectTimers = new Map();
let deferredNet = [];
function roundConfig() {
  return { mode: 'online', sessionId: G.sessionId, courseId: G.courseId, holeCount: G.holeCount,
    players: G.players.map(p => ({ name: p.name, color: p.color, isBot: p.isBot, difficulty: p.difficulty, peerId: p.peerId, avatar: p.appearance })) };
}
function snapshot() {
  return { config: roundConfig(), holeIdx: G.holeIdx, cur: G.cur, phase: G.phase, seq: G.shotSeq,
    players: G.players.map(p => ({ scores: [...p.scores], strokes: p.strokes, done: p.done, lie: [...p.lie], lieDist: p.lieDist })),
    flight: G.flight ? structuredClone({ ...G.flight, cam: null }) : null, shot: G.remoteShot || null };   // the chase rig holds THREE vectors: a guest rebuilds its own (sent, they arrived as plain objects and flightCam threw every frame)
}
async function restoreRoom(s) {
  if (G.syncing || !s?.config || s.config.players.length > MAX_PLAYERS) return;
  G.syncing = true;
  G.net.locked = true;
  try {
    if (!(await startGame(s.config)) || !G.net) return;
    G.holeIdx = s.holeIdx; startHole();
    s.players.forEach((state, i) => Object.assign(G.players[i], state));
    G.shotSeq = s.seq; G.lastShotSeq = s.seq;
    if (s.cur >= 0 && s.cur < G.players.length && s.phase !== 'intro') {
      setupTurn(s.cur);
      if (s.flight) {
        G.flight = s.flight; G.phase = 'flight'; cam.mode = 'flight'; G.pending = null;
        const p = curP(); p.char.setThrow(s.flight.params.throwType); p.char.setPhase(1);
        ensureDisc(p, s.flight.params.discId); p.discMesh.visible = true; UI.setControlsEnabled(false); preview.visible = false; updateFlight(0);
      } else if (s.shot) applyRemoteThrow(s.shot);
      else if (s.phase === 'holeEnd') endHole();
      else if (s.phase === 'result' || curP().done) nextTurn();
    }
    UI.toast('Back in the round', 'Scores restored', 1500);
  } finally { G.syncing = false; const queue = deferredNet; deferredNet = []; queue.forEach(onNet); }
}
function renderLobby() {
  const list = $('lobbyList'); list.replaceChildren();
  for (const p of G.lobby) {
    const li = document.createElement('li'), name = document.createElement('span'), status = document.createElement('span');
    name.textContent = p.name; status.className = 'muted'; status.textContent = p.host ? 'host' : p.disconnected ? 'reconnecting' : p.isBot ? 'bot' : 'ready';
    li.append(name, status); list.append(li);
  }
  $('hostControls').classList.toggle('hidden', !G.net?.isHost); $('guestWait').classList.toggle('hidden', !!G.net?.isHost);
  $('roomStatus').textContent = `${G.lobby.length} / ${MAX_PLAYERS} players`;
  $('btnLobbyBot').disabled = G.lobby.length >= MAX_PLAYERS;
  $('btnLobbyStart').disabled = G.lobby.length === 0 || !!G.net?.locked;
}
const publishLobby = () => { renderLobby(); G.net?.broadcast({ t: 'lobby', players: lobbyPublic(G.lobby), code: G.net.code }); };
function rejectGuest(id, reason) { G.net.send(id, { t: 'rejected', reason }); G.net.disconnect(id); }
let turnCheck = null;
function roomGone(title, sub) { if (!G.net || G.net.isHost) return; toMenu(); UI.toast(title, sub, 4000); }
addEventListener('pagehide', () => { if (G.net?.isHost) try { G.net.broadcast({ t: 'closed' }); } catch { /* best effort */ } });
function onNet(ev) {
  if (!G.net) return;
  if (G.syncing && ev.type === 'msg') { deferredNet.push(ev); return; }
  if (ev.type === 'join' && G.net.isHost) {
    if (ev.version !== PROTOCOL_VERSION) return rejectGuest(ev.id, 'Reload the game to use the current room version.');
    if (typeof ev.token !== 'string' || ev.token.length > 64) return rejectGuest(ev.id, 'Invalid player session. Please reload.');
    const returning = G.lobby.find(p => p.token === ev.token);
    if (returning) {
      const oldId = returning.peerId, pi = G.lobby.indexOf(returning);
      clearTimeout(disconnectTimers.get(ev.token)); disconnectTimers.delete(ev.token);
      returning.peerId = ev.id; returning.disconnected = false; returning.isBot = false;
      if (G.net.locked && G.players[pi]) {
        const p = G.players[pi]; p.peerId = ev.id; p.isBot = false;
        if (curP() === p && G.phase === 'windup' && G.tween && !G.remoteShot) { G.tween = null; G.pending = null; setupTurn(pi); }
        else if (curP() === p && G.phase === 'aim') setupTurn(pi);
        G.net.broadcast({ t: 'rejoin', pi, peerId: ev.id });
        G.net.send(ev.id, { t: 'snapshot', state: snapshot() });
      }
      if (oldId !== ev.id) G.net.disconnect(oldId);
      publishLobby(); return;
    }
    if (G.net.locked) return rejectGuest(ev.id, 'This round has started. Join the next round with your friends.');
    if (G.lobby.length >= MAX_PLAYERS) return rejectGuest(ev.id, `This room is full (${MAX_PLAYERS} players).`);
    G.lobby.push({ name: uniqueName(ev.name, G.lobby.map(p => p.name)), peerId: ev.id, avatar: sanitizeAvatar(ev.avatar), token: ev.token }); publishLobby(); sfx.click();
  } else if (ev.type === 'leave') {
    if (G.net.isHost) {
      const li = G.lobby.findIndex(p => p.peerId === ev.id); if (li < 0) return;
      const member = G.lobby[li];
      if (!G.net.locked) { G.lobby.splice(li, 1); publishLobby(); return; }
      member.disconnected = true; publishLobby();
      UI.toast(`${member.name} disconnected`, 'Holding their place for 30 seconds', 2500);
      const room = G.net;
      disconnectTimers.set(member.token, setTimeout(() => {
        disconnectTimers.delete(member.token); if (G.net !== room || !member.disconnected) return;
        const p = G.players[li]; if (!p) return;
        p.isBot = true; p.peerId = null; p.difficulty = 'medium'; member.isBot = true;
        G.net.broadcast({ t: 'botify', pi: li });
        UI.toast(`${p.name} is away`, 'A bot keeps the round moving', 2500);
        if (curP() === p && G.phase === 'aim') botTurn(p);
      }, 30000));
    } else { UI.waiting('Reconnecting to the host…'); UI.setControlsEnabled(false); input.cancel(); }
  } else if (ev.type === 'reconnected') {
    UI.waiting(null);   // the host answers a rejoin with the lobby or a snapshot on its own: asking again rebuilt the round twice
  } else if (ev.type === 'lost') {
    roomGone('Lost the connection to the host', 'The room has closed. Start a new room or an invite match.');
  } else if (ev.type === 'msg') {
    const m = ev.data; if (!m || typeof m.t !== 'string') return;
    if (G.net.isHost) {
      if (m.t === 'sync-request') { G.net.send(ev.from, G.net.locked ? { t: 'snapshot', state: snapshot() } : { t: 'lobby', players: lobbyPublic(G.lobby), code: G.net.code }); return; }
      // Guests send input only: never accept a client's trajectory, result, next-hole or lobby message.
      if (m.t === 'throw-request') {
        if (G.phase !== 'aim' || !validateThrowRequest(m, G, ev.from)) { G.net.send(ev.from, { t: 'throw-denied', reason: 'Waiting for your turn. Syncing the scorecard…' }); return; }
        const p = curP(), q = m.params, d = q.dir;
        const params = { throwType: q.throwType, discId: q.discId, power: q.power, hyzer: q.hyzer, yawOffset: q.yawOffset, launchOffset: q.launchOffset,
          dir: [...d], pos: releasePos(world, p.lie, d), lefty: p.appearance?.hand === 'left' };
        const sim = runSim(params), seq = ++G.shotSeq;
        const shot = { t: 'throw', sessionId: G.sessionId, turn: m.turn, seq, pi: G.cur, params, ...sim };
        G.lastShotSeq = seq; G.net.broadcast(shot); applyRemoteThrow(shot);
      }
      return;
    }
    if (ev.from !== `chains-dg-${G.net.code}`) return;
    if (m.t === 'lobby') { G.lobby = m.players; $('roomCode').textContent = m.code; renderLobby(); }
    else if (m.t === 'start') { G.net.locked = true; G.syncing = true; startGame(m.config).finally(() => { G.syncing = false; const queue = deferredNet; deferredNet = []; queue.forEach(onNet); }); }
    else if (m.t === 'snapshot') restoreRoom(m.state);
    else if (m.t === 'throw' && m.sessionId === G.sessionId && Number.isInteger(m.seq) && m.seq > G.lastShotSeq) { G.lastShotSeq = m.seq; G.inbox.push(m); }
    else if (m.t === 'next' && m.sessionId === G.sessionId && m.holeIdx === G.holeIdx) { if (G.phase === 'holeEnd') advanceHole(); else G.nextRequested = m; }
    else if (m.t === 'botify' && G.players[m.pi]) { const p = G.players[m.pi]; p.isBot = true; p.peerId = null; UI.toast(`${p.name} is away`, 'A bot keeps the round moving', 2000); }
    else if (m.t === 'rejoin' && G.players[m.pi]) { G.players[m.pi].isBot = false; G.players[m.pi].peerId = m.peerId; }
    else if (m.t === 'throw-denied') { UI.toast('Round synchronizing', m.reason, 2000); G.net.toHost({ t: 'sync-request' }); }
    else if (m.t === 'rejected') { const reason = m.reason; G.net.close(); G.net = null; UI.hide('lobby'); UI.show('onlineChoice'); UI.onlineError(reason); }
    else if (m.t === 'closed') roomGone('The host left', 'The room has closed. Start a new room or an invite match.');
    else if (m.t === 'turn') {   // the host's turn marker: a guest still on an older turn (a lost shot) resyncs instead of waiting forever
      clearTimeout(turnCheck);
      if (m.sessionId === G.sessionId && m.turn !== turnKey(G) && G.phase !== 'flight' && G.phase !== 'release' && G.phase !== 'result') turnCheck = setTimeout(() => { if (G.net && m.turn !== turnKey(G) && !G.inbox.length && ['aim', 'awaitThrow', 'windup'].includes(G.phase)) G.net.toHost({ t: 'sync-request' }); }, 2000);
    }
  } else if (ev.type === 'error') {
    if (ev.err?.type === 'network' || ev.err?.type === 'server-error') UI.onlineError('The room service is reconnecting. Please keep this page open.');
  }
}
// An invite link (?room=CODE) opens straight onto Join: the big Create button had invited friends opening empty rooms of their own.
const setInvited = code => {
  $('online').classList.toggle('invited', !!code); UI[code ? 'show' : 'hide']('inviteNote'); UI[code ? 'show' : 'hide']('btnHostInstead');
  $('onlineTitle').textContent = code ? `Join room ${code}` : 'Online room'; if (code) $('joinCode').value = code;
};
const openLive = (invite = '') => { UI.hide('menu'); UI.show('online'); UI.show('onlineChoice'); UI.hide('lobby'); $('onlineName').value ||= G.avatar.name || 'Player'; setInvited(invite); };
$('btnHostInstead').onclick = () => { setInvited(''); $('joinCode').value = ''; };
$('onlineName').addEventListener('focus', e => { if (['You', 'Player'].includes(e.target.value)) e.target.select(); });   // the default name is a placeholder: typing replaces it
// Invite matches (src/match.js): turn-based, over plain HTTPS, so phones on any network can play together.
const matches = createMatches({
  hideMenus: () => { for (const id of ['menu', 'online', 'setup', 'courses', 'help', 'score']) UI.hide(id); },
  showMenu: () => UI.show('menu'), openLive, me, toast: UI.toast, buzz, inRound: () => G.phase !== 'menu',
  course: () => { const c = courseById(G.courseId); return { id: c.id, name: c.name }; },
  holes: () => +G.settings.holes,
  pars: id => LAYOUTS[Math.max(0, COURSES.findIndex(c => c.id === id))].map(h => h.par),
  startTurn: ({ matchId, courseId, holeCount, hole }) => startGame({ mode: 'async', matchId, courseId, holeCount, startHole: hole, players: [{ ...me(), hand: G.avatar.hand }] }),
});
$('btnOnline').onclick = () => { sfx.click(); matches.open(); };
$('btnOnlineBack').onclick = () => { G.net?.close(); G.net = null; UI.hide('online'); UI.show('menu'); };
$('btnLeave').onclick = toMenu;
$('btnCreate').onclick = async () => {
  const name = safeName($('onlineName').value || 'Host'); UI.onlineError(); UI.setConnecting('btnCreate', true); $('btnJoin').disabled = true;
  try {
    G.net?.close(); G.net = createNet();
    const room = G.net, code = await room.host(name, onNet); if (G.net !== room) return;
    G.lobby = [{ name, peerId: room.id(), host: true, avatar: { ...G.avatar, name } }]; $('roomCode').textContent = code; renderLobby();
    UI.hide('onlineChoice'); UI.show('lobby');
  } catch (e) { UI.onlineError('Could not create a room: ' + (e.message || e)); G.net?.close(); G.net = null; }
  finally { UI.setConnecting('btnCreate', false); $('btnJoin').disabled = false; }
};
$('btnJoin').onclick = async () => {
  const name = safeName($('onlineName').value || 'Guest'), code = $('joinCode').value.trim().toUpperCase(); UI.onlineError();
  if (!/^[A-Z2-9]{4}$/.test(code)) { UI.onlineError('Enter the four-character room code.'); $('joinCode').focus(); return; }
  UI.setConnecting('btnJoin', true); $('btnCreate').disabled = true;
  try {
    G.net?.close(); G.net = createNet(); G.lobby = [];
    const room = G.net; await room.join(code, name, onNet, { ...G.avatar, name }); if (G.net !== room) return;
    $('roomCode').textContent = code; renderLobby(); UI.hide('onlineChoice'); UI.show('lobby');
  } catch (e) { UI.onlineError('Could not join: ' + (e.message || e)); G.net?.close(); G.net = null; }
  finally { UI.setConnecting('btnJoin', false); $('btnCreate').disabled = false; }
};
$('btnLobbyBot').onclick = () => { if (G.lobby.length < MAX_PLAYERS && !G.net.locked) { G.lobby.push({ name: uniqueName(BOT_NAMES[G.lobby.filter(p => p.isBot).length % BOT_NAMES.length], G.lobby.map(p => p.name)), isBot: true }); publishLobby(); } };
$('btnLobbyStart').onclick = () => {
  if (!G.net?.isHost || G.net.locked || !G.lobby.length) return;
  G.net.locked = true; renderLobby();
  const config = { mode: 'online', sessionId: crypto.randomUUID(), courseId: G.courseId, holeCount: +G.settings.holes,
    players: G.lobby.map((p, i) => ({ name: safeName(p.name), isBot: !!p.isBot, difficulty: G.settings.difficulty, peerId: p.peerId || null, avatar: p.avatar || null, color: p.avatar?.jersey || COLORS[i % COLORS.length] })) };
  G.net.broadcast({ t: 'start', config }); startGame(config);
};
// Phones open the share sheet (Messages, WhatsApp…) with the link; desktops copy it. Either way the code stays on screen.
const shareSheet = isMobile && !!navigator.share;
$('btnShareRoom').textContent = shareSheet ? 'Send invite link' : 'Copy invite link';
$('btnShareRoom').onclick = async () => {
  const url = new URL(location.href); url.search = ''; url.searchParams.set('room', G.net.code); url.hash = '';
  if (shareSheet) {
    try { await navigator.share({ title: 'Chains — Disc Golf', text: `Join my disc golf room in Chains — code ${G.net.code}`, url: url.href }); return; }
    catch (e) { if (e?.name === 'AbortError') return; }   // dismissed the sheet: nothing to do
  }
  try { await navigator.clipboard.writeText(url.href); $('btnShareRoom').textContent = 'Invite link copied'; }
  catch { $('roomStatus').textContent = url.href; }
};

// ---------- boot ----------
const playable = () => curP() && !curP().isBot && isMine(curP()) && !G.syncing && !contextLost && !document.querySelector('dialog[open]') && (G.mode !== 'online' || G.net?.isHost || G.net?.conns.size > 0);
const input = setupInput({ sceneEl: canvas, padEl: $('pad'), getThrow: () => G.throwType, onAim, onGesture,
  canAim: () => playable() && (G.phase === 'aim' || G.phase === 'windup'), canThrow: () => playable() && ['aim','windup'].includes(G.phase), onTrace: UI.gestureTrace,
  onShortcut(code) {
    unlock();
    if (code.startsWith('Digit')) pickDisc(DISCS[+code.slice(-1) - 1].id);
    else if (code === 'KeyQ' || code === 'KeyE') { const types = Object.keys(THROWS), i = types.indexOf(G.throwType); pickThrow(types[(i + (code === 'KeyQ' ? -1 : 1) + types.length) % types.length]); }
    else $({ KeyT: 'btnTarget', KeyO: 'btnOverview', KeyM: 'btnMute' }[code])?.click();
  }
});
const coach = createCoach({ hud: $('hud'), pad: $('pad') });
document.addEventListener('keydown', unlock, { once: true, capture: true });
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, e => e.preventDefault(), { passive: false });   // iOS Safari: a stray two-finger pinch would zoom the whole game
let contextLost = false;
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); contextLost = true; input.cancel(); UI.waiting('Restoring graphics…'); });
canvas.addEventListener('webglcontextrestored', () => { contextLost = false; resize(); G.previewDirty = true; UI.waiting(null); });
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => { clock.getDelta(); if (document.hidden) { hiddenAt = Date.now(); return; } resize(); if (G.mode === 'online' && !G.net?.isHost && Date.now() - hiddenAt > 8000) G.net?.toHost({ t: 'sync-request' }); });   // a glance away no longer rebuilds the whole round
setInterval(() => { if (document.hidden && G.mode === 'online' && G.net?.isHost) loop(true); }, 100);
setTimeout(async () => {
  try {
  await loadManifest();
  await loadModels(renderer, G.settings.quality);
  await loadCourse(G.courseId);
  makeHero(); updateHub(); updateCamera(10); cam.pos.copy(cam.tPos); cam.look.copy(cam.tLook);
  await warmShaders();
  UI.hide('loading'); loop();
  window.__chains = { G, renderer, scene, camera, course, world, holes, cam, AIM, input, coach, get hero() { return hero; }, get post() { return post; }, puffs, get windFx() { return windFx; }, renderFrame: () => post && postEnabled ? post.render() : renderer.render(scene,camera), performance: () => ({ frameMs: frameAverage * 1000, resolutionScale, postEnabled, ratio: renderer.getPixelRatio() }), startGame, nextTurn, doThrow, runSim, resolveThrow, setupTurn, loadCourse, makeHero, THREE };
  const params = new URLSearchParams(location.search || location.hash.replace(/^#/, '?')), invite = (params.get('room') || '').toUpperCase(); if (/^[A-Z2-9]{4}$/.test(invite)) openLive(invite);
  else { matches.boot(); if (params.get('friends') === '1' && !matches.isOpen()) matches.open(); }   // ?friends=1: a host's "play online" lands on Friends
  if (['host', 'name', 'home', 'friends'].some(k => params.has(k))) { const u = new URL(location.href); for (const k of ['host', 'name', 'home', 'friends']) u.searchParams.delete(k); history.replaceState(null, '', u.pathname + u.search + u.hash); }   // kept for the tab in sessionStorage
  } catch (error) {
    const loading = $('loading'); loading.replaceChildren();
    const message = document.createElement('p'); message.textContent = 'The course could not load. Check your connection, then try again.';
    const retry = document.createElement('button'); retry.textContent = 'Reload game'; retry.onclick = () => location.reload();
    loading.append(message, retry); console.error('Game startup failed', error);
  }
}, 60);
