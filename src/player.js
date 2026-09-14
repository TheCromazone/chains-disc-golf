// Procedural rigged golfer with a customisable avatar (skin, hair, headwear, jersey with a printed
// canvas texture, build). Faces -Z. Root yaw + = turns left. Throw animations are keyframed per throw
// type; phase 0..0.5 is the windup (scrubbed by the swipe), 0.5..1 the release/follow-through.
import * as THREE from 'three';
import { createGLTFCharacter } from './gltf-player.js';

export const AVATAR_OPTIONS = {
  skin: ['#f6dcc4', '#eec0a0', '#d9a382', '#c68a5e', '#a86b42', '#8d5a3b', '#6b4229', '#4a2d1c'],
  hair: ['short', 'buzz', 'curly', 'long', 'bun', 'none'],
  hairColor: ['#1b1410', '#3b2a1c', '#6b4a2b', '#a5733d', '#d9b26a', '#e6dccb', '#8a2b1a', '#556070'],
  jersey: ['#ff4d3d', '#2f80ff', '#ffd23f', '#38d47a', '#ff7ad9', '#9b6bff', '#ffffff', '#151820', '#ff8a2b', '#16c2d4'],
  accent: ['#ffffff', '#151820', '#ffd23f', '#ff4d3d', '#2f80ff', '#38d47a', '#16c2d4', '#ff8a2b'],
  shorts: ['#23262e', '#f4f4f4', '#1d3557', '#3d5a2a', '#6b2d2d', '#5a4632', '#2f80ff', '#151820'],
  shoes: ['#f1f1f1', '#151820', '#ff4d3d', '#2f80ff', '#ffd23f', '#38d47a'],
  headwear: ['cap', 'backcap', 'beanie', 'visor', 'none'],
  headwearColor: ['#151820', '#ffffff', '#ff4d3d', '#2f80ff', '#ffd23f', '#38d47a', '#3d5a2a', '#6b2d2d'],
  build: ['slim', 'athletic', 'broad'],
};
export const DEFAULT_AVATAR = { name: 'You', skin: '#d9a382', hair: 'short', hairColor: '#3b2a1c', jersey: '#ff4d3d', accent: '#ffffff', shorts: '#23262e', shoes: '#f1f1f1', headwear: 'cap', headwearColor: '#151820', number: 7, shades: true, build: 'athletic' };
export function randomAvatar(rng = Math.random, overrides = {}) {
  const pick = a => a[Math.floor(rng() * a.length)];
  const jersey = overrides.jersey || pick(AVATAR_OPTIONS.jersey);
  return { ...DEFAULT_AVATAR, skin: pick(AVATAR_OPTIONS.skin), hair: pick(AVATAR_OPTIONS.hair), hairColor: pick(AVATAR_OPTIONS.hairColor), jersey, accent: pick(AVATAR_OPTIONS.accent.filter(c => c !== jersey)), shorts: pick(AVATAR_OPTIONS.shorts), shoes: pick(AVATAR_OPTIONS.shoes), headwear: pick(AVATAR_OPTIONS.headwear), headwearColor: pick(AVATAR_OPTIONS.headwearColor), number: Math.floor(rng() * 99) + 1, shades: rng() < 0.5, build: pick(AVATAR_OPTIONS.build), ...overrides };
}

const JOINTS = ['root', 'spine', 'head', 'shR', 'elR', 'shL', 'elL', 'hipR', 'knR', 'hipL', 'knL'];
const IDLE = { root: [0, 0, 0], spine: [0.04, 0, 0], head: [0, 0, 0], shR: [0.85, 0, 0.3], elR: [1.35, 0, 0], shL: [0.15, 0, -0.2], elL: [0.4, 0, 0], hipR: [0, 0, 0.04], knR: [-0.05, 0, 0], hipL: [0, 0, -0.04], knL: [-0.05, 0, 0], rootY: 0 };

