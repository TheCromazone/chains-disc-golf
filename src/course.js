// Procedural 9-hole wooded course: seeded terrain, fairway corridors, instanced trees (with physics
// colliders), ponds, tee pads, baskets, sky + sun. Exposes the `world` object the physics needs.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texture } from './assets.js';
import { modelParts, addModel } from './models.js';
import { terrainSplat, windMaterial } from './materials.js';

export const W = 520, H = 400;          // terrain extent (x: ±260, z: ±200)

// Course definitions. Everything visual and structural about a course comes from here so the same
// builder produces three different places. grass = [fairway, rough, deep rough, sand]; sun = [elevation, azimuth].
export const COURSES = [
  { id: 'pine', name: 'Pine Hollow', tag: 'Wooded · tight fairways', blurb: 'Nine holes cut through pines and oaks. Guardian trees, two doglegs, water on 3, 6 and 9.', seed: 7,
    len: [85, 108, 76, 128, 96, 68, 122, 90, 104], dog: { 1: -1, 3: 1, 6: -1 }, ponds: { 2: 'front', 5: 'right', 8: 'carry' },
    hills: 1, trees: 1, pine: 0.5, fairwayW: 1, wind: 1, grass: ['#9ccc57', '#5f8a34', '#3f6425', '#b5a875'], leafHue: 0.25,
    sun: [40, 130], sky: [4, 2.2], sunColor: '#fff1d6', fog: ['#c6d9e6', 0.0032], hemi: ['#cfe3ff', '#4d6b2e'], water: '#2d6f95' },
  { id: 'meadow', name: 'Cedar Meadows', tag: 'Open · long · windy', blurb: 'Big rolling meadow holes at golden hour. Few trees, a lot of wind, drivers all day.', seed: 23,
    len: [112, 138, 96, 165, 121, 88, 150, 104, 132], dog: { 3: 1, 6: 1 }, ponds: { 4: 'right' },
    hills: 1.7, trees: 0.3, pine: 0.15, fairwayW: 1.6, wind: 1.8, grass: ['#c4c95c', '#8fa33c', '#6b7f2c', '#c9b57a'], leafHue: 0.19,
    sun: [21, 245], sky: [7, 1.4], sunColor: '#ffd39a', fog: ['#e2cfae', 0.0026], hemi: ['#ffd9b0', '#6b6a2e'], water: '#4a7f8f' },
  { id: 'lake', name: 'Lakeshore Links', tag: 'Water on five holes', blurb: 'Morning light off the lake. Carries, wraps and island greens; every pond is out of bounds.', seed: 41,
    len: [92, 118, 80, 134, 100, 74, 126, 96, 110], dog: { 2: 1, 5: -1, 7: 1 }, ponds: { 0: 'right', 2: 'front', 4: 'carry', 6: 'right', 8: 'front' },
    hills: 0.8, trees: 0.7, pine: 0.35, fairwayW: 1.2, wind: 1.2, grass: ['#8fcf6a', '#4f8a3c', '#3a6a2c', '#cfc39a'], leafHue: 0.3,
    sun: [55, 95], sky: [2.5, 3], sunColor: '#fff8ec', fog: ['#d6e6ee', 0.0028], hemi: ['#dbeeff', '#4d7a3e'], water: '#2a7fa8' },
];
export const courseById = id => COURSES.find(c => c.id === id) || COURSES[0];
export const courseLayout = def => layoutHoles(makeRng(def.seed + 1), def);   // pure: used for the menu mini-maps
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

export function makeNoise(seed) {
  const hash = (x, y) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1013904223) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  };
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
  };
}
export function makeRng(seed) { let s = seed >>> 0 || 1; return () => { s = Math.imul(s ^ (s >>> 15), 2246822519) >>> 0; s = Math.imul(s ^ (s >>> 13), 3266489917) >>> 0; return ((s ^ (s >>> 16)) >>> 0) / 4294967296; }; }

