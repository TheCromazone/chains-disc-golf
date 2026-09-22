// Set dressing that makes the course read as a cared-for tournament venue: timber-framed turf tee mats, printed tee
// signs with the hole map, galvanised baskets with drooping chains, a branded band and a number flag, feather flags,
// banner boards and tee furniture. Every static prop on the course merges into two meshes: 'print' (every painted,
// printed or wooden surface, one canvas atlas, vertex tint for solid colours) and 'steel' (bare metal, vertex tint).
// That is two draws plus their shadow draws on either tier however many props stand, where the old per-hole meshes
// cost ~30. Physics-neutral: the disc only collides with trees and the basket, so props keep out of the flight corridor
// (fairway half-width in front of each tee) and off the putt line; the basket's visual parts keep physics' heights
// (tray .55-.72 m, chains .72-1.34, band 1.34-1.46).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from './materials.js';

const FONT = '"Barlow Condensed", "Arial Narrow", Impact, sans-serif';
const NAVY = '#16233d', GOLD = '#f2c318', PARK = '#173a2b';
const rngOf = seed => { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) >>> 0, s = Math.imul(s ^ (s >>> 13), 3266489917) >>> 0, (s ^ (s >>> 16)) >>> 0) / 4294967296); };

// ---------- atlas ----------
// Painted at 2048 on Full and at half scale on Lite (same layout, so the UVs are shared). [x, y, w, h] in 2048 space.
const REGION = { mat: [8, 8, 512, 1024], wood: [8, 1048, 512, 128], white: [8, 1768, 16, 16], concrete: [40, 1768, 64, 64] };
for (let i = 0; i < 9; i++) REGION['sign' + i] = [536 + (i % 3) * 496, 8 + Math.floor(i / 3) * 346, 480, 330];
for (let i = 0; i < 3; i++) { REGION['feather' + i] = [536 + i * 176, 1048, 160, 640]; REGION['banner' + i] = [8, 1192 + i * 192, 512, 176]; }
REGION.band = [1072, 1048, 960, 76]; REGION.valance = [1072, 1352, 960, 96];
for (let i = 0; i < 9; i++) REGION['flag' + i] = [1072 + (i % 6) * 144, 1140 + Math.floor(i / 6) * 104, 128, 88];
const uvRect = name => { const [x, y, w, h] = REGION[name]; return [x / 2048, 1 - (y + h) / 2048, (x + w) / 2048, 1 - y / 2048]; };   // CanvasTexture flips Y

// Per-pixel painters work at the region's native size in a scratch canvas, then draw into the (possibly scaled) atlas.
function pixels(w, h, shade) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, [r, gg, b] = shade(x, y); img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255; }
  g.putImageData(img, 0, 0); return c;
}
const hash2 = (x, y, s) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s, 1013904223) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const vnoise = (x, y, s) => { const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
  return (hash2(xi, yi, s) * (1 - a) + hash2(xi + 1, yi, s) * a) * (1 - b) + (hash2(xi, yi + 1, s) * (1 - a) + hash2(xi + 1, yi + 1, s) * a) * b; };
