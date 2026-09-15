// Procedural rigged golfer with a customisable avatar (skin, hair, headwear, jersey with a printed
// canvas texture, build). Faces -Z. Root yaw + = turns left. Throw animations are keyframed per throw
// type; phase 0..0.5 is the windup (scrubbed by the swipe), 0.5..1 the release/follow-through.
import * as THREE from 'three';
import { createGLTFCharacter } from './gltf-player.js';
import { FACE_OPTIONS, FACE_DEFAULTS, createFaceParts } from './face-parts.js';
import { characterRamp } from './character-material.js';
import { paintDetail } from './materials.js';

export const AVATAR_OPTIONS = {
  ...FACE_OPTIONS,
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
  hand: ['right', 'left'],
};
export const DEFAULT_AVATAR = { hand: 'right', ...FACE_DEFAULTS, name: 'You', skin: '#d9a382', hair: 'short', hairColor: '#3b2a1c', jersey: '#ff4d3d', accent: '#ffffff', shorts: '#23262e', shoes: '#f1f1f1', headwear: 'none', headwearColor: '#151820', number: 7, shades: false, build: 'athletic' };
export function randomAvatar(rng = Math.random, overrides = {}) {
  const pick = a => a[Math.floor(rng() * a.length)];
  const jersey = overrides.jersey || pick(AVATAR_OPTIONS.jersey);
  return { ...DEFAULT_AVATAR, ...Object.fromEntries(Object.entries(FACE_OPTIONS).map(([k,v])=>[k,pick(v)])), skin: pick(AVATAR_OPTIONS.skin), hair: pick(AVATAR_OPTIONS.hair), hairColor: pick(AVATAR_OPTIONS.hairColor), jersey, accent: pick(AVATAR_OPTIONS.accent.filter(c => c !== jersey)), shorts: pick(AVATAR_OPTIONS.shorts), shoes: pick(AVATAR_OPTIONS.shoes), headwear: pick(AVATAR_OPTIONS.headwear), headwearColor: pick(AVATAR_OPTIONS.headwearColor), number: Math.floor(rng() * 99) + 1, shades: rng() < 0.5, build: pick(AVATAR_OPTIONS.build), hand: rng() < 0.12 ? 'left' : 'right', ...overrides };
}

const JOINTS = ['root', 'spine', 'head', 'shR', 'elR', 'shL', 'elL', 'hipR', 'knR', 'hipL', 'knL'];
const IDLE = { root: [0, 0, 0], spine: [0.04, 0, 0], head: [0, 0, 0], shR: [0.85, 0, 0.3], elR: [1.35, 0, 0], shL: [0.15, 0, -0.2], elL: [0.4, 0, 0], hipR: [0, 0, 0.04], knR: [-0.05, 0, 0], hipL: [0, 0, -0.04], knL: [-0.05, 0, 0], rootY: 0 };

