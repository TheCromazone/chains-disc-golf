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
    sun: [24, 38, 12, 10, 5.6], sky: [.52, 1.2, '#3a7cd4', '#8fbdea'], sunColor: '#ffe4cc', fog: ['#bdd3e8', .0045], hemi: ['#a5c6ee', '#e8d0a0'], water: '#2d6f95' },
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
      // frayed teardrop drawn out toward the tee, where players stand to putt. w7: a narrower one, out to the 6.5 m lie, so the
      // lawn round the pin (trees section) reaches the basket's sides as in the reference, trodden only along the putting line.
      const dry = dryNoise(x, z), bd = Math.hypot(x - h.basket[0], z - h.basket[1]);
      const bm = segDist(x, z, h.basket, [h.basket[0] - dx / length * 6.5, h.basket[1] - dz / length * 6.5]).d * 1.45;
      splats[i * 4 + 3] = Math.max(smooth(.4 + fair * .12, .72, dry) * .85, soilMask * .9, (1 - smooth(4, 9, bd)) * .25);   // the unwatered rough dries out more than the fairway
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
  const pads = holes.flatMap(h => [[-.65, -.45], [.65, -.45], [-.65, 2.45], [.65, 2.45]].map(([u, k]) => [h.tee[0] + Math.cos(h.yaw) * u - Math.sin(h.yaw) * k, h.tee[1] - Math.sin(h.yaw) * u - Math.cos(h.yaw) * k, Math.cos(h.yaw), Math.sin(h.yaw)]));   // 1.6 x 3.2 m rectangles the ground shades round and the carpet stays off: four tile each tee's gravel bed round its 5 m mat (props.js BED), 15 cm short of its edging so the turf's blades spill over it
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
  const trees = [], bushes = [], tufts = [], FRAME_TREE = [20, 10, .75];   // framing tree: metres ahead of the tee, metres to its open side, scale
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
  // wide: a quiet (shadowless) stand tree varies twice as much, no taller or stouter than the most (w6: the pines behind the
  // arch read as cloned straight poles of one girth); shadow casters keep the narrow range, so the light on the floor stays put
  const plant = (x, z, s, rot, kind, pine, wide = 0) => {
    const y = height(x, z), D = DIMS[kind], sy = 1.08 - (1 - noise(x * .53 + 17, z * .53 + 23)) * (wide ? .3 : .16), g = 1.2 - (1 - noise(x * .47 + 61, z * .47 + 19)) * (wide ? .55 : .36), lean = wide ? .22 : .12;
    (pine ? pineSpots : decSpots).push({ x, y, z, s, rot, kind, variant: kind + Math.min(VARIANTS[kind] - 1, Math.floor(noise(x * .37 + 13, z * .37 + 5) * VARIANTS[kind])), tx: (noise(x * .61 + 41, z * .61 + 7) - .5) * lean, tz: (noise(x * .61 + 3, z * .61 + 29) - .5) * lean, sy, g });
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
  // Framing tree: a broadleaf just off the open side of each tee, ahead of the pad, so the aim shot has one near crown over the
  // clearing (the stands there are 50-100 m out, where the haze leaves them one flat veil) the way a real tee has a tree
  // overhead. Hashed, no rng; a record and grid entry like any tree.
  for (const h of holes) { const w = h.way[1] || h.basket, dx = w[0] - h.tee[0], dz = w[1] - h.tee[1], L = Math.hypot(dx, dz), os = h.idx % 2 ? -1 : 1;
    const x = h.tee[0] + dx / L * FRAME_TREE[0] - dz / L * os * FRAME_TREE[1], z = h.tee[1] + dz / L * FRAME_TREE[0] + dx / L * os * FRAME_TREE[1];
    const { fi, halfW } = stand(x, z);   // not in another hole's fairway, a pond, a pad or another crown
    if (fi.hole !== h && fi.d < halfW || treesNear(x, z).some(t => Math.hypot(t.x - x, t.z - z) < 4) || ponds.some(p => ((x - p.x) / p.rx) ** 2 + ((z - p.z) / p.rz) ** 2 < 1.9) || flats.some(f => Math.hypot(x - f.x, z - f.z) < 7)) continue;
    const t = plant(x, z, FRAME_TREE[2], noise(x, z) * 6.28, 'broad', false), k = key(Math.floor(x / CELL), Math.floor(z / CELL)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t); lastK = null; }
  // Edge stand: the tree line's front rank. The main stands keep 7.5-12.5 m off the line, so from the tee the far half of a
  // hole was a bare slope under one hazy row 100 m out. This pass fills the gap between the mown edge and that line, on the
  // guardian side from 40% of the way out and beyond the open side's walking trail from halfway: young trees and mature ones
  // (a birch or spruce nearest the fairway, taller broadleaves and pines behind, whose crowns clear the arch's beam from the
  // tee), so the view down a hole ends in a layered wood with trunks 40-80 m out. Own rng: the main layout, understorey and
  // framing trees stay put. None within 12 m of a basket, past it or in its putt lane (the green stays open), within 40 m of
  // a tee (the arch) or over 10.5 m out on the guardian side (the village). Flagged edge: the dressing is laid out without
  // them, so the props stay exactly where they were. Records and grid like any tree.
  const erng = makeRng(seed * 197 + 29);
  for (let gx = -W / 2 + 12; gx < W / 2 - 12; gx += 3) for (let gz = -H / 2 + 12; gz < H / 2 - 12; gz += 3) {
    const x = gx + (erng() - .5) * 2.6, z = gz + (erng() - .5) * 2.6, pick = erng(), young = erng() < .35, s = young ? .34 + erng() * .2 : .62 + erng() * .4 + .28 * erng(), rot = erng() * Math.PI * 2;
    const { fi, halfW, side, openSide } = stand(x, z), guard = side * openSide < 0, inner = (guard ? 4 : 9) * def.fairwayW;   // the open side's walking trail runs 5-8 m out
    if (!fi.hole || fi.d < inner || fi.d > (guard ? Math.min(halfW + 4, 10.5 * def.fairwayW) : halfW + 6) || fi.t < (guard ? .38 : .5) || fi.t > .995 || pick > .8 * Math.min(1, def.trees * 1.4)) continue;
    if (holes.some(h => Math.hypot(x - h.basket[0], z - h.basket[1]) < 12 || Math.hypot(x - h.tee[0], z - h.tee[1]) < 40) || ponds.some(p => ((x - p.x) / p.rx) ** 2 + ((z - p.z) / p.rz) ** 2 < 1.9) || inLane({ x, z })) continue;
    if (treesNear(x, z).some(t => Math.hypot(t.x - x, t.z - z) < (young ? 2.2 : 3))) continue;
    const front = fi.d < inner + 2.5, pine = front ? noise(x / 13 + 9, z / 13 + 4) > .55 : noise(x / 90 + 500, z / 90 + 500) > 1 - def.pine;
    const t = Object.assign(plant(x, z, (young || front ? s : s + .22) * (young && !guard && fi.t > .6 ? 2 : 1), rot, pine ? (front ? 'spruce' : kindOf(x, z, true)) : front ? 'broad' : kindOf(x, z, false), pine, young || !guard), { edge: 1 }); if (young || !guard) (pine ? pineSpots : decSpots).at(-1).quiet = 1;
    const k = key(Math.floor(x / CELL), Math.floor(z / CELL)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t); lastK = null;
  }
  // Clearing stand (w2 verdict: past the arch the tee looked onto a bare, evenly lit grass hill with a few crowns on its
  // crest): the open side's clearing, from past the edge stand out to where the main stands begin, gets an open wood of
  // broadleaves with a pine or a birch among them, in groves, so the slope right of the arch reads as trees and trunks at
  // 25-60 m, rows behind rows. Own rng, flagged edge (the dressing and the main layout stay put) and quiet (no shadow
  // pass: the slope's light stays as it was). None within 28 m of a tee or 16 m of a basket.
  const crng = makeRng(seed * 211 + 43);
  for (let gx = -W / 2 + 12; gx < W / 2 - 12; gx += 4) for (let gz = -H / 2 + 12; gz < H / 2 - 12; gz += 4) {
    const x = gx + (crng() - .5) * 3.6, z = gz + (crng() - .5) * 3.6, pick = crng(), s = .72 + crng() * .5, rot = crng() * Math.PI * 2;
    const { fi, halfW, side, openSide } = stand(x, z);
    if (!fi.hole || side * openSide < 0 || fi.d < (fi.t < .5 ? 9.5 : halfW + 7) * def.fairwayW || fi.d > halfW + 30 || fi.t < .12 || fi.t > .85 || pick > .75 * Math.min(1, def.trees * 1.4) * (.45 + .55 * smooth(.25, .6, noise(x / 19 + 41, z / 19 + 87)))) continue;
    if (holes.some(h => Math.hypot(x - h.basket[0], z - h.basket[1]) < 16 || Math.hypot(x - h.tee[0], z - h.tee[1]) < 26) || ponds.some(p => ((x - p.x) / p.rx) ** 2 + ((z - p.z) / p.rz) ** 2 < 1.9) || flats.some(f => Math.hypot(x - f.x, z - f.z) < 7) || inLane({ x, z })) continue;
    if (treesNear(x, z).some(t => Math.hypot(t.x - x, t.z - z) < 3.6)) continue;
    const pine = noise(x / 23 + 7, z / 23 + 61) > .66, kind = pine ? kindOf(x, z, true) : noise(x / 11 + 5, z / 11 + 3) > .72 ? 'birch' : 'broad';
    const t = Object.assign(plant(x, z, s, rot, kind, pine, 1), { edge: 1 }); (pine ? pineSpots : decSpots).at(-1).quiet = 1;
    const k = key(Math.floor(x / CELL), Math.floor(z / CELL)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t); lastK = null;
  }
  // Under crowns the turf goes thin, pale and darker (shade-starved grass: a dry weight) and litter collects (duff splat);
  // earth shows at the trunk base. Colour and splat weights only: no height change.
  // w7 putt: round each pin the ground is a mown green, not forest floor. The reference's midground past the basket is a
  // sunlit lawn crossed by long trunk shadows (w7-1 verdicts: our duff-brown floor "reads flat overcast, nothing lit by a
  // sun"): within ~24 m of a basket (frayed out to ~34) the crowns' duff, shade-dry and tint give way to the fairway's
  // turf; the trodden approach and the worn ring at the pole (terrain section) stay, and trunk feet keep their bare earth.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); let shade = 0, duff = 0, bare = 0, lawn = 0;
    for (const h of holes) { const bx = x - h.basket[0], bz = z - h.basket[1], bd = Math.hypot(bx, bz), L = Math.hypot(h.basket[0] - h.tee[0], h.basket[1] - h.tee[1]), past = (bx * (h.basket[0] - h.tee[0]) + bz * (h.basket[1] - h.tee[1])) / L;
      if (bd < 70) lawn = Math.max(lawn, 1 - smooth(22, 34, bd - Math.min(Math.max(past, 0), 50) * .55 + (noise(x / 6 + 13, z / 6 + 41) - .5) * 8)); }   // drawn out past the pin, so the putt looks down a green to the far tree line
    for (const t of treesNear(x, z)) { const d = Math.hypot(x - t.x, z - t.z); shade += smooth(t.fr * 1.7, t.fr * .3, d); duff += smooth(t.fr * 1.4, t.fr * .4, d); bare += smooth(t.r * 5 + .6, t.r * 1.5, d); }
    const k = 1 - Math.min(1, shade) * .2 * (1 - lawn); colors[i * 3] *= k; colors[i * 3 + 1] *= k; colors[i * 3 + 2] *= k;
    if (lawn > 0) { tmp.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]).lerp(cFair, lawn * .85); colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
      turf[i * 4] = Math.max(turf[i * 4], lawn * .9); splats[i * 4 + 3] *= 1 - lawn * .85; }
    splats[i * 4 + 2] = Math.max(splats[i * 4 + 2], Math.min(1, duff) * .9 * (1 - lawn)); splats[i * 4] = Math.max(splats[i * 4], Math.min(1, bare) * .7);
    splats[i * 4 + 3] = Math.max(splats[i * 4 + 3], Math.min(1, shade) * .4 * (1 - lawn));
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
  const treeAir = { value: 0 };   // 1 round the pin, 0 elsewhere (update(): PUTT_AIR's putt factor): how much of the glare exemptions below the putt's air takes back. The putt looks within ~20° of the low sun, where the tee's dark rim-lit silhouettes left the woods 30-80 m past the pin with half the haze and full contrast (w7-2: "far trunks as dark and saturated as the near birches")
  let lodT = -1;
  const LOD_CELL = 32, lodKey = (i, j) => i * 100000 + j;
  // Behind the eye: a 3D tree over 15 m behind the camera plane never enters the frame (the view cone is under 50 deg each side,
  // so that is a 40 deg margin for a quarter second of turning), and with the sun ahead its shadow falls further behind too;
  // with the sun behind, the margin grows by the shadow's reach. About a third of the near trees, drawn three times each.
  const lodSun = (v => new THREE.Vector2(v.x, v.z).normalize())(new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - def.sun[0]), THREE.MathUtils.degToRad(def.sun[1]))), lodReach = 22 / Math.tan(THREE.MathUtils.degToRad(def.sun[0]));
  const treeLod = (view, t, focus) => { if (t - lodT < .25) return; lodT = t; treeEye.value.copy(view);
    let fx = focus ? focus.x - view.x : 0, fz = focus ? focus.z - view.z : 0; const fl = Math.hypot(fx, fz); if (fl > 1) { fx /= fl; fz /= fl; } else fx = fz = 0;
    const back = 15 + Math.max(0, -(fx * lodSun.x + fz * lodSun.y)) * lodReach;
    const R = treeNear.value + 4, i0 = Math.floor((view.x - R) / LOD_CELL), i1 = Math.floor((view.x + R) / LOD_CELL), j0 = Math.floor((view.z - R) / LOD_CELL), j1 = Math.floor((view.z + R) / LOD_CELL);
    for (const { im, mats, cols, pos, byCell } of nearSets) {
      const dm = im.instanceMatrix, dc = im.instanceColor; let n = 0;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const k of byCell.get(lodKey(i, j)) || []) {
        const dx = pos[k * 2] - view.x, dz = pos[k * 2 + 1] - view.z; if (dx * dx + dz * dz > R * R || dx * fx + dz * fz < -back) continue;
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
  // Canopy gaps, in the leaves' shadow pass only: a crown's cards overlap so densely that it cast one solid pool and the
  // woods floor went evenly dim, trunk shadows lost inside it. Light-plane noise (columns along the sun's ray, fixed to the
  // unswayed crown) cuts holes 1-3 m across clean through each crown, so the ground takes sunlit patches between long
  // trunk shadows (trunks and stems keep casting whole). Crowns shade themselves by the same map, so their depths keep
  // most of their shade. gapSun: toward the key sun (the sky section's sunDir), and the cut: .75 opens about half the crown.
  // gapHole: the pin (x, z) and the cut within 15 m of it. It was 1.3, which opened every crown there and left the putt
  // lawn one even sunlit sheet crossed only by trunk bars; .96 lets the crowns over the green cast dappled pools again. w4 putt
  // verdicts at .96: the floor round the pin sat in one shade with shapeless smears, basket and flags casting nothing; 1.15
  // puts sun on it again, crossed by trunk, flag and pole shadows and crown pools. w4-3 putt verdict at 1.15 everywhere
  // near the pin: "the whole foreground floor evenly sunlit under a dense dark canopy". So the open cut is now a clearing
  // on the far side of the pin, measured where a leaf's shadow lands (its point carried down the sun ray to the pin's
  // height, not the leaf's own x, z: at 24° a crown 15 m up shades ground 34 m away): the pin and the lawn past it in
  // sun (gapHole.z), and from 1 m short of it toward the tee (gapAim.xy, ramping over 2 m from gapAim.z) the crowns keep
  // most of their cards (gapAim.w), so the near floor sits in shade with scattered sun pools and the lit ground round the
  // pin reads as a clearing; past 15-35 m the course-wide cut (gapSun.w). Measured at 640x360 on the critic's floor box:
  // luma 116 before, 79 after, the reference 77. gapHole.w: the pin's ground height. setHole() aims both. w7: the green past the
  // pin is now a mown lawn (the reference's sunlit grass crossed by long trunk shadows), so it takes more sun (1.15 -> 1.5)
  // and the trodden approach keeps more of its canopy (.75 -> .4) from the pin itself (gapAim.z -1 -> 0), so the pin, its
  // shadow and the lawn stand in sun and the floor nearest the lens in open shade, as in the reference (floor luma at
  // 640x360: mid band 107 -> 116, the reference 129; bottom band 62 -> 72, the reference 69).
  const gapSun = { value: new THREE.Vector4(...new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - def.sun[0]), THREE.MathUtils.degToRad(def.sun[1])).toArray(), .95) }, gapHole = { value: new THREE.Vector4(0, 0, 1.5, 0) }, gapAim = { value: new THREE.Vector4(0, 1, 0, .4) }, gapReach = { value: new THREE.Vector3(15, 35, 3.2) };   // gapReach: where gapHole's cut gives way to the course-wide one (m from the pin, where the shadow lands); update() widens it at the putt
  const canopyGaps = (mat, open = 1) => { if (!mat.alphaTest) return mat; const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey; mat.onBeforeCompile = s => { prev.call(mat, s); s.uniforms.gapSun = gapSun; s.uniforms.gapHole = gapHole; s.uniforms.gapAim = gapAim; s.uniforms.gapReach = gapReach;
    s.vertexShader = 'varying vec3 vGap;\n' + (s.vertexShader.includes('#include <project_vertex>') ? s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      { vec4 g = vec4(position, 1.);
      #ifdef USE_INSTANCING
      g = instanceMatrix * g;
      #endif
      vGap = (modelMatrix * g).xyz; }`) : s.vertexShader.replace('gl_Position = projectionMatrix * mvPosition;', '$& vGap = (modelMatrix * vec4(transformed, 1.)).xyz;'));   // an impostor card writes its own projection, and its `transformed` is already the sun-facing card in world space
    s.fragmentShader = `uniform vec4 gapSun, gapHole, gapAim;uniform vec3 gapReach;varying vec3 vGap;
      float gapHash(vec2 p) { vec3 q = fract(p.xyx * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float gapNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(gapHash(i), gapHash(i + vec2(1., 0.)), f.x), mix(gapHash(i + vec2(0., 1.)), gapHash(i + 1.), f.x), f.y); }
      ` + s.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
      { vec3 r = normalize(cross(vec3(0., 1., 0.), gapSun.xyz)), u = cross(gapSun.xyz, r); vec2 p = vec2(dot(vGap, r), dot(vGap, u)) / gapReach.z;
        vec2 land = vGap.xz - gapSun.xz * max(vGap.y - gapHole.w, 0.) / gapSun.y - gapHole.xy;
        if (gapNoise(p) + gapNoise(p * 2.3 + 7.) * .5 + gapNoise(p * 5.3 + 3.) * .25 < ${open.toFixed(2)} * mix(mix(gapHole.z, gapAim.w, smoothstep(gapAim.z, gapAim.z + 2., dot(land, gapAim.xy))), gapSun.w, smoothstep(gapReach.x, gapReach.y, length(land)))) discard; }`); };
    mat.customProgramCacheKey = () => prevKey.call(mat) + '|gaps' + open; return mat; };
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
      im.customDepthMaterial = canopyGaps(near3d(windMaterial(depth, windClock))); depth.dispose();   // leaf cards cut their shadows out too: the sun gets through a crown only where its cards leave gaps
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
  // edge-on does not fill in) so distant crowns keep their coverage. An impostor overwrites bakedAO and leafMask from its maps,
  // takes sunThin and crownDepth from its baked crown depth and sets sunOcc, the self-shadow the shadow map gives the 3D crowns.
  // Crown depth (round 6: a crown read as one evenly lit lime wall of cards). A 3D crown (`crown` = its variant's envelope) knows
  // where each fragment sits in it: crownDepth, 0 at the heart and 1 at the envelope, darkens and greys the albedo toward the
  // heart (to 30% of a half-saturated leaf, with depth squared), so a gap in the leaves shows a dark interior; sunThin is how much
  // crown the sun has to cross to reach the fragment (the chord to the envelope along the light, through foliage that lets
  // e^-.6 per metre through), and it gates the back-light glow and the leaf-to-leaf fill, so a crown against the sun is dark at
  // its core with only the thin rim lit, not lit through. The leaves' albedo is 30% desaturated (a summer crown reads olive in
  // the reference, not lime).
  const canopy = (mat, leaf = true, crown = null) => { const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey; mat.onBeforeCompile = s => { prev.call(mat, s);
    if (crown) {   // a 3D crown: where this fragment sits in its variant's crown envelope (see crownOf, per instance scale), and a random per clump
      s.uniforms.treeCrown = { value: crown };
      s.vertexShader = 'uniform vec4 treeCrown;varying vec3 vCrownP;varying vec2 vCrownR;varying float vClump;\n' + s.vertexShader.replace('#include <fog_vertex>', `#include <fog_vertex>
        #ifdef USE_INSTANCING
        { mat4 im = modelMatrix * instanceMatrix; float r = mix(treeCrown.y, treeCrown.z, saturate((transformed.y - treeCrown.x) / (2. * treeCrown.w) + .5));
          vCrownR = vec2(length(im[0].xyz) * r, length(im[1].xyz) * treeCrown.w);
          vCrownP = ((im * vec4(transformed, 1.)).xyz - (im * vec4(0., treeCrown.x, 0., 1.)).xyz) / vCrownR.xyx;
          vClump = fract(sin(dot(vColor.rgb, vec3(12.9898, 78.233, 37.719)) * 43.758) * 437.585); }
        #endif`);
      s.fragmentShader = `#define CROWN
#define CLUMP_LIGHT 1.6
#define SKY_HOLES .9
#define CROWN_NORMAL .6
#define CROWN_CORE_CUT .85
varying vec3 vCrownP;varying vec2 vCrownR;varying float vClump;
float crownHash(vec3 p) { p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float crownNoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(crownHash(i), crownHash(i + vec3(1, 0, 0)), f.x), mix(crownHash(i + vec3(0, 1, 0)), crownHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(crownHash(i + vec3(0, 0, 1)), crownHash(i + vec3(1, 0, 1)), f.x), mix(crownHash(i + vec3(0, 1, 1)), crownHash(i + 1.), f.x), f.y), f.z); }
` + s.fragmentShader;
    }
    s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', `float bakedAO = 1., leafMask = 1., sunOcc = 1., anyFace = 0., crownDepth = 1., sunThin = 1.;
      #if defined( USE_COLOR_ALPHA )
      diffuseColor.rgb *= vColor.rgb; bakedAO = vColor.a;
      #elif defined( USE_COLOR )
      diffuseColor.rgb *= vColor;
      #endif
      #ifdef CROWN
      crownDepth = saturate(length(vCrownP));
      // clump-scale light and shade (w3: "a grainy speckle of same-sized flecks at even density"): crown-space patches ~1 m
      // across run 30% darker to 25% brighter, so the variation that survives at 640 px is clump against clump
      float crownN = crownNoise(vCrownP * 2.4 + 17.);
      diffuseColor.rgb *= .7 + .55 * crownNoise(vCrownP * 4.5 + 3.);
      #endif`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      reflectedLight.indirectDiffuse *= bakedAO; reflectedLight.directDiffuse *= mix(1., bakedAO, .3) * sunOcc;` + (leaf ? `
      reflectedLight.directSpecular *= .3 * bakedAO; reflectedLight.indirectSpecular *= .3 * bakedAO;
      reflectedLight.indirectDiffuse *= mix(vec3(1.), vec3(1.5, 1.45, .8), leafMask);   // a thin blade takes sky light on both faces, and inside a canopy that light comes filtered yellow-green through other leaves (the shaded side of a stand reads olive, not the sky's teal)
      #ifdef CROWN
      reflectedLight.indirectDiffuse *= mix(vec3(.75, .92, 1.5), vec3(1.), crownDepth);   // but the heart of a 3D crown sits in the sky's own cooler fill (w3 critics read its shade as black-olive)
      #endif
      #if NUM_DIR_LIGHTS > 0
      { vec3 L = directionalLights[0].direction, sun = directionalLights[0].color, V = -normalize(vViewPosition);
        #ifdef CROWN
        { vec3 sN = (vec4(L, 0.) * viewMatrix).xyz / vCrownR.xyx; float a = dot(sN, sN), b = dot(vCrownP, sN), c = dot(vCrownP, vCrownP) - 1.;
          sunThin = exp(-.6 * max(0., (-b + sqrt(max(b * b - a * c, 0.))) / a)); }
        #endif
        // forward scatter peaks toward the visible disc (low in the frame at the tee), not the high key light that casts the shadows;
        // within a few degrees of the disc thin foliage blazes (the tight lobe), so crowns against the sun ring it with light. The
        // lobes are narrow: a crown well off the sun's line (the stand across the fairway) falls back to shaded green instead of
        // carrying the same glowing halo as the ones against the sun
        float disc = saturate(dot(V, normalize((viewMatrix * vec4(treeDisc, 0.)).xyz)));
        float into = max(pow(saturate(dot(V, L)), 3.), pow(disc, 6.)) + 1.5 * pow(disc, 60.);
        float thru = mix(saturate(.3 - dot(normal, L)), .6, anyFace) * (.1 + 1.5 * into) * leafMask * mix(.4, 1., bakedAO) * sunThin * mix(1., .25, smoothstep(40., 110., length(vViewPosition)));
        #ifdef CROWN
        thru *= mix(.2, 1., smoothstep(.2, .8, vClump));   // clump to clump the light gets through or does not: broken highlights, not one even halo on every pad
        #endif
        // light reaches a back-lit leaf through several leaves, not only through gaps: soften its shadow to 35% for this term
        float lit = mix(.35, 1., dot(directLight.color, vec3(1.)) / max(dot(sun, vec3(1.)), 1e-4));
        reflectedLight.directDiffuse += diffuseColor.rgb * sun * lit * RECIPROCAL_PI * thru * vec3(.95, .95, .56);   // olive, not chartreuse or cream (w3: gold read as cream glare under the bloom)
        // sunlight scattered leaf to leaf through the crown: a soft yellow-green fill that follows the sun, not the shadow map,
        // so the shaded side of a back-lit crown reads green instead of black (a fifth of it at the heart of the crown)
        reflectedLight.indirectDiffuse += diffuseColor.rgb * sun * RECIPROCAL_PI * .26 * mix(.4, 1., bakedAO) * mix(.2, 1., sunThin) * leafMask * vec3(1., 1., .6);
        #ifdef CROWN
        // Clump light (a crown past 30 m read as one flat dark-green mass under the haze): the crown's sun-side shell, lit by
        // the crown-sphere normal with wrap, breaks into warm yellow-green clumps, clump by clump bright or dim, and its heart
        // falls dark, so light and shade inside a crown carry through the veil.
        { vec3 o = normalize(vCrownP + vec3(0., 1e-4, 0.)), Lw = (vec4(L, 0.) * viewMatrix).xyz;
          float shell = smoothstep(.5, 1., crownDepth), face = saturate((dot(o, Lw) + .5) / 1.5);
          reflectedLight.directDiffuse *= mix(.45, 1., smoothstep(.3, .9, crownDepth));
          reflectedLight.directDiffuse += diffuseColor.rgb * sun * lit * RECIPROCAL_PI * CLUMP_LIGHT * shell * face * face * mix(.15, 1.3, vClump) * vec3(1.05, 1., .66); }
        #endif
      }
      #endif` : ''));
    // 3D leaves sample the atlas half a mip sharper: at 40-60 m the default level had blurred each spray into a soft blob
    // w3 verdicts: at 640 px the crowns read as per-pixel speckle, a lit leaf beside a dark one on every texel, where the
    // reference varies clump to clump. So the leaf shape (alpha) stays sharp but its colour comes 2.5 mips blurrier: one spray
    // is one soft tone and the variation that reads is the clumps' light and shade, not leaf-to-leaf albedo noise.
    if (crown) s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'texture2D( map, vMapUv, -.5 )')
      .replace('diffuseColor *= sampledDiffuseColor;', 'diffuseColor *= vec4(mix(sampledDiffuseColor.rgb, texture2D(map, vMapUv, 2.5).rgb, .75), sampledDiffuseColor.a);'));
    if (leaf) s.fragmentShader = s.fragmentShader.replace('#include <lights_physical_fragment>', `{ float l = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
        diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, .55);
        #ifdef CROWN
        // w6 verdicts ("no dark interior hollows", "no cooler, darker leaves inside the crown"): measured, the leaves we see sit
        // at .5-1.1 of the envelope, where depth squared barely dimmed them. Now the half-depth leaves go to a quarter, greyed
        // and cooled (the shade inside a crown is lit by the sky, not the sun), grading to full colour only at the outer shell.
        diffuseColor.rgb = mix(mix(vec3(l), diffuseColor.rgb, .45) * vec3(.24, .28, .33), diffuseColor.rgb, smoothstep(.5, 1., crownDepth));
        #else
        diffuseColor.rgb = mix(mix(vec3(l), diffuseColor.rgb, .5) * .4, diffuseColor.rgb, crownDepth * crownDepth);
        #endif
        }
      #include <lights_physical_fragment>`);
    // Haze on foliage: the scene's fog, eased to 35% on crowns within 40 m (a near crown keeps its dark core and lit rim; at 80%
    // the glare side of the tee went one flat grey-lime veil) and rising to all of it by 150 m, so a stand reads in layers, each
    // row back paler than the one before, and to about a third again where the view runs toward the sun's disc, so crowns
    // against the glare stand as dark, rim-lit silhouettes instead of pale grey-olive puffs. Trunks and stems take 80% from 15 m:
    // bark 15-40 m out has to fall back into the haze row by row, and it has no lit rim to lose.
    s.uniforms.treeDisc = treeDisc; s.uniforms.treeAir = treeAir;
    s.fragmentShader = 'uniform vec3 treeDisc;uniform float treeAir;\n' + s.fragmentShader;
    // Bark in the canopy's shadow also loses a third of its sky (w3-4: "white trunks lit evenly from crown to ground, no
    // patches of sun and shade"): at the putt we see their back-lit faces, which the sun's term never reaches, so without this
    // the leaf shadow crossing a stem changed nothing on it. sunVis: the sun's shadow here, from lights_fragment_begin.
    s.fragmentShader = s.fragmentShader.replace('#include <fog_fragment>', `${leaf ? '' : 'gl_FragColor.rgb *= mix(.62, 1., sunVis);'}
      vec3 treeClear = gl_FragColor.rgb;
      #include <fog_fragment>
      { float glare = pow(saturate(dot(normalize(-vViewPosition), normalize((viewMatrix * vec4(treeDisc, 0.)).xyz))), 6.) * (1. - .8 * treeAir);
        gl_FragColor.rgb = mix(treeClear, gl_FragColor.rgb, ${leaf ? 'mix(.35, 1., smoothstep(8., 30., length(vViewPosition)))' : 'mix(.8, 1., smoothstep(15., 60., length(vViewPosition)))'} * (1. - .65 * glare${leaf ? '' : ' * (1. - smoothstep(25., 70., length(vViewPosition)))'})); }`);   // a trunk's exemption ends by 70 m: far trunks against the glare took half the floor's haze and stood dark in front of it like cut-outs
    // Leaves stop short of the bloom threshold (2, linear): a crown against the sun blazed past it and the bloom spread every
    // back-lit card into one even yellow haze with no dark core. Clamped by luminance, so the hue holds.
    if (leaf) s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', `outgoingLight = mix(vec3(dot(outgoingLight, vec3(.2126, .7152, .0722))), outgoingLight, .78);   // w6 verdicts: every crown one oversaturated lime; a real crown's light and shade are greyer than its albedo
      outgoingLight *= min(1., mix(1.2, .75, pow(saturate(dot(normalize(-vViewPosition), normalize((viewMatrix * vec4(treeDisc, 0.)).xyz))), 8.)) / max(dot(outgoingLight, vec3(.2126, .7152, .0722)), 1e-4));
      #include <opaque_fragment>`);
    s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', `
      // w3 verdicts ("the tree line behind the arch is one flat row at the near trees' value and contrast"): a crown's light and
      // shade and its colour carry less far out, as a real stand's do (many small gaps average out, the eye resolves no clumps).
      // From 20 m to 100 m its luminance is squeezed toward a mid tone in log space (up to 55%) and it loses up to 45% of its
      // saturation, so each row back is softer than the one before even where the haze (the light group's fog) is thin. Bark too:
      // the ridge's trunks at 50-60 m kept their near red-brown contrast. Eased toward the sun's disc, where crowns stay dark rim-lit shapes
      { float fd = smoothstep(20., 100., length(vViewPosition)) * (1. - .7 * (1. - treeAir) * pow(saturate(dot(normalize(-vViewPosition), normalize((viewMatrix * vec4(treeDisc, 0.)).xyz))), 6.)), l = max(dot(outgoingLight, vec3(.2126, .7152, .0722)), 1e-4);
        outgoingLight = mix(vec3(l), outgoingLight, 1. - .45 * fd) * (.15 * pow(l / .15, 1. - .55 * fd) / l); }
      #include <opaque_fragment>`);
    // w6 verdicts ("evenly sized clumps, each lit the same saturated yellow-green on its lit side: stacked sprite cards"): every
    // clump's baked normal gave it its own lit face, so the crown had no light and shade of its own. The leaf normal now leans
    // CROWN_NORMAL of the way to the crown envelope's (the ellipsoid's gradient), so the sun side of a crown is lit and the rest
    // grades into shade as one volume, and the atlas and clump normals only break that up.
    if (crown) s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      normal = normalize(mix(normal, normalize((viewMatrix * vec4(vCrownP / vCrownR.xyx + vec3(0., 1e-4, 0.), 0.)).xyz), CROWN_NORMAL));`);
    if (leaf) s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      .replace('#include <alphatest_fragment>', `{ vec2 g = fwidth(vMapUv) * vec2(textureSize(map, 0)); diffuseColor.a *= 1. + clamp(log2(sqrt(g.x * g.y)), 0., 2.) * .3; }
      #ifndef CROWN
      { vec2 g = fwidth(vMapUv) * vec2(textureSize(map, 0)); diffuseColor.a *= 1. + clamp(log2(sqrt(g.x * g.y)) - 1., 0., 2.) * .35; }
      #endif
      #ifdef CROWN
      diffuseColor.a *= 1. - SKY_HOLES * smoothstep(.7, 1., crownDepth) * step(.5, vClump);   // some outer clumps thin out: sky holes and a broken edge, not a solid silhouette
      // w3 verdicts (the framing oak: "a dense mass with almost no sky holes", "no dark hollow voids between clumps"): pockets
      // ~1-1.5 m across cut through the outer third of the crown, fixed to the crown (crown-space noise), so the shell breaks
      // into separate clumps with the dark interior showing between them and sky through the rim
      { float nearK = 1. - smoothstep(20., 45., length(vViewPosition));   // w6-2: the framing crown seen from below stayed one dark solid underside (its leaves sit at half depth, under the cut): a near crown's pockets now run through its heart too, so sky shows through it
        if (crownN * max(smoothstep(.45, .95, crownDepth), CROWN_CORE_CUT * nearK) > .47 - .09 * nearK) diffuseColor.a = 0.; }   // near crowns (the framing tree over the tee) open wider: w6 "solid lumpy blobs, almost no sky holes". Colour pass only: the shadow keeps its own cut
      diffuseColor.a = smoothstep(.25, .75, diffuseColor.a); if (diffuseColor.a < .01) discard;
      #else
      #include <alphatest_fragment>
      #endif`); };
    mat.customProgramCacheKey = () => prevKey.call(mat) + (leaf ? '|leaf' : '|wood') + (crown ? '|crown' : ''); return mat; };
  // alphaToCoverage: both tiers draw into multisampled targets (Full's 4x scene target, Lite's antialiased canvas), so the
  // alpha-tested edge resolves to sample coverage and leaf silhouettes come out soft instead of stair-stepped.
  // One leaf material per variant (they share one program): its crown envelope, from the variant's own leaves, about the trunk:
  // centre height, radius at the foot and the top, half-height (3rd-97th percentile). The widest reach (95th percentile) of the
  // lower and upper halves lands near the foot and the middle of a cone and both at the equator of a dome, so a line through
  // them tapers a spruce's envelope to its tip (a spheroid had called its whole upper cone "interior" and darkened it) and
  // leaves a broadleaf's round.
  const crownOf = g => { const p = g.attributes.position, pts = [], q = (a, f) => a.sort((u, v) => u - v)[Math.floor(f * (a.length - 1))];
    for (let i = 0; i < p.count; i++) pts.push([p.getY(i), Math.hypot(p.getX(i), p.getZ(i))]);
    const ys = pts.map(v => v[0]), y0 = q(ys, .03), y1 = q(ys, .97), ym = (y0 + y1) / 2;
    const lo = q(pts.filter(v => v[0] < ym).map(v => v[1]), .95), hi = q(pts.filter(v => v[0] >= ym).map(v => v[1]), .95);
    return new THREE.Vector4(ym, lo, Math.max(2 * hi - lo, .3, hi * .25), (y1 - y0) / 2); };
  const leafFull = g => near3d(canopy(windMaterial(toonMaterial({ map: leafAtlas, normalMap: leafNormals, normalScale: new THREE.Vector2(.3, -.3), alphaTest: .5, alphaToCoverage: true, side: THREE.DoubleSide, vertexColors: true, roughness: .8 }), windClock), true, crownOf(g)));
  const wood = map => map && near3d(canopy(windMaterial(toonMaterial({ map, vertexColors: true, roughness: .92 }), windClock), false));
  const woodMats = { bark: wood(bark), bark_birch: wood(full && texture('bark_birch')) };
  // Summer canopy in a low warm sun samples yellow-olive in the reference (hue 62-67 deg), so the tint leans warm, and the
  // atlas leaves (linear green ~.1) are lifted ~1.45x to sit with the turf the exposure is set for, as real leaves do;
  // conifers sit darker than the broadleaves (a deep green, not grey-blue); stands drift yellower or bluer, lighter or darker by
  // about 12%, and each tree differs from its neighbours by as much again, so no two crowns in a row read the same.
  const KIND_TINT = { spruce: [.78, .9, .8], scots: [.84, .88, .76] };
  const leafTint = s => { const h = noise(s.x / 19 + 3, s.z / 19) - .5 + (noise(s.x * .53 + 7, s.z * .53 + 3) - .5) * .8, k = KIND_TINT[s.kind] || [1, 1, 1];
    return col.setRGB((1.14 + h * .18) * k[0], 1.02 * k[1], (.74 - h * .22) * k[2]).multiplyScalar((1.3 + noise(s.z / 23, s.x / 23 + 7) * .35) * (.88 + noise(s.x * .61 + 11, s.z * .61 + 17) * .26)); };
  // Bark differs tree to tree as well (a stem greyer or redder, lighter or darker by ~15%), so a stand is not one repeated pole.
  const barkTint = s => { const h = noise(s.x * .83 + 31, s.z * .83 + 47) - .5, v = (.85 + noise(s.x * .67 + 3, s.z * .67 + 71) * .3) * (s.kind === 'birch' ? .62 + noise(s.x * .29 + 9, s.z * .29 + 2) * .25 : 1); return col.setRGB(v * (1 + h * .2), v, v * (1 - h * .24)); };
  for (const b of bushes) b.variant = 'bush' + (noise(b.x * .37 + 13, b.z * .37 + 5) > .5 ? 1 : 0);
  const planted = (name, spots, shadow = true, lod = true) => {
    const src = quality !== 'low' && leafAtlas && model(name); if (!src) return false;
    src.scene.updateMatrixWorld(true);
    src.scene.traverse(o => { if (!o.isMesh) return;
      const variant = o.name.replace(/_\d+$/, ''), key = o.material.name.replace(/\.\d+$/, ''), mine = spots.filter(s => s.variant === variant), g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const mat = key === 'leaves' ? leafFull(g) : woodMats[key] || trunkMat, tint = key === 'leaves' ? leafTint : barkTint, cast = mine.filter(s => !s.quiet), quiet = mine.filter(s => s.quiet);
      if (cast.length) inst(g, mat, cast, tint, shadow, lod);
      if (quiet.length) inst(g, mat, quiet, tint, false, lod); });   // quiet trees cast no shadow (a shadow pass triples a tree's triangles): the edge stand's young trees and its open side. Its
      // guardian-side mature trees still throw the long shadows that dapple the fairway slope.
    return true;
  };
  // Impostors: tools/build-trees.py renders every variant side-on into a 256 x 512 cell (albedo, then the crown normals'
  // x and y, crown depth and a leaf mask) and writes the card extents to src/impostors.js. One instanced card per tree turns
  // about the vertical to face the camera (the sun, in the shadow pass), leans as its 3D instance leans, and lights through
  // the same canopy shading as the 3D leaves, so a far crown is dark into the sun with lit, glowing rims like the near ones.
  const impMap = texture('impostors'), impNormal = texture('impostors_n', { srgb: false });
  const billboard = s => { s.uniforms.treeEye = treeEye; s.uniforms.treeNear = treeNear;
    s.vertexShader = 'attribute float impCell;attribute vec3 impBark;uniform vec3 treeEye;uniform float treeNear;varying vec3 vImpR;varying vec3 vImpT;varying float vImpFlip;varying vec3 vImpBark;\n' + s.vertexShader
      .replace('#include <begin_vertex>', `vec3 impO = instanceMatrix[3].xyz, impT = cameraPosition - impO; impT.y = 0.; impT = normalize(impT + vec3(1e-4, 0., 0.));
        vImpR = vec3(impT.z, 0., -impT.x); vImpT = impT; vImpFlip = sign(instanceMatrix[0].x); vImpBark = impBark;
        vec3 transformed = impO + vImpR * position.x * instanceMatrix[0].x + vec3(instanceMatrix[1].x, instanceMatrix[1].y, instanceMatrix[1].z) * position.y;   // the column's x and z lean the card as the 3D tree leans`)
      .replace('#include <project_vertex>', `vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.); gl_Position = projectionMatrix * mvPosition;
        if (distance(impO.xz, treeEye.xz) < treeNear) gl_Position = vec4(2., 2., 2., 1.);`)
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = modelMatrix * vec4(transformed, 1.);')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = vec2((mod(impCell, 4.) + uv.x) * .25, 1. - (floor(impCell / 4.) + 1. - uv.y) / ${IMPOSTOR_ROWS}.);`); };
  const impMat = impMap && impNormal && canopy(Object.assign(toonMaterial({ map: impMap, alphaTest: .5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: .85 }), { onBeforeCompile: s => { billboard(s); s.uniforms.impNormal = { value: impNormal };
    // An impostor receives no shadow. Its blue channel is crown depth (sky visibility times how thin the crown is along the view
    // ray): back-lit, sunlight reaches the camera-facing leaves only through thin foliage, so direct light falls steeply with
    // depth (between linear and squared: at squared a side-lit spruce stand went flat black-green, its sunlit tips gone) and
    // only the thin rim transmits, while a crown lit from behind the camera keeps its lit face.
    s.fragmentShader = 'uniform sampler2D impNormal;varying vec3 vImpR;varying vec3 vImpT;varying float vImpFlip;varying vec3 vImpBark;\n' + s.fragmentShader.replace('#include <normal_fragment_maps>', `{ vec4 n = texture2D(impNormal, vMapUv); vec2 t = n.xy * 2. - 1.; t.x *= vImpFlip; float tz = sqrt(saturate(1. - dot(t, t)));
      normal = normalize((viewMatrix * vec4(vImpR * t.x + vec3(0., t.y, 0.) + vImpT * tz, 0.)).xyz); bakedAO = n.z; leafMask = smoothstep(.3, .9, n.a); anyFace = 1.;   // the billboard's normals are a crown average: thinness, not facing, gates what it transmits
      sunThin = smoothstep(.4, .9, n.z); crownDepth = mix(.7, 1., smoothstep(.2, .7, n.z));   // the 3D crown's two depths, from the baked one
      diffuseColor.rgb = mix(diffuseColor.rgb / max(vColor, vec3(1e-3)) * vImpBark, diffuseColor.rgb, leafMask);   // the instance colour is the crown's tint: the stem takes its bark tint instead, as the 3D tree's does
      #if NUM_DIR_LIGHTS > 0
      sunOcc = mix(1., n.z * mix(n.z, 1., .5), smoothstep(-.2, .6, dot(-normalize(vViewPosition), directionalLights[0].direction)) * leafMask);
      #endif
      }`); }, customProgramCacheKey: () => 'chains-impostor' }));
  const impDepth = impMat && canopyGaps(Object.assign(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: impMap, alphaTest: .5 }), { onBeforeCompile: billboard, customProgramCacheKey: () => 'chains-impostor-depth' }), .8);   // far crowns cut sun gaps too, a little fewer than near ones (a far crown stands in for its whole stand): solid impostor shadows left the woods floor past ~40 m one even shade, the near cut a sunlit sheet
  const impostors = (spots, shadow = true) => {
    if (!impMat || !spots.length) return false;
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).translate(0, .5, 0), impMat, spots.length), cells = new Float32Array(spots.length), barks = new Float32Array(spots.length * 3);
    spots.forEach((s, i) => { const [w, h, b, c] = IMPOSTOR[s.variant] || IMPOSTOR.bush0, sy = s.s * (s.sy || 1), flip = noise(s.x * .71 + 5, s.z * .71 + 9) > .5 ? -1 : 1;
      m.makeScale(w * s.s * (s.g || 1) * flip, h * sy, 1).setPosition(s.x, s.y - .15 + b * sy, s.z);
      m.elements[4] = -(s.tz || 0) * Math.cos(s.rot || 0) * h * sy; m.elements[6] = ((s.tx || 0) + (s.tz || 0) * Math.sin(s.rot || 0)) * h * sy;   // the 3D instance's tilt (tx, rot, tz) as the tip's offset
      im.setMatrixAt(i, m); im.setColorAt(i, leafTint(s)); barkTint(s).toArray(barks, i * 3); cells[i] = c; });
    im.geometry.setAttribute('impCell', new THREE.InstancedBufferAttribute(cells, 1)); im.geometry.setAttribute('impBark', new THREE.InstancedBufferAttribute(barks, 3));
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
  const dressing = dressCourse({ holes, height, trees: trees.filter(t => !t.edge), bushes, def, quality, corridor: (x, z) => (7.5 + noise(x / 30, z / 30) * 5) * def.fairwayW });
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
  // Away from the sun a pale, faintly cool grey: the swatch half way to a neutral grey (the old swatch x .66/.72/.82 sat
  // darker than the sunlit dirt it veiled and read as blue-grey smog). Toward the disc the air is lit from behind: the
  // swatch mostly replaced by the key's own warm white, brighter than the away side, so backlit woods fade into sunlit air.
  const haze = new THREE.Color(def.fog[0]).lerp(new THREE.Color(.66, .66, .62), .5).multiplyScalar(.9);
  Object.assign(FOG.sun, { x: discDir.x, y: discDir.y, z: discDir.z });
  // w3-4 verdicts called 60% of the key "a uniform peach-cream veil", "a sepia backdrop": a quarter of it now, over the
  // haze a little brighter, so the backlit side is bright near-neutral air with a mild warm lift, not a golden filter.
  const warm = haze.clone().multiplyScalar(.85).add(sunColor.clone().multiplyScalar(.25));
  // The environment fill is baked from the dome with the old, dimmer blue-grey horizon, so brighter air does not also lift
  // every shade and the athlete's skin: the fill is sky light, the haze colour is what the air between us and the woods adds.
  const fillHaze = new THREE.Color(def.fog[0]).multiply(new THREE.Color(.66, .72, .82)), fillWarm = new THREE.Color(def.fog[0]).multiply(new THREE.Color(.95, .86, .6));
  Object.assign(FOG.haze, { r: fillHaze.r, g: fillHaze.g, b: fillHaze.b }); Object.assign(FOG.warm, { r: fillWarm.r, g: fillWarm.g, b: fillWarm.b });
  // The glare a shade warmer than the key (its light took the long way through the air), and ~40% of the key's strength:
  // any brighter and the tee's back third, which looks into the lobe, goes to a milky cream veil.
  Object.assign(FOG.glow, { r: sunColor.r * .42, g: sunColor.g * .39, b: sunColor.b * .33 });
  scene.userData.sun = { dir: discDir, color: sunColor, fog: FOG, gap: { hole: gapHole, aim: gapAim, reach: gapReach }, putt: PUTT_AIR };   // effects.js aims the light shafts at the disc; FOG for the debug hook
  const sky = skyDome(def, quality === 'low'); scene.add(sky);
  // Image-based ambient on both tiers: the dome itself prefiltered, so the fill is this sky's blue from above and a
  // green-brown bounce from below (the dome's `ground` switch) and the sun's aureole glints in discs, chains and water.
  // The cube camera's far plane has to reach the 1100 m dome.
  const pmrem = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(); sky.material.uniforms.ground.value = 1; envScene.add(sky);
  const envRT = pmrem.fromScene(envScene, .04, 1, 2000); envScene.remove(sky); sky.material.uniforms.ground.value = 0; scene.add(sky); pmrem.dispose();
  // w3-8 putt verdict ("one flat milky grey-green veil behind the basket; trees just past the pin as pale as the farthest"):
  // the air itself is bright, like the reference's far tree line (~195,180,160), and the fog chunk keeps it off everything
  // within 34 m, so the midground stays dark and green and only the far rows lift, step by step, into luminous air: a
  // faintly cool grey away from the sun, a brighter near-white toward it.
  // w4 putt verdicts ("murky mid-tone", "one warm cream tint that never cools with distance"): bluer and brighter, and
  // thinner (pine's density .007 -> .0045, clear to 34 m), so far rows lift toward sky-tinted air with their silhouettes kept.
  haze.multiply(new THREE.Color(1.74, 2, 2.55)); warm.multiply(new THREE.Color(1.9, 1.85, 1.8));
  Object.assign(FOG.haze, { r: haze.r, g: haze.g, b: haze.b }); Object.assign(FOG.warm, { r: warm.r, g: warm.g, b: warm.b });
  scene.environment = envRT.texture; scene.environmentIntensity = .5; scene.background = null;
  // Aerial perspective: see the fog chunk above skyDome(). def.fog[1] is an exponential density per metre of eye distance.
  scene.fog = new THREE.FogExp2(haze, def.fog[1]);
  // One warm key from the disc's side of hole 1: the tee shot is side-back-lit and the athlete and trunks keep a lit flank.
  const sun = new THREE.DirectionalLight(sunColor, def.sun[4]); sun.castShadow = true;
  const sm = quality === 'low' ? 1024 : 2048; sun.shadow.mapSize.set(sm, sm);
  // 120 m box following the focus in update(): wide enough that trees off-frame toward the sun still rake shadows across the frame.
  const extent = 60, sc2 = sun.shadow.camera; sc2.left = sc2.bottom = -extent; sc2.right = sc2.top = extent; sc2.near = 1; sc2.far = 400;
  sun.shadow.radius = 2; sun.shadow.bias = -0.0004; sun.shadow.normalBias = .04;   // Lite: the Vogel taps reach 2 texels (23 cm), about the penumbra of a crown 20 m up; the normal bias covers that slope
  scene.add(sun, sun.target);
  // Full: the near cascade. A second shadow map 24 m across at 2048² (1.2 cm texels) round the play, blended into the
  // 120 m one over its outer fifth (the shadow chunk above skyDome()); it adds no light of its own. On Full both maps grow
  // their penumbra with the blocker's height over the receiver (contact hardening): a basket pole or a trunk's foot cuts a
  // hard line, a leaf 10 m up a 6 cm soft one, a pine crown 25 m up across the hill a 15 cm one. The near map spans only
  // 120-210 m from the light (30 m of casters above the focus, the slopes below it) for depth precision. sunPenumbra: per
  // map (near, far), texels of penumbra radius per unit of shadow depth (depth range x tan .34° / texel), and the widest.
  const near = quality === 'low' ? null : new THREE.DirectionalLight(sunColor, 0), nearTexel = 24 / 2048;
  if (near) { const c = near.shadow.camera; c.left = c.bottom = -12; c.right = c.top = 12; c.near = 120; c.far = 210; near.castShadow = true; near.shadow.mapSize.set(2048, 2048);
    near.shadow.bias = -.0003; near.shadow.normalBias = .03; scene.add(near, near.target);
    Object.assign(PENUMBRA, { x: (c.far - c.near) * .006 / nearTexel, y: 12, z: (sc2.far - sc2.near) * .006 / (extent * 2 / sm), w: 6 }); Object.assign(FLECK, { z: 24, w: c.far - c.near }); }
  // The shadow cameras' own axes (Object3D.lookAt from the sun toward the focus, up +y): update() snaps each camera's
  // centre to its texel grid on them, so shadow edges hold still while the camera follows the play instead of crawling.
  // The near one's centre on them also anchors its sun flecks to the ground (FLECK.xy).
  const lightR = new THREE.Vector3(0, 1, 0).cross(sunDir).normalize(), lightU = sunDir.clone().cross(lightR), aim = new THREE.Vector3();
  const place = (light, p, texel) => { const a = Math.round(p.dot(lightR) / texel) * texel, b = Math.round(p.dot(lightU) / texel) * texel;
    light.target.position.copy(p).addScaledVector(lightR, a - p.dot(lightR)).addScaledVector(lightU, b - p.dot(lightU)); light.position.copy(light.target.position).addScaledVector(sunDir, 180); return [a, b]; };
  // The sky fill: the course's sky blue half way to white, about a quarter of the light on open turf (the sun the rest), so
  // on screen shade sits at about half of sun (sRGB) and reads cool: it is lit by the sky alone (the environment map adds the
  // dome's own blue). Any bluer and brown mulch in shade went a dead charcoal grey instead of the same tan dirt, darker and a
  // touch cooler; a third of sun read as brown stains, two thirds as soft shapeless patches. From below, the warm bounce off
  // the sunlit ground (def.hemi[1]): it lights trunks and crown undersides, which went near-black against the haze without it.
  const hemi = new THREE.HemisphereLight(new THREE.Color(def.hemi[0]).lerp(new THREE.Color(1, 1, 1), .3), def.hemi[1], 1.5); scene.add(hemi);

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
  // A trunk standing on the ground hides most of the sky at its foot (the flare and the roots, which the collider radius
  // leaves out), about half of it a third of a diameter out, none at 3 diameters: the base sits in a pool. 32 triangles a tree.
  for(const t of trees) groundShadow(t.x,t.z,t.r,t.r,[1,1.7,6],[.7,.45,0],8);
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
  const setHole = i => { const h = holes[i]; world.basket = { x: h.basket[0], y: h.basketY, z: h.basket[1] }; gapHole.value.set(h.basket[0], h.basket[1], gapHole.value.z, h.basketY); const L = Math.hypot(h.tee[0] - h.basket[0], h.tee[1] - h.basket[1]) || 1; gapAim.value.set((h.tee[0] - h.basket[0]) / L, (h.tee[1] - h.basket[1]) / L, gapAim.value.z, gapAim.value.w); };
  const update = (dt, t, focus, view) => {
    if(view && t-lastCull>.25){lastCull=t;for(const c of clusters){const p=c.boundingSphere.center;const r=c.boundingSphere.radius+155;c.visible=(p.x-view.x)**2+(p.z-view.z)**2<r*r;}}
    if (view) treeLod(view, t, focus);   // trees: 3D near the eye, impostors beyond (the trees section)
    if (view) FOG.shape.w = height(view.x, view.z);   // the haze thins with height above the ground, not above the eye: the flyover drone looks through thinner air
    // Near the pin the air thickens, as the broadcast's long putt lens compresses the woods behind the basket (w4-5 putt
    // verdicts: the stand 30-45 m out, 25-40 m past the pin, took no haze at all under the tee's 34 m clear zone and read as
    // "a flat wall a few metres behind the pin"). Within ~15 m of the basket the air takes PUTT_AIR's shape (below),
    // so birches just past the pin keep their bark and each row behind them lifts a step; the air turns a darker grey
    // (the tee's near-white bank read as "a fog bank as
    // bright as the sunlit dirt" under a canopy) and keeps its warm lift toward the sun. The tee (85 m out) keeps its crisp air.
    // w5-1 putt verdict ("a milky white-green fog a few metres behind the basket; trees 10 m past it as flat as trees 60 m
    // away"): a 22 m clear zone with a 10 m knee put 16% on the stand 30 m past the pin, and against that dim understorey
    // even 16% of bright air lifted every trunk to one value. Now clear to 28 m (~19 m past the pin) with a 50 m knee, so
    // the optical depth creeps in (eye distance 40 m 4%, 50 m 12%, 60 m 21%, 80 m 39%, 100 m 55%, 150 m 80%): rows at 20 m
    // past the pin keep full dark trunks, 40 m a light veil, 80 m most of the way to the air, which is a cool blue-grey
    // (#aab8c6-ish on screen) instead of the green-grey that read as fog.
    if (view && world.basket) { const k = 1 - THREE.MathUtils.smoothstep(Math.hypot(view.x - world.basket.x, view.z - world.basket.z), 15, 40), P = PUTT_AIR, m = (a, b) => a + (b - a) * k;
      Object.assign(FOG.shape, { x: m(34, P.clear), y: m(2.25, P.density), z: m(30, P.knee) });
      Object.assign(FOG.haze, { r: haze.r * m(1, P.haze[0]), g: haze.g * m(1, P.haze[1]), b: haze.b * m(1, P.haze[2]) }); Object.assign(FOG.warm, { r: warm.r * m(1, P.warm[0]), g: warm.g * m(1, P.warm[1]), b: warm.b * m(1, P.warm[2]) }); treeAir.value = k; gapHole.value.z = m(1.5, P.cut); gapAim.value.w = m(.4, P.aim); gapReach.value.set(m(15, P.reach[0]), m(35, P.reach[1]), m(3.2, P.reach[2])); }   // the putt's canopy gaps (PUTT_AIR.cut, .aim, .reach); the tee and flyover keep 1.5, .4, 15-35 m and 3.2 m cells
    windClock.value=t; sky.material.uniforms.time.value = t;
    if (waterNormal) { waterNormal.offset.x = t * .02; waterNormal.offset.y = t * .013; }
    if (focus) { place(sun, focus, extent * 2 / sm);   // the near cascade sits 5 m ahead of the focus, so it covers the putt's basket and the lawn in front of the tee
      if (near) { aim.set(focus.x - (view?.x ?? focus.x), 0, focus.z - (view?.z ?? focus.z)); const l = aim.length(); [FLECK.x, FLECK.y] = place(near, aim.multiplyScalar(l > .1 ? 5 / l : 0).add(focus), nearTexel); } }
  };
  const dispose = () => {   // tear down so another course can be built into the same scene
    for(const w of waters)w.userData.dispose?.();
    scene.remove(group, sky, sun, sun.target, hemi); if (near) { scene.remove(near, near.target); near.shadow.map?.dispose(); } scene.fog = null; scene.environment = null; scene.background = null; hdri?.target.dispose(); hdri?.texture.dispose(); envRT?.dispose();
    group.traverse(o => { o.customDepthMaterial?.dispose(); if (!o.geometry?.__shared) o.geometry?.dispose(); for (const m of [].concat(o.material || [])) { if (m.__shared) continue; for (const k of ['map', 'normalMap', 'roughnessMap']) if (m[k] && !m[k].__shared) m[k].dispose(); m.dispose(); } });
    sky.geometry.dispose(); sky.material.dispose(); sun.shadow.map?.dispose();
  };
  return { def, quality, world, holes, group, sky, terrain, update, setHole, sunDir, baskets, dispose };
}