const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// Artificial-turf tee mat, the whole 1.6 x 3.2 m mat (top of the region = the throwing end): tufted pile in rows,
// fibre-scale grain, a flattened bleached plant zone and run-up, earth tracked in from the worn ground at the walk-in
// end, and the pile shadowed where it meets the timber.
function paintMat(g, w, h) {
  const c = pixels(w, h, (x, y) => {
    const fine = hash2(x, y, 3), streak = vnoise(x * .9, y * .22, 5), broad = vnoise(x / 60, y / 60, 7) * .6 + vnoise(x / 17, y / 17, 8) * .4;
    let k = .62 + fine * .3 + streak * .22 + (x % 4 === 0 ? -.12 : 0) + (broad - .5) * .18;
    const plant = Math.exp(-(((x - w * .5) / (w * .27)) ** 2 + ((y - h * .2) / (h * .11)) ** 2)), run = Math.exp(-(((x - w * .5) / (w * .2)) ** 2)) * sm(.38, .6, y / h) * (1 - sm(.88, 1, y / h));
    const wear = Math.min(1, plant * .85 + run * .35) * (.7 + broad * .5);
    const edge = Math.min(x, w - 1 - x, y, h - 1 - y), rim = 1 - sm(0, 9, edge) * .28 - .72;
    let r = 52 * k, gg = 112 * k, b = 44 * k;
    r += (148 * k - r) * wear * .55; gg += (150 * k - gg) * wear * .45; b += (96 * k - b) * wear * .5;   // flattened pile shows the paler, yellowed backing
    const dirt = sm(.8, 1, y / h) * .5 + (1 - sm(0, 26, edge)) * .35, d = sm(.55, .9, vnoise(x / 9, y / 9, 11) + dirt * .6 - .3) * .8;
    r += (92 - r) * d; gg += (74 - gg) * d; b += (50 - b) * d;
    return [r * (1 + rim), gg * (1 + rim), b * (1 + rim)];
  });
  g.drawImage(c, 0, 0, w, h);
  const rnd = rngOf(17);
  for (let i = 0; i < 26; i++) {   // leaves and needles blown onto the mat, most near the edges
    const x = rnd() < .5 ? rnd() * w * .25 + (rnd() < .5 ? 0 : w * .75) : rnd() * w, y = rnd() * h, a = rnd() * Math.PI, l = 5 + rnd() * 9;
    g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = ['#8a5a2c', '#a8793e', '#6b4a26', '#5d6b2a'][i % 4];
    if (i % 3) { g.beginPath(); g.ellipse(0, 0, l, l * .45, 0, 0, 7); g.fill(); } else { g.fillRect(-l, -.6, l * 2, 1.2); }
    g.restore();
  }
}
// Weathered pressure-treated timber, grain along the length.
function paintWood(g, w, h) {
  g.drawImage(pixels(w, h, (x, y) => {
    const warp = vnoise(x / 70, y / 16, 21) * 9 + vnoise(x / 11, y / 5, 22) * 1.5, ring = Math.sin((y + warp) * .55) * .5 + .5, grain = Math.pow(ring, 5);
    const grey = vnoise(x / 40, y / 30, 23) * .5 + vnoise(x / 6, y / 2, 24) * .15, k = .8 + hash2(x, y, 25) * .12 + vnoise(x / 3, y * .9, 26) * .12 - grain * .28;
    const r = (118 + grey * 34) * k, gg = (92 + grey * 36) * k, b = (66 + grey * 38) * k;
    return [r, gg, b];
  }), 0, 0, w, h);
  const rnd = rngOf(29); g.strokeStyle = 'rgba(30,20,12,.55)';
  for (let i = 0; i < 14; i++) { const y = 6 + rnd() * (h - 12), x = rnd() * w, l = 30 + rnd() * 120; g.lineWidth = .8 + rnd(); g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + l * .3, y + rnd() * 3 - 1.5, x + l * .7, y + rnd() * 3 - 1.5, x + l, y + rnd() * 2 - 1); g.stroke(); }   // drying checks
  for (let i = 0; i < 5; i++) { const x = rnd() * w, y = 14 + rnd() * (h - 28); g.fillStyle = 'rgba(52,34,20,.8)'; g.beginPath(); g.ellipse(x, y, 5 + rnd() * 4, 3 + rnd() * 2, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(52,34,20,.35)'; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y, 11, 6, 0, 0, 7); g.stroke(); }
}
const roundRect = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
const fwdOf = h => { const dx = h.way[1][0] - h.tee[0], dz = h.way[1][1] - h.tee[1], L = Math.hypot(dx, dz); return [dx / L, dz / L]; };
function fitText(g, text, x, y, maxW, font, size) { g.font = `${font} ${size}px ${FONT}`; const m = g.measureText(text).width; if (m > maxW) g.font = `${font} ${Math.floor(size * maxW / m)}px ${FONT}`; g.fillText(text, x, y); }

// Tee sign: aluminium panel in park green. Header with the course and the event, the hole number in a white block,
// par and distance, and a map drawn from the real layout (fairway, trees, water, tee, basket), sponsor strip below.
function paintSign(g, w, h, hole, { name, trees, fairwayW, sponsor }) {
  const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, '#1d4533'); grd.addColorStop(1, '#122e22'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = '#0d2219'; g.fillRect(0, 0, w, 50); g.fillStyle = GOLD; g.fillRect(0, 50, w, 4);
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'left'; fitText(g, name.toUpperCase(), 16, 27, 250, 800, 32);
  g.textAlign = 'right'; g.fillStyle = GOLD; fitText(g, 'CHAINS OPEN 2026', w - 16, 27, 170, 700, 22);
  g.fillStyle = '#f4f1e8'; roundRect(g, 16, 68, 150, 146, 12); g.fill();
  g.fillStyle = PARK; g.textAlign = 'center'; g.font = `800 140px ${FONT}`; g.fillText(String(hole.idx + 1), 91, 146);
  g.fillStyle = '#ffffff'; g.font = `800 44px ${FONT}`; g.fillText(`PAR ${hole.par}`, 91, 244);
  g.font = `700 25px ${FONT}`; g.fillStyle = '#d7e4da'; g.fillText(`${Math.round(hole.len)} m · ${Math.round(hole.len * 3.281)} ft`, 91, 280);
  // map
  const mx = 182, my = 66, mw = w - mx - 14, mh = 232, [fx, fz] = fwdOf(hole), rx = -fz, rz = fx, s = Math.min(mw / 64, (mh - 26) / (hole.len + 14));
  const at = (x, z) => { const dx = x - hole.tee[0], dz = z - hole.tee[1]; return [mx + mw / 2 + (dx * rx + dz * rz) * s, my + mh - 14 - (dx * fx + dz * fz) * s]; };
  g.save(); roundRect(g, mx, my, mw, mh, 10); g.clip(); g.fillStyle = '#8fb46f'; g.fillRect(mx, my, mw, mh);
  g.lineCap = g.lineJoin = 'round'; g.strokeStyle = '#b9d494'; g.lineWidth = 2 * 9 * fairwayW * s; g.beginPath(); hole.way.forEach((p, i) => { const [a, b] = at(p[0], p[1]); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke();
  g.strokeStyle = '#d6e7b6'; g.lineWidth = 2 * 3.2 * fairwayW * s; g.stroke();
  const [bx, by] = at(hole.basket[0], hole.basket[1]); g.fillStyle = '#dcebbd'; g.beginPath(); g.arc(bx, by, 6.5 * s + 3, 0, 7); g.fill();
  for (const p of hole.ponds) { const [a, b] = at(p.x, p.z); g.fillStyle = '#4b8fb8'; g.strokeStyle = '#d8ecf2'; g.lineWidth = 2; g.beginPath(); g.ellipse(a, b, p.rx * 1.2 * s, p.rz * 1.2 * s, Math.atan2(-fx, rx), 0, 7); g.fill(); g.stroke(); }
  for (const t of trees) { const [a, b] = at(t.x, t.z); if (a < mx - 12 || a > mx + mw + 12 || b < my - 12 || b > my + mh + 12) continue; const r = Math.max(2.6, t.fr * s * .8);
    g.fillStyle = '#2e5a2c'; g.beginPath(); g.arc(a, b, r, 0, 7); g.fill(); g.fillStyle = '#467a3a'; g.beginPath(); g.arc(a - r * .3, b - r * .3, r * .55, 0, 7); g.fill(); }
  const [tx, ty] = at(hole.tee[0], hole.tee[1]); g.fillStyle = '#26312b'; roundRect(g, tx - 5, ty - 8, 10, 16, 2); g.fill();
  g.fillStyle = '#26312b'; g.beginPath(); g.arc(bx, by, 8, 0, 7); g.fill(); g.fillStyle = GOLD; g.beginPath(); g.arc(bx, by, 6, 0, 7); g.fill();
  g.fillStyle = '#26312b'; g.font = `800 20px ${FONT}`; g.textAlign = bx > mx + mw * .6 ? 'right' : 'left'; g.fillText(`${Math.round(hole.len)} m`, bx + (bx > mx + mw * .6 ? -13 : 13), by + 2);
  g.restore(); g.strokeStyle = '#f4f1e8'; g.lineWidth = 3; roundRect(g, mx, my, mw, mh, 10); g.stroke();
  g.fillStyle = '#0d2219'; g.fillRect(0, h - 26, w, 26); g.fillStyle = '#c9d6cc'; g.textAlign = 'center'; fitText(g, `HOLE SPONSOR  ·  ${sponsor}`, w / 2, h - 12, w - 30, 700, 17);
}
// Feather flags, text reading bottom to top like the real ones. 0: event, 1-2: invented sponsors.
function paintFeather(g, w, h, i, name) {
  const [bg, fg, accent, big, small] = [[NAVY, '#ffffff', GOLD, 'CHAINS OPEN', '2026 · ' + name.toUpperCase()], ['#f6f4ee', '#d4471b', '#1c2430', 'LOFTWING', 'DISCS · FLY FURTHER'], ['#1f5a3b', '#f3ead2', GOLD, 'BIRDIE BREW', 'COFFEE ROASTERS']][i];
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = accent; g.fillRect(0, 0, 14, h);
  g.save(); g.translate(w * .56, h - 18); g.rotate(-Math.PI / 2); g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillStyle = fg; fitText(g, big, 0, -14, h * .78, 800, 92); g.fillStyle = i === 1 ? accent : accent; fitText(g, small, 2, 44, h * .6, 700, 30); g.restore();
  if (i === 1) { g.fillStyle = fg; g.beginPath(); g.moveTo(w * .3, 60); g.quadraticCurveTo(w * .75, 20, w * .9, 70); g.quadraticCurveTo(w * .6, 55, w * .3, 60); g.fill(); }   // wing mark
  if (i === 2) { g.strokeStyle = fg; g.lineWidth = 6; g.beginPath(); g.arc(w * .58, 70, 34, 0, 7); g.stroke(); g.font = `800 34px ${FONT}`; g.fillStyle = fg; g.textAlign = 'center'; g.fillText('BB', w * .58, 72); }
}
function paintBanner(g, w, h, i, name) {
  const [bg, fg, accent, big, small] = [[NAVY, '#ffffff', GOLD, 'CHAINS OPEN', '2026  ·  ' + name.toUpperCase()], ['#f6f4ee', '#d4471b', '#1c2430', 'LOFTWING DISCS', 'OFFICIAL DISC PARTNER'], ['#1f5a3b', '#f3ead2', GOLD, 'BIRDIE BREW', 'OFFICIAL COFFEE OF THE CHAINS OPEN']][i];
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = accent; g.fillRect(0, h - 16, w, 16);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg; fitText(g, big, w / 2, h * .38, w - 40, 800, 84); g.fillStyle = i === 0 ? GOLD : fg; fitText(g, small, w / 2, h * .74, w - 60, 700, 28);
}
// Band: the yellow top band, branded three times around so every side reads.
function paintBand(g, w, h, name) {
  g.fillStyle = GOLD; g.fillRect(0, 0, w, h); g.fillStyle = NAVY; g.fillRect(0, 0, w, 5); g.fillRect(0, h - 5, w, 5);
  g.textBaseline = 'middle'; g.textAlign = 'center';
  for (let k = 0; k < 3; k++) { const cx = (k + .5) * w / 3; g.fillStyle = NAVY; g.font = `800 50px ${FONT}`; g.fillText('CHAINS', cx - 50, h / 2 + 2); g.font = `700 22px ${FONT}`; g.fillText(name.toUpperCase(), cx + 95, h / 2 + 2); g.beginPath(); g.arc(cx + 30, h / 2, 5, 0, 7); g.fill(); }
}
function paintFlag(g, w, h, n) {
  g.fillStyle = '#f7f6f1'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9ccce'; g.fillRect(0, 0, 12, h); g.fillStyle = GOLD; g.fillRect(12, h - 12, w - 12, 12);
  g.fillStyle = NAVY; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 66px ${FONT}`; g.fillText(String(n), w * .56, h * .44);
}
function paintAtlas(canvas, scale, ctx) {
  const g = canvas.getContext('2d'); g.setTransform(scale, 0, 0, scale, 0, 0); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 2048, 2048);
  const draw = (name, fn) => { const [x, y, w, h] = REGION[name]; g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); fn(g, w, h); g.restore();
    const px = x * scale, py = y * scale, pw = w * scale, ph = h * scale, b = 8 * scale;   // bleed the edge texels into the gutter so mips do not pick up neighbours
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(canvas, px, py, 1, ph, px - b, py, b, ph); g.drawImage(canvas, px + pw - 1, py, 1, ph, px + pw, py, b, ph);
    g.drawImage(canvas, px - b, py, pw + 2 * b, 1, px - b, py - b, pw + 2 * b, b); g.drawImage(canvas, px - b, py + ph - 1, pw + 2 * b, 1, px - b, py + ph, pw + 2 * b, b); g.restore(); };
  draw('mat', paintMat); draw('wood', paintWood);
  draw('concrete', (g, w, h) => g.drawImage(pixels(w, h, (x, y) => { const v = 150 + hash2(x, y, 41) * 40 + vnoise(x / 8, y / 8, 42) * 30; return [v, v - 3, v - 8]; }), 0, 0));
  ctx.holes.forEach((hole, i) => i < 9 && draw('sign' + i, (g, w, h) => paintSign(g, w, h, hole, { ...ctx, sponsor: ['LOFTWING DISCS', 'BIRDIE BREW', 'PINE HOLLOW DGC'][i % 3] })));
  for (let i = 0; i < 3; i++) { draw('feather' + i, (g, w, h) => paintFeather(g, w, h, i, ctx.name)); draw('banner' + i, (g, w, h) => paintBanner(g, w, h, i, ctx.name)); }
  draw('band', (g, w, h) => paintBand(g, w, h, ctx.name));
  draw('valance', (g, w, h) => { g.fillStyle = NAVY; g.fillRect(0, 0, w, h); g.fillStyle = GOLD; g.fillRect(0, h - 10, w, 10); g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, 'CHAINS OPEN 2026  ·  REGISTRATION', w / 2, h * .45, w - 60, 800, 60); });
  for (let i = 0; i < 9; i++) draw('flag' + i, (g, w, h) => paintFlag(g, w, h, i + 1));
}

// ---------- geometry kit ----------
function kit() {
  const lists = { print: [], steel: [] }, col = new THREE.Color();
  // Remaps a placed part's 0..1 UVs into an atlas region, tints it (linear vertex colour) and queues it for one merge.
  const put = (list, g, region = 'white', color = '#ffffff') => {
    const uv = g.attributes.uv, [u0, v0, u1, v1] = uvRect(region);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    col.set(color); const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (!g.index) g.setIndex([...Array(n).keys()]);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    lists[list].push(g);
    return g;
  };
  // Cloth: a second sheet with reversed winding, so the back-face-only shadow pass always has a face to draw.
  const sheet = g => { const b = g.clone(), ix = b.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } lists.print.push(b); };
  return { print: (g, region, color) => put('print', g, region, color), cloth: (g, region) => sheet(put('print', g, region)), steel: (g, color = '#c8cdd0') => put('steel', g, 'white', color), lists };
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), UP = new THREE.Vector3(0, 1, 0);
const pose = (x, y, z, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ')), _s.set(sx, sy, sz));
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, n = 8, open = false) => new THREE.CylinderGeometry(r0, r1, h, n, 1, open);
const ring = (r, t, n, m = 5) => new THREE.TorusGeometry(r, t, m, n).rotateX(Math.PI / 2);
const tube = (pts, r, seg, sides) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, sides, false);
// a local part (built in the prop's own frame) placed by the prop's world matrix
const at = (g, local, world) => g.applyMatrix4(local).applyMatrix4(world);

// Basket: galvanised pole, tray of rim rings and bars over a pressed dish, outer and inner chain sets hanging in
// catenaries from the rings inside the band to a collar over the tray, the printed band with rolled edges, and a
// number flag on a mast. Full hangs 20 + 12 chains of 10 segments; Lite 10 chains of 3 and drops the hidden parts.
function addBasket(K, world, n, full) {
  const S = (g, c) => K.steel(g.applyMatrix4(world), c), Pr = (g, region, c) => K.print(g.applyMatrix4(world), region, c);
  const GALV = '#d5d9db', DARK = '#8c9296';
  S(cyl(.029, .029, 1.52, full ? 12 : 6, !full).translate(0, .71, 0), GALV);
  S(cyl(.008, .008, .62, 5, !full).translate(0, 1.77, 0), GALV);   // flag mast
  S(cyl(.075, .075, .05, full ? 12 : 6).translate(0, .845, 0), DARK);   // chain collar
  if (full) S(cyl(.045, .045, .12, 8).translate(0, 0, 0), DARK);   // ground sleeve
  S(ring(.34, .012, full ? 40 : 14, full ? 5 : 3).translate(0, .8, 0), GALV);
  S(ring(.33, .009, full ? 40 : 14, full ? 5 : 3).translate(0, .6, 0), GALV);
  if (full) { S(ring(.34, .006, 40, 4).translate(0, .7, 0), GALV); S(ring(.29, .008, 40, 5).translate(0, 1.33, 0), GALV); S(ring(.29, .008, 40, 5).translate(0, 1.46, 0), GALV); S(ring(.255, .006, 32, 4).translate(0, 1.37, 0), DARK); S(ring(.16, .006, 24, 4).translate(0, 1.37, 0), DARK); }
  S(cyl(.33, .06, .035, full ? 24 : 10).translate(0, .59, 0), '#aab0b3');   // pressed dish
  const bars = full ? 24 : 10;
  for (let i = 0; i < bars; i++) { const a = i / bars * Math.PI * 2; S(cyl(.005, .005, .2, 3, true).translate(Math.cos(a) * .337, .7, Math.sin(a) * .337), GALV); }
  if (full) for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .4; S(cyl(.006, .006, .26, 3).rotateZ(Math.PI / 2).rotateY(-a).translate(Math.cos(a) * .15, 1.455, Math.sin(a) * .15), GALV); }   // cap spokes
  const hang = (r0, r1, y0, y1, count, bulge, off, seg, sides) => {
    for (let i = 0; i < count; i++) {
      const a = off + i / count * Math.PI * 2 + (hash2(i, n, 3) - .5) * .08, b = bulge * (.85 + hash2(i, n, 4) * .3), twist = (hash2(i, n, 5) - .5) * .12, pts = [];
      for (let k = 0; k <= 6; k++) { const t = k / 6, r = r0 + (r1 - r0) * t + b * Math.sin(Math.PI * t) * (1 - t * .35), aa = a + twist * Math.sin(Math.PI * t); pts.push(new THREE.Vector3(Math.cos(aa) * r, y0 + (y1 - y0) * t - .018 * Math.sin(Math.PI * t), Math.sin(aa) * r)); }
      S(tube(pts, .0055, seg, sides), '#eceff0');
    }
  };
  hang(.255, .068, 1.37, .87, full ? 20 : 10, .055, 0, full ? 10 : 3, full ? 4 : 3);
  if (full) hang(.16, .05, 1.37, .87, 12, .035, .13, 8, 3);
  Pr(cyl(.29, .29, .13, full ? 40 : 16, true).translate(0, 1.395, 0), 'band');
  const flag = new THREE.PlaneGeometry(.38, .26, full ? 8 : 2, 1), fp = flag.attributes.position;   // 38 x 26 cm, flying from the mast top
  for (let i = 0; i < fp.count; i++) { const x = fp.getX(i) + .19; fp.setXYZ(i, x + .008, fp.getY(i) + 1.94, Math.sin(x * 13) * .03 * x / .38); }
  flag.computeVertexNormals(); K.cloth(flag.applyMatrix4(world), 'flag' + n);
  if (full) Pr(cyl(.21, .23, .05, 20).translate(0, .005, 0), 'concrete');   // footing, flush with the turf
}

// Feather flag: a cloth panel with a rounded top on a fibreglass pole that bends along its top edge, cross base.
function featherGeometry(full) {
  const W = .78, yb = .45, yc = 3.1, yt = 3.7, rows = [], NC = full ? 4 : 2;
  for (let j = 0; j <= (full ? 8 : 3); j++) rows.push([yb + (yc - yb) * j / (full ? 8 : 3), 1]);
  for (let k = 1; k <= (full ? 6 : 3); k++) { const a = k / (full ? 6 : 3) * Math.PI / 2; rows.push([yc + (yt - yc) * Math.sin(a), Math.max(.02, Math.cos(a))]); }
  const pos = [], uv = [], idx = [], belly = (s, wk) => (Math.sin(Math.PI * s) * .06 + s * s * .05) * wk;
  rows.forEach(([y, wk]) => { for (let i = 0; i <= NC; i++) { const s = i / NC, x = s * W * wk; pos.push(x, y, belly(s, wk)); uv.push(x / W, (y - yb) / (yt - yb)); } });
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < NC; i++) { const a = j * (NC + 1) + i, b = a + NC + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const pole = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, yc, 0)];   // up the leading edge, then bent along the rounded top
  for (let k = 0; k <= 4; k++) { const a = Math.PI / 2 * (1 - k / 4 * .7); pole.push(new THREE.Vector3(W * Math.cos(a), yc + (yt - yc) * Math.sin(a), belly(1, Math.cos(a)))); }
  return { cloth: g, pole };
}

export function dressCourse({ holes, height, trees, def, quality }) {
  const full = quality !== 'low', K = kit(), rnd = rngOf(def.seed * 97 + 5);
  const frame = (h, u, f) => { const [fx, fz] = fwdOf(h); return [h.tee[0] - fz * u + fx * f, h.tee[1] + fx * u + fz * f]; };   // tee-local: u right of the fairway, f toward the basket
  const onGround = (h, u, f, rot = 0, sink = .03) => { const [x, z] = frame(h, u, f); return pose(x, height(x, z) - sink, z, h.yaw + rot); };
  const feather = featherGeometry(full);
  const addFeather = (world, design) => {
    K.cloth(feather.cloth.clone().applyMatrix4(world), 'feather' + design);
    K.steel(tube(feather.pole, .012, full ? 12 : 4, 4).applyMatrix4(world), '#d9dcdc');
    K.steel(box(.7, .025, .05).applyMatrix4(world), '#3a3d40'); K.steel(box(.05, .025, .7).applyMatrix4(world), '#3a3d40');
  };
  const paint = (g, color) => K.print(g, 'white', color);   // powder-coated steel, plastic, canvas: dielectric, solid colour
  const addBench = world => {
    for (let i = 0; i < 3; i++) K.print(at(box(1.7, .04, .11), pose(0, .44, -.13 + i * .13), world), 'wood');
    for (let i = 0; i < 2; i++) K.print(at(box(1.7, .1, .035), pose(0, .6 + i * .15, .2 + i * .03, 0, -.2), world), 'wood');
    for (const x of [-.65, .65]) { paint(at(box(.05, .42, .05), pose(x, .21, -.12), world), '#26292b'); paint(at(box(.05, .82, .05), pose(x, .41, .17, 0, -.1), world), '#26292b'); paint(at(box(.05, .04, .42), pose(x, .4, .03), world), '#26292b'); }
  };
  const addCan = world => {   // park bin: green powder-coated drum, black lid, two rolled ribs
    paint(at(cyl(.27, .25, .82, 16, true), pose(0, .41, 0), world), '#35573f');
    paint(at(cyl(.3, .29, .07, 16), pose(0, .85, 0), world), '#1f2422');
    for (const y of [.22, .6]) paint(at(ring(.272, .012, 24, 3), pose(0, y, 0), world), '#35573f');
  };
  const addBanner = (world, design) => {
    K.print(at(new THREE.PlaneGeometry(2.3, .78), pose(0, .66, .012), world), 'banner' + design);
    K.print(at(new THREE.PlaneGeometry(2.3, .78), pose(0, .66, -.012, Math.PI), world), 'white', '#dfe2e0');
    for (const x of [-1.18, 1.18]) K.steel(at(cyl(.02, .02, 1.12, 6), pose(x, .56, 0), world), '#9aa0a4');
    K.steel(at(cyl(.015, .015, 2.36, 5).rotateZ(Math.PI / 2), pose(0, 1.06, 0), world), '#9aa0a4');
  };
  // Pop-up event canopy: 3 x 3 m, navy roof, printed valance, a draped registration table underneath.
  const addTent = world => {
    for (const [x, z] of [[-1.47, -1.47], [1.47, -1.47], [-1.47, 1.47], [1.47, 1.47]]) K.steel(at(box(.04, 2.12, .04), pose(x, 1.06, z), world), '#c4c9cc');
    paint(at(new THREE.ConeGeometry(2.12, .85, 4, 1, true).rotateY(Math.PI / 4), pose(0, 2.54, 0), world), NAVY);
    for (let k = 0; k < 4; k++) K.print(at(new THREE.PlaneGeometry(3, .3), pose(Math.sin(k * Math.PI / 2) * 1.5, 1.97, Math.cos(k * Math.PI / 2) * 1.5, k * Math.PI / 2), world), 'valance');
    paint(at(box(1.8, .74, .72), pose(0, .37, -.6), world), '#f1f1ee');
    paint(at(box(1.82, .03, .74), pose(0, .755, -.6), world), '#f7f7f4');
  };
  const clearOf = (x, z, r) => !trees.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < (r + t.r * 2) ** 2) && !holes.some(h => h.ponds.some(p => ((x - p.x) / (p.rx * 1.3 + r)) ** 2 + ((z - p.z) / (p.rz * 1.3 + r)) ** 2 < 1));

  holes.forEach((h, i) => {
    // Tee: the turf mat keeps the old pad's box (its top face sits under the athlete's soles at teeY + .07); the
    // landscape-timber frame stands 2 cm proud of the pile, buried 7 cm into the flattened pad earth.
    const T = pose(h.tee[0], h.teeY, h.tee[1], h.yaw);
    K.print(at(box(1.6, .1, 3.2), pose(0, .02, 0), T), 'mat');
    for (const s of [-1, 1]) { K.print(at(box(3.48, .16, .12), pose(s * .86, .01, 0, Math.PI / 2), T), 'wood'); K.print(at(box(1.6, .16, .12), pose(0, .01, s * 1.66), T), 'wood'); }
    // Sign on two 4x4 posts, right of and ahead of the pad, turned to face the thrower.
    const sg = onGround(h, 2.4, 2.6, -.4);
    for (const x of [-.52, .52]) K.print(at(box(.09, 1.64, .09), pose(x, .82, 0), sg), 'wood');
    K.print(at(box(1.0, .7, .05), pose(0, 1.16, -.01), sg), 'wood');
    K.print(at(new THREE.PlaneGeometry(.92, .632), pose(0, 1.16, .019), sg), 'sign' + i);
    K.print(at(box(1.16, .045, .16), pose(0, 1.66, 0), sg), 'wood');
    if (full) { addCan(onGround(h, 3.2, 2.9)); addBench(onGround(h, -2.6, 1.3, -Math.PI / 2)); }
    // Basket, same yaw as the hole so the flag flies broadside to the approach; a pair of feather flags stands
    // behind-left of the green, off the putt line and clear of the basket's silhouette from the approach.
    const ap = h.way[h.way.length - 2], adx = h.basket[0] - ap[0], adz = h.basket[1] - ap[1], al = Math.hypot(adx, adz), fx = adx / al, fz = adz / al, yawB = Math.atan2(-fx, -fz);   // the approach, past any dogleg
    addBasket(K, pose(h.basket[0], h.basketY, h.basket[1], yawB), i, full);
    if (full || i === 0) for (const [u, f, d] of [[-3.6, 6.2, i % 3], [-2.6, 9.8, (i + 1) % 3]]) {
      const x = h.basket[0] - fz * u + fx * f, z = h.basket[1] + fx * u + fz * f;
      if (clearOf(x, z, .8)) addFeather(pose(x, height(x, z) - .05, z, yawB + .35 + (rnd() - .5) * .3), d);
    }
    // Every other tee: two sponsor flags down the left edge of the corridor (Full).
    if (full && i) for (const f of [14, 22]) { const [x, z] = frame(h, -12.5 * def.fairwayW - rnd(), f); if (clearOf(x, z, .8)) addFeather(pose(x, height(x, z) - .05, z, h.yaw + .45 + (rnd() - .5) * .3), (i + f) % 3); }
  });
  // Tournament village on hole 1, the clubhouse tee: banner boards, the event canopy and feather flags down the left
  // of the corridor (~9.4 m each side of the centreline here), turned back toward the tee so they read from the pad.
  const h1 = holes[0];
  [[11, -10.7, 0], [17.5, -10.9, 1], [26, -11.2, 2], [30.5, -10.8, 0], [34.5, -10.4, 1]].slice(0, full ? 5 : 3).forEach(([f, u, d]) => addFeather(onGround(h1, u - rnd() * .4, f, .45 + (rnd() - .5) * .3, .05), d));
  if (full) { [[13.2, 0], [15.6, 2]].forEach(([f, d]) => addBanner(onGround(h1, -10.3, f, Math.PI / 2 - .5), d)); addTent(onGround(h1, -12.8, 21.5, .5, .02)); }

  const atlas = document.createElement('canvas'), scale = full ? 1 : .5; atlas.width = atlas.height = 2048 * scale;
  const ctx = { holes, trees, name: def.name, fairwayW: def.fairwayW };
  paintAtlas(atlas, scale, ctx);
  const map = new THREE.CanvasTexture(atlas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  if (document.fonts && !document.fonts.check(`800 40px ${FONT}`)) document.fonts.load(`800 40px ${FONT}`).then(() => { if (map.image) { paintAtlas(atlas, scale, ctx); map.needsUpdate = true; } }).catch(() => {});   // signs repaint in the condensed face once it lands
  // Double-sided so cloth reads from behind, but only back faces go into the shadow map: the flat mat and sign faces
  // under a 19° sun would otherwise shadow themselves in bands (acne). Cloth is two sheets, so one always casts.
  const print = new THREE.Mesh(mergeGeometries(K.lists.print), toonMaterial({ map, vertexColors: true, roughness: .82, side: THREE.DoubleSide, shadowSide: THREE.BackSide }));
  // Galvanised steel is dull and light in sun: half metal so the diffuse term carries it under the dim ambient.
  const steel = new THREE.Mesh(mergeGeometries(K.lists.steel), toonMaterial({ vertexColors: true, metalness: .55, roughness: .42 }));
  print.castShadow = print.receiveShadow = steel.receiveShadow = true; steel.castShadow = full;
  for (const g of [...K.lists.print, ...K.lists.steel]) g.dispose();
  return [print, steel];
}