const K = {
  backhand: [
    { t: 0,    root: [0, 0.55, 0], spine: [0.06, 0.1, 0], head: [0, -0.5, 0], shR: [0.95, 0.15, -0.2], elR: [1.2, 0, 0], shL: [0.3, 0, -0.3], elL: [0.5, 0, 0], hipR: [0, 0, 0.05], knR: [-0.1, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 0.5,  root: [0, 2.0, 0], spine: [0.12, 0.35, 0.08], head: [0, -1.2, 0], shR: [0.15, -0.55, -1.45], elR: [0.25, 0, 0], shL: [0.35, 0, -1.0], elL: [0.6, 0, 0], hipR: [0.45, 0, 0.1], knR: [-0.35, 0, 0], hipL: [-0.3, 0, -0.08], knL: [-0.5, 0, 0], rootY: -0.04 },
    { t: 0.62, root: [0, 0.75, 0], spine: [0.05, -0.15, 0], head: [0, -0.6, 0], shR: [0.05, 0.82, 1.45], elR: [0.08, 0, 0], shL: [0.5, 0, -0.85], elL: [0.9, 0, 0], hipR: [-0.15, 0, 0.1], knR: [-0.25, 0, 0], hipL: [0.3, 0, -0.05], knL: [-0.2, 0, 0], rootY: -0.03 },
    { t: 0.8,  root: [0, -0.35, 0], spine: [0.05, -0.35, -0.08], head: [0, 0.1, 0], shR: [0.1, -0.5, -1.3], elR: [0.35, 0, 0], shL: [0.1, 0, -0.55], elL: [0.5, 0, 0], hipR: [-0.45, 0, 0.12], knR: [-0.55, 0, 0], hipL: [0.15, 0, -0.05], knL: [-0.15, 0, 0], rootY: 0 },
    { t: 1,    root: [0, -0.45, 0], spine: [0.05, 0, 0], head: [0, 0.2, 0], shR: [0.35, 0, 0.3], elR: [0.4, 0, 0], shL: [0.1, 0, -0.2], elL: [0.35, 0, 0], hipR: [-0.2, 0, 0.05], knR: [-0.3, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
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
  blade: [
    { t: 0,    root: [0, 0.15, 0], spine: [0.05, 0, 0], head: [0, -0.15, 0], shR: [0.4, 0, 0.5], elR: [1.5, 0, 0], shL: [0.3, 0, -0.3], elL: [0.5, 0, 0], hipR: [0, 0, 0.05], knR: [-0.1, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 0.5,  root: [0, -0.5, 0], spine: [-0.1, -0.25, 0.15], head: [0, 0.4, 0], shR: [-1.2, 0.3, 1.5], elR: [1.7, 0, 0], shL: [0.7, 0, -0.6], elL: [0.9, 0, 0], hipR: [-0.3, 0, 0.12], knR: [-0.55, 0, 0], hipL: [0.45, 0, -0.05], knL: [-0.35, 0, 0], rootY: -0.05 },
    { t: 0.62, root: [0, 0.15, 0], spine: [0.15, 0.2, -0.05], head: [0, -0.2, 0], shR: [1.9, 0.2, 1.1], elR: [0.2, 0, 0], shL: [0.4, 0, -0.8], elL: [0.9, 0, 0], hipR: [-0.15, 0, 0.1], knR: [-0.3, 0, 0], hipL: [0.3, 0, -0.05], knL: [-0.2, 0, 0], rootY: -0.02 },
    { t: 0.8,  root: [0, 0.55, 0], spine: [0.3, 0.4, -0.2], head: [0, -0.5, 0], shR: [2.2, 0, -0.6], elR: [0.6, 0, 0], shL: [0.1, 0, -0.5], elL: [0.5, 0, 0], hipR: [-0.5, 0, 0.15], knR: [-0.6, 0, 0], hipL: [0.1, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 1,    root: [0, 0.5, 0], spine: [0.05, 0, 0], head: [0, -0.3, 0], shR: [0.4, 0, 0.3], elR: [0.5, 0, 0], shL: [0.1, 0, -0.2], elL: [0.35, 0, 0], hipR: [-0.2, 0, 0.05], knR: [-0.3, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
  ],
  putt: [
    { t: 0,    root: [0, 0, 0], spine: [0.15, 0, 0], head: [-0.1, 0, 0], shR: [0.7, 0, 0.2], elR: [1.7, 0, 0], shL: [0.3, 0, -0.6], elL: [0.4, 0, 0], hipR: [0.25, 0, 0.05], knR: [-0.5, 0, 0], hipL: [0.25, 0, -0.05], knL: [-0.5, 0, 0], rootY: -0.1 },
    { t: 0.5,  root: [0, 0, 0], spine: [0.28, 0, 0], head: [-0.2, 0, 0], shR: [0.45, 0, 0.25], elR: [2.0, 0, 0], shL: [0.35, 0, -0.8], elL: [0.4, 0, 0], hipR: [0.4, 0, 0.05], knR: [-0.8, 0, 0], hipL: [0.4, 0, -0.05], knL: [-0.8, 0, 0], rootY: -0.17 },
    { t: 0.62, root: [0, 0, 0], spine: [0.05, 0, 0], head: [-0.05, 0, 0], shR: [1.5, 0, 0.1], elR: [0.15, 0, 0], shL: [0.3, 0, -0.7], elL: [0.4, 0, 0], hipR: [-0.25, 0, 0.05], knR: [-0.35, 0, 0], hipL: [0.3, 0, -0.05], knL: [-0.25, 0, 0], rootY: -0.03 },
    { t: 0.8,  root: [0, 0, 0], spine: [-0.05, 0, 0], head: [0, 0, 0], shR: [1.95, 0, 0.1], elR: [0.1, 0, 0], shL: [0.2, 0, -0.6], elL: [0.4, 0, 0], hipR: [-0.7, 0, 0.05], knR: [-0.2, 0, 0], hipL: [0.25, 0, -0.05], knL: [-0.15, 0, 0], rootY: 0 },
    { t: 1,    root: [0, 0, 0], spine: [0.05, 0, 0], head: [0, 0, 0], shR: [1.2, 0, 0.2], elR: [0.4, 0, 0], shL: [0.15, 0, -0.3], elL: [0.4, 0, 0], hipR: [-0.35, 0, 0.05], knR: [-0.3, 0, 0], hipL: [0.15, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
  ],
};

// Left-handers are the same motion reflected: swap sides, negate the yaw and roll of every joint.
const MIRROR = { shR: 'shL', shL: 'shR', elR: 'elL', elL: 'elR', hipR: 'hipL', hipL: 'hipR', knR: 'knL', knL: 'knR' };
const mirrorPose = t => { const m = { rootY: t.rootY }; for (const j of JOINTS) { const v = t[MIRROR[j] || j]; m[j] = [v[0], -v[1], -v[2]]; } return m; };
const keysFor = t => K[t] || K[t.split('_')[0]] || K.backhand;
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

export function createCharacter(opts = {}) {
  const a = { ...DEFAULT_AVATAR, ...(opts.color ? { jersey: opts.color } : {}), ...(opts.skin ? { skin: opts.skin } : {}), ...(opts.cap ? { headwearColor: opts.cap } : {}), ...opts };
  if (opts.glasses === undefined && opts.shades) a.glasses = 'sport';
  const imported = createGLTFCharacter(a); if (imported) return imported;
  const g = new THREE.Group();
  const materials = new Set();
  const std = c => { const m = new THREE.MeshToonMaterial({ color: c, gradientMap:characterRamp }); materials.add(m); return m; };
  const skinM=paintDetail(std(a.skin),'skin'), shirtM=paintDetail(std(a.jersey),'jersey'), accentM=std(a.accent), shortsM=std(a.shorts), shoeM=std(a.shoes), hairM=std(a.hairColor), hatM=std(a.headwearColor), gloveM=std('#ffffff'),soleM=std('#b6cbd6');
  const ell = (parent, m, x,y,z, sx,sy,sz) => {const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,20,14),m);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;};
  const tube = (parent,m,x,y,z,r,len) => {const mesh=new THREE.Mesh(new THREE.CapsuleGeometry(r,len,4,12),m);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
  const joint = (parent,x,y,z) => {const o=new THREE.Group();o.position.set(x,y,z);parent.add(o);return o;};
  const ROOT_Y=.64;
  const root=joint(g,0,ROOT_Y,0),spine=joint(root,0,.08,0),headG=joint(spine,0,.44,0);
  const width={slim:.93,athletic:1,broad:1.1}[a.build]||1;
  ell(root,shortsM,0,-.02,0,.185*width,.09,.12);
  ell(spine,shirtM,0,.19,0,.235*width,.285,.15);
  tube(spine,accentM,0,.40,0,.072,.025);
  ell(headG,skinM,0,.23,0,.275,.295,.255);
  for(const side of [-1,1])ell(headG,skinM,side*.272,.225,.005,.035,.052,.04);
  const face=createFaceParts(headG,a);
  if(a.hair!=='none') {
    const shell=new THREE.Mesh(new THREE.SphereGeometry(1,24,12,0,Math.PI*2,0,Math.PI*(a.hair==='buzz'?.39:.38)),hairM);shell.position.set(0,.245,.009);shell.scale.set(.285,.30,.27);headG.add(shell);
    if(a.hair==='short')ell(headG,hairM,-.10,.425,-.17,.14,.055,.078);
    if(a.hair==='curly')for(let i=0;i<7;i++){const angle=i*Math.PI*2/7;ell(headG,hairM,Math.cos(angle)*.205,.465,Math.sin(angle)*.19,.085,.07,.082);}
    if(a.hair==='long')ell(headG,hairM,0,.08,.24,.12,.24,.06);
    if(a.hair==='bun')ell(headG,hairM,0,.44,.25,.10,.095,.092);
  }
  if(a.headwear!=='none') {
    if(a.headwear!=='visor')ell(headG,hatM,0,.46,.01,.288,.105,.272);
    const band=new THREE.Mesh(new THREE.TorusGeometry(.263,.026,8,24),hatM);band.rotation.x=Math.PI/2;band.position.y=.415;headG.add(band);
    if(a.headwear!=='beanie')ell(headG,hatM,0,.417,a.headwear==='backcap'?.235:-.235,.265,.018,.13);
  }
  const arm=side=>{
    const shoulder=joint(spine,side*.24,.34,0),elbow=joint(shoulder,0,-.24,0),hand=joint(elbow,0,-.205,0);
    ell(shoulder,shirtM,0,-.04,0,.073,.125,.08);
    tube(shoulder,skinM,0,-.15,0,.043,.07);ell(elbow,skinM,0,0,0,.045,.045,.045);tube(elbow,skinM,0,-.08,0,.038,.085);tube(elbow,gloveM,0,-.16,0,.045,.018);
    ell(hand,gloveM,0,0,-.012,.062,.065,.055);ell(hand,gloveM,-side*.05,.015,-.043,.028,.04,.031);
    return {shoulder,elbow,hand};
  };
  const R=arm(1),L=arm(-1),lefty=a.hand==='left';
  const leg=side=>{const hip=joint(root,side*.115,-.02,0),knee=joint(hip,0,-.26,0);tube(hip,shortsM,0,-.115,0,.070,.12);ell(knee,skinM,0,0,0,.046,.05,.046);tube(knee,skinM,0,-.13,0,.044,.15);ell(knee,soleM,0,-.333,-.052,.083,.027,.154);ell(knee,shoeM,0,-.285,-.052,.079,.063,.15);return {hip,knee};};
  const RL=leg(1),LL=leg(-1);
  const joints={root,spine,head:headG,shR:R.shoulder,elR:R.elbow,shL:L.shoulder,elL:L.elbow,hipR:RL.hip,knR:RL.knee,hipL:LL.hip,knL:LL.knee};
  for(const [name,j] of Object.entries(joints))j.name=name;
  g.traverse(o=>{if(o.isMesh)o.castShadow=true;});

  const cur = {}; for (const j of JOINTS) cur[j] = [...IDLE[j]]; cur.rootY = 0;
  let throwType = 'backhand', phase = null, time = Math.random() * 10, mood = null, locomotion = null;
  const apply = () => { for (const j of JOINTS) joints[j].rotation.set(cur[j][0], cur[j][1], cur[j][2]); root.position.y = ROOT_Y + cur.rootY; };

  return {
    group: g, hand: lefty ? L.hand : R.hand, joints, avatar: a, source: 'procedural', clips: ['idle','practice',...Object.keys(K),'celebrate','slump','walk'], faceParts: face.parts, setFace: face.setFace,
    setThrow(t) { throwType = t; },
    setPhase(p) { phase = p; if(p!==null)mood=null; },                       // null = idle
    react(name) { mood={name,t:0};phase=null; },
    play(name) { locomotion=name;phase=null;mood=null;time=0; },
    getPhase() { return phase; },
    update(dt) {
      time += dt;
      let target;
      if (phase === null) {
        target = {}; for (const j of JOINTS) target[j] = [...IDLE[j]]; target.rootY = Math.sin(time * 1.8) * 0.004;
        target.spine[0] += Math.sin(time * 1.8) * 0.02; target.spine[2] += Math.sin(time * 0.6) * 0.015; target.shR[2] += Math.sin(time * 1.3) * 0.02; target.shL[2] -= Math.sin(time * 1.1) * 0.02;
        target.head[1] += Math.sin(time * 0.45) * 0.22; target.head[0] += Math.sin(time * 0.7) * 0.04;
        if(locomotion==='walk') { const step=Math.sin(time*Math.PI*2);target.hipR[0]=step*.45;target.hipL[0]=-step*.45;target.shR[0]=-step*.4;target.shL[0]=step*.4; }
        if(locomotion==='practice') { const swing=(Math.sin(time*Math.PI/1.2)+1)*.5;target.root[1]=-.35+swing*.55;target.shR[0]=.7+swing*.5;target.elR[0]=1.2-swing*.6; }
        if(mood) { mood.t+=dt;const strength=Math.sin(Math.min(1,mood.t/2.4)*Math.PI);if(mood.name==='celebrate'){target.shR[0]=2.9*strength;target.shL[0]=2.9*strength;target.elR[0]=.4;target.elL[0]=.4;target.rootY=.1*strength;}else{target.spine[0]=.28*strength;target.head[0]=.35*strength;target.shR[0]=.1;}if(mood.t>=2.4)mood=null; }
      } else target = poseAt(keysFor(throwType), phase);
      if (lefty) target = mirrorPose(target);
      const k = 1 - Math.exp(-(phase === null ? 7 : 30) * dt);
      for (const j of JOINTS) for (let i = 0; i < 3; i++) cur[j][i] += (target[j][i] - cur[j][i]) * k;
      cur.rootY += (target.rootY - cur.rootY) * k;
      apply();
    },
    faceDir(dx, dz) { g.rotation.y = Math.atan2(-dx, -dz); },
    dispose() { face.dispose(); g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); for(const m of materials)m.dispose(); },
  };
}