// ---------- canvas textures ----------
function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  return t;
}
function grassTexture(rng) {
  return canvasTex(512, (g, s) => {
    g.fillStyle = '#4f7a2a'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 26000; i++) {
      const x = rng() * s, y = rng() * s, l = 2 + rng() * 5, h = 80 + rng() * 30, li = 22 + rng() * 22;
      g.strokeStyle = `hsl(${h}, ${45 + rng() * 25}%, ${li}%)`; g.lineWidth = 1 + rng();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 2, y - l); g.stroke();
    }
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(90,70,30,${0.08 + rng() * 0.1})`; g.beginPath(); g.arc(rng() * s, rng() * s, 3 + rng() * 6, 0, 7); g.fill(); }
  }, [60, 46]);
}
function concreteTexture(rng) {
  return canvasTex(256, (g, s) => {
    g.fillStyle = '#8f8b84'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) { const v = 110 + rng() * 60; g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.35)`; g.fillRect(rng() * s, rng() * s, 1 + rng() * 2, 1 + rng() * 2); }
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, s * 0.5); g.lineTo(s, s * 0.5); g.stroke();
  });
}
function waterNormalTexture(noise) {
  const size = 256, c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  const hgt = (x, y) => noise(x / 18, y / 18) * 0.7 + noise(x / 6 + 30, y / 6 + 30) * 0.3;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1);
    const i = (y * size + x) * 4;
    img.data[i] = 128 + dx * 900; img.data[i + 1] = 128 + dy * 900; img.data[i + 2] = 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4);
  return t;
}
function bladeTexture() {
  return canvasTex(128, (g, s) => {
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 9; i++) {
      const x = 10 + i * 13, h = 60 + Math.random() * 60, lean = (Math.random() - 0.5) * 30;
      const grd = g.createLinearGradient(0, s, 0, s - h); grd.addColorStop(0, '#3d6b22'); grd.addColorStop(1, '#8fc04a');
      g.fillStyle = grd; g.beginPath(); g.moveTo(x - 4, s); g.quadraticCurveTo(x + lean * 0.4, s - h * 0.6, x + lean, s - h); g.quadraticCurveTo(x + lean * 0.4 + 2, s - h * 0.6, x + 4, s); g.fill();
    }
  });
}
export function textTexture(lines, { w = 512, h = 256, bg = '#f3efe4', fg = '#1a1a1a', font = 'bold 64px system-ui, sans-serif' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, w / 2, h * (i + 1) / (lines.length + 1)));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- hole layout ----------
function layoutHoles(rng, def) {
  const LEN = def.len, DOG = def.dog, PONDS = def.ponds;
  const holes = []; let z = -150;
  for (let i = 0; i < LEN.length; i++) {
    const len = LEN[i], x = -200 + i * 50 + (rng() - 0.5) * 10;
    let dir = z + len <= 160 ? 1 : -1; if (i === 0) dir = 1;
    const tee = [x, z], basket = [x + (rng() - 0.5) * 6, z + dir * len];
    const way = [tee];
    if (DOG[i]) way.push([x + DOG[i] * 16, z + dir * len * 0.55]);
    way.push(basket);
    const ponds = [];
    const at = (t, lat) => [lerp(tee[0], basket[0], t) + lat, lerp(tee[1], basket[1], t)];
    if (PONDS[i] === 'front') { const c = at(0.72, -5); ponds.push({ x: c[0], z: c[1], rx: 12, rz: 9 }); }
    if (PONDS[i] === 'right') { const c = at(0.62, 17); ponds.push({ x: c[0], z: c[1], rx: 10, rz: 17 }); }
    if (PONDS[i] === 'carry') { const c = at(0.3, 0); ponds.push({ x: c[0], z: c[1], rx: 15, rz: 11 }); }
    holes.push({ idx: i, tee, basket, len, par: len > 110 ? 4 : 3, dir, way, ponds, pondKind: PONDS[i] || null });
    z = basket[1] + dir * 6;
  }
  return holes;
}
function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / l2, 0, 1);
  return { d: Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t)), t };
}
export function fairwayInfo(holes, x, z) { // nearest fairway polyline: distance + progress 0..1
  let best = { d: 1e9, hole: null, t: 0 };
  for (const h of holes) {
    let acc = 0, total = 0; for (let i = 0; i < h.way.length - 1; i++) total += Math.hypot(h.way[i + 1][0] - h.way[i][0], h.way[i + 1][1] - h.way[i][1]);
    for (let i = 0; i < h.way.length - 1; i++) {
      const a = h.way[i], b = h.way[i + 1], sl = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const r = segDist(x, z, a, b);
      if (r.d < best.d) best = { d: r.d, hole: h, t: (acc + r.t * sl) / total };
      acc += sl;
    }
  }
  return best;
}

