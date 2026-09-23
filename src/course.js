// Procedural 9-hole wooded course: seeded terrain, fairway corridors, instanced trees (with physics
// colliders), ponds, tee pads, baskets, sky + sun. Exposes the `world` object the physics needs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texture } from './assets.js';
import { canopyGeometry, IMPOSTOR, IMPOSTOR_ROWS, TREE_DIMS } from './canopies.js';
import { model } from './models.js';
import { modelParts, addModel } from './models.js';
import { windMaterial, windTime, toonMaterial, paintDetail, terrainSplat } from './materials.js';
import { dressCourse } from './props.js';
import { grassCarpet } from './grass.js';

export const W = 520, H = 400;          // terrain extent (x: ±260, z: ±200)

// Course definitions. Everything visual and structural about a course comes from here so the same
// builder produces three different places. grass = [fairway, rough, deep rough, sand]; sun = [key elevation, key azimuth,
// disc elevation, disc azimuth, key intensity]: a high key (24-42°) and a low visible disc (~11°), both left of hole 1's
// fairway (every course's hole 1 runs toward +z, azimuth 0; positive azimuth is screen-left from the tee, away from the
// athlete), see the sky section; sky = [cloud coverage threshold, cloud scale, zenith colour, low-sky blue];
// fog = [haze colour, exponential density per metre beyond 12 m]; hemi = [sky fill, ground bounce].
export const COURSES = [
  { id: 'pine', name: 'Pine Hollow', tag: 'Wooded · tight fairways', blurb: 'Nine holes cut through pines and oaks. Guardian trees, two doglegs, water on 3, 6 and 9.', seed: 7,
    len: [85, 108, 76, 128, 96, 68, 122, 90, 104], dog: { 1: -1, 3: 1, 6: -1 }, ponds: { 2: 'front', 5: 'right', 8: 'carry' },
    hills: 1, trees: 1, pine: 0.5, fairwayW: 1, wind: 1, grass: ['#689a3c', '#588a38', '#446f33', '#e3cf9a'], leafHue: 0.29,
    sun: [36, 30, 11.5, 13, 5], sky: [.52, 1.2, '#3a7cd4', '#8fbdea'], sunColor: '#fff0d8', fog: ['#bdd3e8', .0045], hemi: ['#a5c6ee', '#5d6b39'], water: '#2d6f95' },
  { id: 'meadow', name: 'Cedar Meadows', tag: 'Open · long · windy', blurb: 'Big rolling meadow holes at golden hour. Few trees, a lot of wind, drivers all day.', seed: 23,
    len: [112, 138, 96, 165, 121, 88, 150, 104, 132], dog: { 3: 1, 6: 1 }, ponds: { 4: 'right' },
    hills: 1.7, trees: 0.3, pine: 0.15, fairwayW: 1.6, wind: 1.8, grass: ['#74a03e', '#65933a', '#4f7434', '#e6d29c'], leafHue: 0.265,
    sun: [24, 42, 10, 22, 3.8], sky: [.48, 1.1, '#4a82cc', '#b4cbe4'], sunColor: '#ffdcae', fog: ['#d3d9df', .0042], hemi: ['#b2c7e6', '#6e6a3a'], water: '#4a7f8f' },
  { id: 'lake', name: 'Lakeshore Links', tag: 'Water on five holes', blurb: 'Morning light off the lake. Carries, wraps and island greens; every pond is out of bounds.', seed: 41,
    len: [92, 118, 80, 134, 100, 74, 126, 96, 110], dog: { 2: 1, 5: -1, 7: 1 }, ponds: { 0: 'right', 2: 'front', 4: 'carry', 6: 'right', 8: 'front' },
    hills: 0.8, trees: 0.7, pine: 0.35, fairwayW: 1.2, wind: 1.2, grass: ['#629c3f', '#528b3b', '#407236', '#ecd8a6'], leafHue: 0.3,
    sun: [31, 40, 11, 26, 4.4], sky: [.56, 1.35, '#3b80d6', '#a6cbee'], sunColor: '#fff2e0', fog: ['#c2d8ea', .0052], hemi: ['#a9caf0', '#4f6a42'], water: '#2a7fa8' },
  { id: 'bluff', name: 'Gull Point Bluffs', tag: 'Coastal · exposed · gusty', blurb: 'Headland links above the surf. Nothing stops the wind up here: read the socks, throw low into it and ride it home.', seed: 59,
    len: [98, 124, 88, 142, 110, 80, 156, 96, 118], dog: { 1: 1, 4: -1, 7: 1 }, ponds: { 2: 'right', 5: 'carry', 8: 'front' },
    hills: 2.1, trees: 0.22, pine: 0.7, fairwayW: 1.4, wind: 2.8, grass: ['#7fa144', '#709540', '#577a3c', '#e0d2a4'], leafHue: 0.25,
    sun: [40, 44, 12, 24, 3.6], sky: [.45, 1.2, '#3576d0', '#a2c6ea'], sunColor: '#fff4e4', fog: ['#c6d8e6', .004], hemi: ['#a8c8ee', '#6a7446'], water: '#3f8fb0' },
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
  const windClock = windTime, waters = [], clusters = []; let lastCull=-1;
  const noise = makeNoise(seed), rng = makeRng(seed * 7919 + 13);
  const holes = layoutHoles(makeRng(seed + 1), def);
  const ponds = holes.flatMap(h => h.ponds);
  const group = new THREE.Group(); scene.add(group);

  // --- height field ---
  // Authored broad landforms live in the same height function used by terrain vertices,
  // lies, normals, pond levels and disc collisions. This is real course elevation.
  const landforms = holes.map(h => {
    const dx=h.basket[0]-h.tee[0], dz=h.basket[1]-h.tee[1], length=Math.hypot(dx,dz);
    return { x:h.tee[0],z:h.tee[1],dx:dx/length,dz:dz/length,length,side:h.idx%2?-1:1 };
  });
  const landformGain=def.id==='meadow'?1.1:def.id==='lake'?.75:1;
  const baseH = (x, z) => {
    let relief=0;
    for(const f of landforms) {
      const px=x-f.x,pz=z-f.z,along=px*f.dx+pz*f.dz,across=-px*f.dz+pz*f.dx;
      const ridge=((along-f.length*.79)/(f.length*.32))**2+((across-f.side*7)/30)**2;
      const hollow=((along-f.length*.27)/(f.length*.23))**2+(across/25)**2;
      const shoulder=((along-f.length*.55)/(f.length*.29))**2+((across-f.side*15)/13)**2;
      const swale=((along-f.length*.61)/(f.length*.29))**2+((across+f.side*12)/10)**2;
      relief+=6.4*Math.exp(-ridge)-1.8*Math.exp(-hollow)+3.8*Math.exp(-shoulder)-2.3*Math.exp(-swale);
    }
    return relief*landformGain+def.hills*(2.2*noise(x/70+100,z/70+100)+.9*noise(x/24+50,z/24+50)+3.5*noise(x/230+7,z/230+7)-3.3);
  };
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
  for (const h of holes) { h.teeY = height(h.tee[0], h.tee[1]); h.basketY = height(h.basket[0], h.basket[1]); h.yaw = Math.atan2(-(h.way[1][0] - h.tee[0]), -(h.way[1][1] - h.tee[1])); }   // pad heading: local +z points behind the pad
  // One noise family for the turf's wear: three octaves (16, 6.5, 2.8 m) dry patches to straw, and the driest ground
  // near a tee wears through to earth. Pad wear is a gravel apron (Disc Golf Masters sets its mats in crushed stone):
  // it hugs the pad, runs longer behind it (the walk-in) and frays into the turf in fingers of a 1.3 m noise.
  const dryNoise = (x, z) => noise(x / 16 + 41, z / 16 + 41) * .55 + noise(x / 6.5 + 9, z / 6.5 + 9) * .3 + noise(x / 2.8 + 77, z / 2.8 + 77) * .15;
  const padWear = (x, z) => {
    let w = 0;
    for (const h of holes) {
      const tx = x - h.tee[0], tz = z - h.tee[1]; if (tx * tx + tz * tz > 64) continue;
      const cy = Math.cos(h.yaw), sy = Math.sin(h.yaw), u = tx * cy - tz * sy, v = tx * sy + tz * cy;
      const out = Math.hypot(Math.max(Math.abs(u) - .8, 0), Math.max(v > 0 ? v - 2.2 : -v - 1.6, 0));   // metres outside the pad, its back stretched by the walk-in
      w = Math.max(w, 1 - smooth(.2, .85, out + (noise(x / 1.3 + 91, z / 1.3 + 91) - .5) * .7));
    }
    return w;
  };

  // --- terrain mesh ---
  const segX = 260, segZ = 200;
  const geo = new THREE.PlaneGeometry(W, H, segX, segZ); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  const splats = new Float32Array(pos.count * 4);   // gravel/earth, sand, leaf litter, dry
  const turf = new Float32Array(pos.count * 4);     // fairway weight, metres across the tee-basket line (mown stripes), trail offset, trail wear
  // Each colour is a zone's mean albedo: the photo tiles are divided by their means in the shader, so these are what
  // the turf averages to. Mown fairway lightest, rough, then deep rough away from the line and in damp hollows.
  const grassNormal = texture('grass_normal', { repeat: [480, 368], srgb: false });
  const cFair = new THREE.Color(def.grass[0]), cRough = new THREE.Color(def.grass[1]), cDark = new THREE.Color(def.grass[2]), cSand = new THREE.Color(def.grass[3]), tmp = new THREE.Color();
  const cCollar = cRough.clone().lerp(cDark, .5);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = height(x, z); pos.setY(i, y);
    const fi = fairwayInfo(holes, x, z);
    const n2 = noise(x / 40 + 9, z / 40 + 9);
    // Scalloped fairway and a darker first-cut collar form a readable route even when the phone camera sees little lateral ground.
    const phase = fi.t * Math.PI * 4;
    const width = (2.0 + smooth(.06,.22,fi.t) * 1.7 + Math.sin(phase - .6) * .6 + Math.sin(phase * 1.8) * .25) * def.fairwayW;
    const edge = fi.d + (n2 - .5) * .8;
    const fair = 1 - smooth(width, width + .55, edge), collar = 1 - smooth(width + 1.05, width + 1.8, edge);
    tmp.copy(cRough).lerp(cDark, clamp(smooth(width + 5, width + 24, edge) * .6 + smooth(.55, .8, noise(x / 19 + 77, z / 19 + 77)) * .5, 0, 1));
    tmp.lerp(cCollar, collar * .7).lerp(cFair, fair);
    turf[i * 4] = fair;
    if(fi.hole) {
      const h = fi.hole, dx = h.basket[0] - h.tee[0], dz = h.basket[1] - h.tee[1], length = Math.hypot(dx, dz);
      const px = x - h.tee[0], pz = z - h.tee[1], along = (px * dx + pz * dz) / length, across = (-px * dz + pz * dx) / length;
      turf[i * 4 + 1] = across + 1.75;   // a stripe edge runs down the line
      // The walking trail: players leave the pad on the open side and walk the rough beside the fairway to the basket.
      // Stored as a signed offset from its meandering centre line (linear across the 2 m grid, so the fragment
      // shader draws a crisp 1 m trail) plus how worn it is along the hole: patchy, fading out before the basket.
      const side = h.idx % 2 ? -1 : 1;
      turf[i * 4 + 2] = across - side * lerp(1.3, width + 2.8 + Math.sin(along * .06 + h.idx * 2) * 1.2, smooth(0, 14, along));
      turf[i * 4 + 3] = smooth(-1, 2, along) * (1 - smooth(length - 14, length - 6, along)) * (.55 + .45 * smooth(.3, .6, noise(x / 9 + 60, z / 9 + 60)));
      // Broad exposed dry ground on the low shoulder describes the landing-area shape (visual only, not a hazard).
      const soil = ((along - length * .76) / (length * .14)) ** 2 + ((across + side * 8.8) / (4.8 + Math.sin(along * .19) * .8)) ** 2;
      const soilMask = (1 - smooth(.72, 1.08, soil)) * smooth(width + .35, width + 1.2, edge);
      // Dry patches follow dryNoise. Around the basket the putting circle is trodden to mulch and leaf litter: a lobed,
      // frayed teardrop drawn out toward the tee, where players stand to putt.
      const dry = dryNoise(x, z), bd = Math.hypot(x - h.basket[0], z - h.basket[1]);
      const bm = segDist(x, z, h.basket, [h.basket[0] - dx / length * 3, h.basket[1] - dz / length * 3]).d;
      splats[i * 4 + 3] = Math.max(smooth(.47 + fair * .07, .75, dry) * .85, soilMask * .9, (1 - smooth(4, 9, bd)) * .25);   // the unwatered rough dries out more than the fairway
      splats[i * 4 + 2] = (1 - smooth(1.8, 5.2, bm + (noise(x / 1.7 + 5, z / 1.7 + 5) - .5) * 2.8 + (noise(x / 4.5 + 31, z / 4.5 + 31) - .5) * 4.4)) * .95;
      // Tee: the gravel apron, a scuff at the sign post, and the driest patches within ~12 m worn through to earth.
      const tx = x - h.tee[0], tz = z - h.tee[1], cy = Math.cos(h.yaw), sy = Math.sin(h.yaw), u = tx * cy - tz * sy, v = tx * sy + tz * cy, wear = padWear(x, z);
      splats[i * 4] = Math.max(wear, soilMask * .45, (1 - smooth(.4, 1.3, Math.hypot(u - 2.4, v + 2.6))) * .7, smooth(.62, .8, dry) * .5 * (1 - smooth(5, 14, Math.hypot(tx, tz))));
      tmp.multiplyScalar(1 - smooth(.2, .9, wear) * .12);   // trodden turf at the apron's edge
    }
    for (const p of ponds) { const e = ((x - p.x) / p.rx) ** 2 + ((z - p.z) / p.rz) ** 2; if (e < 2.2) tmp.lerp(cSand, smooth(2.2, 1.1, e) * 0.7); splats[i * 4 + 1] = Math.max(splats[i * 4 + 1], smooth(2.2, 1.25, e)); }
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geo.computeVertexNormals();
  if (!texture('grass')) {   // no tile: bake a soft directional ramp so slopes still read
    const terrainNormals=geo.attributes.normal;
    for(let i=0;i<pos.count;i++) { const light=terrainNormals.getX(i)*.55+terrainNormals.getY(i)*.70+terrainNormals.getZ(i)*.45; const gain=.55+smooth(.28,.90,light)*.6; colors[i*3]*=gain;colors[i*3+1]*=gain;colors[i*3+2]*=gain; }
  }
  const pads = holes.flatMap(h => [0, 1.8].map(k => [h.tee[0] - Math.sin(h.yaw) * k, h.tee[1] - Math.cos(h.yaw) * k, Math.cos(h.yaw), Math.sin(h.yaw)]));   // 1.6 x 3.2 m rectangles the ground shades round and the carpet stays off: two cover each 5 m mat (props.js)
  // Lite drops the blade normal map: the turf photo already carries the grain, and the fetch buys back the splat cost.
  const terrain = new THREE.Mesh(geo, terrainSplat(toonMaterial({ vertexColors: true, normalMap: quality === 'low' ? null : grassNormal, normalScale: new THREE.Vector2(.5, .5), roughness: .95 }), geo, { splat: splats, turf, pads, lite: quality === 'low' }));
  terrain.receiveShadow = true; group.add(terrain);

  // Non-playable distant hills break the horizon into broad asymmetric layers. Their
  // inner edge is outside every in-bounds point; the playable height field is untouched.
  const hillPositions=[], hillColors=[], hillIndices=[], hillSegments=96;
  const hillPalette=['#74aa86','#81b39b','#a1cbcb'].map(c=>new THREE.Color(c));
  for(let ring=0;ring<3;ring++) for(let i=0;i<=hillSegments;i++) {
    const angle=i/hillSegments*Math.PI*2;
    const ridge=28+Math.sin(angle*3+.7)*15+Math.sin(angle*7-1.2)*6;
    const radius=[350,505+Math.sin(angle*4)*25,850][ring];
    const y=ring===0?-8:ring===1?ridge:10;
    hillPositions.push(Math.cos(angle)*radius,y,Math.sin(angle)*radius);
    const color=hillPalette[ring];hillColors.push(color.r,color.g,color.b);
  }
  for(let ring=0;ring<2;ring++) for(let i=0;i<hillSegments;i++) {
    const a=ring*(hillSegments+1)+i,b=a+hillSegments+1;hillIndices.push(a,a+1,b,b,a+1,b+1);
  }
  const hillGeometry=new THREE.BufferGeometry();hillGeometry.setAttribute('position',new THREE.Float32BufferAttribute(hillPositions,3));
  hillGeometry.setAttribute('color',new THREE.Float32BufferAttribute(hillColors,3));hillGeometry.setIndex(hillIndices);
  group.add(new THREE.Mesh(hillGeometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide})));   // takes the haze: a faint silhouette, not a green cut-out

  // --- trees ---
  const trees = [], bushes = [], tufts = [];
  const pineSpots = [], decSpots = [];
  // Species by stand, variant by tree: Scots pines gather in stands among the spruces, birches in groves among the broadleaves.
  // DIMS at scale 1, measured by tools/build-trees.py off the models it draws: trunk radius, trunk height the disc can hit,
  // crown centre, crown radius.
  const DIMS = TREE_DIMS;
  const kindOf = (x, z, pine) => pine ? (noise(x / 55 + 300, z / 55 + 300) > .62 ? 'scots' : 'spruce') : (noise(x / 45 + 200, z / 45 + 200) > .47 ? 'birch' : 'broad');
  const stand = (x, z) => {   // where a tree may stand: off the fairway, out of each tee's clearing, ponds and pads
    const fi = fairwayInfo(holes, x, z);
    const halfW = (7.5 + noise(x / 30, z / 30) * 5) * def.fairwayW;
    let skip = fi.d < halfW;
    const route=fi.hole, routeDx=route.basket[0]-route.tee[0], routeDz=route.basket[1]-route.tee[1];
    const side=((x-route.tee[0])*-routeDz+(z-route.tee[1])*routeDx)/Math.hypot(routeDx,routeDz);
    // Each tee opens on one side into a broad clearing. The other side retains a
    // guardian grove; trees and their collision records are generated together below.
    const openSide=route.idx%2?-1:1;
    const clearing=smooth(.78,.51,fi.t)*smooth(halfW+28,halfW+4,fi.d);
    if(side*openSide>0 && clearing>.22) skip=true;
    if(fi.t<.16 && fi.d<halfW+15) skip=true;
    for (const p of ponds) if (((x - p.x) / p.rx) ** 2 + ((z - p.z) / p.rz) ** 2 < 1.9) skip = true;
    for (const f of flats) if (Math.hypot(x - f.x, z - f.z) < 7) skip = true;
    return { fi, halfW, side, openSide, skip };
  };
  // per-instance tilt, height and girth (a stout or a slender tree: trunk and crown width together) so one variant never
  // tiles; hashed from position, so the rng stream (and the layout) stays put. The record scales with the drawn tree.
  const VARIANTS = {}; for (const v in IMPOSTOR) VARIANTS[v.replace(/\d+$/, '')] = (VARIANTS[v.replace(/\d+$/, '')] || 0) + 1;   // how many each species has
  const plant = (x, z, s, rot, kind, pine) => {
    const y = height(x, z), D = DIMS[kind], sy = .92 + noise(x * .53 + 17, z * .53 + 23) * .16, g = .84 + noise(x * .47 + 61, z * .47 + 19) * .36;
    (pine ? pineSpots : decSpots).push({ x, y, z, s, rot, kind, variant: kind + Math.min(VARIANTS[kind] - 1, Math.floor(noise(x * .37 + 13, z * .37 + 5) * VARIANTS[kind])), tx: (noise(x * .61 + 41, z * .61 + 7) - .5) * .12, tz: (noise(x * .61 + 3, z * .61 + 29) - .5) * .12, sy, g });
    const t = { x, y, z, r: D[0] * s * g, h: D[1] * s * sy, fy: D[2] * s * sy, fr: D[3] * s * (g + sy) / 2 }; trees.push(t); return t;
  };
  for (let gx = -W / 2 + 8; gx < W / 2 - 8; gx += 5) for (let gz = -H / 2 + 8; gz < H / 2 - 8; gz += 5) {
    const x = gx + (rng() - 0.5) * 4.5, z = gz + (rng() - 0.5) * 4.5;
    const { fi, halfW, side, openSide, skip } = stand(x, z);
    const edge = Math.min(W / 2 - Math.abs(x), H / 2 - Math.abs(z));
    const grove=.12+1.35*smooth(.32,.70,noise(x/21+3,z/21+11));
    const prob = edge < 25 ? 0.85 : (fi.d < halfW + 8 ? 0.14 : 0.62) * def.trees * grove;
    if (!skip && rng() < prob) {
      const s = 0.8 + rng() * 0.55, guardian=side*openSide<0 && fi.t>.18 && fi.t<.52 && fi.d<halfW+12, pine = !guardian && noise(x / 90 + 500, z / 90 + 500) > 1 - def.pine;
      const rot = rng() * Math.PI * 2; plant(x, z, s, rot, kindOf(x, z, pine), pine);
    } else if (!skip && fi.d > halfW - 1 && fi.d < halfW + 18 && rng() < 0.18) bushes.push({ x, y: height(x, z), z, s: 0.6 + rng() * 0.8, rot: rng() * 6.3 });
    if (!skip && fi.d < halfW + 10 && rng() < (fi.d < halfW ? 0.05 : 0.3)) for (let k = 0; k < 2; k++) { const tx = x + (rng() - 0.5) * 4, tz = z + (rng() - 0.5) * 4; tufts.push({ x: tx, y: height(tx, tz), z: tz, s: 0.7 + rng() * 0.7, rot: rng() * 6.3 }); }
  }
  // Putt lane: a trunk standing behind a basket reads as a pole growing out of the target, and no framing can parallax one out
  // (it takes ~1 m of camera travel, and the athlete fills that side of the frame). So no tree stands within 2.5 m of the
  // approach line in the 16 m past a basket, nor along the putt camera's sight line out to 35 m: that camera sits over the
  // thrower's left shoulder, so from the approach its line past the pin veers right ~.09 m per metre, widening with the pin's
  // silhouette. Culled after the loop, so the rng stream and every other tree stay put (~2 trees a hole).
  const inLane = t => holes.some(h => { const a = h.way[h.way.length - 2], L = Math.hypot(h.basket[0] - a[0], h.basket[1] - a[1]), ux = (h.basket[0] - a[0]) / L, uz = (h.basket[1] - a[1]) / L, px = t.x - h.basket[0], pz = t.z - h.basket[1], along = px * ux + pz * uz, right = pz * ux - px * uz; return along > 0 && (along < 16 && Math.abs(right) < 2.5 || along < 35 && Math.abs(right - .088 * along) < .8 + .05 * along); });
  for (const l of [trees, pineSpots, decSpots]) for (let i = l.length; i--;) if (inLane(l[i])) l.splice(i, 1);
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
  // Understorey: young trees (the stand's own species at 30-50% scale, 5-9 m) in the band just inside each tree line, from
  // their own rng so the main layout never moves. They fill the wall low down, between and in front of the mature trunks,
  // so a tree line reads as layered forest rather than a row of poles with sky between them; none within 16 m of a basket,
  // so the putting lane stays open. They are trees like any other: a record for the disc, both LODs.
  const urng = makeRng(seed * 131 + 17);
  for (let gx = -W / 2 + 12; gx < W / 2 - 12; gx += 6) for (let gz = -H / 2 + 12; gz < H / 2 - 12; gz += 6) {
    const x = gx + (urng() - .5) * 5, z = gz + (urng() - .5) * 5, pick = urng(), s = .3 + urng() * .2, rot = urng() * Math.PI * 2;
    const { fi, halfW, skip } = stand(x, z);
    if (skip || fi.d < halfW + 5 || fi.d > halfW + 38 || pick > .5 * def.trees * smooth(.25, .6, noise(x / 17 + 71, z / 17 + 29))) continue;
    if (holes.some(h => Math.hypot(x - h.basket[0], z - h.basket[1]) < 16) || treesNear(x, z).some(t => Math.hypot(t.x - x, t.z - z) < 2.8)) continue;
    const pine = noise(x / 90 + 500, z / 90 + 500) > 1 - def.pine, t = plant(x, z, s, rot, pine ? 'spruce' : kindOf(x, z, false), pine);
    const k = key(Math.floor(x / CELL), Math.floor(z / CELL)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t); lastK = null;
  }
  // Under crowns the turf goes thin, pale and darker (shade-starved grass: a dry weight) and litter collects (duff splat);
  // earth shows at the trunk base. Colour and splat weights only: no height change.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); let shade = 0, duff = 0, bare = 0;
    for (const t of treesNear(x, z)) { const d = Math.hypot(x - t.x, z - t.z); shade += smooth(t.fr * 1.7, t.fr * .3, d); duff += smooth(t.fr * 1.4, t.fr * .4, d); bare += smooth(t.r * 5 + .6, t.r * 1.5, d); }
    const k = 1 - Math.min(1, shade) * .2; colors[i * 3] *= k; colors[i * 3 + 1] *= k; colors[i * 3 + 2] *= k;
    splats[i * 4 + 2] = Math.max(splats[i * 4 + 2], Math.min(1, duff) * .9); splats[i * 4] = Math.max(splats[i * 4], Math.min(1, bare) * .7);
    splats[i * 4 + 3] = Math.max(splats[i * 4 + 3], Math.min(1, shade) * .4);
  }

  const bark = texture('bark', { repeat: [1, 3] });
  const trunkMat = bark ? toonMaterial({ map: bark, roughness: .95 }) : paintDetail(toonMaterial({ color: '#986541' }), 'bark');
  const leafMat = paintDetail(windMaterial(toonMaterial({ color: '#ffffff', vertexColors: true, roughness: .82 }), windClock), 'leaf');
  const pineMat = paintDetail(windMaterial(toonMaterial({ color: '#ffffff', vertexColors: true, roughness: .82 }), windClock), 'pine');
  const blob = (r, detail, amp) => {
    // Indexed round surfaces retain smooth vertex normals after the contour is shaped.
    const g=new THREE.SphereGeometry(r,detail===1?12:18,detail===1?7:12),p=g.attributes.position;
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),k=1+(noise(x*1.3+40,y*1.3+z*.7+40)-.5)*amp;
      p.setXYZ(i,x*k,y*k,z*k);
    }
    g.computeVertexNormals();return g;
  };
  const shift = (g, x, y, z) => g.translate(x, y, z);
  const pineTrunk = shift(new THREE.CylinderGeometry(0.16, 0.34, 6, 7), 0, 3, 0);
  // Blender crowns share the existing wind material, instance transforms and cells.
  const pineVariants = [0,1,2].map(variant => canopyGeometry('pine',variant));
  const shadeCrown = (g, lightness = 1) => {
    const n=g.attributes.normal, c=new Float32Array(n.count*3);
    for(let i=0;i<n.count;i++) {
      // Painted overlap shading follows each lobe, giving sheltered undersides volume.
      // No screen-space pass or extra material; merged crowns remain one instanced draw.
      const gain=(.64 + .36 * smooth(-.30,.75,n.getY(i))) * lightness;
      c[i*3]=gain; c[i*3+1]=gain; c[i*3+2]=gain;
    }
    g.setAttribute('color',new THREE.BufferAttribute(c,3));return g;
  };
  const decTrunk = mergeGeometries([shift(new THREE.CylinderGeometry(0.2, 0.4, 4.2, 7), 0, 2.1, 0), shift(new THREE.CylinderGeometry(0.08, 0.16, 2.6, 5).rotateZ(0.6), 0.9, 4.2, 0.2), shift(new THREE.CylinderGeometry(0.08, 0.16, 2.4, 5).rotateZ(-0.7).rotateY(1.2), -0.8, 4.1, -0.4)]);
  const decVariants = [0,1,2].map(variant => canopyGeometry('deciduous',variant));
  const bushGeo = shadeCrown(blob(1, 1, 0.6).scale(1, 0.75, 1).translate(0, 0.5, 0));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  // Tree LOD. Full draws the Blender trees within treeNear (62 m) of the eye and a camera-facing impostor beyond; Lite draws
  // impostors everywhere (treeNear 0). Both sides test the same eye, refreshed every quarter second by treeLod() from update(),
  // per tree in the vertex shader, so every tree is exactly one of the two. Each variant/material pair is one instanced mesh
  // that treeLod() refills from a 32 m grid with just the trees near the eye (plus a 4 m margin, so the shader decides), so
  // a frame submits one draw per pair and only near trees, and the tick's work scales with the trees near the eye.
  const treeEye = { value: new THREE.Vector3(1e9, 0, 1e9) }, treeNear = { value: quality === 'low' ? 0 : 62 }, nearSets = [];
  const treeDisc = { value: new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - def.sun[2]), THREE.MathUtils.degToRad(def.sun[3])) };   // the sun's visible disc (the sky section's discDir)
  let lodT = -1;
  const LOD_CELL = 32, lodKey = (i, j) => i * 100000 + j;
  const treeLod = (view, t) => { if (t - lodT < .25) return; lodT = t; treeEye.value.copy(view);
    const R = treeNear.value + 4, i0 = Math.floor((view.x - R) / LOD_CELL), i1 = Math.floor((view.x + R) / LOD_CELL), j0 = Math.floor((view.z - R) / LOD_CELL), j1 = Math.floor((view.z + R) / LOD_CELL);
    for (const { im, mats, cols, pos, byCell } of nearSets) {
      const dm = im.instanceMatrix, dc = im.instanceColor; let n = 0;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const k of byCell.get(lodKey(i, j)) || []) {
        if ((pos[k * 2] - view.x) ** 2 + (pos[k * 2 + 1] - view.z) ** 2 > R * R) continue;
        dm.array.set(mats.subarray(k * 16, k * 16 + 16), n * 16); if (dc) dc.array.set(cols.subarray(k * 3, k * 3 + 3), n * 3); n++;
      }
      im.count = n; dm.clearUpdateRanges(); dm.addUpdateRange(0, n * 16); dm.needsUpdate = true;
      if (dc) { dc.clearUpdateRanges(); dc.addUpdateRange(0, n * 3); dc.needsUpdate = true; }
    } };
  const near3d = mat => { const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey; mat.onBeforeCompile = s => { prev.call(mat, s); s.uniforms.treeEye = treeEye; s.uniforms.treeNear = treeNear;
    s.vertexShader = 'uniform vec3 treeEye;uniform float treeNear;\n' + s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      #ifdef USE_INSTANCING
      if (distance(instanceMatrix[3].xz, treeEye.xz) > treeNear) gl_Position = vec4(2., 2., 2., 1.);
      #endif`); }; mat.customProgramCacheKey = () => prevKey.call(mat) + '|near3d'; return mat; };
  // A lobed crown reads solid from the side, but the sun still gets through between its leaves: the shadow pass drops about
  // a third of the leaf clumps (a hash of each clump's baked tint, so the same ones every frame), and the ground under a
  // crown is dappled with sun flecks instead of lying in one dark pool.
  const sunGaps = mat => { const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey; mat.onBeforeCompile = s => { prev.call(mat, s);
    s.vertexShader = 'attribute vec4 color;varying float vGap;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGap = fract(sin(dot(color.rgb, vec3(12.9898, 78.233, 37.719)) * 43.758) * 437.585);');
    s.fragmentShader = 'varying float vGap;\n' + s.fragmentShader.replace('void main() {', 'void main() {\n\tif (vGap < .34) discard;'); };
    mat.customProgramCacheKey = () => prevKey.call(mat) + '|gaps'; return mat; };
  const inst = (geo, mat, spots, colorFn, shadow = true, lod = false) => {
    if (lod) {   // near-tree set: every tree's matrix and tint precomputed, drawn only once treeLod() picks it
      const n = spots.length, mats = new Float32Array(n * 16), cols = colorFn ? new Float32Array(n * 3) : null, pos = new Float32Array(n * 2), byCell = new Map();
      spots.forEach((s, i) => { e.set(s.tx || 0, s.rot, s.tz || 0); q.setFromEuler(e); v.set(s.x, s.y - .15, s.z); sc.set(s.s * (s.g || 1), s.s * (s.sy || 1), s.s * (s.g || 1)); m.compose(v, q, sc).toArray(mats, i * 16);
        if (colorFn) colorFn(s).toArray(cols, i * 3); pos[i * 2] = s.x; pos[i * 2 + 1] = s.z;
        const k = lodKey(Math.floor(s.x / LOD_CELL), Math.floor(s.z / LOD_CELL)); if (!byCell.has(k)) byCell.set(k, []); byCell.get(k).push(i); });
      const im = new THREE.InstancedMesh(geo, mat, n); im.count = 0; im.frustumCulled = false;   // it always surrounds the eye
      if (colorFn) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.alphaTest ? mat.map : null, alphaTest: mat.alphaTest || 0 });
      im.customDepthMaterial = near3d(windMaterial(depth, windClock)); depth.dispose();   // leaf cards cut their shadows out too
      if (mat.alphaTest) sunGaps(im.customDepthMaterial);
      im.castShadow = shadow; im.receiveShadow = true; group.add(im); nearSets.push({ im, mats, cols, pos, byCell });
      return;
    }
    const cells=new Map(), size=64;
    for(const s of spots){const key=Math.floor(s.x/size)+','+Math.floor(s.z/size);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(s);}
    for(const cell of cells.values()){
      const im=new THREE.InstancedMesh(geo,mat,cell.length);
      cell.forEach((s,i)=>{e.set(s.tx||0,s.rot,s.tz||0);q.setFromEuler(e);v.set(s.x,s.y-.15,s.z);sc.set(s.s*(s.g||1),s.s*(s.sy||1),s.s*(s.g||1));m.compose(v,q,sc);im.setMatrixAt(i,m);if(colorFn)im.setColorAt(i,colorFn(s));});
      if(quality!=='low'){const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:mat.alphaTest?mat.map:null,alphaTest:mat.alphaTest||0});im.customDepthMaterial=windMaterial(depth,windClock);depth.dispose();}   // leaf cards cut their shadows out too
      im.castShadow=shadow;im.receiveShadow=true;im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;
      im.computeBoundingSphere();im.computeBoundingBox();group.add(im);clusters.push(im);
    }
  };
  const col = new THREE.Color();
  // Full: the Blender trees (tools/build-trees.py over the tools/build-foliage.py atlas). A variant is a branch skeleton
  // ('bark' / 'bark_birch') plus leaf-spray cards ('leaves'), one near-tree set per variant and material (see treeLod) with a
  // per-tree tint. Wood and leaves share the wind, so the limbs carry their clumps as they sway, and both cast shadows.
  const full = quality !== 'low', leafAtlas = full && texture('leaves', { clamp: true, flipY: false }), leafNormals = full && texture('leaves_n', { clamp: true, flipY: false, srgb: false });   // Lite never fetches them
  // Canopy shading on top of three's PBR loop. Vertex colour rgb tints the albedo and its alpha is the build's sky visibility,
  // which dims ambient light fully and sunlight a little (the shadow map does the rest), so sunlit clumps stay bright while the
  // core of the crown and the limbs inside it fall dark. Leaves (leaf = true) also: the build bakes each leaf normal away from
  // its clump and the crown axis and the double-sided flip is dropped, so both faces of a card light as the crown surface
  // (every clump has a lit and a shaded side) and the atlas normal map tilts each leaf on top; a leaf turned from the sun
  // passes it through as a warm yellow-green, strongest looking into the sun (thin-leaf translucency), and directLight.color
  // still carries the shadow after three's directional loop, so leaves in shade do not glow; specular is damped to a third
  // (a matte blade against the low sun otherwise reads as grey sheen); alpha grows with the mip level (capped, so a card seen
  // edge-on does not fill in) so distant crowns keep their coverage. An impostor overwrites bakedAO, leafMask and rimGlow from
  // its maps and sets sunOcc, the self-shadow the shadow map gives the 3D crowns.
  const canopy = (mat, leaf = true) => { const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey; mat.onBeforeCompile = s => { prev.call(mat, s);
    s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', `float bakedAO = 1., leafMask = 1., rimGlow = 1., sunOcc = 1., anyFace = 0.;
      #if defined( USE_COLOR_ALPHA )
      diffuseColor.rgb *= vColor.rgb; bakedAO = vColor.a;
      #elif defined( USE_COLOR )
      diffuseColor.rgb *= vColor;
      #endif`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      reflectedLight.indirectDiffuse *= bakedAO; reflectedLight.directDiffuse *= mix(1., bakedAO, .3) * sunOcc;` + (leaf ? `
      reflectedLight.directSpecular *= .3 * bakedAO; reflectedLight.indirectSpecular *= .3 * bakedAO;
      reflectedLight.indirectDiffuse *= mix(vec3(1.), vec3(1.4, 1.5, 1.05), leafMask);   // a thin blade takes sky light on both faces, and inside a canopy that light comes filtered green through other leaves
      #if NUM_DIR_LIGHTS > 0
      { vec3 L = directionalLights[0].direction, sun = directionalLights[0].color, V = -normalize(vViewPosition);
        // forward scatter peaks toward the visible disc (low in the frame at the tee), not the high key light that casts the shadows;
        // within a few degrees of the disc thin foliage blazes (the tight lobe), so crowns against the sun ring it with light
        float disc = saturate(dot(V, normalize((viewMatrix * vec4(treeDisc, 0.)).xyz)));
        float into = max(pow(saturate(dot(V, L)), 2.), pow(disc, 4.)) + 4. * pow(disc, 60.);
        float thru = mix(saturate(.3 - dot(normal, L)), 1., anyFace) * (.2 + 1.5 * into) * leafMask * mix(.4, 1., bakedAO) * rimGlow;
        // light reaches a back-lit leaf through several leaves, not only through gaps: soften its shadow to 35% for this term
        float lit = mix(.35, 1., dot(directLight.color, vec3(1.)) / max(dot(sun, vec3(1.)), 1e-4));
        reflectedLight.directDiffuse += diffuseColor.rgb * sun * lit * RECIPROCAL_PI * thru * vec3(.8, .95, .36);
        // sunlight scattered leaf to leaf through the crown: a soft yellow-green fill that follows the sun, not the shadow map,
        // so the shaded side of a back-lit crown reads green instead of black
        reflectedLight.indirectDiffuse += diffuseColor.rgb * sun * RECIPROCAL_PI * .26 * mix(.4, 1., bakedAO) * leafMask * vec3(1., 1., .4); }
      #endif` : ''));
    // Haze on foliage: the scene's fog, eased to 80% on crowns within ~60 m (rising to all of it by 240 m, where the tree line
    // melts into the sky) and to about half where the view runs toward the sun's disc, so a crown in the glare keeps its dark
    // core and lit rim under the veil instead of going one flat cream.
    s.uniforms.treeDisc = treeDisc;
    s.fragmentShader = 'uniform vec3 treeDisc;\n' + s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace('#include <fog_fragment>', `vec3 treeClear = gl_FragColor.rgb;
      #include <fog_fragment>
      { float glare = pow(saturate(dot(normalize(-vViewPosition), normalize((viewMatrix * vec4(treeDisc, 0.)).xyz))), 16.);
        gl_FragColor.rgb = mix(treeClear, gl_FragColor.rgb, mix(.8, 1., smoothstep(60., 240., length(vViewPosition))) * (1. - .22 * glare)); }`);
    if (leaf) s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      .replace('#include <alphatest_fragment>', `{ vec2 g = fwidth(vMapUv) * 1024.; diffuseColor.a *= 1. + clamp(log2(sqrt(g.x * g.y)), 0., 2.) * .3; }
      #include <alphatest_fragment>`); };
    mat.customProgramCacheKey = () => prevKey.call(mat) + (leaf ? '|leaf' : '|wood'); return mat; };
  // alphaToCoverage: both tiers draw into multisampled targets (Full's 4x scene target, Lite's antialiased canvas), so the
  // alpha-tested edge resolves to sample coverage and leaf silhouettes come out soft instead of stair-stepped.
  const leafFull = leafAtlas && near3d(canopy(windMaterial(toonMaterial({ map: leafAtlas, normalMap: leafNormals, normalScale: new THREE.Vector2(.7, -.7), alphaTest: .5, alphaToCoverage: true, side: THREE.DoubleSide, vertexColors: true, roughness: .8 }), windClock)));
  const wood = map => map && near3d(canopy(windMaterial(toonMaterial({ map, vertexColors: true, roughness: .92 }), windClock), false));
  const woodMats = { bark: wood(bark), bark_birch: wood(full && texture('bark_birch')) };
  // Summer canopy in a low warm sun samples yellow-olive in the reference (hue 62-67 deg), so the tint leans warm, and the
  // atlas leaves (linear green ~.1) are lifted ~1.45x to sit with the turf the exposure is set for, as real leaves do;
  // conifers sit darker than the broadleaves (a deep green, not grey-blue); stands drift yellower or bluer, lighter or darker by
  // about 12%, and each tree differs from its neighbours by as much again, so no two crowns in a row read the same.
  const KIND_TINT = { spruce: [.56, .78, .62], scots: [.8, .88, .6] };
  const leafTint = s => { const h = noise(s.x / 19 + 3, s.z / 19) - .5 + (noise(s.x * .53 + 7, s.z * .53 + 3) - .5) * .8, k = KIND_TINT[s.kind] || [1, 1, 1];
    return col.setRGB((1.14 + h * .18) * k[0], 1.02 * k[1], (.74 - h * .22) * k[2]).multiplyScalar((1.3 + noise(s.z / 23, s.x / 23 + 7) * .35) * (.88 + noise(s.x * .61 + 11, s.z * .61 + 17) * .26)); };
  for (const b of bushes) b.variant = 'bush' + (noise(b.x * .37 + 13, b.z * .37 + 5) > .5 ? 1 : 0);
  const planted = (name, spots, shadow = true, lod = true) => {
    const src = quality !== 'low' && leafFull && model(name); if (!src) return false;
    src.scene.updateMatrixWorld(true);
    src.scene.traverse(o => { if (!o.isMesh) return;
      const variant = o.name.replace(/_\d+$/, ''), key = o.material.name.replace(/\.\d+$/, ''), mine = spots.filter(s => s.variant === variant);
      if (mine.length) inst(o.geometry.clone().applyMatrix4(o.matrixWorld), key === 'leaves' ? leafFull : woodMats[key] || trunkMat, mine, key === 'leaves' ? leafTint : null, shadow, lod); });
    return true;
  };
  // Impostors: tools/build-trees.py renders every variant side-on into a 256 x 512 cell (albedo, then the crown normals'
  // x and y, crown depth and a leaf mask) and writes the card extents to src/impostors.js. One instanced card per tree turns
  // about the vertical to face the camera (the sun, in the shadow pass), leans as its 3D instance leans, and lights through
  // the same canopy shading as the 3D leaves, so a far crown is dark into the sun with lit, glowing rims like the near ones.
  const impMap = texture('impostors'), impNormal = texture('impostors_n', { srgb: false });
  const billboard = s => { s.uniforms.treeEye = treeEye; s.uniforms.treeNear = treeNear;
    s.vertexShader = 'attribute float impCell;uniform vec3 treeEye;uniform float treeNear;varying vec3 vImpR;varying vec3 vImpT;varying float vImpFlip;\n' + s.vertexShader
      .replace('#include <begin_vertex>', `vec3 impO = instanceMatrix[3].xyz, impT = cameraPosition - impO; impT.y = 0.; impT = normalize(impT + vec3(1e-4, 0., 0.));
        vImpR = vec3(impT.z, 0., -impT.x); vImpT = impT; vImpFlip = sign(instanceMatrix[0].x);
        vec3 transformed = impO + vImpR * position.x * instanceMatrix[0].x + vec3(instanceMatrix[1].x, instanceMatrix[1].y, instanceMatrix[1].z) * position.y;   // the column's x and z lean the card as the 3D tree leans`)
      .replace('#include <project_vertex>', `vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.); gl_Position = projectionMatrix * mvPosition;
        if (distance(impO.xz, treeEye.xz) < treeNear) gl_Position = vec4(2., 2., 2., 1.);`)
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = modelMatrix * vec4(transformed, 1.);')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = vec2((mod(impCell, 4.) + uv.x) * .25, 1. - (floor(impCell / 4.) + 1. - uv.y) / ${IMPOSTOR_ROWS}.);`); };
  const impMat = impMap && impNormal && canopy(Object.assign(toonMaterial({ map: impMap, alphaTest: .5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: .85 }), { onBeforeCompile: s => { billboard(s); s.uniforms.impNormal = { value: impNormal };
    // An impostor receives no shadow. Its blue channel is crown depth (sky visibility times how thin the crown is along the view
    // ray): back-lit, sunlight reaches the camera-facing leaves only through thin foliage, so direct light falls with depth
    // squared and only the thin rim transmits, while a crown lit from behind the camera keeps its lit face.
    s.fragmentShader = 'uniform sampler2D impNormal;varying vec3 vImpR;varying vec3 vImpT;varying float vImpFlip;\n' + s.fragmentShader.replace('#include <normal_fragment_maps>', `{ vec4 n = texture2D(impNormal, vMapUv); vec2 t = n.xy * 2. - 1.; t.x *= vImpFlip; float tz = sqrt(saturate(1. - dot(t, t)));
      normal = normalize((viewMatrix * vec4(vImpR * t.x + vec3(0., t.y, 0.) + vImpT * tz, 0.)).xyz); bakedAO = n.z; leafMask = smoothstep(.3, .9, n.a); rimGlow = smoothstep(.34, .82, n.z); anyFace = 1.;   // the billboard's normals are a crown average: thinness, not facing, gates what it transmits
      #if NUM_DIR_LIGHTS > 0
      sunOcc = mix(1., n.z * n.z, smoothstep(-.2, .6, dot(-normalize(vViewPosition), directionalLights[0].direction)) * leafMask);
      #endif
      }`); }, customProgramCacheKey: () => 'chains-impostor' }));
  const impDepth = impMat && Object.assign(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: impMap, alphaTest: .5 }), { onBeforeCompile: billboard, customProgramCacheKey: () => 'chains-impostor-depth' });
  const impostors = (spots, shadow = true) => {
    if (!impMat || !spots.length) return false;
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).translate(0, .5, 0), impMat, spots.length), cells = new Float32Array(spots.length);
    spots.forEach((s, i) => { const [w, h, b, c] = IMPOSTOR[s.variant] || IMPOSTOR.bush0, sy = s.s * (s.sy || 1), flip = noise(s.x * .71 + 5, s.z * .71 + 9) > .5 ? -1 : 1;
      m.makeScale(w * s.s * (s.g || 1) * flip, h * sy, 1).setPosition(s.x, s.y - .15 + b * sy, s.z);
      m.elements[4] = -(s.tz || 0) * Math.cos(s.rot || 0) * h * sy; m.elements[6] = ((s.tx || 0) + (s.tz || 0) * Math.sin(s.rot || 0)) * h * sy;   // the 3D instance's tilt (tx, rot, tz) as the tip's offset
      im.setMatrixAt(i, m); im.setColorAt(i, leafTint(s)); cells[i] = c; });
    im.geometry.setAttribute('impCell', new THREE.InstancedBufferAttribute(cells, 1));
    // One card per tree over the whole course: one draw. It casts (turned to the sun) but does not receive: the camera-facing
    // card crosses its own sun-facing caster at the trunk, so it would shadow half of itself.
    im.frustumCulled = false; im.castShadow = shadow; im.receiveShadow = false; im.customDepthMaterial = impDepth; group.add(im);
    return true;
  };
  // Lite (or no GLBs): impostors only. With neither, the embedded crowns, scaled to the trees' height so what the disc hits shows.
  const grow = (spots, k) => spots.map(s => ({ ...s, s: s.s * k }));
  if (!planted('pine', pineSpots) & !impostors(pineSpots)) {
    inst(pineTrunk, trunkMat, grow(pineSpots, 1.6), null, false);
    for(let variant=0;variant<3;variant++) inst(pineVariants[variant], pineMat, grow(pineSpots.filter(s=>Math.floor(noise(s.x*.37+13,s.z*.37+5)*3)===variant), 1.6), s => col.setHSL(.32 + noise(s.x/24,s.z/24)*.045, .42 + noise(s.x/31+5,s.z/31)*.12, .25 + noise(s.x/22,s.z/22)*.16, THREE.SRGBColorSpace));
  }
  if (!planted('deciduous', decSpots) & !impostors(decSpots)) {
    inst(decTrunk, trunkMat, grow(decSpots, 1.6), null, false);
    for(let variant=0;variant<3;variant++) inst(decVariants[variant], leafMat, grow(decSpots.filter(s=>Math.floor(noise(s.x*.37+13,s.z*.37+5)*3)===variant), 1.6), s => col.setHSL(def.leafHue + (noise(s.x/22 + 9, s.z/22) - 0.5) * 0.07, 0.5, 0.30 + noise(s.z/24 + 4, s.x/24) * 0.18, THREE.SRGBColorSpace));
  }
  if (!planted('bush', bushes, false, false) && !(quality === 'low' && impostors(bushes, false))) inst(bushGeo, leafMat, bushes, s => col.setHSL(0.3 + (noise(s.x + 2, s.z + 2) - 0.5) * 0.08, 0.5, 0.25 + noise(s.z, s.x + 7) * 0.1, THREE.SRGBColorSpace), false);
  // Fine crossed-alpha grass is deliberately retired in both modes.

  // --- water ---
  // Opaque candy-blue water and broad white ripple marks avoid reflected-sky noise.
  const waterNormal = texture('water_normal', { repeat: [5, 5], srgb: false });
  const waterMat = waterNormal ? toonMaterial({ color: def.water, roughness: .12, metalness: .05, transparent: true, opacity: .9, normalMap: waterNormal, normalScale: new THREE.Vector2(.35, .35) }) : paintDetail(toonMaterial({ color: '#46cbe7' }), 'water');
  const rippleMat = new THREE.MeshBasicMaterial({ color: '#d9fbff', transparent: true, opacity: .65, depthWrite: false });
  for (const p of ponds) {
    const wm = new THREE.Mesh(new THREE.CircleGeometry(1, 56), waterMat);
    wm.rotation.x = -Math.PI / 2; wm.scale.set(p.rx * 1.25, p.rz * 1.25, 1); wm.position.set(p.x, p.level, p.z); group.add(wm);
    for (let i = 0; i < 3; i++) {
      const ripple = new THREE.Mesh(new THREE.RingGeometry(1.9 + i * .2, 1.96 + i * .2, 28, 1, .2, 1.8), rippleMat);
      ripple.rotation.x = -Math.PI / 2; ripple.scale.set(1.6, .6, 1);
      ripple.position.set(p.x - 3 + i * 3, p.level + .025, p.z - 3 + i * 2); group.add(ripple);
    }
  }

  // --- tee pads, signs, baskets ---
  // props.js merges every tee mat, sign, basket and the tournament dressing into four meshes for the whole course. The
  // mat's top face still sits under the athlete's soles (its 5 m reach is why `pads` holds two rectangles per tee);
  // baskets keep physics' heights. corridor = the tree loop's clearing half-width, so dressing stands just outside the
  // flight corridor on any course. The one prop in play, hole 1's event arch, hands its legs and beam to the flight
  // model as capsules.
  const dressing = dressCourse({ holes, height, trees, bushes, def, quality, corridor: (x, z) => (7.5 + noise(x / 30, z / 30) * 5) * def.fairwayW });
  group.add(...dressing.meshes);
  const baskets = holes.map(h => new THREE.Group().translateX(h.basket[0]).translateY(h.basketY).translateZ(h.basket[1]));   // positions only: the geometry is merged; the pin's distance tag is HUD (#pin, placed by main.js)

  // --- grass tufts ---
  // The blade carpet (grass.js) is the turf near the camera: tinted from the ground under each root, taller in the
  // rough, gone on gravel, litter, sand and the pads. A few photo tufts stand where mowers miss, at the sign post and
  // round the basket pole: small and green, darkened at the root; no shadow discs. Lite spends their triangles on the carpet.
  group.add(grassCarpet({ W, H, segX, segZ, pos, colors, splats, turf, pads, lite: quality === 'low', seed }));
  const tuftMap = quality !== 'low' && texture('tuft', { clamp: true });
  if (tuftMap) {
    const tuftRng = makeRng(seed + 733);
    const card = new THREE.PlaneGeometry(1, 1).translate(0, .46, 0);   // rooted 4 cm below grade
    const tuftGeo = mergeGeometries([0, Math.PI, Math.PI / 2, -Math.PI / 2].map(a => card.clone().rotateY(a)));   // both windings, so no DoubleSide normal flip
    const tn = tuftGeo.attributes.normal; for (let i = 0; i < tn.count; i++) tn.setXYZ(i, 0, 1, 0);   // lit like the turf they stand in
    const tuftMat = windMaterial(toonMaterial({ map: tuftMap, alphaTest: .45, roughness: .9 }), windClock, true);
    const spots = [];
    for (const h of holes) {
      const cy = Math.cos(h.yaw), sy = Math.sin(h.yaw), at = (u, w) => [h.tee[0] + u * cy + w * sy, h.tee[1] - u * sy + w * cy];
      for (let k = 0; k < 5; k++) { const a = tuftRng() * 6.3, r = .08 + tuftRng() * .2; spots.push({ p: at(2.4 + Math.cos(a) * r, -2.6 + Math.sin(a) * r), s: .14 + tuftRng() * .12 }); }
      for (let k = 0; k < 5; k++) { const a = tuftRng() * 6.3, r = .3 + tuftRng() * .3; spots.push({ p: [h.basket[0] + Math.cos(a) * r, h.basket[1] + Math.sin(a) * r], s: .12 + tuftRng() * .1 }); }
    }
    const fixed = new THREE.InstancedMesh(tuftGeo, tuftMat, spots.length);
    spots.forEach(({ p: [x, z], s }, i) => { e.set(0, tuftRng() * 6.3, 0); q.setFromEuler(e); v.set(x, height(x, z) - .04, z); sc.set(s, s * (.8 + tuftRng() * .4), s); m.compose(v, q, sc); fixed.setMatrixAt(i, m); fixed.setColorAt(i, col.setRGB(.8 + tuftRng() * .25, .72 + tuftRng() * .2, .7 + tuftRng() * .3)); });
    fixed.receiveShadow = true; group.add(fixed);
  }

  // --- sky, lights, fog ---
  // Two suns on purpose. The key light stands high (def.sun[0], 24-42°) so open turf takes most of its strength and
  // shadows stay short; the visible disc, its aureole, the haze's forward scatter and Full's light shafts hang low
  // (def.sun[2], ~11°) just inside the top of hole 1's tee frame (7° down, 45° lens), on the same side of the fairway
  // as the key, so the light reads from the disc and the shadows agree on where it comes from.
  const deg = THREE.MathUtils.degToRad, sunDir = new THREE.Vector3().setFromSphericalCoords(1, deg(90 - def.sun[0]), deg(def.sun[1]));
  const discDir = new THREE.Vector3().setFromSphericalCoords(1, deg(90 - def.sun[2]), deg(def.sun[3])), sunColor = new THREE.Color(def.sunColor);
  const haze = new THREE.Color(def.fog[0]).multiply(new THREE.Color(.86, .92, .96));   // a deeper blue than the course swatch: distance reads cool, not milky
  Object.assign(FOG.sun, { x: discDir.x, y: discDir.y, z: discDir.z }); Object.assign(FOG.haze, { r: haze.r, g: haze.g, b: haze.b });
  // The glare a shade warmer than the key (its light took the long way through the air), and ~half the key's strength:
  // any brighter and the tee's back third, which looks into the lobe, whites out to a flat cream wall.
  Object.assign(FOG.glow, { r: sunColor.r * .55, g: sunColor.g * .51, b: sunColor.b * .44 });
  scene.userData.sun = { dir: discDir, color: sunColor };   // effects.js aims the light shafts at the disc
  const sky = skyDome(def, quality === 'low'); scene.add(sky);
  // Image-based ambient on both tiers: the dome itself prefiltered, so the fill is this sky's blue from above and a
  // green-brown bounce from below (the dome's `ground` switch) and the sun's aureole glints in discs, chains and water.
  // The cube camera's far plane has to reach the 1100 m dome.
  const pmrem = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(); sky.material.uniforms.ground.value = 1; envScene.add(sky);
  const envRT = pmrem.fromScene(envScene, .04, 1, 2000); envScene.remove(sky); sky.material.uniforms.ground.value = 0; scene.add(sky); pmrem.dispose();
  scene.environment = envRT.texture; scene.environmentIntensity = .5; scene.background = null;
  // Aerial perspective: see the fog chunk above skyDome(). def.fog[1] is an exponential density per metre of eye distance.
  scene.fog = new THREE.FogExp2(haze, def.fog[1]);
  // One high warm key from the disc's side of hole 1: the tee shot is side-back-lit and the athlete and trunks keep a lit flank.
  const sun = new THREE.DirectionalLight(sunColor, def.sun[4]); sun.castShadow = true;
  const sm = quality === 'low' ? 1024 : 2048; sun.shadow.mapSize.set(sm, sm);
  // 120 m box following the focus in update(): wide enough that trees off-frame toward the sun still rake shadows across the frame.
  const extent = 60, sc2 = sun.shadow.camera; sc2.left = sc2.bottom = -extent; sc2.right = sc2.top = extent; sc2.near = 1; sc2.far = 400;
  sun.shadow.radius = quality === 'low' ? 2 : 4; sun.shadow.bias = -0.0004; sun.shadow.normalBias = .04;   // the Vogel taps reach `radius` texels (6 cm on Full, 12 on Lite): a ~25 cm leafy penumbra; the normal bias covers that slope
  scene.add(sun); scene.add(sun.target);
  // The shadow camera's own axes (Object3D.lookAt from the sun toward the focus, up +y): update() projects the focus on
  // them so the sun flecks (the shadow chunk above skyDome()) stay put on the ground while the camera follows the play.
  const fleckR = new THREE.Vector3(0, 1, 0).cross(sunDir).normalize(), fleckU = sunDir.clone().cross(fleckR);
  Object.assign(FLECK, { z: extent * 2, w: sc2.far - sc2.near });
  // The sky fill: the course's blue desaturated toward white. The dome's environment light already carries the blue, so a
  // saturated hemisphere on top turned brown mulch in shade neutral grey; this keeps shade warm with a slight cool cast.
  const hemi = new THREE.HemisphereLight(new THREE.Color(def.hemi[0]).lerp(new THREE.Color(1, 1, 1), .45), def.hemi[1], .5); scene.add(hemi);
  // Shade fill (the chunk above skyDome()): sunlight scattered back into the sun's shadow, ~30% of the key, a touch cool.
  Object.assign(SHADE, { r: .3 * .92, g: .3, b: .3 * 1.12 });

  // Contact occlusion, multiplied into whatever is under it: tight rings where a trunk or the basket meets the ground (the
  // shadow map cannot resolve that corner and the sky fill has no occlusion of its own), and the soft pool under each tee
  // mat. One merged ground-conforming mesh, one draw; distance fades it into the haze. rings: radii (x, z) and occlusion.
  const shadowParts = [];
  const groundShadow = (cx, cz, rx, rz, rings, occ, segments = 12) => {
    const positions=[], alpha=[], indices=[];
    for(let ring=0;ring<rings.length;ring++) for(let j=0;j<=segments;j++) {
      const a=j/segments*Math.PI*2, x=cx+Math.cos(a)*rx*rings[ring], z=cz+Math.sin(a)*rz*rings[ring];
      positions.push(x,height(x,z)+.04,z); alpha.push(occ[ring]);
    }
    for(let ring=0;ring<rings.length-1;ring++) for(let j=0;j<segments;j++) {
      const a=ring*(segments+1)+j,b=a+segments+1;indices.push(a,a+1,b,b,a+1,b+1);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('shadowAlpha',new THREE.Float32BufferAttribute(alpha,1));g.setIndex(indices);shadowParts.push(g);
  };
  // A trunk standing on the ground hides about half the sky at its foot, a quarter half a diameter out, none at 2.5 diameters.
  for(const t of trees) groundShadow(t.x,t.z,t.r,t.r,[1,2.2,6],[.55,.25,0],8);
  for(const h of holes) {
    groundShadow(h.tee[0]+.65,h.tee[1]+.4,1.5,2.3,[0,.48,.82,1.2],[.16,.12,.05,0],20);
    groundShadow(h.basket[0],h.basket[1],1,1,[0,.2,.27,.42,.75],[.35,.4,.62,.25,0],16);   // the tray's .34 m dish hides the sky from the footing; a dark crease where the footing meets the ground
  }
  if (shadowParts.length) {
    const shadowMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true,
      vertexShader: 'attribute float shadowAlpha;varying float vAlpha;varying float vDepth;void main(){vAlpha=shadowAlpha;vec4 mv=modelViewMatrix*vec4(position,1.);vDepth=-mv.z;gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'varying float vAlpha;varying float vDepth;void main(){gl_FragColor=linearToOutputTexel(vec4(vec3(1.-vAlpha*(1.-smoothstep(38.,170.,vDepth))),1.));}' });   // encoded, so Lite's sRGB canvas darkens by the same linear factor as Full's HDR target
    const shadows = new THREE.Mesh(mergeGeometries(shadowParts), shadowMat); shadows.renderOrder = 1; group.add(shadows);
    shadowParts.forEach(g => g.dispose());
  }
  // 0 on the fairway, 1 in the rough: the flight model uses it for skip, roll and slide friction.
  const rough = (x, z) => { const fi = fairwayInfo(holes, x, z); return clamp((fi.d - 7 * def.fairwayW) / 5, 0, 1); };
  const world = { height, normal, treesNear, inWater, waterLevel, inBounds, wind: [0, 0], basket: null, ponds, holes, rough, capsules: dressing.capsules };
  const setHole = i => { const h = holes[i]; world.basket = { x: h.basket[0], y: h.basketY, z: h.basket[1] }; };
  const update = (dt, t, focus, view) => {
    if(view && t-lastCull>.25){lastCull=t;for(const c of clusters){const p=c.boundingSphere.center;const r=c.boundingSphere.radius+155;c.visible=(p.x-view.x)**2+(p.z-view.z)**2<r*r;}}
    if (view) treeLod(view, t);   // trees: 3D near the eye, impostors beyond (the trees section)
    windClock.value=t; sky.material.uniforms.time.value = t;
    if (waterNormal) { waterNormal.offset.x = t * .02; waterNormal.offset.y = t * .013; }
    if (focus) { sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(sunDir, 180); FLECK.x = focus.dot(fleckR); FLECK.y = focus.dot(fleckU); }
  };
  const dispose = () => {   // tear down so another course can be built into the same scene
    for(const w of waters)w.userData.dispose?.();
    scene.remove(group, sky, sun, sun.target, hemi); scene.fog = null; scene.environment = null; scene.background = null; hdri?.target.dispose(); hdri?.texture.dispose(); envRT?.dispose();
    group.traverse(o => { o.customDepthMaterial?.dispose(); if (!o.geometry?.__shared) o.geometry?.dispose(); for (const m of [].concat(o.material || [])) { if (m.__shared) continue; for (const k of ['map', 'normalMap', 'roughnessMap']) if (m[k] && !m[k].__shared) m[k].dispose(); m.dispose(); } });
    sky.geometry.dispose(); sky.material.dispose(); sun.shadow.map?.dispose();
  };
  return { def, quality, world, holes, group, sky, terrain, update, setHole, sunDir, baskets, dispose };
}

