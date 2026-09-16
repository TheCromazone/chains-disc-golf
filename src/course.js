// Procedural 9-hole wooded course: seeded terrain, fairway corridors, instanced trees (with physics
// colliders), ponds, tee pads, baskets, sky + sun. Exposes the `world` object the physics needs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texture } from './assets.js';
import { canopyGeometry } from './canopies.js';
import { modelParts, addModel } from './models.js';
import { windMaterial, windTime, toonMaterial, cartoonSky, paintDetail, terrainSplat } from './materials.js';
import { washedTexture } from './assets.js';

export const W = 520, H = 400;          // terrain extent (x: ±260, z: ±200)

// Course definitions. Everything visual and structural about a course comes from here so the same
// builder produces three different places. grass = [fairway, rough, deep rough, sand]; sun = [elevation, azimuth].
export const COURSES = [
  { id: 'pine', name: 'Pine Hollow', tag: 'Wooded · tight fairways', blurb: 'Nine holes cut through pines and oaks. Guardian trees, two doglegs, water on 3, 6 and 9.', seed: 7,
    len: [85, 108, 76, 128, 96, 68, 122, 90, 104], dog: { 1: -1, 3: 1, 6: -1 }, ponds: { 2: 'front', 5: 'right', 8: 'carry' },
    hills: 1, trees: 1, pine: 0.5, fairwayW: 1, wind: 1, grass: ['#75bd48', '#3f9842', '#29774a', '#f5dfa4'], leafHue: 0.29,
    sun: [40, 130], sky: [4, 2.2], sunColor: '#fff1d6', fog: ['#c6d9e6', 0.0032], hemi: ['#cfe3ff', '#4d6b2e'], water: '#2d6f95' },
  { id: 'meadow', name: 'Cedar Meadows', tag: 'Open · long · windy', blurb: 'Big rolling meadow holes at golden hour. Few trees, a lot of wind, drivers all day.', seed: 23,
    len: [112, 138, 96, 165, 121, 88, 150, 104, 132], dog: { 3: 1, 6: 1 }, ponds: { 4: 'right' },
    hills: 1.7, trees: 0.3, pine: 0.15, fairwayW: 1.6, wind: 1.8, grass: ['#8bc352', '#55a344', '#397e48', '#f4dd9e'], leafHue: 0.265,
    sun: [21, 245], sky: [7, 1.4], sunColor: '#ffd39a', fog: ['#e2cfae', 0.0026], hemi: ['#ffd9b0', '#6b6a2e'], water: '#4a7f8f' },
  { id: 'lake', name: 'Lakeshore Links', tag: 'Water on five holes', blurb: 'Morning light off the lake. Carries, wraps and island greens; every pond is out of bounds.', seed: 41,
    len: [92, 118, 80, 134, 100, 74, 126, 96, 110], dog: { 2: 1, 5: -1, 7: 1 }, ponds: { 0: 'right', 2: 'front', 4: 'carry', 6: 'right', 8: 'front' },
    hills: 0.8, trees: 0.7, pine: 0.35, fairwayW: 1.2, wind: 1.2, grass: ['#7dc65a', '#419f50', '#287a51', '#ffe3ac'], leafHue: 0.3,
    sun: [55, 95], sky: [2.5, 3], sunColor: '#fff8ec', fog: ['#d6e6ee', 0.0028], hemi: ['#dbeeff', '#4d7a3e'], water: '#2a7fa8' },
  { id: 'bluff', name: 'Gull Point Bluffs', tag: 'Coastal · exposed · gusty', blurb: 'Headland links above the surf. Nothing stops the wind up here: read the socks, throw low into it and ride it home.', seed: 59,
    len: [98, 124, 88, 142, 110, 80, 156, 96, 118], dog: { 1: 1, 4: -1, 7: 1 }, ponds: { 2: 'right', 5: 'carry', 8: 'front' },
    hills: 2.1, trees: 0.22, pine: 0.7, fairwayW: 1.4, wind: 2.8, grass: ['#a9c65a', '#7fa848', '#5d8a4a', '#e9d9a6'], leafHue: 0.25,
    sun: [35, 200], sky: [3, 2.4], sunColor: '#fff3dc', fog: ['#d9e6ea', 0.0030], hemi: ['#dbeefb', '#7d8b5a'], water: '#3f8fb0' },
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
  for (const h of holes) { h.teeY = height(h.tee[0], h.tee[1]); h.basketY = height(h.basket[0], h.basket[1]); }

  // --- terrain mesh ---
  const segX = 260, segZ = 200;
  const geo = new THREE.PlaneGeometry(W, H, segX, segZ); geo.rotateX(-Math.PI / 2);
  const splats = new Float32Array(geo.attributes.position.count * 2);
  const paintWeights = new Float32Array(geo.attributes.position.count * 3);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  // The photo tile is washed toward white so it supplies blade grain, not colour: the course palette stays in the
  // vertex colours (stripes, collar, green, wear). A blade-scale normal map repeats eight times finer than the tile.
  const grassMap = washedTexture('grass', { wash: .58, repeat: [60, 46] }), grassNormal = texture('grass_normal', { repeat: [480, 368], srgb: false });
  const tint = hex => { const c = new THREE.Color(hex); return grassMap ? c.multiplyScalar(1.14) : c; };
  const cFair = tint(def.grass[0]), cRough = tint(def.grass[1]), cDark = tint(def.grass[2]), cSand = tint(def.grass[3]), tmp = new THREE.Color();
  const cCollar=tint('#397c36'), cGreen=tint('#afd66a'), cFringe=tint('#357b36'), cut=new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = height(x, z); pos.setY(i, y);
    const fi = fairwayInfo(holes, x, z);
    const n1 = noise(x / 9 + 3, z / 9 + 3), n2 = noise(x / 40 + 9, z / 40 + 9);
    // Scalloped fairway, a dark first-cut collar and an isolated putting green form a
    // readable route even when the phone camera sees very little lateral ground.
    const phase = fi.t * Math.PI * 4;
    const width = (2.0 + smooth(.06,.22,fi.t) * 1.7 + Math.sin(phase - .6) * .6 + Math.sin(phase * 1.8) * .25) * def.fairwayW;
    const edge = fi.d + (n2 - .5) * .8;
    const fair = 1 - smooth(width, width + .55, edge);
    paintWeights[i*3] = fair;
    const collar = 1 - smooth(width + 1.05, width + 1.8, edge);
    tmp.copy(cRough).lerp(cDark, .12 + n2 * .18);
    tmp.lerp(cCollar, collar);
    const stripe = Math.floor(fi.t * (fi.hole?.len || 90) / 5) % 2;
    cut.copy(cFair).multiplyScalar(stripe ? .84 : 1.13);
    tmp.lerp(cut, fair);
    if(fi.hole) {
      const bx=x-fi.hole.basket[0], bz=z-fi.hole.basket[1], green=Math.hypot(bx,bz*.88);
      const greenMask=1-smooth(5.7,6.25,green);
      paintWeights[i*3+1] = greenMask;
      tmp.lerp(cGreen,greenMask);
      const fringe=smooth(5.7,6.1,green)*(1-smooth(6.5,7.25,green));
      tmp.lerp(cFringe,fringe*.8);
      // Broad exposed pale earth on the low shoulder describes the landing-area shape.
      // It is a visual soil bank, not a new hazard or separate collision surface.
      const dx=fi.hole.basket[0]-fi.hole.tee[0],dz=fi.hole.basket[1]-fi.hole.tee[1],length=Math.hypot(dx,dz);
      const px=x-fi.hole.tee[0],pz=z-fi.hole.tee[1],along=(px*dx+pz*dz)/length,across=(-px*dz+pz*dx)/length;
      const side=fi.hole.idx%2?-1:1;
      const soil=((along-length*.76)/(length*.14))**2+((across+side*8.8)/(4.8+Math.sin(along*.19)*.8))**2;
      const soilMask=(1-smooth(.72,1.08,soil))*smooth(width+.35,width+1.2,edge);
      tmp.lerp(cSand,soilMask*.96);
      paintWeights[i*3+2] = soilMask;
    }
    for (const p of ponds) { const e = ((x - p.x) / p.rx) ** 2 + ((z - p.z) / p.rz) ** 2; if (e < 2.2) tmp.lerp(cSand, smooth(2.2, 1.1, e) * 0.7); }
    splats[i*2] = smooth(4, 0, fi.d) * smooth(.1, .3, fi.t) * (1-smooth(.7,.95,fi.t)) * .42;
    for (const p of ponds) { const e=((x-p.x)/p.rx)**2+((z-p.z)/p.rz)**2; splats[i*2+1]=Math.max(splats[i*2+1],smooth(2.2,1.25,e)); paintWeights[i*3+2]=Math.max(paintWeights[i*3+2],smooth(2.2,1.25,e)); }

    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geo.computeVertexNormals();
  if (!grassMap) {   // no tile: bake a soft directional ramp so slopes still read
    const terrainNormals=geo.attributes.normal;
    for(let i=0;i<pos.count;i++) { const light=terrainNormals.getX(i)*.55+terrainNormals.getY(i)*.70+terrainNormals.getZ(i)*.45; const gain=.55+smooth(.28,.90,light)*.6; colors[i*3]*=gain;colors[i*3+1]*=gain;colors[i*3+2]*=gain; }
  }
  const terrain = new THREE.Mesh(geo, terrainSplat(toonMaterial({ vertexColors: true, map: grassMap, normalMap: grassNormal, normalScale: new THREE.Vector2(.5, .5), roughness: .95 }), geo, splats));
  terrain.receiveShadow = true; group.add(terrain); void paintWeights;

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
  group.add(new THREE.Mesh(hillGeometry,new THREE.MeshBasicMaterial({vertexColors:true,fog:false,side:THREE.DoubleSide})));

  // --- trees ---
  const trees = [], bushes = [], tufts = [];
  const pineSpots = [], decSpots = [];
  for (let gx = -W / 2 + 8; gx < W / 2 - 8; gx += 5) for (let gz = -H / 2 + 8; gz < H / 2 - 8; gz += 5) {
    const x = gx + (rng() - 0.5) * 4.5, z = gz + (rng() - 0.5) * 4.5;
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
    const edge = Math.min(W / 2 - Math.abs(x), H / 2 - Math.abs(z));
    const grove=.12+1.35*smooth(.32,.70,noise(x/21+3,z/21+11));
    const prob = edge < 25 ? 0.85 : (fi.d < halfW + 8 ? 0.14 : 0.62) * def.trees * grove;
    if (!skip && rng() < prob) {
      const s = 0.8 + rng() * 0.55, guardian=side*openSide<0 && fi.t>.18 && fi.t<.52 && fi.d<halfW+12, pine = !guardian && noise(x / 90 + 500, z / 90 + 500) > 1 - def.pine;
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
  const inst = (geo, mat, spots, colorFn, shadow = true) => {
    const cells=new Map();
    for(const s of spots){const key=Math.floor(s.x/64)+','+Math.floor(s.z/64);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(s);}
    for(const cell of cells.values()){
      const im=new THREE.InstancedMesh(geo,mat,cell.length);
      cell.forEach((s,i)=>{e.set(0,s.rot,0);q.setFromEuler(e);v.set(s.x,s.y-.15,s.z);sc.setScalar(s.s);m.compose(v,q,sc);im.setMatrixAt(i,m);if(colorFn)im.setColorAt(i,colorFn(s));});
      if(quality!=='low'){const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});im.customDepthMaterial=windMaterial(depth,windClock);depth.dispose();}
      im.castShadow=shadow;im.receiveShadow=true;im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;
      im.computeBoundingSphere();im.computeBoundingBox();group.add(im);clusters.push(im);
    }
  };
  const col = new THREE.Color();
  const importedInstances = (name, spots, shadow = true) => {
    // Lite retains its existing foliage geometry budget.
    // Keep imported foliage infrastructure available; authored embedded crowns also work with empty assets.
    return false; /*
    const parts = modelParts(name); if (!parts) return false;
    for (const part of parts) inst(part.geometry, windMaterial(part.material, windClock, name === 'grass'), spots, null, shadow);
    return true; */
  };
  if (!importedInstances('pine', pineSpots)) {
    inst(pineTrunk, trunkMat, pineSpots, null, false);
    for(let variant=0;variant<3;variant++) inst(pineVariants[variant], pineMat, pineSpots.filter(s=>Math.floor(noise(s.x*.37+13,s.z*.37+5)*3)===variant), s => col.setHSL(.32 + noise(s.x/24,s.z/24)*.045, .42 + noise(s.x/31+5,s.z/31)*.12, .25 + noise(s.x/22,s.z/22)*.16, THREE.SRGBColorSpace));
  }
  if (!importedInstances('deciduous', decSpots)) {
    inst(decTrunk, trunkMat, decSpots, null, false);
    for(let variant=0;variant<3;variant++) inst(decVariants[variant], leafMat, decSpots.filter(s=>Math.floor(noise(s.x*.37+13,s.z*.37+5)*3)===variant), s => col.setHSL(def.leafHue + (noise(s.x/22 + 9, s.z/22) - 0.5) * 0.07, 0.5, 0.30 + noise(s.z/24 + 4, s.x/24) * 0.18, THREE.SRGBColorSpace));
  }
  if (!importedInstances('bush', bushes, false)) inst(bushGeo, leafMat, bushes, s => col.setHSL(0.3 + (noise(s.x + 2, s.z + 2) - 0.5) * 0.08, 0.5, 0.25 + noise(s.z, s.x + 7) * 0.1, THREE.SRGBColorSpace), false);
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
  const concreteMap = texture('concrete', { repeat: [1, 2] });
  const concrete = concreteMap ? toonMaterial({ map: concreteMap, color: '#c9d3cf', roughness: .92 }) : paintDetail(toonMaterial({ color: '#74a899' }), 'concrete');
  const metal = toonMaterial({ color: '#d9e2e6', metalness: .88, roughness: .3 });
  const yellow = toonMaterial({ color: '#ffca26', roughness: .5 });
  const basketGeo = makeBasketGeometry();
  const baskets = [], destinationMarkers = [];
  for (const h of holes) {
    const yaw = Math.atan2(-(h.way[1][0] - h.tee[0]), -(h.way[1][1] - h.tee[1]));
    const pad = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 3.2), concrete);   // top face sits under the athlete's soles
    pad.position.set(h.tee[0], h.teeY + 0.02, h.tee[1]); pad.rotation.y = yaw; pad.receiveShadow = true; pad.castShadow = true; group.add(pad);
    const sign = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), trunkMat); post.position.y = 0.7; sign.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.62, 0.05), new THREE.MeshStandardMaterial({ map: textTexture([`HOLE ${h.idx + 1}`, `PAR ${h.par}  •  ${Math.round(h.len)} m`], { font: 'bold 60px system-ui, sans-serif' }), roughness: 0.7 }));
    board.position.y = 1.35; board.castShadow = true; sign.add(board);
    const sx = h.tee[0] + Math.cos(yaw) * 2.4 - Math.sin(yaw) * 2.6, sz = h.tee[1] - Math.sin(yaw) * 2.4 - Math.cos(yaw) * 2.6;   // right of and behind the pad
    sign.position.set(sx, height(sx, sz), sz); sign.rotation.y = yaw + Math.PI; group.add(sign);
    const signModel = null;
    if (signModel) { post.visible = false; board.scale.set(.85, .65, 1); board.position.set(0, 1.30, -.08); board.rotation.y = Math.PI; }
    const b = new THREE.Group(); b.position.set(h.basket[0], h.basketY, h.basket[1]);
    const bm = new THREE.Mesh(basketGeo, metal); bm.castShadow = true; b.add(bm);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.285, .285, .12, 28, 1, true), yellow); band.position.y = 1.34; b.add(band);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.03), toonMaterial({ map: textTexture([String(h.idx + 1)], { w: 128, h: 96, bg: '#f2c318', font: 'bold 70px system-ui, sans-serif' }) }));
    flag.position.set(0, 1.62, 0); flag.rotation.y = yaw; b.add(flag);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 12), concrete); base.position.y = 0.03; b.add(base);
    group.add(b); baskets.push(b);
    // A graphic flag remains readable from the tee without enlarging the physical basket.
    const markerCanvas=document.createElement('canvas');markerCanvas.width=128;markerCanvas.height=160;
    const ink=markerCanvas.getContext('2d');ink.fillStyle='#ffffff';ink.beginPath();ink.arc(64,62,55,0,Math.PI*2);ink.fill();
    ink.fillStyle='#ffc928';ink.beginPath();ink.arc(64,62,47,0,Math.PI*2);ink.fill();
    ink.beginPath();ink.moveTo(43,105);ink.lineTo(85,105);ink.lineTo(64,143);ink.fill();
    ink.fillStyle='#174b58';ink.font='900 61px system-ui';ink.textAlign='center';ink.textBaseline='middle';ink.fillText(String(h.idx+1),64,64);
    const markerMap=new THREE.CanvasTexture(markerCanvas);markerMap.colorSpace=THREE.SRGBColorSpace;
    const destination=new THREE.Sprite(new THREE.SpriteMaterial({map:markerMap,depthWrite:false,fog:false}));
    destination.position.set(h.basket[0],h.basketY+4,h.basket[1]);destination.scale.set(2,2.5,1);destination.visible=false;
    group.add(destination);destinationMarkers.push(destination);
    void yellow;
  }

  // --- sky, lights, fog ---
  const sky = cartoonSky(); scene.add(sky);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - def.sun[0]), THREE.MathUtils.degToRad(def.sun[1]));
  // Image-based ambient: the course HDRI on Full, the gradient sky prefiltered on Lite. Discs, chains and shoes get real reflections.
  let envRT = null;
  if (hdri) scene.environment = hdri.target.texture;
  else { const pmrem = new THREE.PMREMGenerator(renderer); const envScene = new THREE.Scene(); envScene.add(sky); envRT = pmrem.fromScene(envScene, .04); envScene.remove(sky); scene.add(sky); pmrem.dispose(); scene.environment = envRT.texture; }
  scene.environmentIntensity = .45; scene.background = null;
  scene.fog = new THREE.Fog('#d6f4fa', 46, 260);   // fog colour is the sky's horizon colour, always
  const sun = new THREE.DirectionalLight(def.sunColor, 2.5); sun.castShadow = true;
  const sm = quality === 'low' ? 1024 : 2048; sun.shadow.mapSize.set(sm, sm);
  const extent = 44, sc2 = sun.shadow.camera; sc2.left = sc2.bottom = -extent; sc2.right = sc2.top = extent; sc2.near = 1; sc2.far = 400;
  sun.shadow.radius = 2.5; sun.shadow.bias = -0.0004; sun.shadow.normalBias = .02 + sun.shadow.radius * (extent * 2 / sm) * 1.15;   // bias follows texel size and filter width
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(def.hemi[0], def.hemi[1], .9); scene.add(hemi);

  // Soft graphic clouds are part of the base style, including Lite.
  const cloudGeo = new THREE.SphereGeometry(1, 12, 8);
  const cloudMat = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false });
  const cloudGroup = new THREE.Group(); group.add(cloudGroup);
  const cloudRng = makeRng(seed + 540);
  for (let i = 0; i < 24; i++) {
    const x = (cloudRng() - .5) * 950, z = (cloudRng() - .5) * 780, y = 65 + cloudRng() * 45;
    for (let j = 0; j < 4; j++) {
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      cloud.position.set(x + j * 10, y + (j === 1 ? 4 : 0), z);
      cloud.scale.set(14, j === 1 ? 9 : 6, 7); cloudGroup.add(cloud);
    }
  }
  // Feathered canopies pool shade around nearby trunks; distance fades them into the same haze.
  // This merged ground-conforming mesh costs one draw, with no shadow map or image request.
  const shadowParts = [];
  const groundShadow = (cx, cz, rx, rz, strength) => {
    const positions=[], alpha=[], indices=[], segments=20, rings=[0,.48,.82,1.2], opacity=[1,.76,.3,0];
    for(let ring=0;ring<rings.length;ring++) for(let j=0;j<=segments;j++) {
      const a=j/segments*Math.PI*2, x=cx+Math.cos(a)*rx*rings[ring], z=cz+Math.sin(a)*rz*rings[ring];
      positions.push(x,height(x,z)+.05,z); alpha.push(strength*opacity[ring]);
    }
    for(let ring=0;ring<rings.length-1;ring++) for(let j=0;j<segments;j++) {
      const a=ring*(segments+1)+j,b=a+segments+1;indices.push(a,a+1,b,b,a+1,b+1);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('shadowAlpha',new THREE.Float32BufferAttribute(alpha,1));g.setIndex(indices);shadowParts.push(g);
  };
  for(const t of trees) groundShadow(t.x+.9,t.z+.6,t.fr*1.35,t.fr*1.1,.22);   // soft canopy occlusion under the real shadow
  for(const h of holes) {
    groundShadow(h.tee[0]+.65,h.tee[1]+.4,1.5,2.3,.16);
    groundShadow(h.basket[0]+.5,h.basket[1]+.3,.65,.85,.24);
  }
  if (shadowParts.length) {
    const shadowMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
      vertexShader: 'attribute float shadowAlpha;varying float vAlpha;varying float vDepth;void main(){vAlpha=shadowAlpha;vec4 mv=modelViewMatrix*vec4(position,1.);vDepth=-mv.z;gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'varying float vAlpha;varying float vDepth;void main(){float fade=1.-smoothstep(38.,170.,vDepth);gl_FragColor=vec4(.055,.16,.075,vAlpha*fade);}' });
    const shadows = new THREE.Mesh(mergeGeometries(shadowParts), shadowMat); shadows.renderOrder = 1; group.add(shadows);
    shadowParts.forEach(g => g.dispose());
  }
  // 0 on the fairway, 1 in the rough: the flight model uses it for skip, roll and slide friction.
  const rough = (x, z) => { const fi = fairwayInfo(holes, x, z); return clamp((fi.d - 7 * def.fairwayW) / 5, 0, 1); };
  const world = { height, normal, treesNear, inWater, waterLevel, inBounds, wind: [0, 0], basket: null, ponds, holes, rough };
  const setHole = i => { const h = holes[i]; world.basket = { x: h.basket[0], y: h.basketY, z: h.basket[1] }; destinationMarkers.forEach((m,j)=>m.visible=j===i); };
  const update = (dt, t, focus, view) => {
    if(view && t-lastCull>.25){lastCull=t;for(const c of clusters){const p=c.boundingSphere.center;const r=c.boundingSphere.radius+155;c.visible=(p.x-view.x)**2+(p.z-view.z)**2<r*r;}}
    if(view) for(const marker of destinationMarkers) if(marker.visible) {
      const distance=Math.hypot(view.x-marker.position.x,view.z-marker.position.z), size=clamp(distance*.065,1.2,7);
      marker.scale.set(size,size*1.25,1);marker.material.opacity=smooth(7,17,distance);
      marker.position.y=height(marker.position.x,marker.position.z)+2.7+size*.6;
    }
    windClock.value=t; cloudGroup.position.x = Math.sin(t * .006) * 5;
    if (waterNormal) { waterNormal.offset.x = t * .02; waterNormal.offset.y = t * .013; }
    if (focus) { sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(sunDir, 180); }
  };
  const dispose = () => {   // tear down so another course can be built into the same scene
    for(const w of waters)w.userData.dispose?.();
    scene.remove(group, sky, sun, sun.target, hemi); scene.fog = null; scene.environment = null; scene.background = null; hdri?.target.dispose(); hdri?.texture.dispose(); envRT?.dispose();
    group.traverse(o => { o.customDepthMaterial?.dispose(); if (!o.geometry?.__shared) o.geometry?.dispose(); for (const m of [].concat(o.material || [])) { if (m.__shared) continue; for (const k of ['map', 'normalMap', 'roughnessMap']) if (m[k] && !m[k].__shared) m[k].dispose(); m.dispose(); } });
    sky.geometry.dispose(); sky.material.dispose(); sun.shadow.map?.dispose();
  };
  return { def, quality, world, holes, group, sky, terrain, update, setHole, sunDir, baskets, dispose };
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