// ---------- main build ----------
export function buildCourse(scene, renderer, { course: def = COURSES[0], quality = 'high', effects = null, hdri = null } = {}) {
  const seed = def.seed;
  const windClock = { value: 0 }, waters = [];
  const noise = makeNoise(seed), rng = makeRng(seed * 7919 + 13);
  const holes = layoutHoles(makeRng(seed + 1), def);
  const ponds = holes.flatMap(h => h.ponds);
  const group = new THREE.Group(); scene.add(group);

  // --- height field ---
  const baseH = (x, z) => def.hills * (2.2 * noise(x / 70 + 100, z / 70 + 100) + 0.9 * noise(x / 24 + 50, z / 24 + 50) + 3.5 * noise(x / 230 + 7, z / 230 + 7) - 3.3);
  for (const p of ponds) p.level = baseH(p.x, p.z) - 0.3;
  const flats = holes.flatMap(h => [h.tee, h.basket]).map(p => ({ x: p[0], z: p[1], h: baseH(p[0], p[1]) }));
  const height = (x, z) => {
    let h = baseH(x, z);
    for (const p of ponds) { const e = ((x - p.x) / p.rx) ** 2 + ((z - p.z) / p.rz) ** 2; if (e < 1.8) h -= 1.9 * smooth(1.8, 0.5, e); }
    for (const f of flats) { const d = Math.hypot(x - f.x, z - f.z); if (d < 7) h = lerp(f.h, h, smooth(2.5, 7, d)); }
    return h;
  };
  const normal = (x, z) => {
    const e = 0.4, hx = height(x + e, z) - height(x - e, z), hz = height(x, z + e) - height(x, z - e);
    const n = [-hx / (2 * e), 1, -hz / (2 * e)], l = Math.hypot(n[0], n[1], n[2]);
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  const inWater = (x, z) => { for (const p of ponds) { const e = ((x - p.x) / p.rx) ** 2 + ((z - p.z) / p.rz) ** 2; if (e < 1.7 && height(x, z) < p.level - 0.02) return true; } return false; };
  const waterLevel = (x, z) => { let best = ponds[0], bd = 1e9; for (const p of ponds) { const d = Math.hypot(x - p.x, z - p.z); if (d < bd) { bd = d; best = p; } } return best ? best.level : -100; };
  const inBounds = (x, z) => Math.abs(x) < W / 2 - 6 && Math.abs(z) < H / 2 - 6;
  for (const h of holes) { h.teeY = height(h.tee[0], h.tee[1]); h.basketY = height(h.basket[0], h.basket[1]); }

  // --- terrain mesh ---
  const segX = 260, segZ = 200;
  const geo = new THREE.PlaneGeometry(W, H, segX, segZ); geo.rotateX(-Math.PI / 2);
  const splats = new Float32Array(geo.attributes.position.count * 2);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  const cFair = new THREE.Color(def.grass[0]), cRough = new THREE.Color(def.grass[1]), cDark = new THREE.Color(def.grass[2]), cSand = new THREE.Color(def.grass[3]), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = height(x, z); pos.setY(i, y);
    const fi = fairwayInfo(holes, x, z);
    const n1 = noise(x / 9 + 3, z / 9 + 3), n2 = noise(x / 40 + 9, z / 40 + 9);
    tmp.copy(cFair).lerp(cRough, smooth(5, 12, fi.d + (n1 - 0.5) * 3)).lerp(cDark, smooth(18, 40, fi.d) * 0.5);
    tmp.lerp(cSand, (n2 > 0.72 ? (n2 - 0.72) * 2 : 0));
    for (const p of ponds) { const e = ((x - p.x) / p.rx) ** 2 + ((z - p.z) / p.rz) ** 2; if (e < 2.2) tmp.lerp(cSand, smooth(2.2, 1.1, e) * 0.7); }
    splats[i*2] = smooth(4, 0, fi.d) * smooth(.1, .3, fi.t) * (1-smooth(.7,.95,fi.t)) * .42;
    for (const p of ponds) { const e=((x-p.x)/p.rx)**2+((z-p.z)/p.rz)**2; splats[i*2+1]=Math.max(splats[i*2+1],smooth(2.2,1.25,e)); }
    tmp.multiplyScalar(0.85 + n1 * 0.3);
    if (quality !== 'low') tmp.lerp(new THREE.Color('#b6bf9e'), .38);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: texture('grass', { repeat: [60, 46] }) || grassTexture(rng), normalMap: texture('grass_normal', { repeat: [60, 46], srgb: false }), vertexColors: true, roughness: 0.95, metalness: 0 }));
  if (quality !== 'low') { terrainSplat(terrain.material, geo, splats); terrain.material.normalScale.set(.28,.28); }
  terrain.receiveShadow = true; group.add(terrain);

  // --- trees ---
  const trees = [], bushes = [], tufts = [];
  const pineSpots = [], decSpots = [];
  for (let gx = -W / 2 + 8; gx < W / 2 - 8; gx += 5) for (let gz = -H / 2 + 8; gz < H / 2 - 8; gz += 5) {
    const x = gx + (rng() - 0.5) * 4.5, z = gz + (rng() - 0.5) * 4.5;
    const fi = fairwayInfo(holes, x, z);
    const halfW = (7.5 + noise(x / 30, z / 30) * 5) * def.fairwayW;
    let skip = fi.d < halfW;
    for (const p of ponds) if (((x - p.x) / p.rx) ** 2 + ((z - p.z) / p.rz) ** 2 < 1.9) skip = true;
    for (const f of flats) if (Math.hypot(x - f.x, z - f.z) < 7) skip = true;
    const edge = Math.min(W / 2 - Math.abs(x), H / 2 - Math.abs(z));
    const prob = edge < 25 ? 0.85 : (fi.d < halfW + 8 ? 0.14 : 0.62) * def.trees;
    if (!skip && rng() < prob) {
      const s = 0.8 + rng() * 0.55, pine = noise(x / 90 + 500, z / 90 + 500) > 1 - def.pine;
      const y = height(x, z), rot = rng() * Math.PI * 2;
      (pine ? pineSpots : decSpots).push({ x, y, z, s, rot });
      trees.push(pine ? { x, y, z, r: 0.3 * s, h: 6 * s, fy: 7 * s, fr: 2.3 * s } : { x, y, z, r: 0.34 * s, h: 4 * s, fy: 5.8 * s, fr: 3.4 * s });
    } else if (!skip && fi.d > halfW - 1 && fi.d < halfW + 18 && rng() < 0.18) bushes.push({ x, y: height(x, z), z, s: 0.6 + rng() * 0.8, rot: rng() * 6.3 });
    if (!skip && fi.d < halfW + 10 && rng() < (fi.d < halfW ? 0.05 : 0.3)) for (let k = 0; k < 2; k++) { const tx = x + (rng() - 0.5) * 4, tz = z + (rng() - 0.5) * 4; tufts.push({ x: tx, y: height(tx, tz), z: tz, s: 0.7 + rng() * 0.7, rot: rng() * 6.3 }); }
  }
  // spatial grid for colliders
  const CELL = 12, grid = new Map();
  const key = (i, j) => i * 100000 + j;
  for (const t of trees) { const k = key(Math.floor(t.x / CELL), Math.floor(t.z / CELL)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t); }
  let lastK = null, lastList = [];
  const treesNear = (x, z) => {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL), k = key(i, j);
    if (k === lastK) return lastList;
    lastK = k; lastList = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = grid.get(key(i + a, j + b)); if (l) for (const t of l) lastList.push(t); }
    return lastList;
  };

  const bark = texture('bark', { repeat: [1, 3] });
  const trunkMat = new THREE.MeshStandardMaterial({ color: bark ? '#ffffff' : '#5b4a35', map: bark, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: false });
  const blob = (r, detail, amp) => { const g = new THREE.IcosahedronGeometry(r, detail); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + (noise(x * 1.3 + 40, y * 1.3 + z * 0.7 + 40) - 0.5) * amp; p.setXYZ(i, x * k, y * k, z * k); } g.computeVertexNormals(); return g; };
  const shift = (g, x, y, z) => g.translate(x, y, z);
  const pineTrunk = shift(new THREE.CylinderGeometry(0.16, 0.34, 6, 7), 0, 3, 0);
  const pineLeaf = mergeGeometries([shift(new THREE.ConeGeometry(2.4, 4.2, 9), 0, 5, 0), shift(new THREE.ConeGeometry(1.9, 3.8, 9), 0, 7.4, 0), shift(new THREE.ConeGeometry(1.3, 3.2, 9), 0, 9.5, 0)]);
  const decTrunk = mergeGeometries([shift(new THREE.CylinderGeometry(0.2, 0.4, 4.2, 7), 0, 2.1, 0), shift(new THREE.CylinderGeometry(0.08, 0.16, 2.6, 5).rotateZ(0.6), 0.9, 4.2, 0.2), shift(new THREE.CylinderGeometry(0.08, 0.16, 2.4, 5).rotateZ(-0.7).rotateY(1.2), -0.8, 4.1, -0.4)]);
  const bd = quality === 'low' ? 1 : 2;   // ponytail: blob detail is the main triangle cost on phones
  const decLeaf = mergeGeometries([shift(blob(3.3, bd, 0.5).scale(1, 0.85, 1), 0, 5.8, 0), shift(blob(2.2, bd, 0.5), 1.6, 6.9, 1.0), shift(blob(2.0, bd, 0.5), -1.5, 6.5, -1.2)]);
  const bushGeo = blob(1, 1, 0.6).scale(1, 0.75, 1).translate(0, 0.5, 0);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const inst = (geo, mat, spots, colorFn, shadow = true) => {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
    spots.forEach((s, i) => { e.set(0, s.rot, 0); q.setFromEuler(e); v.set(s.x, s.y - 0.15, s.z); sc.set(s.s, s.s, s.s); m.compose(v, q, sc); im.setMatrixAt(i, m); if (colorFn) im.setColorAt(i, colorFn(s)); });
    im.count = spots.length; im.castShadow = shadow; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    group.add(im); return im;
  };
  const col = new THREE.Color();
  const importedInstances = (name, spots, shadow = true) => {
    // Lite retains its existing foliage geometry budget.
    if (quality === 'low') return false;
    const parts = modelParts(name); if (!parts) return false;
    for (const part of parts) inst(part.geometry, windMaterial(part.material, windClock, name === 'grass'), spots, null, shadow);
    return true;
  };
  if (!importedInstances('pine', pineSpots)) {
    inst(pineTrunk, trunkMat, pineSpots, null, false);
    inst(pineLeaf, leafMat, pineSpots, s => col.setHSL(0.33 + (noise(s.x, s.z) - 0.5) * 0.06, 0.45, 0.2 + noise(s.z, s.x) * 0.1, THREE.SRGBColorSpace));
  }
  if (!importedInstances('deciduous', decSpots)) {
    inst(decTrunk, trunkMat, decSpots, null, false);
    inst(decLeaf, leafMat, decSpots, s => col.setHSL(def.leafHue + (noise(s.x + 9, s.z) - 0.5) * 0.1, 0.55, 0.3 + noise(s.z + 4, s.x) * 0.14, THREE.SRGBColorSpace));
  }
  if (!importedInstances('bush', bushes, false)) inst(bushGeo, leafMat, bushes, s => col.setHSL(0.3 + (noise(s.x + 2, s.z + 2) - 0.5) * 0.08, 0.5, 0.25 + noise(s.z, s.x + 7) * 0.1, THREE.SRGBColorSpace), false);
  // grass tufts: crossed quads
  const tuftGeo = mergeGeometries([new THREE.PlaneGeometry(1, 0.8).translate(0, 0.4, 0), new THREE.PlaneGeometry(1, 0.8).translate(0, 0.4, 0).rotateY(Math.PI / 2)]);
  const tuftMat = new THREE.MeshStandardMaterial({ map: texture('tuft') || bladeTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
  if (quality !== 'low' && !importedInstances('grass', tufts, false)) inst(tuftGeo, tuftMat, tufts, null, false);

  // --- water ---
  const waterNormal = texture('water_normal', { repeat: [4, 4], srgb: false }) || waterNormalTexture(noise);
  const waterMat = new THREE.MeshStandardMaterial({ color: def.water, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.88, normalMap: waterNormal, normalScale: new THREE.Vector2(0.35, 0.35) });
  for (const p of ponds) {
    const shape = new THREE.CircleGeometry(1,56);
    const sd = new THREE.Vector3().setFromSphericalCoords(1,THREE.MathUtils.degToRad(90-def.sun[0]),THREE.MathUtils.degToRad(def.sun[1]));
    const wm = effects ? effects.reflectiveWater(shape,waterNormal,def,sd) : new THREE.Mesh(shape, waterMat);
    if(effects) waters.push(wm);
    wm.rotation.x = -Math.PI / 2; wm.scale.set(p.rx * 1.25, p.rz * 1.25, 1); wm.position.set(p.x, p.level, p.z); wm.receiveShadow = true; group.add(wm);
  }

  // --- tee pads, signs, baskets ---
  const concrete = new THREE.MeshStandardMaterial({ map: texture('concrete') || concreteTexture(rng), roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: '#d5d9dd', metalness: 0.9, roughness: 0.3 });
  const yellow = new THREE.MeshStandardMaterial({ color: '#f2c318', roughness: 0.6 });
  const basketGeo = makeBasketGeometry();
  const baskets = [];
  for (const h of holes) {
    const yaw = Math.atan2(-(h.way[1][0] - h.tee[0]), -(h.way[1][1] - h.tee[1]));
    const pad = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 3.2), concrete);
    pad.position.set(h.tee[0], h.teeY + 0.05, h.tee[1]); pad.rotation.y = yaw; pad.receiveShadow = true; pad.castShadow = true; group.add(pad);
    const sign = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), trunkMat); post.position.y = 0.7; sign.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.62, 0.05), new THREE.MeshStandardMaterial({ map: textTexture([`HOLE ${h.idx + 1}`, `PAR ${h.par}  •  ${Math.round(h.len)} m`], { font: 'bold 60px system-ui, sans-serif' }), roughness: 0.7 }));
    board.position.y = 1.35; board.castShadow = true; sign.add(board);
    const sx = h.tee[0] + Math.cos(yaw) * 2.4 - Math.sin(yaw) * 2.6, sz = h.tee[1] - Math.sin(yaw) * 2.4 - Math.cos(yaw) * 2.6;   // right of and behind the pad
    sign.position.set(sx, height(sx, sz), sz); sign.rotation.y = yaw + Math.PI; group.add(sign);
    const signModel = addModel(sign, 'tee_sign');
    if (signModel) { post.visible = false; board.scale.set(.85, .65, 1); board.position.set(0, 1.30, -.08); board.rotation.y = Math.PI; }
    const b = new THREE.Group(); b.position.set(h.basket[0], h.basketY, h.basket[1]);
    const bm = new THREE.Mesh(basketGeo, metal); bm.castShadow = true; b.add(bm);
    if (addModel(b, 'basket')) bm.visible = false;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.03), new THREE.MeshStandardMaterial({ map: textTexture([String(h.idx + 1)], { w: 128, h: 96, bg: '#f2c318', font: 'bold 70px system-ui, sans-serif' }) }));
    flag.position.set(0, 1.62, 0); flag.rotation.y = yaw; b.add(flag);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 12), concrete); base.position.y = 0.03; b.add(base);
    group.add(b); baskets.push(b);
    void yellow;
  }

  // --- sky, lights, fog ---
  const sky = new Sky(); sky.scale.setScalar(20000);
  const su = sky.material.uniforms; su.turbidity.value = def.sky[0]; su.rayleigh.value = def.sky[1]; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.8;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - def.sun[0]), THREE.MathUtils.degToRad(def.sun[1]));
  su.sunPosition.value.copy(sunDir);
  const pmrem = new THREE.PMREMGenerator(renderer); const envScene = new THREE.Scene(); envScene.add(sky);
  const envRT = hdri?.target || pmrem.fromScene(envScene); scene.environment = envRT.texture; scene.environmentIntensity = quality === 'low' ? 1 : .32; envScene.remove(sky); scene.add(sky); pmrem.dispose();
  if(hdri){sky.visible=false;scene.background=hdri.texture;}
  scene.fog = new THREE.FogExp2(def.fog[0], def.fog[1]);
  const sun = new THREE.DirectionalLight(def.sunColor, quality === 'low' ? 2.3 : 3.1); sun.castShadow = true;
  const sm = quality === 'low' ? 1024 : 2048; sun.shadow.mapSize.set(sm, sm);
  const sc2 = sun.shadow.camera; sc2.left = sc2.bottom = -42; sc2.right = sc2.top = 42; sc2.near = 1; sc2.far = 400;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(def.hemi[0], def.hemi[1], quality === 'low' ? 1.15 : .65); scene.add(hemi);

  const atmosphere = effects?.atmosphere(group,def,holes);
  const world = { height, normal, treesNear, inWater, waterLevel, inBounds, wind: [0, 0], basket: null, ponds, holes };
  const setHole = i => { const h = holes[i]; world.basket = { x: h.basket[0], y: h.basketY, z: h.basket[1] }; };
  const update = (dt, t, focus) => {
    windClock.value=t; atmosphere?.update(t); for(const w of waters) w.material.uniforms.time.value=t*.55;
    waterNormal.offset.x = t * 0.02; waterNormal.offset.y = t * 0.013;
    if (focus) { sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(sunDir, 180); }
  };
  const dispose = () => {   // tear down so another course can be built into the same scene
    scene.remove(group, sky, sun, sun.target, hemi); scene.fog = null; scene.environment = null; scene.background = null; envRT.dispose(); hdri?.texture.dispose();
    group.traverse(o => { if (!o.geometry?.__shared) o.geometry?.dispose(); for (const m of [].concat(o.material || [])) { if (m.__shared) continue; for (const k of ['map', 'normalMap', 'roughnessMap']) if (m[k] && !m[k].__shared) m[k].dispose(); m.dispose(); } });
    sky.geometry.dispose(); sky.material.dispose(); sun.shadow.map?.dispose();
  };
  return { def, quality, world, holes, group, terrain, update, setHole, sunDir, baskets, dispose };
}