const K = {
  backhand: [
    { t: 0,    root: [0, -0.7, 0], spine: [0.05, 0, 0], head: [0, 0.6, 0], shR: [0.9, 0, 0.35], elR: [1.3, 0, 0], shL: [0.3, 0, -0.3], elL: [0.5, 0, 0], hipR: [0, 0, 0.05], knR: [-0.1, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 0.5,  root: [0, -1.95, 0], spine: [0.12, -0.35, 0.05], head: [0, 1.35, 0], shR: [0.15, 0, 1.55], elR: [0.1, 0, 0], shL: [0.9, 0, -0.5], elL: [1.3, 0, 0], hipR: [-0.35, 0, 0.12], knR: [-0.55, 0, 0], hipL: [0.5, 0, -0.05], knL: [-0.4, 0, 0], rootY: -0.1 },
    { t: 0.62, root: [0, -1.0, 0], spine: [0.05, 0.15, 0], head: [0, 0.8, 0], shR: [1.35, 0, -0.45], elR: [0.05, 0, 0], shL: [0.6, 0, -0.9], elL: [1.0, 0, 0], hipR: [-0.2, 0, 0.1], knR: [-0.3, 0, 0], hipL: [0.25, 0, -0.05], knL: [-0.15, 0, 0], rootY: -0.05 },
    { t: 0.8,  root: [0, 0.35, 0], spine: [0, 0.35, -0.05], head: [0, 0.2, 0], shR: [1.1, 0, -1.2], elR: [0.3, 0, 0], shL: [0.1, 0, -0.6], elL: [0.6, 0, 0], hipR: [-0.55, 0, 0.15], knR: [-0.75, 0, 0], hipL: [0.1, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 1,    root: [0, 0.5, 0], spine: [0.05, 0, 0], head: [0, 0, 0], shR: [0.3, 0, 0.3], elR: [0.4, 0, 0], shL: [0.1, 0, -0.2], elL: [0.35, 0, 0], hipR: [-0.2, 0, 0.05], knR: [-0.3, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
  ],
  forehand: [
    { t: 0,    root: [0, 0.15, 0], spine: [0.05, 0, 0], head: [0, -0.15, 0], shR: [0.4, 0, 0.5], elR: [1.5, 0, 0], shL: [0.3, 0, -0.3], elL: [0.5, 0, 0], hipR: [0, 0, 0.05], knR: [-0.1, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 0.5,  root: [0, -0.35, 0], spine: [0.1, -0.2, 0.15], head: [0, 0.3, 0], shR: [-0.7, 0.3, 0.9], elR: [1.8, 0, 0], shL: [0.7, 0, -0.6], elL: [0.9, 0, 0], hipR: [-0.3, 0, 0.12], knR: [-0.55, 0, 0], hipL: [0.45, 0, -0.05], knL: [-0.35, 0, 0], rootY: -0.1 },
    { t: 0.62, root: [0, 0.2, 0], spine: [0.05, 0.2, 0.05], head: [0, -0.2, 0], shR: [1.15, 0, 0.55], elR: [0.15, 0, 0], shL: [0.4, 0, -0.8], elL: [0.9, 0, 0], hipR: [-0.15, 0, 0.1], knR: [-0.3, 0, 0], hipL: [0.3, 0, -0.05], knL: [-0.2, 0, 0], rootY: -0.04 },
    { t: 0.8,  root: [0, 0.6, 0], spine: [0.1, 0.4, -0.1], head: [0, -0.5, 0], shR: [1.3, 0, -0.7], elR: [0.6, 0, 0], shL: [0.1, 0, -0.5], elL: [0.5, 0, 0], hipR: [-0.5, 0, 0.15], knR: [-0.6, 0, 0], hipL: [0.1, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 1,    root: [0, 0.5, 0], spine: [0.05, 0, 0], head: [0, -0.3, 0], shR: [0.4, 0, 0.3], elR: [0.5, 0, 0], shL: [0.1, 0, -0.2], elL: [0.35, 0, 0], hipR: [-0.2, 0, 0.05], knR: [-0.3, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
  ],
  tomahawk: [
    { t: 0,    root: [0, -0.3, 0], spine: [0.05, 0, 0], head: [0, 0.3, 0], shR: [0.9, 0, 0.35], elR: [1.4, 0, 0], shL: [0.3, 0, -0.3], elL: [0.5, 0, 0], hipR: [0, 0, 0.05], knR: [-0.1, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 0.5,  root: [0, -0.7, 0], spine: [-0.25, -0.2, 0.1], head: [0, 0.6, 0], shR: [-2.5, 0, 0.6], elR: [1.1, 0, 0], shL: [1.4, 0, -0.5], elL: [0.4, 0, 0], hipR: [-0.2, 0, 0.1], knR: [-0.4, 0, 0], hipL: [0.7, 0, -0.05], knL: [-0.9, 0, 0], rootY: -0.06 },
    { t: 0.62, root: [0, 0.25, 0], spine: [0.25, 0.2, 0], head: [0, -0.1, 0], shR: [2.2, 0, 0.2], elR: [0.15, 0, 0], shL: [0.4, 0, -0.9], elL: [0.9, 0, 0], hipR: [-0.5, 0, 0.1], knR: [-0.3, 0, 0], hipL: [0.35, 0, -0.05], knL: [-0.25, 0, 0], rootY: -0.03 },
    { t: 0.8,  root: [0, 0.5, 0], spine: [0.55, 0.3, 0], head: [0.3, -0.2, 0], shR: [1.0, 0, -0.6], elR: [0.5, 0, 0], shL: [0.1, 0, -0.5], elL: [0.5, 0, 0], hipR: [-0.7, 0, 0.15], knR: [-0.6, 0, 0], hipL: [0.3, 0, -0.05], knL: [-0.3, 0, 0], rootY: -0.05 },
    { t: 1,    root: [0, 0.4, 0], spine: [0.1, 0, 0], head: [0, 0, 0], shR: [0.4, 0, 0.3], elR: [0.5, 0, 0], shL: [0.1, 0, -0.2], elL: [0.35, 0, 0], hipR: [-0.2, 0, 0.05], knR: [-0.3, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
  ],
  scoober: [
    { t: 0,    root: [0, 0.1, 0], spine: [0.05, 0, 0], head: [0, -0.1, 0], shR: [0.5, 0, 0.5], elR: [1.4, 0, 0], shL: [0.3, 0, -0.3], elL: [0.5, 0, 0], hipR: [0, 0, 0.05], knR: [-0.1, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 0.5,  root: [0, -0.4, 0], spine: [0.2, -0.2, 0.2], head: [0, 0.4, 0], shR: [-0.5, 0.2, 0.75], elR: [1.4, 0, 0], shL: [0.6, 0, -0.6], elL: [0.9, 0, 0], hipR: [-0.2, 0, 0.12], knR: [-0.5, 0, 0], hipL: [0.4, 0, -0.05], knL: [-0.4, 0, 0], rootY: -0.1 },
    { t: 0.62, root: [0, 0.15, 0], spine: [-0.05, 0.2, -0.05], head: [0, -0.1, 0], shR: [1.6, 0, -0.3], elR: [0.8, 0, 0], shL: [0.3, 0, -0.8], elL: [0.9, 0, 0], hipR: [-0.2, 0, 0.1], knR: [-0.3, 0, 0], hipL: [0.3, 0, -0.05], knL: [-0.2, 0, 0], rootY: -0.02 },
    { t: 0.8,  root: [0, 0.5, 0], spine: [-0.15, 0.4, -0.15], head: [0, -0.4, 0], shR: [2.3, 0, -0.9], elR: [1.1, 0, 0], shL: [0.1, 0, -0.5], elL: [0.5, 0, 0], hipR: [-0.4, 0, 0.15], knR: [-0.5, 0, 0], hipL: [0.1, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 1,    root: [0, 0.4, 0], spine: [0.05, 0, 0], head: [0, -0.2, 0], shR: [0.4, 0, 0.3], elR: [0.5, 0, 0], shL: [0.1, 0, -0.2], elL: [0.35, 0, 0], hipR: [-0.2, 0, 0.05], knR: [-0.3, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
  ],
  putt: [
    { t: 0,    root: [0, 0, 0], spine: [0.15, 0, 0], head: [-0.1, 0, 0], shR: [0.7, 0, 0.2], elR: [1.7, 0, 0], shL: [0.3, 0, -0.6], elL: [0.4, 0, 0], hipR: [0.25, 0, 0.05], knR: [-0.5, 0, 0], hipL: [0.25, 0, -0.05], knL: [-0.5, 0, 0], rootY: -0.1 },
    { t: 0.5,  root: [0, 0, 0], spine: [0.28, 0, 0], head: [-0.2, 0, 0], shR: [0.45, 0, 0.25], elR: [2.0, 0, 0], shL: [0.35, 0, -0.8], elL: [0.4, 0, 0], hipR: [0.4, 0, 0.05], knR: [-0.8, 0, 0], hipL: [0.4, 0, -0.05], knL: [-0.8, 0, 0], rootY: -0.17 },
    { t: 0.62, root: [0, 0, 0], spine: [0.05, 0, 0], head: [-0.05, 0, 0], shR: [1.5, 0, 0.1], elR: [0.15, 0, 0], shL: [0.3, 0, -0.7], elL: [0.4, 0, 0], hipR: [-0.25, 0, 0.05], knR: [-0.35, 0, 0], hipL: [0.3, 0, -0.05], knL: [-0.25, 0, 0], rootY: -0.03 },
    { t: 0.8,  root: [0, 0, 0], spine: [-0.05, 0, 0], head: [0, 0, 0], shR: [1.95, 0, 0.1], elR: [0.1, 0, 0], shL: [0.2, 0, -0.6], elL: [0.4, 0, 0], hipR: [-0.7, 0, 0.05], knR: [-0.2, 0, 0], hipL: [0.25, 0, -0.05], knL: [-0.15, 0, 0], rootY: 0 },
    { t: 1,    root: [0, 0, 0], spine: [0.05, 0, 0], head: [0, 0, 0], shR: [1.2, 0, 0.2], elR: [0.4, 0, 0], shL: [0.15, 0, -0.3], elL: [0.4, 0, 0], hipR: [-0.35, 0, 0.05], knR: [-0.3, 0, 0], hipL: [0.15, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
  ],
};

function poseAt(keys, phase) {
  let a = keys[0], b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) if (phase >= keys[i].t && phase <= keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break; }
  let u = b.t === a.t ? 0 : (phase - a.t) / (b.t - a.t);
  u = u * u * (3 - 2 * u);
  const out = {};
  for (const j of JOINTS) { const pa = a[j] || IDLE[j], pb = b[j] || IDLE[j]; out[j] = [pa[0] + (pb[0] - pa[0]) * u, pa[1] + (pb[1] - pa[1]) * u, pa[2] + (pb[2] - pa[2]) * u]; }
  out.rootY = (a.rootY || 0) + ((b.rootY || 0) - (a.rootY || 0)) * u;
  return out;
}

// Printed jersey: base colour, contrast side panels, collar trim, chest wordmark, number on the back.
// Capsule UVs: u wraps around (0 = back seam, 0.5 = chest), v runs bottom→top.
function jerseyTexture(a) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
  const dark = (hex, k) => { const col = new THREE.Color(hex); col.multiplyScalar(k); return '#' + col.getHexString(); };
  g.fillStyle = a.jersey; g.fillRect(0, 0, 512, 512);
  // subtle knit
  for (let y = 0; y < 512; y += 2) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, y, 512, 1); } for (let x = 0; x < 512; x += 2) { g.fillStyle = 'rgba(255,255,255,0.03)'; g.fillRect(x, 0, 1, 512); }
  g.fillStyle = a.accent; g.fillRect(112, 0, 22, 512); g.fillRect(378, 0, 22, 512);   // side panels
  g.fillStyle = dark(a.jersey, 0.72); g.fillRect(134, 0, 8, 512); g.fillRect(370, 0, 8, 512);
  g.fillStyle = a.accent; g.fillRect(0, 0, 512, 14); g.fillRect(0, 498, 512, 14);   // collar and hem trim
  // lathe u runs left→right as seen from outside on both the chest and the back, so text is drawn unmirrored
  g.fillStyle = a.accent; g.font = '900 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('CHAINS', 256, 110); g.font = 'bold 22px system-ui, sans-serif'; g.fillText(`${a.number}`, 256, 150);
  g.font = '900 150px system-ui, sans-serif';
  g.fillStyle = dark(a.accent, 0.75); g.fillText(`${a.number}`, 4, 210); g.fillText(`${a.number}`, 516, 210);   // back number straddles the seam
  g.fillStyle = a.accent; g.fillText(`${a.number}`, 0, 204); g.fillText(`${a.number}`, 512, 204);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

export function createCharacter(opts = {}) {
  const a = { ...DEFAULT_AVATAR, ...(opts.color ? { jersey: opts.color } : {}), ...(opts.skin ? { skin: opts.skin } : {}), ...(opts.cap ? { headwearColor: opts.cap } : {}), ...opts };
  const imported = createGLTFCharacter(a); if (imported) return imported;
  const g = new THREE.Group();
  const std = (c, r = 0.75, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...extra });
  const skinM = new THREE.MeshPhysicalMaterial({ color: a.skin, roughness: 0.55, sheen: 0.25, sheenRoughness: 0.8, sheenColor: new THREE.Color('#ffd9c0') });
  const shirtM = new THREE.MeshPhysicalMaterial({ map: jerseyTexture(a), roughness: 0.9, sheen: 0.5, sheenRoughness: 0.75, sheenColor: new THREE.Color('#ffffff') });
  const shirtPlain = new THREE.MeshPhysicalMaterial({ color: a.jersey, roughness: 0.9, sheen: 0.5, sheenRoughness: 0.75, sheenColor: new THREE.Color('#ffffff') });
  const accentM = std(a.accent, 0.8), shortsM = std(a.shorts, 0.92), shortsDark = std(new THREE.Color(a.shorts).multiplyScalar(0.7), 0.95);
  const shoeM = std(a.shoes, 0.5), soleM = std('#e9e9e9', 0.6), hairM = std(a.hairColor, 0.95), hatM = std(a.headwearColor, 0.85), sockM = std('#f6f6f6', 0.95);
  const build = { slim: [0.96, 0.185, 0.9], athletic: [1.05, 0.2, 1], broad: [1.15, 0.22, 1.1] }[a.build] || [1.05, 0.2, 1];
  const caps = (r, l, m) => { const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 12), m); mesh.castShadow = true; return mesh; };
  const sph = (r, m, seg = 12) => { const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), m); mesh.castShadow = true; return mesh; };
  const ROOT_Y = 0.93;
  const root = new THREE.Group(); root.position.y = ROOT_Y; g.add(root);
  const pelvis = caps(0.15, 0.1, shortsM); pelvis.rotation.z = Math.PI / 2; pelvis.scale.set(1, 1, 0.8); root.add(pelvis);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.158, 0.162, 0.035, 18), shortsDark); belt.scale.z = 0.8; belt.position.y = 0.07; root.add(belt);
  const spine = new THREE.Group(); spine.position.y = 0.08; root.add(spine);
  const torso = caps(0.165, 0.28, shirtM); torso.position.y = 0.25; torso.scale.set(build[0], 1, 0.72); spine.add(torso);
  const neck = new THREE.Group(); neck.position.y = 0.5; spine.add(neck);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.09, 10), skinM); neckMesh.position.y = 0.02; neck.add(neckMesh);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 18).rotateX(Math.PI / 2), accentM); collar.position.y = 0.0; neck.add(collar);
  const headG = new THREE.Group(); neck.add(headG);
  const head = sph(0.11, skinM, 22); head.position.y = 0.13; head.scale.set(0.95, 1.05, 1); headG.add(head);
  // face
  for (const s of [-1, 1]) {
    const eye = sph(0.017, std('#f4f4f4', 0.35), 8); eye.position.set(s * 0.04, 0.02, -0.093); head.add(eye);
    const pupil = sph(0.008, std('#1a1712', 0.4), 6); pupil.position.set(s * 0.04, 0.02, -0.107); head.add(pupil);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.007, 0.008), hairM); brow.position.set(s * 0.042, 0.05, -0.098); brow.rotation.z = s * -0.15; brow.rotation.x = 0.3; head.add(brow);
    const ear = sph(0.017, skinM, 8); ear.position.set(s * 0.104, 0.005, 0.01); ear.scale.set(0.45, 1, 0.8); head.add(ear);
  }
  const nose = sph(0.013, skinM, 8); nose.position.set(0, -0.01, -0.108); nose.scale.set(0.8, 1.1, 1); head.add(nose);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.005, 0.006), std('#8a4a45', 0.8)); mouth.position.set(0, -0.045, -0.101); mouth.rotation.x = 0.4; head.add(mouth);
  if (a.shades) { const shades = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.03), new THREE.MeshPhysicalMaterial({ color: '#0b0d12', roughness: 0.15, clearcoat: 1 })); shades.position.set(0, 0.022, -0.095); head.add(shades); }
  // hair
  const hasHat = a.headwear !== 'none';
  const dome = (r, len, m, y = 0.01) => { const d = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 12, 0, Math.PI * 2, 0, len), m); d.position.set(0, y, 0.006); d.castShadow = true; head.add(d); return d; };
  if (a.hair === 'short') dome(hasHat ? 0.112 : 0.117, Math.PI * 0.55, hairM);
  else if (a.hair === 'buzz') dome(0.113, Math.PI * 0.5, hairM);
  else if (a.hair === 'curly') { dome(hasHat ? 0.114 : 0.126, Math.PI * 0.58, hairM, 0.015); if (!hasHat) for (let i = 0; i < 7; i++) { const b = sph(0.03, hairM, 8); const an = i / 7 * Math.PI * 2; b.position.set(Math.cos(an) * 0.09, 0.07 + Math.sin(i * 2.1) * 0.02, Math.sin(an) * 0.09); head.add(b); } }
  else if (a.hair === 'long') { dome(hasHat ? 0.112 : 0.117, Math.PI * 0.6, hairM); const tail = caps(0.04, 0.16, hairM); tail.position.set(0, -0.09, 0.085); tail.rotation.x = 0.25; head.add(tail); }
  else if (a.hair === 'bun') { dome(hasHat ? 0.112 : 0.117, Math.PI * 0.55, hairM); const bun = sph(0.042, hairM, 10); bun.position.set(0, 0.075, 0.085); head.add(bun); }
  // headwear
  if (a.headwear === 'cap' || a.headwear === 'backcap') {
    const capMesh = dome(0.119, Math.PI * 0.5, hatM, 0.018); const btn = sph(0.012, hatM, 6); btn.position.set(0, 0.137, 0.006); head.add(btn);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.012, 20, 1, false, -Math.PI * 0.42, Math.PI * 0.84), hatM); brim.scale.set(1, 1, 1.35); brim.position.set(0, 0.035, 0.004); brim.rotation.y = a.headwear === 'cap' ? Math.PI : 0; brim.rotation.x = a.headwear === 'cap' ? -0.12 : 0.12; brim.castShadow = true; head.add(brim);
    void capMesh;
  } else if (a.headwear === 'beanie') { dome(0.122, Math.PI * 0.62, hatM, 0.022); const band = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.016, 8, 24).rotateX(Math.PI / 2), hatM); band.position.set(0, 0.0, 0.006); head.add(band); }
  else if (a.headwear === 'visor') { const band = new THREE.Mesh(new THREE.TorusGeometry(0.114, 0.014, 8, 24).rotateX(Math.PI / 2), hatM); band.position.set(0, 0.035, 0.004); head.add(band); const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.012, 20, 1, false, -Math.PI * 0.42, Math.PI * 0.84), hatM); brim.scale.set(1, 1, 1.35); brim.position.set(0, 0.035, 0.004); brim.rotation.y = Math.PI; brim.rotation.x = -0.12; head.add(brim); }

  const arm = side => {
    const shoulder = new THREE.Group(); shoulder.position.set(side * build[1], 0.44, 0); spine.add(shoulder);
    const delt = sph(0.062 * build[2], shirtPlain, 10); delt.position.y = -0.01; shoulder.add(delt);
    const upper = caps(0.05 * build[2], 0.2, shirtPlain); upper.position.y = -0.14; shoulder.add(upper);
    const sleeve = new THREE.Mesh(new THREE.TorusGeometry(0.052 * build[2], 0.01, 6, 16).rotateX(Math.PI / 2), accentM); sleeve.position.y = -0.2; shoulder.add(sleeve);
    const elbow = new THREE.Group(); elbow.position.y = -0.28; shoulder.add(elbow);
    const fore = caps(0.042 * build[2], 0.2, skinM); fore.position.y = -0.13; elbow.add(fore);
    if (side === 1) { const wb = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.011, 6, 16).rotateX(Math.PI / 2), accentM); wb.position.y = -0.24; elbow.add(wb); }
    const hand = new THREE.Group(); hand.position.y = -0.28; elbow.add(hand);
    const palm = sph(0.045, skinM, 10); palm.scale.set(1, 0.55, 1.2); hand.add(palm);
    const thumb = caps(0.012, 0.03, skinM); thumb.position.set(side * -0.04, 0, -0.02); thumb.rotation.z = side * 0.9; hand.add(thumb);
    return { shoulder, elbow, hand };
  };
  const R = arm(1), L = arm(-1);
  const leg = side => {
    const hip = new THREE.Group(); hip.position.set(side * 0.1, -0.02, 0); root.add(hip);
    const thigh = caps(0.078, 0.26, shortsM); thigh.position.y = -0.19; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
    const shin = caps(0.056, 0.3, skinM); shin.position.y = -0.2; knee.add(shin);
    const calf = sph(0.062, skinM, 10); calf.position.set(0, -0.1, 0.012); calf.scale.set(1, 1.5, 1); knee.add(calf);
    const sock = caps(0.06, 0.09, sockM); sock.position.y = -0.34; knee.add(sock);
    const sockStripe = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 16).rotateX(Math.PI / 2), accentM); sockStripe.position.y = -0.31; knee.add(sockStripe);
    const foot = new THREE.Group(); foot.position.set(0, -0.45, -0.05); knee.add(foot);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.028, 0.27), soleM); sole.position.y = -0.03; sole.castShadow = true; foot.add(sole);
    const upperShoe = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.055, 0.22), shoeM); upperShoe.position.set(0, 0.008, 0.015); upperShoe.castShadow = true; foot.add(upperShoe);
    const toe = sph(0.047, shoeM, 10); toe.scale.set(1, 0.7, 1.4); toe.position.set(0, -0.005, -0.1); foot.add(toe);
    const heel = sph(0.046, shoeM, 10); heel.scale.set(1, 0.8, 1); heel.position.set(0, 0.0, 0.11); foot.add(heel);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.012, 0.16), accentM); stripe.position.set(0, -0.004, 0.01); foot.add(stripe);
    return { hip, knee };
  };
  const RL = leg(1), LL = leg(-1);
  const joints = { root, spine, head: headG, shR: R.shoulder, elR: R.elbow, shL: L.shoulder, elL: L.elbow, hipR: RL.hip, knR: RL.knee, hipL: LL.hip, knL: LL.knee };

  const cur = {}; for (const j of JOINTS) cur[j] = [...IDLE[j]]; cur.rootY = 0;
  let throwType = 'backhand', phase = null, time = Math.random() * 10;
  const apply = () => { for (const j of JOINTS) joints[j].rotation.set(cur[j][0], cur[j][1], cur[j][2]); root.position.y = ROOT_Y + cur.rootY; };

  return {
    group: g, hand: R.hand, joints, avatar: a,
    setThrow(t) { throwType = t; },
    setPhase(p) { phase = p; },                       // null = idle
    getPhase() { return phase; },
    update(dt) {
      time += dt;
      let target;
      if (phase === null) {
        target = {}; for (const j of JOINTS) target[j] = [...IDLE[j]]; target.rootY = Math.sin(time * 1.8) * 0.004;
        target.spine[0] += Math.sin(time * 1.8) * 0.02; target.spine[2] += Math.sin(time * 0.6) * 0.015; target.shR[2] += Math.sin(time * 1.3) * 0.02; target.shL[2] -= Math.sin(time * 1.1) * 0.02;
        target.head[1] += Math.sin(time * 0.45) * 0.22; target.head[0] += Math.sin(time * 0.7) * 0.04;
      } else target = poseAt(K[throwType], phase);
      const k = 1 - Math.exp(-(phase === null ? 7 : 30) * dt);
      for (const j of JOINTS) for (let i = 0; i < 3; i++) cur[j][i] += (target[j][i] - cur[j][i]) * k;
      cur.rootY += (target.rootY - cur.rootY) * k;
      apply();
    },
    faceDir(dx, dz) { g.rotation.y = Math.atan2(-dx, -dz); },
    dispose() { g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); shirtM.map?.dispose(); },
  };
}