// Aerial perspective for every fogged material on both tiers: exponential in the true eye distance past 8 m (not
// FogExp2's squared view depth, which whited out 150 m), toward a pale grey haze plus a warm forward-scatter lobe
// round the sun's disc, so the tree line glows where the sun hangs and stays a clean blue behind the golfer. The
// haze is our own linear uniform (three hands fogColor to direct-to-screen Lite draws already sRGB-encoded) and the
// mixed colour is tone mapped and encoded here whenever the material itself is, because fog lands after that step.
// FOG is shared by reference into every ShaderLib material (cloneUniforms copies plain objects by reference), so each
// course just rewrites it; the sky dome reads the same three values, so its horizon is exactly the fog along that ray.
const PUTT_AIR = { clear: 40, density: 6, knee: 90, haze: [1.5, 1.18, .82], warm: [1.6, 1.42, 1.12], cut: 1.35, aim: 1.1, reach: [25, 45, 2] };   // the air round the pin (update()): clear distance (m), density scale, knee (m), haze and warm-lobe gains (r, g, b); w10 (every critic: 'an even milky veil from ~15 m lifts the birches just behind the basket'): clear 34 -> 40, knee 50 -> 90, density 4.5 -> 6, so optical depth at 55 m from the eye halves while 95-135 m keeps its lift (the rows past the pin still step back into the air, the near stand keeps its bark); the putt's canopy gaps (the trees section): gapHole.z's cut round the pin, gapAim.w's on the approach, gapReach (where they give way to the course-wide cut, m, and the gap noise's cell, m). w8-3 cycle 3: A/B live, with the crowns' shadows off the clearing is sunlit and the trunks lay long crisp bars across it (the pole and tray too); every crown shadow on (cut 1, approach .4) buries them under canopy shade, and 9 m cells turned that shade into the 'wide parallel stripes nothing could have cast' (w8-2, 2/6). Now most crowns within 25 m open (cut 1.35, approach 1.1: the clearing and the dirt in sun: bare dirt luma ~125 lit, ~74 in the tray's shadow, the reference 126 and ~60-116), cut by 2 m cells so what still casts is broken clumps with sun between, and the trunk, pole and tray shadows read on sunlit ground, all falling one way. w8-2: the putt had lost its trunk streaks (w7-1 had them): A/B live, the lawn is 75% sunlit, but with every crown within 15 m cut (2.2) only thin trunk bars crossed it and the green's blade noise swallowed them, so the critics saw 'no readable cast shadows, soft blotches, you cannot tell where the sun is'. Now the crowns keep their shade (cut 1: about half of them cast), cut by a noise ~3x coarser: light-plane cells 9 m across stretch ~2.5x along the sun on the ground at 24°, so the canopy lays long diagonal shade bands with sunlit swaths between (the reference's clearing), all running one way with the trunk bars. And the air there was a cold blue (haze .73, 1.09, 1.96 linear: 'a milky blue-white veil, nothing picks up the sun's warmth'): now a warm pale (~1.37, 1.39, 1.34, the lobe toward the disc a cream 2.1, 1.83, 1.4), a little denser so each row past ~40 m lifts a step into it. Earlier: w7-2 (gains .48/.54/.66, 0/4): "the haze darkens the scene"; w7-3 (.9/1.05/1.35, density 5.5 from 28 m, 0/4): "a flat milky grey-white fog wall past ~15 m, near and far trees fade alike, overcast mist, not sunlit air"; w7-4 (gains .8/.92/1.2, warm 1.4, density 3.5): 0/6.
const FOG = { sun: { x: 0, y: .2, z: 1 }, haze: { r: 0, g: 0, b: 0 }, warm: { r: 0, g: 0, b: 0 }, glow: { r: 0, g: 0, b: 0 }, shape: { x: 34, y: 2.25, z: 30, w: 0 } };   // shape: clear distance (m), density scale, knee (m) of the fog chunk's ramp, ground height under the eye (update())
for (const u of [THREE.UniformsLib.fog, ...Object.values(THREE.ShaderLib).map(s => s.uniforms)]) if (u?.fogColor) Object.assign(u, { fogSun: { value: FOG.sun }, fogHaze: { value: FOG.haze }, fogWarm: { value: FOG.warm }, fogGlow: { value: FOG.glow }, fogShape: { value: FOG.shape } });
// The sun's shadow. Directional light 0 is the sun; on Full light 1 is its near cascade (course section), which lights
// nothing: its loop pass is skipped and the sun samples its map inside the cascade's box (sunShadow() in the shadow chunk).
// So after the loop directLight still holds the sun with its shadow, which the canopy and blade shaders read. Shade is
// lit by the sky alone (no sunlight put back into it), so it reads cool and sits 2-2.5 stops under sun. The same sun
// visibility dims reflected sky: whatever shades a surface from the sun, a canopy or the basket's tray, hides most of
// the sky from it too, so shaded steel stops mirroring blue.
const PENUMBRA = { x: 0, y: 0, z: 0, w: 0 }, FLECK = { x: 0, y: 0, z: 24, w: 90 };   // FLECK: the near cascade's centre in the light's plane (m), its width (m), its depth range (m)
for (const s of Object.values(THREE.ShaderLib)) if (s.uniforms?.directionalLights) Object.assign(s.uniforms, { sunPenumbra: { value: PENUMBRA }, sunFleck: { value: FLECK } });
const DIR_LOOP = [THREE.ShaderChunk.lights_fragment_begin.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )'), THREE.ShaderChunk.lights_fragment_begin.indexOf('#if ( NUM_RECT_AREA_LIGHTS > 0 )')];
Object.assign(THREE.ShaderChunk, {
  lights_fragment_begin: THREE.ShaderChunk.lights_fragment_begin.slice(0, DIR_LOOP[0]) + THREE.ShaderChunk.lights_fragment_begin.slice(...DIR_LOOP)
    .replace('directionalLight = directionalLights[ i ];', '#if !( UNROLLED_LOOP_INDEX == 1 && NUM_DIR_LIGHT_SHADOWS > 1 )\n\t\tdirectionalLight = directionalLights[ i ];')
    .replace(/directLight\.color \*= \( directLight\.visible && receiveShadow \) \? getShadow\( directionalShadowMap[^;]*;/, m => `#if UNROLLED_LOOP_INDEX == 0 && NUM_DIR_LIGHT_SHADOWS > 1\n\t\tdirectLight.color *= receiveShadow ? sunShadow() : 1.;\n\t\t#else\n\t\t${m}\n\t\t#endif`)
    .replace(/(RE_Direct\( directLight[^;]*;)/, '$1\n\t\t#endif') + THREE.ShaderChunk.lights_fragment_begin.slice(DIR_LOOP[1]) + `
float sunVis = 1.;
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	sunVis = dot( directLight.color, vec3( 1. ) ) / max( dot( directionalLights[ 0 ].color, vec3( 1. ) ), 1e-4 );
#endif`,
  lights_fragment_end: THREE.ShaderChunk.lights_fragment_end + `
#if defined( RE_IndirectSpecular )
	reflectedLight.indirectSpecular *= mix( .45, 1., sunVis );
#endif
#ifndef NO_SHADE_TINT
reflectedLight.indirectDiffuse *= mix( vec3( .9, .87, .8 ), vec3( 1. ), sunVis );   // w3-4: the old teal tint (.74, .86, .92) on the blue sky fill turned shaded dirt a colourless grey-green (sRGB ~61, 62, 54); a faint warm bounce off the sunlit floor round it keeps it brown (the blue fill times this sits near neutral).   // the canopy that shades a patch hides the warm open sky and bright ground round it too: the fill left is the blue overhead through the leaves, filtered green, so shade reads cooler and deeper than the sun pools between it. A material can opt out with defines.NO_SHADE_TINT (skin: the cool fill read lavender-grey on it)
#endif`,
  fog_pars_vertex: '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogRay;\n#endif',
  fog_vertex: '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogRay = ( vec4( mvPosition.xyz, 0. ) * viewMatrix ).xyz;\n#endif',   // eye-to-vertex in world axes
  fog_pars_fragment: '#ifdef USE_FOG\n\tuniform vec3 fogColor, fogSun, fogHaze, fogWarm, fogGlow;\n\tuniform vec4 fogShape;\n\tvarying float vFogDepth;\n\tvarying vec3 vFogRay;\n\t#ifdef FOG_EXP2\n\t\tuniform float fogDensity;\n\t#else\n\t\tuniform float fogNear;\n\t\tuniform float fogFar;\n\t#endif\n#endif',
  fog_fragment: `#ifdef USE_FOG
	float fogDist = max( length( vFogRay ), 1e-3 ), fogCos = max( dot( vFogRay, fogSun ) / fogDist, 0. );
	#ifdef FOG_EXP2
		float fogRise = vFogRay.y / 14., fogRun = max( fogDist - fogShape.x, 0. ), fogFactor = 1. - exp( - fogDensity * fogShape.y * fogRun * fogRun / ( fogRun + fogShape.z ) * exp( - max( cameraPosition.y - fogShape.w, 0. ) / 14. ) * ( fogRise > .01 ? ( 1. - exp( - fogRise ) ) / fogRise : 1. ) );   // the haze thins with height (14 m scale, integrated along the ray, and from the ground under the eye, so the flyover drone starts in thinner air): a stand's crowns keep their shape over a hazier floor. None within 34 m (fogShape.x), then the optical depth grows with the square of the run over the next ~30 m and linearly after (pine, eye 1.7 m up: 1% at 40 m, 11% at 60, 25% at 80, 37% at 100, 61% at 150; w4 putt verdicts: birches 30-50 m out read as washed ghosts and the rest one flat pale wall). w3-8 putt verdict: a thin ramp from 8 m left the woods 20-80 m one mid-grey tone, near rows as pale as the far ones; now the rows round the pin keep their dark trunks and green and the far ones lift in steps into bright air. (w3-4: a 38% veil at 80 m read as cream because the air was a dim beige; it is a bright, near-neutral grey now, see the course section)
	#else
		float fogFactor = smoothstep( fogNear, fogFar, fogDist );
	#endif
	vec3 fogTint = ( fogHaze.g > 0. ? mix( fogHaze, fogWarm, pow( fogCos, 8. ) ) * mix( 1., .85, smoothstep( 0., .5, vFogRay.y / fogDist ) ) : fogColor ) + fogGlow * ( pow( fogCos, 16. ) * .25 + pow( fogCos, 90. ) * 3. );   // cool grey haze, warming within ~30° of the disc; a touch dimmer looking up, so the air brightens toward the horizon and the ground line. Aerosols scatter mostly forward: a soft warm cast, then a tight glare cone round the disc
	#ifdef TONE_MAPPING
		fogTint = toneMapping( fogTint );
	#endif
	gl_FragColor.rgb = mix( mix( gl_FragColor.rgb, vec3( dot( gl_FragColor.rgb, vec3( .2126, .7152, .0722 ) ) ), .8 * fogFactor ), linearToOutputTexel( vec4( fogTint, 1. ) ).rgb, fogFactor );   // what the haze veils also loses its colour first: far greens go grey-green row by row, not a saturated olive under a tinted wash
#endif`,
  // Sun shadows: the stock PCF kernel spaced at `radius` texels leaves blocky rings under leafy canopies. 16 taps on a
  // Vogel disk turned per pixel (white noise: IGN's diagonals show without TAA) give the same cost a smooth penumbra, grain
  // instead of steps (Lite). Full's sun first averages the depth of whatever blocks it over the widest penumbra, then
  // filters over a radius that grows with that blocker's height above the receiver (PCSS), in both of its maps.
  shadowmap_pars_fragment: `const vec2 vogel[ 16 ] = vec2[ 16 ]( ${Array.from({ length: 16 }, (_, i) => { const r = Math.sqrt((i + .5) / 16), a = i * 2.39996323; return `vec2( ${(r * Math.cos(a)).toFixed(4)}, ${(r * Math.sin(a)).toFixed(4)} )`; }).join(', ')} );
vec2 vogelTap( int i, vec2 turn ) { return vec2( vogel[ i ].x * turn.x - vogel[ i ].y * turn.y, vogel[ i ].x * turn.y + vogel[ i ].y * turn.x ); }
vec2 vogelTurn() { float spin = 6.2831853 * fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); return vec2( cos( spin ), sin( spin ) ); }
` + THREE.ShaderChunk.shadowmap_pars_fragment.replace(/#if defined\( SHADOWMAP_TYPE_PCF \)\n[\s\S]*?(?=#elif defined\( SHADOWMAP_TYPE_PCF_SOFT \))/, `#if defined( SHADOWMAP_TYPE_PCF )
			vec2 turn = vogelTurn() * shadowRadius / shadowMapSize.x;
			shadow = 0.;
			for ( int i = 0; i < 16; i ++ ) shadow += texture2DCompare( shadowMap, shadowCoord.xy + vogelTap( i, turn ), shadowCoord.z );
			shadow *= .0625;
		`) + `
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1
	uniform vec4 sunPenumbra;   // near map, far map: texels of penumbra radius per unit of shadow depth between blocker and receiver, the widest radius
	uniform vec4 sunFleck;
	float softShadow( sampler2D map, float texel, float bias, vec4 coord, vec2 pen, out float lift ) {   // lift: the blockers' mean height over the receiver, in depth units
		coord.xyz /= coord.w; coord.z += bias; lift = 0.;
		if ( coord.z > 1. ) return 1.;
		vec2 turn = vogelTurn() * texel;
		float blockers = 0., depth = 0.;
		for ( int i = 0; i < 16; i ++ ) { float d = unpackRGBAToDepth( texture2D( map, coord.xy + vogelTap( i, turn * pen.y ) ) ); if ( d < coord.z ) { blockers += 1.; depth += d; } }
		if ( blockers == 0. ) return 1.;
		lift = coord.z - depth / blockers;
		if ( blockers == 16. ) return 0.;
		float r = clamp( lift * pen.x, 1., pen.y ), s = 0.;
		for ( int i = 0; i < 16; i ++ ) s += texture2DCompare( map, coord.xy + vogelTap( i, turn * r ), coord.z );
		return s * .0625;
	}
	// Sun flecks under a canopy: every small gap in the leaves projects a round image of the sun's disc, .0093 of the gap's
	// height across (9 cm under a crown 10 m up). Up to a third of the cells of a .45 m grid in the light's plane hold one,
	// clustered by a 3 m noise where the canopy runs thin; only under blockers 6 m and more up, so a trunk's or the basket's
	// shadow stays whole. Near cascade only (Full, within ~12 m of the play): the far map's texels are coarser than a fleck.
	float fleckHash( vec2 p ) { vec3 q = fract( p.xyx * .1031 ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.x + q.y ) * q.z ); }
	float fleckNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3. - 2. * f ); return mix( mix( fleckHash( i ), fleckHash( i + vec2( 1., 0. ) ), f.x ), mix( fleckHash( i + vec2( 0., 1. ) ), fleckHash( i + 1. ), f.x ), f.y ); }
	float sunFlecks( vec2 p, float h ) {
		vec2 c = floor( p / .45 ), o = ( vec2( fleckHash( c + 17. ), fleckHash( c + 31. ) ) * .5 + .25 ) * .45;
		float rad = max( .0047 * h, .035 ) * mix( .6, 1.4, fleckHash( c + 53. ) ), open = step( fleckHash( c ), .16 * smoothstep( .5, .8, fleckNoise( p / 3. + 7. ) ) );   // gaps differ: some flecks blur wider, and they gather under the thin parts of a crown
		return open * smoothstep( rad, rad * .6, length( p - c * .45 - o ) ) * smoothstep( 6., 9., h );
	}
	float sunShadow() {   // the near cascade inside its box, blended out over its outer fifth into the far map
		vec4 nc = vDirectionalShadowCoord[ 1 ] / vDirectionalShadowCoord[ 1 ].w;
		vec2 e = abs( nc.xy - .5 );
		float w = smoothstep( .5, .4, max( e.x, e.y ) ), s = 1., lift;
		if ( w < 1. ) s = softShadow( directionalShadowMap[ 0 ], 1. / directionalLightShadows[ 0 ].shadowMapSize.x, directionalLightShadows[ 0 ].shadowBias, vDirectionalShadowCoord[ 0 ], sunPenumbra.zw, lift );
		if ( w > 0. ) { float n = softShadow( directionalShadowMap[ 1 ], 1. / directionalLightShadows[ 1 ].shadowMapSize.x, directionalLightShadows[ 1 ].shadowBias, vDirectionalShadowCoord[ 1 ], sunPenumbra.xy, lift );
			if ( n < 1. ) n = max( n, sunFlecks( ( nc.xy - .5 ) * sunFleck.z + sunFleck.xy, lift * sunFleck.w ) );
			s = mix( s, n, w ); }
		return s;
	}
#endif`,
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
    uniforms: { haze: { value: FOG.haze }, warm: { value: FOG.warm }, glow: { value: FOG.glow }, sunDir: { value: FOG.sun }, blue: { value: new THREE.Color(blue) }, zenith: { value: new THREE.Color(zenith) }, sunColor: { value: new THREE.Color(def.sunColor) },
      bounce: { value: new THREE.Color(def.hemi[1]) }, cloud: { value: new THREE.Vector2(coverage, scale) }, time: { value: 0 }, ground: { value: 0 } },
    vertexShader: 'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform vec3 haze,warm,glow,sunDir,blue,zenith,sunColor,bounce;uniform vec2 cloud;uniform float time,ground;varying vec3 vDir;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<OCT;i++){s+=a*noise(p);p=p*2.07+vec2(19.,7.);a*=.5;}return s;}
      void main(){
        vec3 d=normalize(vDir);float h=max(d.y,0.),s=max(dot(d,sunDir),0.),s2=s*s;
        vec3 scatter=glow*(pow(s,16.)*.25+pow(s,90.)*3.);                                    // the fog chunk's lobe
        vec3 col=mix(mix(haze,warm,pow(s,8.)),mix(blue,zenith,smoothstep(.03,.45,h))*mix(mix(vec3(.62,.8,1.05),vec3(1.),pow(s,6.)),vec3(1.),ground),smoothstep(0.,.12,h))+scatter*mix(1.,.25,smoothstep(0.,.2,h));
        col+=sunColor*(pow(s,8.)*.1+pow(s,90.)*.8)*smoothstep(-.02,.04,d.y);                  // aureole: open sky round the disc outshines the hazed ground, so the treeline rims. Seen sky (not the prefiltered fill, so shade and skin keep their tint) runs a deeper blue away from the disc: a canopy gap read as pale steel
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