function makeBasketGeometry() {
  const parts = [];
  const add = (g, x = 0, y = 0, z = 0) => { g.translate(x, y, z); parts.push(g); };
  add(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 10), 0, 0.75, 0);
  add(new THREE.CircleGeometry(0.34, 28).rotateX(-Math.PI / 2), 0, 0.62, 0);
  add(new THREE.TorusGeometry(0.34, 0.012, 6, 32).rotateX(Math.PI / 2), 0, 0.79, 0);
  add(new THREE.TorusGeometry(0.34, 0.01, 6, 32).rotateX(Math.PI / 2), 0, 0.62, 0);
  for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; add(new THREE.CylinderGeometry(0.005, 0.005, 0.17, 4), Math.cos(a) * 0.34, 0.705, Math.sin(a) * 0.34); }
  add(new THREE.TorusGeometry(0.245, 0.013, 6, 32).rotateX(Math.PI / 2), 0, 1.32, 0);
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), 0, 0.8, 0);
  const chain = (r0, r1, n, off) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + off; const x0 = Math.cos(a) * r0, z0 = Math.sin(a) * r0, x1 = Math.cos(a) * r1, z1 = Math.sin(a) * r1; const dx = x1 - x0, dz = z1 - z0, dy = 0.8 - 1.32, L = Math.hypot(dx, dy, dz); const g = new THREE.CylinderGeometry(0.006, 0.006, L, 4); g.translate(0, -L / 2, 0); const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx, dy, dz), new THREE.Vector3(0, 1, 0)); const rot = new THREE.Matrix4().makeRotationX(Math.PI / 2); g.applyMatrix4(rot); g.applyMatrix4(m); g.translate(x0, 1.32, z0); parts.push(g); } };
  chain(0.245, 0.05, 12, 0); chain(0.16, 0.03, 8, 0.2);
  return mergeGeometries(parts);
}