// Aerial perspective for every fogged material on both tiers: exponential in the true eye distance past 12 m (not
// FogExp2's squared view depth, which whited out 150 m), toward a pale blue haze plus a warm forward-scatter lobe
// round the sun's disc, so the tree line glows where the sun hangs and stays a clean blue behind the golfer. The
// haze is our own linear uniform (three hands fogColor to direct-to-screen Lite draws already sRGB-encoded) and the
// mixed colour is tone mapped and encoded here whenever the material itself is, because fog lands after that step.
// FOG is shared by reference into every ShaderLib material (cloneUniforms copies plain objects by reference), so each
// course just rewrites it; the sky dome reads the same three values, so its horizon is exactly the fog along that ray.
const FOG = { sun: { x: 0, y: .2, z: 1 }, haze: { r: 0, g: 0, b: 0 }, glow: { r: 0, g: 0, b: 0 } };
for (const u of [THREE.UniformsLib.fog, ...Object.values(THREE.ShaderLib).map(s => s.uniforms)]) if (u?.fogColor) Object.assign(u, { fogSun: { value: FOG.sun }, fogHaze: { value: FOG.haze }, fogGlow: { value: FOG.glow } });
// Shade fill. Ground the sun's shadow covers is still lit by sunlight the leaves and the air scatter back into it, from
// roughly the sun's side; without that, dark mulch in shade sat ~2 stops under the sunlit ground in the scene and the
// tone curve's toe sank it 4+ stops to near-black blobs. Where (and only where) the shadow map took the sun away, SHADE
// of the key comes back as indirect light shaped by N·L, so shade keeps the sun's warmth, its texture and its forms and
// sunlit surfaces do not change. It lands in `irradiance`, so a canopy's baked occlusion (applied to indirect light after
// lights_fragment_end) still darkens crown cores. The same sun visibility dims reflected sky: whatever shades a surface
// from the sun, a canopy or the basket's tray, hides most of the sky from it too, so shaded steel stops mirroring blue.
const SHADE = { r: 0, g: 0, b: 0 }, FLECK = { x: 0, y: 0, z: 120, w: 399 };   // FLECK: the shadow camera's centre in the light's plane (m), its width (m), its depth range (m)
for (const s of Object.values(THREE.ShaderLib)) if (s.uniforms?.directionalLights) Object.assign(s.uniforms, { shadeFill: { value: SHADE }, sunFleck: { value: FLECK } });
Object.assign(THREE.ShaderChunk, {
  lights_pars_begin: 'uniform vec3 shadeFill;\n' + THREE.ShaderChunk.lights_pars_begin,
  lights_fragment_begin: THREE.ShaderChunk.lights_fragment_begin + `
float sunVis = 1.;
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	sunVis = dot( directLight.color, vec3( 1. ) ) / max( dot( directionalLights[ 0 ].color, vec3( 1. ) ), 1e-4 );   // the loop leaves the sun, shadow applied, in directLight
	#if defined( RE_IndirectDiffuse ) && !( defined( USE_ALPHATEST ) && defined( DOUBLE_SIDED ) )   // not leaf cards: the canopy shader scatters sun leaf to leaf itself, and crown cores stay dark
		irradiance += shadeFill * directionalLights[ 0 ].color * ( 1. - sunVis ) * saturate( dot( geometryNormal, directionalLights[ 0 ].direction ) );
	#endif
#endif`,
  lights_fragment_end: THREE.ShaderChunk.lights_fragment_end + `
#if defined( RE_IndirectSpecular )
	reflectedLight.indirectSpecular *= mix( .45, 1., sunVis );
#endif`,
  fog_pars_vertex: '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogRay;\n#endif',
  fog_vertex: '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogRay = ( vec4( mvPosition.xyz, 0. ) * viewMatrix ).xyz;\n#endif',   // eye-to-vertex in world axes
  fog_pars_fragment: '#ifdef USE_FOG\n\tuniform vec3 fogColor, fogSun, fogHaze, fogGlow;\n\tvarying float vFogDepth;\n\tvarying vec3 vFogRay;\n\t#ifdef FOG_EXP2\n\t\tuniform float fogDensity;\n\t#else\n\t\tuniform float fogNear;\n\t\tuniform float fogFar;\n\t#endif\n#endif',
  fog_fragment: `#ifdef USE_FOG
	float fogDist = max( length( vFogRay ), 1e-3 ), fogCos = max( dot( vFogRay, fogSun ) / fogDist, 0. ), fogCos2 = fogCos * fogCos;
	#ifdef FOG_EXP2
		float fogFactor = 1. - exp( - fogDensity * max( fogDist - 12., 0. ) * smoothstep( 12., 60., fogDist ) );   // eased in over 12-60 m: a crown overhead keeps its dark core, distance still goes milky
	#else
		float fogFactor = smoothstep( fogNear, fogFar, fogDist );
	#endif
	vec3 fogTint = ( fogHaze.g > 0. ? fogHaze : fogColor ) + fogGlow * ( fogCos2 * fogCos2 * fogCos2 * .2 + pow( fogCos, 24. ) * 2.5 );   // aerosols scatter mostly forward: a broad warm cast, then a hard glare cone round the disc
	#ifdef TONE_MAPPING
		fogTint = toneMapping( fogTint );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, linearToOutputTexel( vec4( fogTint, 1. ) ).rgb, fogFactor );
#endif`,
  // Sun shadows: the stock PCF kernel spaced at `radius` texels leaves blocky rings under leafy canopies. 16 taps on a
  // Vogel disk turned per pixel (white noise: IGN's diagonals show without TAA) give the same cost a smooth penumbra, grain instead of steps.
  // Sun flecks: a crown's shadow map is a solid silhouette, but a real canopy lets the sun through its gaps in soft spots.
  // The taps already read the occluders' depths, so their mean height above the receiver along the ray comes free; where
  // it is crown height (6-10 m and up, so a trunk's stripe near its foot stays whole) two octaves of value noise in the
  // light's plane open ~0.2-0.5 m spots, clustered by a 4 m octave. sunFleck anchors that plane to the world (the shadow
  // camera follows the focus), so a fleck lights everything under its gap, leaf, ground or athlete, and never swims.
  shadowmap_pars_fragment: `uniform vec4 sunFleck;
float fleckHash( vec2 p ) { vec3 q = fract( p.xyx * .1031 ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.x + q.y ) * q.z ); }
float fleckNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3. - 2. * f ); return mix( mix( fleckHash( i ), fleckHash( i + vec2( 1., 0. ) ), f.x ), mix( fleckHash( i + vec2( 0., 1. ) ), fleckHash( i + 1. ), f.x ), f.y ); }
` + THREE.ShaderChunk.shadowmap_pars_fragment.replace(/#if defined\( SHADOWMAP_TYPE_PCF \)\n[\s\S]*?(?=#elif defined\( SHADOWMAP_TYPE_PCF_SOFT \))/, `#if defined( SHADOWMAP_TYPE_PCF )
			const vec2 vogel[ 16 ] = vec2[ 16 ]( ${Array.from({ length: 16 }, (_, i) => { const r = Math.sqrt((i + .5) / 16), a = i * 2.39996323; return `vec2( ${(r * Math.cos(a)).toFixed(4)}, ${(r * Math.sin(a)).toFixed(4)} )`; }).join(', ')} );
			float spin = 6.2831853 * fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
			vec2 turn = vec2( cos( spin ), sin( spin ) ) * shadowRadius / shadowMapSize.x;
			float gap = 0.;
			shadow = 0.;
			for ( int i = 0; i < 16; i ++ ) {
				float d = unpackRGBAToDepth( texture2D( shadowMap, shadowCoord.xy + vec2( vogel[ i ].x * turn.x - vogel[ i ].y * turn.y, vogel[ i ].x * turn.y + vogel[ i ].y * turn.x ) ) ), lit = step( shadowCoord.z, d );
				shadow += lit; gap += ( 1. - lit ) * ( shadowCoord.z - d );
			}
			shadow *= .0625;
			if ( shadow < 1. ) {
				vec2 p = ( shadowCoord.xy - .5 ) * sunFleck.z + sunFleck.xy;
				float n = fleckNoise( p * 1.3 ) * .65 + fleckNoise( p * 3.7 + 17. ) * .35;
				shadow = max( shadow, smoothstep( .62, .72, n ) * smoothstep( .3, .7, fleckNoise( p * .2 + 41. ) ) * smoothstep( 4., 8., gap / ( 16. - 16. * shadow ) * sunFleck.w ) );
			}
		`),
});

// Sky dome for both tiers, in the scene's linear HDR. Near the horizon it is the fog's colour along the ray (haze plus
// the scatter lobe), so hazed tree lines and hills melt into it; above ~7° a pale-to-deep blue gradient with the sun's
// aureole thinning upward. Cumulus: value noise on a planar projection, bright sun-facing tops over blue-grey bellies,
// thin edges silvered near the sun. Lite runs two noise octaves, Full four. The 20x disc is tone mapped here on Lite;
// on Full the OutputPass does that after the bloom and light shafts have spread it. `ground` swaps the lower
// hemisphere for a green bounce only while the dome is prefiltered into the environment map.
function skyDome(def, lite) {
  const [coverage, scale, zenith, blue] = def.sky;
  return new THREE.Mesh(new THREE.SphereGeometry(1100, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, defines: { OCT: lite ? 2 : 4 },
    uniforms: { haze: { value: FOG.haze }, glow: { value: FOG.glow }, sunDir: { value: FOG.sun }, blue: { value: new THREE.Color(blue) }, zenith: { value: new THREE.Color(zenith) }, sunColor: { value: new THREE.Color(def.sunColor) },
      bounce: { value: new THREE.Color(def.hemi[1]) }, cloud: { value: new THREE.Vector2(coverage, scale) }, time: { value: 0 }, ground: { value: 0 } },
    vertexShader: 'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform vec3 haze,glow,sunDir,blue,zenith,sunColor,bounce;uniform vec2 cloud;uniform float time,ground;varying vec3 vDir;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<OCT;i++){s+=a*noise(p);p=p*2.07+vec2(19.,7.);a*=.5;}return s;}
      void main(){
        vec3 d=normalize(vDir);float h=max(d.y,0.),s=max(dot(d,sunDir),0.),s2=s*s;
        vec3 scatter=glow*(s2*s2*s2*.2+pow(s,24.)*2.5);                                      // the fog chunk's lobe
        vec3 col=mix(haze,mix(blue,zenith,smoothstep(.03,.45,h)),smoothstep(0.,.12,h))+scatter*mix(1.,.4,smoothstep(0.,.35,h));
        col+=sunColor*(pow(s,8.)*.2+pow(s,90.)*.8)*smoothstep(-.02,.04,d.y);                  // aureole: open sky round the disc outshines the hazed ground, so the treeline rims
        vec2 p=d.xz/(h+.2)*cloud.y+vec2(time*.004,time*.0015);                               // planar projection: clouds flatten toward the horizon
        float n=fbm(p),cov=smoothstep(cloud.x,cloud.x+.1,n)*smoothstep(.02,.14,h);           // a short ramp keeps cumulus edges crisp
        float core=smoothstep(cloud.x,cloud.x+.32,n);                                        // thick belly vs thin rim
        float lit=clamp((n-fbm(p+normalize(sunDir.xz+vec2(1e-4))*.16))*6.+.55,0.,1.);        // density falling toward the sun = the lit face
        vec3 cc=mix(mix(zenith,vec3(.52,.56,.63),.65),mix(vec3(1.),sunColor,.3)*1.5,clamp(lit*(1.-core*.45)+(1.-core)*.3,0.,1.));
        cc+=sunColor*pow(s,10.)*(1.-core)*2.5;                                              // silver lining in the aureole
        col=mix(col,mix(cc,col,smoothstep(.14,.02,h)*.6),cov);                               // far cumulus melts into the haze
        col+=sunColor*smoothstep(.9994,.9998,s)*20.*(1.-cov*.85);                            // the disc
        col=mix(col,bounce*1.4,ground*smoothstep(0.,-.1,d.y));
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
}
